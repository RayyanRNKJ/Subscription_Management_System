import { requireRole } from "@/lib/auth";

export default async function PortalPage() {
  await requireRole("customer");
  return (
    <div>
      <h1 className="text-2xl font-semibold">My subscriptions</h1>
      <p className="mt-2 text-neutral-600">TODO: list this customer&apos;s subscriptions (RLS already scopes the rows).</p>
    </div>
  );
}
