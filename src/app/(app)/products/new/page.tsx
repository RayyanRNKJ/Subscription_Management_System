import { ProductForm } from "@/components/product-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NewProductPage() { await requireRole("admin"); const supabase = await createClient(); const { data } = await supabase.from("taxes").select("id,name,rate").order("name"); return <ProductForm taxes={(data ?? []) as { id: string; name: string; rate: number }[]} />; }
