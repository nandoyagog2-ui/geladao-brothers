-- =========================================================
--  VYNTRA — parte 23 · MESAS E COMANDAS
--  Mesas da loja · comanda aberta por mesa (ou avulsa) · garçom lança pelo celular
--  os itens vão pra tela da cozinha · fecha a conta no caixa com 10% de serviço
--  (pode rodar mais de uma vez sem problema)
-- =========================================================

-- mesas da loja
create table if not exists dining_tables (
  id bigint generated always as identity primary key,
  store_id bigint not null default my_store() references stores(id),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists dining_tables_nome on dining_tables (store_id, lower(name));

-- comandas (uma aberta por mesa, ou avulsa sem mesa)
create table if not exists tabs (
  id bigint generated always as identity primary key,
  store_id bigint not null default my_store() references stores(id),
  table_id bigint references dining_tables(id) on delete set null,
  label text not null,
  customer_name text,
  people int not null default 1,
  status text not null default 'aberta' check (status in ('aberta','fechada','cancelada')),
  opened_at timestamptz not null default now(),
  opened_by text default my_name(),
  closed_at timestamptz,
  closed_by text,
  order_id bigint references orders(id) on delete set null,
  notes text
);
create unique index if not exists tabs_uma_por_mesa on tabs (table_id) where status = 'aberta' and table_id is not null;
create index if not exists tabs_loja_status on tabs (store_id, status);

-- itens lançados na comanda (o preço final é calculado no fechamento)
create table if not exists tab_items (
  id bigint generated always as identity primary key,
  store_id bigint not null default my_store() references stores(id),
  tab_id bigint not null references tabs(id) on delete cascade,
  product_id bigint references products(id) on delete set null,
  name text not null,
  qty int not null default 1 check (qty > 0),
  unit_price numeric(10,2) not null default 0,
  options jsonb not null default '[]',
  notes text,
  created_at timestamptz not null default now(),
  created_by text default my_name(),
  kitchen_at timestamptz,
  canceled boolean not null default false
);
create index if not exists tab_items_tab on tab_items (tab_id);

-- pedido fechado de uma comanda: guarda a mesa e a taxa de serviço
alter table orders add column if not exists tab_id bigint;
alter table orders add column if not exists service_fee numeric(10,2) not null default 0;
-- % de serviço do garçom (padrão 10%; 0 = não cobra)
alter table store_settings add column if not exists service_pct numeric(5,2) not null default 10;

-- regras de acesso: cada loja só vê o que é dela
alter table dining_tables enable row level security;
alter table tabs enable row level security;
alter table tab_items enable row level security;
do $$ declare t text; pol record; begin
  foreach t in array array['dining_tables','tabs','tab_items'] loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', pol.policyname, t);
    end loop;
    execute format('create policy dono_tudo on %I for all to authenticated using ((select is_owner()) and store_id = (select my_store())) with check ((select is_owner()) and store_id = (select my_store()))', t);
    execute format('create policy equipe_ve on %I for select to authenticated using ((select is_staff()) and store_id = (select my_store()))', t);
    if t <> 'dining_tables' then
      execute format('create policy equipe_cria on %I for insert to authenticated with check ((select is_staff()) and store_id = (select my_store()))', t);
      execute format('create policy equipe_altera on %I for update to authenticated using ((select is_staff()) and store_id = (select my_store())) with check ((select is_staff()) and store_id = (select my_store()))', t);
    end if;
  end loop;
end $$;
grant select, insert, update, delete on dining_tables, tabs, tab_items to authenticated;

-- atualiza na hora em todos os aparelhos (caixa, garçom, cozinha)
do $$ begin
  begin alter publication supabase_realtime add table tabs; exception when others then null; end;
  begin alter publication supabase_realtime add table tab_items; exception when others then null; end;
end $$;

notify pgrst, 'reload schema';
