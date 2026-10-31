import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatINR } from "@/lib/format";
import { statusBadgeClass } from "@/lib/status";
import { BillingControls } from "@/components/billing-controls";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function InvoicesPage({ searchParams }: Props) {
  await requireRole("admin", "staff");
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const page = Math.max(1, Number(value("page")) || 1);
  const pageSize = 25;
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const supabase = await createClient();
  let query = supabase.from("invoices").select("id,number,subscription_id,customer_id,status,issue_date,due_date,total,profiles(full_name,email)", { count: page === 1 ? "exact" : "estimated" });
  if (value("status")) query = query.eq("status", value("status"));
  if (value("customer")) query = query.eq("customer_id", value("customer"));
  if (value("from")) query = query.gte("issue_date", value("from"));
  if (value("to")) query = query.lte("issue_date", value("to"));
  if (value("overdue") === "true") query = query.eq("status", "confirmed").lt("due_date", today);
  if (value("q")) query = query.ilike("number", `%${value("q").replace(/[%_,()]/g, "")}%`);
  const { data, error, count } = await query.order("issue_date", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  const ids = (data ?? []).map((invoice) => invoice.id);
  const { data: balances, error: balanceError } = ids.length ? await supabase.from("invoice_balances").select("invoice_id,paid,balance").in("invoice_id", ids) : { data: [], error: null };
  const balanceMap = new Map((balances ?? []).map((row) => [row.invoice_id, row]));
  const filters = new URLSearchParams();
  for (const key of ["status", "overdue", "from", "to", "customer", "q"]) if (value(key)) filters.set(key, value(key));
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Invoices</h1><p className="mt-1 text-sm text-slate-600">Generate, confirm, and follow invoice balances.</p></div><BillingControls /></div>
    {(error || balanceError) && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">Invoices could not be loaded.</p>}
    <form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-7"><input name="q" defaultValue={value("q")} placeholder="Invoice number" className="min-h-11 rounded-md border px-3" /><select name="status" defaultValue={value("status")} className="min-h-11 rounded-md border px-3"><option value="">All statuses</option>{["draft", "confirmed", "paid", "cancelled"].map((status) => <option key={status}>{status}</option>)}</select><label className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" name="overdue" value="true" defaultChecked={value("overdue") === "true"} />Overdue</label><input type="date" name="from" aria-label="Issue date from" defaultValue={value("from")} className="min-h-11 rounded-md border px-3" /><input type="date" name="to" aria-label="Issue date to" defaultValue={value("to")} className="min-h-11 rounded-md border px-3" /><input name="customer" defaultValue={value("customer")} placeholder="Customer ID" className="min-h-11 rounded-md border px-3" /><button className="min-h-11 rounded-md border px-4">Filter</button></form>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[860px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Balance</th></tr></thead><tbody>{(data ?? []).map((invoice) => { const profile = Array.isArray(invoice.profiles) ? invoice.profiles[0] : invoice.profiles; const balance = balanceMap.get(invoice.id); const due = Number(balance?.balance ?? invoice.total); const paid = Number(balance?.paid ?? 0); const derived = invoice.status === "confirmed" && invoice.due_date && invoice.due_date < today && due > 0 ? "overdue" : invoice.status === "paid" ? "paid" : invoice.status === "confirmed" && paid > 0 ? "partially paid" : invoice.status === "confirmed" ? "outstanding" : invoice.status; const badgeKey = derived === "partially paid" || derived === "outstanding" ? "confirmed" : derived as keyof typeof statusBadgeClass; return <tr key={invoice.id} className="border-t"><td className="px-4 py-3"><Link href={`/invoices/${invoice.id}`} className="font-medium text-indigo-700">{invoice.number}</Link></td><td className="px-4 py-3">{profile?.full_name ?? profile?.email ?? "—"}</td><td className="px-4 py-3">{formatDate(invoice.issue_date)}</td><td className="px-4 py-3">{formatDate(invoice.due_date)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs capitalize ${statusBadgeClass[badgeKey]}`}>{derived}</span></td><td className="px-4 py-3 text-right">{formatINR(invoice.total)}</td><td className="px-4 py-3 text-right">{formatINR(due)}</td></tr>; })}</tbody></table>{!data?.length && !error && !balanceError && <p className="p-6 text-sm text-slate-500">No invoices match these filters.</p>}</div>
    <div className="flex items-center justify-between text-sm"><span>Page {page} of {pages} · {count ?? 0} invoices</span><div className="flex gap-2">{page > 1 && <Link className="rounded-md border px-3 py-2" href={`?${filters.toString()}&page=${page - 1}`}>Previous</Link>}{page < pages && <Link className="rounded-md border px-3 py-2" href={`?${filters.toString()}&page=${page + 1}`}>Next</Link>}</div></div>
  </div>;
}
