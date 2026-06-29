# AP Aging

## Two Views of AP

| View | Source | Authority |
|------|--------|-----------|
| GL subledger (`SupplierApBalanceService`) | `journal_entry_lines` on `trade_payables` control account | Authoritative — matches the trial balance |
| Aging view | `purchase_invoices.balance` per bill | Convenience for bucketing; can drift from GL |

The subledger-of-record is `supplier-ap-balance.service.ts`. The aging view uses `purchaseInvoices.balance` because it carries `dueDate` for bucket assignment.

## Current AP KPIs (purchase-overview.service.ts)

```
outstandingAp  = Σ balance WHERE status='confirmed' AND balance > 0
overdueAp      = Σ balance WHERE status='confirmed' AND balance > 0 AND dueDate < today
paymentsThisMonth = Σ totalAmount WHERE status='posted' AND paymentDate >= month_start
```

File: `purchase-overview.service.ts:65-98`

**Gap:** These are tenant-level scalars. There is no dedicated AP aging report with 0-30/31-60/61-90/90+ buckets per supplier.

## What a Proper Aging Needs

| Bucket | Condition |
|--------|-----------|
| Current | `dueDate >= today` |
| 1-30 days | `today - dueDate BETWEEN 1 AND 30` |
| 31-60 days | `today - dueDate BETWEEN 31 AND 60` |
| 61-90 days | `today - dueDate BETWEEN 61 AND 90` |
| 90+ days | `today - dueDate > 90` |

Filtering: `status = 'confirmed'` AND `balance > 0` AND `isOpening != true` (exclude OB carry-forwards, per `overview.service.ts:141`).

## Reconciliation

`SupplierApBalanceService.reconcileAll` (in `supplier-ap-balance.service.ts`) computes drift:

```
drift = ledgerBalance (GL) − agingBalance (Σ purchase_invoices.balance)
```

Non-zero drift means a JE was posted to 2111 without an invoice row update (or vice versa). Should be zero in normal operation.

## dueDate Propagation

`dueDate` on `purchase_invoices` is set from the payment terms at bill confirmation. The AP aging JE line carries `dueDate` so the GL control line is also tagged:

```typescript
// purchase-accounting.listener.ts:406-409
...(payload.dueDate ? { dueDate: payload.dueDate } : {}),
```

This means a GL-based aging (querying `journal_entry_lines.dueDate`) would be possible and would match the subledger-of-record exactly.

## EXISTS vs REQUIRES

| Feature | Status | File |
|---------|--------|------|
| Outstanding AP scalar (overview) | EXISTS | `overview.service.ts:64` |
| Overdue AP scalar (overview) | EXISTS | `overview.service.ts:75` |
| AP subledger (GL-derived per supplier) | EXISTS | `supplier-ap-balance.service.ts:83` |
| dueDate on JE control line | EXISTS | `listener.ts:406` |
| AP aging buckets (0-30/31-60/61-90/90+) | REQUIRES — no dedicated query |
| Per-supplier aging report endpoint | REQUIRES |
| Aging vs subledger reconciliation endpoint | REQUIRES (service exists but no controller) |
| Exclude voided bills from aging | EXISTS — status filter is `confirmed` only |
| Advance (prepayment) offset in aging | REQUIRES — 1161 balance not netted against 2111 in aging |
