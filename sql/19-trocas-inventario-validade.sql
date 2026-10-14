-- =========================================================
--  GELADÃO BROTHERS — parte 19
--  Trocas e devoluções · Inventário (contagem de estoque) · Validade dos produtos
-- =========================================================

-- ---------- permissão do funcionário conferida no banco ----------
create or replace function staff_can(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select is_owner() or (is_staff() and exists (
    select 1 from staff s where s.user_id = auth.uid() and s.active and
      case when s.perms is null
           then k = any (array['pedidos','novo','historico','entregas','cancelar','resumo','desconto','fiado_vender','estoque','clientes'])
           else s.perms ? k end));
$$;
grant execute on function staff_can(text) to authenticated;

-- nome de quem está usando
create or replace function my_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select coalesce(name, username, email) from staff where user_id = auth.uid()), 'Dono');
$$;

-- ========================================================
-- 1) TROCAS E DEVOLUÇÕES
-- ========================================================
create table if not exists returns (
  id              bigserial primary key,
  order_id        bigint references orders(id) on delete set null,
  order_number    int,
  items           jsonb not null default '[]',   -- [{order_item_id, product_id, name, qty, unit_price, amount, unit_cost}]
  amount          numeric(10,2) not null default 0,
  refund_method   text not null check (refund_method in ('dinheiro','pix','cartao','fiado','troca')),
  reason          text,
  restock         boolean not null default true,
  cash_session_id bigint references cash_sessions(id) on delete set null,
  customer_id     bigint,
  created_by      uuid default auth.uid(),
  created_by_name text,
  created_at      timestamptz not null default now()
);
create index if not exists returns_order on returns (order_id);
create index if not exists returns_date on returns (created_at);
alter table returns enable row level security;
drop policy if exists equipe_ve on returns;
drop policy if exists dono_tudo on returns;
create policy equipe_ve on returns for select to authenticated using ((select is_staff()));
create policy dono_tudo on returns for all to authenticated using ((select is_owner())) with check ((select is_owner()));
grant select on returns to authenticated;
grant all on returns to authenticated;
grant usage, select on sequence returns_id_seq to authenticated;

-- devolve itens de um pedido: volta o estoque, devolve o dinheiro (sai do caixa) ou abate no fiado
create or replace function register_return(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders; it jsonb; oi order_items; prod products; sprod products;
  v_qty numeric; v_done numeric; v_factor numeric; v_amt numeric; v_total numeric := 0;
  v_items jsonb := '[]'; v_units numeric; v_sess bigint; v_ret returns; v_method text; v_restock boolean;
begin
  if not staff_can('devolucao') then raise exception 'Você não tem permissão pra fazer troca/devolução'; end if;
  select * into o from orders where id = (p->>'order_id')::bigint;
  if o.id is null then raise exception 'Pedido não encontrado'; end if;
  if o.status = 'cancelado' then raise exception 'Esse pedido foi cancelado: não tem o que devolver'; end if;
  v_method := coalesce(p->>'refund_method', 'dinheiro');
  v_restock := coalesce((p->>'restock')::boolean, true);
  -- desconto do pedido é dividido proporcionalmente entre os itens
  v_factor := case when coalesce(o.subtotal, 0) > 0 then greatest(0, least(1, (o.subtotal - coalesce(o.discount, 0)) / o.subtotal)) else 1 end;

  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]')) loop
    v_qty := coalesce((it->>'qty')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    select * into oi from order_items where id = (it->>'order_item_id')::bigint and order_id = o.id;
    if oi.id is null then raise exception 'Item não é desse pedido'; end if;
    select coalesce(sum((x->>'qty')::numeric), 0) into v_done
      from returns r, jsonb_array_elements(r.items) x
      where r.order_id = o.id and (x->>'order_item_id')::bigint = oi.id;
    if v_qty > oi.qty - v_done then
      raise exception 'Do item "%" só dá pra devolver %', oi.name, (oi.qty - v_done);
    end if;
    v_amt := round(oi.unit_price * v_qty * v_factor, 2);
    v_total := v_total + v_amt;
    v_items := v_items || jsonb_build_object('order_item_id', oi.id, 'product_id', oi.product_id, 'name', oi.name,
                 'qty', v_qty, 'unit_price', oi.unit_price, 'amount', v_amt, 'unit_cost', oi.unit_cost);
    -- estoque volta (fardo volta pra unidade)
    if v_restock and oi.product_id is not null then
      select * into prod from products where id = oi.product_id;
      if prod.id is not null then
        select * into sprod from products where id = coalesce(prod.stock_parent_id, prod.id);
        v_units := v_qty * case when prod.stock_parent_id is not null then coalesce(prod.stock_factor, 1) else 1 end;
        if sprod.track_stock then
          update products set stock_qty = stock_qty + v_units where id = sprod.id;
          insert into stock_movements (product_id, kind, qty, description, order_id)
          values (sprod.id, 'entrada', v_units, 'Devolução do pedido #' || o.number ||
                  case when sprod.id <> prod.id then ' · ' || v_qty || 'x ' || prod.name else '' end, o.id);
        end if;
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_items) = 0 then raise exception 'Escolha pelo menos um item pra devolver'; end if;

  -- de qual caixa sai o dinheiro: o caixa aberto de quem está devolvendo (ou o único aberto)
  select id into v_sess from cash_sessions where closed_at is null and user_id = auth.uid() order by opened_at desc limit 1;
  if v_sess is null then select id into v_sess from cash_sessions where closed_at is null order by opened_at desc limit 1; end if;
  if v_method = 'dinheiro' and v_sess is null then raise exception 'Abra o caixa pra devolver em dinheiro'; end if;

  insert into returns (order_id, order_number, items, amount, refund_method, reason, restock, cash_session_id, customer_id, created_by_name)
  values (o.id, o.number, v_items, v_total, v_method, nullif(p->>'reason', ''), v_restock, v_sess, o.customer_id, my_name())
  returning * into v_ret;

  if v_method = 'dinheiro' then
    insert into cash_movements (session_id, kind, amount, payment_method, description, order_id)
    values (v_sess, 'saida', v_total, 'Dinheiro', 'Devolução do pedido #' || o.number, o.id);
  elsif v_method = 'fiado' then
    if o.customer_id is null then raise exception 'Esse pedido não tem cliente cadastrado pra abater no fiado'; end if;
    insert into credit_entries (customer_id, kind, amount, description, order_id)
    values (o.customer_id, 'pagamento', v_total, 'Devolução do pedido #' || o.number, o.id);
  end if;

  return jsonb_build_object('id', v_ret.id, 'amount', v_total, 'number', o.number);
