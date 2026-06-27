# Chapter 06 — Posting Count Variances to the Ledger + GL

## The posting chain

`StockCountsService.approvePost()` → `StockAdjustmentsService.create()` →
`StockLedgerService.recordMany()` → `OutboxService.enqueue()` → poller →
`InventoryEventListener` → accounting JE

The count service does not interact with the ledger directly. It delegates entirely to
`StockAdjustmentsService`, which is the same code path used by manual adjustments,
opening balances, and all other non-movement inventory writes.

## DR/CR mapping for variances

Adjustment type `"Found"` (surplus — counted more than system):
- DR Inventory Asset account (on_hand increases)
- CR Inventory Adjustment account (gain)

Adjustment type `"Lost"` (shortage — counted less than system):
- DR Inventory Adjustment account (loss, e.g. shrinkage)
- CR Inventory Asset account (on_hand decreases)

The exact accounts are resolved via `AccountMappings` in the accounting module. The
inventory side only specifies adjustment type; the GL side resolves the account codes.

## Multiple `StockAdjustmentsService.create()` calls per count

The approve-post path may create up to 4 separate adjustment documents per count:
1. Non-serial increases (Found)
2. Non-serial decreases (Lost)
3. Serial increases (Found)
4. Serial decreases (Lost)

Each call is independent (not wrapped in a transaction). If one succeeds and a later one
fails (e.g., a period error on the second call), the count will partially post:
- Some variance lines will have been applied to the ledger.
- The `stock_counts.status` remains at `pending_review` (the final status update at
  line 786-793 has not run yet).
- A retry of `approvePost()` is permitted (it accepts `approved` or `pending_review`
  status), but it will re-run **all** adjustments, potentially double-posting the ones
  that succeeded on the first attempt.

### Idempotency gap

`StockAdjustmentsService.create()` does not have a caller-supplied idempotency key for
the count-posting path. Each retry generates a new adjustment document with a new ID.
This means a partial failure followed by a retry will create duplicate ledger entries for
the successfully-posted variances.

The adjustment's `eventId` IS deterministic for ledger entries within a single
`create()` call (Layer 0 hardening), but a second `create()` call generates new random
IDs for the adjustment document and new eventIds for the entries. There is no deduplication
at the count level.

## Reuse of the adjustment path

By delegating to `StockAdjustmentsService`, count variances automatically inherit:
- Period guard (`assertPeriodOpen`)
- WAC recalculation
- Outbox-durable GL event emission
- Attribution threading (batch/serial, from Layer 2a hardening)
- Audit logging via `@Audited` decorator

This is the correct architecture — no special-case logic in the count module for ledger
mechanics.

## Variance value on the count header

After posting, `varianceValue` on the `stock_counts` header is set to the sum of
`|varianceValue|` across all counted lines (stock-counts.service.ts:777-793). This is
computed from the **line-level** variance values (which use WAC at line-save time), not
from the adjustment document totals. There can be a small discrepancy if WAC changes
between `saveLines` and `approvePost` (the adjustment uses current WAC; the header
variance uses the WAC embedded in the line at save time).
