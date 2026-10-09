-- =========================================================
--  GELADÃO BROTHERS — parte 17
--  O painel fica sabendo se a extensão do WhatsApp está ligada.
--  Ligada: as mensagens vão sozinhas. Desligada: o painel abre o WhatsApp como antes.
-- =========================================================
alter table store_settings add column if not exists wa_seen_at timestamptz;

create or replace function wa_heartbeat() returns timestamptz
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() then raise exception 'Sem permissão'; end if;
  update store_settings set wa_seen_at = now() where id = 1;
  return now();
end $$;
revoke execute on function wa_heartbeat() from anon, public;
grant execute on function wa_heartbeat() to authenticated;

notify pgrst, 'reload schema';
