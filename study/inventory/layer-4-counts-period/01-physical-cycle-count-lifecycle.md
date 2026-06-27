# Chapter 01 — Physical / Cycle Count Lifecycle

## Status machine

```
draft  →  in_progress  →  pending_review  →  (approved)  →  posted
                                                           ↘  cancelled  (from draft/in_progress only)
```

Defined as Postgres enum `stock_count_type` (full | cycle | spot) and `stock_count_status`
(draft | in_progress | pending_review | approved | posted | cancelled).
Source: `packages/db/src/schema/stock-counts.ts:32-40`.

## Count types

| Type | Meaning |
|------|---------|
| `full` | All items in the warehouse counted at once |
| `cycle` | A rotating subset (A-B-C rotation) |
| `spot` | Ad-hoc check on a specific item or bin |

Type is stored on the header; the system does not enforce which items appear on a cycle vs spot
count — the stockkeeper is responsible for selecting the right items when creating.

## Step 1 — Create (`POST /tenant/stock-counts`)

Service: `StockCountsService.create()` at `stock-counts.service.ts:304`.

1. Validates warehouse exists and is active.
2. **Snapshots** current `materialized_stock_levels` for that warehouse:
   ```typescript
   SELECT item_id, on_hand, average_cost FROM materialized_stock_levels
   WHERE tenant_id = ? AND warehouse_id = ?
   ```
   (stock-counts.service.ts:324-337)
3. Reserves a `CNT-XXXXX` doc number via `DocNumberingService` (self-healing: ensures a
   CNT sequence exists lazily for tenants provisioned before stock counts shipped).
4. In a single transaction: inserts `stock_counts` header (status=`in_progress`) + inserts
   one `stock_count_lines` row per item in the snapshot (system_qty = on_hand at snapshot time).
5. Line insert is batched in chunks of 500 to avoid oversized payloads.

**Important:** Status starts at `in_progress` on create — there is no explicit "open count"
step after creation. The `draft` status exists in the schema and `saveLines` accepts it, but
`create()` writes `in_progress` directly.

## Step 2 — Enter counted quantities (`PATCH /tenant/stock-counts/:id/lines`)

Service: `StockCountsService.saveLines()` at `stock-counts.service.ts:411`.

- Allowed in `draft` or `in_progress` statuses only.
- Takes an array of `{ lineId, countedQty, scannedSerials?, notes? }`.
- For serial-tracked lines: `countedQty` is **derived** from the length of `scannedSerials`
  (not free-entry). Duplicate serials in a single submission are rejected (BadRequestException).
- For non-serial lines: `countedQty` is free-entry.
- Variance calculated inline:
  ```
  varianceQty   = countedQty − systemQty          (at save time)
  varianceValue = varianceQty × WAC               (WAC joined from materialized_stock_levels)
  ```
  WAC is the **current** WAC at the time the counter saves the line, not the WAC at count
  creation time. This is a subtle drift risk: if a new receipt changes WAC between snapshot
  and line entry, the variance value on the line uses the new WAC.
- Fetches existing lines by `inArray(lineIds)` in one query — efficient.
- Transitions status from `draft` → `in_progress` automatically on first save.

## Step 3 — Submit for review (`POST /tenant/stock-counts/:id/submit`)

Service: `StockCountsService.submit()` at `stock-counts.service.ts:534`.

- Allowed from `draft` or `in_progress`.
- Sets status = `pending_review`, `completedAt = now()`.
- Purely a status transition; no variance computation at this step.

## Step 4 — Approve & post (`POST /tenant/stock-counts/:id/approve-post`)

Service: `StockCountsService.approvePost()` at `stock-counts.service.ts:565`.

- Allowed from `pending_review` or `approved` (idempotent retry is permitted).
- **Non-serial items:** groups variance lines into increases (varianceQty > 0) and decreases
  (varianceQty < 0). Posts each as a `StockAdjustmentsService.create()` call with type
  `"Found"` (increases) or `"Lost"` (decreases).
- **Serial items:** reconciles expected serials (status=available|reserved in the warehouse)
  vs scanned serials, computes missing and extra, then:
  - Missing → adjustment type `"Lost"` + serial status updated to `"defective"`.
  - Extra → adjustment type `"Found"` (StockAdjustmentsService inserts new available serial rows).
- Sets `stock_counts.status = "posted"` and writes `varianceValue` (sum of |variance_value|
  across all variance lines) to the header.
- Each `StockAdjustmentsService.create()` call fires:
  - `assertPeriodOpen` (period guard — uses `new Date()` wall clock).
  - Full ledger entry via `StockLedgerService`.
  - WAC update.
  - Outbox event → GL posting (DR Inventory Adjustment / CR Inventory Asset or vice versa).

## Step 5 — Cancel (`POST /tenant/stock-counts/:id/cancel`)

- Allowed from any status except `posted` or `cancelled`.
- Does NOT reverse any already-posted adjustments (cancel is only possible before posting).
- Sets status = `cancelled`. Ledger is unaffected.

## Blind mode

The `blindMode` boolean on the header (set at creation, immutable thereafter) hides
`system_qty` from the UI when true. The `GET /tenant/stock-counts/:id` response still
returns `systemQty` in the JSON — enforcement is purely a UI concern.
Source: schema `stock-counts.ts:65-66`.

## Recount flag

Individual lines carry a `recount` boolean (default false). This flag can be set during
the pending_review phase (presumably by a manager who wants specific lines re-verified).
However, **there is no service method or endpoint to reset a line's countedQty or transition
the count back to in_progress after submission**. The `recount` flag is data-only; its
presence does not change the approve-post behavior. A practical workaround is to cancel
the count and start fresh.
