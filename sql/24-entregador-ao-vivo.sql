-- =========================================================
--  VYNTRA — parte 24 · ENTREGADOR EM TEMPO REAL
--  Cada entregador ganha um link só dele (sem senha): abre no celular,
--  liga o GPS e vê as entregas. A loja vê no mapa onde ele está e o
--  cliente acompanha o motoboy chegando.
--  (pode rodar mais de uma vez sem problema)
-- =========================================================

alter table couriers add column if not exists token text default replace(gen_random_uuid()::text, '-', '');
update couriers set token = replace(gen_random_uuid()::text, '-', '') where token is null;
create unique index if not exists couriers_token on couriers (token);
alter table couriers add column if not exists last_lat float8;
alter table couriers add column if not exists last_lng float8;
alter table couriers add column if not exists last_acc float8;
alter table couriers add column if not exists last_seen timestamptz;
alter table orders add column if not exists delivered_at timestamptz;

-- o celular do entregador: quem ele é + as entregas que estão com ele
create or replace function courier_me(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c couriers; s store_settings;
begin
  select * into c from couriers where token = p_token and length(coalesce(p_token,'')) >= 16;
  if c.id is null or not c.active then return jsonb_build_object('ok', false, 'erro', 'link_invalido'); end if;
  if not store_ok(c.store_id) then return jsonb_build_object('ok', false, 'erro', 'loja_bloqueada'); end if;
  select * into s from store_settings where id = c.store_id;
  return jsonb_build_object('ok', true, 'name', c.name, 'store', s.name, 'store_phone', s.whatsapp,
    'store_lat', s.store_lat, 'store_lng', s.store_lng,
    'done_today', (select count(*) from orders o where o.courier_id = c.id and o.status = 'concluido'
                     and o.created_at >= date_trunc('day', now() at time zone coalesce(s.timezone,'America/Fortaleza')) at time zone coalesce(s.timezone,'America/Fortaleza')),
    'orders', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'number', o.number, 'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
        'street', coalesce(o.street, o.address), 'street_number', o.street_number, 'neighborhood', o.neighborhood,
        'complement', o.complement, 'reference', o.reference, 'lat', o.lat, 'lng', o.lng,
        'total', o.total, 'payment_method', o.payment_method, 'change_for', o.change_for, 'notes', o.notes,
        'dispatched_at', o.dispatched_at,
        'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'options', i.options) order by i.id)
                           from order_items i where i.order_id = o.id), '[]'::jsonb)) order by o.dispatched_at nulls last, o.id)
      from orders o where o.courier_id = c.id and o.status = 'saiu_entrega' and o.created_at > now() - interval '2 days'), '[]'::jsonb));
end $$;
grant execute on function courier_me(text) to anon, authenticated;

-- o celular manda a posição do entregador a cada poucos segundos
create or replace function courier_ping(p_token text, p_lat float8, p_lng float8, p_acc float8 default null) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then return false; end if;
  update couriers set last_lat = p_lat, last_lng = p_lng, last_acc = p_acc, last_seen = now()
   where token = p_token and length(coalesce(p_token,'')) >= 16 and active;
  return found;
end $$;
grant execute on function courier_ping(text, float8, float8, float8) to anon, authenticated;

-- o entregador marca "Entregue"
create or replace function courier_done(p_token text, p_order bigint) returns boolean
language plpgsql security definer set search_path = public as $$
declare c couriers;
begin
  select * into c from couriers where token = p_token and length(coalesce(p_token,'')) >= 16 and active;
  if c.id is null then return false; end if;
  update orders set status = 'concluido', delivered_at = now()
   where id = p_order and courier_id = c.id and status = 'saiu_entrega';
  return found;
end $$;
grant execute on function courier_done(text, bigint) to anon, authenticated;

-- o cliente acompanha o pedido: agora com o motoboy no mapa enquanto "Saiu para entrega"
create or replace function get_order(p_id bigint, p_phone text) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'type', o.type,
    'created_at', o.created_at, 'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee,
    'discount', o.discount, 'total', o.total, 'payment_method', o.payment_method,
    'change_for', o.change_for, 'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'street', o.street, 'street_number', o.street_number, 'neighborhood', o.neighborhood,
    'complement', o.complement, 'reference', o.reference, 'lat', o.lat, 'lng', o.lng,
    'dispatched_at', o.dispatched_at, 'delivered_at', o.delivered_at,
    'courier', (select jsonb_build_object('name', split_part(c.name, ' ', 1), 'lat', c.last_lat, 'lng', c.last_lng, 'seen', c.last_seen)
                from couriers c where c.id = o.courier_id and o.status = 'saiu_entrega'
                  and c.last_seen > now() - interval '15 minutes'),
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty,
              'total', i.total, 'options', i.options, 'notes', i.notes) order by i.id)
              from order_items i where i.order_id = o.id), '[]'::jsonb))
  from orders o
  where o.id = p_id
    and regexp_replace(coalesce(o.customer_phone,''), '\D', '', 'g')
      = regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
$$;
grant execute on function get_order(bigint, text) to anon, authenticated;

notify pgrst, 'reload schema';
