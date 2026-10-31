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
function todayInIndia() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default async function PortalInvoicesPage({ searchParams }: Props) {
  const profile = await requireRole("customer");
  const params = await searchParams;
  const page = Math.max(1, Math.floor(Number(typeof params.page === "string" ? params.page : "1") || 1));
  const pageSize = 25;
  const supabase = await createClient();
  const { data: invoices, error, count } = await supabase.from("invoices")
    .select("id,number,period_start,period_end,total,status,due_date", { count: page === 1 ? "exact" : "estimated" })
    .eq("customer_id", profile.id)
    .order("issue_date", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  const invoiceIds = (invoices ?? []).map((invoice) => invoice.id);
  const { data: balances, error: balanceError } = invoiceIds.length
    ? await supabase.from("invoice_balances").select("invoice_id,balance").in("invoice_id", invoiceIds)
    : { data: [], error: null };
  const balanceByInvoice = new Map((balances ?? []).map((row) => [row.invoice_id, row.balance]));
  const queryError = error || balanceError;
  const today = todayInIndia();
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = (invoices ?? []).map((invoice) => {
    const balance = balanceByInvoice.get(invoice.id) ?? invoice.total;
    const overdue = invoice.status === "confirmed" && Boolean(invoice.due_date && invoice.due_date < today && Number(balance) > 0);
    return [
      <td className="px-4 py-3" key="number"><Link className="font-medium text-indigo-700 hover:underline" href={`/portal/invoices/${invoice.id}`}>{invoice.number}</Link></td>,
      <td className="px-4 py-3" key="period">{formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}</td>,
      <td className="px-4 py-3" key="total"><Money amount={invoice.total} /></td>,
      <td className="px-4 py-3" key="status"><StatusBadge status={overdue ? "overdue" : invoice.status} /></td>,
      <td className="px-4 py-3" key="balance"><Money amount={balance} /></td>,
      <td className="px-4 py-3" key="due">{formatDate(invoice.due_date)}</td>,
    ];
  });

  return <div className="space-y-6">
    <RealtimeRefresh tables={["invoices", "payments", "subscriptions"]} />
    <PageHeader title="My invoices" description="Your invoice history, balances, and due dates." action={<Link className="min-h-11 rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50" href="/portal">My subscriptions</Link>} />
    {queryError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">We couldn’t load your invoices. Please refresh in a moment.</p>}
    <DataTable headers={["Invoice", "Period", "Total", "Status", "Balance", "Due date"]} minWidth="min-w-[850px]" rows={rows} emptyMessage={queryError ? "Invoices are temporarily unavailable." : "You don’t have any invoices yet."} />
    <Pagination page={page} totalPages={totalPages} total={total} itemLabel="invoices" hrefForPage={(next) => `/portal/invoices?page=${next}`} />
  </div>;
}
