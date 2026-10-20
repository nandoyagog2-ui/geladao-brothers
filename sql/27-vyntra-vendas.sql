-- =========================================================
--  VYNTRA — parte 27 · ROBÔ DE VENDAS DA VYNTRA NO WHATSAPP
--  Cria a loja interna "VYNTRA Vendas" (não é cliente) só pra usar o robô
--  do WhatsApp no número de vendas da VYNTRA, com o roteiro de vendas pronto.
--  Login do painel/extensão: usuário  vendas   senha  vyntra2026
--  Pode rodar de novo: atualiza o roteiro sem apagar nada.
-- =========================================================
do $$
declare v bigint;
begin
  select id into v from stores where slug = 'vyntra-vendas';
  if v is null then
    insert into stores (slug, name, segment, active, paid_until, plan, notes, monthly_fee, setup_fee, setup_paid)
    values ('vyntra-vendas', 'VYNTRA Vendas (interno)', 'outro', true, null, 'Interno',
            'Loja interna da VYNTRA para o robô de vendas no WhatsApp — não é cliente.', 0, 0, true)
    returning id into v;
    insert into store_settings (id, name) values (v, 'VYNTRA');
  end if;

  update store_settings set
    name = 'VYNTRA', whatsapp = '31997846229', is_open = true, timezone = 'America/Fortaleza',
    opening_hours = '{"dom":{"open":"00:00","close":"23:59"},"seg":{"open":"00:00","close":"23:59"},"ter":{"open":"00:00","close":"23:59"},"qua":{"open":"00:00","close":"23:59"},"qui":{"open":"00:00","close":"23:59"},"sex":{"open":"00:00","close":"23:59"},"sab":{"open":"00:00","close":"23:59"}}'::jsonb,
    wa_auto = '{"enabled":false,"types":[],"statuses":[]}'::jsonb,
    bot = jsonb_build_object(
      'enabled', true, 'only_greet', false, 'cooldown_hours', 24, 'pause_hours', 12,
      'wait_seconds', 0, 'save_contacts', true,
      'greet_open', E'Oi, {nome}! 👋 Aqui é da *VYNTRA*, o cardápio digital + sistema de gestão pra delivery, *sem comissão por pedido*.\n\nPra eu te ajudar melhor: você tem loja ou delivery?',
      'greet_closed', E'Oi, {nome}! 👋 Aqui é da *VYNTRA*, o cardápio digital + sistema de gestão pra delivery, *sem comissão por pedido*.\n\nPra eu te ajudar melhor: você tem loja ou delivery?',
      'menu_footer', 'Responda só com o *número* da opção 👆',
      'menu', jsonb_build_array(
        jsonb_build_object('key','1','label','Sim, tenho loja ou delivery','reply',
          E'Show! 🙌 Então a VYNTRA vai te ajudar muito.\n\nCom ela você tem:\n📱 *Cardápio digital* com seu link, sua logo e suas fotos\n🧾 *Pedidos organizados* no painel, com som e impressão automática\n💬 *Aviso no WhatsApp* pro cliente (pedido aceito, saiu pra entrega...)\n💵 *Caixa/PDV*, mesas e comandas, tela da cozinha\n🛵 *Entregador no mapa* em tempo real\n🎟️ Cupons, estoque e relatórios\n\nE o principal: *0% de comissão*. Você paga só uma mensalidade fixa.\n\nResponda:\n*3* - Quero saber o preço\n*4* - Quero ver uma demonstração\n*5* - Falar com o Fernando'),
        jsonb_build_object('key','2','label','Ainda não, estou abrindo meu negócio','reply',
          E'Que massa, boa sorte no novo negócio! 🚀\n\nComeçar já com o seu próprio cardápio digital ajuda muito: o cliente pede pelo seu link, você não paga comissão e já começa organizado.\n\nResponda:\n*3* - Quero saber o preço\n*4* - Quero ver uma demonstração\n*5* - Falar com o Fernando'),
        jsonb_build_object('key','3','label','Quero saber o preço','reply',
          E'Os valores são simples 👇\n\n💰 *Implantação: R$ 300* (uma vez só)\nEu monto seu cardápio, cadastro os produtos, configuro tudo e te ensino a usar.\n\n📅 *Mensalidade: R$ 99,90*\n✅ Pedidos ilimitados\n✅ *0% de comissão*\n✅ *Sem fidelidade*: cancela quando quiser\n\nPra comparar: 300 pedidos de R$ 40 com 15% de comissão dão *R$ 1.800* no mês. Na VYNTRA: *R$ 99,90*.\n\nResponda:\n*4* - Ver uma demonstração\n*5* - Quero contratar / falar com o Fernando'),
        jsonb_build_object('key','4','label','Quero ver uma demonstração','reply',
          E'Olha como fica o cardápio pro seu cliente, nessa loja de demonstração 👇\nhttps://cardapiovyntra.com.br/demo\n\nPode fazer um pedido de teste à vontade 😉\n\nApresentação completa do sistema:\nhttps://cardapiovyntra.com.br\n\nResponda:\n*3* - Saber o preço\n*5* - Falar com o Fernando'),
        jsonb_build_object('key','5','label','Falar com o Fernando','reply',
          E'Perfeito! Já chamei o Fernando, ele te responde aqui em instantes 🙋‍♂️\n\nSe quiser adiantar, me conta: qual o nome da sua loja e o que você vende?','human',true)
      ),
      'keywords', jsonb_build_array(
        jsonb_build_object('words','preço, preco, valor, valores, quanto custa, mensalidade, plano, planos','reply',
          E'💰 *Implantação: R$ 300* (uma vez só) + 📅 *Mensalidade: R$ 99,90*\n✅ Pedidos ilimitados · ✅ 0% de comissão · ✅ Sem fidelidade\n\nResponda *4* pra ver a demonstração ou *5* pra falar com o Fernando.'),
        jsonb_build_object('words','demo, demonstração, demonstracao, exemplo, ver como funciona, teste, testar','reply',
          E'Olha a loja de demonstração 👇\nhttps://cardapiovyntra.com.br/demo\n\nResponda *3* pro preço ou *5* pra falar com o Fernando.'),
        jsonb_build_object('words','ifood, comissão, comissao, taxa do ifood, 99food, aiqfome','reply',
          E'Pode continuar no iFood, sem problema! 👍 A ideia é você ter o *seu próprio canal*: o cliente que já te conhece pede pelo seu link e você não paga comissão nesses pedidos.\n\nResponda *3* pro preço ou *4* pra ver a demonstração.'),
        jsonb_build_object('words','contratar, quero fechar, fechar, quero assinar, assinar, quero começar, bora','reply',
          E'Show! 🚀 Já chamei o Fernando pra começar com você.\n\nPra adiantar, me manda:\n📌 Nome da loja e logo\n📌 Lista dos produtos com preços (pode ser foto do cardápio)\n📌 Bairros que entrega e a taxa de cada um\n📌 Horário de funcionamento','human',true)
      )
    )
  where id = v;

  perform make_login(v, 'vendas', 'Fernando (vendas)', 'vyntra2026', 'dono');
end $$;
