-- =========================================================
--  VYNTRA — parte 29 · PEDIDO NA MESA (QR code ou tablet)
--  Cada mesa ganha um código secreto. O link do cardápio com ?mesa=CÓDIGO
--  deixa o cliente pedir sozinho: os itens caem na comanda da mesa e na cozinha.
--  O preço é sempre calculado aqui no banco (o cliente não consegue mudar).
--  (pode rodar mais de uma vez sem problema)
-- =========================================================

-- código secreto de cada mesa (vai no QR code)
alter table dining_tables add column if not exists qr_token text;
update dining_tables set qr_token = substr(md5(random()::text || clock_timestamp()::text || id::text), 1, 10) where qr_token is null;
alter table dining_tables alter column qr_token set default substr(md5(random()::text || clock_timestamp()::text), 1, 10);
create unique index if not exists dining_tables_qr on dining_tables (qr_token);

-- liga/desliga o pedido pelo cliente na mesa (padrão: ligado)
alter table store_settings add column if not exists table_self_order boolean not null default true;

-- acha a mesa pelo código, na loja certa
create or replace function mesa_achar(p_loja text, p_token text)
returns dining_tables language sql stable security definer set search_path to 'public' as $$
  select t.* from dining_tables t
   where t.qr_token = nullif(trim(coalesce(p_token, '')), '')
     and t.active
     and t.store_id = coalesce(resolve_store(nullif(trim(coalesce(p_loja, '')), '')), 1)
   limit 1;
$$;

-- o cardápio pergunta: que mesa é essa e o que já foi pedido nela
create or replace function mesa_info(p_loja text, p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare t dining_tables; tb tabs; s store_settings; v_items jsonb; v_sub numeric;
begin
  t := mesa_achar(p_loja, p_token);
  if t.id is null then return jsonb_build_object('erro', 'mesa_nao_encontrada'); end if;
  select * into s from store_settings where id = t.store_id;
  if not coalesce(s.table_self_order, true) then return jsonb_build_object('erro', 'mesa_desligada', 'mesa', t.name); end if;
  select * into tb from tabs where table_id = t.id and status = 'aberta' limit 1;
  if tb.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'total', i.unit_price * i.qty,
             'options', (select coalesce(jsonb_agg(coalesce(o->>'label', o->>'name')), '[]') from jsonb_array_elements(i.options) o),
             'pronto', i.kitchen_at is not null, 'at', i.created_at) order by i.id), '[]'),
           coalesce(sum(i.unit_price * i.qty), 0)
      into v_items, v_sub
      from tab_items i where i.tab_id = tb.id and not i.canceled;
  end if;
  return jsonb_build_object('mesa', t.name, 'aberta', tb.id is not null, 'itens', coalesce(v_items, '[]'),
                            'consumo', coalesce(v_sub, 0), 'servico_pct', coalesce(s.service_pct, 10));
end $$;

