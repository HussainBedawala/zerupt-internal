# 03 — Opening AR Balances

## Opening Invoice Flag

`sales_invoices.is_opening` (boolean, default false) — `sales.ts` line ~240.
`sales_invoices.opening_journal_entry_id` (uuid, nullable, no FK) — `sales.ts` line ~248.

### Purpose

An opening-balance carry-forward invoice has:
- `isOpening = true` — marks it as a historical balance, not current-period revenue.
- `openingJournalEntryId` — links to the JE that posted the initial DR 1131 / CR OBE (Opening Balance Equity).

### Guarantees

`sales.listener.ts` guards `sales.invoice.confirmed`: it does NOT special-case `isOpening` — the opening invoice emits the same `sales.invoice.confirmed` event, so the accounting listener posts DR 1131 / CR revenue. This means:

**The accounting engine treats opening invoices the same as regular invoices.** The opening JE (DR 1131 / CR OBE) is assumed to have been posted separately via the TB import flow; the `openingJournalEntryId` is a reference only. The AR subledger side of the opening balance flows through the normal invoice-balance scan.

The overview service (`sales-overview.service.ts` lines ~97–110) explicitly excludes `isOpening` invoices from the `invoicedInPeriod` KPI and from the revenue series:
```
ne(salesInvoices.isOpening, true)
```

But the `outstandingReceivables` KPI does NOT exclude opening invoices — correct, since their balance is still a real receivable.

---

## Opening Balance Import Flow

`packages/db/src/schema/opening-balance-import.ts` — orchestrates the TB import.
The TB import creates opening invoices with `isOpening = true` and records the JE ID in `openingJournalEntryId`.

Key invariant: the opening JE's DR 1131 line should be tagged with `partyId = customerId` so the per-customer GL subledger starts at the right balance. This depends on the TB import correctly party-tagging opening JE lines — a dependency worth verifying in a deeper audit.

---

## Opening Invoice Schema Constraints

There is NO DB CHECK enforcing:
- `isOpening = true → openingJournalEntryId IS NOT NULL`
- `isOpening = false → openingJournalEntryId IS NULL`

The link from opening invoice to opening JE is by convention only (service layer).

A non-opening invoice could theoretically have `openingJournalEntryId` set — no guard.

---

## Opening Balance Reconciliation

The opening AR balance should satisfy:
```
SUM(sales_invoices.balance WHERE isOpening=true AND status='confirmed')
= DR balance on account 1131 from opening JEs
```

This reconciliation is not enforced or checked anywhere. The `reconcile_ar_ap_subledger` close task key exists but is not implemented.
