"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { paymentMethods } from "@/lib/validation/payment";
import { formatINR } from "@/lib/format";

type InvoiceSummary = { id: string; number: string; status: string; balance: number };

export function PaymentDialog({ initialInvoice, onClose }: { initialInvoice?: InvoiceSummary; onClose: () => void }) {
  const router = useRouter();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const [invoiceId, setInvoiceId] = useState(initialInvoice?.id ?? "");
  const [invoice, setInvoice] = useState<InvoiceSummary | undefined>(initialInvoice);
  const [method, setMethod] = useState<(typeof paymentMethods)[number]>("upi");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function lookupInvoice() {
    setMessage(""); setInvoice(undefined);
    if (!invoiceId) return;
    const response = await fetch(`/api/invoices/${encodeURIComponent(invoiceId)}`);
    const json = await response.json();
    if (!response.ok) return setMessage(json.error?.message ?? "Invoice not found.");
    setInvoice(json.data as InvoiceSummary);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage("");
    const response = await fetch("/api/payments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoice_id: invoiceId, method, amount, paid_on: paidOn, note: note || null }) });
    const json = await response.json(); setPending(false);
    if (!response.ok) return setMessage(json.error?.message ?? "Payment could not be recorded.");
    router.refresh(); onClose();
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="payment-title" className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl">
    <div className="flex items-start justify-between"><div><h2 id="payment-title" className="text-lg font-semibold">Record payment</h2><p className="mt-1 text-sm text-slate-500">Payments are recorded manually against confirmed invoices.</p></div><button type="button" onClick={onClose} aria-label="Close" className="min-h-11 min-w-11 rounded-md border">×</button></div>
    <label className="grid gap-1 text-sm">Invoice ID<input required readOnly={Boolean(initialInvoice)} value={invoiceId} onChange={(event) => { setInvoiceId(event.target.value); setInvoice(undefined); }} onBlur={() => void lookupInvoice()} placeholder="Paste invoice UUID" className="min-h-11 rounded-md border px-3 read-only:bg-slate-50" /></label>
    {invoice && <div className="rounded-md bg-slate-50 p-3 text-sm"><p className="font-medium">{invoice.number} · {invoice.status}</p><p className="mt-1">Outstanding balance: <strong>{formatINR(invoice.balance)}</strong></p></div>}
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Method<select value={method} onChange={(event) => setMethod(event.target.value as (typeof paymentMethods)[number])} className="min-h-11 rounded-md border px-3">{paymentMethods.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label><label className="grid gap-1 text-sm">Amount<input required type="number" min="0.01" max={invoice?.balance} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="min-h-11 rounded-md border px-3" /></label><label className="grid gap-1 text-sm">Paid on<input required type="date" max={today} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} className="min-h-11 rounded-md border px-3" /></label><label className="grid gap-1 text-sm">Note<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="min-h-11 rounded-md border px-3" /></label></div>
    {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
    <button disabled={pending || !invoice || invoice.status !== "confirmed" || invoice.balance <= 0} className="min-h-11 rounded-md bg-indigo-600 px-4 font-medium text-white disabled:opacity-50">{pending ? "Recording…" : "Record payment"}</button>
  </form></div>;
}
