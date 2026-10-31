export default function PortalLoading() {
  return <div className="animate-pulse space-y-6" aria-label="Loading portal">
    <div className="h-10 w-64 rounded bg-slate-200" />
    <div className="h-16 rounded-xl bg-slate-200" />
    <div className="h-72 rounded-xl bg-slate-200" />
  </div>;
}
