# Cross-Module Contracts

What each module needs from Purchase, and what Purchase needs from each module.

---

## Purchase → Inventory

### Purchase Needs from Inventory

| Need | Detail |
|------|--------|
| Item catalog | Items available for purchasing (name, SKU, barcodes, category) |
| Current stock levels | Show buyer what's low and needs ordering |
| Reorder suggestions | Items below reorder level with suggested quantities (see `inventory/09-reorder-engine.md`) |
| Warehouse list | Destination warehouses for GRN receiving |
| Serial/batch validation | Validate serial uniqueness, batch rules on GRN receipt |

### Inventory Needs from Purchase

| Event | What Inventory Does | Reference |
|-------|--------------------|----|
| `purchase.order.confirmed` | Increase `onOrder` qty for ordered items | `inventory/11-cross-module-contracts.md` |
| `purchase.order.cancelled` | Decrease `onOrder` qty | `inventory/11-cross-module-contracts.md` |
| `purchase.grn.confirmed` | GRN_RECEIPT movement: increase stock, create serial/batch records, recalculate cost, decrease `onOrder` | `inventory/05-stock-movements.md` → GRN Receipt |
| `purchase.return.confirmed` | PURCHASE_RETURN movement: decrease stock, update serial statuses, recalculate cost | `inventory/05-stock-movements.md` → Purchase Return |
| `purchase.landedCost.allocated` | Recalculate WAC/FIFO cost layers. Trigger retroactive COGS adjustment if items sold. | `inventory/04-cost-engine.md` → Landed Cost Impact |

---

## Purchase → Accounting

### Purchase Needs from Accounting

| Need | Detail |
|------|--------|
| Period validation | `validatePeriod(date)` before GRN confirm, return confirm, payment posting, landed cost posting (see `accounting/08-period-control.md`) |
| Account mapping | Which accounts to use per event type (see `accounting/06-account-mappings.md`) |
| Exchange rates | Rate lookup for multi-currency POs/payments (see `accounting/03-multi-currency.md`) |
| Tax calculation | Tax computation per `accounting/02-tax-model.md` |

### Accounting Needs from Purchase

| Event | What Accounting Does | Reference |
|-------|---------------------|----|
| `purchase.grn.confirmed` | DR Inventory / CR Trade Payables (or GRN Accrual) + Input Tax | `accounting/07-event-mappings.md` → Purchase Events |
| `purchase.landedCost.allocated` | DR Inventory / CR Payables or Bank or Accrual | `accounting/07-event-mappings.md` → Purchase Events |
| `purchase.return.confirmed` | DR Trade Payables / CR Inventory + Input Tax reversal | `accounting/07-event-mappings.md` → Purchase Events |
| `purchase.payment.posted` | DR Trade Payables / CR Bank/Cash + FX gain/loss | `accounting/07-event-mappings.md` → Purchase Events |

---

## Event Summary

All events Purchase **emits**:

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `purchase.order.confirmed` | PO Draft → Confirmed | Inventory |
| `purchase.order.cancelled` | PO Confirmed → Cancelled | Inventory |
| `purchase.grn.confirmed` | GRN Draft → Confirmed | Inventory, Accounting |
| `purchase.landedCost.allocated` | Landed Cost Draft → Posted | Inventory, Accounting |
| `purchase.return.confirmed` | Return Draft → Confirmed | Inventory, Accounting |
| `purchase.payment.posted` | Payment Draft → Posted | Accounting |

Purchase **listens to** no events from other modules. It reads data from Inventory (item catalog, stock levels, reorder suggestions) and Accounting (period status, exchange rates) via synchronous calls.

---

## Data Purchase Exposes (Read APIs)

| Endpoint Purpose | Consumers |
|-----------------|-----------|
| Supplier list/detail | Reports, Accounting |
| PO list/detail with status | Reports, Inventory (for on-order visibility) |
| GRN list/detail | Reports, Accounting (for AP aging) |
| Outstanding AP by supplier | Accounting, Reports |
| Purchase history by item | Inventory (for reorder engine), Reports |
