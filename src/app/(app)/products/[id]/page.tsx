import { notFound } from "next/navigation";
import { ProductForm } from "@/components/product-form";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) { await requireRole("admin"); const { id } = await params; const supabase = await createClient(); const [{ data: product }, { data: taxes }] = await Promise.all([supabase.from("products").select("id,name,type,sales_price,cost_price,notes,tax_id,product_variants(attribute,value,extra_price)").eq("id", id).maybeSingle(), supabase.from("taxes").select("id,name,rate").order("name")]); if (!product) notFound(); return <ProductForm product={product as Parameters<typeof ProductForm>[0]["product"]} taxes={(taxes ?? []) as { id: string; name: string; rate: number }[]} />; }
