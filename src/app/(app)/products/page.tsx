import Link from "next/link";
import { formatINR } from "@/lib/format";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ProductsPage() {
  const [profile, supabase] = await Promise.all([getProfile(), createClient()]);
  const { data } = await supabase.from("products").select("id,name,type,sales_price,taxes(name,rate),product_variants(attribute,value,extra_price)").order("name");
  const admin = profile?.role === "admin";
  return <div className="space-y-6"><div className="flex items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Products</h1><p className="mt-1 text-sm text-slate-600">Catalogue prices and product variants.</p></div>{admin && <Link href="/products/new" className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white">New product</Link>}</div><div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">Sales price</th><th className="px-4 py-3">Tax</th><th className="px-4 py-3">Variants</th>{admin && <th className="px-4 py-3" />}</tr></thead><tbody>{(data ?? []).map((product) => <tr key={product.id} className="border-t"><td className="px-4 py-3"><p className="font-medium">{product.name}</p><p className="text-slate-500">{product.type}</p></td><td className="px-4 py-3">{formatINR(product.sales_price)}</td><td className="px-4 py-3">{product.taxes?.[0]?.name ?? "—"}</td><td className="px-4 py-3">{product.product_variants?.map((variant) => `${variant.attribute}: ${variant.value} (+${formatINR(variant.extra_price)})`).join(", ") || "—"}</td>{admin && <td className="px-4 py-3 text-right"><Link href={`/products/${product.id}`} className="text-indigo-700">Edit</Link></td>}</tr>)}</tbody></table>{!data?.length && <p className="p-6 text-sm text-slate-500">No products yet.</p>}</div></div>;
}
