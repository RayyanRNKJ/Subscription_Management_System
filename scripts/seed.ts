import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
type UserSeed = { email: string; full_name: string; company: string | null; role: "admin" | "staff" | "customer" };

const batchSize = 500;
const demoPrefix = "[demo]";
const password = "Demo@12345";

function loadLocalEnv() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    process.env[key] = value;
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}; add it to .env.local or the environment.`);
  return value;
}

function chunks<T>(items: T[], size = batchSize) {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

async function insertBatches(client: SupabaseClient, table: string, rows: Row[]) {
  for (const batch of chunks(rows)) {
    const { error } = await client.from(table).insert(batch);
    if (error) throw new Error(`Insert ${table} failed: ${error.message}`);
  }
}

async function deleteByIds(client: SupabaseClient, table: string, column: string, ids: string[]) {
  for (const batch of chunks(ids, 100)) {
    const { error } = await client.from(table).delete().in(column, batch);
    if (error) throw new Error(`Delete ${table} failed: ${error.message}`);
  }
}

async function getAllUsers(client: SupabaseClient) {
  const users: { id: string; email?: string }[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not list auth users: ${error.message}`);
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email?.toLowerCase() })));
    if (data.users.length < 1000) return users;
  }
}

function usersToSeed(): UserSeed[] {
  const users: UserSeed[] = [
    { email: "admin@brightloop.test", full_name: "Brightloop Demo Admin", company: "Brightloop", role: "admin" },
    { email: "staff@brightloop.test", full_name: "Brightloop Demo Staff", company: "Brightloop", role: "staff" },
    { email: "customer@brightloop.test", full_name: "Brightloop Demo Customer", company: "Demo Customer Co", role: "customer" },
  ];
  for (let i = 1; i <= 200; i += 1) {
    const n = String(i).padStart(3, "0");
    users.push({ email: `customer${n}@brightloop.test`, full_name: `${demoPrefix} Customer ${n}`, company: `${demoPrefix} Company ${n}`, role: "customer" });
  }
  return users;
}

async function ensureUsers(client: SupabaseClient, users: UserSeed[]) {
  const existing = new Map((await getAllUsers(client)).filter((user) => user.email).map((user) => [user.email!, user.id]));
  const ids = new Map<string, string>();
  for (const user of users) if (existing.has(user.email)) ids.set(user.email, existing.get(user.email)!);

  const missing = users.filter((user) => !ids.has(user.email));
  for (const batch of chunks(missing, 10)) {
    const created = await Promise.all(batch.map(async (user) => {
      const { data, error } = await client.auth.admin.createUser({
        email: user.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: user.full_name, company: user.company },
      });
      if (error || !data.user) throw new Error(`Create ${user.email} failed: ${error?.message ?? "No user returned"}`);
      return [user.email, data.user.id] as const;
    }));
    for (const [email, id] of created) ids.set(email, id);
  }

  for (const batch of chunks(users, 10)) {
    await Promise.all(batch.map(async (user) => {
      const { error } = await client.from("profiles").update({ full_name: user.full_name, company: user.company, role: user.role }).eq("id", ids.get(user.email)!);
      if (error) throw new Error(`Profile update ${user.email} failed: ${error.message}`);
    }));
  }
  return ids;
}

