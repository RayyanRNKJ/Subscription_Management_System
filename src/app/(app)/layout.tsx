import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getProfile } from "@/lib/auth";

// The authenticated shell reads request cookies. Stream it in a future pass; for
// now these protected routes are intentionally allowed to block on that session.
export const instant = false;

/** Shared authenticated layout; individual pages retain their existing role guards. */
export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return <AppShell profile={profile}>{children}</AppShell>;
}
