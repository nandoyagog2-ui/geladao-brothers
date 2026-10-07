-- =========================================================
--  GELADÃO BROTHERS — banco de dados completo (Supabase)
--  Cole tudo no SQL Editor do Supabase e clique em RUN.
-- =========================================================

-- ---------- CONFIGURAÇÕES DA LOJA (uma linha só) ----------
create table store_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Geladão Brothers',
  logo_url text,
  banner_url text,
  whatsapp text,                       -- número que recebe os pedidos
  address text,
  primary_color text default '#FFC107',      -- amarelo
  secondary_color text default '#0B0B0B',    -- preto
  is_open boolean default true,        -- botão abrir/fechar loja na hora
  opening_hours jsonb default '{
    "seg":{"open":"16:00","close":"02:00","closed":false},
    "ter":{"open":"16:00","close":"02:00","closed":false},
    "qua":{"open":"16:00","close":"02:00","closed":false},
    "qui":{"open":"16:00","close":"02:00","closed":false},
    "sex":{"open":"16:00","close":"04:00","closed":false},
    "sab":{"open":"14:00","close":"04:00","closed":false},
    "dom":{"open":"14:00","close":"02:00","closed":false}}',
  min_order numeric(10,2) default 0,
  prep_time_min int default 10,
  delivery_time_min int default 35,
  delivery_time_max int default 50,
  accepts_delivery boolean default true,
  accepts_pickup boolean default true,
  payment_methods jsonb default '["Pix","Dinheiro","Cartão de crédito","Cartão de débito"]',
  pix_key text,
  loyalty_enabled boolean default false,
  loyalty_points_per_real numeric(10,2) default 1,   -- pontos ganhos por R$ 1
  loyalty_reward_points int default 100,              -- pontos pra ganhar o prêmio
  loyalty_reward_text text default 'R$ 10 de desconto',
  updated_at timestamptz default now()
);
insert into store_settings (id) values (1);

-- ---------- CATÁLOGO ----------
create table categories (
  id bigserial primary key,
  name text not null,
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now()
);

create table products (
  id bigserial primary key,
  category_id bigint references categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null default 0,
  promo_price numeric(10,2),               -- preço de promoção (riscado no cardápio)
  image_url text,
  status text not null default 'ativo' check (status in ('ativo','em_falta','inativo')),
  is_combo boolean default false,
  featured boolean default false,          -- destaque no topo do cardápio
  is_new boolean default false,            -- selo NOVIDADE
  sort_order int default 0,
  internal_code text,
  -- estoque
  track_stock boolean default false,
  stock_qty numeric(10,2) default 0,
  stock_min numeric(10,2) default 0,
  cost_price numeric(10,2),                -- preço de custo (pro financeiro)
  created_at timestamptz default now()
);

-- Complementos = grupos (ex.: "Gelo Sabores"); Opções = itens do grupo
create table complement_groups (
  id bigserial primary key,
  name text not null,
  min_select int default 0,
  max_select int default 1,
  allow_repeat boolean default false,
  active boolean default true
);
create table complement_options (
  id bigserial primary key,
  group_id bigint references complement_groups(id) on delete cascade,
  name text not null,
  price numeric(10,2) default 0,
  image_url text,
  active boolean default true,
  sort_order int default 0
);
create table product_complements (
  product_id bigint references products(id) on delete cascade,
  group_id bigint references complement_groups(id) on delete cascade,
  sort_order int default 0,
  primary key (product_id, group_id)
);
-- "Peça também" / "Venda sugestiva"
create table product_suggestions (
  product_id bigint references products(id) on delete cascade,
  suggested_id bigint references products(id) on delete cascade,
  primary key (product_id, suggested_id)
);

-- ---------- DELIVERY ----------
create table delivery_zones (
  id bigserial primary key,
  neighborhood text not null,
  fee numeric(10,2) not null default 0,
  eta_minutes int,
  active boolean default true
);

-- ---------- CLIENTES / FIADO ----------
create table customers (
  id bigserial primary key,
  name text not null,
  phone text unique,
  address text,
  neighborhood text,
  cep text, street text, street_number text, complement text, reference text,
  notes text,
  loyalty_points int default 0,
  credit_limit numeric(10,2) default 0,    -- limite do fiado
  created_at timestamptz default now()
);
create table credit_entries (              -- fiado: compras e pagamentos
  id bigserial primary key,
  customer_id bigint references customers(id) on delete cascade,
  kind text check (kind in ('compra','pagamento')),
  amount numeric(10,2) not null,
  description text,
  order_id bigint,
  created_at timestamptz default now()
);
create view customer_balances as
select c.id, c.name, c.phone, c.credit_limit,
  coalesce(sum(case when e.kind='compra' then e.amount else -e.amount end),0) as balance
from customers c left join credit_entries e on e.customer_id = c.id
group by c.id;

-- ---------- CUPONS ----------
create table coupons (
  id bigserial primary key,
  code text unique not null,
  kind text check (kind in ('percent','fixed','free_delivery')) default 'percent',
  value numeric(10,2) default 0,
  min_order numeric(10,2) default 0,
  max_uses int,
  uses int default 0,
  expires_at timestamptz,
  active boolean default true
);

