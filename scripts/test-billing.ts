import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this integration test.");

const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const asDate = (value: Date) => value.toISOString().slice(0, 10);

function addMonths(dateText: string, count: number) {
  const [year, month, day] = dateText.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + count, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return asDate(target);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const [{ data: customer, error: customerError }, { data: plan, error: planError }, { data: tax, error: taxError }] = await Promise.all([
    supabase.from("profiles").select("id").eq("role", "customer").limit(1).maybeSingle(),
    supabase.from("plans").select("id,period").eq("period", "monthly").limit(1).maybeSingle(),
    supabase.from("taxes").select("id,rate").eq("rate", 18).limit(1).maybeSingle(),
  ]);
  if (customerError || planError || taxError) throw new Error("Could not load billing fixtures from the database.");
  assert(customer, "Create at least one customer profile first.");
  assert(plan, "Create a monthly plan first.");
  assert(tax, "Create an 18% tax first.");

  const { data: product, error: productError } = await supabase.from("products").select("id,name").limit(1).maybeSingle();
  if (productError) throw new Error("Could not load a product fixture.");
  assert(product, "Create at least one product first.");

  // run_billing processes every due active subscription. Require an isolated test
  // database so this script cannot create invoices for unrelated seeded records.
  const { data: dueRows, error: dueError } = await supabase.from("subscriptions").select("id,next_billing_date,expiry_date")
    .eq("status", "active").eq("paused", false).lte("next_billing_date", today);
  if (dueError) throw new Error("Could not check for unrelated due subscriptions.");
  const unrelatedDue = (dueRows ?? []).filter((row) => !row.expiry_date || row.next_billing_date <= row.expiry_date).length;
  assert(unrelatedDue === 0, "Run this script in a clean billing test database with no unrelated due active subscriptions.");
  const { data: autoCloseSubs, error: autoCloseError } = await supabase.from("subscriptions").select("id,expiry_date,plans(auto_close,available_to)").eq("status", "active");
  if (autoCloseError) throw new Error("Could not check for unrelated auto-close work.");
  const unrelatedAutoClose = (autoCloseSubs ?? []).some((row) => {
    const planData = Array.isArray(row.plans) ? row.plans[0] : row.plans;
    return Boolean(planData?.auto_close && ((row.expiry_date && row.expiry_date < today) || (planData.available_to && planData.available_to < today)));
  });
  assert(!unrelatedAutoClose, "Run this script in a clean billing test database without unrelated auto-close subscriptions.");

  const ids: string[] = [];
  let mainSubscriptionId: string | undefined;
  try {
    const threePeriodsAgo = addMonths(today, -2);
    const expiredDate = addMonths(today, -1);
    const futureCursor = addMonths(today, -1);
    const fixtures = [
      { status: "active", paused: false, next_billing_date: threePeriodsAgo, expiry_date: null, label: "billable" },
      { status: "active", paused: true, next_billing_date: futureCursor, expiry_date: null, label: "paused" },
      { status: "confirmed", paused: false, next_billing_date: futureCursor, expiry_date: null, label: "nonactive" },
      { status: "active", paused: false, next_billing_date: today, expiry_date: expiredDate, label: "expired" },
    ] as const;

    for (const fixture of fixtures) {
      const { data, error } = await supabase.from("subscriptions").insert({
        customer_id: customer.id,
        plan_id: plan.id,
        status: fixture.status,
        paused: fixture.paused,
        start_date: fixture.label === "expired" ? expiredDate : fixture.next_billing_date,
        expiry_date: fixture.expiry_date,
        next_billing_date: fixture.next_billing_date,
        payment_terms: "Net 15",
      }).select("id").single();
      if (error || !data) throw new Error(`Could not create ${fixture.label} test subscription: ${error?.message ?? "unknown error"}`);
      ids.push(data.id);
      if (fixture.label === "billable") mainSubscriptionId = data.id;
      const { error: lineError } = await supabase.from("subscription_lines").insert([
        { subscription_id: data.id, product_id: product.id, quantity: 1, unit_price: 1000, tax_id: tax.id },
        { subscription_id: data.id, product_id: product.id, quantity: 1, unit_price: 33.33, tax_id: tax.id },
      ]);
      if (lineError) throw new Error(`Could not create ${fixture.label} test lines: ${lineError.message}`);
    }

    const { data: firstRun, error: firstError } = await supabase.rpc("run_billing", { p_run_date: today });
    if (firstError) throw new Error(`First billing run failed: ${firstError.message}`);
    assert(firstRun.created === 3, `Expected three invoices for the three due periods, received ${firstRun.created}.`);
    assert(firstRun.failed === 0, `Expected no billing failures, received ${firstRun.failed}.`);

    const { data: invoices, error: invoicesError } = await supabase.from("invoices").select("id,period_start,period_end,status,total")
      .eq("subscription_id", mainSubscriptionId!).order("period_start");
    if (invoicesError) throw new Error(`Could not read generated invoices: ${invoicesError.message}`);
    assert(invoices.length === 3, `Expected three consecutive invoices; received ${invoices.length}.`);
    assert(invoices[0].period_start === threePeriodsAgo, "First invoice period did not start at the saved billing cursor.");
    assert(invoices[1].period_start === addMonths(invoices[0].period_start, 1), "Second invoice period is not consecutive.");
    assert(invoices[2].period_start === addMonths(invoices[1].period_start, 1), "Third invoice period is not consecutive.");

    const { data: firstLines, error: linesError } = await supabase.from("invoice_lines").select("unit_price,tax_amount,amount")
      .eq("invoice_id", invoices[0].id);
    if (linesError) throw new Error(`Could not read generated invoice lines: ${linesError.message}`);
    const tax1000 = firstLines.find((line) => Number(line.unit_price) === 1000);
    const tax3333 = firstLines.find((line) => Number(line.unit_price) === 33.33);
    assert(Number(tax1000?.tax_amount) === 180, "Tax for 1000 at 18% must be 180.00.");
    assert(Number(tax3333?.tax_amount) === 6, "Tax for 33.33 at 18% must round to 6.00.");

    const { data: secondRun, error: secondError } = await supabase.rpc("run_billing", { p_run_date: today });
    if (secondError) throw new Error(`Second billing run failed: ${secondError.message}`);
    assert(secondRun.created === 0, `Second run created ${secondRun.created} duplicate invoices.`);
    assert(secondRun.failed === 0, `Second billing run reported ${secondRun.failed} failures.`);

    for (const [index, label] of [[1, "paused"], [2, "non-active"], [3, "expired"]] as const) {
      const { count, error } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("subscription_id", ids[index]);
      if (error) throw new Error(`Could not verify ${label} subscription: ${error.message}`);
      assert((count ?? 0) === 0, `${label} subscription was billed.`);
    }

    // A draft rejects payment. Confirming drafts unlocks partial payment; a full
    // final payment changes the invoice to paid, and overpayment is rejected.
    const draftInvoice = invoices[0];
    const draftPayment = await supabase.rpc("record_payment", {
      p_invoice_id: draftInvoice.id, p_method: "upi", p_amount: 1, p_paid_on: today, p_note: null, p_user: customer.id,
    });
    assert(draftPayment.error?.message.includes("INVOICE_NOT_PAYABLE"), "Payment on a draft invoice must be rejected.");

    const { data: confirmedCount, error: confirmError } = await supabase.rpc("confirm_drafts", { p_subscription_ids: [mainSubscriptionId] });
    if (confirmError) throw new Error(`Could not confirm test invoices: ${confirmError.message}`);
    assert(confirmedCount === 3, `Expected three draft invoices confirmed, received ${confirmedCount}.`);

    const total = Number(draftInvoice.total);
    const partial = Math.min(1, total / 2);
    const partialResult = await supabase.rpc("record_payment", {
      p_invoice_id: draftInvoice.id, p_method: "upi", p_amount: partial, p_paid_on: today, p_note: "billing integration test", p_user: customer.id,
    });
    if (partialResult.error) throw new Error(`Partial payment failed: ${partialResult.error.message}`);
    assert(partialResult.data.invoice_status === "confirmed" && Number(partialResult.data.balance) > 0, "Partial payment must leave the invoice confirmed with a balance.");

    const overpayment = await supabase.rpc("record_payment", {
      p_invoice_id: draftInvoice.id, p_method: "upi", p_amount: Number(partialResult.data.balance) + 0.01, p_paid_on: today, p_note: null, p_user: customer.id,
    });
    assert(overpayment.error?.message.includes("OVERPAYMENT"), "Overpayment must be rejected.");

    const fullResult = await supabase.rpc("record_payment", {
      p_invoice_id: draftInvoice.id, p_method: "bank_transfer", p_amount: Number(partialResult.data.balance), p_paid_on: today, p_note: "settled", p_user: customer.id,
    });
    if (fullResult.error) throw new Error(`Final payment failed: ${fullResult.error.message}`);
    assert(fullResult.data.invoice_status === "paid" && Number(fullResult.data.balance) === 0, "Full payment must mark the invoice paid with zero balance.");

    console.log("Billing integration passed: billing idempotency, three periods, GST rounding, inactive/expired exclusions, and payment lifecycle.");
  } finally {
    if (ids.length) {
      await supabase.from("payments").delete().in("invoice_id", (await supabase.from("invoices").select("id").in("subscription_id", ids)).data?.map((row) => row.id) ?? []);
      await supabase.from("invoices").delete().in("subscription_id", ids);
      await supabase.from("subscription_lines").delete().in("subscription_id", ids);
      await supabase.from("subscriptions").delete().in("id", ids);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Billing integration failed.");
  process.exitCode = 1;
});
