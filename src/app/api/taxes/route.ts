import { createClient } from "@/lib/supabase/server";
import { fail, ok, parseBody, validationError, withRole } from "@/lib/api";
import { taxSchema } from "@/lib/validation/tax";

const authenticated = ["admin", "staff", "customer"] as const;

export const GET = withRole([...authenticated], async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("taxes").select("id,name,rate").order("name");
  if (error) return fail("INTERNAL", error.message, 500);
  return ok(data ?? []);
});

export const POST = withRole(["admin"], async (request) => {
  const parsed = await parseBody(request, taxSchema);
  if (!parsed.success) return validationError(parsed.error);
  const supabase = await createClient();
  const { data, error } = await supabase.from("taxes").insert(parsed.data).select("id,name,rate").single();
  if (error) return fail(error.code === "23505" ? "CONFLICT" : "INTERNAL", error.message, error.code === "23505" ? 409 : 500);
  return ok(data, { status: 201 });
});
