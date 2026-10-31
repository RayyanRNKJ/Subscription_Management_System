import { createClient } from "@/lib/supabase/server";
import { fail, ok, withRole } from "@/lib/api";

export const POST = withRole(["admin", "staff"], async (_request, _profile, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const supabase = await createClient();
  const { data: sub, error } = await supabase.from("subscriptions").select("id,status,paused,plans(pausable)").eq("id", id).maybeSingle();
  if (error) return fail("INTERNAL", "Could not load subscription.", 500);
  if (!sub) return fail("NOT_FOUND", "Subscription not found.", 404);
  if (sub.status !== "active" || !sub.paused) return fail("INVALID_TRANSITION", "Only a paused active subscription can be resumed.", 409);
  const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans;
  if (!(plan as { pausable: boolean } | null)?.pausable) return fail("INVALID_TRANSITION", "The plan does not allow resuming.", 409);
  const { error: updateError } = await supabase.from("subscriptions").update({ paused: false }).eq("id", id);
  return updateError ? fail("INTERNAL", "Could not resume subscription.", 500) : ok({ id, paused: false });
});
