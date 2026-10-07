-- =========================================================
--  GELADÃO BROTHERS — parte 4
--  Avaliações dos clientes + mensagens novas do WhatsApp
-- =========================================================
create table if not exists reviews (
  id bigserial primary key,
  order_id bigint unique references orders(id) on delete cascade,
  customer_id bigint references customers(id) on delete set null,
  customer_name text,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz default now()
);
alter table reviews enable row level security;
drop policy if exists painel_tudo on reviews;
create policy painel_tudo on reviews for all to authenticated using (true) with check (true);

-- O cliente avalia o próprio pedido (precisa do número do pedido + telefone usado nele)
create or replace function submit_review(p_id bigint, p_phone text, p_rating int, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_id
    and regexp_replace(coalesce(customer_phone,''), '\D', '', 'g') = regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  if o.id is null then raise exception 'Pedido não encontrado'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Nota inválida'; end if;
  insert into reviews (order_id, customer_id, customer_name, rating, comment)
  values (o.id, o.customer_id, o.customer_name, p_rating, nullif(left(trim(coalesce(p_comment,'')), 500), ''))
  on conflict (order_id) do update set rating = excluded.rating, comment = excluded.comment, created_at = now();
  return jsonb_build_object('ok', true);
end $$;
grant execute on function submit_review(bigint, text, int, text) to anon, authenticated;

-- Mostra se o pedido já foi avaliado (pra tela de avaliação)
create or replace function get_review(p_id bigint, p_phone text) returns jsonb
language sql security definer set search_path = public as $$
  select jsonb_build_object('number', o.number, 'name', o.customer_name, 'rating', r.rating, 'comment', r.comment)
  from orders o left join reviews r on r.order_id = o.id
  where o.id = p_id
    and regexp_replace(coalesce(o.customer_phone,''), '\D', '', 'g') = regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
$$;
grant execute on function get_review(bigint, text) to anon, authenticated;

-- Mensagens novas (o "recebemos" sem link; o agradecimento com o link de avaliação)
update store_settings set wa_templates = '{
  "em_preparo": "Olá, {nome}! 😃 Recebemos seu pedido *#{numero}* no {loja} e já estamos preparando. 🍻\nTotal: {total}",
  "saiu_entrega": "🛵 {nome}, seu pedido *#{numero}* saiu para entrega! Já já chega aí. 🍻",
  "pronto": "✅ {nome}, seu pedido *#{numero}* está pronto pra retirada aqui no {loja}!",
  "concluido": "Obrigado pela preferência, {nome}! 🙏💛\nEsperamos te encontrar em breve.\nO {loja} agradece! 🍻\n\n⭐ Avalie seu pedido, leva 10 segundos:\n{link_avaliacao}"
}'::jsonb
where id = 1;
