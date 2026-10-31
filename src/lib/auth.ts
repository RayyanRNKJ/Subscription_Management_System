import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Role = "admin" | "staff" | "customer";
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
};

export const homeFor = (role: Role) => (role === "customer" ? "/portal" : "/dashboard");

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", user.id)
    .single();
  return (data as Profile) ?? null;
}

// For pages/layouts: redirects instead of throwing.
export async function requireRole(...roles: Role[]) {
  const me = await getProfile();
  if (!me) redirect("/login");
  if (roles.length && !roles.includes(me.role)) redirect(homeFor(me.role));
  return me;
}
