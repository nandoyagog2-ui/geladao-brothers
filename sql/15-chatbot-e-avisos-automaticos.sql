-- =========================================================
--  GELADÃO BROTHERS — parte 15
--  Chatbot do WhatsApp (respostas automáticas) e
--  avisos automáticos de status do pedido pela extensão
-- =========================================================

-- configurações do robô e dos avisos (editadas no painel)
alter table store_settings
  add column if not exists bot jsonb,
  add column if not exists wa_auto jsonb;

-- quando o status do pedido mudou e quais avisos já foram enviados
alter table orders
  add column if not exists status_at timestamptz default now(),
  add column if not exists notified jsonb default '{}'::jsonb;
create index if not exists orders_status_at on orders (status_at);

create or replace function touch_status_at() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    new.status_at := now();
  end if;
  return new;
end $$;
drop trigger if exists orders_status_at on orders;
create trigger orders_status_at before insert or update on orders
  for each row execute function touch_status_at();

-- pedidos antigos não disparam aviso
update orders set notified = '{"antigo":true}'::jsonb where notified is null or notified = '{}'::jsonb;

notify pgrst, 'reload schema';
