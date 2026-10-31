import { TaxManager } from "@/components/tax-manager";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function TaxesPage() {
  const [profile, supabase] = await Promise.all([getProfile(), createClient()]);
  const { data } = await supabase.from("taxes").select("id,name,rate").order("name");
  return <TaxManager initialTaxes={(data ?? []) as { id: string; name: string; rate: number }[]} canEdit={profile?.role === "admin"} />;
}
