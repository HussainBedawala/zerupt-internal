# 08 — Revaluation, Write-Down, and NRV

## IAS 2 requirement

IAS 2.9: inventory must be measured at the LOWER of cost and Net Realisable Value (NRV).
NRV = estimated selling price − estimated costs to complete and sell.

If NRV < WAC, the inventory must be written down to NRV. The write-down is an expense in the
period, and the reduced cost becomes the new carrying amount for subsequent periods.
Write-downs cannot be reversed to above original cost (IAS 2.33 — only reversed if NRV
subsequently rises, but not above original cost).

## Current implementation: NONE

There is no write-down or NRV adjustment feature in the current codebase. A search of
`apps/api/src/inventory/` confirms no service, controller, or ledger movement type for:
- `write_down`, `nrv_adjustment`, `revaluation`
- No `write_down` in `stockMovementType` enum

A stockkeeper cannot record an NRV write-down. A manual workaround exists: an
`adjustment_decrease` movement reduces quantity and COGS absorbs it, but this is a QUANTITY
correction, not a COST/VALUE correction. The on-hand value would remain at original WAC for
the remaining units.

GAP severity: HIGH for any tenant holding perishables, seasonal goods, or slow-moving
inventory that falls below cost. Without NRV write-downs, the inventory asset on the balance
sheet may be overstated in violation of IAS 2.

## What a correct implementation requires

1. New `stockMovementType` value: `write_down` (or `nrv_adjustment`).
2. A service method: `StockAdjustmentsService.writeDown(itemId, warehouseId, newUnitValue)`.
   - `newUnitValue < currentWac` — validation enforced.
   - Ledger entry: `quantity = 0, unitCost = (currentWac - newUnitValue), totalCost = onHand × (currentWac - newUnitValue)`.
   - Update `materialized_stock_levels.averageCost = newUnitValue`, `totalValue = onHand × newUnitValue`.
   - JE: `DR Inventory Write-Down Expense / CR Inventory (1141)` for the total write-down amount.
3. Outbox-backed JE (same pattern as landed cost, but correctly using outbox).
4. The `item_costing_configs` or items table may carry a `nrvOverride` for the period.
5. Reversal policy: if NRV recovers, partial write-up up to ORIGINAL cost only (IAS 2.33).

## Revaluation for error correction

A related use case: an item was received at the wrong cost (e.g., data entry error on GRN).
Current mechanism: reversal (Layer 2c). The GRN is reversed and re-posted at the correct cost.
This is the CORRECT approach — do not modify historical data, use compensating entries.
The reversal + re-post correctly adjusts the WAC pool. No direct revaluation needed for
error correction. The reversal mechanism is sound.

## Write-down vs adjustment_decrease

An `adjustment_decrease` removes QUANTITY. A write-down removes VALUE on remaining units.
They are different: a write-down does not change on-hand quantity; it changes the per-unit
cost basis. Stockkeepers who use `adjustment_decrease` to "absorb" shrinkage and waste
are using the quantity mechanism, which is correct for physical loss. Write-downs are
specifically for NRV impairment on goods still held.

## GAP — no write-down movement type, no NRV tracking

For the audit: confirm the `stockMovementType` enum (`enums.ts`) contains no write-down
variant. Confirmed by codemap — the movement types are:
`grn_receipt, sale, sale_return, purchase_return, adjustment_increase, adjustment_decrease,
transfer_in, transfer_out, assembly_in, assembly_out, opening_balance, landed_cost_adjustment`.
No write-down type exists.

This is a functional gap that will become a compliance gap for any MENA tenant subject to IFRS
financial reporting with perishable or seasonal inventory. To be flagged as a Layer 3 open
question for the founder decision (build vs defer to post-MVP).
