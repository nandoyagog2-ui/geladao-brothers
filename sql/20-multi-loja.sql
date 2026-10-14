-- =========================================================
--  GELADÃO BROTHERS — parte 20 · MULTI-LOJA
--  O mesmo sistema atende várias lojas, cada uma com os seus dados.
--  A loja que já existe vira a "loja 1" e continua funcionando igual.
--  Pode rodar mais de uma vez sem problema.
-- =========================================================

-- ---------- 1) LOJAS ----------
create table if not exists stores (
  id          bigserial primary key,
  slug        text not null unique,                 -- endereço do cardápio: site.com/slug
  name        text not null,
  segment     text default 'bebidas',               -- bebidas, pizzaria, lanchonete, restaurante, marmitaria...
  active      boolean not null default true,        -- false = loja bloqueada (não abre cardápio nem painel)
  paid_until  date,                                 -- mensalidade paga até (vazio = sem controle)
  plan        text,
  owner_name  text,
  owner_phone text,
  notes       text,
  created_at  timestamptz not null default now()
);
insert into stores (id, slug, name)
select s.id, 'loja' || s.id, coalesce(nullif(s.name, ''), 'Loja ' || s.id) from store_settings s
on conflict (id) do nothing;
insert into stores (id, slug, name) values (1, 'loja1', 'Minha loja') on conflict (id) do nothing;
select setval('stores_id_seq', greatest((select max(id) from stores), 1));

create table if not exists platform_admins (user_id uuid primary key, created_at timestamptz default now());
alter table stores enable row level security;
alter table platform_admins enable row level security;

-- ---------- 2) COLUNA store_id EM TODAS AS TABELAS ----------
do $$ declare t text; begin
  foreach t in array array['categories','products','complement_groups','complement_options','product_complements',
    'product_suggestions','delivery_zones','customers','credit_entries','coupons','orders','order_items',
    'stock_movements','cash_sessions','cash_movements','expenses','reviews','couriers','wa_outbox','staff',
    'returns','inventories','product_lots'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I add column if not exists store_id bigint default 1', t);
      execute format('update %I set store_id = 1 where store_id is null', t);
      execute format('alter table %I alter column store_id set not null', t);
      begin
        execute format('alter table %I add constraint %I foreign key (store_id) references stores(id) on delete cascade', t, t || '_store_fk');
      exception when duplicate_object then null; end;
      execute format('create index if not exists %I on %I (store_id)', t || '_store_idx', t);
    end if;
  end loop;
end $$;

-- ---------- 3) FUNÇÕES BÁSICAS ----------
-- loja de quem está usando: do login da equipe, ou a que a função do cardápio escolheu
create or replace function my_store() returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce((select store_id from staff where user_id = auth.uid()),
                  nullif(current_setting('app.store', true), '')::bigint);
$$;
-- aceita o endereço (slug) ou o número da loja
create or replace function resolve_store(p text) returns bigint
language sql stable security definer set search_path = public as $$
  select case when nullif(trim(coalesce(p, '')), '') is null then null
              when trim(p) ~ '^\d+$' then (select id from stores where id = trim(p)::bigint)
              else (select id from stores where lower(slug) = lower(trim(p))) end;
$$;
create or replace function store_ok(p bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from stores where id = p and active and (paid_until is null or paid_until >= current_date - 5));
$$;
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;
grant execute on function my_store() to anon, authenticated;
grant execute on function resolve_store(text) to anon, authenticated;
grant execute on function store_ok(bigint) to anon, authenticated;
grant execute on function is_platform_admin() to authenticated;

