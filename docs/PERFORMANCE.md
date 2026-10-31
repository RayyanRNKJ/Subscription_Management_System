# Performance check

Seeded database and deployed page measurements are pending. The seed was not available during this pass: the RLS verifier could not sign in as `staff@brightloop.test`, so no timings or query plans are reported as measured.

| Route / query | Target | Measured | Notes |
|---|---:|---:|---|
| `/dashboard` | < 2 s | Pending seed | Server-side SQL aggregates; overdue rows paginated at 25 |
| `/portal` | < 2 s | Pending seed | Customer-scoped subscriptions, page size 25 |
| `/portal/invoices` | < 2 s | Pending seed | Customer-scoped invoices, page size 25 |
| Dashboard summary RPC | — | Pending seed | Run the EXPLAIN command below |
| Overdue invoices query | — | Pending seed | Ordered by due date, page size 25 |
| Subscriptions list | — | Pending seed | Status filter and newest-first order |
| Invoices list | — | Pending seed | Confirmed status, overdue due date, newest-first order |

## Query plan commands

Run these against the seeded database in the SQL Editor. The first measures the dashboard RPC as a whole; the overdue query mirrors its joins and balance filter.

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.dashboard_summary(current_date - 30, current_date, null, null);

EXPLAIN (ANALYZE, BUFFERS)
SELECT i.id, i.number, i.customer_id, i.due_date, b.balance
FROM public.invoices i
JOIN public.invoice_balances b ON b.invoice_id = i.id
JOIN public.subscriptions s ON s.id = i.subscription_id
WHERE i.status = 'confirmed'
  AND i.due_date < current_date
  AND b.balance > 0
ORDER BY i.due_date ASC, i.id ASC
LIMIT 25;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, number, status, created_at
FROM public.subscriptions
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 25;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, number, status, due_date, issue_date
FROM public.invoices
WHERE status = 'confirmed'
  AND due_date < current_date
ORDER BY issue_date DESC
LIMIT 25;
```

Record warm production response times for the three routes above after login with the seeded staff and customer accounts. Replace each `Pending seed` value with the measured time and append the query-plan summary before closing T10.
