import { createClient } from "@/lib/supabase/server";
import { canTransition } from "@/lib/status";
import { fail, ok, parseBody, validationError, withRole } from "@/lib/api";
import { transitionSchema } from "@/lib/validation/subscription";

export const POST = withRole(["admin", "staff"], async (request, _profile, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const parsed = await parseBody(request, transitionSchema);
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const { data: sub, error } = await supabase.from("subscriptions").select("id,status,start_date,next_billing_date,plan_id,plans(closable)").eq("id", id).maybeSingle();
  if (error) return fail("INTERNAL", "Could not load subscription.", 500);
  if (!sub) return fail("NOT_FOUND", "Subscription not found.", 404);
  if (!canTransition(sub.status, parsed.data.to)) return fail("INVALID_TRANSITION", `Cannot move a ${sub.status} subscription to ${parsed.data.to}.`, 409);
  const { count, error: linesError } = await supabase.from("subscription_lines").select("id", { count: "exact", head: true }).eq("subscription_id", id);
  if (linesError) return fail("INTERNAL", "Could not verify subscription lines.", 500);
  if (parsed.data.to === "active") {
    if (!sub.start_date || !count) return fail("VALIDATION_ERROR", "An active subscription needs a start date and at least one line.", 422);
  }
  const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;
  if (parsed.data.to === "closed" && !["draft", "quotation"].includes(sub.status) && !(plan as { closable: boolean } | null)?.closable) {
    return fail("INVALID_TRANSITION", "The plan does not allow this subscription to be closed early.", 409);
  }
  const update: Record<string, string | null> = { status: parsed.data.to };
  if (parsed.data.to === "active" && !sub.next_billing_date) update.next_billing_date = sub.start_date;
  const { error: updateError } = await supabase.from("subscriptions").update(update).eq("id", id);
  return updateError ? fail("INTERNAL", "Could not change subscription status.", 500) : ok({ id, status: parsed.data.to });
});
