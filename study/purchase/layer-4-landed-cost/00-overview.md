# Layer 4 — Landed Cost Allocation & Inventory Revaluation: Overview

**Scope:** Freight, customs, insurance, and other import charges allocated to received goods,
revaluing inventory WAC/FIFO cost layers retroactively.

---

## What Is a Landed Cost?

A landed cost document (LC) captures additional charges incurred to bring goods to their
destination. It targets one or more already-confirmed GRNs and allocates each charge across
GRN lines, increasing the effective unit cost of the received items.

---

## Document Model (EXISTS)

| Entity | Table | File:line |
|--------|-------|-----------|
| Header | `landed_costs` | `packages/db/src/schema/purchase.ts:1152` |
| Charge lines | `landed_cost_components` | `purchase.ts:1226` |
| Per-line allocations | `landed_cost_allocations` | `purchase.ts:1277` |

### Header fields

| Field | Detail |
|-------|--------|
| `number` | `DRAFT-<uuid>` until posted; then `LC-NNNN` (gapless per tenant) |
| `status` | `draft` → `posted` (terminal) |
| `targetGrnIds` | JSONB `uuid[]` — confirmed GRNs this LC covers |
| `currency` / `exchangeRate` | Forward-compat; FX multi-currency deferred (see ch 05) |
| `branchId` | All target GRNs must belong to this branch (enforced at create) |

### State machine

```
Draft ──[ post ]──▶ Posted  (terminal)
```

No reversal state. Corrections via a NEW negative-amount LC (see ch 05).

---

## Lifecycle Summary

1. **Create** — pick targetGrnIds (all must be `confirmed`, same branch).
2. **Add components** — e.g. "Sea Freight 500", "Customs Duty 200". Each carries a credit type
   (`payable` / `bank` / `accrual`) and an allocation method.
3. **Post** — fiscal period validated; allocations computed per component; LC number assigned;
   two event streams fired:
   - `purchase.landedCost.allocated` → accounting GL (one JE per component)
   - `inventory.landed_cost.applied` (one per GRN line) → WAC/FIFO revaluation + COGS split

---

## Dual Path: GRN vs Direct Purchase Receipt

The spec (`04-landed-cost-allocation.md`) targets only GRN lines (`grnLineId`). Direct
purchase receipts (invoices without a PO/GRN flow) are **NOT supported** in the current
implementation — `requireConfirmedGrns` (`landed-costs.service.ts:648`) enforces `status =
'confirmed'` on the GRN table. There is no path to attach a landed cost to a sales invoice
or direct receipt.

**REQUIRES:** Clarify whether direct-purchase-receipt (bill-only flow) should ever accept a
landed cost. Currently blocked by GRN-only targeting.

---

## Key File Index

| File | Purpose |
|------|---------|
| `apps/api/src/purchase/landed-costs/landed-costs-allocation.math.ts` | Pure allocation math (all 4 methods) |
| `apps/api/src/purchase/landed-costs/landed-costs.service.ts` | Orchestration — create / addComponent / post |
| `apps/api/src/purchase/landed-costs/landed-costs.events.ts` | Event emission (accounting + inventory streams) |
| `apps/api/src/inventory/landed-cost.listener.ts` | Inventory revaluation handler |
| `apps/api/src/accounting-events/listeners/purchase-accounting.listener.ts:859` | GL posting listener |
| `packages/db/src/schema/purchase.ts:1152` | Schema: 3 tables |
| `agent-os/product/modules/purchase/04-landed-cost-allocation.md` | Design spec |
