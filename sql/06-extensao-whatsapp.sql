-- =========================================================
--  GELADÃO BROTHERS — parte 6
--  Extensão do WhatsApp: desconto manual no pedido e cliente
--  lembrado pelo nome que aparece no WhatsApp
-- =========================================================
alter table customers add column if not exists wa_name text;
create index if not exists customers_wa_name on customers (lower(wa_name));

create or replace function create_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s store_settings; v_order orders; it jsonb; op jsonb;
  prod products; opt complement_options; zone delivery_zones; cup coupons;
  v_sub numeric := 0; v_line numeric; v_unit numeric; v_opts jsonb;
  v_fee numeric := 0; v_disc numeric := 0; v_cust bigint; v_qty int;
  v_lat float8; v_lng float8; v_dist numeric; v_nb text;
  v_total_qty int; v_tier numeric; v_base numeric;
begin
  select * into s from store_settings where id = 1;
  -- loja fechada bloqueia o cliente, mas não o pedido lançado pelo painel
  if not s.is_open and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') <> 'authenticated' then
    raise exception 'A loja está fechada no momento';
  end if;

  insert into orders (customer_name, customer_phone, type, address, neighborhood,
                      cep, street, street_number, complement, reference,
                      payment_method, change_for, notes, coupon_code)
  values (p->>'customer_name', p->>'customer_phone', coalesce(p->>'type','delivery'),
          concat_ws(', ', p->>'street', p->>'street_number'), null,
          p->>'cep', p->>'street', p->>'street_number', p->>'complement', p->>'reference',
          p->>'payment_method',
          nullif(p->>'change_for','')::numeric, p->>'notes', upper(nullif(p->>'coupon_code','')))
  returning * into v_order;

  for it in select * from jsonb_array_elements(p->'items') loop
    select * into prod from products where id = (it->>'product_id')::bigint;
    if prod.id is null or prod.status <> 'ativo' then
      raise exception 'Produto indisponível: %', coalesce(prod.name, it->>'product_id');
    end if;
    v_qty := greatest(1, (it->>'qty')::int);
    v_base := coalesce(prod.promo_price, prod.price);
    -- preço por quantidade: soma tudo desse produto no pedido e pega a faixa
    select coalesce(sum(greatest(1,(x->>'qty')::int)),0) into v_total_qty
      from jsonb_array_elements(p->'items') x where (x->>'product_id')::bigint = prod.id;
    select min((t->>'price')::numeric) into v_tier
      from jsonb_array_elements(coalesce(prod.price_tiers,'[]'::jsonb)) t
      where (t->>'min_qty')::int <= v_total_qty and (t->>'price')::numeric > 0;
    v_unit := case when v_tier is not null and v_tier < v_base then v_tier else v_base end;
    v_opts := '[]';
    for op in select * from jsonb_array_elements(coalesce(it->'options','[]')) loop
      select * into opt from complement_options where id = (op->>'option_id')::bigint and active;
      if opt.id is not null then
        v_unit := v_unit + opt.price * greatest(1, coalesce((op->>'qty')::int,1));
        v_opts := v_opts || jsonb_build_object('name', opt.name, 'qty', coalesce((op->>'qty')::int,1), 'price', opt.price);
      end if;
    end loop;
    v_line := v_unit * v_qty;
    v_sub := v_sub + v_line;
    insert into order_items (order_id, product_id, name, unit_price, qty, options, notes, total)
    values (v_order.id, prod.id, prod.name, v_unit, v_qty, v_opts, it->>'notes', v_line);
    if prod.track_stock then
      update products set stock_qty = stock_qty - v_qty where id = prod.id;
      insert into stock_movements (product_id, kind, qty, description, order_id)
      values (prod.id, 'venda', -v_qty, 'Pedido #' || v_order.number, v_order.id);
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
      select * into zone from delivery_zones where id = (p->>'zone_id')::bigint and active;
      if zone.id is null then raise exception 'Escolha um bairro de entrega válido'; end if;
      v_fee := zone.fee;
      v_nb := zone.neighborhood;
    end if;
  end if;

  if v_order.coupon_code is not null then
    select * into cup from coupons where upper(code) = v_order.coupon_code and active
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
    insert into customers (name, phone, address, neighborhood, cep, street, street_number, complement, reference)
    values (p->>'customer_name', p->>'customer_phone', nullif(concat_ws(', ', p->>'street', p->>'street_number'),''),
            v_nb, p->>'cep', p->>'street', p->>'street_number', p->>'complement', p->>'reference')
    on conflict (phone) do update set name = excluded.name,
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
end $$;
