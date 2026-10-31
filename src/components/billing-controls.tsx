"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Result = { run_date: string; created: number; skipped: number; failed: number; auto_closed: number; failures: { subscription: string; reason: string }[] };

export function BillingControls() {
  const router = useRouter();
  const [runDate, setRunDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function run() {
    setPending(true); setMessage(""); setResult(null);
    const response = await fetch("/api/billing/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ run_date: runDate }) });
    const json = await response.json(); setPending(false);
    if (!response.ok) return setMessage(json.error?.message ?? "Billing run failed.");
    setResult(json.data as Result); setOpen(true); router.refresh();
  }

  async function confirmDrafts() {
    setPending(true); setMessage("");
    const response = await fetch("/api/invoices/confirm-drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const json = await response.json(); setPending(false);
    if (!response.ok) return setMessage(json.error?.message ?? "Draft invoices could not be confirmed.");
    setMessage(`${json.data.confirmed} draft invoice${json.data.confirmed === 1 ? "" : "s"} confirmed.`); router.refresh();
  }

  return <div className="flex flex-wrap items-center gap-2">
    <label className="flex min-h-11 items-center gap-2 rounded-md border bg-white px-3 text-sm">Run date<input aria-label="Billing run date" type="date" value={runDate} onChange={(event) => setRunDate(event.target.value)} className="min-h-9" /></label>
    <button disabled={pending} onClick={() => void run()} className="min-h-11 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-50">{pending ? "Running…" : "Run billing"}</button>
    <button disabled={pending} onClick={() => void confirmDrafts()} className="min-h-11 rounded-md border bg-white px-4 text-sm disabled:opacity-50">Confirm all drafts</button>
    {message && <p role="status" className="basis-full text-sm text-slate-600">{message}</p>}
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="billing-result-title" className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 id="billing-result-title" className="text-lg font-semibold">Billing run complete</h2><p className="mt-1 text-sm text-slate-500">Run date: {result?.run_date}</p></div><button onClick={() => setOpen(false)} aria-label="Close result" className="min-h-11 min-w-11 rounded-md border">×</button></div><dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[["Created", result?.created], ["Skipped", result?.skipped], ["Failed", result?.failed], ["Auto-closed", result?.auto_closed]].map(([label, count]) => <div key={label as string} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-xl font-semibold">{count}</dd></div>)}</dl>{Boolean(result?.failures.length) && <div className="max-h-40 space-y-2 overflow-auto rounded-md border p-3 text-sm"><h3 className="font-medium">Failures</h3>{result?.failures.map((failure, index) => <p key={`${failure.subscription}-${index}`}><span className="font-medium">{failure.subscription}:</span> {failure.reason}</p>)}</div>}<button onClick={() => setOpen(false)} className="min-h-11 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white">Done</button></section></div>}
  </div>;
}
