import { createClient } from "@/lib/supabase/server";
import { fail, ok, okList, parseBody, validationError, withRole } from "@/lib/api";
import { subscriptionSchema } from "@/lib/validation/subscription";

const roles = ["admin", "staff"] as const;

export const GET = withRole([...roles], async (request) => {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25) || 25));
  const supabase = await createClient();
  let query = supabase.from("subscriptions").select(
    "id,number,status,paused,start_date,expiry_date,next_billing_date,created_at,customer_id,plan_id,profiles(full_name,email),plans(name,period),subscription_lines(quantity,unit_price)",
    { count: page === 1 ? "exact" : "estimated" },
  );
  const status = url.searchParams.get("status");
  const plan = url.searchParams.get("plan");
  const customer = url.searchParams.get("customer");
  const q = url.searchParams.get("q")?.trim();
  if (status) query = query.eq("status", status);
  if (plan) query = query.eq("plan_id", plan);
  if (customer) query = query.eq("customer_id", customer);
  if (q) query = query.ilike("number", `%${q}%`);
  const { data, error, count } = await query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return fail("INTERNAL", "Could not load subscriptions.", 500);
  return okList(data ?? [], page, pageSize, count ?? 0);
});

export const POST = withRole([...roles], async (request, profile) => {
  const parsed = await parseBody(request, subscriptionSchema);
  if (!parsed.success) return validationError(parsed.error);
  const value = parsed.data;
  const supabase = await createClient();
  const [{ data: plan, error: planError }, { data: customer, error: customerError }] = await Promise.all([
    supabase.from("plans").select("id,min_quantity,available_from,available_to").eq("id", value.plan_id).maybeSingle(),
    supabase.from("profiles").select("id,role").eq("id", value.customer_id).eq("role", "customer").maybeSingle(),
  ]);
  if (planError || customerError) return fail("INTERNAL", "Could not validate subscription details.", 500);
  if (!plan) return fail("NOT_FOUND", "Choose an available plan.", 404);
  if (!customer) return fail("VALIDATION_ERROR", "Choose a customer account.", 422, { customer_id: "Choose a customer account." });
  if ((plan.available_from && value.start_date < plan.available_from) || (plan.available_to && value.start_date > plan.available_to)) {
    return fail("PLAN_UNAVAILABLE", "This plan is not available on the selected start date.", 409, { plan_id: "Choose a plan available on the start date." });
  }
  if (value.lines.reduce((sum, line) => sum + line.quantity, 0) < (plan.min_quantity ?? 1)) {
    return fail("VALIDATION_ERROR", `This plan requires a total quantity of at least ${plan.min_quantity ?? 1}.`, 422, { lines: "Increase the total line quantity to meet the plan minimum." });
  }

  const productIds = [...new Set(value.lines.map((line) => line.product_id))];
  const variantIds = [...new Set(value.lines.flatMap((line) => line.variant_id ? [line.variant_id] : []))];
  const [{ data: products, error: productsError }, { data: variants, error: variantsError }] = await Promise.all([
    supabase.from("products").select("id,sales_price,tax_id").in("id", productIds),
    variantIds.length ? supabase.from("product_variants").select("id,product_id,extra_price").in("id", variantIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (productsError || variantsError) return fail("INTERNAL", "Could not validate subscription lines.", 500);
  if ((products ?? []).length !== productIds.length) return fail("VALIDATION_ERROR", "One or more selected products are unavailable.", 422, { lines: "Choose available products." });
  if ((variants ?? []).length !== variantIds.length || value.lines.some((line) => line.variant_id && !(variants ?? []).some((variant) => variant.id === line.variant_id && variant.product_id === line.product_id))) return fail("VALIDATION_ERROR", "A selected variant does not match its product.", 422, { lines: "Choose a variant for its matching product." });
  const lines = value.lines.map((line) => {
    const product = products!.find((item) => item.id === line.product_id)!;
    const variant = variants!.find((item) => item.id === line.variant_id);
    return { ...line, unit_price: line.unit_price ?? Number(product.sales_price) + Number(variant?.extra_price ?? 0), tax_id: line.tax_id === undefined ? product.tax_id : line.tax_id };
  });
  const { data: subscription, error: insertError } = await supabase.from("subscriptions").insert({
    customer_id: value.customer_id,
    plan_id: value.plan_id,
    start_date: value.start_date,
    expiry_date: value.expiry_date ?? null,
    payment_terms: value.payment_terms ?? "Net 15",
    next_billing_date: value.start_date,
    status: "draft",
    created_by: profile.id,
  }).select("id,number").single();
  if (insertError || !subscription) return fail("INTERNAL", insertError?.message ?? "Could not create subscription.", 500);
  const { error: lineError } = await supabase.from("subscription_lines").insert(lines.map((line) => ({ ...line, subscription_id: subscription.id })));
  if (lineError) {
    await supabase.from("subscriptions").delete().eq("id", subscription.id);
    return fail("INTERNAL", "Could not save subscription lines.", 500);
  }
  return ok(subscription, { status: 201 });
});
