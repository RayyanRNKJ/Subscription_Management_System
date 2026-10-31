import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatINR } from "@/lib/format";
import { PrintButton } from "@/components/print-button";
import styles from "./print.module.css";

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole("admin", "staff", "customer");
  const { id } = await params;
  const supabase = await createClient();
  let query = supabase.from("invoices").select("id,number,customer_id,status,period_start,period_end,issue_date,due_date,subtotal,discount_total,tax_total,total,profiles(full_name,company,email),invoice_lines(id,description,quantity,unit_price,discount_amount,tax_amount,amount)").eq("id", id);
  if (profile.role === "customer") query = query.eq("customer_id", profile.id);
  const { data: invoice, error } = await query.maybeSingle();
  if (error || !invoice) notFound();
  const customer = Array.isArray(invoice.profiles) ? invoice.profiles[0] : invoice.profiles;
  return <main className={`${styles.page} invoice-print-page`}>
    <div className={styles.toolbar}><PrintButton /></div>
    <article className={styles.invoice}>
      <header className={styles.header}><div><p className={styles.brand}>Brightloop Software</p><p>Subscription Management</p><p>India · INR</p></div><div className={styles.invoiceHeading}><p className={styles.label}>Invoice</p><h1>{invoice.number}</h1><p className="capitalize">{invoice.status}</p></div></header>
      <section className={styles.meta}><div><p className={styles.label}>Bill to</p><p className={styles.strong}>{customer?.full_name ?? customer?.company ?? customer?.email}</p>{customer?.company && customer.full_name && <p>{customer.company}</p>}<p>{customer?.email}</p></div><div><p><span className={styles.label}>Issue date</span> {formatDate(invoice.issue_date)}</p><p><span className={styles.label}>Due date</span> {formatDate(invoice.due_date)}</p><p><span className={styles.label}>Period</span> {formatDate(invoice.period_start)} – {formatDate(invoice.period_end)}</p></div></section>
      <table className={styles.lines}><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Discount</th><th>Tax</th><th className={styles.amount}>Net</th></tr></thead><tbody>{invoice.invoice_lines.map((line) => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{formatINR(line.unit_price)}</td><td>{formatINR(line.discount_amount)}</td><td>{formatINR(line.tax_amount)}</td><td className={styles.amount}>{formatINR(line.amount)}</td></tr>)}</tbody></table>
      <section className={styles.totals}><p><span>Subtotal</span><span>{formatINR(invoice.subtotal)}</span></p><p><span>Discount</span><span>−{formatINR(invoice.discount_total)}</span></p><p><span>Tax</span><span>{formatINR(invoice.tax_total)}</span></p><p className={styles.grandTotal}><span>Total due</span><span>{formatINR(invoice.total)}</span></p></section>
      <footer className={styles.footer}>Thank you for your business.</footer>
    </article>
  </main>;
}
