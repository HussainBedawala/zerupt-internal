# Purchase Returns

## Return Document Header

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `number` | string | Sequential: `PR-0001` |
| `grnId` | string | Linked GRN (required) |
| `purchaseOrderId` | string | From GRN |
| `supplierId` | string | From GRN |
| `branchId` | string | |
| `warehouseId` | string | Source warehouse |
| `status` | enum | `Draft`, `Confirmed` |
| `currency` | string | From GRN |
| `exchangeRate` | decimal | Rate at confirmation |
| `reason` | string | Required |
| `subtotal` | decimal | |
| `taxTotal` | decimal | |
| `total` | decimal | |
| `confirmedAt` | datetime | |
| `confirmedBy` | string | |
| `approvedBy` | string | Manager PIN |
| `createdAt` | datetime | |

## Return Line

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `purchaseReturnId` | string | |
| `grnLineId` | string | |
| `itemId` | string | |
| `returnQty` | decimal | |
| `unitCost` | decimal | Cost at which stock exits (from GRN receipt cost or current WAC) |
| `unitPrice` | decimal | Return price (from original PO/GRN) |
| `taxGroupId` | string | |
| `taxAmount` | decimal | |
| `lineTotal` | decimal | |
| `serialNumbers` | array | If serial-tracked |

---

## State Machine

```
Draft → Confirmed
```

No reversal of return document. If return was incorrect, create a new GRN to re-receive.

| Transition | Guard |
|-----------|-------|
| Draft → Confirmed | `validatePeriod(confirmedAt)` must return `OPEN` or `SOFT_LOCKED` (see `accounting/08-period-control.md`). At least one line with `returnQty > 0`. Manager PIN required (`approvedBy`). Return qty per line ≤ GRN received qty minus previously returned qty. |

---

## Partial Returns

- A GRN can have multiple return documents
- Each return line's `returnQty` validated against: `grnLine.receivedQty - sum(previousReturns.returnQty)`
- PO line `returnedQty` updated on confirmation

---

## Confirm Side Effects

On `Draft → Confirmed`:

1. Emit `purchase.return.confirmed` (see `08-event-mappings.md`)
2. Inventory: PURCHASE_RETURN movement (see `inventory/05-stock-movements.md` → Purchase Return)
3. Accounting: journal entry (see `accounting/07-event-mappings.md` → `purchase.return.confirmed`)
4. Update PO line `returnedQty` += return line `returnQty`
5. WAC recalculates (see `inventory/04-cost-engine.md`)

---

## Document Numbering

| Document | Default Prefix | Example |
|----------|---------------|---------|
| Purchase Return | `PR-` | `PR-0001` |

Sequential, no gaps. Prefix configurable per tenant.
