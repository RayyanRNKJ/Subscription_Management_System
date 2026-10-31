import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail, ok, okList, parseBody, validationError, withRole } from "@/lib/api";
import { paymentMethods, paymentSchema } from "@/lib/validation/payment";

export const GET = withRole(["admin", "staff"], async (request) => {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25) || 25));
  const supabase = await createClient();
  let query = supabase.from("payments").select("id,invoice_id,method,amount,paid_on,note,created_by,invoices(number,status,total,due_date,profiles(full_name,email))", { count: page === 1 ? "exact" : "estimated" });
  const invoice = url.searchParams.get("invoice");
  const method = url.searchParams.get("method");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (invoice) query = query.eq("invoice_id", invoice);
  if (method && (paymentMethods as readonly string[]).includes(method)) query = query.eq("method", method);
  if (from) query = query.gte("paid_on", from);
  if (to) query = query.lte("paid_on", to);
  const { data, error, count } = await query.order("paid_on", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  return error ? fail("INTERNAL", "Could not load payments.", 500) : okList(data ?? [], page, pageSize, count ?? 0);
});

export const POST = withRole(["admin", "staff"], async (request, profile) => {
  const parsed = await parseBody(request, paymentSchema);
  if (!parsed.success) return validationError(parsed.error);
  const admin = supabaseAdmin();
  const { data, error } = await admin.rpc("record_payment", {
    p_invoice_id: parsed.data.invoice_id,
    p_method: parsed.data.method,
    p_amount: parsed.data.amount,
    p_paid_on: parsed.data.paid_on,
    p_note: parsed.data.note ?? null,
    p_user: profile.id,
  });
  if (error) {
    if (error.message.includes("OVERPAYMENT")) return fail("OVERPAYMENT", "Amount exceeds the outstanding balance.", 409, { amount: "Enter an amount no greater than the outstanding balance." });
    if (error.message.includes("INVOICE_NOT_PAYABLE")) return fail("INVOICE_NOT_PAYABLE", "Only confirmed invoices with an outstanding balance can accept payments.", 409);
    if (error.message.includes("INVOICE_NOT_FOUND")) return fail("NOT_FOUND", "Invoice not found.", 404);
    return fail("INTERNAL", "Payment could not be recorded.", 500);
  }
  return ok(data, { status: 201 });
});
