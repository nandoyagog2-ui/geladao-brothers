-- =========================================================
--  GELADÃO BROTHERS — parte 12
--  1) Horário de trabalho de cada funcionário (só entra no horário dele)
--  2) Financeiro completo: custo de cada venda (lucro real),
--     taxas da maquininha, despesas fixas e data de pagamento
--  Precisa das partes 9 e 11 rodadas antes.
-- =========================================================

-- ---------- 1) HORÁRIO DO FUNCIONÁRIO ----------
alter table store_settings add column if not exists timezone text default 'America/Fortaleza';
-- ex.: {"days":[1,2,3,4,5,6],"start":"08:00","end":"16:00"}  (0 = domingo) · vazio = qualquer horário
alter table staff add column if not exists schedule jsonb;

create or replace function staff_in_shift(p_schedule jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare tz text; t timestamp; d date; s timestamp; e timestamp; st time; en time;
begin
  if p_schedule is null or p_schedule = 'null'::jsonb or coalesce(p_schedule->>'start','') = '' then return true; end if;
  select coalesce(timezone, 'America/Fortaleza') into tz from store_settings where id = 1;
  t  := now() at time zone coalesce(tz, 'America/Fortaleza');
  st := (p_schedule->>'start')::time;
  en := (p_schedule->>'end')::time;
  foreach d in array array[t::date, t::date - 1] loop
    if p_schedule->'days' is null or (p_schedule->'days') @> to_jsonb(extract(dow from d)::int) then
      s := d + st - interval '30 minutes';                                    -- pode entrar 30 min antes
      e := d + en + (case when en <= st then interval '1 day' else interval '0' end) + interval '60 minutes'; -- 1h de tolerância
      if t between s and e then return true; end if;
    end if;
  end loop;
  return false;
end $$;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff s where s.user_id = auth.uid() and s.active and (
      s.role = 'dono'
      or staff_in_shift(s.schedule)
      or exists (select 1 from cash_sessions c where c.closed_at is null and c.user_id = s.user_id)  -- caixa dele aberto: deixa fechar
    ));
$$;

create or replace function my_access() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s staff;
begin
  select * into s from staff where user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'sem_cadastro'); end if;
  if not s.active then return jsonb_build_object('ok', false, 'reason', 'bloqueado', 'name', s.name); end if;
  if not is_staff() then return jsonb_build_object('ok', false, 'reason', 'fora_horario', 'name', s.name, 'schedule', s.schedule); end if;
  return jsonb_build_object('ok', true, 'role', s.role, 'name', coalesce(s.name, s.username), 'schedule', s.schedule);
end $$;
grant execute on function my_access() to authenticated;
grant execute on function staff_in_shift(jsonb) to authenticated;

-- regras de acesso mais rápidas (mesmas regras da parte 9)
do $$ declare t text; begin
  foreach t in array array['store_settings','categories','products','complement_groups',
    'complement_options','product_complements','product_suggestions','delivery_zones',
    'customers','credit_entries','coupons','orders','order_items','stock_movements',
    'cash_sessions','cash_movements','expenses','reviews'] loop
    execute format('drop policy if exists equipe_ve on %I', t);
    execute format('drop policy if exists dono_tudo on %I', t);
    execute format('drop policy if exists equipe_cria on %I', t);
    execute format('drop policy if exists equipe_altera on %I', t);
    execute format('create policy equipe_ve on %I for select to authenticated using ((select is_staff()))', t);
    execute format('create policy dono_tudo on %I for all to authenticated using ((select is_owner())) with check ((select is_owner()))', t);
  end loop;
  foreach t in array array['orders','order_items','customers','cash_sessions'] loop
    execute format('create policy equipe_cria on %I for insert to authenticated with check ((select is_staff()))', t);
    execute format('create policy equipe_altera on %I for update to authenticated using ((select is_staff())) with check ((select is_staff()))', t);
  end loop;
  foreach t in array array['credit_entries','cash_movements'] loop
    execute format('create policy equipe_cria on %I for insert to authenticated with check ((select is_staff()))', t);
  end loop;
end $$;

-- ---------- 2) FINANCEIRO ----------
-- custo de cada item no momento da venda (pra calcular o lucro real)
alter table order_items add column if not exists unit_cost numeric(10,2);

create or replace function product_unit_cost(p_id bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.cost_price, 0), nullif(par.cost_price, 0) * coalesce(p.stock_factor, 1))
  from products p left join products par on par.id = p.stock_parent_id where p.id = p_id;
$$;

create or replace function set_item_cost() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.unit_cost is null and new.product_id is not null then
    new.unit_cost := product_unit_cost(new.product_id);
  end if;
  return new;
end $$;
drop trigger if exists order_items_cost on order_items;
create trigger order_items_cost before insert on order_items for each row execute function set_item_cost();

-- preenche o custo das vendas antigas com o custo cadastrado hoje
create or replace function backfill_costs() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_owner() then raise exception 'Só o dono'; end if;
  update order_items i set unit_cost = product_unit_cost(i.product_id)
   where i.unit_cost is null and i.product_id is not null and product_unit_cost(i.product_id) is not null;
  get diagnostics n = row_count; return n;
end $$;
grant execute on function backfill_costs() to authenticated;
update order_items i set unit_cost = product_unit_cost(i.product_id)
 where i.unit_cost is null and i.product_id is not null;

-- taxas da maquininha / app (% por forma de pagamento)
alter table store_settings add column if not exists payment_fees jsonb default '{}'::jsonb;
alter table store_settings add column if not exists monthly_goal numeric(10,2);

-- despesas: data em que foi paga, forma, e despesa fixa todo mês
alter table expenses
  add column if not exists paid_at date,
  add column if not exists payment_method text,
  add column if not exists recurring boolean default false,
  add column if not exists notes text;
update expenses set paid_at = coalesce(due_date, created_at::date) where paid and paid_at is null;

notify pgrst, 'reload schema';
