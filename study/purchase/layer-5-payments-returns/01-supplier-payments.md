# Supplier Payments: State Machine and Lifecycle

## State Machine

```
Draft → Posted
```

No reversal endpoint exists. The spec (`06-supplier-payments.md:97`) says "corrections via a new reversing payment document" — this is a **REQUIRES** gap (no reverse API).

## Payment Types

| Type | Allocations at create | Posted JE |
|------|----------------------|-----------|
| `standard` | Required (≥1 bill) | DR 2111 / CR cash-bank + discount + fx plug |
| `advance` | None (created without bills) | DR 1161 Supplier Prepayments / CR cash-bank |

## Create — Validation Sequence

File: `supplier-payments.service.ts:114-351`

1. `requireActiveSupplier` — supplier must be `active` (NotFoundException / 422).
2. `resolveBranchContext` — resolves `legalEntityId` + functional `currency` from branch → legal entity.
3. For `standard`: iterate allocations:
   - Bill must exist and belong to same supplier.
   - Bill must be `confirmed`.
   - `allocatedAmount ≤ bill.balance` (over-allocation guard — pre-check, re-validated at post under row lock).
4. `Σ(allocations) + discountAmount ≤ Σ(outstanding balances)` — global over-discount guard.
5. Insert draft payment + allocation rows in a transaction. Number is `DRAFT-<uuid>`.

## Post (Draft → Posted)

File: `supplier-payments.service.ts:355-644`

**Advance path (line 435):**
- UPDATE status = posted, assign PAY number.
- Outbox insert: `PURCHASE_EVENTS.PAYMENT_POSTED` with zero FX and totalAmount = cashFunctional.

**Standard path:**
1. Query allocations.
2. FOR UPDATE lock each bill — serializes concurrent payments against same bill.
3. Re-validate: bill must be `confirmed`, `allocatedAmount ≤ bill.balance` (under lock).
4. `splitDiscount` — distributes discount proportionally capped at each bill's headroom (line 1070).
5. `computeSupplierPaymentFx` — returns `cashFunctional`, `discountFunctional`, `fxGainLoss`.
6. Update each bill: `paidAmount += allocatedAmount`, `balance -= (allocated + discountShare)`.
7. UPDATE payment: status = posted, reserve PAY number via `DocNumberingService`.
8. Outbox insert: `PURCHASE_EVENTS.PAYMENT_POSTED`.
9. Post-commit: `emitPaymentPosted` fast-path.
10. Commit reservation.

## Advance Allocation (post-posting)

File: `supplier-payments.service.ts:844-1063`

Endpoint: allocate a posted advance against one or more confirmed bills.

Key rules:
- Only `advance` type, `posted` status.
- FOR UPDATE lock on advance row → sum existing allocations → compute remainder.
- No double-applying the same bill (existingBillIds guard, line 937).
- Each bill: FOR UPDATE lock, check balance.
- FX realized on application: `computeSupplierPaymentFx(fxInputs, advance.exchangeRate)`.
- Insert allocation rows, update bills.
- Outbox: `PURCHASE_EVENTS.PAYMENT_ADVANCE_APPLIED`.
- JE: DR 2111 (appliedTotal at bill rate) / CR 1161 (appliedTotal − fx) / FX plug.

## Composable Path

Direct Purchase uses `compose?: ComposeContext` to run create + post inside the orchestrating transaction. Two private variants: `createStandardComposed` and `postComposed`. Both carry the same math, reservation, and outbox logic but thread through `compose.tx` and push post-commit work to `compose.postCommit`.

## EXISTS vs REQUIRES

| Feature | Status | File:line |
|---------|--------|-----------|
| Draft create (standard + advance) | EXISTS | `service.ts:114` |
| Post standard with allocations | EXISTS | `service.ts:355` |
| Post advance (no allocation) | EXISTS | `service.ts:435` |
| Allocate advance to bills | EXISTS | `service.ts:844` |
| Maker-checker (per tenant setting) | EXISTS | `service.ts:1193` |
| Soft-lock override on post | EXISTS | `service.ts:396-411` |
| Payment reversal endpoint | REQUIRES | — |
| Cheque payment method | REQUIRES | enum in schema only has `cash`/`bank_transfer` |
| List filter by payment method | REQUIRES | `list()` has date/supplier/status filters only |
| FIFO auto-allocation (unallocated bills oldest-first) | REQUIRES | caller must supply allocation array |
