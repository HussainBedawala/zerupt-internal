# Chapter 5 — Approval & Segregation of Duties

---

## PO Approval Threshold

### How It Works

1. `tenant_identity.po_approval_threshold` (nullable decimal) stores the per-tenant threshold in functional currency.
2. On PO confirm (`purchase-orders.service.ts:315`), the service reads this value.
3. If `total > threshold` AND threshold is not null:
   - `approvedBy` (manager UUID) and `approvalPin` are required in the `ConfirmOrderInput`.
   - `PinVerificationService.verifyApproval()` is called with `requiredPermission: 'purchase.order.confirm'`.
   - If PIN fails → `UnprocessableEntityException`, transaction rolls back.
4. The approving manager must be a DIFFERENT user from the confirming user (SoD — the PIN verification service enforces this).

### Schema

| Column | Table | Notes |
|--------|-------|-------|
| `po_approval_threshold` | `tenant_identity` | Null = no gate |
| `approved_by` | `purchase_orders` | UUID of approving manager (null if no threshold) |
| `confirmed_by` | `purchase_orders` | UUID of user who confirmed the PO |

Source: `purchase.ts:678–679`, `purchase-orders.service.ts:360–374`.

### Guard Conditions

```
IF approvalThreshold IS NULL → no gate (any user can confirm)
IF total <= threshold → no gate
IF total > threshold:
  → require input.approvedBy + input.approvalPin
  → verifyApproval(actingUserId=userId, approvedBy=input.approvedBy, pin=..., requiredPermission='purchase.order.confirm')
  → the PIN service MUST enforce actingUser ≠ approvedBy (SoD)
```

---

## GRN Over-Receipt Approval

- `grns.approved_by` column exists (`purchase.ts:870`) with a TODO note.
- `grn_over_receipt_tolerance_percent` tenant setting is referenced in schema comments.
- **Status:** PinVerificationService for GRN over-receipt is NOT YET BUILT (same TODO comment as PO approval).

**REQUIRES:** GRN over-receipt tolerance gate must be implemented so a warehouse staff member cannot receive 200 units against a 100-unit PO without manager approval.

---

## Direct Purchase — No Approval Gate (Gap)

- The `DirectPurchaseService` has NO approval threshold check.
- A user can record a direct purchase of any amount without manager sign-off.
- This is a significant SoD gap for cash-rich retail environments.

**REQUIRES:** Direct purchase should apply the same `po_approval_threshold` gate (or a separate `direct_purchase_approval_threshold`). The trigger point is the `total` of the confirmed bill.

---

## Supplier Payment Approval

- `supplier_payments.approved_by` column exists (`purchase.ts:541`).
- Referenced in `SupplierPaymentsService.post()` but `PinVerificationService` integration is also marked TODO.
- Currently the `approvedBy` field is accepted on the DTO but PIN is not enforced.

**REQUIRES:** Payment posting gate must be activated before go-live. High-value outgoing payments without SoD are a fraud risk.

---

## Landed Cost Approval

- `landed_costs.approved_by` column exists (`purchase.ts:1113`).
- Spec says PIN required when any component uses manual allocation method.
- Also marked TODO.

---

## PinVerificationService — Current State

- `PinVerificationService` is imported and called in `purchase-orders.service.ts`.
- The service exists (injected at line 34) and is called for PO confirmation (line 368).
- For GRN, payment, and landed cost: columns exist but `verifyApproval()` calls are not yet wired.

**Summary table:**

| Gate | Column | Service wired? |
|------|--------|---------------|
| PO confirm | `purchase_orders.approved_by` | Yes |
| GRN over-receipt | `grns.approved_by` | TODO |
| Direct purchase | (none) | Missing entirely |
| Payment post | `supplier_payments.approved_by` | TODO |
| Landed cost post | `landed_costs.approved_by` | TODO |
