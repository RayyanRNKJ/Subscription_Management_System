-- Run AFTER the schema (001). Safe to re-run.

-- 1) Every new auth user gets a profile. Role is ALWAYS 'customer' here.
--    (Never read role from user metadata: clients control it.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, company, role)
  values (new.id, lower(new.email),
          new.raw_user_meta_data->>'full_name',
          new.raw_user_meta_data->>'company',
          'customer')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Role helpers (security definer avoids RLS recursion on profiles)
create or replace function public.my_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin','staff'), false)
$$;

-- 3) profiles
alter table profiles enable row level security;
drop policy if exists profiles_read on profiles;
drop policy if exists profiles_admin_write on profiles;
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profiles_admin_write on profiles for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- 4) Catalogue tables: everyone signed in can read, ONLY admin can write
do $$
declare t text;
begin
  foreach t in array array['products','product_variants','plans','taxes','discounts',
                           'quotation_templates','quotation_template_lines'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists read_authenticated on %I', t);
    execute format('drop policy if exists admin_write on %I', t);
    execute format('create policy read_authenticated on %I for select to authenticated using (true)', t);
    execute format($p$create policy admin_write on %I for all to authenticated
                      using (public.my_role() = 'admin') with check (public.my_role() = 'admin')$p$, t);
  end loop;
end $$;

-- 5) Customer data: staff/admin see everything, customers only their own
alter table subscriptions      enable row level security;
alter table subscription_lines enable row level security;
alter table invoices           enable row level security;
alter table invoice_lines      enable row level security;
alter table payments           enable row level security;

drop policy if exists staff_all on subscriptions;
drop policy if exists customer_own on subscriptions;
create policy staff_all on subscriptions for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy customer_own on subscriptions for select to authenticated
  using (customer_id = auth.uid());

drop policy if exists staff_all on subscription_lines;
drop policy if exists customer_own on subscription_lines;
create policy staff_all on subscription_lines for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy customer_own on subscription_lines for select to authenticated
  using (exists (select 1 from subscriptions s where s.id = subscription_id and s.customer_id = auth.uid()));

drop policy if exists staff_all on invoices;
drop policy if exists customer_own on invoices;
create policy staff_all on invoices for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy customer_own on invoices for select to authenticated
  using (customer_id = auth.uid());

drop policy if exists staff_all on invoice_lines;
drop policy if exists customer_own on invoice_lines;
create policy staff_all on invoice_lines for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy customer_own on invoice_lines for select to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_id and i.customer_id = auth.uid()));

drop policy if exists staff_all on payments;
drop policy if exists customer_own on payments;
create policy staff_all on payments for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy customer_own on payments for select to authenticated
  using (exists (select 1 from invoices i where i.id = invoice_id and i.customer_id = auth.uid()));

-- 6) Bootstrap the FIRST admin: sign up in the app, then run (with your email):
-- update public.profiles set role = 'admin' where email = 'you@example.com';