-- daqui pra frente, o que for criado já vai pra loja de quem está usando
do $$ declare t text; begin
  foreach t in array array['categories','products','complement_groups','complement_options','product_complements',
    'product_suggestions','delivery_zones','customers','credit_entries','coupons','orders','order_items',
    'stock_movements','cash_sessions','cash_movements','expenses','reviews','couriers','wa_outbox','staff',
    'returns','inventories','product_lots'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I alter column store_id set default my_store()', t);
    end if;
  end loop;
end $$;

-- configurações: uma linha por loja (o id da linha = id da loja)
alter table store_settings drop constraint if exists store_settings_id_check;
alter table store_settings alter column id drop default;
do $$ begin
  alter table store_settings add constraint store_settings_store_fk foreign key (id) references stores(id) on delete cascade;
exception when duplicate_object then null; end $$;

-- únicos por loja
alter table customers drop constraint if exists customers_phone_key;
drop index if exists customers_phone_key;
create unique index if not exists customers_store_phone on customers (store_id, phone);
alter table coupons drop constraint if exists coupons_code_key;
drop index if exists coupons_code_key;
create unique index if not exists coupons_store_code on coupons (store_id, upper(code));
drop index if exists um_caixa_aberto;
create unique index if not exists um_caixa_aberto_loja on cash_sessions (store_id) where closed_at is null;

-- número do pedido: cada loja tem a sua sequência (#1, #2, #3…)
create or replace function order_number_per_store() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform pg_advisory_xact_lock(424242, new.store_id::int);
  select coalesce(max(number), 0) + 1 into new.number from orders where store_id = new.store_id;
  return new;
end $$;
drop trigger if exists orders_number_store on orders;
create trigger orders_number_store before insert on orders for each row execute function order_number_per_store();

-- ---------- 4) QUEM É DA EQUIPE (agora por loja) ----------
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff s where s.user_id = auth.uid() and s.active and store_ok(s.store_id) and (
      s.role = 'dono'
      or staff_in_shift(s.schedule)
      or exists (select 1 from cash_sessions c where c.closed_at is null and c.user_id = s.user_id)));
$$;
create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active and role = 'dono' and store_ok(store_id));
$$;
create or replace function my_access() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s staff; st stores;
begin
  select * into s from staff where user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'sem_cadastro', 'admin', is_platform_admin()); end if;
  select * into st from stores where id = s.store_id;
  if not store_ok(s.store_id) then return jsonb_build_object('ok', false, 'reason', 'loja_bloqueada', 'name', s.name, 'store', st.name); end if;
  if not s.active then return jsonb_build_object('ok', false, 'reason', 'bloqueado', 'name', s.name); end if;
  if not is_staff() then return jsonb_build_object('ok', false, 'reason', 'fora_horario', 'name', s.name, 'schedule', s.schedule); end if;
  return jsonb_build_object('ok', true, 'role', s.role, 'name', coalesce(s.name, s.username), 'schedule', s.schedule,
                            'store_id', s.store_id, 'store_slug', st.slug, 'admin', is_platform_admin());
end $$;

