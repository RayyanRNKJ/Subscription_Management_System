import { requireRole } from "@/lib/auth";

// Everything under /admin is admin-only.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin");
  return <>{children}</>;
}
