# PRD: Brightloop Subscription Management System

**Version:** 1.0 · **Event:** Odoo hackathon, 31 Oct 2026 (coding 09:00–17:00) · **Audience:** AI coding agent + human team (3 people)
**Companion doc:** `TRD.md` (how to build it). This doc defines **what** to build and **why**.

---

## 1. Product overview

Brightloop Software sells everything on subscription: software billed monthly or yearly, add-ons switched on and off, and products with variants. Today subscriptions live in a spreadsheet, renewals are remembered by whoever notices first, invoices are typed by hand, payments are matched by scrolling bank statements, and revenue reports are built manually each quarter.

**Product:** one unified web platform that runs the whole subscription lifecycle: catalogue → plans → quotations → subscriptions → automatic invoicing → payments → revenue reporting, with a self-service customer portal.

**One-line pitch:** *"The digital backbone for a company that earns its money every month."*

## 2. Goals and non-goals

### Goals
1. Replace every manual step in the "how things run today" list.
2. Guarantee billing correctness: **no invoice is ever created twice or skipped.**
3. Give each role exactly the access it needs (admin / staff / customer).
4. Give finance one place to see active subscriptions, revenue, payments and overdue invoices.
5. Stay fast: **every page responds in under 2 seconds with thousands of subscriptions.**
6. Meet the hackathon's must-haves: dynamic/real-time data, responsive clean UI, robust validation, intuitive navigation, proper Git use by all members.

### Non-goals (do NOT build)
- A real payment gateway (payments are **recorded manually**).
- Real email delivery as a hard requirement (a "sent" status is enough; real email is optional, see P2).
- Multi-currency, multi-tenant, accounting ledger, tax filing, dunning automation, mobile native apps.

## 3. Users and roles

| Role | Who | Can do | Cannot do |
|---|---|---|---|
| **Admin** | Brightloop owner/ops lead | Everything: manage products, variants, plans, taxes, discounts, quotation templates; add staff; all subscription/invoice/payment work; dashboard | n/a |
| **Staff** | Small internal team | Day-to-day: create customers, subscriptions and quotations, move statuses, run billing, confirm/cancel/send/print invoices, record payments, view dashboard | Create products/plans/taxes/discounts, add staff, change roles |
| **Customer** | Small shops to large companies | See **only their own** subscriptions, invoices and payments in a portal; (P1) pause/close own subscription where the plan allows | See anyone else's data, access admin/staff screens |

**Finance lead** is a staff or admin user who uses the dashboard.

## 4. Scope and priorities

- **P0:** required for the demo story; must work end to end.
- **P1:** build if P0 is done and stable.
- **P2:** nice-to-have; cut first.

| # | Module | P |
|---|---|---|
| 1 | Auth: sign-up, login, password rules, reset, 3 roles, admin-only staff creation | P0 |
| 2 | Catalogue: products + variants (extra price), taxes | P0 |
| 3 | Plans: price, period, min quantity, availability dates, close/pause/renew behaviour flags | P0 |
| 4 | Subscriptions: number, lines, status lifecycle, visible to all roles | P0 |
| 5 | Billing run: invoices generated from subscriptions, auto tax, idempotent | P0 |
| 6 | Invoice lifecycle: Draft → Confirmed → Paid, confirm/cancel/send/print | P0 |
| 7 | Payments: record against invoice; paid vs outstanding visible | P0 |
| 8 | Finance dashboard: active subs, revenue, outstanding, overdue, filters | P0 |
| 9 | Customer portal (own data only) | P0 |
| 10 | Discount rules, auto-applied on next invoice | P1 (high) |
| 11 | Quotation templates, create subscription from template | P1 (high) |
| 12 | Plan behaviours enforced (auto-close, early close, pause, renew) | P1 |
| 13 | Dashboard charts, MRR, filters by plan/customer | P1 |
| 14 | Customer self-service pause/close | P2 |
| 15 | Real email sending (reset email is via Supabase, invoice email optional) | P2 |
| 16 | AI assistant (natural-language revenue Q&A or overdue-reminder drafts, Gemini) | P2 |

## 5. Functional requirements

Each requirement has an ID and acceptance criteria (AC). The agent must satisfy every AC for P0 items.