-- o cliente na mesa manda o pedido
-- p = { loja, mesa (código), nome, itens: [{product_id, qty, notes, options:[{option_id, qty}]}] }
create or replace function mesa_pedido(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  t dining_tables; tb tabs; s store_settings; it jsonb; prod products; v_cat categories; gr record;
  v_qty int; v_unit numeric; v_opts jsonb; v_lbl jsonb; v_nome text; v_n int := 0; v_sub numeric := 0;
begin
  t := mesa_achar(p->>'loja', p->>'mesa');
  if t.id is null then raise exception 'Mesa não encontrada. Chame o garçom.'; end if;
  if not store_ok(t.store_id) then raise exception 'Esta loja está indisponível no momento'; end if;
  perform set_config('app.store', t.store_id::text, true);
  select * into s from store_settings where id = t.store_id;
  if not s.is_open then raise exception 'A loja está fechada no momento'; end if;
  if not coalesce(s.table_self_order, true) then raise exception 'O pedido pela mesa está desligado. Chame o garçom.'; end if;
  if jsonb_typeof(p->'itens') <> 'array' or jsonb_array_length(p->'itens') = 0 then raise exception 'A sacola está vazia'; end if;
  if jsonb_array_length(p->'itens') > 40 then raise exception 'Pedido grande demais. Chame o garçom.'; end if;
  v_nome := left(nullif(trim(coalesce(p->>'nome', '')), ''), 40);

  -- comanda da mesa: usa a aberta ou abre uma nova
  select * into tb from tabs where table_id = t.id and status = 'aberta' limit 1;
  if tb.id is null then
    begin
      insert into tabs (store_id, table_id, label, customer_name, opened_by)
      values (t.store_id, t.id, t.name, v_nome, 'Cliente na mesa') returning * into tb;
    exception when unique_violation then
      select * into tb from tabs where table_id = t.id and status = 'aberta' limit 1;
    end;
  elsif tb.customer_name is null and v_nome is not null then
    update tabs set customer_name = v_nome where id = tb.id;
  end if;

  for it in select * from jsonb_array_elements(p->'itens') loop
    select * into prod from products where id = (it->>'product_id')::bigint and store_id = t.store_id;
    if prod.id is null or prod.status <> 'ativo' then
      raise exception 'Produto indisponível: %', coalesce(prod.name, it->>'product_id');
    end if;
    select * into v_cat from categories where id = prod.category_id;
    if v_cat.id is not null and not cat_open(v_cat.available, s.timezone) then
      raise exception '"%" só está disponível %', prod.name, cat_hours_text(v_cat.available);
    end if;
    v_qty := least(50, greatest(1, coalesce((it->>'qty')::int, 1)));
    -- mesmo preço da comanda do garçom (promoção só se a loja liberou no balcão)
    v_unit := case when coalesce(s.promos_no_balcao, false) then coalesce(prod.promo_price, prod.price) else prod.price end;
    v_opts := '[]';
    for gr in select o.group_id, coalesce(cg.pricing, 'soma') as pricing,
                     jsonb_agg(jsonb_build_object('id', o.id, 'g', o.group_id, 'name', o.name, 'price', o.price,
                                                  'qty', least(10, greatest(1, coalesce((x->>'qty')::int, 1)))) order by o.sort_order, o.id) as items,
                     sum(o.price * least(10, greatest(1, coalesce((x->>'qty')::int, 1)))) as soma, max(o.price) as maior,
                     sum(least(10, greatest(1, coalesce((x->>'qty')::int, 1)))) as n
                from jsonb_array_elements(coalesce(it->'options', '[]')) x
                join complement_options o on o.id = (x->>'option_id')::bigint and o.active and o.store_id = t.store_id
                left join complement_groups cg on cg.id = o.group_id
               group by o.group_id, cg.pricing loop
      v_unit := v_unit + case gr.pricing when 'maior' then gr.maior when 'media' then round(gr.soma / gr.n, 2) else gr.soma end;
      select jsonb_agg(e || jsonb_build_object('label',
               case when gr.pricing <> 'soma' and gr.n > 1 then (e->>'qty') || '/' || gr.n || ' ' || (e->>'name')
                    when (e->>'qty')::int > 1 then (e->>'qty') || 'x ' || (e->>'name') else e->>'name' end))
        into v_lbl from jsonb_array_elements(gr.items) e;
      v_opts := v_opts || v_lbl;
    end loop;
    insert into tab_items (store_id, tab_id, product_id, name, qty, unit_price, options, notes, created_by)
    values (t.store_id, tb.id, prod.id, prod.name, v_qty, round(v_unit, 2), v_opts,
            left(nullif(trim(coalesce(it->>'notes', '')), ''), 140),
            '📱 Mesa' || coalesce(' · ' || v_nome, ''));
    v_n := v_n + v_qty; v_sub := v_sub + round(v_unit, 2) * v_qty;
  end loop;

  return jsonb_build_object('ok', true, 'mesa', t.name, 'itens', v_n, 'valor', v_sub);
end $$;

revoke all on function mesa_achar(text, text) from public, anon, authenticated;
revoke all on function mesa_info(text, text) from public;
revoke all on function mesa_pedido(jsonb) from public;
grant execute on function mesa_info(text, text) to anon, authenticated;
grant execute on function mesa_pedido(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
