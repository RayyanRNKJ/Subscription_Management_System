import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatINR } from "@/lib/format";
import { statusBadgeClass } from "@/lib/status";
import type { SubscriptionStatus } from "@/lib/status";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SubscriptionsPage({ searchParams }: Props) {
  await requireRole("admin", "staff");
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const page = Math.max(1, Number(value("page")) || 1);
  const pageSize = 25;
  const supabase = await createClient();
  let query = supabase.from("subscriptions").select("id,number,status,paused,start_date,next_billing_date,customer_id,plan_id,profiles(full_name,email),plans(name,price),subscription_lines(quantity,unit_price)", { count: page === 1 ? "exact" : "estimated" });
  if (value("status")) query = query.eq("status", value("status"));
  if (value("plan")) query = query.eq("plan_id", value("plan"));
  if (value("customer")) query = query.eq("customer_id", value("customer"));
  if (value("q")) query = query.ilike("number", `%${value("q").replace(/[%_,()]/g, "")}%`);
  const [{ data, count }, { data: plans }] = await Promise.all([
    query.order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1),
    supabase.from("plans").select("id,name").order("name"),
  ]);
  const filters = new URLSearchParams();
  for (const key of ["status", "plan", "customer", "q"]) if (value(key)) filters.set(key, value(key));
  const pages = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Subscriptions</h1><p className="mt-1 text-sm text-slate-600">Manage customer subscriptions and their billing status.</p></div><Link href="/subscriptions/new" className="min-h-11 rounded-md bg-indigo-600 px-4 py-3 text-sm font-medium text-white">New subscription</Link></div>
    <form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"><input name="q" defaultValue={value("q")} placeholder="Subscription number" className="min-h-11 rounded-md border px-3" /><select name="status" defaultValue={value("status")} className="min-h-11 rounded-md border px-3"><option value="">All statuses</option>{["draft", "quotation", "confirmed", "active", "closed"].map((status) => <option key={status}>{status}</option>)}</select><select name="plan" defaultValue={value("plan")} className="min-h-11 rounded-md border px-3"><option value="">All plans</option>{(plans ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input name="customer" defaultValue={value("customer")} placeholder="Customer ID" className="min-h-11 rounded-md border px-3" /><button className="min-h-11 rounded-md border px-4">Filter</button></form>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Subscription</th><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Next billing</th><th className="px-4 py-3 text-right">Recurring total</th></tr></thead><tbody>{(data ?? []).map((sub) => { const customer = Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles; const plan = Array.isArray(sub.plans) ? sub.plans[0] : sub.plans; const total = (sub.subscription_lines ?? []).reduce((sum, line) => sum + Number(line.quantity) * Number(line.unit_price), 0) + Number(plan?.price ?? 0); const status = sub.paused ? "paused" : sub.status as SubscriptionStatus; return <tr key={sub.id} className="border-t"><td className="px-4 py-3"><Link href={`/subscriptions/${sub.id}`} className="font-medium text-indigo-700">{sub.number}</Link></td><td className="px-4 py-3">{customer?.full_name ?? customer?.email ?? "—"}</td><td className="px-4 py-3">{plan?.name ?? "—"}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs capitalize ${statusBadgeClass[status]}`}>{sub.paused ? "paused" : sub.status}</span></td><td className="px-4 py-3">{formatDate(sub.next_billing_date)}</td><td className="px-4 py-3 text-right">{formatINR(total)}</td></tr>; })}</tbody></table>{!data?.length && <p className="p-6 text-sm text-slate-500">No subscriptions match these filters.</p>}</div>
    <div className="flex items-center justify-between text-sm"><span>Page {page} of {pages} · {count ?? 0} subscriptions</span><div className="flex gap-2">{page > 1 && <Link className="rounded-md border px-3 py-2" href={`?${filters.toString()}&page=${page - 1}`}>Previous</Link>}{page < pages && <Link className="rounded-md border px-3 py-2" href={`?${filters.toString()}&page=${page + 1}`}>Next</Link>}</div></div>
  </div>;
}
