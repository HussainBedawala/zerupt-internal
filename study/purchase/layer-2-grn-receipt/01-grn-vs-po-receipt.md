# Chapter 1 — GRN vs PO: Receipt Mechanics

## Receivable PO Statuses

`grns.service.ts:125`
```ts
const RECEIVABLE_PO_STATUSES = ["confirmed", "partially_received"] as const;
```

A GRN can only be drafted against a PO in `confirmed` or `partially_received` status. `received`, `closed`, `cancelled` — all rejected with 422.

## GRN ↔ PO Relationship (many GRNs per PO)

| Dimension | Detail |
|-----------|--------|
| One PO → N GRNs | Allowed. Each GRN has its own `purchaseOrderId`. |
| One GRN → one PO | Each GRN is against exactly one PO (`purchaseOrderId NOT NULL`). |
| Multiple GRN lines → one PO line | Allowed. `purchaseOrderLineId` on grnLines is NOT unique. |
| PO auto-close | Spec says no auto-close. Status only goes to `received`; closing is manual. |

## Partial Receipt (multi-GRN against one PO)

- When GRN 1 confirms partially: PO line `receivedQty` incremented; PO → `partially_received`.
- GRN 2 can be drafted and confirmed against the same PO (still `confirmed` or `partially_received`).
- The over-receipt check uses the **current** `purchaseOrderLines.receivedQty` (already includes prior GRNs) at confirm time inside the locked transaction (`grns.service.ts:936-956`).

## Over-Receipt Logic

File: `grns.service.ts:919`

```
cumulative = poLine.receivedQty − poLine.returnedQty + thisGrnQty
allowed    = poLine.orderedQty × (1 + tolerancePercent / 100)
over       = cumulative > allowed
```

| Scenario | Guard |
|----------|-------|
| Within tolerance | Allowed, no extra step |
| Exceeds tolerance | Requires `approvedBy` + `approvalPin` (manager PIN, different user) |
| Hard over-receipt (no tolerance set) | `tolerance = 0`; exact match enforced unless manager PIN provided |

Tolerance source: `tenantIdentity.grnOverReceiptTolerancePercent` (nullable, NULL → 0). `grns.service.ts:1054`

Over-receipt is **net-aware**: `receivedQty − returnedQty` so purchase returns re-open the order capacity. `grns.service.ts:949`

## PO Status Transitions (driven by GRN confirm)

File: `grns.service.ts:988`

```
net(line) = receivedQty − returnedQty

all lines net ≥ orderedQty  → received
any line  net  > 0          → partially_received
no  line  net  > 0          → confirmed (reopen after return)
```

Only transitions from `confirmed / partially_received / received` — never touches `closed` or `cancelled`. Returns can drop a `received` PO back to `partially_received` or `confirmed`.

## Race Condition Prevention

`grns.service.ts:382–383` (confirm):
```ts
await this.lockDraftGrn(tx, tenantId, grnId);   // FOR UPDATE on grns
await this.lockOrder(tx, tenantId, grn.purchaseOrderId); // FOR UPDATE on purchaseOrders
```

Both locks acquired at the start of the confirm transaction. Two concurrent GRNs against the same PO serialize: the second waits, then re-reads the now-updated `receivedQty` for the over-receipt check.

## Concurrency Guard (guarded UPDATE)

`grns.service.ts:419–433`:
```ts
.update(grns)
.set({ status: "confirmed", ... })
.where(and(..., eq(grns.status, "draft")))
.returning()
// If !updated → ConflictException (race won by another session)
```

The `WHERE status = 'draft'` prevents double-confirm even if the row lock is not held in a caller.

## Fiscal Period Check

Before confirm, `fiscalPeriod.validatePeriod(receiptDate)` is called:

| Period Status | Action |
|---------------|--------|
| Open | Proceed |
| SoftLocked | Require `softLockOverrideReason`; authorize the actor |
| HardLocked | 422 — no posting |

`grns.service.ts:341–361`

## REQUIRES / Gaps

| Gap | Detail |
|-----|--------|
| Manual PO close | No endpoint or spec path to manually close a `received` PO. REQUIRES. |
| GRN draft expiry / cleanup | Draft GRNs accumulate forever; no TTL or cleanup job. REQUIRES. |
| Tolerance per-supplier | `grnOverReceiptTolerancePercent` is tenant-wide only. REQUIRES if per-supplier wanted. |
| Under-receipt warning | No warning when confirming partial quantities (e.g., 40 of 100 ordered). REQUIRES UX consideration. |
