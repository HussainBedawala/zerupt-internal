# 03 — Immutability and Corrections (Compensating Entries)

## The principle

`stock_ledger_entries` is **append-only**. Once a row is written it is never changed and
never deleted. This is not a limitation — it is a design choice that makes the system
trustworthy.

Why? Because a stockkeeper (and the auditor, and the regulator) needs to be able to look
at any point in history and reconstruct exactly what happened. If rows can be updated or
deleted, history can be silently rewritten. With an append-only ledger:

- Every quantity that ever entered or left the warehouse is permanently recorded
- The on-hand at any past date can be reconstructed by summing ledger rows up to that date
- "Who made that change?" is always answerable
- An erroneous entry is corrected by **adding new rows that undo it**, not by editing the
  old row

This is identical to how the accounting general ledger works (Chapter 07 of the
accounting Layer 0 study).

## How the code enforces immutability

### No UPDATE or DELETE methods on `StockLedgerService`

`apps/api/src/inventory/stock-ledger.service.ts` exposes:
- `record()` — INSERT one row
- `recordMany()` — batched INSERT
- `findBySourceDocument()` — read
- `findByEventId()` — read

There is no `update()`, no `delete()`, no `softDelete()`. A future developer who reaches
for an update must add a new public method, which will be obvious in code review.

### No `updated_at` column

The schema intentionally omits `updated_at`. This signals to every future developer:
"this table does not support updates." If you see `updated_at` on this table, something
is wrong.

### `onDelete: 'restrict'` on all FK references

Foreign keys to `items`, `warehouses`, `legal_entities`, and `branches` all use
`{ onDelete: 'restrict' }`. This means you cannot delete the referenced entity if any
ledger row points to it. The ledger history is permanently anchored to those entities.

## Corrections: the compensating entry pattern

A compensating entry is a new ledger row that exactly reverses the effect of an incorrect
entry. It does not touch the original row.

### Example: wrong quantity on a sale

A cashier scans 10 units but only 5 were actually sold. The POS posts:

```
entry_1: quantity = -10, movement_type = 'sale', source_document = POS-0041
```

The error is discovered. To correct it:

```
entry_2: quantity = +10, movement_type = 'sale_return', source_document = ADJ-0005
          (reversal header; reason = "Correction: POS-0041 quantity error")
entry_3: quantity = -5,  movement_type = 'sale',        source_document = ADJ-0005
          (re-post at correct quantity)
```

Net effect: `−10 + 10 − 5 = −5`. The original error is visible in the audit trail
alongside the correction. Nothing was deleted.

### Example: wrong warehouse on a transfer

Transfer sent to warehouse A when it should have gone to warehouse B. The entries are:

```
entry_1: warehouse_id = A, quantity = -50, movement_type = 'transfer_out'
entry_2: warehouse_id = A, quantity = +50, movement_type = 'transfer_in'
```

To correct: post a reversal at warehouse A, then post correctly at warehouse B. The
reversal entries reference the original transfer as the source document (so the audit
chain is clear) but land as a new adjustment document.

## What the `stock_adjustments` table provides for corrections

`stock_adjustments` is the document header for user-initiated corrections. Its
`adjustment_type` enum includes the values `found`, `damaged`, `lost`, `write_off`,
`purchase_received`, `opening_balance`, and `other`. For corrections the most common are:
- `adjustment_increase` direction with reason "Correction: reversal of [doc number]"
- `adjustment_decrease` direction with reason explaining the write-down

The header carries `reason` (varchar 500, NOT NULL) — the stockkeeper is always required
to explain why an adjustment was made. This is the human-readable audit trail.

## Opening balance: a special case

The `opening_balance` movement type is a one-time seeding of initial stock during
onboarding. It is:
- Distinguishable from regular adjustments in reports (`movement_type = 'opening_balance'`
  filter makes reconciliation possible)
- The only case where the client supplies the `occurred_at` timestamp (backdating)
- Does NOT emit `inventory.adjustment.posted` — the GL opening balance is posted
  separately by the accounting `OpeningBalanceService`

This design is correct: the GL opening balance and the stock opening balance must be
coordinated at the period level, not at the line level.

## What the code does NOT enforce (gaps for the audit)

1. **No DB-level trigger to prevent UPDATE/DELETE.** Immutability is enforced only
   through the application layer (no service methods). A developer with direct DB access,
   or a future service that bypasses `StockLedgerService`, could UPDATE rows without any
   DB-level guard. The audit should consider whether a Postgres `RULE` or a row-level
   security policy denying `UPDATE` and `DELETE` on `stock_ledger_entries` is warranted.

2. **No reversal link column.** There is no `reverses_entry_id` column linking a
   compensating entry back to the original. The audit trail is implicit (source document
   ID of the correction document). If a future "show me the full correction chain" report
   is needed, this column would need to be added to the ledger or to the adjustment header.

3. **`recordMany()` skips per-row idempotency.** The batched insert path (used for
   opening balances) does not check for duplicate `event_id` values — it inserts all rows
   in one statement and any error rolls back the whole transaction. This is acceptable
   because opening balance imports are designed to be run once, but it is an inconsistency
   with the idempotent `record()` single-row path (Chapter 06 covers this further).
