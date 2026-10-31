"use client";
import { useState } from "react";
import { btnCls, inputCls } from "@/components/auth-ui";

export default function StaffPage() {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = e.currentTarget;
    const res = await fetch("/api/admin/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    const json = await res.json();
    setMsg(res.ok ? { ok: true, text: `Staff account created for ${json.email}` } : { ok: false, text: json.error });
    if (res.ok) form.reset();
    setBusy(false);
  }

  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">Add staff member</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input name="full_name" placeholder="Full name" required className={inputCls} />
        <input name="email" type="email" placeholder="Email" required className={inputCls} />
        <input name="password" type="password" placeholder="Temporary password" required className={inputCls} />
        {msg && <p className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>{msg.text}</p>}
        <button disabled={busy} className={btnCls}>{busy ? "Creating…" : "Create staff account"}</button>
      </form>
    </div>
  );
}
