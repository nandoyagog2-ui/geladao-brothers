-- =========================================================
--  VYNTRA — parte 22 · RESTAURANTE
--  Pizza meio a meio · Tela da cozinha · Cardápio por horário
-- =========================================================

-- 1) PIZZA: o grupo de complementos escolhe como cobra
--    soma  = soma cada opção (adicionais, bordas, bebidas)
--    maior = pizza meio a meio cobrando o sabor mais caro
--    media = pizza meio a meio cobrando a média dos sabores
alter table complement_groups add column if not exists pricing text not null default 'soma';
do $$ begin
  alter table complement_groups add constraint complement_groups_pricing_chk check (pricing in ('soma','maior','media'));
exception when duplicate_object then null; end $$;

-- 2) COZINHA: categoria que vai pra tela da cozinha + quando o pedido ficou pronto lá
alter table categories add column if not exists to_kitchen boolean not null default true;
alter table orders add column if not exists kitchen_at timestamptz;
alter table orders add column if not exists kitchen_by text;

-- 3) HORÁRIO DA CATEGORIA: {"days":["seg","ter",...],"from":"11:00","to":"14:30"} · vazio = sempre
alter table categories add column if not exists available jsonb;

create or replace function cat_open(av jsonb, tz text) returns boolean
language plpgsql stable as $$
declare n timestamp := now() at time zone coalesce(tz, 'America/Fortaleza');
  d text := (array['dom','seg','ter','qua','qui','sex','sab'])[extract(dow from n)::int + 1];
  y text := (array['dom','seg','ter','qua','qui','sex','sab'])[extract(dow from n - interval '1 day')::int + 1];
  t time := n::time; f time; e time; days jsonb;
begin
  if av is null or av = 'null'::jsonb or coalesce(av->>'from', '') = '' or coalesce(av->>'to', '') = '' then
    days := av->'days';
    return days is null or jsonb_array_length(days) = 0 or days ? d;
  end if;
  f := (av->>'from')::time; e := (av->>'to')::time; days := coalesce(av->'days', '[]'::jsonb);
  if f <= e then
    return (jsonb_array_length(days) = 0 or days ? d) and t >= f and t < e;
  else  -- passa da meia-noite (ex.: 18:00 às 02:00)
    return ((jsonb_array_length(days) = 0 or days ? d) and t >= f) or ((jsonb_array_length(days) = 0 or days ? y) and t < e);
  end if;
end $$;

create or replace function cat_hours_text(av jsonb) returns text
language sql immutable as $$
  select trim(
    case when coalesce(av->>'from','') <> '' then 'das ' || (av->>'from') || ' às ' || (av->>'to') else '' end ||
    case when jsonb_array_length(coalesce(av->'days','[]'::jsonb)) between 1 and 6
         then ' (' || (select string_agg(x, ', ') from jsonb_array_elements_text(av->'days') x) || ')' else '' end);
$$;
grant execute on function cat_open(jsonb, text) to anon, authenticated;

