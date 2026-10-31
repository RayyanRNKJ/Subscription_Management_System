"use client";

import { useState } from "react";

type Tax = { id: string; name: string; rate: number };

export function TaxManager({ initialTaxes, canEdit }: { initialTaxes: Tax[]; canEdit: boolean }) {
  const [taxes, setTaxes] = useState(initialTaxes);
  const [message, setMessage] = useState("");

  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message ?? "Request failed.");
    return json.data;
  }

  async function create(form: HTMLFormElement) {
    try {
      const data = await request("/api/taxes", "POST", Object.fromEntries(new FormData(form)));
      setTaxes((current) => [...current, data].sort((a, b) => a.name.localeCompare(b.name)));
      form.reset(); setMessage("Tax created.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create tax."); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this tax?")) return;
    try { await request(`/api/taxes/${id}`, "DELETE"); setTaxes((current) => current.filter((tax) => tax.id !== id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete tax."); }
  }

  async function edit(tax: Tax) {
    const name = prompt("Tax name", tax.name);
    if (name === null) return;
    const rate = prompt("Tax rate (%)", String(tax.rate));
    if (rate === null) return;
    try {
      const updated = await request(`/api/taxes/${tax.id}`, "PATCH", { name, rate });
      setTaxes((current) => current.map((item) => item.id === tax.id ? updated : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update tax."); }
  }

  return <div className="max-w-3xl space-y-6">
    <div><h1 className="text-2xl font-semibold">Taxes</h1><p className="mt-1 text-sm text-slate-600">Tax rates are applied automatically to subscription and invoice lines.</p></div>
    {canEdit && <form className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[1fr_10rem_auto]" onSubmit={(event) => { event.preventDefault(); void create(event.currentTarget); }}>
      <input name="name" required placeholder="Tax name (e.g. GST)" className="rounded-md border px-3 py-2" />
      <input name="rate" required min="0" max="100" step="0.01" type="number" placeholder="Rate %" className="rounded-md border px-3 py-2" />
      <button className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white">Add tax</button>
    </form>}
    {message && <p role="status" className="text-sm text-slate-600">{message}</p>}
    <div className="overflow-hidden rounded-xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Rate</th>{canEdit && <th className="px-4 py-3" />}</tr></thead><tbody>{taxes.map((tax) => <tr key={tax.id} className="border-t"><td className="px-4 py-3 font-medium">{tax.name}</td><td className="px-4 py-3">{tax.rate}%</td>{canEdit && <td className="space-x-3 px-4 py-3 text-right"><button onClick={() => void edit(tax)} className="text-indigo-700">Edit</button><button onClick={() => void remove(tax.id)} className="text-red-700">Delete</button></td>}</tr>)}</tbody></table>{!taxes.length && <p className="p-6 text-sm text-slate-500">No taxes yet.</p>}</div>
  </div>;
}
