# Purchase Returns / Debit Notes

## Overview

A purchase return reverses a prior GRN receipt: stock leaves the warehouse back to the supplier, and the AP balance is reduced. A return can also arise after billing (the AP was already settled via a bill — the debit note reduces the next invoice or triggers a cash refund).

## State Machine

```
Draft → Confirmed
```

No cancel/void endpoint. The spec note (`05-purchase-returns.md:48`) says "no reversal — if incorrect, create a new GRN to re-receive." This is a **REQUIRES** gap for the correction flow.

## Create

File: `purchase-returns.service.ts:136-187`

- Supplier must be `active`.
- Currency derived from `branch → legalEntity.functionalCurrency`.
- Header created with status `draft`, number `DRAFT-<uuid>`.

## Add Line

File: `purchase-returns.service.ts:192-275`

Key rules:
1. `requireConfirmedGrnLine` — GRN line must exist AND parent GRN must be `confirmed`.
2. `unitCost`: defaults to `grnLine.unitCost` (original receipt cost → correct inventory valuation).
3. `unitPrice`: defaults to `grnLine.unitCost` — this drives the AP debit + input-tax reversal leg.
4. Pack-unit conversion: resolves BASE quantity via `resolvePackUnit`.
5. Serial-number count guard: if item is serial-tracked and `serialNumbers` provided, count must equal base returnQty.
6. After insert: `recompute(tx, taxCalc, tenantId, returnDoc)` — re-freezes per-line tax + header totals.

## Confirm

File: `purchase-returns.service.ts:344-504`

### Guards (in order)

| Guard | File:line |
|-------|-----------|
| Status must be `draft` | `service.ts:352` |
| PIN approval (always required) | `service.ts:356-361` |
| HardLocked period → 422 | `service.ts:374` |
| SoftLocked period → require override reason | `service.ts:378` |
| Lines must exist (≥1) | `service.ts:414` |
| Serial completeness per tracked line | `service.ts:419` |
| Over-return guard (cumulative ≤ GRN receivedQty) | `service.ts:424` |

### Over-Return Guard (`checkOverReturnAndLockGrns`, `service.ts:648`)

```
sum(confirmed PR lines for grnLineId) + this PR's returnQty ≤ grnLine.receivedQty
```

Parent GRN rows locked FOR UPDATE — closes race against concurrent PR confirmations on the same GRN lines.

### Confirm Transaction Contents

1. Lock PR row FOR UPDATE.
2. Load lines + validate serials.
3. `checkOverReturnAndLockGrns`.
4. `recompute` → freeze per-line tax anchored to `returnDate`.
5. UPDATE PR status → `confirmed`, assign PR number.
6. `applyReturnedQty` — updates PO line `returnedQty += returnQty` via GRN line → PO line chain. Triggers `reevaluateOrderStatus` (a return can reopen a `received` PO to `partially_received`).
7. `releaseSerialNumbersToSupplier` — transitions serial numbers `available → returned` atomically inside tx.
8. Post-commit: `emitReturnConfirmed` with full payload.

## AP JE (Two-JE Clearing Flow)

This listener owns the **AP-side JE** only. The **inventory-relief JE** is owned by the inventory engine (`inventory.purchase_return` movement).

### AP-side JE (listener.ts:989, `handleReturnConfirmed`)

```
DR 2111 Trade Payables    [debitPayableTotal]     ← matched-GRN lines (supplier-tagged)
DR 2121 GRN Accrual       [debitAccrualTotal]     ← accrual-only GRN lines (H4)
CR 1192 PR Clearing       [inventoryCredit]       ← document cost basis (Σ qty × unitCost)
+/- 5210 PPV              [priceVariance]         ← price-net − document cost (H3)
CR 1162 Input Tax         [per tax line]          ← input-tax reversal
```

### Inventory-side JE (engine)

```
DR 1192 PR Clearing       [inventoryCredit]       ← same document cost basis
CR 1141 Inventory         [WAC × returnQty]       ← at authoritative WAC
+/- variance leg          [WAC − document cost]
```

The 1192 clearing account nets to zero across both JEs. This prevents the AP-side from owning the inventory relief leg (avoids double-posting with the engine).

### H4 — Source-GRN Split

The AP debit must reverse the SAME control account the receipt originally credited. As originally
written, the split (`resolveMatchedFractionByLineId`) scored this from `grn_lines.billed_qty`
alone, which is a defect: a bill-matched receipt (see below) never accrues `billed_qty`, so it
always scored 0 = "fully accrual" and debited 2121 — an account the receipt never credited. 2121
went negative, 2111 stayed credited forever, and the input tax the receipt claimed was never
reversed.

**Fixed.** The split now asks two questions in order:
1. Which control account did the receipt actually credit? (`has_supplier_invoice`, the same
   question `resolveGrnCounterpartLeg` answers for confirm/void/cost-correction.)
2. Only on the accrual path, how much has since been billed? (`billed_qty` — never the flag.)

So:
- `hasSupplierInvoice = true` (bill-matched GRN) → receipt credited 2111 directly → return debits 2111.
- `hasSupplierInvoice = false` (accrual GRN) → receipt credited 2121; the billed portion has since
  moved to 2111 via the bill → return splits the debit across 2121 (unbilled) and 2111 (billed) by
  `billed_qty`.

Regression test: `EDGE 10c` in `purchase-returns.service.spec.ts`. Resolved in
`resolveGrnInvoiceFlags` (`service.ts:796`) after confirm, passed in the event payload.

## Dual Path

| Path | Return linked to |
|------|-----------------|
| PO-chain | GRN line from a PO-linked GRN |
| Direct purchase | GRN line from a direct-purchase GRN (no PO line linkage; `applyReturnedQty` skips PO update at `service.ts:759`) |

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| Partial return (qty < GRN receivedQty) | EXISTS |
| Over-return guard (cumulative + lock) | EXISTS |
| Serial release to supplier | EXISTS |
| Pack-unit quantity handling | EXISTS |
| Two-JE clearing flow (1192) | EXISTS |
| H4 AP/accrual split | EXISTS |
| Return after bill posted (debit note against billed invoice) | EXISTS — unitPrice drives the AP leg regardless of billing state |
| Return cancellation / void | REQUIRES |
| Return against direct-purchase (no GRN) | REQUIRES — schema requires grnLineId (notNull) |
| Credit note allocation (return offsets future bill) | REQUIRES — no allocation of PR credit against a bill balance |
