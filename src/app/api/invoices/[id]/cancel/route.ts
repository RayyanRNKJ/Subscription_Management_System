import { createClient } from "@/lib/supabase/server";
import { fail, ok, withRole } from "@/lib/api";

export const POST = withRole(["admin", "staff"], async (_request, _profile, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const supabase = await createClient();
  const { data: invoice, error } = await supabase.from("invoices").select("id,status").eq("id", id).maybeSingle();
  if (error) return fail("INTERNAL", "Could not load invoice.", 500);
  if (!invoice) return fail("NOT_FOUND", "Invoice not found.", 404);
  if (!["draft", "confirmed"].includes(invoice.status)) return fail("INVALID_TRANSITION", "Paid or cancelled invoices cannot be cancelled.", 409);
  if (invoice.status === "confirmed") {
    const { count, error: paymentError } = await supabase.from("payments").select("id", { count: "exact", head: true }).eq("invoice_id", id);
    if (paymentError) return fail("INTERNAL", "Could not verify invoice payments.", 500);
    if ((count ?? 0) > 0) return fail("INVALID_TRANSITION", "An invoice with payments cannot be cancelled.", 409);
  }
  const { data, error: updateError } = await supabase.from("invoices").update({ status: "cancelled" }).eq("id", id).eq("status", invoice.status).select("id,status").maybeSingle();
  if (updateError) return fail("INTERNAL", "Could not cancel invoice.", 500);
  return data ? ok(data) : fail("INVALID_TRANSITION", "Invoice status changed. Refresh and try again.", 409);
});
