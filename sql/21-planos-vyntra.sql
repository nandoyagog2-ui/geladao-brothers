-- =========================================================
--  VYNTRA — parte 21
--  Valores do plano de cada loja: implantação (R$ 300) e mensalidade (R$ 99,90)
-- =========================================================
alter table stores add column if not exists monthly_fee numeric(10,2) not null default 99.90;
alter table stores add column if not exists setup_fee   numeric(10,2) not null default 300;
alter table stores add column if not exists setup_paid  boolean not null default false;

create or replace function admin_stores() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Só o dono do sistema'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', st.id, 'slug', st.slug, 'name', st.name, 'segment', st.segment, 'active', st.active,
      'paid_until', st.paid_until, 'plan', st.plan, 'owner_name', st.owner_name, 'owner_phone', st.owner_phone,
      'notes', st.notes, 'monthly_fee', st.monthly_fee, 'setup_fee', st.setup_fee, 'setup_paid', st.setup_paid, 'created_at', st.created_at, 'ok', store_ok(st.id),
      'orders30', (select count(*) from orders o where o.store_id = st.id and o.created_at > now() - interval '30 days' and o.status <> 'cancelado'),
      'sales30', (select coalesce(sum(total), 0) from orders o where o.store_id = st.id and o.created_at > now() - interval '30 days' and o.status <> 'cancelado'),
      'last_order', (select max(created_at) from orders o where o.store_id = st.id),
      'products', (select count(*) from products p where p.store_id = st.id),
      'logins', (select coalesce(jsonb_agg(jsonb_build_object('name', s.name, 'username', s.username, 'role', s.role, 'active', s.active)), '[]') from staff s where s.store_id = st.id)
    ) order by st.id) from stores st), '[]'::jsonb);
end $$;

create or replace function admin_create_store(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
declare v bigint; v_slug text := lower(regexp_replace(translate(lower(trim(coalesce(p->>'slug', p->>'name'))), 'áàâãäéèêëíìîïóòôõöúùûüç ', 'aaaaaeeeeiiiiooooouuuuc-'), '[^a-z0-9-]', '', 'g'));
begin
  if not is_platform_admin() then raise exception 'Só o dono do sistema'; end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Informe o nome da loja'; end if;
  if v_slug = '' then raise exception 'Informe o endereço da loja'; end if;
  if v_slug in ('painel','admin','js','css','img','impressora','api','loja','lojas','index') then raise exception 'Esse endereço é reservado, escolha outro'; end if;
  if exists (select 1 from stores where slug = v_slug) then raise exception 'Já existe uma loja com o endereço "%"', v_slug; end if;
  insert into stores (slug, name, segment, paid_until, plan, owner_name, owner_phone, notes, monthly_fee, setup_fee, setup_paid)
  values (v_slug, trim(p->>'name'), coalesce(nullif(p->>'segment', ''), 'bebidas'), nullif(p->>'paid_until', '')::date,
          nullif(p->>'plan', ''), nullif(p->>'owner_name', ''), nullif(p->>'owner_phone', ''), nullif(p->>'notes', ''),
          coalesce(nullif(p->>'monthly_fee', '')::numeric, 99.90), coalesce(nullif(p->>'setup_fee', '')::numeric, 300), coalesce((p->>'setup_paid')::boolean, false))
  returning id into v;
  insert into store_settings (id, name, whatsapp, is_open) values (v, trim(p->>'name'), nullif(p->>'owner_phone', ''), false);
  if coalesce(p->>'owner_user', '') <> '' then
    perform make_login(v, p->>'owner_user', coalesce(nullif(p->>'owner_name', ''), 'Dono'), p->>'owner_pass', 'dono');
  end if;
  return jsonb_build_object('id', v, 'slug', v_slug, 'login', case when coalesce(p->>'owner_user', '') <> '' then staff_login(p->>'owner_user') end);
end $$;

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
    notes      = case when p ? 'notes' then nullif(p->>'notes', '') else notes end,
    monthly_fee= case when p ? 'monthly_fee' then coalesce(nullif(p->>'monthly_fee', '')::numeric, monthly_fee) else monthly_fee end,
    setup_fee  = case when p ? 'setup_fee' then coalesce(nullif(p->>'setup_fee', '')::numeric, setup_fee) else setup_fee end,
    setup_paid = coalesce((p->>'setup_paid')::boolean, setup_paid)
  where id = v;
  return jsonb_build_object('ok', true);
end $$;

notify pgrst, 'reload schema';
