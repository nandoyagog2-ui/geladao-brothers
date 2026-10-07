-- =========================================================
--  GELADÃO BROTHERS — parte 3
--  Taxa de entrega por km + avisos do pedido no WhatsApp
-- =========================================================
alter table store_settings
  add column if not exists delivery_mode text default 'bairro',      -- 'bairro' ou 'km'
  add column if not exists store_lat float8,
  add column if not exists store_lng float8,
  add column if not exists km_base_fee numeric(10,2) default 5,      -- taxa mínima
  add column if not exists km_base_km numeric(10,2) default 2,       -- km incluídos na taxa mínima
  add column if not exists km_price numeric(10,2) default 1.5,       -- valor de cada km a mais
  add column if not exists km_max numeric(10,2) default 8,           -- distância máxima de entrega
  add column if not exists review_url text,                          -- link de avaliação (Google)
  add column if not exists wa_templates jsonb default '{
    "em_preparo": "Olá, {nome}! 😃 Recebemos seu pedido *#{numero}* no {loja} e já estamos preparando. 🍻\nTotal: {total}\nAcompanhe aqui: {link_pedido}",
    "saiu_entrega": "🛵 {nome}, seu pedido *#{numero}* saiu para entrega! Já já chega aí. 🍻",
    "pronto": "✅ {nome}, seu pedido *#{numero}* está pronto pra retirada aqui no {loja}!",
    "concluido": "Obrigado pela preferência, {nome}! 🙏💛 Esperamos que tenha gostado.\nSe puder, avalie a gente: {link_avaliacao}\nVolte sempre ao {loja}! 🍻"
  }';

alter table orders
  add column if not exists lat float8,
  add column if not exists lng float8,
  add column if not exists distance_km numeric(10,1);

create or replace function create_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s store_settings; v_order orders; it jsonb; op jsonb;
  prod products; opt complement_options; zone delivery_zones; cup coupons;
  v_sub numeric := 0; v_line numeric; v_unit numeric; v_opts jsonb;
  v_fee numeric := 0; v_disc numeric := 0; v_cust bigint; v_qty int;
  v_lat float8; v_lng float8; v_dist numeric; v_nb text;
begin
  select * into s from store_settings where id = 1;
  if not s.is_open then raise exception 'A loja está fechada no momento'; end if;

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
    v_unit := coalesce(prod.promo_price, prod.price);
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

  if coalesce(p->>'type','delivery') = 'delivery' then
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
