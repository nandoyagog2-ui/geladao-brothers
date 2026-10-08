-- =========================================================
--  GELADÃO BROTHERS — parte 14
--  1) Entregadores (cadastro, mandar pedido pelo WhatsApp, acerto)
--  2) Código de barras nos produtos
--  3) O dono escolhe o que cada funcionário pode ver
-- =========================================================

-- ---------- 1) ENTREGADORES ----------
create table if not exists couriers (
  id         bigserial primary key,
  name       text not null,
  phone      text,
  active     boolean not null default true,
  pay_mode   text not null default 'taxa' check (pay_mode in ('taxa','fixo','nada')),  -- recebe a taxa de entrega, um valor fixo por entrega, ou nada (fixo/mensal)
  pay_value  numeric(10,2) default 0,
  notes      text,
  created_at timestamptz not null default now()
);
alter table couriers enable row level security;
drop policy if exists equipe_ve on couriers;
drop policy if exists dono_tudo on couriers;
create policy equipe_ve on couriers for select to authenticated using ((select is_staff()));
create policy dono_tudo on couriers for all to authenticated using ((select is_owner())) with check ((select is_owner()));
grant select, insert, update, delete on couriers to authenticated;
grant usage, select on sequence couriers_id_seq to authenticated;

alter table orders
  add column if not exists courier_id bigint references couriers(id) on delete set null,
  add column if not exists dispatched_at timestamptz;
create index if not exists orders_courier on orders (courier_id, created_at);

-- ---------- 2) CÓDIGO DE BARRAS ----------
alter table products add column if not exists barcode text;
create index if not exists products_barcode on products (barcode);

-- ---------- 3) PERMISSÕES POR FUNCIONÁRIO ----------
-- lista do que o funcionário pode, ex.: ["estoque","clientes","resumo","desconto"]
alter table staff add column if not exists perms jsonb;

-- despesas e contas: só o dono vê
drop policy if exists equipe_ve on expenses;

notify pgrst, 'reload schema';
