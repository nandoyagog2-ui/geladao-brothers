-- =========================================================
--  VYNTRA — parte 25 · DOMÍNIO PRÓPRIO DA LOJA
--  Ex.: pedidos.pizzariadoze.com.br abre direto o cardápio da Pizzaria do Zé.
--  Quem configura é o dono do sistema, no painel /admin.
--  (pode rodar mais de uma vez sem problema)
-- =========================================================
alter table stores add column if not exists custom_domain text;
create unique index if not exists stores_custom_domain on stores (lower(custom_domain)) where custom_domain is not null;

-- aceita o endereço (slug), o número da loja ou "@dominio" (o site manda quando abre por um domínio)
create or replace function resolve_store(p text) returns bigint
language sql stable security definer set search_path = public as $$
  select case when nullif(trim(coalesce(p, '')), '') is null then null
              when trim(p) ~ '^\d+$' then (select id from stores where id = trim(p)::bigint)
              when left(trim(p), 1) = '@' then coalesce(
                (select id from stores where custom_domain is not null
                   and lower(custom_domain) in (lower(substr(trim(p), 2)), regexp_replace(lower(substr(trim(p), 2)), '^www\.', ''))),
                1)   -- domínio principal do sistema (ex.: vyntra.com.br sem nada depois) = loja 1
              else (select id from stores where lower(slug) = lower(trim(p))) end;
$$;

-- o dono do sistema liga/desliga o domínio de uma loja
create or replace function admin_set_domain(p_id bigint, p_domain text) returns text
language plpgsql security definer set search_path = public as $$
declare d text := nullif(regexp_replace(regexp_replace(lower(trim(coalesce(p_domain, ''))), '^https?://', ''), '/.*$', ''), '');
begin
  if not is_platform_admin() then raise exception 'Só o dono do sistema'; end if;
  if d is not null and d !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then raise exception 'Domínio inválido. Ex.: pedidos.sualoja.com.br'; end if;
  if d is not null and exists (select 1 from stores where lower(custom_domain) = d and id <> p_id) then raise exception 'Esse domínio já está em outra loja'; end if;
  update stores set custom_domain = d where id = p_id;
  return d;
end $$;
grant execute on function admin_set_domain(bigint, text) to authenticated;

create or replace function admin_store_domains() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Só o dono do sistema'; end if;
  return coalesce((select jsonb_object_agg(id::text, custom_domain) from stores where custom_domain is not null), '{}'::jsonb);
end $$;
grant execute on function admin_store_domains() to authenticated;

-- o painel da loja usa pra montar o link do cardápio
create or replace function my_store_domain() returns text
language sql stable security definer set search_path = public as $$
  select custom_domain from stores where id = my_store();
$$;
grant execute on function my_store_domain() to authenticated;

notify pgrst, 'reload schema';
