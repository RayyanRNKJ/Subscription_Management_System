import { requireRole } from "@/lib/auth";

export default async function DashboardPage() {
  await requireRole("admin", "staff");
  return (
    <div>
      <h1 className="text-2xl font-semibold">Finance dashboard</h1>
      <p className="mt-2 text-neutral-600">TODO: active subscriptions, revenue, outstanding, overdue.</p>
    </div>
  );
}
