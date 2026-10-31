import { createClient } from "@/lib/supabase/server";
import { fail, ok, withRole } from "@/lib/api";

function plusPeriod(dateValue: string, period: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  if (period === "daily") date.setUTCDate(day + 1);
  if (period === "weekly") date.setUTCDate(day + 7);
  if (period === "monthly") date.setUTCMonth(date.getUTCMonth() + 1);
  if (period === "yearly") date.setUTCFullYear(date.getUTCFullYear() + 1);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  if (period === "monthly" || period === "yearly") date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export const POST = withRole(["admin", "staff"], async (_request, _profile, context) => {
  const { id } = await (context as { params: Promise<{ id: string }> }).params;
  const supabase = await createClient();
  const { data: sub, error } = await supabase.from("subscriptions").select("id,status,expiry_date,plans(period,renewable)").eq("id", id).maybeSingle();
  if (error) return fail("INTERNAL", "Could not load subscription.", 500);
  if (!sub) return fail("NOT_FOUND", "Subscription not found.", 404);
  const plan = (Array.isArray(sub.plans) ? sub.plans[0] : sub.plans) as { period: string; renewable: boolean } | null;
  if (!plan?.renewable || !["active", "closed"].includes(sub.status) || !sub.expiry_date) return fail("INVALID_TRANSITION", "This subscription cannot be renewed under its plan.", 409);
  const expiryDate = plusPeriod(sub.expiry_date, plan.period);
  const { error: updateError } = await supabase.from("subscriptions").update({ expiry_date: expiryDate, status: sub.status === "closed" ? "active" : "active", paused: false }).eq("id", id);
  return updateError ? fail("INTERNAL", "Could not renew subscription.", 500) : ok({ id, expiry_date: expiryDate, status: "active" });
});
