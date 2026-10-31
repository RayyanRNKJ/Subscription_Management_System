import { createClient } from "@/lib/supabase/server";
import { fail, okList, withRole } from "@/lib/api";

function pageValue(value: string | null) {
  const page = Number(value ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export const GET = withRole(["admin", "staff"], async (request) => {
  const url = new URL(request.url);
  const page = pageValue(url.searchParams.get("page"));
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25) || 25));
  const status = url.searchParams.get("status");
  const customer = url.searchParams.get("customer");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q")?.trim();
  const overdue = url.searchParams.get("overdue") === "true";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const supabase = await createClient();
  let query = supabase.from("invoices").select("id,number,subscription_id,customer_id,status,period_start,period_end,issue_date,due_date,subtotal,discount_total,tax_total,total,sent_at,profiles(full_name,email)", { count: page === 1 ? "exact" : "estimated" });
  if (status) query = query.eq("status", status);
  if (customer) query = query.eq("customer_id", customer);
  if (from) query = query.gte("issue_date", from);
  if (to) query = query.lte("issue_date", to);
  if (overdue) query = query.eq("status", "confirmed").lt("due_date", today);
  if (q) query = query.ilike("number", `%${q.replace(/[%_,()]/g, "")}%`);
  const { data, error, count } = await query.order("issue_date", { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
  if (error) return fail("INTERNAL", "Could not load invoices.", 500);
  const ids = (data ?? []).map((invoice) => invoice.id);
  const { data: balances, error: balanceError } = ids.length
    ? await supabase.from("invoice_balances").select("invoice_id,total,paid,balance").in("invoice_id", ids)
    : { data: [], error: null };
  if (balanceError) return fail("INTERNAL", "Could not load invoice balances.", 500);
  const balanceMap = new Map((balances ?? []).map((row) => [row.invoice_id, row]));
  const items = (data ?? []).map((invoice) => ({ ...invoice, balance: balanceMap.get(invoice.id)?.balance ?? invoice.total, paid: balanceMap.get(invoice.id)?.paid ?? 0 }));
  return okList(items, page, pageSize, count ?? 0);
});
