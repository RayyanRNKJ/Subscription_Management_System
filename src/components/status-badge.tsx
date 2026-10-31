import { statusBadgeClass } from "@/lib/status";

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase() as keyof typeof statusBadgeClass;
  const styles = statusBadgeClass[key] ?? "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${styles}`}>{status.replaceAll("_", " ")}</span>;
}
