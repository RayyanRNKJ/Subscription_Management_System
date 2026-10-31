-- Billing, invoice confirmation and manual payment functions.
-- These SECURITY DEFINER functions are callable only by service_role; API handlers
-- must perform the caller's role check before invoking them.

create or replace function public.run_billing(p_run_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_line record;
  v_discount_id uuid;
  v_discount_kind text;
  v_discount_value numeric(12,2);
  v_discount_amount numeric(12,2);
  v_invoice_discount numeric(12,2);
  v_used_discount_ids uuid[];
  v_run_date date := coalesce(p_run_date, current_date);
  v_next_date date;
  v_period_start date;
  v_period_end date;
  v_period_next date;
  v_invoice_id uuid;
  v_days integer;
  v_periods integer;
  v_total_qty integer;
  v_line_count integer;
  v_pre_discount_subtotal numeric(12,2);
  v_post_line_subtotal numeric(12,2);
  v_line_net numeric(12,2);
  v_allocated numeric(12,2);
  v_subtotal numeric(12,2);
  v_discount_total numeric(12,2);
  v_tax_total numeric(12,2);
  v_total numeric(12,2);
  v_local_created integer;
  v_local_skipped integer;
  v_created integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_auto_closed integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  -- Per-call working rows keep billing calculations in numeric SQL values.
  create temporary table if not exists billing_work_lines (
    line_no integer primary key,
    description text not null,
    product_id uuid,
    quantity integer not null,
    unit_price numeric(12,2) not null,
    tax_rate numeric(5,2) not null default 0,
    discount_amount numeric(12,2) not null default 0,
    tax_amount numeric(12,2) not null default 0,
    net_amount numeric(12,2) not null default 0
  ) on commit drop;

  -- Auto-close expired subscriptions before selecting due work.
  update public.subscriptions s
     set status = 'closed', paused = false
    from public.plans p
   where p.id = s.plan_id
     and s.status = 'active'
     and coalesce(p.auto_close, false)
     and ((s.expiry_date is not null and s.expiry_date < v_run_date)
       or (p.available_to is not null and p.available_to < v_run_date));
  get diagnostics v_auto_closed = row_count;

  for v_sub in
    select s.id, s.number, s.customer_id, s.payment_terms, s.expiry_date,
           s.next_billing_date, p.name as plan_name, p.price as plan_price,
           p.period, p.tax_id as plan_tax_id
      from public.subscriptions s
      join public.plans p on p.id = s.plan_id
     where s.status = 'active'
       and not coalesce(s.paused, false)
       and s.next_billing_date is not null
       and s.next_billing_date <= v_run_date
       and (s.expiry_date is null or s.next_billing_date <= s.expiry_date)
     order by s.next_billing_date, s.id
     for update of s skip locked
  loop
    v_local_created := 0;
    v_local_skipped := 0;
    begin
      v_next_date := v_sub.next_billing_date;
      v_periods := 0;
      v_days := coalesce(nullif(substring(coalesce(v_sub.payment_terms, '') from '[0-9]+'), '')::integer, 15);

      while v_next_date <= v_run_date
        and (v_sub.expiry_date is null or v_next_date <= v_sub.expiry_date)
        and v_periods < 12
      loop
        v_period_start := v_next_date;
        v_period_next := case v_sub.period
          when 'daily' then v_period_start + 1
          when 'weekly' then v_period_start + 7
          when 'monthly' then (v_period_start + interval '1 month')::date
          when 'yearly' then (v_period_start + interval '1 year')::date
        end;
        v_period_end := v_period_next - 1;
        truncate table pg_temp.billing_work_lines;
        v_used_discount_ids := array[]::uuid[];

        if coalesce(v_sub.plan_price, 0) > 0 then
          insert into pg_temp.billing_work_lines (line_no, description, product_id, quantity, unit_price, tax_rate)
          select 1, 'Plan fee — ' || v_sub.plan_name, null, 1, v_sub.plan_price, coalesce(t.rate, 0)
            from (select 1) seed left join public.taxes t on t.id = v_sub.plan_tax_id;
        end if;

        insert into pg_temp.billing_work_lines (line_no, description, product_id, quantity, unit_price, tax_rate)
        select coalesce((select max(line_no) from pg_temp.billing_work_lines), 0) + row_number() over (order by sl.id),
               p.name || case when pv.id is null then '' else ' (' || pv.attribute || ': ' || pv.value || ')' end,
               sl.product_id, sl.quantity, sl.unit_price, coalesce(t.rate, 0)
          from public.subscription_lines sl
          join public.products p on p.id = sl.product_id
          left join public.product_variants pv on pv.id = sl.variant_id
          left join public.taxes t on t.id = sl.tax_id
         where sl.subscription_id = v_sub.id;

        select count(*), coalesce(sum(quantity), 0), coalesce(sum(quantity * unit_price), 0)
          into v_line_count, v_total_qty, v_pre_discount_subtotal
          from pg_temp.billing_work_lines;
        if v_line_count = 0 then raise exception 'Subscription has no billable lines'; end if;

        -- Lock and apply the largest eligible product discount on each line.
        for v_line in select * from pg_temp.billing_work_lines order by line_no
        loop
          if v_line.product_id is not null then
            v_discount_id := null;
            select d.id, d.kind, d.value
              into v_discount_id, v_discount_kind, v_discount_value
              from public.discounts d
             where d.product_id = v_line.product_id
               and (d.start_date is null or d.start_date <= v_run_date)
               and (d.end_date is null or d.end_date >= v_run_date)
               and (d.usage_limit is null or d.times_used < d.usage_limit)
               and (d.min_purchase is null or d.min_purchase <= v_line.quantity * v_line.unit_price)
               and (d.min_quantity is null or d.min_quantity <= v_line.quantity)
             order by least(v_line.quantity * v_line.unit_price,
               case d.kind when 'fixed' then d.value when 'percent' then round(v_line.quantity * v_line.unit_price * d.value / 100, 2) end) desc, d.id
             limit 1 for update of d;
            if found then
              v_discount_amount := least(v_line.quantity * v_line.unit_price,
                case v_discount_kind when 'fixed' then v_discount_value when 'percent' then round(v_line.quantity * v_line.unit_price * v_discount_value / 100, 2) end);
              update pg_temp.billing_work_lines set discount_amount = v_discount_amount where line_no = v_line.line_no;
              v_used_discount_ids := array_append(v_used_discount_ids, v_discount_id);
            end if;
          end if;
        end loop;

        select coalesce(sum(greatest(0, quantity * unit_price - discount_amount)), 0)
          into v_post_line_subtotal from pg_temp.billing_work_lines;

        -- Choose the largest eligible subscription/global discount, then allocate
        -- it by post-product-discount net; the last line takes the rounding remainder.
        v_discount_id := null;
        if v_post_line_subtotal > 0 then
          select d.id, d.kind, d.value
            into v_discount_id, v_discount_kind, v_discount_value
            from public.discounts d
           where d.product_id is null
             and (d.subscription_id is null or d.subscription_id = v_sub.id)
             and (d.start_date is null or d.start_date <= v_run_date)
             and (d.end_date is null or d.end_date >= v_run_date)
             and (d.usage_limit is null or d.times_used < d.usage_limit)
             and (d.min_purchase is null or d.min_purchase <= v_pre_discount_subtotal)
             and (d.min_quantity is null or d.min_quantity <= v_total_qty)
           order by least(v_post_line_subtotal,
             case d.kind when 'fixed' then d.value when 'percent' then round(v_post_line_subtotal * d.value / 100, 2) end) desc, d.id
           limit 1 for update of d;
        end if;
        if v_discount_id is not null then
          v_invoice_discount := least(v_post_line_subtotal,
            case v_discount_kind when 'fixed' then v_discount_value when 'percent' then round(v_post_line_subtotal * v_discount_value / 100, 2) end);
          v_allocated := 0;
          for v_line in select * from pg_temp.billing_work_lines order by line_no
          loop
            v_line_net := greatest(0, v_line.quantity * v_line.unit_price - v_line.discount_amount);
            if v_line.line_no = (select max(line_no) from pg_temp.billing_work_lines) then
              v_discount_amount := greatest(0, v_invoice_discount - v_allocated);
            else
              v_discount_amount := least(v_line_net, round(v_invoice_discount * v_line_net / nullif(v_post_line_subtotal, 0), 2));
            end if;
            update pg_temp.billing_work_lines
               set discount_amount = discount_amount + least(v_line_net, v_discount_amount)
             where line_no = v_line.line_no;
            v_allocated := v_allocated + least(v_line_net, v_discount_amount);
          end loop;
          v_used_discount_ids := array_append(v_used_discount_ids, v_discount_id);
        end if;

        update pg_temp.billing_work_lines
           set net_amount = greatest(0, quantity * unit_price - discount_amount),
               tax_amount = round(greatest(0, quantity * unit_price - discount_amount) * tax_rate / 100, 2);
        select coalesce(sum(net_amount), 0), coalesce(sum(discount_amount), 0),
               coalesce(sum(tax_amount), 0)
          into v_subtotal, v_discount_total, v_tax_total
          from pg_temp.billing_work_lines;
        v_total := v_subtotal + v_tax_total;

        v_invoice_id := null;
        insert into public.invoices (
          subscription_id, customer_id, status, period_start, period_end,
          issue_date, due_date, subtotal, discount_total, tax_total, total
        ) values (
          v_sub.id, v_sub.customer_id, 'draft', v_period_start, v_period_end,
          v_run_date, v_run_date + v_days, v_subtotal, v_discount_total, v_tax_total, v_total
        ) on conflict (subscription_id, period_start) do nothing
        returning id into v_invoice_id;

        if v_invoice_id is null then
          v_local_skipped := v_local_skipped + 1;
        else
          insert into public.invoice_lines (invoice_id, description, quantity, unit_price, tax_amount, discount_amount, amount)
          select v_invoice_id, description, quantity, unit_price, tax_amount, discount_amount, net_amount
            from pg_temp.billing_work_lines order by line_no;
          -- The unique set of rows updated here makes each rule count once per invoice.
          update public.discounts d
             set times_used = coalesce(d.times_used, 0) + 1
           where d.id = any(v_used_discount_ids)
             and (d.usage_limit is null or d.times_used < d.usage_limit);
          v_local_created := v_local_created + 1;
        end if;

        -- A duplicate period is skipped and still advances the subscription cursor.
        v_next_date := v_period_next;
        update public.subscriptions set next_billing_date = v_next_date where id = v_sub.id;
        v_periods := v_periods + 1;
      end loop;

      v_created := v_created + v_local_created;
      v_skipped := v_skipped + v_local_skipped;
    exception when others then
      -- The block is a subtransaction: all invoices for this subscription roll
      -- back together, while the loop continues with the next locked subscription.
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'subscription', v_sub.number,
        'reason', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object('run_date', v_run_date, 'created', v_created,
    'skipped', v_skipped, 'failed', v_failed, 'auto_closed', v_auto_closed,
    'failures', v_failures);
end;
$$;

create or replace function public.confirm_drafts(p_subscription_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.invoices i
     set status = 'confirmed'
   where i.status = 'draft'
     and (p_subscription_ids is null or i.subscription_id = any(p_subscription_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.run_billing(date) from public, anon, authenticated;
grant execute on function public.run_billing(date) to service_role;
revoke execute on function public.confirm_drafts(uuid[]) from public, anon, authenticated;
grant execute on function public.confirm_drafts(uuid[]) to service_role;