-- ---------- 5) REGRAS DE ACESSO: cada loja só vê o que é dela ----------
do $$ declare t text; pol record; begin
  foreach t in array array['categories','products','complement_groups','complement_options','product_complements',
    'product_suggestions','delivery_zones','customers','credit_entries','coupons','orders','order_items',
    'stock_movements','cash_sessions','cash_movements','expenses','reviews','couriers','wa_outbox',
    'returns','inventories','product_lots'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t and policyname <> 'cardapio_ve' loop
      execute format('drop policy %I on %I', pol.policyname, t);
    end loop;
    execute format('create policy dono_tudo on %I for all to authenticated using ((select is_owner()) and store_id = (select my_store())) with check ((select is_owner()) and store_id = (select my_store()))', t);
    if t <> 'expenses' then
      execute format('create policy equipe_ve on %I for select to authenticated using ((select is_staff()) and store_id = (select my_store()))', t);
    end if;
    if t = any (array['orders','order_items','customers','cash_sessions','wa_outbox']) then
      execute format('create policy equipe_altera on %I for update to authenticated using ((select is_staff()) and store_id = (select my_store())) with check ((select is_staff()) and store_id = (select my_store()))', t);
    end if;
    if t = any (array['orders','order_items','customers','cash_sessions','credit_entries','cash_movements','wa_outbox']) then
      execute format('create policy equipe_cria on %I for insert to authenticated with check ((select is_staff()) and store_id = (select my_store()))', t);
    end if;
    if t = 'product_lots' then
      execute 'create policy equipe_cria on product_lots for insert to authenticated with check ((select staff_can(''inventario'')) and store_id = (select my_store()))';
      execute 'create policy equipe_altera on product_lots for update to authenticated using ((select staff_can(''inventario'')) and store_id = (select my_store())) with check ((select staff_can(''inventario'')) and store_id = (select my_store()))';
    end if;
  end loop;
end $$;

-- configurações da loja
drop policy if exists equipe_ve on store_settings;
drop policy if exists dono_tudo on store_settings;
create policy equipe_ve on store_settings for select to authenticated using ((select is_staff()) and id = (select my_store()));
create policy dono_tudo on store_settings for all to authenticated using ((select is_owner()) and id = (select my_store())) with check ((select is_owner()) and id = (select my_store()));

-- equipe
drop policy if exists staff_ve on staff;
drop policy if exists staff_dono on staff;
create policy staff_ve on staff for select to authenticated using (user_id = auth.uid() or ((select is_owner()) and store_id = (select my_store())));
create policy staff_dono on staff for all to authenticated using ((select is_owner()) and store_id = (select my_store())) with check ((select is_owner()) and store_id = (select my_store()));

-- lojas: cada um vê a sua; o dono do sistema vê todas
drop policy if exists loja_ve on stores;
create policy loja_ve on stores for select to authenticated using (id = (select my_store()) or (select is_platform_admin()));
grant select on stores to authenticated;

-- saldo do fiado respeita as regras da loja
alter view customer_balances set (security_invoker = true);

-- ---------- 6) FUNÇÕES COM LOJA ----------
create or replace function set_store_open(p_open boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  update store_settings set is_open = p_open where id = my_store();
  return p_open;
end $$;

create or replace function wa_heartbeat() returns timestamptz
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  update store_settings set wa_seen_at = now() where id = my_store();
  return now();
end $$;

create or replace function give_loyalty_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare s store_settings;
begin
  select * into s from store_settings where id = new.store_id;
  if s.loyalty_enabled and new.status = 'concluido' and old.status <> 'concluido' and new.customer_id is not null then
    update customers set loyalty_points = loyalty_points + floor(new.subtotal * s.loyalty_points_per_real) where id = new.customer_id;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function return_stock_on_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  if new.status = 'cancelado' and old.status is distinct from 'cancelado' then
    for m in select product_id, sum(qty) as qty from stock_movements where order_id = new.id and kind = 'venda' group by product_id loop
      update products set stock_qty = stock_qty - m.qty where id = m.product_id;
      insert into stock_movements (store_id, product_id, kind, qty, description, order_id)
      values (new.store_id, m.product_id, 'ajuste', -m.qty, 'Pedido #' || new.number || ' cancelado', new.id);
    end loop;
  end if;
  return new;
end $$;

drop function if exists check_coupon(text, numeric);
create or replace function check_coupon(p_code text, p_subtotal numeric, p_loja text default null) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('valid', true, 'kind', kind, 'value', value)
    from coupons where store_id = (case when nullif(trim(coalesce(p_loja, '')), '') is null then 1 else resolve_store(p_loja) end) and upper(code) = upper(p_code) and active
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses < max_uses) and p_subtotal >= min_order),
    '{"valid": false}'::jsonb);
$$;
grant execute on function check_coupon(text, numeric, text) to anon, authenticated;

