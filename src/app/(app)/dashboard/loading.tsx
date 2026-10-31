export default function DashboardLoading() {
  return <div className="animate-pulse space-y-6" aria-label="Loading dashboard">
    <div className="h-10 w-64 rounded bg-slate-200" />
    <div className="h-20 rounded-xl bg-slate-200" />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-32 rounded-xl bg-slate-200" />)}</div>
    <div className="grid gap-4 xl:grid-cols-2"><div className="h-80 rounded-xl bg-slate-200" /><div className="h-80 rounded-xl bg-slate-200" /></div>
    <div className="h-72 rounded-xl bg-slate-200" />
  </div>;
}
