# Landed Cost Allocation

## Allocation Document

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `number` | string | Sequential: `LC-0001` |
| `status` | enum | `Draft`, `Posted` |
| `currency` | string | |
| `exchangeRate` | decimal | Rate at posting |
| `postedAt` | datetime | |
| `postedBy` | string | |
| `approvedBy` | string | Manager PIN if manual override used |
| `createdAt` | datetime | |

## Cost Components

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `landedCostId` | string | |
| `description` | string | Freight, Customs Duty, Insurance, Handling, etc. |
| `amount` | decimal | Total cost for this component |
| `creditAccountType` | enum | `Payable` (supplier), `Bank` (paid), `Accrual` (accrued) |
| `creditEntityId` | string | Supplier ID or bank account ID |

## Allocation Lines

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `landedCostId` | string | |
| `grnId` | string | Target GRN |
| `grnLineId` | string | Target GRN line |
| `itemId` | string | |
| `allocatedAmount` | decimal | Portion of cost allocated to this line |

---

## Allocation Methods

| Method | Formula |
|--------|---------|
| **By value** | `lineAllocation = componentAmount × (lineValue / totalValue)` |
| **By quantity** | `lineAllocation = componentAmount × (lineQty / totalQty)` |
| **By weight** | `lineAllocation = componentAmount × (lineWeight / totalWeight)` |
| **Manual** | User enters per-line amounts. Sum must equal component total. Requires manager PIN. |

Default method configurable per tenant. Each component can use a different method.

---

## State Machine

```
Draft → Posted
```

No reversal of allocation document. Corrections via a new negative allocation.

| Transition | Guard |
|-----------|-------|
| Draft → Posted | `validatePeriod(postedAt)` must return `OPEN` or `SOFT_LOCKED` (see `accounting/08-period-control.md`). All components fully allocated. If manual method used → manager PIN required. |

---

## Post Side Effects

On `Draft → Posted`:

1. Emit `purchase.landedCost.allocated` (see `08-event-mappings.md`)
2. Inventory: WAC recalculation or FIFO layer cost update (see `inventory/04-cost-engine.md` → Landed Cost Impact)
3. If items from target GRN(s) already sold → retroactive COGS adjustment (see `accounting/05-cogs-logic.md`)
4. Accounting: journal entry (see `accounting/07-event-mappings.md` → `purchase.landedCost.allocated`)

---

## Multi-GRN Allocation

A single landed cost document can span multiple GRNs. Each cost component is allocated across all included GRN lines using the chosen method.

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Landed Cost | `LC-` | `LC-0001` |

Sequential, no gaps. Prefix configurable per tenant.