-- 4) PEDIDO com as regras novas
create or replace function public.create_order(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s store_settings; v_order orders; it jsonb; op jsonb;
  prod products; opt complement_options; zone delivery_zones; cup coupons;
  v_sub numeric := 0; v_line numeric; v_unit numeric; v_opts jsonb;
  v_fee numeric := 0; v_disc numeric := 0; v_cust bigint; v_qty int;
  v_lat float8; v_lng float8; v_dist numeric; v_nb text;
  v_total_qty int; v_tier numeric; v_balcao boolean; v_base numeric; sprod products; v_units numeric;
  v_store bigint; gr record; v_cat categories; v_auth boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'authenticated';
begin
  -- de qual loja é o pedido: quem está logado no painel usa a loja dele; o cliente do cardápio manda a loja
  v_store := case when v_auth and my_store() is not null then my_store() when nullif(trim(coalesce(p->>'store', '')), '') is null then 1 else resolve_store(p->>'store') end;
  if v_store is null then raise exception 'Loja não encontrada'; end if;
  if not store_ok(v_store) then raise exception 'Esta loja está indisponível no momento'; end if;
  perform set_config('app.store', v_store::text, true);
  select * into s from store_settings where id = v_store;
  -- loja fechada bloqueia o cliente, mas não o pedido lançado pelo painel
  if not s.is_open and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') <> 'authenticated' then
    raise exception 'A loja está fechada no momento';
  end if;

  insert into orders (store_id, customer_name, customer_phone, type, address, neighborhood,
                      cep, street, street_number, complement, reference,
                      payment_method, change_for, notes, coupon_code)
  values (v_store, p->>'customer_name', p->>'customer_phone', coalesce(p->>'type','delivery'),
          concat_ws(', ', p->>'street', p->>'street_number'), null,
          p->>'cep', p->>'street', p->>'street_number', p->>'complement', p->>'reference',
          p->>'payment_method',
          nullif(p->>'change_for','')::numeric, p->>'notes', upper(nullif(p->>'coupon_code','')))
  returning * into v_order;

  for it in select * from jsonb_array_elements(p->'items') loop
    select * into prod from products where id = (it->>'product_id')::bigint and store_id = v_store;
    if prod.id is null or prod.status <> 'ativo' then
      raise exception 'Produto indisponível: %', coalesce(prod.name, it->>'product_id');
    end if;
    -- categoria com horário (ex.: marmitas só no almoço): o cliente do cardápio só pede no horário
    if not v_auth then
      select * into v_cat from categories where id = prod.category_id;
      if v_cat.id is not null and not cat_open(v_cat.available, s.timezone) then
        raise exception '"%" só está disponível %', prod.name, cat_hours_text(v_cat.available);
      end if;
    end if;
    v_qty := greatest(1, (it->>'qty')::int);
    v_balcao := coalesce(p->>'type','delivery') = 'balcao' and not coalesce(s.promos_no_balcao, false);
    -- balcão (PDV): preço normal, sem promoção nem "leve mais pague menos"
    v_base := case when v_balcao then prod.price else coalesce(prod.promo_price, prod.price) end;
    -- preço por quantidade: soma tudo desse produto no pedido e pega a faixa
    select coalesce(sum(greatest(1,(x->>'qty')::int)),0) into v_total_qty
      from jsonb_array_elements(p->'items') x where (x->>'product_id')::bigint = prod.id;
    select min((t->>'price')::numeric) into v_tier
      from jsonb_array_elements(coalesce(prod.price_tiers,'[]'::jsonb)) t
      where (t->>'min_qty')::int <= v_total_qty and (t->>'price')::numeric > 0;
    if v_balcao then v_tier := null; end if;
    v_unit := case when v_tier is not null and v_tier < v_base then v_tier else v_base end;
    -- complementos: cada grupo cobra do seu jeito (somar / pizza pelo sabor mais caro / pizza pela média)
    v_opts := '[]';
    for gr in select o.group_id, coalesce(cg.pricing, 'soma') as pricing,
                     jsonb_agg(jsonb_build_object('name', o.name, 'qty', greatest(1, coalesce((x->>'qty')::int, 1)), 'price', o.price) order by o.sort_order, o.id) as items,
                     sum(o.price * greatest(1, coalesce((x->>'qty')::int, 1))) as soma, max(o.price) as maior,
                     sum(greatest(1, coalesce((x->>'qty')::int, 1))) as n
              from jsonb_array_elements(coalesce(it->'options', '[]')) x
              join complement_options o on o.id = (x->>'option_id')::bigint and o.active and o.store_id = v_store
              left join complement_groups cg on cg.id = o.group_id
              group by o.group_id, cg.pricing loop
      v_unit := v_unit + case gr.pricing when 'maior' then gr.maior when 'media' then round(gr.soma / gr.n, 2) else gr.soma end;
      if gr.pricing in ('maior', 'media') and gr.n > 1 then
        v_opts := v_opts || (select jsonb_agg(jsonb_build_object('name', (e->>'qty') || '/' || gr.n || ' ' || (e->>'name'), 'qty', 1, 'price', 0)) from jsonb_array_elements(gr.items) e);
      elsif gr.pricing in ('maior', 'media') then
        v_opts := v_opts || (select jsonb_agg(e || jsonb_build_object('price', 0)) from jsonb_array_elements(gr.items) e);
      else
        v_opts := v_opts || gr.items;
      end if;
    end loop;
    v_line := v_unit * v_qty;
    v_sub := v_sub + v_line;
    insert into order_items (order_id, product_id, name, unit_price, qty, options, notes, total)
    values (v_order.id, prod.id, prod.name, v_unit, v_qty, v_opts, it->>'notes', v_line);
    -- estoque: se o produto usa o estoque de outro (ex.: fardo 12x usa a unidade), baixa de lá
    select * into sprod from products where id = coalesce(prod.stock_parent_id, prod.id);
    v_units := v_qty * case when prod.stock_parent_id is not null then coalesce(prod.stock_factor, 1) else 1 end;
    if sprod.track_stock then
      update products set stock_qty = stock_qty - v_units where id = sprod.id;
      insert into stock_movements (product_id, kind, qty, description, order_id)
      values (sprod.id, 'venda', -v_units, 'Pedido #' || v_order.number ||
              case when sprod.id <> prod.id then ' · ' || v_qty || 'x ' || prod.name else '' end, v_order.id);
    end if;
  end loop;

  if v_sub < s.min_order then raise exception 'Pedido mínimo é R$ %', s.min_order; end if;

  if coalesce(p->>'type','delivery') = 'delivery' and nullif(p->>'fee_override','') is not null
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'authenticated' then
    -- pedido lançado pelo painel (logado): taxa digitada na mão
    v_fee := greatest(0, (p->>'fee_override')::numeric);
    v_nb := nullif(p->>'neighborhood', '');
  elsif coalesce(p->>'type','delivery') = 'delivery' then
    if s.delivery_mode = 'km' then
      v_lat := nullif(p->>'lat','')::float8; v_lng := nullif(p->>'lng','')::float8;
      if v_lat is null or v_lng is null or s.store_lat is null or s.store_lng is null then
        raise exception 'Não foi possível calcular a distância da entrega. Use o botão "Usar minha localização".';
      end if;
      v_dist := round((2 * 6371 * asin(sqrt(
                  power(sin(radians(v_lat - s.store_lat) / 2), 2) +
                  cos(radians(s.store_lat)) * cos(radians(v_lat)) *
                  power(sin(radians(v_lng - s.store_lng) / 2), 2))))::numeric, 1);
      if coalesce(s.km_max, 0) > 0 and v_dist > s.km_max then
        raise exception 'Endereço fora da área de entrega (% km, o máximo é % km)', v_dist, s.km_max;
      end if;
      v_fee := coalesce(s.km_base_fee, 0) + greatest(0, ceil(v_dist - coalesce(s.km_base_km, 0))) * coalesce(s.km_price, 0);
      v_nb := nullif(p->>'neighborhood', '');
    else
      select * into zone from delivery_zones where id = (p->>'zone_id')::bigint and active and store_id = v_store;
      if zone.id is null then raise exception 'Escolha um bairro de entrega válido'; end if;
      v_fee := zone.fee;
      v_nb := zone.neighborhood;
    end if;
  end if;

  if v_order.coupon_code is not null then
    select * into cup from coupons where store_id = v_store and upper(code) = v_order.coupon_code and active
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses < max_uses) and v_sub >= min_order;
    if cup.id is not null then
      if cup.kind = 'percent' then v_disc := round(v_sub * cup.value / 100, 2);
      elsif cup.kind = 'fixed' then v_disc := least(cup.value, v_sub);
      else v_disc := v_fee; end if;
      update coupons set uses = uses + 1 where id = cup.id;
    end if;
  end if;

  -- desconto digitado na mão (só pelo painel, logado)
  if nullif(p->>'discount_override','') is not null
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'authenticated' then
    v_disc := least(v_sub + v_fee, greatest(0, (p->>'discount_override')::numeric));
  end if;

  -- cliente: cria ou atualiza pelo telefone
  if nullif(p->>'customer_phone','') is not null then
    insert into customers (store_id, name, phone, address, neighborhood, cep, street, street_number, complement, reference)
    values (v_store, p->>'customer_name', p->>'customer_phone', nullif(concat_ws(', ', p->>'street', p->>'street_number'),''),
            v_nb, p->>'cep', p->>'street', p->>'street_number', p->>'complement', p->>'reference')
    on conflict (store_id, phone) do update set name = excluded.name,
      address = coalesce(excluded.address, customers.address),
      cep = coalesce(excluded.cep, customers.cep), street = coalesce(excluded.street, customers.street),
      street_number = coalesce(excluded.street_number, customers.street_number),
      complement = coalesce(excluded.complement, customers.complement),
      reference = coalesce(excluded.reference, customers.reference),
      neighborhood = coalesce(excluded.neighborhood, customers.neighborhood)
    returning id into v_cust;
    if nullif(p->>'wa_name','') is not null then
      update customers set wa_name = p->>'wa_name' where id = v_cust;
    end if;
  end if;

  update orders set customer_id = v_cust, neighborhood = v_nb,
    lat = v_lat, lng = v_lng, distance_km = v_dist,
    subtotal = v_sub, delivery_fee = v_fee, discount = v_disc,
    total = v_sub + v_fee - v_disc
  where id = v_order.id returning * into v_order;

  if v_order.change_for is not null and v_order.change_for <= v_order.total then
    raise exception 'O valor para troco precisa ser maior que o total (R$ %)', v_order.total;
  end if;

  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'total', v_order.total,
                            'subtotal', v_sub, 'delivery_fee', v_fee, 'discount', v_disc, 'distance_km', v_dist,
                            'change', case when v_order.change_for is not null
                                           then v_order.change_for - v_order.total end);
end $function$;
grant execute on function create_order(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
