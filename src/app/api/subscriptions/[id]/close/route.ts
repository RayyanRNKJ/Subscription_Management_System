import { createClient } from "@/lib/supabase/server";
import { canTransition } from "@/lib/status";
import { fail, ok, withRole } from "@/lib/api";

export const POST = withRole(["admin", "staff"], async (_request, _profile, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const supabase = await createClient();
  const { data: sub, error } = await supabase.from("subscriptions").select("id,status,plans(closable)").eq("id", id).maybeSingle();
  if (error) return fail("INTERNAL", "Could not load subscription.", 500);
  if (!sub) return fail("NOT_FOUND", "Subscription not found.", 404);
  if (!canTransition(sub.status, "closed")) return fail("INVALID_TRANSITION", "This subscription cannot be closed.", 409);
  const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;
  if (!["draft", "quotation"].includes(sub.status) && !(plan as { closable: boolean } | null)?.closable) return fail("INVALID_TRANSITION", "The plan does not allow early closing.", 409);
  const { error: updateError } = await supabase.from("subscriptions").update({ status: "closed", paused: false }).eq("id", id);
  return updateError ? fail("INTERNAL", "Could not close subscription.", 500) : ok({ id, status: "closed" });
});
