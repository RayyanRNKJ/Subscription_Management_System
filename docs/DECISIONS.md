# Decisions

- Subscription line prices are initialized from product sales price plus the selected variant extra price. Staff can edit the resulting unit price before saving, matching the subscription pricing rule.
- Subscription plan availability is checked against the chosen start date in both the form and API. The API remains authoritative and rejects unavailable selections.
- The line editor looks up customers through the existing paginated customer search API instead of loading the full customer table into a browser select.
- `cacheComponents` remains disabled as required. The scaffold's `partialPrefetching` and `instant` settings depended on Cache Components in Next.js 16.4.3, so they were removed to keep production builds valid.
- Billing tests call the global `run_billing` function, so `scripts/test-billing.ts` refuses to run when unrelated active subscriptions are due; use an isolated billing test database to avoid changing other subscriptions.
- Billing selects and locks the largest eligible discount at the time it is applied, then increments each selected rule once only after the invoice row is inserted.
- Customer invoice printing checks the invoice's `customer_id` against the signed-in profile on the server; staff/admin pages share the same print view under their existing role gate.
- Invoice overdue and payment progress are derived from the invoice status, due date, and `invoice_balances` view at read time; no overdue flag is stored.
- `record_payment` serializes writes on the invoice row before checking the current balance so concurrent manual payments cannot overpay it.
- Dashboard charts use accessible native SVG over SQL-aggregated chart data. Recharts was requested but the package registry install stalled in this environment, so the dashboard stays buildable without adding an unresolved dependency.
