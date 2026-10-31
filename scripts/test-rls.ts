import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const demoPassword = "Demo@12345";
let failures = 0;

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    process.env[key] = value;
  }
}

function report(label: string, passed: boolean, detail?: string) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

function userClient(url: string, anonKey: string) {
  return createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: false } });
}

async function exactCount(client: SupabaseClient, table: string, column: string, value: string) {
  const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) throw new Error(`${table} count failed: ${error.message}`);
  return count ?? 0;
}

async function verifyCustomer(url: string, anonKey: string, staff: SupabaseClient, service: SupabaseClient, email: string, otherCustomerId: string) {
  const client = userClient(url, anonKey);
  const { data: authData, error: signInError } = await client.auth.signInWithPassword({ email, password: demoPassword });
  if (signInError || !authData.user) {
    report(`${email} signs in`, false, signInError?.message ?? "No auth user returned");
    return null;
  }
  const customerId = authData.user.id;
  report(`${email} signs in`, true);

  const [{ data: subscriptions, error: subError, count: visibleSubs }, { data: invoices, error: invoiceError, count: visibleInvoices }] = await Promise.all([
    client.from("subscriptions").select("id,customer_id", { count: "exact" }),
    client.from("invoices").select("id,customer_id", { count: "exact" }),
  ]);
  const [expectedSubs, expectedInvoices] = await Promise.all([
    exactCount(staff, "subscriptions", "customer_id", customerId),
    exactCount(staff, "invoices", "customer_id", customerId),
  ]);
  report(`${email} sees only own subscriptions`, !subError && (visibleSubs ?? 0) === expectedSubs && (subscriptions ?? []).every((row) => row.customer_id === customerId), subError?.message ?? `${visibleSubs ?? 0} visible / ${expectedSubs} owned`);
  report(`${email} sees only own invoices`, !invoiceError && (visibleInvoices ?? 0) === expectedInvoices && (invoices ?? []).every((row) => row.customer_id === customerId), invoiceError?.message ?? `${visibleInvoices ?? 0} visible / ${expectedInvoices} owned`);

  const ownedInvoiceIdsResult = await staff.from("invoices").select("id").eq("customer_id", customerId);
  if (ownedInvoiceIdsResult.error) throw new Error(`Could not read expected invoice IDs: ${ownedInvoiceIdsResult.error.message}`);
  const ownedInvoiceIds = (ownedInvoiceIdsResult.data ?? []).map((row) => row.id as string);
  const expectedPayments = ownedInvoiceIds.length
    ? (await staff.from("payments").select("id", { count: "exact", head: true }).in("invoice_id", ownedInvoiceIds)).count ?? 0
    : 0;
  const { data: visiblePayments, error: paymentError, count: visiblePaymentCount } = await client.from("payments").select("id,invoice_id", { count: "exact" });
  const visiblePaymentInvoiceIds = [...new Set((visiblePayments ?? []).map((row) => row.invoice_id as string))];
  const { data: visiblePaymentInvoices, error: paymentInvoicesError } = visiblePaymentInvoiceIds.length
    ? await client.from("invoices").select("id,customer_id").in("id", visiblePaymentInvoiceIds)
    : { data: [], error: null };
  report(`${email} sees only own payments`, !paymentError && !paymentInvoicesError && (visiblePaymentCount ?? 0) === expectedPayments && (visiblePaymentInvoices ?? []).every((row) => row.customer_id === customerId), paymentError?.message ?? paymentInvoicesError?.message ?? `${visiblePaymentCount ?? 0} visible / ${expectedPayments} owned`);

  const { data: otherInvoice } = await staff.from("invoices").select("id").eq("customer_id", otherCustomerId).limit(1).maybeSingle();
  if (!otherInvoice) {
    report(`${email} cannot query another customer's invoice`, false, "The other seeded customer has no invoice to probe");
  } else {
    const { data: crossCustomerInvoice, error: crossQueryError } = await client.from("invoices").select("id").eq("id", otherInvoice.id).maybeSingle();
    report(`${email} cannot query another customer's invoice`, !crossQueryError && crossCustomerInvoice === null, crossQueryError?.message);
  }

  await client.auth.signOut();
  return customerId;
}

