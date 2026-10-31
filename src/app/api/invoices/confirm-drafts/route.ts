import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, ok, parseBody, validationError, withRole } from "@/lib/api";
import { confirmDraftsSchema } from "@/lib/validation/billing";

export const POST = withRole(["admin", "staff"], async (request) => {
  const parsed = await parseBody(request, confirmDraftsSchema);
  if (!parsed.success) return validationError(parsed.error);
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("confirm_drafts", { p_subscription_ids: parsed.data.subscription_ids ?? null });
  if (error) return fail("INTERNAL", "Draft invoices could not be confirmed.", 500);
  return ok({ confirmed: data ?? 0 });
});