-- ---------- PEDIDOS ----------
create table orders (
  id bigserial primary key,
  number serial,
  customer_id bigint references customers(id),
  customer_name text,
  customer_phone text,
  type text check (type in ('delivery','retirada','balcao')) default 'delivery',
  address text,
  neighborhood text,
  cep text, street text, street_number text, complement text, reference text,
  subtotal numeric(10,2) default 0,
  delivery_fee numeric(10,2) default 0,
  discount numeric(10,2) default 0,
  total numeric(10,2) default 0,
  coupon_code text,
  payment_method text,
  change_for numeric(10,2),
  notes text,
  status text default 'novo'
    check (status in ('novo','em_preparo','saiu_entrega','pronto','concluido','cancelado')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table order_items (
  id bigserial primary key,
  order_id bigint references orders(id) on delete cascade,
  product_id bigint references products(id) on delete set null,
  name text,
  unit_price numeric(10,2),
  qty int,
  options jsonb default '[]',
  notes text,
  total numeric(10,2)
);

-- ---------- ESTOQUE ----------
create table stock_movements (
  id bigserial primary key,
  product_id bigint references products(id) on delete cascade,
  kind text check (kind in ('entrada','saida','ajuste','venda')),
  qty numeric(10,2) not null,
  description text,
  order_id bigint,
  created_at timestamptz default now()
);

-- ---------- CAIXA / FINANCEIRO ----------
create table cash_sessions (
  id bigserial primary key,
  opened_at timestamptz default now(),
  closed_at timestamptz,
  opening_amount numeric(10,2) default 0,
  closing_amount numeric(10,2),
  notes text
);
create table cash_movements (
  id bigserial primary key,
  session_id bigint references cash_sessions(id) on delete cascade,
  kind text check (kind in ('entrada','saida','sangria','suprimento')),
  amount numeric(10,2) not null,
  payment_method text,
  description text,
  order_id bigint,
  created_at timestamptz default now()
);
create table expenses (                    -- contas a pagar / despesas
  id bigserial primary key,
  description text not null,
  amount numeric(10,2) not null,
  category text,
  due_date date,
  paid boolean default false,
  created_at timestamptz default now()
);

-- =========================================================
--  PEDIDO DO CLIENTE: o preço é calculado AQUI, no banco,
--  pra ninguém conseguir mudar o valor pelo navegador.
-- =========================================================
create or replace function create_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s store_settings; v_order orders; it jsonb; op jsonb;
  prod products; opt complement_options; zone delivery_zones; cup coupons;
  v_sub numeric := 0; v_line numeric; v_unit numeric; v_opts jsonb;
  v_fee numeric := 0; v_disc numeric := 0; v_cust bigint; v_qty int;
begin
  select * into s from store_settings where id = 1;
  if not s.is_open then raise exception 'A loja está fechada no momento'; end if;

  insert into orders (customer_name, customer_phone, type, address, neighborhood,
                      cep, street, street_number, complement, reference,
                      payment_method, change_for, notes, coupon_code)
  values (p->>'customer_name', p->>'customer_phone', coalesce(p->>'type','delivery'),
          concat_ws(', ', p->>'street', p->>'street_number'), null,
          p->>'cep', p->>'street', p->>'street_number', p->>'complement', p->>'reference',
          p->>'payment_method',
          nullif(p->>'change_for','')::numeric, p->>'notes', upper(nullif(p->>'coupon_code','')))
  returning * into v_order;

  for it in select * from jsonb_array_elements(p->'items') loop
    select * into prod from products where id = (it->>'product_id')::bigint;
    if prod.id is null or prod.status <> 'ativo' then
      raise exception 'Produto indisponível: %', coalesce(prod.name, it->>'product_id');
    end if;
    v_qty := greatest(1, (it->>'qty')::int);
    v_unit := coalesce(prod.promo_price, prod.price);
    v_opts := '[]';
    for op in select * from jsonb_array_elements(coalesce(it->'options','[]')) loop
      select * into opt from complement_options where id = (op->>'option_id')::bigint and active;
      if opt.id is not null then
        v_unit := v_unit + opt.price * greatest(1, coalesce((op->>'qty')::int,1));
        v_opts := v_opts || jsonb_build_object('name', opt.name, 'qty', coalesce((op->>'qty')::int,1), 'price', opt.price);
      end if;
    end loop;
    v_line := v_unit * v_qty;
    v_sub := v_sub + v_line;
    insert into order_items (order_id, product_id, name, unit_price, qty, options, notes, total)
    values (v_order.id, prod.id, prod.name, v_unit, v_qty, v_opts, it->>'notes', v_line);
    if prod.track_stock then
      update products set stock_qty = stock_qty - v_qty where id = prod.id;
      insert into stock_movements (product_id, kind, qty, description, order_id)
      values (prod.id, 'venda', -v_qty, 'Pedido #' || v_order.number, v_order.id);
    end if;
  end loop;

  if v_sub < s.min_order then raise exception 'Pedido mínimo é R$ %', s.min_order; end if;

  if coalesce(p->>'type','delivery') = 'delivery' then
    select * into zone from delivery_zones where id = (p->>'zone_id')::bigint and active;
    if zone.id is null then raise exception 'Escolha um bairro de entrega válido'; end if;
    v_fee := zone.fee;
  end if;

  if v_order.coupon_code is not null then
    select * into cup from coupons where upper(code) = v_order.coupon_code and active
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses < max_uses) and v_sub >= min_order;
    if cup.id is not null then
      if cup.kind = 'percent' then v_disc := round(v_sub * cup.value / 100, 2);
      elsif cup.kind = 'fixed' then v_disc := least(cup.value, v_sub);
      else v_disc := v_fee; end if;
      update coupons set uses = uses + 1 where id = cup.id;
    end if;
  end if;

  -- cliente: cria ou atualiza pelo telefone
  if nullif(p->>'customer_phone','') is not null then
    insert into customers (name, phone, address, neighborhood, cep, street, street_number, complement, reference)
    values (p->>'customer_name', p->>'customer_phone', nullif(concat_ws(', ', p->>'street', p->>'street_number'),''),
            zone.neighborhood, p->>'cep', p->>'street', p->>'street_number', p->>'complement', p->>'reference')
    on conflict (phone) do update set name = excluded.name,
      address = coalesce(excluded.address, customers.address),
      cep = coalesce(excluded.cep, customers.cep), street = coalesce(excluded.street, customers.street),
      street_number = coalesce(excluded.street_number, customers.street_number),
      complement = coalesce(excluded.complement, customers.complement),
      reference = coalesce(excluded.reference, customers.reference),
      neighborhood = coalesce(excluded.neighborhood, customers.neighborhood)
    returning id into v_cust;
  end if;

  update orders set customer_id = v_cust, neighborhood = zone.neighborhood,
    subtotal = v_sub, delivery_fee = v_fee, discount = v_disc,
    total = v_sub + v_fee - v_disc
  where id = v_order.id returning * into v_order;

  if v_order.change_for is not null and v_order.change_for <= v_order.total then
    raise exception 'O valor para troco precisa ser maior que o total (R$ %)', v_order.total;
  end if;

  return jsonb_build_object('id', v_order.id, 'number', v_order.number, 'total', v_order.total,
                            'subtotal', v_sub, 'delivery_fee', v_fee, 'discount', v_disc,
                            'change', case when v_order.change_for is not null
                                           then v_order.change_for - v_order.total end);
end $$;

-- Cliente confere um cupom antes de finalizar
create or replace function check_coupon(p_code text, p_subtotal numeric) returns jsonb
language sql security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('valid', true, 'kind', kind, 'value', value)
    from coupons where upper(code) = upper(p_code) and active
      and (expires_at is null or expires_at > now())
      and (max_uses is null or uses < max_uses) and p_subtotal >= min_order),
    '{"valid": false}'::jsonb);
$$;

