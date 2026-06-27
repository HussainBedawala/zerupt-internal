# Chapter 04 — Inventory Period Cutoff & Close

## Does inventory have its own period close?

**No.** There is no `inventory_periods` table, no `InventoryPeriodService`, and no
inventory-specific close checklist. Inventory relies entirely on the accounting module's
fiscal period infrastructure:

- `fiscal_periods` table (via `packages/db/src/schema/fiscal.ts`)
- `FiscalPeriodService.validatePeriod()` / `assertPeriodOpen()` in
  `apps/api/src/fiscal-period/fiscal-period.service.ts`

## How inventory movements are blocked from closed periods

Every movement that writes to the stock ledger goes through one of two services:

1. **`StockAdjustmentsService.create()`** (stock-adjustments.service.ts:122-124):
   ```typescript
   const occurredAt = new Date();  // wall clock
   await this.assertPeriodOpen(tenantId, wh.legalEntityId, occurredAt);
   ```

2. **`StockAdjustmentsService.createWithDate()`** (line 328-330) — the backdating path:
   ```typescript
   const occurredAt = input.occurredAt;
   await this.assertPeriodOpen(tenantId, wh.legalEntityId, occurredAt);
   ```

`assertPeriodOpen` (line 1122-1136) calls `FiscalPeriodService.validatePeriod()`. If the
date falls in a `hard_locked` period, or before the earliest open period
(`isBackdatedPastLock`), a `ConflictException` is thrown. Soft-locked periods are also
blocked at MVP — the spec's "warn + override-with-reason" flow is noted as out of scope
(comment at line 1119).

## What happens at count posting time — the date problem

`StockCountsService.approvePost()` does **not** accept an `occurredAt` or `countDate`
parameter. It calls `StockAdjustmentsService.create()` (the wall-clock path):
```typescript
await this.stockAdjustments.create(tenantId, userId, {
  warehouseId: header.warehouseId,
  type: "Found",
  lines: ...,
  reason: `Stock count ...`,
  allowNegative: false,
});
```
There is no `occurredAt` in the `CreateAdjustmentInput` passed from the count service.
This means **all variance adjustments from a stock count post with `occurredAt = now()`
(approval timestamp)**, not the date the count was conducted.

### Practical implication

A stockkeeper counts on December 30 (period Dec open), submits for review, and the
manager approves on January 2 (new period Jan open, Dec now closed). The variance
adjustments post into January. This is economically wrong — the shrinkage occurred in
December. There is no mechanism today to set the posting date to the count date.

## Backdating via `occurredAt` on manual adjustments

`StockAdjustmentsService` does have a `createWithDate()` method that accepts an
`occurredAt` (the "Other" adjustment type or similar paths). But the count service
never calls this path. The count service only calls the standard `create()`.

## Period close checklist for inventory (what should exist but doesn't)

The accounting module has `close_management.ts` with `closeChecklistTemplates` and
`closeRuns`. Inventory has no equivalent. A stockkeeper with no accounting background
has no guided pre-close checklist for:
- All counts in status `in_progress` or `pending_review` must be resolved before close.
- No open transfers in `sent` status (in-transit goods with open cost).
- On-hand reconciliation passed (`detectQuantityVariances` clean).

## Stock transfers and period alignment

`StockTransfersService` (stock-transfers.service.ts) does call `assertPeriodOpen` for
the `occurredAt` at both send and receive time. Transfer timestamps are set to wall clock
at the time of each operation, which is correct for transfers (send-date and receive-date
are distinct).
