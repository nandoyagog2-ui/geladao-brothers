-- =========================================================
--  VYNTRA — parte 27 · ESTOQUE: ENTRADA E SAÍDA COMPLETAS
--  · Entrada de mercadoria de vários produtos de uma vez (por fardo/caixa ou por unidade),
--    com custo, preço de venda, fornecedor e validade
--  · Saída manual com motivo: quebra, vencido, consumo próprio, brinde, outro
--  · "Em falta" automático: o produto some do cardápio quando o estoque zera
--    e volta sozinho quando chega mercadoria (fardos ligados à unidade também)
--  Pode rodar mais de uma vez sem problema.
-- =========================================================

-- ---------- 1) COLUNAS NOVAS ----------
alter table stock_movements
  add column if not exists reason          text,            -- quebra, vencido, consumo, brinde, outro
  add column if not exists unit_cost       numeric(10,2),   -- custo da unidade na entrada
  add column if not exists entry_id        bigint,          -- de qual entrada de mercadoria veio
  add column if not exists created_by_name text;

-- marca quando foi o sistema que colocou "em falta" (pra saber se pode reativar sozinho)
alter table products add column if not exists auto_out boolean not null default false;

-- liga/desliga o "em falta automático" por loja
alter table store_settings add column if not exists auto_out_of_stock boolean not null default true;

-- ---------- 2) ENTRADAS DE MERCADORIA (compras) ----------
create table if not exists stock_entries (
  id              bigserial primary key,
  store_id        bigint not null default my_store() references stores(id) on delete cascade,
  supplier        text,                                  -- fornecedor
  doc             text,                                  -- número da nota / pedido
  notes           text,
  items           jsonb not null default '[]',
  total_cost      numeric(12,2) not null default 0,
  created_by      uuid default auth.uid(),
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists stock_entries_store on stock_entries (store_id, created_at desc);
alter table stock_entries enable row level security;
drop policy if exists equipe_ve on stock_entries;
drop policy if exists dono_tudo on stock_entries;
create policy equipe_ve on stock_entries for select to authenticated
  using ((select is_staff()) and store_id = (select my_store()));
create policy dono_tudo on stock_entries for all to authenticated
  using ((select is_owner()) and store_id = (select my_store()))
  with check ((select is_owner()) and store_id = (select my_store()));
grant select, insert, update, delete on stock_entries to authenticated;
grant usage, select on sequence stock_entries_id_seq to authenticated;

-- ---------- 3) EM FALTA AUTOMÁTICO ----------
-- No próprio produto: zerou → em falta; chegou mercadoria → volta a vender
create or replace function stock_auto_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_on boolean;
begin
  -- mudou a situação na mão (sem mexer no auto_out): o sistema não reativa sozinho
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.auto_out = old.auto_out then
    new.auto_out := false;
  end if;
  if not coalesce(new.track_stock, false) or new.stock_parent_id is not null then return new; end if;
  if tg_op = 'UPDATE' and new.stock_qty is not distinct from old.stock_qty
     and new.track_stock is not distinct from old.track_stock then return new; end if;
  select coalesce(auto_out_of_stock, true) into v_on from store_settings where id = new.store_id;
  if not coalesce(v_on, true) then return new; end if;
  if coalesce(new.stock_qty, 0) <= 0 and new.status = 'ativo' then
    new.status := 'em_falta'; new.auto_out := true;
  elsif coalesce(new.stock_qty, 0) > 0 and new.status = 'em_falta' and new.auto_out then
    new.status := 'ativo'; new.auto_out := false;
  end if;
  return new;
end $$;
drop trigger if exists products_stock_auto_status on products;
create trigger products_stock_auto_status before insert or update on products
  for each row execute function stock_auto_status();

-- Nos fardos ligados (ex.: "24 x Heineken" usa o estoque da "Heineken"):
-- se não dá pra montar um fardo inteiro, o fardo fica em falta; quando dá, volta
create or replace function stock_auto_status_kids() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_on boolean;
begin
  if not coalesce(new.track_stock, false) then return null; end if;
  if tg_op = 'UPDATE' and new.stock_qty is not distinct from old.stock_qty
     and new.track_stock is not distinct from old.track_stock then return null; end if;
  select coalesce(auto_out_of_stock, true) into v_on from store_settings where id = new.store_id;
  if not coalesce(v_on, true) then return null; end if;
  update products k set status = 'em_falta', auto_out = true
   where k.stock_parent_id = new.id and k.status = 'ativo'
     and coalesce(new.stock_qty, 0) < greatest(coalesce(k.stock_factor, 1), 1);
  update products k set status = 'ativo', auto_out = false
   where k.stock_parent_id = new.id and k.status = 'em_falta' and k.auto_out
     and coalesce(new.stock_qty, 0) >= greatest(coalesce(k.stock_factor, 1), 1);
  return null;
