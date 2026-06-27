# 05 — Tracking Type: Master Data Driver of Layer-0 Enforcement

Source: `packages/db/src/schema/enums.ts` (itemTrackingType, line 323),
`packages/db/src/schema/inventory-items.ts` (items.tracking_type, line 164),
`apps/api/src/inventory/items/items.service.ts` (lines 481-514)

## What trackingType declares

`tracking_type` on `items` is the single master-data flag that tells the entire movement
engine HOW to handle stock identity for that item:

| Value | Meaning |
|-------|---------|
| `none` | Quantity-only tracking. No lot or unit identity. MVP default for all items. |
| `batch` | Units grouped into lots (auto-FIFO preferred; expiry/FEFO possible). Each movement must carry a `batch_id`. |
| `serial` | Each physical unit has a unique serial number. Each movement must carry a `serial_number_id` and |qty| = 1. |

## How it drives Layer 0

The stock ledger (Layer 0) has `batch_id` and `serial_number_id` as nullable columns on
`stock_ledger_entries`. Whether they are populated depends on `tracking_type`:

```
item.tracking_type = 'none'   →  batch_id = NULL, serial_number_id = NULL (OK)
item.tracking_type = 'batch'  →  batch_id must be set, serial_number_id = NULL
item.tracking_type = 'serial' →  serial_number_id must be set, batch_id = NULL, |qty| = 1
```

The Layer-0 hardening (branch `phase-3/layer-0-stock-ledger-hardening`) shipped the
chokepoint enforcement inside `decrementOutbound` / `recordMany`. Layer-2 movement callers
(adjustments, transfers, GRN receipt, POS/sales/purchase) are responsible for threading
`trackingType` and `batchId` / `serialId` at call time. That threading is the Layer 2 scope.

## The status of enforcement (as of Layer 0 merge)

- DB-level: `batch_id` and `serial_number_id` are nullable — no NOT NULL constraint
  (intentional: `none`-tracked items must be able to post without them).
- App-level: chokepoint guard inside the ledger service checks if tracking is required.
- **Not yet enforced on POS / sales / purchase confirm paths** — deferred to Layer 2.
- MVP: ALL items ship with `tracking_type = 'none'`. Batch/serial are real schema, zero ops.

## Changing trackingType mid-life

`items.service.ts` lines 481-484: the service detects a `trackingTypeChanged` condition when
an update changes `tracking_type`. It emits an event but does NOT block the change.

**Gap (G2 — also flagged in Ch01):**
Changing `tracking_type` from `batch` → `none` on an item with existing `item_batches` rows
or ledger entries carrying `batch_id` would silently corrupt the invariant. Future movements
would post without `batch_id`, making batch reconciliation impossible (Σ ledger WHERE batch_id
would no longer equal `item_batches.qty_remaining` for all batches).

The correct rule: once a batch or serial movement exists for an item, `tracking_type` is
immutable. The guard should be:
```
IF EXISTS (SELECT 1 FROM stock_ledger_entries WHERE item_id = $1 AND batch_id IS NOT NULL)
  THEN RAISE EXCEPTION 'Cannot change tracking_type: batch movements exist';
```

## Interaction with costing method

`tracking_type = 'batch'` naturally pairs with FIFO (FEFO = FIFO by expiry). However, the
current schema allows `tracking_type = 'batch'` + `valuation_method = 'wac'`. This is
technically valid (batch tracks identity, WAC tracks value at item level) but can confuse
operators who expect batch items to use FIFO. Consider whether to warn/restrict this
combination at the master-data level or leave it as a deliberate design choice.

## Interaction with serial tracking and specific-cost valuation

`tracking_type = 'serial'` → each unit has `acquisition_cost` on `item_serial_numbers`
(`serial-numbers.ts:73`). WAC pool is semantically wrong for serial items (a 2021 iPhone
and a 2024 iPhone in the same item pool should not blend costs). Specific-cost (FIFO by
serial) is the correct valuation for serial items. This is deferred to Layer 3 (valuation)
as noted in the hardening log.
