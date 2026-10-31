import { formatINR } from "@/lib/format";

type MonthlyRevenue = { month: string; revenue: number | string };
type InvoiceCount = { status: string; count: number };

const monthLabel = (value: string) => {
  const date = new Date(`${value}-01T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(date);
};

export function RevenueChart({ data }: { data: MonthlyRevenue[] }) {
  const rows = [...data].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);
  const max = Math.max(...rows.map((row) => Number(row.revenue)), 1);
  const points = rows.map((row, index) => {
    const x = rows.length < 2 ? 320 : 48 + index * (544 / (rows.length - 1));
    const y = 190 - Number(row.revenue) / max * 150;
    return { x, y, row };
  });
  return <div>
    <svg viewBox="0 0 640 250" className="h-64 w-full overflow-visible" role="img" aria-label="Revenue collected over six months">
      {[40, 90, 140, 190].map((y) => <line key={y} x1="48" x2="592" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />)}
      <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {points.map(({ x, y, row }) => <g key={row.month}><circle cx={x} cy={y} r="5" fill="#4f46e5" stroke="white" strokeWidth="2" /><text x={x} y="222" textAnchor="middle" className="fill-slate-500" fontSize="12">{monthLabel(row.month)}</text></g>)}
      <text x="48" y="20" className="fill-slate-400" fontSize="11">{formatINR(max)}</text>
      <text x="48" y="203" className="fill-slate-400" fontSize="11">₹0</text>
    </svg>
    <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 sm:grid-cols-3">{rows.map((row) => <div key={row.month} className="flex justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5"><span>{monthLabel(row.month)}</span><span className="font-medium text-slate-700">{formatINR(row.revenue)}</span></div>)}</div>
  </div>;
}

const statusColor: Record<string, string> = { draft: "bg-slate-400", confirmed: "bg-indigo-500", paid: "bg-emerald-500", cancelled: "bg-rose-400" };

export function InvoiceStatusChart({ data }: { data: InvoiceCount[] }) {
  const total = data.reduce((sum, row) => sum + Number(row.count), 0);
  return <div className="space-y-5">
    <div className="flex h-4 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`Invoice status proportions across ${total} invoices`}>
      {data.map((row) => <div key={row.status} title={`${row.status}: ${row.count}`} className={statusColor[row.status] ?? "bg-slate-400"} style={{ width: `${total ? Number(row.count) / total * 100 : 0}%` }} />)}
    </div>
    <div className="space-y-3">{data.map((row) => <div className="flex items-center justify-between gap-4 text-sm" key={row.status}><span className="flex items-center gap-2 capitalize text-slate-600"><i className={`size-2.5 rounded-full ${statusColor[row.status] ?? "bg-slate-400"}`} />{row.status}</span><span className="font-medium tabular-nums">{Number(row.count).toLocaleString("en-IN")}</span></div>)}</div>
    <div className="border-t pt-3 text-sm font-medium text-slate-800">{total.toLocaleString("en-IN")} total invoices</div>
  </div>;
}