### 5.1 Authentication and roles (scene: "A new customer signs up")

**FR-AUTH-1: Sign-up.** A visitor creates an account with name, optional company, email and password.
- AC: An email can belong to only one account; a duplicate shows a clear error.
- AC: Password must be **more than 8 characters (min 9)**, with an uppercase letter, a lowercase letter and a special character. Errors state which rule failed. Validated on client **and** server.
- AC: New self-registered users are always `customer`.

**FR-AUTH-2: Login/logout.** Email + password; signed-in user lands on the home for their role (`/portal` for customers, `/dashboard` for staff/admin).

**FR-AUTH-3: Password reset.** "Forgot password" sends a reset link to the **registered** email; the link lets the user set a new password that obeys FR-AUTH-1 rules. The response never reveals whether the email exists.

**FR-AUTH-4: Role-based access.**
- AC: Customers only ever see their own subscriptions, invoices, payments (enforced by DB row-level security **and** server checks).
- AC: Staff see all customers' operational data but cannot open admin-only screens or perform admin-only actions (403 from API, redirect in UI).
- AC: Navigation only shows links the role may use.

**FR-AUTH-5: Staff creation.** Only an admin can add a staff member (name, email, temporary password). The role is assigned **server-side**.
- AC: Non-admin calls to the endpoint return 403.

**FR-AUTH-6: Customer creation by team.** Admin/staff can create a customer account (name, company, email, temp password) so a quotation can be prepared before the customer signs up themselves.

### 5.2 Catalogue and plans (scene: "Launching a new plan")

**FR-CAT-1: Product.** Admin creates/edits/deletes (archive if referenced) a product: name, type, sales price, cost price, notes, default tax.
- AC: Sales price ≥ 0, cost price ≥ 0; name required and unique.

**FR-CAT-2: Variants.** A product can have variants by attribute (e.g. Brand = Odoo, Brand = Other) each with an **extra price**.
- AC: Choosing the Odoo brand variant (extra price 560) adds 560 to the unit price on the subscription line.

**FR-CAT-3: Taxes.** Admin defines named taxes with a percentage rate (e.g. GST 18%). A product has a default tax; a line may override it. Taxes are computed automatically on invoices.

**FR-PLAN-1: Plan.** Admin creates a plan: name, price, billing period (**daily, weekly, monthly, yearly**), minimum quantity, availability dates (from/to).
- AC: `available_to` ≥ `available_from`; price ≥ 0; min quantity ≥ 1.
- AC: A plan cannot be selected for a new subscription outside its availability dates.

**FR-PLAN-2: Per-plan behaviour flags (admin decides plan by plan).**
- `auto_close`: subscriptions on the plan close automatically when they end.
- `closable`: may be closed early.
- `pausable`: may be paused and resumed.
- `renewable`: may be renewed.
- AC: Actions not allowed by the plan are hidden in the UI and rejected (409/403) by the API.

### 5.3 Quotations and subscriptions (scene: "Turning a quote into a subscription")

**FR-SUB-1: Quotation template (P1).** Admin defines templates: name, plan, product lines (product, variant, quantity), validity in days.
- AC: A rep creates a subscription/quotation **from a template** with lines pre-filled; the quotation expires `validity_days` after creation.

**FR-SUB-2: Subscription.** Each subscription has an auto-generated **number** (`SUB-00001`), customer, plan, start date, expiry date, payment terms (e.g. "Net 15"), and lines (product, variant, quantity, unit price, tax, amount).
- AC: Unit price defaults to product sales price + variant extra price and may be edited by staff/admin.
- AC: Expiry date ≥ start date. Quantity ≥ plan minimum quantity.
- AC: Line amount = quantity × unit price. Totals (subtotal, tax, total) are shown on the subscription.

**FR-SUB-3: Status lifecycle.** `Draft → Quotation → Confirmed → Active → Closed`.
- AC: Only the forward transitions above are allowed (plus `Active ⇄ paused` and early `Closed` where the plan allows); invalid transitions are rejected.
- AC: Anyone on the team can see the current status on the list and detail pages; customers see their own subscriptions' status.
- AC: Only `Active` (and not paused) subscriptions are billed.

