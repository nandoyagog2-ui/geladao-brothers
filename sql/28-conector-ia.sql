-- =========================================================
--  VYNTRA — parte 28 · CONECTOR DE IA (Claude / ChatGPT)
--  Relatórios que o conector usa: resumo de vendas e produtos mais vendidos.
--  Cada pessoa só enxerga a própria loja (pelo login).
--  Pode rodar mais de uma vez sem problema.
-- =========================================================

-- fuso da loja (padrão: Fortaleza)
create or replace function store_tz() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select timezone from store_settings where id = my_store()), ''), 'America/Fortaleza');
$$;
grant execute on function store_tz() to authenticated;
revoke execute on function store_tz() from anon, public;

-- Resumo de vendas no período (sem cancelados)
-- p_group: nenhum | dia | dia_semana | hora | pagamento | tipo
create or replace function mcp_sales(p_from timestamptz, p_to timestamptz, p_group text default 'nenhum')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_store bigint := my_store(); v_tz text := store_tz(); v_tot jsonb; v_groups jsonb;
begin
  if v_store is null then raise exception 'Faça login'; end if;
  if not (is_owner() or staff_can('resumo')) then raise exception 'Você não tem permissão pra ver as vendas'; end if;
  if p_to - p_from > interval '400 days' then raise exception 'Período máximo: 400 dias'; end if;

  select jsonb_build_object(
      'pedidos', count(*),
      'faturamento', coalesce(round(sum(o.total), 2), 0),
      'ticket_medio', coalesce(round(avg(o.total), 2), 0),
      'produtos', coalesce(round(sum(o.subtotal), 2), 0),
      'taxas_entrega', coalesce(round(sum(o.delivery_fee), 2), 0),
      'descontos', coalesce(round(sum(o.discount), 2), 0),
      'custo_produtos', coalesce(round((select sum(i.unit_cost * i.qty) from order_items i
                          join orders x on x.id = i.order_id
                          where x.store_id = v_store and x.status <> 'cancelado'
                            and x.created_at >= p_from and x.created_at < p_to), 2), 0),
      'cancelados', (select count(*) from orders c where c.store_id = v_store and c.status = 'cancelado'
                       and c.created_at >= p_from and c.created_at < p_to))
    into v_tot
    from orders o
   where o.store_id = v_store and o.status <> 'cancelado' and o.created_at >= p_from and o.created_at < p_to;

  v_tot := v_tot || jsonb_build_object('lucro_bruto_produtos',
            round((v_tot->>'produtos')::numeric - (v_tot->>'descontos')::numeric - (v_tot->>'custo_produtos')::numeric, 2),
            'obs_lucro', 'Lucro = produtos - descontos - custo. Só é exato se todos os produtos têm custo cadastrado.');

  if coalesce(p_group, 'nenhum') <> 'nenhum' then
    select coalesce(jsonb_agg(g order by g->>'chave'), '[]') into v_groups from (
      select jsonb_build_object(
               'chave', k,
               'pedidos', count(*),
               'faturamento', round(sum(total), 2),
               'ticket_medio', round(avg(total), 2)) g
        from (select o.total,
                case p_group
                  when 'dia'        then to_char(o.created_at at time zone v_tz, 'YYYY-MM-DD')
                  when 'dia_semana' then to_char(o.created_at at time zone v_tz, 'ID') || '-' ||
                                         (array['seg','ter','qua','qui','sex','sab','dom'])[extract(isodow from o.created_at at time zone v_tz)::int]
                  when 'hora'       then to_char(o.created_at at time zone v_tz, 'HH24') || 'h'
                  when 'pagamento'  then coalesce(nullif(o.payment_method, ''), 'não informado')
                  when 'tipo'       then coalesce(o.type, '?')
                  else 'total' end as k
                from orders o
               where o.store_id = v_store and o.status <> 'cancelado'
                 and o.created_at >= p_from and o.created_at < p_to) s
       group by k) t;
    v_tot := v_tot || jsonb_build_object('grupos', v_groups);
  end if;
  return v_tot;
end $$;
revoke execute on function mcp_sales(timestamptz, timestamptz, text) from anon, public;
grant execute on function mcp_sales(timestamptz, timestamptz, text) to authenticated;

-- Produtos mais vendidos no período
-- p_order: faturamento | quantidade
create or replace function mcp_top_products(p_from timestamptz, p_to timestamptz, p_limit int default 20, p_order text default 'faturamento')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_store bigint := my_store(); r jsonb;
begin
  if v_store is null then raise exception 'Faça login'; end if;
  if not (is_owner() or staff_can('resumo')) then raise exception 'Você não tem permissão pra ver as vendas'; end if;
  select coalesce(jsonb_agg(x), '[]') into r from (
    select i.product_id as produto_id, max(i.name) as produto,
           sum(i.qty) as quantidade, round(sum(i.total), 2) as faturamento,
           round(sum(i.total) / nullif(sum(i.qty), 0), 2) as preco_medio,
           round(sum(i.unit_cost * i.qty), 2) as custo
      from order_items i join orders o on o.id = i.order_id
     where o.store_id = v_store and o.status <> 'cancelado'
       and o.created_at >= p_from and o.created_at < p_to
     group by i.product_id
     order by case when p_order = 'quantidade' then sum(i.qty) else sum(i.total) end desc
     limit greatest(1, least(coalesce(p_limit, 20), 200))) x;
  return r;
end $$;
revoke execute on function mcp_top_products(timestamptz, timestamptz, int, text) from anon, public;
grant execute on function mcp_top_products(timestamptz, timestamptz, int, text) to authenticated;

notify pgrst, 'reload schema';