-- Fidelidade: dá pontos quando o pedido é concluído
create or replace function give_loyalty_points() returns trigger
language plpgsql security definer set search_path = public as $$
declare s store_settings;
begin
  select * into s from store_settings where id = 1;
  if s.loyalty_enabled and new.status = 'concluido' and old.status <> 'concluido'
     and new.customer_id is not null then
    update customers set loyalty_points = loyalty_points
      + floor(new.subtotal * s.loyalty_points_per_real) where id = new.customer_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger orders_loyalty before update on orders
  for each row execute function give_loyalty_points();

-- =========================================================
--  SEGURANÇA
--  Cliente (sem login): só VÊ o cardápio e faz pedido.
--  Painel (com login): pode tudo.
-- =========================================================
do $$ declare t text; begin
  foreach t in array array['store_settings','categories','products','complement_groups',
    'complement_options','product_complements','product_suggestions','delivery_zones',
    'customers','credit_entries','coupons','orders','order_items','stock_movements',
    'cash_sessions','cash_movements','expenses'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy painel_tudo on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

create policy cardapio_ve on store_settings     for select to anon using (true);
create policy cardapio_ve on categories         for select to anon using (active);
create policy cardapio_ve on products           for select to anon using (status <> 'inativo');
create policy cardapio_ve on complement_groups  for select to anon using (active);
create policy cardapio_ve on complement_options for select to anon using (active);
create policy cardapio_ve on product_complements for select to anon using (true);
create policy cardapio_ve on product_suggestions for select to anon using (true);
create policy cardapio_ve on delivery_zones     for select to anon using (active);

grant execute on function create_order(jsonb) to anon, authenticated;
grant execute on function check_coupon(text, numeric) to anon, authenticated;
alter view customer_balances set (security_invoker = true);

-- Pedidos chegam ao vivo no painel
alter publication supabase_realtime add table orders;

-- Pasta pras fotos dos produtos e logo
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true);
create policy fotos_ver on storage.objects for select using (bucket_id = 'fotos');
create policy fotos_enviar on storage.objects for all to authenticated
  using (bucket_id = 'fotos') with check (bucket_id = 'fotos');

-- Cliente não vê preço de custo nem estoque
revoke select on products from anon;
grant select (id, category_id, name, description, price, promo_price, image_url, status,
              is_combo, featured, is_new, sort_order) on products to anon;


-- ===================== DADOS INICIAIS =====================

insert into categories (name, sort_order) values
  ('Combos', 1),
  ('Cervejas Latas', 2),
  ('Cervejas Buchudinhas', 3),
  ('Cervejas Longnecks', 4),
  ('Energéticos', 5),
  ('Gelo', 6),
  ('Whisky', 7),
  ('Vodka', 8),
  ('Gin', 9),
  ('Cachaça', 10),
  ('Destilados e Licores', 11),
  ('Ice, Beats e Drinks', 12),
  ('Vinhos', 13),
  ('Refrigerantes', 14),
  ('Águas', 15),
  ('Guloseimas e Salgadinhos', 16),
  ('Tabacaria', 17);

