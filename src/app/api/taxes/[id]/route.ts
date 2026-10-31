import { createClient } from "@/lib/supabase/server";
import { fail, ok, parseBody, validationError, withRole } from "@/lib/api";
import { taxSchema } from "@/lib/validation/tax";

type Context = { params: Promise<{ id: string }> };

export const PATCH = withRole(["admin"], async (request, _profile, context) => {
  const { id } = await (context as Context).params;
  const parsed = await parseBody(request, taxSchema);
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("taxes").update(parsed.data).eq("id", id).select("id,name,rate").maybeSingle();
  if (error) return fail("INTERNAL", error.message, 500);
  if (!data) return fail("NOT_FOUND", "Tax not found.", 404);
  return ok(data);
});

export const DELETE = withRole(["admin"], async (request, _profile, context) => {
  const { id } = await (context as Context).params;
  const supabase = await createClient();
  const { error } = await supabase.from("taxes").delete().eq("id", id);
  if (error) return fail(error.code === "23503" ? "CONFLICT" : "INTERNAL", error.code === "23503" ? "This tax is in use and cannot be deleted." : error.message, error.code === "23503" ? 409 : 500);
  return ok({ id });
});
