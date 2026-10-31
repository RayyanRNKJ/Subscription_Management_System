-- Finance dashboard aggregates and the paginated overdue invoice list.
-- Both functions run as the caller so table RLS remains in force.

create index if not exists idx_subscriptions_active_plan_customer
  on public.subscriptions (plan_id, customer_id)
  where status = 'active';

create index if not exists idx_subscription_lines_subscription_amount
  on public.subscription_lines (subscription_id)
  include (quantity, unit_price);

create index if not exists idx_payments_paid_on_invoice
  on public.payments (paid_on, invoice_id);

create index if not exists idx_invoices_confirmed_due_customer
  on public.invoices (due_date, customer_id, subscription_id)
  where status = 'confirmed';

create or replace function public.dashboard_summary(
  p_from date,
  p_to date,
  p_plan uuid default null,
  p_customer uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
with
active_totals as (
  select count(*)::bigint as amount
  from public.subscriptions s
  where s.status = 'active'
    and (p_plan is null or s.plan_id = p_plan)
    and (p_customer is null or s.customer_id = p_customer)
),
revenue_total as (
  select coalesce(sum(pay.amount), 0)::numeric(14,2) as amount
  from public.payments pay
  join public.invoices i on i.id = pay.invoice_id
  join public.subscriptions s on s.id = i.subscription_id
  where pay.paid_on between p_from and p_to
    and (p_plan is null or s.plan_id = p_plan)
    and (p_customer is null or i.customer_id = p_customer)
),
invoice_totals as (
  select
    coalesce(sum(b.balance) filter (where i.status = 'confirmed'), 0)::numeric(14,2) as outstanding,
    count(*) filter (where i.status = 'confirmed' and i.due_date < current_date and b.balance > 0)::bigint as overdue_count,
    coalesce(sum(b.balance) filter (where i.status = 'confirmed' and i.due_date < current_date and b.balance > 0), 0)::numeric(14,2) as overdue_amount
  from public.invoices i
  join public.invoice_balances b on b.invoice_id = i.id
  join public.subscriptions s on s.id = i.subscription_id
  where (p_plan is null or s.plan_id = p_plan)
    and (p_customer is null or i.customer_id = p_customer)
),
recurring_lines as (
  select sl.subscription_id, sum(sl.quantity * sl.unit_price)::numeric(14,2) as line_total
  from public.subscription_lines sl
  group by sl.subscription_id
),
mrr_total as (
  select coalesce(sum(
    (coalesce(p.price, 0) + coalesce(rl.line_total, 0)) *
    case p.period
      when 'daily' then 30
      when 'weekly' then 52.0 / 12.0
      when 'monthly' then 1
      when 'yearly' then 1.0 / 12.0
    end
  ), 0)::numeric(14,2) as amount
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  left join recurring_lines rl on rl.subscription_id = s.id
  where s.status = 'active'
    and not coalesce(s.paused, false)
    and (p_plan is null or s.plan_id = p_plan)
    and (p_customer is null or s.customer_id = p_customer)
),
portal_subscription_totals as (
  -- This result is intentionally populated only for the portal's single-customer call.
  select s.id,
         (coalesce(p.price, 0) + coalesce(sum(sl.quantity * sl.unit_price), 0))::numeric(14,2) as total
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  left join public.subscription_lines sl on sl.subscription_id = s.id
  where p_customer is not null
    and s.customer_id = p_customer
    and (p_plan is null or s.plan_id = p_plan)
  group by s.id, p.price
),
months as (
  select generate_series(
    date_trunc('month', current_date)::date - interval '5 months',
    date_trunc('month', current_date)::date,
    interval '1 month'
  )::date as month
),
monthly_revenue as (
  select date_trunc('month', pay.paid_on)::date as month,
         sum(pay.amount)::numeric(14,2) as amount
  from public.payments pay
  join public.invoices i on i.id = pay.invoice_id
  join public.subscriptions s on s.id = i.subscription_id
  where pay.paid_on >= date_trunc('month', current_date)::date - interval '5 months'
    and pay.paid_on < date_trunc('month', current_date)::date + interval '1 month'
    and (p_plan is null or s.plan_id = p_plan)
    and (p_customer is null or i.customer_id = p_customer)
  group by date_trunc('month', pay.paid_on)::date
),
status_values(status) as (
  values ('draft'::public.inv_status), ('confirmed'::public.inv_status),
         ('paid'::public.inv_status), ('cancelled'::public.inv_status)
),
status_counts as (
  select sv.status::text as status, count(i.id)::bigint as amount
  from status_values sv
  left join public.invoices i
    on i.status = sv.status
   and i.issue_date between p_from and p_to
   and (p_customer is null or i.customer_id = p_customer)
   and (p_plan is null or exists (
     select 1 from public.subscriptions s where s.id = i.subscription_id and s.plan_id = p_plan
   ))
  group by sv.status
)
select jsonb_build_object(
  'active_subscriptions', (select amount from active_totals),
  'revenue_collected', (select amount from revenue_total),
  'outstanding', (select outstanding from invoice_totals),
  'overdue_count', (select overdue_count from invoice_totals),
  'overdue_amount', (select overdue_amount from invoice_totals),
  'mrr', (select amount from mrr_total),
  'subscription_totals', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'total', total) order by id)
    from portal_subscription_totals
  ), '[]'::jsonb),
  'revenue_by_month', coalesce((
    select jsonb_agg(jsonb_build_object(
      'month', to_char(m.month, 'YYYY-MM'),
      'revenue', coalesce(r.amount, 0)
    ) order by m.month)
    from months m left join monthly_revenue r on r.month = m.month
  ), '[]'::jsonb),
  'invoice_status_counts', coalesce((
    select jsonb_agg(jsonb_build_object('status', status, 'count', amount) order by status)
    from status_counts
  ), '[]'::jsonb)
);
$function$;

create or replace function public.dashboard_overdue(
  p_page integer default 1,
  p_page_size integer default 25,
  p_plan uuid default null,
  p_customer uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
with overdue as (
  select i.id,
         i.number,
         coalesce(nullif(btrim(c.full_name), ''), c.email) as customer_name,
         c.email as customer_email,
         i.due_date,
         (current_date - i.due_date)::integer as days_overdue,
         b.balance
  from public.invoices i
  join public.invoice_balances b on b.invoice_id = i.id
  join public.profiles c on c.id = i.customer_id
  join public.subscriptions s on s.id = i.subscription_id
  where i.status = 'confirmed'
    and i.due_date < current_date
    and b.balance > 0
    and (p_plan is null or s.plan_id = p_plan)
    and (p_customer is null or i.customer_id = p_customer)
),
page_rows as (
  select *
  from overdue
  order by due_date asc, id asc
  limit least(100, greatest(1, coalesce(p_page_size, 25)))
  offset (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)))
)
select jsonb_build_object(
  'total', (select count(*) from overdue),
  'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'number', number,
      'customer_name', customer_name,
      'customer_email', customer_email,
      'due_date', due_date,
      'days_overdue', days_overdue,
      'balance', balance
    ) order by due_date asc, id asc)
    from page_rows
  ), '[]'::jsonb)
);
$function$;

revoke all on function public.dashboard_summary(date, date, uuid, uuid) from public, anon;
grant execute on function public.dashboard_summary(date, date, uuid, uuid) to authenticated;
revoke all on function public.dashboard_overdue(integer, integer, uuid, uuid) from public, anon;
grant execute on function public.dashboard_overdue(integer, integer, uuid, uuid) to authenticated;
