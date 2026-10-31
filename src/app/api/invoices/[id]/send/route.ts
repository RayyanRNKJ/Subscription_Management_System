import { createClient } from "@/lib/supabase/server";
import { fail, ok, withRole } from "@/lib/api";

export const POST = withRole(["admin", "staff"], async (_request, _profile, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const supabase = await createClient();
  const { data: invoice, error } = await supabase.from("invoices").select("id,status").eq("id", id).maybeSingle();
  if (error) return fail("INTERNAL", "Could not load invoice.", 500);
  if (!invoice) return fail("NOT_FOUND", "Invoice not found.", 404);
  if (!["confirmed", "paid"].includes(invoice.status)) return fail("INVALID_TRANSITION", "Only confirmed or paid invoices can be marked sent.", 409);
  const { data, error: updateError } = await supabase.from("invoices").update({ sent_at: new Date().toISOString() }).eq("id", id).in("status", ["confirmed", "paid"]).select("id,status,sent_at").maybeSingle();
  if (updateError) return fail("INTERNAL", "Could not mark invoice as sent.", 500);
  return data ? ok(data) : fail("INVALID_TRANSITION", "Invoice status changed. Refresh and try again.", 409);
});