end $$;
drop trigger if exists products_stock_auto_status_kids on products;
create trigger products_stock_auto_status_kids after insert or update on products
  for each row execute function stock_auto_status_kids();

-- ---------- 4) ENTRADA DE MERCADORIA ----------
-- p = {supplier, doc, notes, items:[{product_id, boxes, per_box, qty, unit_cost, box_cost, sale_price, expires_on}]}
--  · por fardo/caixa: boxes = 10, per_box = 24  → 240 unidades
--  · por unidade:     qty = 240
--  · custo: unit_cost (da unidade) ou box_cost (do fardo/caixa, divide sozinho)
--  · sale_price (opcional): já muda o preço de venda do produto
--  · se o produto escolhido for um fardo ligado à unidade, a entrada vai pro estoque da unidade
create or replace function register_stock_entry(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_store bigint := my_store(); it jsonb; prod products; tgt products;
  v_boxes numeric; v_per numeric; v_units numeric; v_factor numeric;
  v_ucost numeric; v_bcost numeric; v_line numeric; v_total numeric := 0; v_price numeric;
  v_items jsonb := '[]'; v_entry stock_entries; v_desc text; v_exp date;
begin
  if v_store is null then raise exception 'Faça login no painel'; end if;
  if not staff_can('inventario') then raise exception 'Você não tem permissão pra lançar entrada de estoque'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'Adicione pelo menos um produto'; end if;

  insert into stock_entries (store_id, supplier, doc, notes, created_by_name)
  values (v_store, nullif(trim(coalesce(p->>'supplier', '')), ''), nullif(trim(coalesce(p->>'doc', '')), ''),
          nullif(trim(coalesce(p->>'notes', '')), ''), my_name())
  returning * into v_entry;

  for it in select * from jsonb_array_elements(p->'items') loop
    select * into prod from products where id = (it->>'product_id')::bigint and store_id = v_store;
    if prod.id is null then raise exception 'Produto não encontrado (%)', it->>'product_id'; end if;

    v_boxes := nullif(it->>'boxes', '')::numeric;
    v_per   := nullif(it->>'per_box', '')::numeric;
    v_units := coalesce(nullif(it->>'qty', '')::numeric,
                        case when v_boxes is not null then v_boxes * coalesce(v_per, 1) end);
    if v_units is null or v_units <= 0 then raise exception 'Quantidade inválida em "%"', prod.name; end if;

    v_ucost := nullif(it->>'unit_cost', '')::numeric;
    v_bcost := nullif(it->>'box_cost', '')::numeric;
    if v_ucost is null and v_bcost is not null and coalesce(v_per, 0) > 0 then v_ucost := round(v_bcost / v_per, 4); end if;
    v_price := nullif(it->>'sale_price', '')::numeric;
    v_exp   := nullif(it->>'expires_on', '')::date;

    -- fardo ligado: a entrada vai pro produto-unidade
    if prod.stock_parent_id is not null then
      select * into tgt from products where id = prod.stock_parent_id and store_id = v_store;
      v_factor := greatest(coalesce(prod.stock_factor, 1), 1);
      v_units := v_units * v_factor;
      if v_ucost is not null then v_ucost := round(v_ucost / v_factor, 4); end if;
    else
      tgt := prod;
    end if;

    v_line := round(v_units * coalesce(v_ucost, 0), 2);
    v_total := v_total + v_line;
    v_desc := 'Entrada #' || v_entry.id ||
              case when v_boxes is not null then ' · ' || trim(to_char(v_boxes, 'FM999990.##')) || ' x ' || trim(to_char(coalesce(v_per, 1), 'FM999990.##')) else '' end ||
              case when v_entry.supplier is not null then ' · ' || v_entry.supplier else '' end ||
              case when tgt.id <> prod.id then ' · via ' || prod.name else '' end;

    update products set
      stock_qty  = coalesce(stock_qty, 0) + v_units,
      track_stock = true,
      cost_price = coalesce(round(v_ucost, 2), cost_price)
    where id = tgt.id;
    if v_price is not null and v_price > 0 then
      update products set price = round(v_price, 2) where id = prod.id;
    end if;

    insert into stock_movements (store_id, product_id, kind, qty, description, unit_cost, entry_id, created_by_name)
    values (v_store, tgt.id, 'entrada', v_units, v_desc, round(v_ucost, 2), v_entry.id, my_name());

    if v_exp is not null then
      insert into product_lots (store_id, product_id, qty, expires_on, note, created_by_name)
      values (v_store, tgt.id, v_units, v_exp, 'Entrada #' || v_entry.id, my_name());
    end if;

    v_items := v_items || jsonb_build_object(
      'product_id', tgt.id, 'name', tgt.name, 'via', case when tgt.id <> prod.id then prod.name end,
      'boxes', v_boxes, 'per_box', v_per, 'units', v_units,
      'unit_cost', round(v_ucost, 2), 'line_cost', v_line, 'sale_price', v_price, 'expires_on', v_exp,
      'stock_after', (select stock_qty from products where id = tgt.id));
  end loop;

  update stock_entries set items = v_items, total_cost = round(v_total, 2) where id = v_entry.id;
  return jsonb_build_object('id', v_entry.id, 'items', v_items, 'total_cost', round(v_total, 2));
end $$;
revoke execute on function register_stock_entry(jsonb) from anon, public;
grant execute on function register_stock_entry(jsonb) to authenticated;

-- ---------- 5) SAÍDA MANUAL ----------
-- p = {reason, notes, items:[{product_id, qty, reason}]}
-- reason: quebra | vencido | consumo | brinde | outro
create or replace function register_stock_exit(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_store bigint := my_store(); it jsonb; prod products; tgt products;
  v_units numeric; v_reason text; v_items jsonb := '[]'; v_val numeric := 0; v_cost numeric;
  v_lbl text;
begin
  if v_store is null then raise exception 'Faça login no painel'; end if;
  if not staff_can('inventario') then raise exception 'Você não tem permissão pra lançar saída de estoque'; end if;
  if jsonb_array_length(coalesce(p->'items', '[]')) = 0 then raise exception 'Adicione pelo menos um produto'; end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    select * into prod from products where id = (it->>'product_id')::bigint and store_id = v_store;
    if prod.id is null then raise exception 'Produto não encontrado (%)', it->>'product_id'; end if;
    v_units := nullif(it->>'qty', '')::numeric;
    if v_units is null or v_units <= 0 then raise exception 'Quantidade inválida em "%"', prod.name; end if;
    v_reason := coalesce(nullif(it->>'reason', ''), nullif(p->>'reason', ''), 'outro');
    if v_reason not in ('quebra', 'vencido', 'consumo', 'brinde', 'outro') then v_reason := 'outro'; end if;
    v_lbl := case v_reason when 'quebra' then 'Quebra/avaria' when 'vencido' then 'Vencido'
                           when 'consumo' then 'Consumo próprio' when 'brinde' then 'Brinde' else 'Saída' end;

    if prod.stock_parent_id is not null then
      select * into tgt from products where id = prod.stock_parent_id and store_id = v_store;
      v_units := v_units * greatest(coalesce(prod.stock_factor, 1), 1);
    else
      tgt := prod;
    end if;
    v_cost := coalesce(tgt.cost_price, 0);
    v_val := v_val + v_units * v_cost;

    update products set stock_qty = coalesce(stock_qty, 0) - v_units, track_stock = true where id = tgt.id;
    insert into stock_movements (store_id, product_id, kind, qty, description, reason, unit_cost, created_by_name)
    values (v_store, tgt.id, 'saida', -v_units,
            v_lbl || coalesce(' · ' || nullif(trim(coalesce(it->>'notes', p->>'notes', '')), ''), '') ||
            case when tgt.id <> prod.id then ' · via ' || prod.name else '' end,
            v_reason, v_cost, my_name());

    v_items := v_items || jsonb_build_object('product_id', tgt.id, 'name', tgt.name, 'units', v_units,
      'reason', v_reason, 'cost', round(v_units * v_cost, 2),
      'stock_after', (select stock_qty from products where id = tgt.id));
  end loop;

  return jsonb_build_object('items', v_items, 'loss_value', round(v_val, 2));
end $$;
revoke execute on function register_stock_exit(jsonb) from anon, public;
grant execute on function register_stock_exit(jsonb) to authenticated;

notify pgrst, 'reload schema';
