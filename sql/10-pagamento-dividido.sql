-- =========================================================
--  GELADÃO BROTHERS — parte 10
--  Pagamento dividido no caixa (ex.: R$ 50 no dinheiro + R$ 50 no Pix)
--  e Pix de volta nas formas de pagamento do cardápio
-- =========================================================
alter table orders add column if not exists payments jsonb;   -- [{"method":"Dinheiro","amount":50},{"method":"Pix","amount":50}]

-- coloca o Pix na lista de pagamentos da loja (se não estiver)
update store_settings
   set payment_methods = '["Pix"]'::jsonb || coalesce(payment_methods, '[]'::jsonb)
 where id = 1 and not coalesce(payment_methods, '[]'::jsonb) ? 'Pix';

notify pgrst, 'reload schema';