async function expectInsertDenied(client: SupabaseClient, service: SupabaseClient, label: string, table: string, row: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(row).select("id").maybeSingle();
  if (data?.id) {
    const { error: cleanupError } = await service.from(table).delete().eq("id", data.id as string);
    report(label, false, cleanupError ? `Insert succeeded and cleanup failed: ${cleanupError.message}` : "Insert unexpectedly succeeded; test row was removed");
    return;
  }
  const deniedByRls = error?.code === "42501" || error?.message.toLowerCase().includes("row-level security");
  report(label, Boolean(deniedByRls), error?.message ?? "Insert returned no row and no RLS denial");
}

async function main() {
  loadLocalEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const staff = userClient(url, anonKey);
  const { error: staffSignInError } = await staff.auth.signInWithPassword({ email: "staff@brightloop.test", password: demoPassword });
  if (staffSignInError) throw new Error(`Could not sign in as staff: ${staffSignInError.message}`);
  const { data: firstCustomer, error: firstCustomerError } = await staff.from("profiles").select("id").eq("email", "customer@brightloop.test").single();
  const { data: otherCustomer, error: otherCustomerError } = await staff.from("profiles").select("id").eq("email", "customer001@brightloop.test").single();
  if (firstCustomerError || otherCustomerError || !firstCustomer || !otherCustomer) throw new Error("Seeded customers are missing; run the seed script first.");

  const firstCustomerId = await verifyCustomer(url, anonKey, staff, service, "customer@brightloop.test", otherCustomer.id);
  if (firstCustomerId) await verifyCustomer(url, anonKey, staff, service, "customer001@brightloop.test", firstCustomerId);

  const customerClient = userClient(url, anonKey);
  const { data: customerSignIn, error: customerSignInError } = await customerClient.auth.signInWithPassword({ email: "customer@brightloop.test", password: demoPassword });
  if (customerSignInError || !customerSignIn.user) throw new Error(`Could not sign in for denied-write checks: ${customerSignInError?.message ?? "No user returned"}`);
  const unique = crypto.randomUUID();
  await expectInsertDenied(customerClient, service, "Customer cannot insert products", "products", { name: `[rls-check] customer ${unique}`, type: "service", sales_price: 1 });
  await expectInsertDenied(customerClient, service, "Customer cannot insert discounts", "discounts", { name: `[rls-check] customer ${unique}`, kind: "fixed", value: 1 });
  const { data: attemptedRole, error: roleUpdateError } = await customerClient.from("profiles").update({ role: "admin" }).eq("id", customerSignIn.user.id).select("id,role");
  const { data: roleAfter } = await customerClient.from("profiles").select("role").eq("id", customerSignIn.user.id).maybeSingle();
  if (roleAfter?.role === "admin") {
    await service.from("profiles").update({ role: "customer" }).eq("id", customerSignIn.user.id);
  }
  const roleRemainsCustomer = roleAfter?.role === "customer";
  report("Customer cannot update profile role", roleRemainsCustomer && (Boolean(roleUpdateError) || !attemptedRole?.length), roleUpdateError?.message ?? `Role after attempt: ${roleAfter?.role ?? "unavailable"}`);
  await customerClient.auth.signOut();

  const staffClient = userClient(url, anonKey);
  const { error: staffAuthError } = await staffClient.auth.signInWithPassword({ email: "staff@brightloop.test", password: demoPassword });
  if (staffAuthError) throw new Error(`Could not sign in as staff: ${staffAuthError.message}`);
  for (const table of ["products", "plans", "discounts"]) {
    const { count, error } = await staffClient.from(table).select("id", { count: "exact", head: true });
    report(`Staff can read ${table}`, !error && (count ?? 0) > 0, error?.message ?? `${count ?? 0} rows visible`);
  }
  await expectInsertDenied(staffClient, service, "Staff cannot insert products", "products", { name: `[rls-check] staff ${crypto.randomUUID()}`, type: "service", sales_price: 1 });
  await expectInsertDenied(staffClient, service, "Staff cannot insert plans", "plans", { name: `[rls-check] staff ${crypto.randomUUID()}`, price: 1, period: "monthly", min_quantity: 1 });
  await expectInsertDenied(staffClient, service, "Staff cannot insert discounts", "discounts", { name: `[rls-check] staff ${crypto.randomUUID()}`, kind: "fixed", value: 1 });
  await staffClient.auth.signOut();

  console.log(failures ? `RLS verification failed: ${failures} check(s).` : "All RLS checks passed.");
  if (failures) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(`FAIL RLS test setup — ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
