# Chapter 03 — GL Posting

Two independent accounting event streams fire on LC post. They share the same parent `eventId`
but produce separate journal entries.

---

## Stream 1: `purchase.landedCost.allocated` → Purchase Accounting Listener

Handler: `purchase-accounting.listener.ts:859`
One JE **per component** (not per allocation line, not per LC).

### Journal Entry per Component

| Leg | Account | Code | Condition |
|-----|---------|------|-----------|
| DR | Inventory | 1141 | always |
| CR | Accounts Payable | 2111 | `creditAccountType = 'payable'` |
| CR | Bank | 1121 | `creditAccountType = 'bank'` |
| CR | Accrued Expenses (landed cost) | 2122 | `creditAccountType = 'accrual'` |

Amount: `component.amount` (the full component charge, not per-line allocated amounts).

### Party Tagging

When `creditAccountType = 'payable'` and `creditEntityId` is set, the CR leg carries
`partyType: 'supplier', partyId: creditEntityId` — i.e. the freight forwarder appears
in AP subledger (`purchase-accounting.listener.ts:917`).

For `bank` and `accrual`, no party is tagged (not a control account).

### Sub-EventId Derivation

Each component gets a deterministic sub-eventId:
```
subEventId = deterministicUuidV5(component.componentId, payload.eventId)
```
Ensures JE deduplication across retries without collision (`purchase-accounting.listener.ts:900`).

### Accrual Account Note

`accrual` maps to `landed_cost_accrual` line type → Accrued Expenses 2122 (distinct from
GRN accrual 2121 used at goods receipt). Comment at `purchase-accounting.listener.ts:888`.

---

## Stream 2: `inventory.landed_cost_adjustment` → Inventory JE (via outbox)

Handler: `landed-cost.listener.ts:262` (`buildLandedCostJePayload`)

This JE is built and inserted into the **outbox inside the revaluation transaction** (atomic
with WAC/FIFO update). It captures the cost split:

| Leg | `lineType` | Amount |
|-----|-----------|--------|
| DR | `cogs_adjustment` | `cogsAdjustment` (only if sold qty > 0) |
| DR | `inventory_uplift` | `inventoryUplift` (only if on-hand qty > 0) |
| CR | `landed_cost_payable` | `cogsAdjustment + inventoryUplift` |

**REQUIRES (GAP — critical):** The CR `landed_cost_payable` line type maps to an unknown account.
The code builds the payload but does not specify which GL account receives this credit. The
accounting listener for `inventory.landed_cost_adjustment` is presumably a separate listener
(or falls through to a generic JE handler) that must resolve `landed_cost_payable` to a
specific account code. This mapping is not visible in the studied files. Verify that the
account-mapping engine has a seeded mapping for `landed_cost_payable`.

**ALSO REQUIRES (GAP):** The inventory JE's credit side (`landed_cost_payable`) duplicates
the credit that Stream 1 already posts (`DR Inventory / CR AP or Accrual`). This could result
in **double-crediting** the liability. The design intent appears to be that Stream 2 records
only the cost-layer split (COGS vs inventory) while Stream 1 records the AP liability — but
the credit in Stream 2 (`landed_cost_payable`) must map to an offset/clearing account, not to
AP/Bank directly, or the liability is posted twice. This needs a review session.

---

## Freight Supplier AP (Separate Bill)

When `creditAccountType = 'payable'`, the freight forwarder's bill is a **separate AP entry**.
The landed cost document does NOT create a vendor bill automatically — the user must separately
create a purchase invoice for the freight supplier and match it against the landed cost
component. There is no auto-bill-creation or linkage UI currently (`REQUIRES`).

---

## Period Validation

Before posting, `FiscalPeriodService.validatePeriod` is called with the LC `documentDate`:
- `HardLocked` → blocked
- `SoftLocked` → requires `softLockOverrideReason` + acting-user authorization
- Soft-lock override propagates via `softLockOverride` field on the payload to all sub-JEs

(`service.ts:303`)
