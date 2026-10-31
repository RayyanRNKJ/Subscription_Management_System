"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { documentTotals, lineAmounts } from "@/lib/pricing";
import { formatINR } from "@/lib/format";

type Customer = { id: string; full_name: string | null; email: string; company: string | null };
type Tax = { id: string; name: string; rate: number };
type Product = { id: string; name: string; sales_price: number; tax_id: string | null; product_variants: { id: string; attribute: string; value: string; extra_price: number }[] };
type Plan = { id: string; name: string; price: number; period: string; min_quantity: number; available_from: string | null; available_to: string | null; tax_id: string | null };
type Line = { product_id: string; variant_id: string; quantity: number; unit_price: number; tax_id: string };

export function SubscriptionForm({ plans, products, taxes }: { plans: Plan[]; products: Product[]; taxes: Tax[] }) {
  const router = useRouter();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [startDate, setStartDate] = useState(today);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [planId, setPlanId] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Net 15");
  const [lines, setLines] = useState<Line[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const plan = plans.find((item) => item.id === planId);
  const availablePlans = plans.filter((item) => (!item.available_from || startDate >= item.available_from) && (!item.available_to || startDate <= item.available_to));

  async function searchCustomers() {
    const response = await fetch(`/api/customers?q=${encodeURIComponent(customerQuery)}`);
    const json = await response.json();
    if (!response.ok) return setMessage(json.error?.message ?? "Could not find customers.");
    setCustomers(json.data as Customer[]);
  }

  function addLine() {
    const product = products[0];
    if (!product) return;
    setLines((current) => [...current, { product_id: product.id, variant_id: "", quantity: 1, unit_price: Number(product.sales_price), tax_id: product.tax_id ?? "" }]);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function chooseProduct(index: number, productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    updateLine(index, { product_id: product.id, variant_id: "", unit_price: Number(product.sales_price), tax_id: product.tax_id ?? "" });
  }

  function chooseVariant(index: number, variantId: string) {
    const line = lines[index];
    const product = products.find((item) => item.id === line.product_id);
    const variant = product?.product_variants.find((item) => item.id === variantId);
    updateLine(index, { variant_id: variantId, unit_price: Number(product?.sales_price ?? 0) + Number(variant?.extra_price ?? 0) });
  }

  const totals = useMemo(() => documentTotals([
    ...(plan && Number(plan.price) > 0 ? [lineAmounts({ qty: 1, unitPrice: Number(plan.price), taxRate: Number(taxes.find((tax) => tax.id === plan.tax_id)?.rate ?? 0) })] : []),
    ...lines.map((line) => lineAmounts({ qty: Number(line.quantity), unitPrice: Number(line.unit_price), taxRate: Number(taxes.find((tax) => tax.id === line.tax_id)?.rate ?? 0) })),
  ]), [lines, plan, taxes]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customer) return setMessage("Search for and select a customer first.");
    if (!plan) return setMessage("Choose a plan available on the start date.");
    if (lines.length < 1) return setMessage("Add at least one subscription line.");
    setPending(true); setMessage("");
    const response = await fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customer_id: customer.id, plan_id: planId, start_date: startDate, expiry_date: expiryDate || null, payment_terms: paymentTerms, lines: lines.map((line) => ({ ...line, variant_id: line.variant_id || null, tax_id: line.tax_id || null })) }) });
    const json = await response.json();
    setPending(false);
    if (!response.ok) return setMessage(json.error?.message ?? "Could not create subscription.");
    router.push(`/subscriptions/${json.data.id}`); router.refresh();
  }

  return <form className="space-y-6" onSubmit={submit}>
    <div><h1 className="text-2xl font-semibold">New subscription</h1><p className="mt-1 text-sm text-slate-600">Create a draft subscription with recurring product lines.</p></div>
    <section className="grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2"><label className="text-sm font-medium" htmlFor="customer-search">Customer</label><div className="flex gap-2"><input id="customer-search" value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setCustomer(null); }} placeholder="Search name, email, or company" className="min-h-11 flex-1 rounded-md border px-3" /><button type="button" onClick={() => void searchCustomers()} className="min-h-11 rounded-md border px-4">Search</button></div>{customer && <p className="text-sm text-emerald-700">Selected: {customer.full_name ?? customer.email} · {customer.email}</p>}{customers.length > 0 && <div className="max-h-40 overflow-auto rounded-md border">{customers.map((item) => <button type="button" key={item.id} onClick={() => { setCustomer(item); setCustomerQuery(item.full_name ?? item.email); setCustomers([]); }} className="block min-h-11 w-full border-b px-3 text-left text-sm hover:bg-slate-50">{item.full_name ?? "Unnamed"} · {item.email}{item.company ? ` · ${item.company}` : ""}</button>)}</div>}</div>
      <label className="grid gap-1 text-sm">Start date<input required type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPlanId(""); }} className="min-h-11 rounded-md border px-3" /></label>
      <label className="grid gap-1 text-sm">Plan<select required value={planId} onChange={(event) => setPlanId(event.target.value)} className="min-h-11 rounded-md border px-3"><option value="">Select available plan</option>{availablePlans.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatINR(item.price)}/{item.period} · minimum qty {item.min_quantity}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Expiry date (optional)<input type="date" min={startDate} value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className="min-h-11 rounded-md border px-3" /></label>
      <label className="grid gap-1 text-sm">Payment terms<input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} placeholder="Net 15" className="min-h-11 rounded-md border px-3" /></label>
    </section>
    <section className="space-y-4 rounded-xl border bg-white p-5"><div className="flex items-center justify-between"><h2 className="font-semibold">Subscription lines</h2><button type="button" disabled={!products.length} onClick={addLine} className="min-h-11 rounded-md border px-4 text-sm">Add line</button></div>
      {lines.map((line, index) => { const product = products.find((item) => item.id === line.product_id); return <div key={index} className="grid gap-3 border-t pt-4 md:grid-cols-6">
        <label className="grid gap-1 text-sm md:col-span-2">Product<select value={line.product_id} onChange={(event) => chooseProduct(index, event.target.value)} className="min-h-11 rounded-md border px-2">{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Variant<select value={line.variant_id} onChange={(event) => chooseVariant(index, event.target.value)} className="min-h-11 rounded-md border px-2"><option value="">Default</option>{product?.product_variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.attribute}: {variant.value} (+{formatINR(variant.extra_price)})</option>)}</select></label>
        <label className="grid gap-1 text-sm">Quantity<input type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} className="min-h-11 rounded-md border px-2" /></label>
        <label className="grid gap-1 text-sm">Unit price<input type="number" min="0" step="0.01" value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: Number(event.target.value) })} className="min-h-11 rounded-md border px-2" /></label>
        <div className="flex items-end gap-2"><label className="grid min-w-0 flex-1 gap-1 text-sm">Tax<select value={line.tax_id} onChange={(event) => updateLine(index, { tax_id: event.target.value })} className="min-h-11 rounded-md border px-2"><option value="">No tax</option>{taxes.map((tax) => <option key={tax.id} value={tax.id}>{tax.name} ({tax.rate}%)</option>)}</select></label><button type="button" onClick={() => setLines((current) => current.filter((_, i) => i !== index))} className="min-h-11 rounded-md px-2 text-sm text-red-700">Remove</button></div>
      </div>; })}
      {!lines.length && <p className="text-sm text-slate-500">No lines yet. Add at least one product line.</p>}
      {plan && <p className="text-sm text-slate-600">Total quantity: {lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)} / minimum {plan.min_quantity}</p>}
    </section>
    <section className="ml-auto max-w-sm space-y-2 rounded-xl border bg-white p-5 text-sm"><h2 className="font-semibold">Recurring total preview</h2>{plan && Number(plan.price) > 0 && <p className="flex justify-between"><span>Plan fee</span><span>{formatINR(plan.price)}</span></p>}<p className="flex justify-between"><span>Subtotal</span><span>{formatINR(totals.subtotal)}</span></p><p className="flex justify-between"><span>Tax</span><span>{formatINR(totals.tax)}</span></p><p className="flex justify-between border-t pt-2 font-semibold"><span>Total</span><span>{formatINR(totals.total)}</span></p></section>
    {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
    <button disabled={pending || !products.length} className="min-h-11 rounded-md bg-indigo-600 px-5 font-medium text-white disabled:opacity-50">{pending ? "Creating…" : "Create draft subscription"}</button>
  </form>;
}
