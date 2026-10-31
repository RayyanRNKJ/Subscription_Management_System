import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, ok, parseBody, validationError, withRole } from "@/lib/api";
import { billingRunSchema } from "@/lib/validation/billing";

export const POST = withRole(["admin", "staff"], async (request) => {
  const parsed = await parseBody(request, billingRunSchema);
  if (!parsed.success) return validationError(parsed.error);
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("run_billing", { p_run_date: parsed.data.run_date ?? null });
  if (error) return fail("INTERNAL", "Billing could not be completed. Review the billing run and try again.", 500);
  return ok(data);
});