**FR-SUB-4: Pause / close / renew (P1).** Per plan flags (FR-PLAN-2).
- Pause stops billing; resume continues from the current `next_billing_date`.
- Renew extends the expiry date by one billing period (or reactivates a closed-by-expiry subscription where `renewable`).
- Early close sets status to Closed immediately.

### 5.4 Invoicing (scene: "Billing day")

**FR-INV-1: Billing run.** Staff/admin clicks **Run billing** (optionally with a run date; default today). The system creates an invoice for every active, unpaused subscription whose `next_billing_date ≤ run date`.
- AC: Each invoice is created **from its subscription** with customer details, lines, discounts, taxes and totals already filled in. Nobody types invoice data by hand.
- AC: **Nothing is billed twice:** running billing twice for the same date creates zero new invoices the second time (DB-level uniqueness on subscription + period).
- AC: **Nothing is skipped:** if several periods are overdue for billing, one invoice per missed period is created (capped, see TRD).
- AC: The run reports counts: created, skipped (already billed), failed, with reasons.
- AC: After billing, the subscription's `next_billing_date` advances by one plan period.
- AC: Handles **hundreds of due subscriptions in a single run** well within the 2-second page budget for the result view (run executes server-side in one operation).

**FR-INV-2: Taxes.** Computed automatically per line from the line's tax rate (see TRD for rounding).

**FR-INV-3: Invoice lifecycle.** `Draft → Confirmed → Paid` (plus `Cancelled`).
- AC: Billing creates invoices as **Draft**. Staff can **Confirm** (single or bulk "Confirm all drafts"), **Cancel**, **Send** (marks sent, optional email) and **Print** (print-friendly invoice page).
- AC: An invoice becomes **Paid** automatically when payments cover its total.
- AC: Paid invoices cannot be cancelled or edited; cancelled invoices cannot be paid.
- AC: Each invoice has a unique number (`INV-00001`), issue date and due date (issue date + payment terms).

### 5.5 Discounts (scene: "A customer asks for a better price")

**FR-DISC-1: Discount rules (admin only).** Type **fixed amount** or **percentage**, minimum purchase amount and/or minimum quantity, start and end dates, usage limit.
**FR-DISC-2: Scope.** A discount applies to a **specific product** or to a **whole subscription** (a specific subscription, or all).
**FR-DISC-3: Automatic application.**
- AC: Once eligible, the discount appears on the **next invoice automatically**, shown as a discount amount per line and in the invoice totals.
- AC: It **stops** after its end date and after its usage limit is reached (usage counted once per invoice it is applied to).
- AC: A discount never makes a line negative.

### 5.6 Payments (scene: "The money comes in")

**FR-PAY-1: Record payment.** Staff/admin records a payment against an invoice: **method** (cash, bank transfer, card, UPI, cheque), **amount**, **date**, **note**.
- AC: Only Confirmed invoices accept payments; amount > 0 and ≤ outstanding balance (no overpayment). Partial payments allowed.
- AC: When total payments = invoice total, the invoice flips to Paid.
**FR-PAY-2: Visibility.** At any moment the team can see which invoices are paid, partially paid and outstanding, and which are **overdue** (confirmed, due date passed, balance > 0), filterable and sortable, so overdue ones can be chased.

### 5.7 Finance dashboard (scene: "The finance lead")

