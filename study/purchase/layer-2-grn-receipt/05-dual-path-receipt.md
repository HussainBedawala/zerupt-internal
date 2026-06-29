# Chapter 5 — Dual Path Receipt

## The Two Paths

| Aspect | Formal Path (PO → GRN) | Direct Purchase Path |
|--------|----------------------|---------------------|
| User intent | Receive against a pre-existing PO | Record a received purchase in one shot |
| Entry point | `POST /tenant/grns` (create draft) then `POST /tenant/grns/:id/confirm` | `POST /tenant/direct-purchases` |
| Underlying machinery | GrnsService alone | DirectPurchaseService orchestrates GrnsService + PurchaseInvoicesService + SupplierPaymentsService |
| PO | Exists prior; user selects it | Created internally (hidden, `sourceType: 'direct_purchase'`, `DP-<uuid>` placeholder number) |
| GRN | Explicitly created and confirmed by user | Created + confirmed inside the same transaction |
| Bill | Created separately (Layer 3) | Created from GRN and confirmed inside the same transaction |
| Payment | Optional, separate | Optional, created and posted inside the same transaction |
| `hasSupplierInvoice` on GRN | User-specified | Always `false` (accrual path; bill then clears 2121) |
| Document numbers | User sees GRN-XXXX and PO-XXXX | User sees only PINV-XXXX (GRN number is internal, PO is DP- placeholder) |

## Formal Path Flow

```
User creates PO (draft → confirmed)
          ↓
User creates GRN draft against PO
          ↓
User adds GRN lines (one per PO line, qty + cost)
          ↓
User confirms GRN
  → stock credited
  → accounting: DR Inventory / CR 2121 (or CR 2111 if matched)
  → PO status updated
```

Key: the user controls each step. Partial receipts are natural (multiple GRN confirms).

## Direct Purchase Path (Inventory-Only Shopkeeper)

File: `direct-purchase.service.ts:81–334`

Single `create()` call runs one outer DB transaction:

```
Step 1: Hidden PO INSERT (status = 'confirmed', sourceType = 'direct_purchase')
Step 2: Hidden GRN INSERT (draft, hasSupplierInvoice = false)
         + GRN lines INSERT
Step 3: grns.confirm() in composable mode (posts stock + accrual 2121)
Step 4: bills.fromGrn() — draft bill linked to GRN lines (composable)
Step 5: bills.confirm() (posts: DR 2121 / DR Input Tax / CR AP 2111) (composable)
Step 6: (if paid) payments.create() + payments.post() (composable)
Step 7: directPurchases anchor row INSERT (idempotency key, grnId, billId, paymentId)
COMMIT
Post-commit: drain postCommit callbacks (reservations + fast-path emits)
```

### Composable Pattern

`GrnsService.confirm` accepts an optional `compose: ComposeContext`:
- When provided, it runs inside the **caller's** transaction (`compose.tx`).
- Post-commit work (reservation commit + fast-path emit) is pushed to `compose.postCommit`.
- `DirectPurchaseService` drains `postCommit` after the outer transaction commits.

`grns.service.ts:325` (public confirm) vs `grns.service.ts:506` (confirmComposed private method).

### Key Accounting Net Result (Direct Purchase, no-payment path)

GRN confirm (step 3) posts:
```
DR  Inventory 1141    (grn.subtotal)
CR  GRN Accrual 2121  (creditTotal)
```

Bill confirm (step 5) posts:
```
DR  GRN Accrual 2121  (accrualClearedAmount = grn.subtotal)
DR  Input Tax 1162    (per tax leg)
CR  AP 2111           (payableTotal, supplier-tagged)
```

Net:
```
DR  Inventory 1141
DR  Input Tax 1162
CR  AP 2111
```

2121 nets to zero within the same request. The split through 2121 is not cosmetic: it is the same machinery as the formal path, guaranteeing no parallel accounting engine.

### Why `hasSupplierInvoice = false` on the Direct GRN

`direct-purchase.service.ts:219`:
> "The bill then clears 2121 + posts input tax + CR AP 2111. Net ledger equals the matched-receipt outcome AND yields a payable bill to settle (fromGrn requires an accrual GRN)."

If `hasSupplierInvoice = true` were used, the GRN confirm would immediately CR AP 2111 and DR Input Tax — but then bill confirm would try to debit 2121 (clearing) with zero `accrualClearedAmount`. The split avoids any double-posting risk.

### Approval Threshold Gate

`direct-purchase.service.ts:286`, inside the transaction:

> "When the tenant configures `po_approval_threshold` AND the total exceeds it, a DIFFERENT manager must authorise via their PIN."

This gate fires on `confirmedBill.total` (functional currency). If it fails, the **entire transaction rolls back** — stock, accrual, AP, and cash all uncommit. The gate is inside the tx for this reason (`direct-purchase.service.ts:284` DOC-1 comment).

### Idempotency

`direct_purchases.idempotency_key` is UNIQUE per tenant (`direct-purchase.service.ts:90`). A duplicate request (double-tap, network retry) returns the prior result immediately, no re-posting.

## REQUIRES / Gaps

| Gap | Detail |
|-----|--------|
| Direct Purchase edit/cancel | No update or cancel on a `direct_purchases` record. Correction via purchase return only. REQUIRES if operators need to undo an error. |
| Graduation to PO | The hidden PO exists in DB but has a `DP-` placeholder number and `sourceType = 'direct_purchase'`. A "graduate to formal PO" path is not built. REQUIRES if needed. |
| Multi-warehouse in Direct Purchase | All lines default to the branch's default warehouse; per-line override is supported via `line.warehouseId`. EXISTS but not prominently exposed in the UI. |
| FX on Direct Purchase | `FUNCTIONAL_EXCHANGE_RATE = "1"` hardcoded. `direct-purchase.service.ts:44`. Foreign-currency direct purchases not supported. REQUIRES for multi-currency tenants. |