insert into products (category_id, name, description, price, status) values
  ((select id from categories where name='Gelo'), 'Gelo Sabor Laranja 200ml', null, 4.00, 'ativo'),
  ((select id from categories where name='Gelo'), 'Gelo Sabor Melancia 200ml', null, 4.00, 'ativo'),
  ((select id from categories where name='Gelo'), 'Gelo Sabor Água Coco 200ml', null, 4.00, 'ativo'),
  ((select id from categories where name='Gelo'), 'Gelo Escama 20 KG', null, 17.00, 'ativo'),
  ((select id from categories where name='Gelo'), 'Gelo Sabor Limão 200ml', null, 4.00, 'ativo'),
  ((select id from categories where name='Gelo'), 'Gelo Sabor Maracujá 200ml', null, 4.00, 'ativo'),
  ((select id from categories where name='Gelo'), 'Gelo Sabor Energético 200ml', null, 4.00, 'ativo'),
  ((select id from categories where name='Gelo'), 'Gelo Escama 10 KG', 'Gelo escama', 12.00, 'ativo'),
  ((select id from categories where name='Gelo'), 'Gelo Cubo 3 KG', null, 7.00, 'ativo'),
  ((select id from categories where name='Gelo'), 'Gelo Sabor Maçã Verde 200 ml', null, 4.00, 'ativo'),
  ((select id from categories where name='Gelo'), 'Gelo Sabor Morango 200ml', null, 4.00, 'ativo'),
  ((select id from categories where name='Whisky'), 'Whisky Old Parr Grand 12 Anos 1L', null, 149.90, 'ativo'),
  ((select id from categories where name='Whisky'), 'Black White 1L', 'Black & White é um blend único, composto por 35 maltes e grãos diferentes, que juntos, fazem dele um whisky leve e suave. Graduação Alcoólica 40%. Contém 700ml. Whisky importado da Escócia.', 70.00, 'ativo'),
  ((select id from categories where name='Whisky'), 'Whisky White Horse 1L', null, 85.00, 'ativo'),
  ((select id from categories where name='Whisky'), 'Red Label 1L', null, 95.00, 'ativo'),
  ((select id from categories where name='Whisky'), 'Whisky Ballantine''s Finest 1L', null, 85.00, 'ativo'),
  ((select id from categories where name='Whisky'), 'Whisky Jack Daniel''s Maça Verde 1L', null, 149.00, 'ativo'),
  ((select id from categories where name='Whisky'), 'Whisky Jack Daniel''s Tennessee 1L', null, 149.00, 'ativo'),
  ((select id from categories where name='Whisky'), 'Whisky Buchanan''s 1L', null, 179.90, 'ativo'),
  ((select id from categories where name='Whisky'), 'Whisky Chivas 12 Anos 1L', null, 129.90, 'ativo'),
  ((select id from categories where name='Whisky'), 'Gold Label 750ml', null, 260.00, 'ativo'),
  ((select id from categories where name='Vodka'), 'VODKA SMIRNOFF 998ML', null, 45.00, 'ativo'),
  ((select id from categories where name='Vodka'), 'VODKA SLOVA SABOR KIWI 965ML', 'Bebida alcoólica mista de saque com Blueberry. Slova Fruits é doce, possui aroma e sabor de fruta, pode ser apreciada com gelo, ou misturada a outras bebidas de sua preferência, que sua imaginação pedir.', 17.00, 'ativo'),
  ((select id from categories where name='Vodka'), 'VODKA SLOVA SABOR FRUTAS VERMELHAS 965ML', 'Bebida alcoólica mista de Frutas Vermelhas, Slova Fruits é doce, possui aroma e sabor de fruta, pode ser apreciada com gelo, ou misturada a outras bebidas de sua preferência, que sua imaginação pedir.', 17.00, 'ativo'),
  ((select id from categories where name='Vodka'), 'VODKA SLOVA SABOR BLUEBERRY 965ML', 'Vodka Slova Blueberry 965ml Bebida alcoólica mista de saque com Blueberry. Slova Fruits é doce, possui aroma e sabor de fruta, pode ser apreciada com gelo, ou misturada a outras bebidas de sua preferência, que sua imaginação pedir. País: Brasil Volume: 965ml Teor Alcoólico: 13,5% vol. Você está comprando: 01 Unidade Vodka Slova Blueberry 965ml', 17.00, 'ativo'),
  ((select id from categories where name='Vodka'), 'VODKA ORLOFF 1L', null, 36.00, 'ativo'),
  ((select id from categories where name='Vodka'), 'VODKA SLOVA SABOR LIMAO 965ML', 'Vodka Slova Blueberry 965ml Bebida alcoólica mista de saque com Blueberry. Slova Fruits é doce, possui aroma e sabor de fruta, pode ser apreciada com gelo, ou misturada a outras bebidas de sua preferência, que sua imaginação pedir. País: Brasil Volume: 965ml Teor Alcoólico: 13,5% vol. Você está comprando: 01 Unidade Vodka Slova Blueberry 965ml', 17.00, 'em_falta'),
  ((select id from categories where name='Vodka'), 'VODKA SLOVA SABOR MARACUJA 965ML', 'Vodka Slova Blueberry 965ml Bebida alcoólica mista de saque com Blueberry. Slova Fruits é doce, possui aroma e sabor de fruta, pode ser apreciada com gelo, ou misturada a outras bebidas de sua preferência, que sua imaginação pedir. País: Brasil Volume: 965ml Teor Alcoólico: 13,5% vol. Você está comprando: 01 Unidade Vodka Slova Blueberry 965ml', 17.00, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Coca Lata Original 350ml', 'Com sabor inconfundível e único, a Coca-Cola Original é o refrigerante mais tradicional e consumido no mundo inteiro! Toda Coca-Cola Original é produzida', 4.00, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Guaraná Antarctica Lata 350ml', 'Gostinho do Brasil com sabor de quero mais? Vem de Guaraná Antarctica. O refrigerante centenário original do Brasil que é coisa nossa. Lançado em 1921, é a primeira bebida com sabor de guaraná feita com esse fruto que combina com tudo. Bateu aquela sede? Toma um gole que refrescaaaa!', 4.00, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Guaraná Antarctica 2L', 'Gostinho do Brasil com sabor de quero mais? Vem de Guaraná Antarctica. O refrigerante centenário original do Brasil que é coisa nossa. Lançado em 1921, é a primeira bebida com sabor de guaraná feita com esse fruto que combina com tudo. Bateu aquela sede? Toma um gole que refrescaaaa!', 9.00, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Sprite Lata 350ml', 'O Refrigerante Sprite lata - 350ml é um produto alimentício tipo bebida que possui suco concentrado do limão, possui um sabor delicioso e um aroma ...', 3.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'São Geraldo 2L', 'Cajuína São Geraldo 2L: O Sabor Autêntico do Nordeste A Cajuína São Geraldo é um refrigerante genuinamente nordestino, com o sabor marcante e inconfundível do caju. Produzida com a essência natural da fruta, é perfeita para quem busca uma bebida refrescante e cheia de tradição.', 12.00, 'em_falta'),
  ((select id from categories where name='Refrigerantes'), 'São Geraldo Lata 350ml', 'São Geraldo é um refrigerante sabor caju, feito com a própria fruta. Refrescante, leve e com sabor completamente diferente de todos os outros que você já provou! Você só precisa de um gole para se apaixonar.', 4.00, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Coca Lata Zero 350ml', 'Refrescante e saboroso, sem açúcar. Com o sabor original da Coca-Cola, mas sem calorias. Uma bebida refrescante para todos os momentos. O único ingrediente que pode causar alergia no refrigerante Coca Cola Zero Lata 350ml é a cafeína.', 4.00, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Pepsi Lata 350ml', null, 3.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Fanta Laranja Lata 350ml', 'Sua lata de 350ml é prática e fácil de carregar. Experimente e refresque-se! Os principais ingredientes do Refrigerante Fanta Laranja Lata 350ml são: água, açúcar, ácido cítrico, aromas naturais, corantes, ácido fosfórico, cafeína e conservantes.', 3.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Fanta Uva Lata 350ml', 'Com sabor irresistível e único, o Refrigerante FANTA Uva faz muito sucesso no mercado entre os refrigerantes nacionais e internacionais. Produzido com água gaseificada, açúcar e suco de uva é uma excelente opção para matar a sede!', 3.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Sprite 2L', 'O Refrigerante Sprite é um produto alimentício tipo bebida que possui suco concentrado do limão, possui um sabor delicioso e um aroma ...', 10.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Guaraná 1L Antarctica', 'Refrescante e revitalizante, o clássico refrigerante brasileiro une a tradição da marca Antarctica à energia do guaraná nativo da Amazônia. Adquira agora e saboreie a essência única do Brasil', 5.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Refrigerante 1L Coca Cola Zero', 'Um dos refrigerantes mais clássicos no mundo, a Coca-Cola Zero 1L tem o sabor inigualável que você já conhece e sem a adição de açúcares, para pessoas com dietas restritivas ou que querem manter hábitos saudáveis, mas sem abrir mão do sabor da Coca-Cola.', 7.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Refrigerante 2L Coca Cola', 'Refrigerante Coca-Cola Pet 2L é refrescante e saboroso. É produzido com ingredientes de qualidade, como água, açúcar, ácido cítrico, cafeína e aromatizantes naturais. É ideal para compartilhar com amigos e familiares. É refrescante e tem um sabor único.', 12.00, 'em_falta'),
  ((select id from categories where name='Refrigerantes'), 'Pepsi 2L', 'PEPSI é um produto clássico vendido no mundo inteiro, chegou no Brasil em 1952. Um refrigerante de cola com sabor único, refrescante e estimulante.', 9.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Cajuína São Geraldo 1L', 'A Cajuína São Geraldo 1L é um refrigerante sabor caju, produzido no Ceará com 5% de suco de caju. É um produto refrescante e leve, com um sabor marcante. Características: é um refrigerante não alcoólico, tem cor amarelo âmbar cristalina, tem sabor levemente doce, é fermentado para esterilização, é produzido com a própria fruta.', 7.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Refrigerante 2L Coca Cola Zero', 'Água gaseificada, extrato de noz de cola, cafeína, aroma natural, corante caramelo IV, acidulante ácido fosfórico, edulcorantes ciclamato de sódio (27mg), acessulfame de potássio (15mg) e aspartame (12mg) por 100ml, conservador benzoato de sódio e estabilizante citrato de sódio. Não contém glúten.', 12.00, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Refrigerante 1L Coca Cola', 'Refrigerante com sabor único e refrescante, vendido em mais de 200 países e considerado uma das maiores marcas do mundo. Água gaseificada, açúcar, extrato de noz de cola, cafeína, corante caramelo IV, acidulante ácido fosfórico e aroma natural.', 7.50, 'em_falta'),
  ((select id from categories where name='Refrigerantes'), 'H2Oh Limão 500ml', null, 5.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'H2Oh Limoneto 500ml', null, 5.50, 'ativo'),
  ((select id from categories where name='Refrigerantes'), 'Refrigerante 1L Pepsi', 'Hoje, a Pepsi é um refrigerante de cola com aroma natural, muito apreciado pelo sabor suave e pela refrescância.', 6.00, 'ativo'),
  ((select id from categories where name='Combos'), 'Gold Label 750ml + 4 Red Bull 250ml + Gelo Cubo 3kg', null, 299.00, 'ativo'),
  ((select id from categories where name='Combos'), 'Gin Rocks Melancia+Baly Melancia + Gelo Cubo 3kg + Gelo Melancia', null, 59.00, 'ativo'),
  ((select id from categories where name='Combos'), 'Gin Rocks Tradicional+Tradicional+ Gelo Cubo 3kg', null, 59.00, 'ativo'),
  ((select id from categories where name='Combos'), 'Old Parr1L+Night Power 2L+ Gelo Cubo 3kg', null, 149.90, 'ativo'),
  ((select id from categories where name='Combos'), 'Black white 1L+Night Power 2L+Gelo Cubo 3kg', null, 85.00, 'ativo'),
  ((select id from categories where name='Combos'), 'Gin Rocks Maçã Verde+Baly Maçã Verde+Gelo Cubo 3kg', null, 59.00, 'ativo'),
  ((select id from categories where name='Combos'), '🍉 Combo Gin Invictus Melancia', 'Gin Invictus Melancia 900ml + Baly Melancia + Gelo Saborizado de Melancia + Gelo em Cubo 3kg.', 59.00, 'ativo'),
  ((select id from categories where name='Combos'), 'Combo Gin Invictus Morango', '🍓 Combo Gin Invictus Morango

Gin Invictus Strawberry 900ml + Baly Morango e Pêssego + Gelo Saborizado de Morango 180g + Gelo em Cubo 3kg.', 59.00, 'ativo'),
  ((select id from categories where name='Combos'), 'Red Label 1L + 1 Energético Night Power 2L + 1 Gelo em Cubos - 3kg', null, 115.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Monster Energy Ultra 473ml', null, 12.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Monster Ultra Paradise Sem Açúcar 473ML', null, 12.00, 'em_falta'),
  ((select id from categories where name='Energéticos'), 'Energético Monster Tradicional 473ml', 'Feito à base de cafeína, Cola, taurina e ginseng, este energético oferece uma dose monstro de energia e disposição com um delicioso sabor cítrico. Com apenas 93 calorias por porção, sua fórmula garante a energia necessária para qualquer situação. A lata do energético mais animal do planeta é inconfundível.', 12.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Monster Tradicional Sem Açúcar 473ML', null, 12.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Energético Mango loco 473ml', 'Energético Monster Energy 473ml é uma bebida energética à base de taurina e cafeína, uma dose de energia e disposição monstro com um delicioso sabor cítrico. Sua fórmula garante a energia necessária para o que for, com apenas 93 calorias por porção.', 12.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Bally Maçã Verde 2L', null, 17.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Bally Melancia 2L', null, 17.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Monster Pacific Punch 473ML', null, 12.00, 'em_falta'),
  ((select id from categories where name='Energéticos'), 'Night Power 2L', 'Descubra a energia que você precisa para enfrentar o dia com a bebida energética Night Power. Com um sabor tradicional que agrada a todos, esta garrafa de 2 litros é perfeita para compartilhar com amigos ou para ter sempre à mão em momentos de necessidade.', 11.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Baly Morango e Pessego 2L', null, 17.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Baly Tropical 2L', null, 17.00, 'em_falta'),
  ((select id from categories where name='Energéticos'), 'Baly Tradicional 2L', 'O Energético Baly Tradicional 2L oferece uma poderosa combinação de cafeína, taurina, vitaminas do complexo B e um sabor marcante, ideal para quem busca energia e disposição durante o dia. Sua grande embalagem de 2 litros é perfeita para festas, eventos ou para quem precisa de uma dose contínua de energia.', 17.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Red Bull Zero 250ml', null, 10.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Monster Absolutely Zero 473ml', null, 12.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Monster Fiesta Mango Zero 473ml', null, 12.00, 'em_falta'),
  ((select id from categories where name='Energéticos'), 'Energético Redbull 250ml', 'A fórmula especial do Red Bull Energy Drink contém ingredientes da mais alta qualidade: Cafeína, Taurina, Vitaminas do grupo B, Açúcares, água. Uma lata de 250 ml de Red Bull Energy Drink contém 80 mg de cafeína, aproximadamente a mesma quantidade de uma xícara de café.', 10.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'RED BULL MELANCIA 250ML', null, 10.50, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Energético Monster  juice Pipeline 473ml', 'Energético Monster Energy 473ml é uma bebida energética à base de taurina e cafeína, uma dose de energia e disposição monstro com um delicioso sabor cítrico. Sua fórmula garante a energia necessária para o que for, com apenas 93 calorias por porção.', 12.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Night Power Melancia 1L', null, 12.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Monster Ultra Watermelon Sem Açúcar 473ML', null, 12.00, 'ativo'),
  ((select id from categories where name='Energéticos'), 'Red Bull 472 ml', 'Água gaseificada, sacarose, glucose, taurina (1892mg/472ml), vitaminas (B3, B5, B6, B2, B12), acidulante ácido cítrico, reguladores de acidez: bicarbonato de sódio e bicarbonato de magnésio, aromatizantes, corante caramelo I.', 18.00, 'em_falta'),
  ((select id from categories where name='Energéticos'), 'Night Power Maçã Verde 1L', null, 12.00, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), '24 x Amstel Litrinho 300ml', null, 70.00, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), 'Amstel Litrinho 300ml', null, 3.30, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), 'Original Litrinho 300ml', 'Cerveja do tipo Pilsen, tem sabor suave, com leve amargor e aroma de lúpulo. A alta carbonatação garante a refrescância, fazendo desta uma das cervejas favoritas dos brasileiros. INGREDIENTES: Água, malte, milho e lúpulo.', 3.50, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), '23 x Original Litrinho 300ml', null, 80.00, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), '23 x Skol Litrinho 300ml', null, 69.00, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), '23 x Brahma Chopp Litrinho 300ml', null, 67.00, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), 'Brahma Chopp Litrinho 300ml', 'Ela é leve e com aroma neutro, sabor encorpado mas com amargor suave. Foi a primeira cerveja brasileira a ser exportada e hoje está presente em mais de 15 países, entre América do Norte e Europa. *Atenção: É Necessário Levar o Vasilhame!', 3.20, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), '23 x Bohemia Litrinho 300ml', null, 69.00, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), 'Itaipava Litrinho 300ml', 'Elaborada a partir de ingredientes selecionados, é a única no Brasil com a pura água de Petrópolis. Possui selo protetor que garante a integridade do produto desde a fábrica até chegar ao consumidor. Graduação alcoólica 4,5%vol. Conteúdo 300ml.', 2.80, 'em_falta'),
  ((select id from categories where name='Cervejas Buchudinhas'), 'Bohemia Litrinho 300ml', 'Clara, leve e muito refrescante, é produzida com malte 100% importado e lúpulo Saaz, da República Tcheca. Seu aroma levemente frutado é marcado por notas leves de malte e lúpulo.', 3.30, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), 'Skol Litrinho 300ml', 'A Cerveja Skol 300ml Pilsen Retornável é a escolha perfeita para aqueles que buscam um sabor clássico e autêntico, combinado com o compromisso de preservar o meio ambiente.', 3.25, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), 'Brahma Duplo Malte Litrinho 300ml', 'O malte Pilsner é o responsável pela leveza, enquanto o malte Munich é o responsável pelo sabor. O resultado disso é uma cerveja de cor dourada e espuma cremosa. Uma cerveja que tem mais sabor, mas ainda mantém a leveza. Este produto não é vendido individualmente.', 3.50, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), 'Devassa Litrinho 300ml', 'Devassa é uma cerveja puro malte tropical, ou seja, feita apenas com água, malte, lúpulo e um toque tropical. Mas o que significa “tropical”? É o segredo para produzir um puro malte adaptado ao clima e paladar brasileiro, com maltes 100% naturais e receita livre de aditivos.', 3.00, 'ativo'),
  ((select id from categories where name='Cervejas Buchudinhas'), '23 x Brahma Duplo Malte Litrinho 300ml', null, 80.00, 'ativo'),
  ((select id from categories where name='Cachaça'), 'Ypioca Prata 1L', null, 18.00, 'ativo'),
  ((select id from categories where name='Cachaça'), 'Ypioca 150 Anos 700ml', null, 65.00, 'ativo'),
  ((select id from categories where name='Cachaça'), 'Ypioca Ouro 1L', null, 23.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Bohemia Lata 350ml', 'Clara, leve e muito refrescante, é produzida com malte 100% importado e lúpulo Saaz, da República Tcheca. Seu aroma levemente frutado é marcado por notas leves de malte e lúpulo. Criada em 1853 pelo alemão Henrique Kremer, Bohemia é a primeira cerveja do Brasil.', 3.75, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Devassa Lata 350ml', 'Com um sabor marcante e suave ao mesmo tempo, é ideal para qualquer ocasião, seja para acompanhar um churrasco entre amigos ou relaxar após um longo dia. Feita com maltes selecionados que garantem qualidade superior, cada gole revela o cuidado e a tradição da Devassa na arte de fazer cerveja.', 3.50, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Amstel Lata 350ml', 'A Amstel Lata 350ml é uma cerveja lager puro malte apreciada em mais de 110 países. Com receita europeia, ingredientes naturais e sem aditivos, levamos mais do que uma cerveja puro malte: levamos o espírito de Amsterdam para o mundo.', 4.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Petra Lata 350ml', 'Cerveja Petra Puro Malte é uma cerveja de baixo teor alcoólico, com sabor suave e refrescante. É produzida com maltes selecionados e lúpulos especiais, que lhe conferem um aroma único. Possui cor dourada e espuma cremosa.', 3.65, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Brahma  Chopp  Lata 350ml', null, 3.50, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Petra Lata 350ml', null, 44.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Spaten  Lata 350ml', null, 57.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Amstel Lata 350ml', null, 48.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Brahma Duplo Malte Lata 350ml', 'Cerveja Brahma Duplo Malte Lata. Brahma Duplo Malte possui dois tipos de malte, uma combinação surpreendente entre a leveza do Malte Pilsen e o sabor do Malte Munich: equilíbrio perfeito entre sabor e refrescância. Temos uma cerveja puro malte dourada e com aquela espuma cremosa que você já ama.', 4.20, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Bohemia Lata 350ml', null, 42.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Heineken Lata 350ml', null, 69.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Spaten Lata 350ml', 'A cerveja Spaten Puro Malte 269ml é uma bebida premium, produzida com ingredientes selecionados e seguindo a tradicional receita alemã. Possui sabor encorpado e refrescante, com notas marcantes de malte e lúpulo, ideal para apreciadores de cervejas de qualidade. A embalagem de 269ml é perfeita para momentos de descontração e celebração, garantindo uma experiência única e autêntica.', 5.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Skol Lata 350ml', 'Cerveja Skol é uma cerveja leve, refrescante e de sabor suave. Possui aroma frutado e notas de lúpulo. É produzida com ingredientes de qualidade, como malte, água, lúpulo e levedura. A lata de 350ml é ideal para compartilhar com amigos e curtir momentos especiais.', 3.85, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Skol Lata 350ml', null, 45.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Cerveja Budweiser Lata 350ml', null, 4.80, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Devassa Lata 350ml', null, 42.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Brahma Chopp Lata 350ml', null, 42.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Budweiser Lata 350ml', null, 54.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Heineken Lata 350ml', 'É por isso que nenhuma outra cerveja tem o gosto de Heineken. Na icônica versão em Lata 350ml sleek, ela está mais moderna, ainda mais refrescante e gelada bem rápido. A Heineken foi criada para ser a melhor cerveja do mundo desde 1873. Algumas coisas são boas demais para mudar!', 5.85, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Itaipava Lata 350ml', null, 39.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Itaipava Lata 350ml', null, 3.25, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Lokal Lata 350ml', null, 3.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Lokal Lata 350ml', null, 36.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Corona 350ml', null, 6.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '8 x Stella Lata 350ml', null, 44.00, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), '12 x Brahma Duplo Malte 350ml', null, 49.90, 'ativo'),
  ((select id from categories where name='Cervejas Latas'), 'Stella Lata 350ml', 'Com mais de 600 anos de tradição, a receita da Cerveja Stella Artois 330 ml foi criada como um presente de Natal para os habitantes de Leuven, na Bélgica. Stella significa ''estrela'', em latim, e foi uma homenagem à ocasião de sua criação. Sua cor cristalina e aroma suave com notas maltadas são resultados do lúpulo tcheco Saazner, utilizado na produção. O sabor único desta Premium American Lager combina perfeitamente com pratos de bacalhau e camarão.', 5.50, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Busca Brisa 1L', null, 58.00, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Bob Pinga 1L', null, 40.00, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Ice Cabaré Frutas Amarelas 275ML', 'A marca lança o Cabaré Ice, uma bebida alcoólica mista Frutas Amarela, vodka e cachaça Cabaré. Extremamente refrescante, o Cabaré Ice tem sabor limão, com embalagem de 275ml (longneck) e teor alcoólico de 5%. Graduação Alcoólica 5%.', 7.50, 'em_falta'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Ice Cabaré Frutas Vermelhas 275ML', 'A Ice Cabaré Frutas Vermelhas é uma bebida alcoólica mista, pronta para beber, com sabor de frutas vermelhas. É feita com saquê, vodka e cachaça Cabaré Prata.', 7.50, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Smirnoff Ice 275ML', 'Smirnoff é uma das marcas de vodka mais premiada do mundo. É a escolha ideal para curtir os bons momentos com os amigos. Possui leve toque de limão e é a marca pioneira no segmento de bebidas prontas para beber, trazendo toda a qualidade da marca Smirnoff.', 8.50, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Skol Beats red mix Lata 269ML', null, 6.50, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Skol Beats Red Mix Long 269ml', null, 7.50, 'em_falta'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Skol Beats Green Mix Long269ml', null, 7.50, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Skol Beats Tropical Long 269ml', null, 7.50, 'em_falta'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Skol Beats Senses', 'Com características cítricas, levemente doce e com teor alcoólico de 8%, acima da maioria das bebidas. A bebida à base de cerveja busca ser mais suave e refrescante ao paladar, e é a primeira e única bebida à base de cerveja que pode ser consumida com gelo. Graduação Alcoólica 7,9%.', 6.50, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Skol Beats Senses Long 269ml', null, 7.50, 'em_falta'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Drink Mançao Maromba Whisky 1L', null, 19.90, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Skol Beats Caipirinha LT269ml', 'A novidade Caipi Beats é preparada com cachaça, trazendo o sabor da bebida mais brasileira, a caipirinha. A bebida tem 7,9% de teor alcoólico.', 5.50, 'em_falta'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Drink Mançao Maromba Maçã 1L', null, 19.90, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Ice Cabaré Limão 275ML', 'marca lança o Cabaré Ice, uma bebida alcoólica mista à base de saquê, vodka e cachaça Cabaré Prata. Extremamente refrescante, o Cabaré Ice tem sabor limão, com embalagem de 275ml (longneck) e teor alcoólico de 5%. Graduação Alcoólica 5%. Contém 275ml.', 7.50, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Drink Mançao Maromba Vodka 1L', null, 19.90, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Drink Mançao Maromba Gin Tropical 1L', null, 19.90, 'em_falta'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Drink Mançao Maromba Whisky e Cereja 1L', null, 19.90, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Skol Beats GT LT269ml', 'O Drink Pronto Beats Drinks GT de 269ml é uma deliciosa opção para os amantes de Gin&Tônica. Com sabor autêntico, refrescante e prático, é perfeito para qualquer ocasião. Feito com ingredientes de alta qualidade, proporcionando um gostinho único e marcante. Experimente já!', 6.50, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Skol Beats Tropical LT 269ml', 'O Drink Pronto Beats Tropical 269ml Lata é a combinação perfeita de sabores refrescantes e tropicais. Com um mix exclusivo de frutas exóticas, esse delicioso drink é a escolha ideal para quem busca praticidade e sabor em um só produto. Experimente agora e se surpreenda!', 6.50, 'ativo'),
  ((select id from categories where name='Ice, Beats e Drinks'), 'Skol Beats Green Mix  Lata 269ml', null, 6.50, 'ativo'),
  ((select id from categories where name='Destilados e Licores'), 'Balena Morango 750ml', null, 150.00, 'ativo'),
  ((select id from categories where name='Destilados e Licores'), 'Campari 998ml', null, 59.00, 'em_falta'),
  ((select id from categories where name='Vinhos'), 'Vinho Vale Real 900ML', 'Vinho tinto encorpado, com aromas frutados e notas de especiarias. Perfeito para harmonizar com carnes vermelhas e queijos.', 7.00, 'em_falta'),
  ((select id from categories where name='Vinhos'), 'Vinho São Braz 900ML', 'Coquetel de vinho tinto suave, de paladar frutado e adocicado. Perfeito para acompanhar bons encontros e momentos de diversão.', 10.00, 'ativo'),
  ((select id from categories where name='Vinhos'), 'Vinho Quinto do Morgado 750ML', 'Vinho Quinta do Morgado 750ml: Escolha perfeita para apreciadores de vinhos encorpados e marcantes. Acompanha todos os pratos.', 19.00, 'ativo'),
  ((select id from categories where name='Vinhos'), 'Vinho Pérgola Tinto Suave 1L', null, 32.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Trident Menta 8g', null, 3.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Halls Extra Forte27,5g', null, 2.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Halls Menta', null, 2.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Trident de Morango 8g', null, 3.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Baton Garoto Ao Leite16g', null, 2.20, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Trident Hortelã 8g', null, 3.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Salgadinho Torcida Cebola 60g', null, 3.50, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Amendoim Japonês 45g', null, 2.50, 'em_falta'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Salgadinho Cheetos Lua Parmesão 35g', null, 5.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Salgadinho Bola De Queijo Suiço 35g', null, 5.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Salgadinho Torcida Churrasco 60g', null, 3.50, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Sensaçoes Frango Grelhado 35g', null, 6.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Salgadinho Torcida Pimenta Mexicana 60g', null, 3.50, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Amendoim Japonês 145g', null, 9.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Baton Garoto Branco 16g', null, 2.20, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Pringles Sabor Churrasco 109g', null, 12.00, 'em_falta'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Doritos Queijo', null, 11.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Ruffles Churrasco 68g', null, 11.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Salgadinho Torcida Costelinha Com Limao 60g', null, 3.50, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Salgadinho Torcida Queijo 60G', null, 3.50, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Pringles Sabor Queijo 109g', null, 12.00, 'em_falta'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Ruffles Original 68g', null, 11.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Pringles Sabor Cheddar e Bacon 109g', null, 12.00, 'em_falta'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Cheetos  Onda Requeijao 39g', null, 5.00, 'ativo'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Pringles Sabor Creme e Cebola 109g', null, 12.00, 'em_falta'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Pringles Sabor Original 109g', null, 12.00, 'em_falta'),
  ((select id from categories where name='Guloseimas e Salgadinhos'), 'Trident De Melancia 8g', null, 3.00, 'ativo'),
  ((select id from categories where name='Cervejas Longnecks'), 'Michelob Ultra 330ml', null, 7.00, 'ativo'),
  ((select id from categories where name='Cervejas Longnecks'), 'Corona 330ml', null, 7.80, 'ativo'),
  ((select id from categories where name='Cervejas Longnecks'), 'Império Ultra 275ml', null, 6.25, 'ativo'),
  ((select id from categories where name='Cervejas Longnecks'), 'Amstel Ultra 275ml', null, 6.50, 'ativo'),
  ((select id from categories where name='Cervejas Longnecks'), 'Budweiser 330ml', null, 6.20, 'ativo'),
  ((select id from categories where name='Cervejas Longnecks'), 'Stella 330ml', null, 7.00, 'ativo'),
  ((select id from categories where name='Cervejas Longnecks'), 'Spaten 355ml', null, 6.49, 'ativo'),
  ((select id from categories where name='Cervejas Longnecks'), 'Stella Pure Gold 330ml', null, 7.80, 'ativo'),
  ((select id from categories where name='Cervejas Longnecks'), 'Heineken 330ml', null, 7.00, 'ativo'),
  ((select id from categories where name='Águas'), 'Agua Prime 1.5L', null, 5.00, 'em_falta'),
  ((select id from categories where name='Águas'), 'Água Prime S Gas 500ml', 'Água Mineral Sem Gás 500ml: Puríssima água obtida a partir de fontes naturais distribuídas em todo o Brasil, com equilibrada relação de sais minerais, proporcionando refrescância e saciedade para quem consome este produto.', 2.00, 'ativo'),
  ((select id from categories where name='Águas'), 'Água Naturagua com Gás 500ml', 'A água purificada adicionada de sais ILUMINÁGUA é uma água preparada artificialmente a partir da captação de um poço profundo, purificada através de um sistema de osmose reversa e adicionada de sais. Localizada em Aquiara na área rural e preservada longe de qualquer agente contaminador dos lençóis freáticos que garante sua alta pureza já em sua extração.', 3.00, 'ativo'),
  ((select id from categories where name='Gin'), 'Gin Rocks Melancia 1L', null, 39.00, 'ativo'),
  ((select id from categories where name='Gin'), 'Gin invictus Morango 900ml', null, 29.90, 'ativo'),
  ((select id from categories where name='Gin'), 'Gin Beefeater 750ML', 'O Beefeater London Dry tem um sabor extremamente puro, com um ousado caráter de zimbro que é equilibrado com fortes notas cítricas, tornando-o o gin perfeito para desfrutar com a tônica de sua preferência. O sabor perfeitamente equilibrado garante uma alta flexibilidade para drinks.', 99.90, 'ativo'),
  ((select id from categories where name='Gin'), 'Gin Bombay 750ml', 'Bebida inglesa composta de destilado alcoólico retificado e extratos vegetais aromáticos. O incomparável sabor de Bombay Sapphire é resultado de uma cuidadosa seleção de ervas aromáticas e um exclusivo processo de destilação, proporcionando um aroma único e agradável.', 99.90, 'ativo'),
  ((select id from categories where name='Gin'), 'GIN TANQUERAY 750ML', null, 104.90, 'ativo'),
  ((select id from categories where name='Gin'), 'Gin Invictus Melancia 900ml', null, 29.90, 'ativo'),
  ((select id from categories where name='Gin'), 'Gin Rocks Maçã Verde 1L', null, 39.00, 'ativo'),
  ((select id from categories where name='Gin'), 'Gin Rocks Tradicional 1L', 'O Gin Rock’s é obtido pela destilação de um composto alcoólico retificado, na presença de bagas de zimbro, adquirindo os aromas e características dessa fruta. Quanto à maneira de beber, em geral, é servido no tradicional drink gin-tônica: água tônica, uma ou duas doses de gin, rodelas de limão e bastante gelo.', 39.00, 'ativo'),
  ((select id from categories where name='Gin'), 'GIN MORANGO', null, 39.90, 'ativo'),
  ((select id from categories where name='Tabacaria'), 'Lucky Strike Double Ice', null, 18.00, 'em_falta'),
  ((select id from categories where name='Tabacaria'), 'Rothmans Azul', null, 13.50, 'em_falta'),
  ((select id from categories where name='Tabacaria'), 'Cigarro Rothmans Internacional Double', null, 16.00, 'em_falta'),
  ((select id from categories where name='Tabacaria'), 'Cigarro Rothmans Tropical Boost', null, 15.00, 'em_falta'),
  ((select id from categories where name='Tabacaria'), 'Cigarro Dunhill Double Refresh', null, 18.00, 'em_falta'),
  ((select id from categories where name='Tabacaria'), 'Cigarro Rothmans Internacional', null, 15.00, 'em_falta'),
  ((select id from categories where name='Tabacaria'), 'Dunhill Red', null, 15.50, 'em_falta'),
  ((select id from categories where name='Tabacaria'), 'Cigarro Dunhill', null, 18.00, 'em_falta'),
  ((select id from categories where name='Tabacaria'), 'Rothmans Prata', null, 13.50, 'em_falta');

-- Complemento "Gelo Sabores" (como no Cardápio Web)
insert into complement_groups (name, min_select, max_select, allow_repeat) values ('Gelo Sabores', 0, 1000, true);
insert into complement_options (group_id, name, price, sort_order)
select (select id from complement_groups where name='Gelo Sabores'), n, 4.00, o
from (values ('Melancia',1),('Maçã Verde',2),('Limão',3),('Morango',4),('Água de Coco',5),
             ('Sabor Energético',6),('Laranja',7),('Maracujá',8)) as t(n,o);
