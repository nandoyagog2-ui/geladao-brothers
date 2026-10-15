-- =========================================================
--  VYNTRA — parte 26 · LOJA DE DEMONSTRAÇÃO
--  Cria a loja "demo" (cardapiovyntra.com.br/demo) com produtos de exemplo,
--  pizza meio a meio, bairros de Fortaleza e um login pra você mostrar o painel.
--  Pode rodar de novo: se a loja já existir, ela é recriada do zero.
-- =========================================================
do $$
declare v bigint; c_pz bigint; c_ln bigint; c_be bigint; c_so bigint; c_mm bigint;
        g_sab bigint; g_bor bigint; g_add bigint; p bigint;
begin
  -- recomeça do zero (apaga só a loja demo)
  select id into v from stores where slug = 'demo';
  if v is not null then
    delete from product_complements where store_id = v;
    delete from complement_options where store_id = v;
    delete from complement_groups where store_id = v;
    delete from order_items where store_id = v;
    delete from orders where store_id = v;
    delete from products where store_id = v;
    delete from categories where store_id = v;
    delete from delivery_zones where store_id = v;
  else
    insert into stores (slug, name, segment, active, paid_until, plan, notes, monthly_fee, setup_fee, setup_paid)
    values ('demo', 'Sabor da Esquina (demonstração)', 'restaurante', true, null, 'Demonstração',
            'Loja de demonstração da VYNTRA — não é cliente.', 0, 0, true)
    returning id into v;
    insert into store_settings (id, name) values (v, 'Sabor da Esquina');
  end if;

  update store_settings set
    name = 'Sabor da Esquina', primary_color = '#FFC400', is_open = true,
    address = 'Av. Exemplo, 1000 - Aldeota, Fortaleza - CE',
    opening_hours = '{"dom":{"open":"00:00","close":"23:59"},"seg":{"open":"00:00","close":"23:59"},"ter":{"open":"00:00","close":"23:59"},"qua":{"open":"00:00","close":"23:59"},"qui":{"open":"00:00","close":"23:59"},"sex":{"open":"00:00","close":"23:59"},"sab":{"open":"00:00","close":"23:59"}}'::jsonb,
    min_order = 0, prep_time_min = 20, delivery_time_min = 35, delivery_time_max = 55,
    accepts_delivery = true, accepts_pickup = true, delivery_mode = 'bairro',
    payment_methods = '["Pix","Dinheiro","Cartão de crédito","Cartão de débito"]'::jsonb,
    timezone = 'America/Fortaleza', store_lat = -3.7372, store_lng = -38.4964,
    loyalty_enabled = true, loyalty_points_per_real = 1, loyalty_reward_points = 200,
    loyalty_reward_text = 'Ganhe um refri de 2 L'
  where id = v;

  -- bairros
  insert into delivery_zones (store_id, neighborhood, fee, eta_minutes, active) values
    (v, 'Aldeota', 5, 35, true), (v, 'Meireles', 6, 40, true), (v, 'Centro', 7, 40, true),
    (v, 'Fátima', 7, 45, true), (v, 'Cocó', 8, 45, true), (v, 'Papicu', 8, 45, true),
    (v, 'Messejana', 12, 60, true);

  -- categorias
  insert into categories (store_id, name, sort_order, active, to_kitchen) values (v, 'Pizzas', 1, true, true) returning id into c_pz;
  insert into categories (store_id, name, sort_order, active, to_kitchen) values (v, 'Lanches', 2, true, true) returning id into c_ln;
  insert into categories (store_id, name, sort_order, active, to_kitchen, available)
    values (v, 'Marmitas do almoço', 3, true, true, '{"days":["seg","ter","qua","qui","sex","sab"],"from":"11:00","to":"15:00"}') returning id into c_mm;
  insert into categories (store_id, name, sort_order, active, to_kitchen) values (v, 'Bebidas', 4, true, false) returning id into c_be;
  insert into categories (store_id, name, sort_order, active, to_kitchen) values (v, 'Sobremesas', 5, true, false) returning id into c_so;

  -- complementos: sabores (meio a meio cobra o mais caro), borda, adicionais
  insert into complement_groups (store_id, name, min_select, max_select, allow_repeat, active, pricing)
    values (v, 'Sabores', 1, 2, false, true, 'maior') returning id into g_sab;
  insert into complement_options (store_id, group_id, name, price, active, sort_order) values
    (v, g_sab, 'Calabresa', 49.90, true, 1), (v, g_sab, 'Mussarela', 47.90, true, 2),
    (v, g_sab, 'Frango com catupiry', 54.90, true, 3), (v, g_sab, 'Portuguesa', 54.90, true, 4),
    (v, g_sab, 'Quatro queijos', 57.90, true, 5), (v, g_sab, 'Camarão', 69.90, true, 6);
  insert into complement_groups (store_id, name, min_select, max_select, allow_repeat, active, pricing)
    values (v, 'Borda recheada', 0, 1, false, true, 'soma') returning id into g_bor;
  insert into complement_options (store_id, group_id, name, price, active, sort_order) values
    (v, g_bor, 'Catupiry', 8, true, 1), (v, g_bor, 'Cheddar', 8, true, 2), (v, g_bor, 'Chocolate', 10, true, 3);
  insert into complement_groups (store_id, name, min_select, max_select, allow_repeat, active, pricing)
    values (v, 'Adicionais', 0, 5, true, true, 'soma') returning id into g_add;
  insert into complement_options (store_id, group_id, name, price, active, sort_order) values
    (v, g_add, 'Bacon', 4, true, 1), (v, g_add, 'Ovo', 2, true, 2), (v, g_add, 'Cheddar', 3, true, 3), (v, g_add, 'Hambúrguer extra', 7, true, 4);

  -- produtos
  insert into products (store_id, category_id, name, description, price, status, featured, sort_order)
    values (v, c_pz, 'Pizza Grande (8 fatias)', 'Escolha 1 ou 2 sabores. No meio a meio, vale o preço do sabor mais caro.', 0, 'ativo', true, 1) returning id into p;
  insert into product_complements (store_id, product_id, group_id, sort_order) values (v, p, g_sab, 0), (v, p, g_bor, 1);
  insert into products (store_id, category_id, name, description, price, status, sort_order) values
    (v, c_pz, 'Pizza Brotinho (4 fatias)', 'Calabresa ou mussarela, ideal para 1 pessoa.', 29.90, 'ativo', 2);

  insert into products (store_id, category_id, name, description, price, promo_price, status, featured, is_new, sort_order)
    values (v, c_ln, 'X-Burguer da Casa', 'Pão brioche, hambúrguer 150 g, queijo, alface, tomate e molho especial.', 24.90, 21.90, 'ativo', true, false, 1) returning id into p;
  insert into product_complements (store_id, product_id, group_id, sort_order) values (v, p, g_add, 0);
  insert into products (store_id, category_id, name, description, price, status, is_new, sort_order)
    values (v, c_ln, 'X-Bacon Duplo', 'Dois hambúrgueres, muito bacon, cheddar cremoso e cebola caramelizada.', 32.90, 'ativo', true, 2) returning id into p;
  insert into product_complements (store_id, product_id, group_id, sort_order) values (v, p, g_add, 0);
  insert into products (store_id, category_id, name, description, price, status, sort_order) values
    (v, c_ln, 'Batata frita grande', 'Porção de 400 g, crocante, com cheddar e bacon.', 22.90, 'ativo', 3),
    (v, c_ln, 'Combo Burguer + Batata + Refri', 'X-Burguer da Casa, batata média e refrigerante lata.', 36.90, 'ativo', 4);

  insert into products (store_id, category_id, name, description, price, status, sort_order) values
    (v, c_mm, 'Marmita de frango grelhado', 'Arroz, feijão, salada, farofa e frango grelhado.', 19.90, 'ativo', 1),
    (v, c_mm, 'Marmita de carne de sol', 'Arroz de leite, feijão verde, macaxeira e carne de sol.', 24.90, 'ativo', 2);

  insert into products (store_id, category_id, name, description, price, status, sort_order, price_tiers) values
    (v, c_be, 'Refrigerante lata 350 ml', 'Coca-Cola, Guaraná ou Fanta.', 6, 'ativo', 1, '[{"min_qty":6,"price":5}]'),
    (v, c_be, 'Refrigerante 2 L', 'Coca-Cola ou Guaraná.', 14, 'ativo', 2, '[]'),
    (v, c_be, 'Suco natural 500 ml', 'Laranja, maracujá, acerola ou cajá.', 9, 'ativo', 3, '[]'),
    (v, c_be, 'Água mineral 500 ml', 'Com ou sem gás.', 3.5, 'ativo', 4, '[]');

  insert into products (store_id, category_id, name, description, price, status, sort_order) values
    (v, c_so, 'Pudim de leite', 'Fatia generosa, feito na casa.', 9.90, 'ativo', 1),
    (v, c_so, 'Brownie com sorvete', 'Brownie quentinho com uma bola de sorvete de creme.', 16.90, 'ativo', 2);

  -- login pra você mostrar o painel nas apresentações
  perform make_login(v, 'demo', 'Demonstração', 'vyntra2026', 'dono');
end $$;

notify pgrst, 'reload schema';