create or replace function submit_review(p_id bigint, p_phone text, p_rating int, p_comment text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  select * into o from orders where id = p_id
    and regexp_replace(coalesce(customer_phone,''), '\D', '', 'g') = regexp_replace(coalesce(p_phone,''), '\D', '', 'g');
  if o.id is null then raise exception 'Pedido não encontrado'; end if;
  if p_rating < 1 or p_rating > 5 then raise exception 'Nota inválida'; end if;
  insert into reviews (store_id, order_id, customer_id, customer_name, rating, comment)
  values (o.store_id, o.id, o.customer_id, o.customer_name, p_rating, nullif(left(trim(coalesce(p_comment,'')), 500), ''))
  on conflict (order_id) do update set rating = excluded.rating, comment = excluded.comment, created_at = now();
  return jsonb_build_object('ok', true);
end $$;

create or replace function backfill_costs() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_owner() then raise exception 'Só o dono'; end if;
  update order_items i set unit_cost = product_unit_cost(i.product_id)
   where i.store_id = my_store() and i.unit_cost is null and i.product_id is not null and product_unit_cost(i.product_id) is not null;
  get diagnostics n = row_count; return n;
end $$;

-- cardápio de uma loja (pelo endereço). Sem loja = loja 1.
drop function if exists get_menu();
create or replace function get_menu(p_loja text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v bigint := case when nullif(trim(coalesce(p_loja, '')), '') is null then 1 else resolve_store(p_loja) end; st stores;
begin
  select * into st from stores where id = v;
  if st.id is null then return jsonb_build_object('erro', 'loja_nao_encontrada'); end if;
  if not store_ok(v) then return jsonb_build_object('erro', 'loja_bloqueada', 'nome', st.name); end if;
  return jsonb_build_object(
    'loja', jsonb_build_object('id', st.id, 'slug', st.slug, 'segment', st.segment),
    's',  (select to_jsonb(s) - 'bot' - 'wa_seen_at' - 'payment_fees' - 'monthly_goal' from store_settings s where id = v),
    'c',  coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order, c.name) from categories c where c.active and c.store_id = v), '[]'::jsonb),
    'p',  coalesce((select jsonb_agg(jsonb_build_object(
             'id', p.id, 'category_id', p.category_id, 'name', p.name, 'description', p.description,
             'price', p.price, 'promo_price', p.promo_price, 'image_url', p.image_url, 'status', p.status,
             'is_combo', p.is_combo, 'featured', p.featured, 'is_new', p.is_new, 'sort_order', p.sort_order,
             'price_tiers', p.price_tiers) order by p.sort_order, p.name)
           from products p where p.status <> 'inativo' and p.store_id = v), '[]'::jsonb),
    'g',  coalesce((select jsonb_agg(to_jsonb(g)) from complement_groups g where g.active and g.store_id = v), '[]'::jsonb),
    'o',  coalesce((select jsonb_agg(to_jsonb(o) order by o.sort_order) from complement_options o where o.active and o.store_id = v), '[]'::jsonb),
    'pc', coalesce((select jsonb_agg(to_jsonb(x) order by x.sort_order) from product_complements x where x.store_id = v), '[]'::jsonb),
    'z',  coalesce((select jsonb_agg(to_jsonb(z) order by z.neighborhood) from delivery_zones z where z.active and z.store_id = v), '[]'::jsonb),
    'ps', coalesce((select jsonb_agg(to_jsonb(x)) from product_suggestions x where x.store_id = v), '[]'::jsonb));
end $$;
grant execute on function get_menu(text) to anon, authenticated;

