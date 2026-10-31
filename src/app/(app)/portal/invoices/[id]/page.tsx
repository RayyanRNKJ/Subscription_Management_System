import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatINR } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { StatusBadge } from "@/components/status-badge";

export default async function PortalInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole("customer");
  const { id } = await params;
  const supabase = await createClient();
  const { data: invoice, error } = await supabase.from("invoices")
    .select("id,number,status,period_start,period_end,issue_date,due_date,subtotal,discount_total,tax_total,total,profiles(full_name,email)")
    .eq("id", id)
    .eq("customer_id", profile.id)
    .maybeSingle();
  if (error || !invoice) notFound();

  const [{ data: lines, error: linesError }, { data: payments, error: paymentsError }, { data: balanceRow, error: balanceError }] = await Promise.all([
    supabase.from("invoice_lines").select("id,description,quantity,unit_price,discount_amount,tax_amount,amount").eq("invoice_id", invoice.id).order("id"),
    supabase.from("payments").select("id,method,amount,paid_on,note").eq("invoice_id", invoice.id).order("paid_on", { ascending: false }),
    supabase.from("invoice_balances").select("balance,paid").eq("invoice_id", invoice.id).maybeSingle(),
  ]);
  const customer = Array.isArray(invoice.profiles) ? invoice.profiles[0] : invoice.profiles;
  const hasError = linesError || paymentsError || balanceError;

  return <div className="space-y-6">
    <RealtimeRefresh tables={["invoices", "payments", "subscriptions"]} />
    <PageHeader title={invoice.number} description={`Billing period ${formatDate(invoice.period_start)} – ${formatDate(invoice.period_end)}`} action={<div className="flex flex-wrap gap-2"><Link className="min-h-11 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50" href="/portal/invoices">Back to invoices</Link><Link className="min-h-11 rounded-md bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700" href={`/invoices/${invoice.id}/print`}>Print</Link></div>} />
    {hasError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Some invoice details could not be loaded.</p>}
    <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
      <Detail label="Status"><StatusBadge status={invoice.status} /></Detail>
      <Detail label="Issue date">{formatDate(invoice.issue_date)}</Detail>
      <Detail label="Due date">{formatDate(invoice.due_date)}</Detail>
      <Detail label="Customer">{customer?.full_name || customer?.email || "—"}</Detail>
    </section>
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Invoice lines</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Description</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Unit price</th><th className="px-4 py-3 text-right">Discount</th><th className="px-4 py-3 text-right">Tax</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{(lines ?? []).map((line) => <tr key={line.id} className="border-t"><td className="px-4 py-3">{line.description}</td><td className="px-4 py-3 text-right">{line.quantity}</td><td className="px-4 py-3 text-right">{formatINR(line.unit_price)}</td><td className="px-4 py-3 text-right">{formatINR(line.discount_amount)}</td><td className="px-4 py-3 text-right">{formatINR(line.tax_amount)}</td><td className="px-4 py-3 text-right font-medium">{formatINR(line.amount)}</td></tr>)}</tbody></table>{!lines?.length && <p className="p-5 text-sm text-slate-500">No invoice lines available.</p>}</div>
    </section>
    <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3"><h2 className="text-lg font-semibold">Payments</h2><div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full min-w-[440px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Note</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{(payments ?? []).map((payment) => <tr key={payment.id} className="border-t"><td className="px-4 py-3">{formatDate(payment.paid_on)}</td><td className="px-4 py-3 capitalize">{payment.method?.replaceAll("_", " ")}</td><td className="px-4 py-3">{payment.note || "—"}</td><td className="px-4 py-3 text-right font-medium">{formatINR(payment.amount)}</td></tr>)}</tbody></table>{!payments?.length && <p className="p-5 text-sm text-slate-500">No payments recorded.</p>}</div></div>
      <aside className="h-fit space-y-3 rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Summary</h2><Amount label="Subtotal" value={invoice.subtotal} /><Amount label="Discount" value={invoice.discount_total} /><Amount label="Tax" value={invoice.tax_total} /><div className="border-t pt-3"><Amount label="Invoice total" value={invoice.total} strong /></div><Amount label="Paid" value={balanceRow?.paid} /><div className="border-t pt-3"><Amount label="Balance due" value={balanceRow?.balance ?? invoice.total} strong /></div></aside>
    </section>
  </div>;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p><div className="mt-2 text-sm font-medium">{children}</div></div>; }
function Amount({ label, value, strong = false }: { label: string; value: number | string | null | undefined; strong?: boolean }) { return <div className={`flex justify-between gap-4 text-sm ${strong ? "font-semibold text-slate-950" : "text-slate-600"}`}><span>{label}</span><span>{formatINR(value)}</span></div>; }
