-- =========================================================
--  GELADÃO BROTHERS — parte 8
--  Caixa por turno (funcionário), venda no balcão e Pix com QR Code
-- =========================================================
alter table cash_sessions
  add column if not exists operator text,          -- nome de quem abriu o caixa (turno)
  add column if not exists opened_by text,         -- e-mail do login
  add column if not exists closed_by text,
  add column if not exists expected_amount numeric(10,2);

alter table orders
  add column if not exists cash_session_id bigint references cash_sessions(id) on delete set null;
create index if not exists orders_cash_session on orders (cash_session_id);

alter table store_settings
  add column if not exists pix_key_type text default 'telefone',  -- cpf, cnpj, telefone, email, aleatoria
  add column if not exists pix_name text,                         -- nome que aparece no Pix
  add column if not exists pix_city text default 'FORTALEZA';

-- o cardápio precisa ler esses dados pra montar o QR Code do Pix
-- (store_settings já é liberado pra leitura no cardápio)
notify pgrst, 'reload schema';
