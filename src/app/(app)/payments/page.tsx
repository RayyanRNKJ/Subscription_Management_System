import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatINR } from "@/lib/format";
import { PaymentListActions } from "@/components/payment-list-actions";
import { paymentMethods } from "@/lib/validation/payment";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaymentsPage({ searchParams }: Props) {
  await requireRole("admin", "staff");
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const page = Math.max(1, Number(value("page")) || 1);
  const pageSize = 25;
  const supabase = await createClient();
  let query = supabase.from("payments").select("id,invoice_id,method,amount,paid_on,note,invoices(id,number,status,due_date,customer_id,profiles(full_name,email))", { count: page === 1 ? "exact" : "estimated" });
  if (value("invoice")) query = query.eq("invoice_id", value("invoice"));
  if (value("method")) query = query.eq("method", value("method"));
  if (value("from")) query = query.gte("paid_on", value("from"));
  if (value("to")) query = query.lte("paid_on", value("to"));
  const { data, error, count } = await query.order("paid_on", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  const filters = new URLSearchParams();
  for (const key of ["invoice", "method", "from", "to"]) if (value(key)) filters.set(key, value(key));
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Payments</h1><p className="mt-1 text-sm text-slate-600">Track manually recorded customer payments.</p></div><PaymentListActions /></div>
    {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">Payments could not be loaded.</p>}
    <form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"><input name="invoice" defaultValue={value("invoice")} placeholder="Invoice UUID" className="min-h-11 rounded-md border px-3" /><select name="method" defaultValue={value("method")} className="min-h-11 rounded-md border px-3"><option value="">All methods</option>{paymentMethods.map((method) => <option key={method} value={method}>{method.replaceAll("_", " ")}</option>)}</select><input type="date" name="from" aria-label="Paid from" defaultValue={value("from")} className="min-h-11 rounded-md border px-3" /><input type="date" name="to" aria-label="Paid to" defaultValue={value("to")} className="min-h-11 rounded-md border px-3" /><button className="min-h-11 rounded-md border px-4">Filter</button></form>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Payment date</th><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Note</th><th className="px-4 py-3 text-right">Amount</th></tr></thead><tbody>{(data ?? []).map((payment) => { const invoice = Array.isArray(payment.invoices) ? payment.invoices[0] : payment.invoices; const profile = invoice && (Array.isArray(invoice.profiles) ? invoice.profiles[0] : invoice.profiles); return <tr key={payment.id} className="border-t"><td className="px-4 py-3">{formatDate(payment.paid_on)}</td><td className="px-4 py-3">{invoice && <Link href={`/invoices/${invoice.id}`} className="text-indigo-700">{invoice.number}</Link>}</td><td className="px-4 py-3">{profile?.full_name ?? profile?.email ?? "—"}</td><td className="px-4 py-3 capitalize">{payment.method.replaceAll("_", " ")}</td><td className="px-4 py-3">{payment.note ?? "—"}</td><td className="px-4 py-3 text-right">{formatINR(payment.amount)}</td></tr>; })}</tbody></table>{!data?.length && !error && <p className="p-6 text-sm text-slate-500">No payments match these filters.</p>}</div>
    <div className="flex items-center justify-between text-sm"><span>Page {page} of {pages} · {count ?? 0} payments</span><div className="flex gap-2">{page > 1 && <Link className="rounded-md border px-3 py-2" href={`?${filters.toString()}&page=${page - 1}`}>Previous</Link>}{page < pages && <Link className="rounded-md border px-3 py-2" href={`?${filters.toString()}&page=${page + 1}`}>Next</Link>}</div></div>
  </div>;
}