**FR-DASH-1: One place** (`/dashboard`) shows for a selectable date range:
- **Active subscriptions** (count)
- **Revenue collected** (sum of payments in range)
- **Outstanding** amount (confirmed invoices' unpaid balance)
- **Overdue** invoices (count + amount) with a table to chase them
- (P1) MRR, revenue by month chart, invoice status breakdown
**FR-DASH-2: Filters** by date range, subscription status, plan, customer, invoice status.
**FR-DASH-3: Live.** The dashboard reflects new payments/invoices without a manual reload (realtime refresh).
**FR-DASH-4: Performance.** With thousands of subscriptions (seed 5,000+ subs, 15,000+ invoices) **every page responds in < 2 s**; lists are server-side paginated.

### 5.8 Customer portal

**FR-PORTAL-1:** A customer sees "My subscriptions" (number, plan, status, next billing date, total) and "My invoices" (number, period, total, status, balance) and can open/print an invoice. They cannot access any other customer's data by changing URLs.

## 6. Business rules (single source of truth)

| ID | Rule |
|---|---|
| BR-1 | Money in INR (₹), 2 decimals, formatted `en-IN`. |
| BR-2 | Unit price = product sales price + variant extra price (editable on the line). |
| BR-3 | Line amount (net) = qty × unit price − discount. Tax = round(net × rate/100, 2). Invoice total = Σ net + Σ tax. |
| BR-4 | If a plan has a price > 0 it is billed as a **"Plan fee"** line (qty 1) on each invoice in addition to product lines (see assumption A1). |
| BR-5 | Billing period end = period start + plan period − 1 day; next billing date = period start + plan period. |
| BR-6 | Due date = issue date + days parsed from payment terms (`Net 15` → 15; default 15). |
| BR-7 | At most one billing per (subscription, period start). |
| BR-8 | Overdue is **derived** (`confirmed` and `due_date < today` and balance > 0), never stored. |
| BR-9 | A discount is eligible if: within dates (null = open), `times_used < usage_limit` (null = unlimited), and minimum purchase/quantity met. |
| BR-10 | Per invoice: at most one product-level discount per line (the largest) and at most one subscription-level discount (the largest); subscription-level amounts are allocated proportionally across lines. |
| BR-11 | Closing a subscription stops billing; auto-close plans close subscriptions after expiry date or plan end. |
| BR-12 | Only admins create/edit products, plans, taxes, discounts, templates and staff. |

## 7. State machines

**Subscription:** `draft → quotation → confirmed → active → closed` (flag `paused` while active; early close allowed if plan.closable)
**Invoice:** `draft → confirmed → paid`; `draft|confirmed(no payments) → cancelled`

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Every page < 2 s with 5k+ subscriptions; paginated lists (default 25); indexed queries; aggregates in SQL. |
| Security | RLS on every table; service-role key server-only; role checks on every mutating endpoint; no secrets in client bundle or Git. |
| Validation | Zod schemas shared by client and server; friendly field errors. |
| UX | Responsive (desktop + phone), consistent colour scheme/layout, loading/empty/error states, clear nav. |
| Reliability | Billing run is atomic per subscription and safe to re-run. |
| Data | Real Postgres data (no static JSON); realtime updates on dashboard. |
| Maintainability | Small commits by all members, single `main` branch, clear README. |

## 9. Demo scenario (3–4 min; the build must support it flawlessly)

1. Admin creates product with **Odoo brand variant (+560)** and a monthly plan.
2. Staff creates a customer, then a subscription from a quotation template; moves it Draft → Quotation → Confirmed → Active.
3. Staff clicks **Run billing**: invoices appear with tax and a discount applied automatically. Click again: **0 duplicates**.
4. Confirm invoices, send one, print one.
5. Record a **partial then full payment**; invoice flips to Paid.
6. **Dashboard** updates live: active subs, revenue, outstanding, overdue list; open a page on the 5k-row seed and show it is fast.
7. Log in as the customer: portal shows only their data. Try a staff URL: redirected.

## 10. Assumptions and decisions (edit here if the team disagrees; the agent follows these)

- **A1: Plan fee.** Plan `price` is a recurring base fee billed as its own "Plan fee" invoice line; product lines are billed on top. (If the team prefers "plan price only", set product lines' unit price to 0 in the template.)
- **A2: Plan flags.** "Closed early / paused / renewed" are per-plan permissions that govern what can be done to **subscriptions** on that plan.
- **A3: Draft invoices.** The billing run creates **Draft** invoices; staff confirm them (bulk confirm available).
- **A4: Currency.** INR.
- **A5: Payments** are recorded manually; no gateway.
- **A6: Customers** are users with role `customer`; staff may create them.
- **A7: Timezone.** Dates are plain dates; "today" is evaluated in `Asia/Kolkata`.

## 11. Success criteria for the hackathon

- All P0 acceptance criteria pass on the **deployed URL**.
- The double-billing test and the RBAC test are demonstrably correct.
- Dashboard loads < 2 s on seeded data.
- Repo has README (setup, screenshots, features), commits from all 3 members, one branch.
- Demo video submitted by 17:30.
