# Chapter 05 — Adjustment & Reversal/Correction Path

## Adjustment document design

`packages/db/src/schema/inventory-adjustments.ts` — the `stock_adjustments` table is a
**document header only**. Per-item lines are `stock_ledger_entries` linked via
`sourceDocumentId = stock_adjustments.id` and `sourceDocumentType = 'adj'`. There is no
separate adjustment lines table.

## Business types and direction mapping

`packages/db/src/schema/enums.ts:284` — `stockAdjustmentType`:

| type | direction | typical use |
|---|---|---|
| `damaged` | decrease | write goods as damaged |
| `lost` | decrease | shrinkage / theft |
| `found` | increase | stock found (over-count) |
| `write_off` | decrease | expired / obsolete |
| `purchase_received` | increase | MVP stand-in before Purchase module |
| `opening_balance` | increase | onboarding seeding |
| `other` | explicit | director override |

Direction is derived from type for all except `other`.

## Posting path (`StockAdjustmentsService.create`)

`apps/api/src/inventory/stock-adjustments/stock-adjustments.service.ts:104`

1. **Fiscal period check** — `assertPeriodOpen()` — rejects hard-locked or soft-locked
   periods (no override on adjustments; override is a future feature).
2. **Document number reservation** — before entering the tx, to keep the tx short.
3. **Pack-unit resolution** — `resolveLineBaseQuantities()` — converts entered units to
   base units outside the tx.
4. **Inside one transaction:**
   - Negative-stock policy read inside tx (avoids TOCTOU).
   - `getLevelsForUpdate()` — ONE batched `SELECT FOR UPDATE` for all lines sorted by
     `itemId` (deadlock prevention). Prior version did one SELECT per line; fixed for
     large opening-balance imports (comment: ~25 min for 1.5k lines).
   - WAC math + ledger INSERTs via `recordMany()`.
   - Stock level `upsertInboundMany()`.
   - Serial row creation (if `serialNumbers` supplied on an increase line).
   - **Transactional outbox insert** — `inventory.adjustment.posted` JE payload.
5. **Post-commit:** negative-stock alerts, then accounting fast-path emit.

## Opening balance (special case)

`StockAdjustmentsService.createOpeningBalance`:

- `movementType = 'opening_balance'` (distinct from `adjustment_increase`).
- Allows backdated `occurredAt` (client-supplied).
- Does NOT emit `inventory.adjustment.posted` — the GL inventory value is posted once via
  `accounting.OpeningBalanceService` to avoid double-counting equity.

## Reversal / correction mechanism

**There is no `POST /stock-adjustments/:id/reverse` endpoint.**

The only correction path is a compensating entry: create a new adjustment in the opposite
direction for the same items and quantities. The ledger's `reversesEntryId` column
(Layer-0 addition) exists in the schema, but no service code populates it for
adjustment reversals.

**GAP (HIGH):** No formal reversal workflow for adjustments or any other movement type.
The `reversesEntryId` FK link is defined in the schema (`inventory-costing.ts:159`) but
is never written by any service. A stockkeeper cannot "reverse" a wrong adjustment; they
must know to create an equal-and-opposite manual entry. The audit trail shows two
unlinked entries with no indication one reverses the other. Drill-down from balance
to the reversing movement is broken.

This is the single most operationally dangerous gap in this layer.

## Idempotency on adjustments

`deterministicUuidV5(\`${itemId}:${movementType}\`, adjustmentId)` — unique per
(adjustment document, item, movementType). Re-submitting the same adjustment is a no-op
at the ledger level (duplicate eventId returns null from `record()`).

## SOUND vs RISKY

**SOUND:** Batched SELECT FOR UPDATE with deterministic lock ordering is correct for
high-cardinality opening imports. Transactional outbox + fast-path emit is the right
durable delivery pattern.

**RISKY:**
- No reversal endpoint or `reversesEntryId` population → audit trail is broken for
  corrections; `sle_reverses_entry_id_key` unique index is never exercised.
- `adjustment_decrease` posts at current WAC even if the goods being written off have a
  known specific cost (e.g. a specific expired batch). This may overstate or understate
  the write-off value.
- Soft-locked period override is TODO (hardcoded ConflictException) — a stock manager
  cannot post an emergency correction to a soft-locked period without unlocking it first.
