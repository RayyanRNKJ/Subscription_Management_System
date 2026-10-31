import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { DataTable } from "@/components/data-table";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/pagination";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { StatusBadge } from "@/components/status-badge";
import { InvoiceStatusChart, RevenueChart } from "@/components/dashboard-charts";

type SearchParams = Record<string, string | string[] | undefined>;
type Summary = {
  active_subscriptions: number;
  revenue_collected: number | string;
  outstanding: number | string;
  overdue_count: number;
  overdue_amount: number | string;
  mrr: number | string;
  revenue_by_month: { month: string; revenue: number | string }[];
  invoice_status_counts: { status: string; count: number }[];
};
type OverdueResult = { rows: OverdueInvoice[]; total: number };
type OverdueInvoice = {
  id: string;
  number: string;
  customer_name: string | null;
  customer_email: string | null;
  due_date: string;
  days_overdue: number;
  balance: number | string;
};

function isoDate(value: string | undefined, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function hrefForPage(params: URLSearchParams, page: number) {
  const copy = new URLSearchParams(params);
  copy.set("page", String(page));
  return `/dashboard?${copy.toString()}`;
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole("admin", "staff");
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] as string : "";
  const today = todayInIndia();
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = isoDate(value("from") || undefined, monthStart);
  const to = isoDate(value("to") || undefined, today);
  const plan = value("plan");
  const customer = value("customer");
  const page = Math.max(1, Math.floor(Number(value("page")) || 1));
  const pageSize = 25;
  const supabase = await createClient();

  const [{ data: summaryData, error: summaryError }, { data: overdueData, error: overdueError }, { data: plansData }, { data: customersData }] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_from: from, p_to: to, p_plan: plan || null, p_customer: customer || null }),
    supabase.rpc("dashboard_overdue", { p_page: page, p_page_size: pageSize, p_plan: plan || null, p_customer: customer || null }),
    supabase.from("plans").select("id,name").order("name").limit(100),
    supabase.from("profiles").select("id,full_name,email").eq("role", "customer").order("full_name").limit(250),
  ]);

  const summary = summaryData as Summary | null;
  const overdue = overdueData as OverdueResult | null;
  const queryError = summaryError || overdueError;
  const total = Number(overdue?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const filters = new URLSearchParams();
  for (const [key, item] of [["from", from], ["to", to], ["plan", plan], ["customer", customer]] as const) if (item) filters.set(key, item);

  const overdueRows = (overdue?.rows ?? []).map((invoice) => [
    <td className="px-4 py-3" key="invoice"><Link href={`/invoices/${invoice.id}`} className="font-medium text-indigo-700 hover:underline">{invoice.number}</Link></td>,
    <td className="px-4 py-3" key="customer">{invoice.customer_name || invoice.customer_email || "—"}</td>,
    <td className="px-4 py-3" key="due">{formatDate(invoice.due_date)}</td>,
    <td className="px-4 py-3" key="days"><StatusBadge status="overdue" /> <span className="ml-1 text-slate-600">{invoice.days_overdue} days</span></td>,
    <td className="px-4 py-3 text-right font-medium" key="balance"><Money amount={invoice.balance} /></td>,
  ].map((cell) => cell));

  return (
    <div className="space-y-6">
      <RealtimeRefresh tables={["invoices", "payments", "subscriptions"]} />
      <PageHeader title="Finance dashboard" description="A live view of recurring revenue, collections, and invoices to follow up." />

      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5" action="/dashboard">
        <label className="space-y-1 text-xs font-medium text-slate-600">From<input aria-label="From date" type="date" name="from" defaultValue={from} className="block min-h-11 w-full rounded-md border px-3 text-sm text-slate-900" /></label>
        <label className="space-y-1 text-xs font-medium text-slate-600">To<input aria-label="To date" type="date" name="to" defaultValue={to} className="block min-h-11 w-full rounded-md border px-3 text-sm text-slate-900" /></label>
        <label className="space-y-1 text-xs font-medium text-slate-600">Plan<select name="plan" defaultValue={plan} className="block min-h-11 w-full rounded-md border px-3 text-sm text-slate-900"><option value="">All plans</option>{(plansData ?? []).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label className="space-y-1 text-xs font-medium text-slate-600">Customer<select name="customer" defaultValue={customer} className="block min-h-11 w-full rounded-md border px-3 text-sm text-slate-900"><option value="">All customers</option>{(customersData ?? []).map((item) => <option value={item.id} key={item.id}>{item.full_name || item.email}</option>)}</select></label>
        <button className="mt-auto min-h-11 rounded-md bg-indigo-600 px-4 font-medium text-white hover:bg-indigo-700">Apply filters</button>
      </form>

      {queryError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Dashboard data could not be loaded. Confirm that the dashboard SQL migration has been applied, then refresh.</p>}

      <section aria-label="Finance key performance indicators" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi title="Active subscriptions" value={summary?.active_subscriptions?.toLocaleString("en-IN") ?? "—"} detail="Currently active" />
        <Kpi title="Revenue collected" value={<Money amount={summary?.revenue_collected} />} detail={`${formatDate(from)} – ${formatDate(to)}`} />
        <Kpi title="Outstanding" value={<Money amount={summary?.outstanding} />} detail="Confirmed invoices" />
        <Kpi title="Overdue invoices" value={summary?.overdue_count?.toLocaleString("en-IN") ?? "—"} detail={<><Money amount={summary?.overdue_amount} /> overdue</>} />
        <Kpi title="Monthly recurring revenue" value={<Money amount={summary?.mrr} />} detail="Normalized to monthly" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4"><h2 className="font-semibold">Revenue by month</h2><p className="mt-1 text-sm text-slate-500">Payments received over the last six months.</p></div>
          {summary?.revenue_by_month?.length ? <RevenueChart data={summary.revenue_by_month} /> : <p className="py-12 text-center text-sm text-slate-500">No payment history for this period.</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4"><h2 className="font-semibold">Invoice status</h2><p className="mt-1 text-sm text-slate-500">Invoices issued during the selected range.</p></div>
          {summary?.invoice_status_counts?.length ? <InvoiceStatusChart data={summary.invoice_status_counts} /> : <p className="py-12 text-center text-sm text-slate-500">No invoices for this period.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold">Overdue invoices</h2><p className="mt-1 text-sm text-slate-600">Confirmed invoices with a remaining balance, oldest due date first.</p></div>
        <DataTable headers={["Invoice", "Customer", "Due date", "Days overdue", <span className="block text-right" key="balance">Balance</span>]}
          minWidth="min-w-[780px]" rows={overdueRows} emptyMessage={queryError ? "Overdue invoices are unavailable." : "No overdue invoices. You’re all caught up."} />
        <Pagination page={page} totalPages={totalPages} total={total} itemLabel="invoices" hrefForPage={(next) => hrefForPage(filters, next)} />
      </section>
    </div>
  );
}

function Kpi({ title, value, detail }: { title: string; value: React.ReactNode; detail: React.ReactNode }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-950/[0.02]"><p className="text-sm font-medium text-slate-600">{title}</p><div className="mt-3 text-2xl font-semibold tracking-tight">{value}</div><p className="mt-2 text-xs text-slate-500">{detail}</p></article>;
}
