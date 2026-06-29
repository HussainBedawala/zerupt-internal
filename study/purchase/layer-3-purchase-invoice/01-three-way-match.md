# 01 — Three-Way Match: PO ↔ GRN ↔ Invoice

Three-way match is the default purchase flow. A bill built from one or more GRNs carries `grnLineId` on each line, which drives:
1. Quantity validation (billedQty ≤ unbilled remainder)
2. Price lock (GRN cost is frozen — no override allowed)
3. GR/IR clearing at confirm (debit 2121 instead of 1141)

## Match Mechanics

### Quantity Match

```
unbilledRemainder = receivedQty − confirmedReturnedQty − billedQty   (clamped ≥ 0)
```

- Computed in `unbilledRemainder()` — `purchase-invoices.service.ts:1164`
- `returnedQty` = SUM of `purchaseReturnLines.returnQty` WHERE `purchaseReturns.status = 'confirmed'` (only confirmed returns reduce billable qty — `loadReturnedQtyByGrnLine`, line 1174)
- At `updateLine()` the limit is enforced: `input.quantity > remainder → 422` (line 441)
- At `confirm()` in `applyGrnMatching()` the GRN line is locked `FOR UPDATE` and re-validated (TOCTOU safe) (line 1028)

### Price Match

| Situation | Behaviour |
|-----------|-----------|
| GRN-linked line | `unitPrice` frozen to `grnLine.unitCost`; update attempt → 422 (line 413) |
| Discount on GRN line | Blocked; would strand difference in 2121 (line 417) |
| Manual line | `unitPrice` freely editable |

Price variance between PO price and actual bill price is NOT tracked in Layer 3 (it surfaces only on purchase returns via `priceVariance`). The GRN cost itself is whatever was entered at receipt.

### Quantity Variance

There is no tolerance check at billing time — the only quantity constraint is `billedQty ≤ unbilled remainder`. Over-billing is blocked; under-billing (partial bill) is allowed.

## billedQty Increment

Inside `applyGrnMatching()` (line 1028):

```
FOR UPDATE grn_lines WHERE id = grnLineId
  → validate billedQty + thisBillQty ≤ remainder
  → UPDATE grnLines SET billedQty += billQty   (atomic SQL expression, line 1081)
```

This is the single authoritative write. Concurrent bills hitting the same GRN line are serialised by the `FOR UPDATE` lock.

## accrualClearedAmount

```
accrualCleared = Σ (line.quantity × line.unitPrice − line.discountAmount)  [excl tax]
```

Computed for all GRN-linked lines on the bill. Passed in the `purchase.invoice.confirmed` event payload. The listener uses it to split:

```
inventoryAmount = accrualClearedAmount + inventoryRemainder
```

- `accrualClearedAmount > 0` → DR GRN Accrual 2121 (clears Layer 2 credit)
- `inventoryRemainder > 0` → DR Inventory 1141 (unmatched / manual lines)

## TOCTOU Race

Two concurrent calls to `fromGrn()` or `confirm()` against the same GRN:
- Pre-check is unlocked (fast rejection)
- Authoritative check runs inside `db.transaction()` with `.for("update")` on GRN rows
- Second caller will see `billedQty` already incremented, gets 422 "quantity exceeds unbilled remainder"

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| Quantity match (billedQty guard) | EXISTS |
| Price lock on GRN-linked lines | EXISTS |
| Discount lock on GRN-linked lines | EXISTS |
| accrualClearedAmount split | EXISTS |
| `FOR UPDATE` TOCTOU guard | EXISTS |
| Return qty subtracted from remainder | EXISTS |
| Price variance tracking at billing | REQUIRES (no PO-price vs bill-price check) |
| Invoice tolerance (e.g. ±2%) | REQUIRES (only qty tolerance exists at GRN, not at billing) |
