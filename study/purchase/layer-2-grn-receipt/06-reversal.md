# Chapter 6 — GRN Reversal and Cancel

## Spec Position

`agent-os/product/modules/purchase/03-goods-received-note.md:51`:
> "No reversal of GRN. Corrections via `05-purchase-returns.md`."

## What Exists

| Action | Status |
|--------|--------|
| Cancel a draft GRN | NOT BUILT. No `DELETE /grns/:id` or `status = cancelled` transition. |
| Void a confirmed GRN | NOT BUILT. The service has no cancel/void method. |
| Correct a confirmed GRN | Via Purchase Return (Layer 5) — the only supported path. |

## Why No Direct Reversal

Once confirmed, a GRN has:
1. Updated `purchaseOrderLines.receivedQty` (PO tracking).
2. Triggered a stock ledger credit (via `purchase.grn.confirmed` event → inventory engine).
3. Posted a GR/IR accrual or AP journal entry.

Reversing requires all three to unwind atomically, and the stock cost layers (WAC/FIFO) must be recomputed. The purchase return module owns this complexity.

## Purchase Return as the Reversal Path

A purchase return (Layer 5) references the original GRN and:
- Decrements `purchaseOrderLines.returnedQty` (makes the PO capacity available again).
- Emits `purchase.return.confirmed` → inventory engine posts `PURCHASE_RETURN` movement.
- Posts the accounting reversal JE via `handleReturnConfirmed`:

```
DR  Accounts Payable 2111     (debitPayableTotal — if original GRN was matched)
DR  GRN Accrual 2121          (debitAccrualTotal — if original GRN was accrual-only)
CR  Purchase Return Clearing 1192  (document cost basis)
+/- Purchase Price Variance 5210   (price-net vs document cost)
CR  Input Tax 1162 (per recoverable tax reversal)
```

`purchase-accounting.listener.ts:601–763`

The inventory engine posts a separate JE (`DR 1192 / CR 1141` at WAC + variance), clearing the 1192 transit account to zero across both JEs.

## Draft GRN "Reversal" (de-facto cancel)

A user can delete all lines from a draft GRN (via `removeLine`) and then leave it in draft. There is no formal cancel. The draft GRN accumulates with a `DRAFT-<uuid>` number indefinitely.

**Gap**: No draft-GRN cleanup mechanism or cancel endpoint. If a draft was created against a PO by mistake, the PO stays in `confirmed` status but has a dangling draft GRN. REQUIRES a draft-GRN delete / cancel endpoint.

## PO Status After a Full Return

When a purchase return returns all received goods, `reevaluateOrderStatus` is called (`grns.service.ts:1026`):

```
net(line) = receivedQty − returnedQty = 0 for all lines
→ PO status → "confirmed"  (reopened)
```

The PO can then receive goods again via a new GRN. The original confirmed GRN remains in the database (immutable audit record).

## Accounting State After Full Return (GR/IR Path)

| Step | JE |
|------|-----|
| GRN confirm | DR Inventory 1141 / CR GRN Accrual 2121 |
| Return confirm (before bill) | DR GRN Accrual 2121 / CR 1192 → inventory DR 1192 / CR 1141 |
| Net | Zero — as if the receipt never happened |

No bill was ever posted. The 2121 transit account closes to zero, inventory returns to prior balance.

## REQUIRES / Gaps

| Gap | Detail |
|-----|--------|
| Draft GRN cancel / delete endpoint | REQUIRES. No mechanism to abandon a draft GRN cleanly. |
| Partial-GRN-line reversal via return | Purchase return operates at line level — can return partial qty per line. EXISTS in Layer 5. |
| GRN cancel notification to PO | Not needed (draft GRN has no effect on PO status or stock). But REQUIRES for operator UX clarity. |
