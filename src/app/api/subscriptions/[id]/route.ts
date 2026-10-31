import { createClient } from "@/lib/supabase/server";
import { fail, ok, parseBody, validationError, withRole } from "@/lib/api";
import { subscriptionPatchSchema } from "@/lib/validation/subscription";

const roles = ["admin", "staff"] as const;

export const GET = withRole([...roles], async (_request, _profile, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("subscriptions").select(
    "id,number,status,paused,start_date,expiry_date,payment_terms,next_billing_date,created_at,customer_id,plan_id,profiles(full_name,email),plans(id,name,price,period,min_quantity,auto_close,closable,pausable,renewable),subscription_lines(id,quantity,unit_price,tax_id,products(name,sales_price),product_variants(attribute,value,extra_price),taxes(name,rate))",
  ).eq("id", id).maybeSingle();
  if (error) return fail("INTERNAL", "Could not load subscription.", 500);
  return data ? ok(data) : fail("NOT_FOUND", "Subscription not found.", 404);
});

export const PATCH = withRole([...roles], async (request, _profile, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const parsed = await parseBody(request, subscriptionPatchSchema);
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const { data: existing, error: lookupError } = await supabase.from("subscriptions").select("id,status,start_date,plan_id").eq("id", id).maybeSingle();
  if (lookupError) return fail("INTERNAL", "Could not load subscription.", 500);
  if (!existing) return fail("NOT_FOUND", "Subscription not found.", 404);
  if (!["draft", "quotation"].includes(existing.status)) return fail("INVALID_TRANSITION", "Only draft or quotation subscriptions can be edited.", 409);
  const value = parsed.data;
  const startDate = value.start_date ?? existing.start_date;
  const planId = value.plan_id ?? existing.plan_id;
  const { data: plan, error: planError } = await supabase.from("plans").select("id,min_quantity,available_from,available_to").eq("id", planId).maybeSingle();
  if (planError) return fail("INTERNAL", "Could not validate plan.", 500);
  if (!plan) return fail("NOT_FOUND", "Plan not found.", 404);
  if (startDate && ((plan.available_from && startDate < plan.available_from) || (plan.available_to && startDate > plan.available_to))) return fail("PLAN_UNAVAILABLE", "This plan is not available on the selected start date.", 409);
  if (value.lines && value.lines.reduce((sum, line) => sum + line.quantity, 0) < (plan.min_quantity ?? 1)) return fail("VALIDATION_ERROR", `This plan requires a total quantity of at least ${plan.min_quantity ?? 1}.`, 422, { lines: "Increase the total line quantity to meet the plan minimum." });

  const { lines, ...fields } = value;
  const { error: updateError } = await supabase.from("subscriptions").update(fields).eq("id", id);
  if (updateError) return fail("INTERNAL", "Could not update subscription.", 500);
  if (lines) {
    const { error: deleteError } = await supabase.from("subscription_lines").delete().eq("subscription_id", id);
    if (deleteError) return fail("INTERNAL", "Could not replace subscription lines.", 500);
    const { error: insertError } = await supabase.from("subscription_lines").insert(lines.map((line) => ({ ...line, subscription_id: id })));
    if (insertError) return fail("INTERNAL", "Could not save subscription lines.", 500);
  }
  return ok({ id });
});
