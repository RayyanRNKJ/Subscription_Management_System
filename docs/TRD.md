# TRD: Brightloop Subscription Management System

**Version:** 1.0 · **Audience:** AI coding agent (primary), human team (secondary)
**Companion doc:** `PRD.md` (requirements, business rules, acceptance criteria). **When this doc and the PRD disagree on behaviour, the PRD wins; on implementation, this doc wins.**

---

## 0. Operating rules for the coding agent (read first)

1. **Time-boxed hackathon.** Coding ends 17:00. Build in the order in §15. Finish P0 before touching P1/P2. A working, deployed app beats a beautiful unfinished one.
2. **Do not rebuild what exists.** The auth/roles scaffold is already in the repo (see §3 "EXISTING"). Extend it; do not rewrite it. Do not swap auth providers.
3. **No static JSON data.** All data comes from Postgres (Supabase). Seed through `scripts/seed.ts`.
4. **Secrets.** `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never import `src/lib/supabase/admin.ts` into a `"use client"` file. Never commit `.env.local`.
5. **Every mutating endpoint** checks the caller's role (`getProfile()`), validates input with Zod, and returns the standard error envelope (§8).
6. **Money math** is done in SQL `numeric` or with the shared rounding helper (§7.1). Never use floating-point sums for stored totals.
7. **Git:** work on `main` only (hackathon rule: single branch). Small commits, conventional messages (`feat(billing): ...`), `git pull --rebase` before every push, and push after each completed task. Do not create other branches.
8. **Before each commit:** `npm run lint && npm run build` must pass.
9. **Do not copy-paste blindly.** Keep code readable and commented where logic is non-obvious (billing, discounts, RLS). The team must be able to explain every part.
10. **When ambiguous,** follow PRD §10 assumptions; if still unclear, choose the simplest option and write the decision in `docs/DECISIONS.md`.
11. **Do not add dependencies** beyond §1 without a clear reason.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), React 19, TypeScript `strict` |
| UI | Tailwind CSS, shadcn/ui (button, input, select, textarea, table, badge, card, dialog, dropdown-menu, tabs, sonner), lucide-react |
| Forms/validation | react-hook-form + `@hookform/resolvers` + Zod (schemas shared client/server) |
| Charts | recharts |
| Dates | date-fns |
| Backend | Next.js **route handlers** (`src/app/api/**`) and Server Components. **No separate Express server.** |
| DB | Supabase Postgres (RLS on), SQL functions for billing/payments/dashboard |
| Auth | **Supabase Auth** (`@supabase/ssr`). Clerk is NOT used. |
| Realtime | Supabase Realtime (`postgres_changes`) |
| AI (P2) | Gemini via `@google/genai`, server-side only |
| Tests | Vitest (unit), plus `scripts/test-billing.ts` (DB integration) |
| Deploy | Vercel (env vars configured in the dashboard) |

Install (in addition to what exists): `react-hook-form @hookform/resolvers recharts date-fns lucide-react`, `npm i -D vitest tsx`.

---

## 2. Architecture

```
Browser ──► Next.js (Vercel)
             ├─ Server Components: READ data with the user-scoped Supabase client (RLS enforced)
             ├─ Route handlers (/api/*): MUTATIONS. Check role → validate (Zod) → act
             │     ├─ simple CRUD: user-scoped client (RLS is the safety net)
             │     └─ billing/payments/staff creation: service-role client AFTER explicit role check
             └─ Client Components: forms, tables with filters, realtime subscription → router.refresh()
Supabase ──► Postgres (tables, RLS, SQL functions run_billing / record_payment / dashboard_summary)
             Auth (users, password reset email) · Realtime
```

**Read/write convention:** pages read directly in Server Components (fast, no extra hop); changes go through route handlers; heavy or atomic operations are SQL functions invoked by a route handler.

---

## 3. Repository layout

`EXISTING` = already in the repo from the scaffold (extend, don't rewrite). `BUILD` = to create.

```
.env.example                                  EXISTING (extend as needed)
supabase/
  001_schema.sql                              EXISTING in Supabase (see §5.1; save a copy here for the README)
  002_auth_rls.sql                            EXISTING (profiles trigger, role helpers, RLS)
  003_additions.sql                           BUILD  (§5.2)
  004_functions.sql                           BUILD  (§7: run_billing, record_payment, confirm_drafts, dashboard_summary)
scripts/
  seed.ts                                     BUILD  (§13)
  test-billing.ts                             BUILD  (§14)
src/
  middleware.ts                               EXISTING (session refresh + redirect to /login)
  lib/
    supabase/{client,server,admin}.ts         EXISTING
    auth.ts                                   EXISTING (getProfile, requireRole, homeFor)
    validation.ts                             EXISTING (password/sign-up/staff/login schemas)
    validation/                               BUILD  (product, plan, subscription, invoice, payment, discount, tax, customer schemas)
    pricing.ts                                BUILD  (§7.1 rounding + totals preview, unit-tested)
    api.ts                                    BUILD  (ok(), fail(), withRole() helpers, error envelope)
    format.ts                                 BUILD  (formatINR, formatDate)
    status.ts                                 BUILD  (status enums, allowed transitions, badge colours)
  components/
    auth-ui.tsx                               EXISTING
    ui/                                       BUILD  (shadcn components)
    data-table.tsx, pagination.tsx, status-badge.tsx, money.tsx, empty-state.tsx, page-header.tsx
    realtime-refresh.tsx                      BUILD  (client: subscribe to tables, debounce router.refresh)
  app/
    page.tsx                                  EXISTING (role redirect)
    (auth)/{login,signup,forgot-password,reset-password}/page.tsx + actions.ts   EXISTING
    auth/callback/route.ts                    EXISTING
    (app)/layout.tsx                          EXISTING (role-based nav; add links as pages are built)
    (app)/dashboard/page.tsx                  EXISTING stub → BUILD (§9)
    (app)/portal/page.tsx                     EXISTING stub → BUILD
    (app)/portal/invoices/page.tsx            BUILD
    (app)/admin/layout.tsx, admin/staff/page.tsx   EXISTING
    (app)/products/…  plans/…  taxes/…  discounts/…  templates/…      BUILD (admin-only writes)
    (app)/customers/…  subscriptions/…  invoices/…  payments/…        BUILD
    invoices/[id]/print/page.tsx              BUILD  (print-friendly, role-checked)
    api/admin/staff/route.ts                  EXISTING
    api/**                                    BUILD  (§8)
docs/DECISIONS.md                             BUILD  (log of non-obvious choices)
README.md                                     BUILD  (§16)
```

---

## 4. Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
NEXT_PUBLIC_SITE_URL=             # http://localhost:3000 locally, Vercel URL in prod
GEMINI_API_KEY=                   # only for the P2 AI feature
```

Supabase dashboard settings (already agreed): Email "Confirm email" OFF for the hackathon; password min length 9; Site URL + redirect URLs include localhost and the Vercel URL.

---

## 5. Database

### 5.1 Current schema (ALREADY APPLIED. Reference only, do not re-run)

```sql
create type user_role   as enum ('admin','staff','customer');
create type sub_status  as enum ('draft','quotation','confirmed','active','closed');
create type inv_status  as enum ('draft','confirmed','paid','cancelled');
create type bill_period as enum ('daily','weekly','monthly','yearly');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  email text unique not null, full_name text, company text,
  role user_role not null default 'customer'
);
create table taxes (id uuid primary key default gen_random_uuid(),
  name text not null, rate numeric(5,2) not null);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null, type text, sales_price numeric(12,2) not null,
  cost_price numeric(12,2), notes text, tax_id uuid references taxes
);
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references products on delete cascade,
  attribute text, value text, extra_price numeric(12,2) default 0
);
create table plans (
  id uuid primary key default gen_random_uuid(),
  name text not null, price numeric(12,2) not null,
  period bill_period not null, min_quantity int default 1,
  available_from date, available_to date,
  auto_close boolean default false, closable boolean default true,
  pausable boolean default false, renewable boolean default true
);
create table quotation_templates (
  id uuid primary key default gen_random_uuid(),
  name text, plan_id uuid references plans, validity_days int default 30
);
create table quotation_template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references quotation_templates on delete cascade,
  product_id uuid references products, quantity int default 1
);

create sequence sub_seq;
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  number text unique default 'SUB-' || lpad(nextval('sub_seq')::text, 5, '0'),
  customer_id uuid references profiles not null,
  plan_id uuid references plans not null,
  status sub_status not null default 'draft',
  start_date date, expiry_date date, payment_terms text,
  next_billing_date date, paused boolean default false,
  created_by uuid references profiles, created_at timestamptz default now()
);
create table subscription_lines (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions on delete cascade,
  product_id uuid references products, variant_id uuid references product_variants,
  quantity int not null, unit_price numeric(12,2) not null, tax_id uuid references taxes
);
create table discounts (
  id uuid primary key default gen_random_uuid(),
  name text, kind text check (kind in ('fixed','percent')), value numeric(12,2) not null,
  min_purchase numeric(12,2), min_quantity int,
  start_date date, end_date date, usage_limit int, times_used int default 0,
  product_id uuid references products,
  subscription_id uuid references subscriptions
);
create sequence inv_seq;
create table invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique default 'INV-' || lpad(nextval('inv_seq')::text, 5, '0'),
  subscription_id uuid references subscriptions not null,
  customer_id uuid references profiles not null,
  status inv_status not null default 'draft',
  period_start date not null, period_end date not null,
  issue_date date default current_date, due_date date,
  subtotal numeric(12,2), discount_total numeric(12,2) default 0,
  tax_total numeric(12,2), total numeric(12,2),
  unique (subscription_id, period_start)
);
create table invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices on delete cascade,
  description text, quantity int, unit_price numeric(12,2),
  tax_amount numeric(12,2), discount_amount numeric(12,2) default 0, amount numeric(12,2)
);
create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices not null,
  method text, amount numeric(12,2) not null,
  paid_on date default current_date, note text
);
create index on subscriptions (status, next_billing_date);
create index on invoices (status, due_date);
create index on invoices (customer_id);
create index on payments (invoice_id);
```

### 5.2 `supabase/003_additions.sql` (BUILD this migration)

Contents the agent must write and apply:

```sql
-- plan fee tax, invoice sent marker, payment audit, sanity checks
alter table plans    add column if not exists tax_id uuid references taxes(id);
alter table invoices add column if not exists sent_at timestamptz;
alter table payments add column if not exists created_by uuid references profiles(id);
alter table subscriptions add column if not exists valid_until date;   -- quotation validity (template validity_days)

alter table payments add constraint payments_amount_pos check (amount > 0);
alter table discounts add constraint discounts_value_pos check (value > 0);
alter table discounts add constraint discounts_pct_max check (kind <> 'percent' or value <= 100);
alter table plans add constraint plans_dates_ok check (available_to is null or available_from is null or available_to >= available_from);
alter table subscriptions add constraint subs_dates_ok check (expiry_date is null or start_date is null or expiry_date >= start_date);

-- performance indexes (required for the < 2 s target)
create index if not exists idx_subs_customer      on subscriptions (customer_id);
create index if not exists idx_subs_plan          on subscriptions (plan_id);
create index if not exists idx_sublines_sub       on subscription_lines (subscription_id);
create index if not exists idx_invoices_sub       on invoices (subscription_id);
create index if not exists idx_invoices_issue     on invoices (issue_date desc);
create index if not exists idx_invlines_invoice   on invoice_lines (invoice_id);
create index if not exists idx_payments_paid_on   on payments (paid_on desc);

-- balances view (RLS of the caller applies)
create or replace view invoice_balances with (security_invoker = true) as
select i.id as invoice_id, i.total,
       coalesce(sum(p.amount), 0)                 as paid,
       i.total - coalesce(sum(p.amount), 0)       as balance
from invoices i left join payments p on p.invoice_id = i.id
group by i.id;

-- realtime for the live dashboard (ignore "already member" errors)
alter publication supabase_realtime add table invoices, payments, subscriptions;
```

### 5.3 RLS

Already applied by `002_auth_rls.sql`: profiles; admin-only writes on catalogue tables (`products, product_variants, plans, taxes, discounts, quotation_templates, quotation_template_lines`); staff/admin full access and customer own-row read on `subscriptions, subscription_lines, invoices, invoice_lines, payments`. The agent must **not weaken** these. SQL functions in §7 are `security definer`, callable **only** with the service-role client:

```sql
revoke execute on function run_billing(date) from public, anon, authenticated;
grant  execute on function run_billing(date) to service_role;   -- same for record_payment, confirm_drafts
```

(`dashboard_summary` may be `security invoker` and callable by staff/admin through the user-scoped client; RLS then applies.)

---

## 6. Authorization matrix

| Capability | Admin | Staff | Customer |
|---|:-:|:-:|:-:|
| Create staff | ✅ | ❌ | ❌ |
| Create customer account | ✅ | ✅ | ❌ |
| CRUD products / variants / taxes / plans / discounts / templates | ✅ | read | read (catalogue only if needed) |
| Create/edit subscriptions, change status | ✅ | ✅ | ❌ (P2: pause/close own if plan allows) |
| Run billing, confirm/cancel/send/print invoices | ✅ | ✅ | print own only |
| Record payments | ✅ | ✅ | ❌ |
| Dashboard | ✅ | ✅ | ❌ |
| View subscriptions/invoices/payments | all | all | **own only** |

Enforcement layers: (1) RLS, (2) `withRole()` in route handlers, (3) `requireRole()` in page/layout, (4) nav filtering. All four must agree.

---

## 7. Domain logic (authoritative specification)

### 7.1 Money and rounding
- Currency INR, `numeric(12,2)`. Rounding = SQL `round(x, 2)` (half away from zero) and in TS `Math.round((x + Number.EPSILON) * 100) / 100`. Both must yield identical results for positive numbers; unit-test this.
- `src/lib/pricing.ts` exports `lineAmounts({qty, unitPrice, discount, taxRate})` → `{ net, tax, gross }` and `documentTotals(lines)`; used for form previews. The **database** is the source of truth for stored invoice totals.

### 7.2 Line pricing
`unit_price = product.sales_price + coalesce(variant.extra_price, 0)` (editable). Example: Odoo brand variant `extra_price = 560` → 560 added.
`net = qty × unit_price − discount`; `tax = round(net × rate/100, 2)`; invoice `total = Σnet + Σtax`.

### 7.3 Subscription creation
- Validate: plan available on `start_date` (within `available_from..available_to`), `expiry_date ≥ start_date`, each line qty ≥ 1 and total qty ≥ `plan.min_quantity`.
- Creates with status `draft`; `next_billing_date = start_date`.
- `POST /api/subscriptions/from-template`: copies template lines (price = product price + variant extra), `quotation valid until = created_at + validity_days` (store in `subscriptions.valid_until`, added in 003).

### 7.4 Status transitions (`src/lib/status.ts`, enforced server-side)
```
draft → quotation → confirmed → active → closed
active ↔ paused (flag; only if plan.pausable)
draft|quotation|confirmed|active → closed (early close only if plan.closable; draft/quotation may always be cancelled to closed)
closed → active  ONLY via renew (if plan.renewable)
```
- Entering `active` requires `start_date` and at least one line; sets `next_billing_date = start_date` if null.
- Renew: `expiry_date += one plan period`; if status was closed → `active`.
- Invalid transition → `409 INVALID_TRANSITION`.

### 7.5 Billing run: `run_billing(p_run_date date default current_date) returns jsonb`
Security definer; invoked by `POST /api/billing/run` with the service-role client after the role check.

```
0. Auto-close: update subscriptions s set status='closed'
   from plans p where p.id=s.plan_id and s.status='active' and p.auto_close
   and (s.expiry_date < p_run_date or p.available_to < p_run_date).

1. Select eligible subscriptions:
   status='active' and not paused and next_billing_date <= p_run_date
   and (expiry_date is null or next_billing_date <= expiry_date)
   order by next_billing_date  FOR UPDATE OF s SKIP LOCKED.

2. For each subscription, loop up to 12 periods while next_billing_date <= p_run_date
   (and <= expiry_date):
   a. period_start = next_billing_date
      period_end   = period_start + plan.period interval − 1 day
        (daily +1 day, weekly +7 days, monthly +1 month, yearly +1 year)
   b. Build candidate lines:
        - "Plan fee – {plan.name}": qty 1, unit_price plan.price, tax plan.tax_id   (only if plan.price > 0)
        - each subscription_line: description "{product} ({variant})", qty, unit_price, tax_id
   c. Apply discounts (§7.6) → per-line discount_amount; collect used discount ids.
   d. Per line: net = qty*unit_price − discount; tax = round(net*rate/100, 2); amount = net.
   e. INSERT INTO invoices (...) VALUES (... status 'draft', issue_date p_run_date,
        due_date = p_run_date + days(payment_terms, default 15), totals)
      ON CONFLICT (subscription_id, period_start) DO NOTHING RETURNING id.
        - id returned  → insert invoice_lines; increment times_used of each applied discount by 1.
        - no id        → period already billed: counts as "skipped".
   f. next_billing_date = period_start + plan.period interval   (ALWAYS advance, created or skipped).

3. Wrap each subscription in a sub-transaction (BEGIN … EXCEPTION WHEN others THEN record failure and continue).

4. Return jsonb: { run_date, created, skipped, failed, auto_closed, failures:[{subscription, reason}] }.
```
**Invariants (tested):** running twice with the same date → second run `created = 0`; no subscription has a gap in billed periods; `times_used` increments only when an invoice row was actually inserted.

`days(payment_terms)`: first integer found in the string (`'Net 30'` → 30), else 15.

### 7.6 Discount application (inside run_billing)
Candidate discounts (`is_eligible`):
- `(start_date is null or start_date <= p_run_date) and (end_date is null or end_date >= p_run_date)`
- `(usage_limit is null or times_used < usage_limit)`
- Scope: `product_id = line.product_id` (line-level) · or `subscription_id = this subscription` (invoice-level) · or both null (invoice-level, all subscriptions).
- Minimums: line-level compares `min_purchase` to the line's pre-discount amount and `min_quantity` to the line qty; invoice-level compares to the invoice subtotal / total qty. Null = no minimum.

Amount: `fixed` → `value`; `percent` → `base × value/100`; capped at the base (never negative).
Selection (BR-10): per line pick the **largest** eligible line-level discount; then pick the **largest** eligible invoice-level discount on the post-line-discount subtotal and allocate it proportionally across lines by line net (last line absorbs the rounding remainder). Each distinct discount used increments `times_used` once for that invoice. Discounts stop automatically once outside dates or at the usage limit.
(Concurrency: lock candidate discount rows `FOR UPDATE` and re-check the usage limit before incrementing.)

### 7.7 Invoice lifecycle
| Action | Endpoint | Rule |
|---|---|---|
| Confirm | `POST /api/invoices/:id/confirm` | from `draft` only |
| Confirm all drafts | `POST /api/invoices/confirm-drafts` | optional filters; SQL function, returns count |
| Cancel | `POST /api/invoices/:id/cancel` | from `draft`, or `confirmed` with **no payments** |
| Send | `POST /api/invoices/:id/send` | only `confirmed`/`paid`; sets `sent_at = now()`; (P2) emails via provider |
| Print | page `/invoices/[id]/print` | print CSS; staff all, customer own |
| Paid | automatic inside `record_payment` | when Σpayments = total |

### 7.8 Payments: `record_payment(...)`
Security definer; invoked from `POST /api/payments` with service-role client after role check.
```
lock invoice row FOR UPDATE
require status = 'confirmed'               else error INVOICE_NOT_PAYABLE
require 0 < amount <= (total − Σpayments)  else error OVERPAYMENT
insert payment (method, amount, paid_on, note, created_by)
if Σpayments = total → invoice.status = 'paid'
return payment + new invoice status + balance
```
Methods: `cash | bank_transfer | card | upi | cheque`.

### 7.9 Dashboard queries
`dashboard_summary(p_from date, p_to date, p_plan uuid default null, p_customer uuid default null) returns jsonb`:
- `active_subscriptions`: count where `status='active'` (apply plan/customer filters).
- `revenue_collected`: Σ `payments.amount` where `paid_on between p_from and p_to`.
- `outstanding`: Σ `balance` of `confirmed` invoices.
- `overdue_count`, `overdue_amount`: confirmed invoices with `due_date < current_date` and balance > 0.
- (P1) `mrr`: for active subs, normalise recurring net per period → monthly (daily×30, weekly×52/12, monthly×1, yearly÷12).
- (P1) `revenue_by_month`: last 6 months of payment sums; `invoice_status_counts`.
All aggregates in SQL; **never** fetch rows to sum in JS. Overdue list: paginated query ordered by `due_date asc`.

---

## 8. API contract

Base: `/api`. JSON in/out. **Envelope:**
```json
// success
{ "data": <payload>, "page": 1, "pageSize": 25, "total": 1234 }   // page fields only on lists
// error  (HTTP 400/401/403/404/409/422/500)
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": { "email": "…" } } }
```
Error codes: `UNAUTHENTICATED, FORBIDDEN, VALIDATION_ERROR, NOT_FOUND, INVALID_TRANSITION, PLAN_UNAVAILABLE, INVOICE_NOT_PAYABLE, OVERPAYMENT, CONFLICT, INTERNAL`.
Implement `withRole(roles, handler)` in `src/lib/api.ts` to centralise auth, Zod parse and error mapping.

| Method + path | Roles | Body / query | Notes |
|---|---|---|---|
| `POST /api/admin/staff` | admin | `{full_name,email,password}` | EXISTING |
| `POST /api/customers` | admin, staff | `{full_name,company?,email,password}` | creates auth user, role stays `customer` |
| `GET /api/customers` | admin, staff | `?q=&page=` | search by name/email |
| `GET/POST /api/products` · `GET/PATCH/DELETE /api/products/:id` | read: all auth · write: admin | product + `variants[]` | variants replaced atomically on PATCH; delete blocked if referenced (409) |
| `GET/POST /api/taxes` · `PATCH/DELETE /api/taxes/:id` | read: all · write: admin | `{name, rate 0–100}` | |
| `GET/POST /api/plans` · `PATCH/DELETE /api/plans/:id` | read: all · write: admin | plan fields + flags | validate date range |
| `GET/POST /api/templates` · `PATCH/DELETE /api/templates/:id` | admin write | `{name, plan_id, validity_days, lines[]}` | P1 |
| `GET /api/subscriptions` | admin, staff | `?status=&plan=&customer=&q=&page=&pageSize=` | server pagination |
| `POST /api/subscriptions` | admin, staff | `{customer_id, plan_id, start_date, expiry_date, payment_terms, lines[]}` | status draft |
| `POST /api/subscriptions/from-template` | admin, staff | `{template_id, customer_id, start_date}` | P1 |
| `GET/PATCH /api/subscriptions/:id` | admin, staff | | PATCH allowed in `draft`/`quotation` only |
| `POST /api/subscriptions/:id/transition` | admin, staff | `{to}` | §7.4 |
| `POST /api/subscriptions/:id/pause` · `/resume` · `/close` · `/renew` | admin, staff | | plan flags enforced |
| `POST /api/billing/run` | admin, staff | `{run_date?}` | calls `run_billing`; returns the jsonb summary |
| `GET /api/invoices` | admin, staff | `?status=&customer=&overdue=true&from=&to=&q=&page=` | |
| `GET /api/invoices/:id` | admin, staff, owner | | includes lines, payments, balance |
| `POST /api/invoices/:id/confirm` · `/cancel` · `/send` | admin, staff | | §7.7 |
| `POST /api/invoices/confirm-drafts` | admin, staff | `{subscription_ids?}` | |
| `GET /api/payments` | admin, staff | `?invoice=&from=&to=&method=&page=` | |
| `POST /api/payments` | admin, staff | `{invoice_id, method, amount, paid_on, note?}` | §7.8 |
| `GET/POST /api/discounts` · `PATCH/DELETE /api/discounts/:id` | read: staff/admin · write: admin | discount fields | validate: percent ≤ 100; one of product/subscription or neither |
| `GET /api/dashboard/summary` | admin, staff | `?from=&to=&plan=&customer=` | calls `dashboard_summary` |
| `GET /api/dashboard/overdue` | admin, staff | `?page=` | paginated |

---

## 9. Frontend

### 9.1 Routes and screens
| Route | Role | Content |
|---|---|---|
| `/login /signup /forgot-password /reset-password` | public | EXISTING |
| `/dashboard` | staff, admin | KPI cards (active subs, revenue, outstanding, overdue), filters (date range, plan, customer), overdue table, (P1) revenue-by-month chart + status breakdown, `RealtimeRefresh` on `invoices, payments, subscriptions` |
| `/products` `/products/new` `/products/[id]` | read all staff · write admin | table; form with **variants editor** (attribute, value, extra price) |
| `/taxes` | admin write | inline table CRUD |
| `/plans` `/plans/new` `/plans/[id]` | admin write | form incl. period select, min qty, dates, 4 behaviour toggles |
| `/templates` | admin | P1 |
| `/customers` `/customers/new` | staff, admin | list + create |
| `/subscriptions` | staff, admin | filterable, paginated list with status badges |
| `/subscriptions/new` | staff, admin | customer select, plan select (only available plans), dates, payment terms, **line editor** (product → variant → qty → auto unit price → tax → live totals preview), "From template" shortcut |
| `/subscriptions/[id]` | staff, admin | header with status + **transition buttons** (only valid ones), lines, invoices for this subscription, pause/renew/close per plan flags |
| `/invoices` | staff, admin | filters (status, overdue, date, customer), bulk "Confirm all drafts", **"Run billing"** button with run-date picker and result dialog (created/skipped/failed) |
| `/invoices/[id]` | staff, admin | lines, totals, discount per line, payments list, actions (Confirm / Cancel / Send / Print / Record payment) |
| `/invoices/[id]/print` | staff + owner | clean print layout (`@media print`), company header, line table, totals |
| `/payments` | staff, admin | list with method/date filters; record-payment dialog (also available from invoice page) |
| `/discounts` | admin write | form: kind, value, min purchase/qty, dates, usage limit, scope product/subscription |
| `/portal` `/portal/invoices` | customer | own subscriptions / own invoices (+ print) |
| `/admin/staff` | admin | EXISTING |

Update the nav in `(app)/layout.tsx` as pages ship; add `/customers` and `/taxes` for the proper roles.

### 9.2 UI standards
- Primary colour indigo (matches scaffold), neutral greys, one consistent layout (sidebar on ≥md, top scroll-nav on mobile).
- Status badge colours (`status.ts`): draft=gray, quotation=blue, confirmed=indigo, active=green, closed=slate, paused=amber, paid=green, cancelled=red, overdue=red.
- Every list: server-side pagination (25/page), loading skeleton, empty state, error state. Every form: field-level Zod errors, disabled submit while pending, toast on success/failure.
- Money via `formatINR()`; dates via `formatDate()` (`dd MMM yyyy`).
- Accessible labels, keyboard-friendly dialogs, minimum 44px tap targets on mobile.
- **Do not** spend time on animation or pixel polish.

### 9.3 Data access rules
- Read in Server Components with the user-scoped client; select only needed columns; use `.range()` for pagination and `count: 'exact'` **only** for the first page or switch to `'estimated'` for big tables; no N+1 (use joins/embedded selects).
- Mutations: `fetch('/api/...')` then `router.refresh()`.

---

## 10. Validation (shared Zod schemas in `src/lib/validation/*`)

| Entity | Rules |
|---|---|
| Password | min 9, upper, lower, special (EXISTING) |
| Email | valid, lower-cased, unique (DB + friendly error) |
| Product | name 2–120, sales_price ≥ 0, cost_price ≥ 0 optional, variants: attribute+value required, extra_price any number ≥ 0 |
| Tax | name required, rate 0–100 |
| Plan | name required, price ≥ 0, period enum, min_quantity int ≥ 1, `available_to ≥ available_from` |
| Subscription | customer, plan required; `expiry ≥ start`; ≥ 1 line; qty int ≥ 1; Σqty ≥ plan.min_quantity; plan available on start date |
| Discount | value > 0; percent ≤ 100; `end ≥ start`; usage_limit int ≥ 1 or null; not both product and subscription scope |
| Payment | amount > 0 and ≤ balance; method enum; date not in the future |
| Billing run | run_date valid date, not > 1 year from today |

Server revalidates everything. Client validation is UX only.

---

## 11. Realtime

`components/realtime-refresh.tsx` (client): subscribe with the browser Supabase client to `postgres_changes` on the given tables (`event: '*'`), debounce 500 ms, call `router.refresh()`; unsubscribe on unmount. Used on `/dashboard`, `/invoices`, `/subscriptions`, `/portal`. RLS applies to realtime, so customers only receive their own rows.

---

## 12. Performance requirements and techniques

Target: **every page < 2 s** with 5,000 subscriptions / 15,000 invoices / 10,000 payments.
- All filter/sort columns indexed (§5.2). Check with `EXPLAIN ANALYZE` for: subscriptions list by status, invoices list by status/due_date, overdue query, dashboard summary.
- Pagination everywhere; never `select *` on lists; no client-side filtering of full tables.
- Aggregates via SQL functions/views only.
- Billing run is a single SQL function call (no per-row HTTP round trips). Target: 500 due subscriptions in a few seconds.
- Avoid waterfalls: use `Promise.all` for independent queries in a page.
- Record measured timings in the README (a small table).

---

## 13. Seed data: `scripts/seed.ts` (run with `npx tsx scripts/seed.ts`)

Uses the service-role client. **Idempotent** (safe to re-run; use `--reset` flag to wipe seeded demo rows).
- Users (password `Demo@12345` satisfies the rule): `admin@brightloop.test` (admin), `staff@brightloop.test` (staff), `customer@brightloop.test` (customer) + 200 generated customers.
- Taxes: GST 5%, GST 12%, GST 18%.
- Products: ~8 (e.g. "Odoo ERP Suite" with variants **Brand = Odoo (+560)**, Brand = Other (+0); "CRM Add-on"; "Support Pack"…).
- Plans: Daily Trial, Weekly Starter, Monthly Business (min qty 1), Yearly Enterprise (min qty 5, auto_close true); mix of flags.
- Discounts: 10% on a product (valid), ₹500 fixed on subscription min purchase ₹5,000, one **expired**, one with **usage_limit 1** (to demo stop rules).
- Quotation template ×2.
- **5,000 subscriptions** across customers/plans/statuses (mostly `active`, with spread `next_billing_date` so a billing run has hundreds due), their lines, **~15,000 invoices** in mixed statuses with realistic due dates (some overdue), and payments for ~60% of confirmed invoices. Use batched inserts (e.g. 500 rows per call).

---

## 14. Testing and acceptance

### 14.1 Automated
- **Unit (Vitest):** `pricing.ts` rounding and totals; password schema (8 chars fails, 9 valid, missing classes fail); status transition table; payment-terms day parsing.
- **Integration (`scripts/test-billing.ts`, run against a clean/seeded DB):**
  1. Billing run → `created > 0`; run again same date → `created = 0, skipped ≥ 0`.
  2. Subscription 3 periods behind → exactly 3 invoices with consecutive periods, no gaps/overlaps.
  3. Discount with `usage_limit = 1` applies to the first invoice only; expired discount never applies.
  4. Tax: line net 1000 @ 18% → tax 180.00; totals sum correctly; rounding case 33.33 @ 18%.
  5. `record_payment`: partial → invoice stays `confirmed`; full → `paid`; overpayment rejected; payment on `draft` rejected.
  6. Paused / non-active / expired subscriptions are never billed.

### 14.2 Manual acceptance checklist (must pass on the **deployed** URL)
- [ ] Duplicate email rejected; 8-char password rejected; valid password accepted
- [ ] Reset email arrives; link sets new password
- [ ] Customer cannot open `/dashboard`, `/subscriptions`, `/admin/staff`; API returns 403
- [ ] Customer sees only own subscriptions/invoices (verify with a second customer)
- [ ] Staff cannot create products/plans/discounts/staff (UI hidden + API 403)
- [ ] Odoo variant adds 560 to the line price
- [ ] Plan flags hide/deny disallowed actions
- [ ] Status flow works and is visible everywhere; invalid jumps rejected
- [ ] Run billing twice → no duplicates; result dialog shows counts
- [ ] Discount appears on the next invoice automatically and stops at expiry/limit
- [ ] Confirm / cancel / send / print work; partial then full payment flips to Paid
- [ ] Dashboard numbers match SQL spot-checks; overdue list correct; updates live after a payment
- [ ] Lists on 5k-row seed load < 2 s (note timings)
- [ ] Works on a phone-width viewport

---

## 15. Build order (tasks with "done when")

Time-box guidance assumes a 09:00 start. **Commit + push after every task**; all three team members commit.

| # | Task | Done when |
|---|---|---|
| T0 | Verify scaffold runs; apply 003 migration; shadcn init; `lib/api.ts`, `format.ts`, `status.ts`, layout polish | App boots, `npm run build` green, deployed to Vercel once (≈ by 10:30) |
| T1 | Taxes + Products (+variants) CRUD, admin-only writes | Variant extra price saved; staff blocked from writes |
| T2 | Plans CRUD with flags and validation | Date/period rules enforced |
| T3 | Customers list/create | Staff can create a customer account |
| T4 | Subscriptions: create (line editor with live totals), list, detail, transitions | Full status flow works; visible to all roles |
| T5 | `004_functions.sql`: `run_billing`, `confirm_drafts`; `POST /api/billing/run`; invoices list + Run billing UI | Integration tests 1, 2, 4, 6 pass **(highest-risk task, start by ≈ 12:00)** |
| T6 | Invoice detail + lifecycle (confirm/cancel/send/print page) | Each action respects §7.7 rules |
| T7 | `record_payment`, payments UI, balances/overdue indicators | Test 5 passes; invoice flips to Paid |
| T8 | Dashboard: `dashboard_summary`, KPI cards, overdue table, filters, realtime | Numbers match SQL; updates live |
| T9 | Customer portal + RLS verification | Cross-customer access impossible |
| T10 | Seed script (5k scale), index/`EXPLAIN` check, pagination everywhere | All pages < 2 s; timings logged |
| T11 | Discounts CRUD + discount logic in `run_billing` + test 3 | Auto-applies and stops correctly *(P1: if time is short, do this right after T7)* |
| T12 | Quotation templates + from-template creation, plan behaviours (pause/renew/close/auto-close) | P1 |
| T13 | README, screenshots, `docs/DECISIONS.md`, final deploy, demo seed account notes | See §16 |
| T14 | (P2) AI helper (Gemini): "overdue reminder draft" or "ask your revenue" | Only if everything else is done |

**Cut order if behind:** T14 → templates → plan pause/renew → print polish → dashboard charts. Never cut: auth/RBAC, billing idempotency, payments, dashboard KPIs, portal.

**Feature freeze: 15:45. Final deploy: 16:15. Last commit before 17:00.**

---

## 16. Git, deployment, README

- Single `main` branch; every member commits. Keep commit history meaningful.
- Vercel: import the repo, set all env vars, redeploy on push. After each deploy open the live URL in an incognito window.
- `README.md` must contain: problem and solution; feature list mapped to PRD; screenshots (login, catalogue, subscription flow, billing run, invoice, dashboard, portal); tech stack and architecture diagram (simple); **setup instructions** (clone, install, `.env.example`, run SQL files in order 001→002→003→004, seed, `npm run dev`); demo accounts (`admin@/staff@/customer@brightloop.test`, password `Demo@12345`); performance timings table; known limitations and future improvements (payment gateway, email delivery, dunning, multi-currency, AI insights).

---

## 17. Definition of done

1. All PRD P0 acceptance criteria pass on the deployed URL (§14.2 checklist ticked).
2. Billing idempotency and RBAC tests demonstrably pass.
3. Dashboard and list pages < 2 s on the seeded dataset.
4. `npm run lint` and `npm run build` pass; no secrets in the repo.
5. README complete with screenshots; commits from all three members on `main`.
6. Demo video link submitted before 17:30.
