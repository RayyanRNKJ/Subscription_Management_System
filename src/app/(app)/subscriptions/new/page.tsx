import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SubscriptionForm } from "@/components/subscription-form";

export default async function NewSubscriptionPage() {
  await requireRole("admin", "staff");
  const supabase = await createClient();
  const [{ data: plans }, { data: products }, { data: taxes }] = await Promise.all([
    supabase.from("plans").select("id,name,price,period,min_quantity,available_from,available_to,tax_id").order("name"),
    supabase.from("products").select("id,name,sales_price,tax_id,product_variants(id,attribute,value,extra_price)").order("name"),
    supabase.from("taxes").select("id,name,rate").order("name"),
  ]);
  return <SubscriptionForm plans={(plans ?? []) as never} products={(products ?? []) as never} taxes={(taxes ?? []) as never} />;
}
