import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatINR } from "@/lib/format";
import { statusBadgeClass } from "@/lib/status";
import type { InvoiceStatus } from "@/lib/status";
import { InvoiceActions } from "@/components/invoice-actions";

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("admin", "staff");
  const { id } = await params;
  const supabase = await createClient();
  const [{ data: invoice, error }, { data: balance, error: balanceError }] = await Promise.all([
    supabase.from("invoices").select("id,number,subscription_id,customer_id,status,period_start,period_end,issue_date,due_date,subtotal,discount_total,tax_total,total,sent_at,profiles(full_name,company,email),invoice_lines(id,description,quantity,unit_price,discount_amount,tax_amount,amount),payments(id,method,amount,paid_on,note,created_by)").eq("id", id).maybeSingle(),
    supabase.from("invoice_balances").select("paid,balance").eq("invoice_id", id).maybeSingle(),
  ]);
  if (error || balanceError || !invoice) notFound();
  const profile = Array.isArray(invoice.profiles) ? invoice.profiles[0] : invoice.profiles;
  const balanceValue = Number(balance?.balance ?? invoice.total);
  const paid = Number(balance?.paid ?? 0);
  return <div className="space-y-6">
    <div><Link href="/invoices" className="text-sm text-indigo-700">← Invoices</Link><div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">{invoice.number}</h1><p className="mt-1 text-sm text-slate-600">{profile?.full_name ?? profile?.company ?? profile?.email}</p></div><span className={`rounded-full px-3 py-1.5 text-sm capitalize ${statusBadgeClass[invoice.status as InvoiceStatus]}`}>{invoice.status}</span></div></div>
    <section className="space-y-3 rounded-xl border bg-white p-5"><h2 className="font-semibold">Invoice actions</h2><InvoiceActions invoice={{ id: invoice.id, status: invoice.status, paymentsCount: invoice.payments.length }} /></section>
    <section className="grid gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-slate-500">Issue date</p><p className="mt-1 font-medium">{formatDate(invoice.issue_date)}</p></div><div><p className="text-xs text-slate-500">Due date</p><p className="mt-1 font-medium">{formatDate(invoice.due_date)}</p></div><div><p className="text-xs text-slate-500">Billing period</p><p className="mt-1 font-medium">{formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}</p></div><div><p className="text-xs text-slate-500">Sent</p><p className="mt-1 font-medium">{formatDate(invoice.sent_at)}</p></div></section>
    <section className="overflow-hidden rounded-xl border bg-white"><div className="p-5"><h2 className="font-semibold">Invoice lines</h2></div><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3">Description</th><th className="px-5 py-3">Qty</th><th className="px-5 py-3">Unit price</th><th className="px-5 py-3">Discount</th><th className="px-5 py-3">Tax</th><th className="px-5 py-3 text-right">Net</th></tr></thead><tbody>{invoice.invoice_lines.map((line) => <tr key={line.id} className="border-t"><td className="px-5 py-3">{line.description}</td><td className="px-5 py-3">{line.quantity}</td><td className="px-5 py-3">{formatINR(line.unit_price)}</td><td className="px-5 py-3">{formatINR(line.discount_amount)}</td><td className="px-5 py-3">{formatINR(line.tax_amount)}</td><td className="px-5 py-3 text-right">{formatINR(line.amount)}</td></tr>)}</tbody></table><div className="ml-auto max-w-sm space-y-2 p-5 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{formatINR(invoice.subtotal)}</span></p><p className="flex justify-between"><span>Discount</span><span>−{formatINR(invoice.discount_total)}</span></p><p className="flex justify-between"><span>Tax</span><span>{formatINR(invoice.tax_total)}</span></p><p className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span>{formatINR(invoice.total)}</span></p><p className="flex justify-between"><span>Paid</span><span>{formatINR(paid)}</span></p><p className="flex justify-between font-semibold"><span>Balance</span><span>{formatINR(balanceValue)}</span></p></div></section>
    <section className="overflow-hidden rounded-xl border bg-white"><div className="p-5"><h2 className="font-semibold">Payments</h2></div><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Method</th><th className="px-5 py-3">Note</th><th className="px-5 py-3 text-right">Amount</th></tr></thead><tbody>{invoice.payments.map((payment) => <tr key={payment.id} className="border-t"><td className="px-5 py-3">{formatDate(payment.paid_on)}</td><td className="px-5 py-3 capitalize">{payment.method.replaceAll("_", " ")}</td><td className="px-5 py-3">{payment.note ?? "—"}</td><td className="px-5 py-3 text-right">{formatINR(payment.amount)}</td></tr>)}</tbody></table>{!invoice.payments.length && <p className="px-5 pb-5 text-sm text-slate-500">No payments recorded.</p>}</section>
  </div>;
}
