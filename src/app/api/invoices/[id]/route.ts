import { createClient } from "@/lib/supabase/server";
import { fail, ok, withRole } from "@/lib/api";

export const GET = withRole(["admin", "staff", "customer"], async (_request, profile, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const supabase = await createClient();
  let invoiceQuery = supabase.from("invoices").select("id,number,subscription_id,customer_id,status,period_start,period_end,issue_date,due_date,subtotal,discount_total,tax_total,total,sent_at,profiles(full_name,company,email),invoice_lines(id,description,quantity,unit_price,discount_amount,tax_amount,amount),payments(id,method,amount,paid_on,note,created_by)").eq("id", id);
  if (profile.role === "customer") invoiceQuery = invoiceQuery.eq("customer_id", profile.id);
  const [{ data: invoice, error }, { data: balance, error: balanceError }] = await Promise.all([
    invoiceQuery.maybeSingle(),
    supabase.from("invoice_balances").select("invoice_id,total,paid,balance").eq("invoice_id", id).maybeSingle(),
  ]);
  if (error || balanceError) return fail("INTERNAL", "Could not load invoice details.", 500);
  if (!invoice) return fail("NOT_FOUND", "Invoice not found.", 404);
  return ok({ ...invoice, balance: balance?.balance ?? invoice.total, paid: balance?.paid ?? 0 });
});
