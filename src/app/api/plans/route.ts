import { createClient } from "@/lib/supabase/server";
import { fail, ok, parseBody, validationError, withRole } from "@/lib/api";
import { planSchema } from "@/lib/validation/plan";

export const GET = withRole(["admin", "staff", "customer"], async () => {
  const supabase = await createClient(); const { data, error } = await supabase.from("plans").select("id,name,price,period,min_quantity,available_from,available_to,tax_id,auto_close,closable,pausable,renewable,taxes(name,rate)").order("name");
  return error ? fail("INTERNAL", error.message, 500) : ok(data ?? []);
});
export const POST = withRole(["admin"], async (request) => {
  const parsed = await parseBody(request, planSchema); if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient(); const { data, error } = await supabase.from("plans").insert(parsed.data).select("id").single();
  return error ? fail("INTERNAL", error.message, 500) : ok(data, { status: 201 });
});
