import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, ok, okList, parseBody, validationError, withRole } from "@/lib/api";
import { customerSchema } from "@/lib/validation/customer";

function pageFrom(value: string | null) { const page = Number(value ?? "1"); return Number.isInteger(page) && page > 0 ? page : 1; }

export const GET = withRole(["admin", "staff"], async (request) => {
  const url = new URL(request.url); const page = pageFrom(url.searchParams.get("page")); const query = url.searchParams.get("q")?.trim() ?? ""; const pageSize = 25;
  const supabase = await createClient(); let requestQuery = supabase.from("profiles").select("id,full_name,email,company", { count: "exact" }).eq("role", "customer").order("full_name").range((page - 1) * pageSize, page * pageSize - 1);
  if (query) { const escaped = query.replace(/[%_,()]/g, ""); requestQuery = requestQuery.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,company.ilike.%${escaped}%`); }
  const { data, error, count } = await requestQuery;
  return error ? fail("INTERNAL", error.message, 500) : okList(data ?? [], page, pageSize, count ?? 0);
});

export const POST = withRole(["admin", "staff"], async (request) => {
  const parsed = await parseBody(request, customerSchema); if (!parsed.success) return validationError(parsed.error);
  const { full_name, company, email, password } = parsed.data; const admin = supabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, company: company || null } });
  if (error || !data.user) return fail("CONFLICT", error?.message ?? "Could not create customer.", 409);
  // The auth trigger creates a customer profile. Persist the optional company explicitly.
  const { error: profileError } = await admin.from("profiles").update({ full_name, company: company || null, role: "customer" }).eq("id", data.user.id);
  if (profileError) return fail("INTERNAL", profileError.message, 500);
  return ok({ id: data.user.id, full_name, company: company || null, email }, { status: 201 });
});