async function cleanupDemo(client: SupabaseClient, userIds: string[], removeUsers: boolean) {
  const { data: products, error: productReadError } = await client.from("products").select("id").like("name", `${demoPrefix}%`);
  if (productReadError) throw new Error(`Find demo products failed: ${productReadError.message}`);
  const productIds = (products ?? []).map((row) => row.id as string);
  const { data: demoPlans, error: earlyPlanReadError } = await client.from("plans").select("id").like("name", `${demoPrefix}%`);
  if (earlyPlanReadError) throw new Error(`Find demo plans failed: ${earlyPlanReadError.message}`);
  const planIds = (demoPlans ?? []).map((row) => row.id as string);
  const subIds: string[] = [];
  for (const batch of chunks(productIds, 100)) {
    const { data, error } = await client.from("subscription_lines").select("subscription_id").in("product_id", batch);
    if (error) throw new Error(`Find demo subscription lines failed: ${error.message}`);
    subIds.push(...(data ?? []).map((row) => row.subscription_id as string));
  }
  // Also catch an interrupted batch that created a demo subscription before its line batch.
  if (userIds.length && planIds.length) {
    for (const customerBatch of chunks(userIds, 100)) {
      const { data, error } = await client.from("subscriptions").select("id").in("customer_id", customerBatch).in("plan_id", planIds);
      if (error) throw new Error(`Find incomplete demo subscriptions failed: ${error.message}`);
      subIds.push(...(data ?? []).map((row) => row.id as string));
    }
  }
  const uniqueSubIds = [...new Set(subIds)];
  const invoiceIds: string[] = [];
  for (const batch of chunks(uniqueSubIds, 500)) {
    const { data, error } = await client.from("invoices").select("id").in("subscription_id", batch);
    if (error) throw new Error(`Find demo invoices failed: ${error.message}`);
    invoiceIds.push(...(data ?? []).map((row) => row.id as string));
  }

  await deleteByIds(client, "payments", "invoice_id", invoiceIds);
  await deleteByIds(client, "invoice_lines", "invoice_id", invoiceIds);
  await deleteByIds(client, "invoices", "id", invoiceIds);
  await deleteByIds(client, "subscription_lines", "subscription_id", uniqueSubIds);
  await deleteByIds(client, "subscriptions", "id", uniqueSubIds);

  const { data: demoDiscounts, error: discountReadError } = await client.from("discounts").select("id").like("name", `${demoPrefix}%`);
  if (discountReadError) throw new Error(`Find demo discounts failed: ${discountReadError.message}`);
  await deleteByIds(client, "discounts", "id", (demoDiscounts ?? []).map((row) => row.id as string));

  const { data: templates, error: templateReadError } = await client.from("quotation_templates").select("id").like("name", `${demoPrefix}%`);
  if (templateReadError) throw new Error(`Find demo templates failed: ${templateReadError.message}`);
  await deleteByIds(client, "quotation_templates", "id", (templates ?? []).map((row) => row.id as string));

  await deleteByIds(client, "product_variants", "product_id", productIds);
  await deleteByIds(client, "products", "id", productIds);

  await deleteByIds(client, "plans", "id", planIds);

  const { data: taxes, error: taxReadError } = await client.from("taxes").select("id").like("name", `${demoPrefix}%`);
  if (taxReadError) throw new Error(`Find demo taxes failed: ${taxReadError.message}`);
  await deleteByIds(client, "taxes", "id", (taxes ?? []).map((row) => row.id as string));

  if (removeUsers) {
    for (const id of userIds) {
      const { error } = await client.auth.admin.deleteUser(id);
      if (error) throw new Error(`Delete demo auth user failed: ${error.message}`);
    }
  }
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return dateOnly(date);
}