end $$;
revoke execute on function register_return(jsonb) from anon, public;
grant execute on function register_return(jsonb) to authenticated;

-- ========================================================
-- 2) INVENTÁRIO (contagem de estoque)
-- ========================================================
create table if not exists inventories (
  id              bigserial primary key,
  items           jsonb not null default '[]',   -- [{product_id, name, before, counted, diff, unit_cost}]
  diff_value      numeric(12,2) default 0,       -- diferença em R$ (pelo custo): negativo = faltou
  notes           text,
  created_by      uuid default auth.uid(),
  created_by_name text,
  created_at      timestamptz not null default now()
);
alter table inventories enable row level security;
drop policy if exists equipe_ve on inventories;
drop policy if exists dono_tudo on inventories;
create policy equipe_ve on inventories for select to authenticated using ((select is_staff()));
create policy dono_tudo on inventories for all to authenticated using ((select is_owner())) with check ((select is_owner()));
grant all on inventories to authenticated;
grant usage, select on sequence inventories_id_seq to authenticated;

create or replace function apply_inventory(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; prod products; v_cnt numeric; v_diff numeric; v_items jsonb := '[]'; v_val numeric := 0; v_inv inventories; v_cost numeric;
begin
  if not staff_can('inventario') then raise exception 'Você não tem permissão pra fazer inventário'; end if;
  insert into inventories (notes, created_by_name) values (nullif(p->>'notes', ''), my_name()) returning * into v_inv;
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]')) loop
    if it->>'counted' is null or it->>'counted' = '' then continue; end if;
    select * into prod from products where id = (it->>'product_id')::bigint;
    if prod.id is null then continue; end if;
    v_cnt := (it->>'counted')::numeric;
    v_diff := v_cnt - coalesce(prod.stock_qty, 0);
    v_cost := coalesce(prod.cost_price, 0);
    v_items := v_items || jsonb_build_object('product_id', prod.id, 'name', prod.name, 'before', coalesce(prod.stock_qty, 0),
                 'counted', v_cnt, 'diff', v_diff, 'unit_cost', v_cost);
    v_val := v_val + v_diff * v_cost;
    if v_diff <> 0 then
      update products set stock_qty = v_cnt, track_stock = true where id = prod.id;
      insert into stock_movements (product_id, kind, qty, description)
      values (prod.id, 'ajuste', v_diff, 'Inventário #' || v_inv.id);
    end if;
  end loop;
  update inventories set items = v_items, diff_value = round(v_val, 2) where id = v_inv.id;
  return jsonb_build_object('id', v_inv.id, 'items', jsonb_array_length(v_items), 'diff_value', round(v_val, 2));
end $$;
revoke execute on function apply_inventory(jsonb) from anon, public;
grant execute on function apply_inventory(jsonb) to authenticated;

-- ========================================================
-- 3) VALIDADE DOS PRODUTOS (lotes)
-- ========================================================
create table if not exists product_lots (
  id          bigserial primary key,
  product_id  bigint not null references products(id) on delete cascade,
  qty         numeric(10,2),
  expires_on  date not null,
  note        text,
  done        boolean not null default false,       -- acabou / já tirou da prateleira
  created_by_name text,
  created_at  timestamptz not null default now()
);
create index if not exists product_lots_exp on product_lots (done, expires_on);
alter table product_lots enable row level security;
drop policy if exists equipe_ve on product_lots;
drop policy if exists equipe_cria on product_lots;
drop policy if exists equipe_altera on product_lots;
drop policy if exists dono_tudo on product_lots;
create policy equipe_ve     on product_lots for select to authenticated using ((select is_staff()));
create policy equipe_cria   on product_lots for insert to authenticated with check ((select staff_can('inventario')));
create policy equipe_altera on product_lots for update to authenticated using ((select staff_can('inventario'))) with check ((select staff_can('inventario')));
create policy dono_tudo     on product_lots for all to authenticated using ((select is_owner())) with check ((select is_owner()));
grant all on product_lots to authenticated;
grant usage, select on sequence product_lots_id_seq to authenticated;

notify pgrst, 'reload schema';
