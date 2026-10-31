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

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
type SubscriptionTotal = { id: string; total: number | string };

function pageHref(page: number) { return `/portal?page=${page}`; }
function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function PortalPage({ searchParams }: Props) {
  const profile = await requireRole("customer");
  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(typeof params.page === "string" ? params.page : "1") || 1));
  const pageSize = 25;
  const supabase = await createClient();
  const today = todayInIndia();
  const [{ data: subscriptions, error, count }, { data: totalsData, error: totalsError }] = await Promise.all([
    supabase.from("subscriptions").select("id,number,status,paused,next_billing_date,plans(name,period)", { count: page === 1 ? "exact" : "estimated" })
      .eq("customer_id", profile.id).order("created_at", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1),
    supabase.rpc("dashboard_summary", { p_from: today, p_to: today, p_plan: null, p_customer: profile.id }),
  ]);
  const totalsPayload = totalsData as { subscription_totals?: SubscriptionTotal[] } | null;
  const totals = new Map((totalsPayload?.subscription_totals ?? []).map((item) => [item.id, item.total]));
  const queryError = error || totalsError || !Array.isArray(totalsPayload?.subscription_totals);
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = (subscriptions ?? []).map((subscription) => {
    const plan = Array.isArray(subscription.plans) ? subscription.plans[0] : subscription.plans;
    const status = subscription.paused ? "paused" : subscription.status;
    return [
      <td className="px-4 py-3" key="number"><span className="font-medium text-slate-900">{subscription.number}</span></td>,
      <td className="px-4 py-3" key="plan">{plan?.name ?? "—"}<span className="mt-0.5 block text-xs capitalize text-slate-500">{plan?.period ?? ""}</span></td>,
      <td className="px-4 py-3" key="status"><StatusBadge status={status} /></td>,
      <td className="px-4 py-3" key="next">{formatDate(subscription.next_billing_date)}</td>,
      <td className="px-4 py-3 text-right font-medium" key="total">{totals.has(subscription.id) ? <Money amount={totals.get(subscription.id)} /> : "—"}</td>,
    ];
  });

  return <div className="space-y-6">
    <RealtimeRefresh tables={["subscriptions", "invoices", "payments"]} />
    <PageHeader title="My subscriptions" description="Your plans, current status, and upcoming billing dates." action={<Link className="min-h-11 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50" href="/portal/invoices">View my invoices</Link>} />
    {queryError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">We couldn’t load all subscription details. Please refresh in a moment.</p>}
    <DataTable headers={["Subscription", "Plan", "Status", "Next billing date", <span className="block text-right" key="total">Recurring total</span>]}
      rows={rows} minWidth="min-w-[760px]" emptyMessage={queryError ? "Subscriptions are temporarily unavailable." : "You don’t have any subscriptions yet."} />
    <Pagination page={page} totalPages={totalPages} total={total} itemLabel="subscriptions" hrefForPage={pageHref} />
  </div>;
}
