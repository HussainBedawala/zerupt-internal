# Layer 1 — Procurement Intake: Overview

**Scope:** Order intent / intake layer only. GRN receipt mechanics = Layer 2. Invoice/AP = Layer 3.

---

## Two Paths Into Inventory

```
PO PATH (formal procurement)
  User → Draft PO → Confirm PO → GRN → Bill → Payment

DIRECT-PURCHASE PATH (express, inventory-only shopkeeper)
  User → ONE FORM → [hidden DP PO → GRN → Bill] → (optional payment) in one tx
```

Both paths share the same underlying tables and accounting machinery.
The difference is orchestration and user experience, not separate engines.

---

## Documents Created Per Path

| Step | PO Path | Direct Purchase Path |
|------|---------|----------------------|
| Intake anchor | `purchase_orders` (sourceType=manual) | `direct_purchases` anchor + `purchase_orders` (sourceType=direct_purchase, hidden) |
| Receipt | `grns` (user-created separately) | `grns` (auto-created, auto-confirmed in same tx) |
| Bill | `purchase_invoices` (user-created separately or from GRN) | `purchase_invoices` (auto-created from GRN, auto-confirmed) |
| Payment | `supplier_payments` (optional, separate step) | `supplier_payments` (optional, same tx if settlement=paid) |

---

## Files Covered in This Layer

| Chapter | File |
|---------|------|
| 01-po-state-machine.md | PO lifecycle + transitions |
| 02-po-line-schema.md | Line fields, UOM, receivedQty tracking |
| 03-direct-purchase-path.md | Express flow mechanics |
| 04-dual-path-comparison.md | Side-by-side |
| 05-approval-sod.md | Approval threshold + segregation of duties |
| 06-frontend.md | Web UI per path |

---

## Key Source Files

| What | Path |
|------|------|
| Schema | `erp/packages/db/src/schema/purchase.ts` |
| PO service | `erp/apps/api/src/purchase/orders/purchase-orders.service.ts` |
| Direct purchase service | `erp/apps/api/src/purchase/direct/direct-purchase.service.ts` |
| Direct purchase panel | `erp/apps/web/src/features/purchase/components/direct/direct-purchase-panel.tsx` |
| Spec | `agent-os/product/modules/purchase/02-purchase-order-lifecycle.md` |
| Cross-module contracts | `agent-os/product/modules/purchase/07-cross-module-contracts.md` |