-- logins da equipe (o dono cria na loja dele)
create or replace function make_login(p_store bigint, p_username text, p_name text, p_password text, p_role text) returns uuid
language plpgsql security definer set search_path = public, extensions, auth as $$
declare u uuid; em text := staff_email(p_username); usr text := case when position('@' in p_username) > 0 then lower(trim(p_username)) else staff_login(p_username) end; other bigint;
begin
  if coalesce(staff_login(p_username), '') = '' then raise exception 'Informe o usuário (ex.: joao)'; end if;
  if p_role not in ('dono','funcionario') then raise exception 'Função inválida'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'A senha precisa ter pelo menos 4 caracteres'; end if;
  select id into u from auth.users where lower(email) = em;
  if u is not null then
    select store_id into other from staff where user_id = u;
    if other is not null and other <> p_store then raise exception 'O usuário "%" já existe em outra loja. Escolha outro nome (ex.: %2)', usr, usr; end if;
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = u;
  else
    u := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', em, crypt(p_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', p_name), now(), now(), '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u::text, u, jsonb_build_object('sub', u::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  end if;
  insert into staff (store_id, user_id, email, name, role, active, username)
  values (p_store, u, em, nullif(trim(p_name), ''), p_role, true, case when position('@' in usr) > 0 then null else usr end)
  on conflict (user_id) do update set name = coalesce(excluded.name, staff.name), role = excluded.role, active = true,
    username = coalesce(excluded.username, staff.username);
  return u;
end $$;
revoke execute on function make_login(bigint, text, text, text, text) from anon, public, authenticated;

create or replace function create_staff_user(p_username text, p_name text, p_password text, p_role text default 'funcionario') returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare u uuid;
begin
  if not is_owner() then raise exception 'Só o dono pode criar logins da equipe'; end if;
  select id into u from auth.users where lower(email) = staff_email(p_username);
  if u = auth.uid() and p_role <> 'dono' then raise exception 'Você não pode tirar o seu próprio acesso de dono'; end if;
  perform make_login(my_store(), p_username, p_name, p_password, p_role);
  return jsonb_build_object('ok', true, 'email', staff_email(p_username));
end $$;
revoke execute on function create_staff_user(text, text, text, text) from anon, public;
grant execute on function create_staff_user(text, text, text, text) to authenticated;

