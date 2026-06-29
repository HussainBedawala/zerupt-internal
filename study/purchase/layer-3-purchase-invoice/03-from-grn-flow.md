# 03 — Bill-from-GRN Flow

This chapter traces the `fromGrn()` → `confirm()` lifecycle in detail.

## Pre-conditions for fromGrn()

| Check | Code location |
|-------|--------------|
| GRN exists | `assertGrnsBillable()` — line 1105 |
| GRN status = confirmed | line 1118 |
| All GRNs same supplier | line 1123 |
| `hasSupplierInvoice = false` | line 1128 (if true, GRN was matched at receipt — cannot bill from it via this path) |
| Supplier active | `requireActiveSupplier()` — line 982 |
| At least one billable line (remainder > 0) | line 249 |

## fromGrn() Transaction Steps

```
db.transaction():
  1. SELECT ... FROM grns FOR UPDATE (lock GRN rows)
  2. re-run assertGrnsBillable() on locked rows (TOCTOU guard)
  3. load grnLines + loadReturnedQtyByGrnLine()
  4. filter: remainder = receivedQty − returnedQty − billedQty > 0
  5. INSERT purchase_invoices (status=draft, number=DRAFT-UUID, sourceGrnIds=[...])
  6. INSERT purchase_invoice_lines per billable line:
       itemId, quantity=remainder, unitPrice=line.unitCost,
       discountAmount="0", warehouseId, taxGroupId, grnLineId=line.id
  7. recompute() — freeze tax totals
```

No event emitted from `fromGrn()`. The draft bill has no accounting impact.

## Draft Bill Properties

- `number` = `DRAFT-{UUID}` (placeholder; satisfies UNIQUE constraint)
- `sourceGrnIds` = JSON array of GRN ids (audit trail; not used for matching logic)
- `grnLineId` per line = the FK that drives 3-way match at confirm

## confirm() Transaction Steps

```
db.transaction():
  1. lockDraftBill() — FOR UPDATE on bill row, assert status=draft
  2. load lines (inside tx, prevents concurrent edit slip)
  3. assert ≥1 line with qty > 0
  4. recompute() with occurredAt = invoiceDate (freeze tax at bill date)
  5. applyGrnMatching() → returns accrualClearedAmount, increments billedQty
  6. compute dueDate = invoiceDate + supplier.paymentTermDays (default 30)
  7. UPDATE status=confirmed, number=PINV-NNNN, confirmedAt, confirmedBy, dueDate
  8. outbox.insert(purchase.invoice.confirmed, {accrualClearedAmount, ...})
```

PINV number reserved before the tx (`docNumbering.reserveNumber`); released on rollback, committed on success.

## Partial Billing

A GRN with 10 units can be billed in two bills of 5:

| Bill | billedQty before | billQty | billedQty after | remainder |
|------|-----------------|---------|-----------------|-----------|
| PINV-0001 | 0 | 5 | 5 | 5 |
| PINV-0002 | 5 | 5 | 10 | 0 |

`fromGrn()` always uses the current remainder. `assertGrnsBillable()` does NOT reject a partially-billed GRN (only fully-billed or with-supplier-invoice GRNs are rejected at pre-check level; partial is fine).

## Multiple Bills per GRN

Supported. Each bill confirm independently increments `billedQty` on the same GRN lines. The `FOR UPDATE` lock in `applyGrnMatching()` serialises concurrent confirms.

## Race: GRN Void vs Bill Confirm

Layer 2 GRN void emits `purchase.grn.voided` → listener CRs Inventory 1141 and DRs GRN Accrual 2121 (reverses the receipt JE). If a bill is being confirmed concurrently:

- `billedQty` is incremented inside the bill confirm transaction
- GRN void should check `billedQty = 0` before allowing void (REQUIRES — currently not enforced; voiding a billed GRN would leave a dangling 2121 debit with no matching credit)

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| fromGrn() from multiple GRNs (same supplier) | EXISTS |
| Partial billing (remainder tracking) | EXISTS |
| billedQty increment (atomic SQL) | EXISTS |
| TOCTOU guard (FOR UPDATE) at confirm | EXISTS |
| Return qty subtracted from remainder | EXISTS |
| Composable fromGrn (inside external tx) | EXISTS |
| GRN void blocked if billedQty > 0 | REQUIRES |
| Multiple bill lines from same GRN line | Partially (code aggregates qty per grnLineId — line 1041) |
