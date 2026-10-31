import { fail, ok, parseBody, validationError, withRole } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { staffSchema } from "@/lib/validation";

// Only an admin may add staff. Role is set HERE on the server, never taken from the client.
export const POST = withRole(["admin"], async (req) => {
  const parsed = await parseBody(req, staffSchema);
  if (!parsed.success) return validationError(parsed.error);
  const { email, password, full_name } = parsed.data;

  const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (error) return fail("CONFLICT", error.message, 409);

  // The signup trigger creates the profile as 'customer'; promote it.
  const { error: roleErr } = await admin.from("profiles").update({ role: "staff" }).eq("id", data.user.id);
  if (roleErr) return fail("INTERNAL", roleErr.message, 500);

  return ok({ id: data.user.id, email }, { status: 201 });
});
