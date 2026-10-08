-- =========================================================
--  GELADÃO BROTHERS — parte 9
--  Equipe: DONO pode tudo. FUNCIONÁRIO só o básico:
--  pedidos, novo pedido, caixa (abrir/fechar/sangria/vender),
--  consultar estoque e consultar fiado. Não mexe em estoque,
--  produtos, preços, despesas, cupons nem configurações.
-- =========================================================

create table if not exists staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text,
  role       text not null default 'funcionario' check (role in ('dono','funcionario')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Quem já tem login hoje vira DONO (é você)
insert into staff (user_id, email, name, role)
select id, email, split_part(email, '@', 1), 'dono' from auth.users
on conflict (user_id) do nothing;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active);
$$;

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and active and role = 'dono');
$$;

-- ---------- troca as regras de acesso ----------
do $$ declare t text; begin
  foreach t in array array['store_settings','categories','products','complement_groups',
    'complement_options','product_complements','product_suggestions','delivery_zones',
    'customers','credit_entries','coupons','orders','order_items','stock_movements',
    'cash_sessions','cash_movements','expenses','reviews'] loop
    execute format('drop policy if exists painel_tudo on %I', t);
    execute format('drop policy if exists equipe_ve on %I', t);
    execute format('drop policy if exists dono_tudo on %I', t);
    execute format('drop policy if exists equipe_cria on %I', t);
    execute format('drop policy if exists equipe_altera on %I', t);
    -- todo mundo da equipe pode VER
    execute format('create policy equipe_ve on %I for select to authenticated using (is_staff())', t);
    -- só o dono pode mexer em tudo
    execute format('create policy dono_tudo on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
  end loop;

  -- funcionário pode criar e atualizar pedidos, clientes e o próprio caixa
  foreach t in array array['orders','order_items','customers','cash_sessions'] loop
    execute format('create policy equipe_cria on %I for insert to authenticated with check (is_staff())', t);
    execute format('create policy equipe_altera on %I for update to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;

  -- funcionário pode lançar venda fiado e sangria/suprimento (mas não apagar nem editar)
  foreach t in array array['credit_entries','cash_movements'] loop
    execute format('create policy equipe_cria on %I for insert to authenticated with check (is_staff())', t);
  end loop;
end $$;

-- tabela da equipe
alter table staff enable row level security;
drop policy if exists staff_ve on staff;
drop policy if exists staff_dono on staff;
create policy staff_ve   on staff for select to authenticated using (user_id = auth.uid() or is_owner());
create policy staff_dono on staff for all    to authenticated using (is_owner()) with check (is_owner());

-- fotos: só o dono troca
drop policy if exists fotos_enviar on storage.objects;
create policy fotos_enviar on storage.objects for all to authenticated
  using (bucket_id = 'fotos' and public.is_owner()) with check (bucket_id = 'fotos' and public.is_owner());

-- ---------- abrir/fechar a loja (dono e funcionário) ----------
create or replace function set_store_open(p_open boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  update store_settings set is_open = p_open where id = 1;
  return p_open;
end $$;

-- ---------- dono cadastra funcionário pelo e-mail do login ----------
create or replace function add_staff(p_email text, p_name text, p_role text default 'funcionario')
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not is_owner() then raise exception 'Só o dono pode cadastrar a equipe'; end if;
  if p_role not in ('dono','funcionario') then raise exception 'Função inválida'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then
    raise exception 'Não existe login com o e-mail %. Crie primeiro no Supabase: Authentication → Users → Add user', p_email;
  end if;
  if u = auth.uid() and p_role <> 'dono' then raise exception 'Você não pode tirar o seu próprio acesso de dono'; end if;
  insert into staff (user_id, email, name, role, active)
  values (u, lower(trim(p_email)), nullif(trim(p_name), ''), p_role, true)
  on conflict (user_id) do update set name = coalesce(excluded.name, staff.name), role = excluded.role, active = true;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function set_store_open(boolean) from anon, public;
revoke execute on function add_staff(text, text, text) from anon, public;
grant execute on function set_store_open(boolean) to authenticated;
grant execute on function add_staff(text, text, text) to authenticated;
grant execute on function is_staff() to authenticated;
grant execute on function is_owner() to authenticated;
grant select, insert, update, delete on staff to authenticated;

notify pgrst, 'reload schema';
