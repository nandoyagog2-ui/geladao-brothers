-- =========================================================
--  GELADÃO BROTHERS — parte 11
--  O dono cria o login e a senha dos funcionários direto no painel
--  (João, Vera...). Cada um abre e fecha o SEU caixa.
--  Precisa da parte 9 rodada antes.
-- =========================================================
create extension if not exists pgcrypto with schema extensions;

alter table staff add column if not exists username text;
create unique index if not exists staff_username_un on staff (lower(username));

-- de quem é cada caixa
alter table cash_sessions add column if not exists user_id uuid default auth.uid();

-- usuário simples (ex.: "João" → "joao") vira um e-mail interno pro login
create or replace function staff_login(p_user text) returns text
language sql immutable as $$
  select regexp_replace(translate(lower(trim(p_user)), 'áàâãäéèêëíìîïóòôõöúùûüç ', 'aaaaaeeeeiiiiooooouuuuc.'), '[^a-z0-9._-]', '', 'g');
$$;
create or replace function staff_email(p_user text) returns text
language sql immutable as $$
  select case when position('@' in p_user) > 0 then lower(trim(p_user))
              else staff_login(p_user) || '@equipe.geladao.app' end;
$$;

-- ---------- dono cria (ou atualiza) o login do funcionário ----------
create or replace function create_staff_user(p_username text, p_name text, p_password text, p_role text default 'funcionario')
returns jsonb language plpgsql security definer set search_path = public, extensions, auth as $$
declare u uuid; em text := staff_email(p_username); usr text := case when position('@' in p_username) > 0 then lower(trim(p_username)) else staff_login(p_username) end;
begin
  if not is_owner() then raise exception 'Só o dono pode criar logins da equipe'; end if;
  if coalesce(staff_login(p_username), '') = '' then raise exception 'Informe o usuário (ex.: joao)'; end if;
  if p_role not in ('dono','funcionario') then raise exception 'Função inválida'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'A senha precisa ter pelo menos 4 caracteres'; end if;

  select id into u from auth.users where lower(email) = em;
  if u is null then
    u := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', em,
      crypt(p_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('name', p_name), now(), now(),
      '', '', '', '');
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u::text, u, jsonb_build_object('sub', u::text, 'email', em, 'email_verified', true),
      'email', now(), now(), now());
  else
    if u = auth.uid() and p_role <> 'dono' then raise exception 'Você não pode tirar o seu próprio acesso de dono'; end if;
    update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = u;
  end if;

  insert into staff (user_id, email, name, role, active, username)
  values (u, em, nullif(trim(p_name), ''), p_role, true, case when position('@' in usr) > 0 then null else usr end)
  on conflict (user_id) do update set name = coalesce(excluded.name, staff.name), role = excluded.role, active = true,
    username = coalesce(excluded.username, staff.username);
  return jsonb_build_object('ok', true, 'email', em);
end $$;

-- ---------- dono troca a senha de alguém ----------
create or replace function set_staff_password(p_user uuid, p_password text) returns jsonb
language plpgsql security definer set search_path = public, extensions, auth as $$
begin
  if not is_owner() then raise exception 'Só o dono pode trocar senhas'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'A senha precisa ter pelo menos 4 caracteres'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  if not found then raise exception 'Login não encontrado'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- só pode ter UM caixa aberto por vez (evita caixa duplicado)
do $$ begin
  create unique index if not exists um_caixa_aberto on cash_sessions ((true)) where closed_at is null;
exception when others then raise notice 'Tem mais de um caixa aberto agora; feche os antigos no painel.';
end $$;

revoke execute on function create_staff_user(text, text, text, text) from anon, public;
revoke execute on function set_staff_password(uuid, text) from anon, public;
grant execute on function create_staff_user(text, text, text, text) to authenticated;
grant execute on function set_staff_password(uuid, text) to authenticated;

notify pgrst, 'reload schema';
