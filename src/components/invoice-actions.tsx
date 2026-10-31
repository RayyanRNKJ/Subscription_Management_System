"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentDialog } from "@/components/payment-dialog";

export function InvoiceActions({ invoice }: { invoice: { id: string; number: string; status: string; balance: number; paymentsCount: number } }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pending, setPending] = useState(false);
  async function act(action: "confirm" | "cancel" | "send") {
    setPending(true); setMessage("");
    const response = await fetch(`/api/invoices/${invoice.id}/${action}`, { method: "POST" });
    const json = await response.json(); setPending(false);
    if (!response.ok) return setMessage(json.error?.message ?? `Could not ${action} invoice.`);
    setMessage(action === "send" ? "Invoice marked as sent." : `Invoice ${action === "cancel" ? "cancelled" : "confirmed"}.`); router.refresh();
  }
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">
    {invoice.status === "draft" && <button disabled={pending} onClick={() => void act("confirm")} className="min-h-11 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white">Confirm</button>}
    {(invoice.status === "draft" || (invoice.status === "confirmed" && invoice.paymentsCount === 0)) && <button disabled={pending} onClick={() => void act("cancel")} className="min-h-11 rounded-md border border-red-200 px-4 text-sm text-red-700">Cancel</button>}
    {["confirmed", "paid"].includes(invoice.status) && <button disabled={pending} onClick={() => void act("send")} className="min-h-11 rounded-md border px-4 text-sm">Mark sent</button>}
    {invoice.status === "confirmed" && invoice.balance > 0 && <button onClick={() => setPaymentOpen(true)} className="min-h-11 rounded-md border px-4 text-sm">Record payment</button>}
    <a href={`/invoices/${invoice.id}/print`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm">Print</a>
  </div>{message && <p role="status" className="text-sm text-slate-600">{message}</p>}{paymentOpen && <PaymentDialog initialInvoice={{ id: invoice.id, number: invoice.number, status: invoice.status, balance: invoice.balance }} onClose={() => setPaymentOpen(false)} />}</div>;
}