create or replace function set_staff_password(p_user uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not is_owner() then raise exception 'Só o dono pode trocar senhas'; end if;
  if not exists (select 1 from staff where user_id = p_user and store_id = my_store()) then raise exception 'Login não encontrado nesta loja'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'A senha precisa ter pelo menos 4 caracteres'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  return jsonb_build_object('ok', true);
end $$;

create or replace function add_staff(p_email text, p_name text, p_role text default 'funcionario') returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid; other bigint;
begin
  if not is_owner() then raise exception 'Só o dono pode cadastrar a equipe'; end if;
  if p_role not in ('dono','funcionario') then raise exception 'Função inválida'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Não existe login com o e-mail %', p_email; end if;
  select store_id into other from staff where user_id = u;
  if other is not null and other <> my_store() then raise exception 'Esse login já é de outra loja'; end if;
  insert into staff (store_id, user_id, email, name, role, active) values (my_store(), u, lower(trim(p_email)), nullif(trim(p_name), ''), p_role, true)
  on conflict (user_id) do update set name = coalesce(excluded.name, staff.name), role = excluded.role, active = true;
  return jsonb_build_object('ok', true);
end $$;

-- troca/devolução e inventário: só mexem na loja de quem está usando
create or replace function register_return(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o orders; it jsonb; oi order_items; prod products; sprod products;
  v_qty numeric; v_done numeric; v_factor numeric; v_amt numeric; v_total numeric := 0;
  v_items jsonb := '[]'; v_units numeric; v_sess bigint; v_ret returns; v_method text; v_restock boolean;
begin
  if not staff_can('devolucao') then raise exception 'Você não tem permissão pra fazer troca/devolução'; end if;
  select * into o from orders where id = (p->>'order_id')::bigint and store_id = my_store();
  if o.id is null then raise exception 'Pedido não encontrado'; end if;
  if o.status = 'cancelado' then raise exception 'Esse pedido foi cancelado: não tem o que devolver'; end if;
  v_method := coalesce(p->>'refund_method', 'dinheiro');
  v_restock := coalesce((p->>'restock')::boolean, true);
  v_factor := case when coalesce(o.subtotal, 0) > 0 then greatest(0, least(1, (o.subtotal - coalesce(o.discount, 0)) / o.subtotal)) else 1 end;
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]')) loop
    v_qty := coalesce((it->>'qty')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    select * into oi from order_items where id = (it->>'order_item_id')::bigint and order_id = o.id;
    if oi.id is null then raise exception 'Item não é desse pedido'; end if;
    select coalesce(sum((x->>'qty')::numeric), 0) into v_done from returns r, jsonb_array_elements(r.items) x
      where r.order_id = o.id and (x->>'order_item_id')::bigint = oi.id;
    if v_qty > oi.qty - v_done then raise exception 'Do item "%" só dá pra devolver %', oi.name, (oi.qty - v_done); end if;
    v_amt := round(oi.unit_price * v_qty * v_factor, 2);
    v_total := v_total + v_amt;
    v_items := v_items || jsonb_build_object('order_item_id', oi.id, 'product_id', oi.product_id, 'name', oi.name,
                 'qty', v_qty, 'unit_price', oi.unit_price, 'amount', v_amt, 'unit_cost', oi.unit_cost);
    if v_restock and oi.product_id is not null then
      select * into prod from products where id = oi.product_id and store_id = o.store_id;
      if prod.id is not null then
        select * into sprod from products where id = coalesce(prod.stock_parent_id, prod.id);
        v_units := v_qty * case when prod.stock_parent_id is not null then coalesce(prod.stock_factor, 1) else 1 end;
        if sprod.track_stock then
          update products set stock_qty = stock_qty + v_units where id = sprod.id;
          insert into stock_movements (store_id, product_id, kind, qty, description, order_id)
          values (o.store_id, sprod.id, 'entrada', v_units, 'Devolução do pedido #' || o.number ||
                  case when sprod.id <> prod.id then ' · ' || v_qty || 'x ' || prod.name else '' end, o.id);
        end if;
      end if;
    end if;
  end loop;
  if jsonb_array_length(v_items) = 0 then raise exception 'Escolha pelo menos um item pra devolver'; end if;
  select id into v_sess from cash_sessions where store_id = o.store_id and closed_at is null and user_id = auth.uid() order by opened_at desc limit 1;
  if v_sess is null then select id into v_sess from cash_sessions where store_id = o.store_id and closed_at is null order by opened_at desc limit 1; end if;
  if v_method = 'dinheiro' and v_sess is null then raise exception 'Abra o caixa pra devolver em dinheiro'; end if;
  insert into returns (store_id, order_id, order_number, items, amount, refund_method, reason, restock, cash_session_id, customer_id, created_by_name)
  values (o.store_id, o.id, o.number, v_items, v_total, v_method, nullif(p->>'reason', ''), v_restock, v_sess, o.customer_id, my_name())
  returning * into v_ret;
  if v_method = 'dinheiro' then
    insert into cash_movements (store_id, session_id, kind, amount, payment_method, description, order_id)
    values (o.store_id, v_sess, 'saida', v_total, 'Dinheiro', 'Devolução do pedido #' || o.number, o.id);
  elsif v_method = 'fiado' then
    if o.customer_id is null then raise exception 'Esse pedido não tem cliente cadastrado pra abater no fiado'; end if;
    insert into credit_entries (store_id, customer_id, kind, amount, description, order_id)
    values (o.store_id, o.customer_id, 'pagamento', v_total, 'Devolução do pedido #' || o.number, o.id);
  end if;
  return jsonb_build_object('id', v_ret.id, 'amount', v_total, 'number', o.number);
end $$;

create or replace function apply_inventory(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it jsonb; prod products; v_cnt numeric; v_diff numeric; v_items jsonb := '[]'; v_val numeric := 0; v_inv inventories; v_cost numeric;
begin
  if not staff_can('inventario') then raise exception 'Você não tem permissão pra fazer inventário'; end if;
  insert into inventories (store_id, notes, created_by_name) values (my_store(), nullif(p->>'notes', ''), my_name()) returning * into v_inv;
  for it in select * from jsonb_array_elements(coalesce(p->'items', '[]')) loop
    if it->>'counted' is null or it->>'counted' = '' then continue; end if;
    select * into prod from products where id = (it->>'product_id')::bigint and store_id = my_store();
    if prod.id is null then continue; end if;
    v_cnt := (it->>'counted')::numeric;
    v_diff := v_cnt - coalesce(prod.stock_qty, 0);
    v_cost := coalesce(prod.cost_price, 0);
    v_items := v_items || jsonb_build_object('product_id', prod.id, 'name', prod.name, 'before', coalesce(prod.stock_qty, 0),
                 'counted', v_cnt, 'diff', v_diff, 'unit_cost', v_cost);
    v_val := v_val + v_diff * v_cost;
    if v_diff <> 0 then
      update products set stock_qty = v_cnt, track_stock = true where id = prod.id;
      insert into stock_movements (store_id, product_id, kind, qty, description) values (my_store(), prod.id, 'ajuste', v_diff, 'Inventário #' || v_inv.id);
    end if;
  end loop;
  update inventories set items = v_items, diff_value = round(v_val, 2) where id = v_inv.id;
  return jsonb_build_object('id', v_inv.id, 'items', jsonb_array_length(v_items), 'diff_value', round(v_val, 2));
end $$;

-- ---------- 7) PEDIDO (cardápio e painel) ----------
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
  v_store bigint; v_auth boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'authenticated';
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
    v_opts := '[]';
    for op in select * from jsonb_array_elements(coalesce(it->'options','[]')) loop
      select * into opt from complement_options where id = (op->>'option_id')::bigint and active and store_id = v_store;
      if opt.id is not null then
        v_unit := v_unit + opt.price * greatest(1, coalesce((op->>'qty')::int,1));
        v_opts := v_opts || jsonb_build_object('name', opt.name, 'qty', coalesce((op->>'qty')::int,1), 'price', opt.price);
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

-- ---------- 8) DONO DO SISTEMA (você): criar e controlar as lojas ----------
-- o primeiro que abrir a tela /admin e tocar em "Sou o dono do sistema" vira o administrador (só funciona uma vez)
create or replace function claim_platform_admin() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre com o seu login primeiro'; end if;
  if exists (select 1 from platform_admins) then return is_platform_admin(); end if;
  insert into platform_admins (user_id) values (auth.uid());
  return true;
end $$;
grant execute on function claim_platform_admin() to authenticated;

create or replace function admin_stores() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Só o dono do sistema'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', st.id, 'slug', st.slug, 'name', st.name, 'segment', st.segment, 'active', st.active,
      'paid_until', st.paid_until, 'plan', st.plan, 'owner_name', st.owner_name, 'owner_phone', st.owner_phone,
      'notes', st.notes, 'created_at', st.created_at, 'ok', store_ok(st.id),
      'orders30', (select count(*) from orders o where o.store_id = st.id and o.created_at > now() - interval '30 days' and o.status <> 'cancelado'),
      'sales30', (select coalesce(sum(total), 0) from orders o where o.store_id = st.id and o.created_at > now() - interval '30 days' and o.status <> 'cancelado'),
      'last_order', (select max(created_at) from orders o where o.store_id = st.id),
      'products', (select count(*) from products p where p.store_id = st.id),
      'logins', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'username', s.username, 'role', s.role, 'active', s.active)), '[]') from staff s where s.store_id = st.id)
    ) order by st.id) from stores st), '[]'::jsonb);
