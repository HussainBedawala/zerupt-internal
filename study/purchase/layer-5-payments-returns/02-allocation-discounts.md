# Allocation and Early-Payment Discounts

## Allocation Model

Allocations live in `supplier_payment_allocations`. Each row ties one payment to one bill.

```
supplier_payments (1)
  └── supplier_payment_allocations (*) → purchase_invoices
```

- Standard payment: allocations created at draft time, validated again at post under a row lock.
- Advance payment: no allocations at create/post; allocations added later via `allocateAdvance`.

## Over-Allocation Guards — Two Layers

| Layer | When | Guard |
|-------|------|-------|
| Pre-check (create) | `createStandard:line 174` | `allocatedAmount > bill.balance` → 422 |
| Global pre-check | `createStandard:line 186` | `Σ(alloc) + discount > Σ(outstanding)` → 422 |
| Re-check (post, under lock) | `post:line 529` | `allocatedAmount > bill.balance` → 422 (concurrency-safe) |

The pre-check is "best-effort" — the lock at post is the authoritative gate.

## Early-Payment Discount

### What it does

The discount amount reduces the bill balance beyond the cash paid. At post:
- `bill.balance -= (allocatedAmount + discountShare)`
- `bill.paidAmount += allocatedAmount` (cash only, not discount)

### `splitDiscount` algorithm (`service.ts:1070`)

```
Input: allocations[], headrooms[] (balance − allocatedAmount per bill), discount total
```

1. Distribute `discount` proportionally to each bill's `allocatedAmount` weight.
2. Cap each line's share at its headroom (prevents single bill over-settlement, M3).
3. Overflow from capped lines redistributes to remaining eligible lines.
4. Rounding dust assigned to first line with room → `Σ(shares) == discount` exactly.
5. Bounded: at most N iterations (each pass freezes ≥1 line).

### JE leg for discount

From `purchase-accounting.listener.ts:1219`:

```
CR 4810 Purchase Discount Income   [discountFunctional]
```

`discountFunctional` is valued at the **invoice rate**, not the payment rate (A-M2). See `supplier-payment-fx.ts:72` — `discountRaw += discountAmount × invoiceRate`.

## Advance Allocation Guardrails

File: `supplier-payments.service.ts:901-1035`

1. Lock advance row FOR UPDATE → sum existing allocations → compute `remainder`.
2. `requested > remainder` → 422 (over-advance guard).
3. `existingBillIds` — cannot allocate the same bill twice from one advance.
4. Each bill: FOR UPDATE lock, check `confirmed` status, check balance.
5. FX on application: `computeSupplierPaymentFx(fxInputs, advance.exchangeRate)`.
   - `fxInputs` always has `discountAmount: "0"` (advances carry no discount).

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| Partial allocation (multiple bills) | EXISTS |
| Per-line discount share with headroom cap | EXISTS |
| Rounding dust correction (exact sum) | EXISTS |
| Advance double-allocation guard | EXISTS |
| FIFO auto-allocation (auto-pick oldest bills) | REQUIRES |
| Discount only (no cash payment, e.g. credit note offset) | REQUIRES |
| Allocation to purchase returns as credit offsets | REQUIRES — spec `06-supplier-payments.md:33` mentions `sourceDocumentType: PurchaseReturn` but allocation rows are bill-only |
