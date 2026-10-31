export type SubscriptionStatus = "draft" | "quotation" | "confirmed" | "active" | "closed";
export type InvoiceStatus = "draft" | "confirmed" | "paid" | "cancelled";

export const subscriptionTransitions: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  draft: ["quotation", "closed"],
  quotation: ["confirmed", "closed"],
  confirmed: ["active", "closed"],
  active: ["closed"],
  closed: [],
};

export function canTransition(from: SubscriptionStatus, to: SubscriptionStatus) {
  return subscriptionTransitions[from].includes(to);
}

export const statusBadgeClass: Record<SubscriptionStatus | InvoiceStatus | "paused" | "overdue", string> = {
  draft: "bg-slate-100 text-slate-700",
  quotation: "bg-blue-100 text-blue-700",
  confirmed: "bg-indigo-100 text-indigo-700",
  active: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-200 text-slate-700",
  paused: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  overdue: "bg-red-100 text-red-700",
};
