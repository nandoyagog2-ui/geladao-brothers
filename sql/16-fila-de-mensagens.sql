-- =========================================================
--  GELADÃO BROTHERS — parte 16
--  Fila de mensagens do WhatsApp: o painel (de qualquer computador
--  ou celular) coloca a mensagem na fila e a extensão envia sozinha.
--  Usado pra mensagem do entregador, reenvio de avisos etc.
-- =========================================================
create table if not exists wa_outbox (
  id         bigserial primary key,
  phone      text not null,
  text       text not null,
  kind       text,                                   -- entregador, aviso, reenvio...
  order_id   bigint references orders(id) on delete cascade,
  status     text not null default 'pendente' check (status in ('pendente','enviando','enviado','erro')),
  error      text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
create index if not exists wa_outbox_pend on wa_outbox (status, created_at);

alter table wa_outbox enable row level security;
drop policy if exists equipe_ve on wa_outbox;
drop policy if exists equipe_cria on wa_outbox;
drop policy if exists equipe_altera on wa_outbox;
drop policy if exists dono_tudo on wa_outbox;
create policy equipe_ve     on wa_outbox for select to authenticated using ((select is_staff()));
create policy equipe_cria   on wa_outbox for insert to authenticated with check ((select is_staff()));
create policy equipe_altera on wa_outbox for update to authenticated using ((select is_staff())) with check ((select is_staff()));
create policy dono_tudo     on wa_outbox for all    to authenticated using ((select is_owner())) with check ((select is_owner()));
grant select, insert, update, delete on wa_outbox to authenticated;
grant usage, select on sequence wa_outbox_id_seq to authenticated;

-- a fila também chega ao vivo na extensão
do $$ begin
  alter publication supabase_realtime add table wa_outbox;
exception when others then null;
end $$;

notify pgrst, 'reload schema';
