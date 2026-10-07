-- =========================================================
--  GELADÃO BROTHERS — parte 2
--  Permite o cliente acompanhar o próprio pedido
--  (precisa do número do pedido E do telefone usado nele).
-- =========================================================
create or replace function get_order(p_id bigint, p_phone text) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'number', o.number, 'status', o.status, 'type', o.type,
    'created_at', o.created_at, 'subtotal', o.subtotal, 'delivery_fee', o.delivery_fee,
    'discount', o.discount, 'total', o.total, 'payment_method', o.payment_method,
    'change_for', o.change_for, 'customer_name', o.customer_name, 'customer_phone', o.customer_phone,
    'street', o.street, 'street_number', o.street_number, 'neighborhood', o.neighborhood,
    'complement', o.complement, 'reference', o.reference,
    'items', coalesce((select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty,
              'total', i.total, 'options', i.options, 'notes', i.notes) order by i.id)
              from order_items i where i.order_id = o.id), '[]'::jsonb))
  from orders o
  where o.id = p_id
    and regexp_replace(coalesce(o.customer_phone,''), '\D', '', 'g')
      = regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
$$;
grant execute on function get_order(bigint, text) to anon, authenticated;

-- Foto da categoria (o bloco amarelo do cardápio)
alter table categories add column if not exists image_url text;

-- Começa com os combos nos Destaques (dá pra mudar no painel em "Destaques e promoções")
update products set featured = true
where category_id = (select id from categories where name = 'Combos') and status = 'ativo';
