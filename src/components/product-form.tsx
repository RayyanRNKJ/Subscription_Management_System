"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Tax = { id: string; name: string; rate: number };
type Variant = { attribute: string; value: string; extra_price: number };
type Product = { id: string; name: string; type: string | null; sales_price: number; cost_price: number | null; notes: string | null; tax_id: string | null; product_variants: Variant[] };

export function ProductForm({ taxes, product }: { taxes: Tax[]; product?: Product }) {
  const router = useRouter();
  const [variants, setVariants] = useState<Variant[]>(product?.product_variants ?? []);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  function updateVariant(index: number, key: keyof Variant, value: string) {
    setVariants((current) => current.map((variant, i) => i === index ? { ...variant, [key]: key === "extra_price" ? Number(value) : value } : variant));
  }

  async function submit(form: HTMLFormElement) {
    setPending(true); setError("");
    const values = Object.fromEntries(new FormData(form));
    const body = { ...values, tax_id: values.tax_id || null, cost_price: values.cost_price || null, notes: values.notes || null, type: values.type || null, variants };
    const response = await fetch(product ? `/api/products/${product.id}` : "/api/products", { method: product ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await response.json(); setPending(false);
    if (!response.ok) { setError(json.error?.message ?? "Could not save product."); return; }
    router.push("/products"); router.refresh();
  }

  return <div className="max-w-3xl space-y-6"><div><h1 className="text-2xl font-semibold">{product ? "Edit product" : "New product"}</h1><p className="mt-1 text-sm text-slate-600">Set a base price and optional variants that add to it.</p></div>
    <form className="space-y-5 rounded-xl border bg-white p-5" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Name<input name="name" required defaultValue={product?.name} className="rounded-md border px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">Type<input name="type" defaultValue={product?.type ?? ""} className="rounded-md border px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">Sales price (₹)<input name="sales_price" required min="0" step="0.01" type="number" defaultValue={product?.sales_price} className="rounded-md border px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">Cost price (₹)<input name="cost_price" min="0" step="0.01" type="number" defaultValue={product?.cost_price ?? ""} className="rounded-md border px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium">Default tax<select name="tax_id" defaultValue={product?.tax_id ?? ""} className="rounded-md border px-3 py-2"><option value="">No tax</option>{taxes.map((tax) => <option key={tax.id} value={tax.id}>{tax.name} ({tax.rate}%)</option>)}</select></label></div>
      <label className="grid gap-1 text-sm font-medium">Notes<textarea name="notes" defaultValue={product?.notes ?? ""} className="min-h-24 rounded-md border px-3 py-2" /></label>
      <section className="space-y-3 border-t pt-5"><div className="flex items-center justify-between"><h2 className="font-medium">Variants</h2><button type="button" className="text-sm font-medium text-indigo-700" onClick={() => setVariants((current) => [...current, { attribute: "", value: "", extra_price: 0 }])}>Add variant</button></div>{variants.map((variant, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_9rem_auto]"><input aria-label="Attribute" placeholder="Attribute (e.g. Brand)" value={variant.attribute} onChange={(event) => updateVariant(index, "attribute", event.target.value)} className="rounded-md border px-3 py-2" /><input aria-label="Value" placeholder="Value (e.g. Odoo)" value={variant.value} onChange={(event) => updateVariant(index, "value", event.target.value)} className="rounded-md border px-3 py-2" /><input aria-label="Extra price" type="number" min="0" step="0.01" value={variant.extra_price} onChange={(event) => updateVariant(index, "extra_price", event.target.value)} className="rounded-md border px-3 py-2" /><button type="button" className="text-sm text-red-700" onClick={() => setVariants((current) => current.filter((_, i) => i !== index))}>Remove</button></div>)}</section>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex gap-3"><button disabled={pending} className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50">{pending ? "Saving…" : "Save product"}</button><button type="button" onClick={() => router.back()} className="rounded-md border px-4 py-2">Cancel</button></div>
    </form></div>;
}
