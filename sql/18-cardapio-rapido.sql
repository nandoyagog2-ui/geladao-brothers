-- =========================================================
--  GELADÃO BROTHERS — parte 18
--  Cardápio mais rápido: tudo que o cardápio precisa em UM pedido só
-- =========================================================
create or replace function get_menu() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    's',  (select to_jsonb(s) - 'bot' - 'wa_seen_at' - 'payment_fees' - 'monthly_goal' from store_settings s where id = 1),
    'c',  coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order, c.name) from categories c where c.active), '[]'::jsonb),
    'p',  coalesce((select jsonb_agg(jsonb_build_object(
             'id', p.id, 'category_id', p.category_id, 'name', p.name, 'description', p.description,
             'price', p.price, 'promo_price', p.promo_price, 'image_url', p.image_url, 'status', p.status,
             'is_combo', p.is_combo, 'featured', p.featured, 'is_new', p.is_new, 'sort_order', p.sort_order,
             'price_tiers', p.price_tiers) order by p.sort_order, p.name)
           from products p where p.status <> 'inativo'), '[]'::jsonb),
    'g',  coalesce((select jsonb_agg(to_jsonb(g)) from complement_groups g where g.active), '[]'::jsonb),
    'o',  coalesce((select jsonb_agg(to_jsonb(o) order by o.sort_order) from complement_options o where o.active), '[]'::jsonb),
    'pc', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from product_complements x), '[]'::jsonb),
    'z',  coalesce((select jsonb_agg(to_jsonb(z) order by z.neighborhood) from delivery_zones z where z.active), '[]'::jsonb),
    'ps', coalesce((select jsonb_agg(to_jsonb(x)) from product_suggestions x), '[]'::jsonb)
  );
$$;
grant execute on function get_menu() to anon, authenticated;
notify pgrst, 'reload schema';