end $$;
grant execute on function admin_stores() to authenticated;

create or replace function admin_create_store(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v bigint; v_slug text := lower(regexp_replace(translate(lower(trim(coalesce(p->>'slug', p->>'name'))), 'áàâãäéèêëíìîïóòôõöúùûüç ', 'aaaaaeeeeiiiiooooouuuuc-'), '[^a-z0-9-]', '', 'g'));
begin
  if not is_platform_admin() then raise exception 'Só o dono do sistema'; end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Informe o nome da loja'; end if;
  if v_slug = '' then raise exception 'Informe o endereço da loja'; end if;
  if v_slug in ('painel','admin','js','css','img','impressora','api','loja','lojas','index') then raise exception 'Esse endereço é reservado, escolha outro'; end if;
  if exists (select 1 from stores where slug = v_slug) then raise exception 'Já existe uma loja com o endereço "%"', v_slug; end if;
  insert into stores (slug, name, segment, paid_until, plan, owner_name, owner_phone, notes)
  values (v_slug, trim(p->>'name'), coalesce(nullif(p->>'segment', ''), 'bebidas'), nullif(p->>'paid_until', '')::date,
          nullif(p->>'plan', ''), nullif(p->>'owner_name', ''), nullif(p->>'owner_phone', ''), nullif(p->>'notes', ''))
  returning id into v;
  insert into store_settings (id, name, whatsapp, is_open) values (v, trim(p->>'name'), nullif(p->>'owner_phone', ''), false);
  if coalesce(p->>'owner_user', '') <> '' then
    perform make_login(v, p->>'owner_user', coalesce(nullif(p->>'owner_name', ''), 'Dono'), p->>'owner_pass', 'dono');
  end if;
  return jsonb_build_object('id', v, 'slug', v_slug, 'login', case when coalesce(p->>'owner_user', '') <> '' then staff_login(p->>'owner_user') end);
end $$;
grant execute on function admin_create_store(jsonb) to authenticated;

create or replace function admin_update_store(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v bigint := (p->>'id')::bigint;
begin
  if not is_platform_admin() then raise exception 'Só o dono do sistema'; end if;
  if p ? 'slug' and exists (select 1 from stores where slug = lower(p->>'slug') and id <> v) then raise exception 'Esse endereço já é de outra loja'; end if;
  if lower(coalesce(p->>'slug', '')) in ('painel','admin','js','css','img','impressora','api','loja','lojas','index') then raise exception 'Esse endereço é reservado, escolha outro'; end if;
  update stores set
    name       = coalesce(nullif(p->>'name', ''), name),
    slug       = coalesce(nullif(lower(p->>'slug'), ''), slug),
    segment    = coalesce(nullif(p->>'segment', ''), segment),
    active     = coalesce((p->>'active')::boolean, active),
    paid_until = case when p ? 'paid_until' then nullif(p->>'paid_until', '')::date else paid_until end,
    plan       = case when p ? 'plan' then nullif(p->>'plan', '') else plan end,
    owner_name = case when p ? 'owner_name' then nullif(p->>'owner_name', '') else owner_name end,
    owner_phone= case when p ? 'owner_phone' then nullif(p->>'owner_phone', '') else owner_phone end,
    notes      = case when p ? 'notes' then nullif(p->>'notes', '') else notes end
  where id = v;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function admin_update_store(jsonb) to authenticated;

-- dono do sistema cria/troca o login do dono de uma loja
create or replace function admin_store_login(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not is_platform_admin() then raise exception 'Só o dono do sistema'; end if;
  perform make_login((p->>'store_id')::bigint, p->>'username', coalesce(nullif(p->>'name', ''), 'Dono'), p->>'password', coalesce(nullif(p->>'role', ''), 'dono'));
  return jsonb_build_object('ok', true, 'login', staff_login(p->>'username'));
end $$;
grant execute on function admin_store_login(jsonb) to authenticated;

notify pgrst, 'reload schema';
