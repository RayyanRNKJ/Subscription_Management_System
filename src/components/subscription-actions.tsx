"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { subscriptionTransitions, type SubscriptionStatus } from "@/lib/status";

export function SubscriptionActions({ id, status, paused, closable, pausable, renewable }: { id: string; status: SubscriptionStatus; paused: boolean; closable: boolean; pausable: boolean; renewable: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function act(path: string, body?: unknown) {
    setPending(true); setMessage("");
    const response = await fetch(`/api/subscriptions/${id}/${path}`, { method: "POST", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const json = await response.json(); setPending(false);
    if (!response.ok) return setMessage(json.error?.message ?? "Could not update subscription.");
    router.refresh();
  }
  const transitions = subscriptionTransitions[status].filter((next) => next !== "closed" || status === "draft" || status === "quotation" || closable);
  return <div className="space-y-2"><div className="flex flex-wrap gap-2">
    {transitions.map((to) => <button key={to} disabled={pending} onClick={() => void act("transition", { to })} className="min-h-11 rounded-md border px-3 text-sm capitalize">Move to {to}</button>)}
    {status === "active" && !paused && pausable && <button disabled={pending} onClick={() => void act("pause")} className="min-h-11 rounded-md border px-3 text-sm">Pause</button>}
    {status === "active" && paused && pausable && <button disabled={pending} onClick={() => void act("resume")} className="min-h-11 rounded-md border px-3 text-sm">Resume</button>}
    {status === "closed" && renewable && <button disabled={pending} onClick={() => void act("renew")} className="min-h-11 rounded-md border px-3 text-sm">Renew</button>}
  </div>{message && <p role="alert" className="text-sm text-red-700">{message}</p>}</div>;
}