function addPeriod(date: Date, period: string) {
  const next = new Date(date);
  if (period === "daily") next.setUTCDate(next.getUTCDate() + 1);
  else if (period === "weekly") next.setUTCDate(next.getUTCDate() + 7);
  else if (period === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

function subtractPeriods(date: Date, period: string, count: number) {
  const earlier = new Date(date);
  if (period === "daily") earlier.setUTCDate(earlier.getUTCDate() - count);
  else if (period === "weekly") earlier.setUTCDate(earlier.getUTCDate() - 7 * count);
  else if (period === "monthly") earlier.setUTCMonth(earlier.getUTCMonth() - count);
  else earlier.setUTCFullYear(earlier.getUTCFullYear() - count);
  return earlier;
}

function cents(value: number) { return Math.round(value * 100); }
function money(value: number) { return (Math.round(value) / 100).toFixed(2); }
function taxCents(netCents: number, rate: number) { return Math.round((netCents * rate) / 100); }

async function seed() {
  loadLocalEnv();
  const adminClient = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const allUsers = usersToSeed();
  const shouldReset = process.argv.includes("--reset");

  const userIds = await getAllUsers(adminClient);
  const emailToId = new Map(userIds.filter((user) => user.email).map((user) => [user.email!, user.id]));
  const seededExistingIds = allUsers.map((user) => emailToId.get(user.email)).filter((id): id is string => Boolean(id));
  if (seededExistingIds.length) await cleanupDemo(adminClient, seededExistingIds, false);
  if (shouldReset) {
    for (const id of seededExistingIds) {
      const { error } = await adminClient.auth.admin.deleteUser(id);
      if (error) throw new Error(`Delete demo auth user failed: ${error.message}`);
    }
    console.log(`Reset complete: removed demo rows and ${seededExistingIds.length} seeded auth users.`);
    return;
  }

  const idsByEmail = await ensureUsers(adminClient, allUsers);
  const customerSeeds = allUsers.filter((user) => user.role === "customer");
  const customerIds = customerSeeds.map((user) => idsByEmail.get(user.email)!);

  const today = dateOnly(new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })));
  const taxRows = [5, 12, 18].map((rate) => ({ id: crypto.randomUUID(), name: `${demoPrefix} GST ${rate}%`, rate }));
  await insertBatches(adminClient, "taxes", taxRows);
  const taxByRate = new Map(taxRows.map((row) => [row.rate, row.id]));

  const productDefinitions = [
    ["Odoo ERP Suite", 4200, 5], ["CRM Add-on", 1800, 18], ["Support Pack", 950, 12],
    ["Analytics Module", 2400, 18], ["Inventory Connector", 1350, 12], ["Team Collaboration", 750, 5],
    ["Cloud Backup", 550, 18], ["Priority Support", 1250, 12],
  ] as const;
  const products = productDefinitions.map(([name, sales_price, rate]) => ({ id: crypto.randomUUID(), name: `${demoPrefix} ${name}`, type: "service", sales_price, cost_price: Math.round(sales_price * 0.4), notes: "Demo subscription product", tax_id: taxByRate.get(rate) }));
  await insertBatches(adminClient, "products", products);
  const variants = [
    { id: crypto.randomUUID(), product_id: products[0].id, attribute: "Brand", value: "Odoo", extra_price: 560 },
    { id: crypto.randomUUID(), product_id: products[0].id, attribute: "Brand", value: "Other", extra_price: 0 },
  ];
  await insertBatches(adminClient, "product_variants", variants);

  const planSpecs = [
    { name: "Daily Trial", price: 0, period: "daily", min_quantity: 1, auto_close: true, closable: true, pausable: false, renewable: false, rate: 5 },
    { name: "Weekly Starter", price: 250, period: "weekly", min_quantity: 1, auto_close: false, closable: true, pausable: true, renewable: true, rate: 12 },
    { name: "Monthly Business", price: 900, period: "monthly", min_quantity: 1, auto_close: false, closable: true, pausable: true, renewable: true, rate: 18 },
    { name: "Yearly Enterprise", price: 7200, period: "yearly", min_quantity: 5, auto_close: true, closable: false, pausable: false, renewable: true, rate: 18 },
  ] as const;
  const plans = planSpecs.map((plan) => ({
    id: crypto.randomUUID(), name: `${demoPrefix} ${plan.name}`, price: plan.price, period: plan.period,
    min_quantity: plan.min_quantity, available_from: shiftDate(today, -730), available_to: shiftDate(today, 730),
    auto_close: plan.auto_close, closable: plan.closable, pausable: plan.pausable, renewable: plan.renewable,
    tax_id: taxByRate.get(plan.rate),
  }));
  await insertBatches(adminClient, "plans", plans);

  const discounts = [
    { id: crypto.randomUUID(), name: `${demoPrefix} 10% Odoo discount`, kind: "percent", value: 10, min_purchase: null, min_quantity: null, start_date: shiftDate(today, -30), end_date: shiftDate(today, 90), usage_limit: null, times_used: 0, product_id: products[0].id, subscription_id: null },
    { id: crypto.randomUUID(), name: `${demoPrefix} ₹500 subscription discount`, kind: "fixed", value: 500, min_purchase: 5000, min_quantity: null, start_date: shiftDate(today, -30), end_date: shiftDate(today, 90), usage_limit: null, times_used: 0, product_id: null, subscription_id: null },
    { id: crypto.randomUUID(), name: `${demoPrefix} Expired discount`, kind: "percent", value: 15, min_purchase: null, min_quantity: null, start_date: shiftDate(today, -120), end_date: shiftDate(today, -60), usage_limit: null, times_used: 0, product_id: products[1].id, subscription_id: null },
    { id: crypto.randomUUID(), name: `${demoPrefix} Single use discount`, kind: "fixed", value: 100, min_purchase: null, min_quantity: null, start_date: shiftDate(today, -30), end_date: shiftDate(today, 90), usage_limit: 1, times_used: 0, product_id: products[2].id, subscription_id: null },
  ];
  await insertBatches(adminClient, "discounts", discounts);

  const templates = [
    { id: crypto.randomUUID(), name: `${demoPrefix} Business onboarding`, plan_id: plans[2].id, validity_days: 30 },
    { id: crypto.randomUUID(), name: `${demoPrefix} Enterprise rollout`, plan_id: plans[3].id, validity_days: 45 },
  ];
  await insertBatches(adminClient, "quotation_templates", templates);
  await insertBatches(adminClient, "quotation_template_lines", [
    { template_id: templates[0].id, product_id: products[0].id, quantity: 1 },
    { template_id: templates[0].id, product_id: products[2].id, quantity: 2 },
    { template_id: templates[1].id, product_id: products[0].id, quantity: 5 },
    { template_id: templates[1].id, product_id: products[3].id, quantity: 5 },
  ]);

  const statusFor = (index: number) => index % 10 < 8 ? "active" : index % 10 === 8 ? "quotation" : "closed";
  const subscriptions: Row[] = [];
  const subscriptionLines: Row[] = [];
  const subMeta: { id: string; customer_id: string; planIndex: number; status: string; start: string; productIndex: number; quantity: number }[] = [];
  for (let i = 0; i < 5000; i += 1) {
    const id = crypto.randomUUID();
    const customer_id = customerIds[i % customerIds.length];
    const planIndex = i % plans.length;
    const plan = planSpecs[planIndex];
    const status = statusFor(i);
    const productIndex = i % products.length;
    const quantity = plan.min_quantity + (i % 3);
    const start = shiftDate(today, -((i * 17) % 700 + 60));
    const dueOffset = i % 5 === 0 ? -((i % 45) + 1) : i % 5 === 1 ? (i % 120) + 1 : (i % 60) - 30;
    const nextBilling = shiftDate(today, dueOffset);
    subscriptions.push({ id, customer_id, plan_id: plans[planIndex].id, status, start_date: start, expiry_date: shiftDate(start, plan.period === "yearly" ? 365 : 180), payment_terms: "Net 15", next_billing_date: nextBilling, paused: status === "active" && i % 19 === 0, created_by: idsByEmail.get(i % 2 ? "staff@brightloop.test" : "admin@brightloop.test") });
    subscriptionLines.push({ id: crypto.randomUUID(), subscription_id: id, product_id: products[productIndex].id, variant_id: productIndex === 0 ? variants[i % 2].id : null, quantity, unit_price: productDefinitions[productIndex][1] + (productIndex === 0 && i % 2 === 0 ? 560 : 0), tax_id: taxByRate.get(productDefinitions[productIndex][2]) });
    subMeta.push({ id, customer_id, planIndex, status, start, productIndex, quantity });
  }
  await insertBatches(adminClient, "subscriptions", subscriptions);
  await insertBatches(adminClient, "subscription_lines", subscriptionLines);

  const invoices: Row[] = [];
  const invoiceLines: Row[] = [];
  const payments: Row[] = [];
  const paymentMethods = ["cash", "bank_transfer", "card", "upi", "cheque"];
  const invoiceCountByStatus = { draft: 0, confirmed: 0, paid: 0, cancelled: 0 };
  for (let i = 0; i < subMeta.length; i += 1) {
    const sub = subMeta[i];
    const plan = planSpecs[sub.planIndex];
    const latestPeriod = new Date(`${shiftDate(today, -((i * 7) % 180 + 1))}T00:00:00.000Z`);
    let periodStart = subtractPeriods(latestPeriod, plan.period, 2);
    for (let period = 0; period < 3; period += 1) {
      const invoiceId = crypto.randomUUID();
      const start = dateOnly(periodStart);
      const periodEnd = dateOnly(new Date(addPeriod(periodStart, plan.period).getTime() - 86400000));
      const issue = periodStart;
      const issueDate = dateOnly(issue);
      const dueDate = shiftDate(issueDate, 15);
      const status = (i + period) % 10 < 2 ? "draft" : (i + period) % 10 < 5 ? "confirmed" : (i + period) % 10 < 9 ? "paid" : "cancelled";
      invoiceCountByStatus[status as keyof typeof invoiceCountByStatus] += 1;
      const pidx = sub.productIndex;
      const baseCents = cents(plan.price) + cents((productDefinitions[pidx][1] + (pidx === 0 && i % 2 === 0 ? 560 : 0)) * sub.quantity);
      const taxRate = productDefinitions[pidx][2];
      const discountCents = i % 17 === 0 ? Math.min(cents(500), Math.floor(baseCents * 0.1)) : i % 11 === 0 ? Math.floor(baseCents * 0.05) : 0;
      const planBaseCents = cents(plan.price);
      const productBaseCents = cents((productDefinitions[pidx][1] + (pidx === 0 && i % 2 === 0 ? 560 : 0)) * sub.quantity);
      const splitPlanDiscount = baseCents ? Math.floor(discountCents * planBaseCents / baseCents) : 0;
      const lineSpecs = [] as { description: string; quantity: number; unit_price_cents: number; discount_cents: number; tax_rate: number }[];
      if (plan.price > 0) lineSpecs.push({ description: `Plan fee — ${demoPrefix} ${plan.name}`, quantity: 1, unit_price_cents: planBaseCents, discount_cents: splitPlanDiscount, tax_rate: plan.rate });
      lineSpecs.push({ description: `${demoPrefix} ${productDefinitions[pidx][0]}${pidx === 0 ? ` (Brand: ${i % 2 === 0 ? "Odoo" : "Other"})` : ""}`, quantity: sub.quantity, unit_price_cents: Math.round(productBaseCents / sub.quantity), discount_cents: discountCents - splitPlanDiscount, tax_rate: taxRate });
      let subtotalCents = 0;
      let taxTotalCents = 0;
      for (const line of lineSpecs) {
        const grossCents = line.quantity * line.unit_price_cents;
        const netCents = Math.max(0, grossCents - line.discount_cents);
        const lineTax = taxCents(netCents, line.tax_rate);
        subtotalCents += netCents;
        taxTotalCents += lineTax;
        invoiceLines.push({ id: crypto.randomUUID(), invoice_id: invoiceId, description: line.description, quantity: line.quantity, unit_price: money(line.unit_price_cents), tax_amount: money(lineTax), discount_amount: money(line.discount_cents), amount: money(netCents) });
      }
      const totalCents = subtotalCents + taxTotalCents;
      invoices.push({ id: invoiceId, subscription_id: sub.id, customer_id: sub.customer_id, status, period_start: start, period_end: periodEnd, issue_date: issueDate, due_date: dueDate, subtotal: money(subtotalCents), discount_total: money(discountCents), tax_total: money(taxTotalCents), total: money(totalCents) });

      const hasPayment = status === "paid" || (status === "confirmed" && (i + period) % 5 < 3);
      if (hasPayment) {
        const amountCents = status === "paid" ? totalCents : Math.max(1, Math.floor(totalCents * ((i % 4) + 1) / 10));
        payments.push({ id: crypto.randomUUID(), invoice_id: invoiceId, method: paymentMethods[(i + period) % paymentMethods.length], amount: money(amountCents), paid_on: shiftDate(issueDate, Math.min(10, (i + period) % 12)), note: `${demoPrefix} seed payment`, created_by: idsByEmail.get(i % 2 ? "staff@brightloop.test" : "admin@brightloop.test") });
      }
      periodStart = addPeriod(periodStart, plan.period);
    }
  }

  await insertBatches(adminClient, "invoices", invoices);
  await insertBatches(adminClient, "invoice_lines", invoiceLines);
  await insertBatches(adminClient, "payments", payments);

  const { count: seededCustomers } = await adminClient.from("profiles").select("id", { count: "exact", head: true }).in("id", customerIds);
  console.log("Brightloop demo seed finished.");
  console.log(JSON.stringify({
    users: { admin: 1, staff: 1, customers: seededCustomers ?? customerIds.length },
    taxes: taxRows.length, products: products.length, variants: variants.length, plans: plans.length,
    discounts: discounts.length, quotation_templates: templates.length, subscriptions: subscriptions.length,
    subscription_lines: subscriptionLines.length, invoices: invoices.length, invoice_lines: invoiceLines.length,
    payments: payments.length, invoice_statuses: invoiceCountByStatus,
  }, null, 2));
}

seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
