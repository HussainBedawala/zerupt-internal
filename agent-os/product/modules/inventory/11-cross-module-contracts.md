# Cross-Module Contracts

What each module needs from Inventory, and what Inventory needs from each module.

---

## POS → Inventory

### POS Needs from Inventory

| Need | Detail |
|------|--------|
| Item catalog | Items with name, SKU, barcodes, images, prices, category, variant info |
| Price resolution | Given item + customer + branch + qty → final price (see `07-pricing-engine.md`) |
| Stock availability | Is this item in stock at this branch's default warehouse? |
| Barcode lookup | Scan → item (see `01-item-model.md` barcode resolution) |
| Serial picker | For serial items: list of available serials at this location |
| Category list | For POS product grid category tabs |
| Item search | Full-text search by name, SKU, barcode |

### Inventory Needs from POS

| Event | What Inventory Does |
|-------|-------------------|
| `pos.transaction.completed` | Decrease stock (SALE movement). Update serial statuses. |
| `pos.return.completed` | Increase stock (SALE_RETURN movement). Restore serial statuses. |

---

## Sales → Inventory

### Sales Needs from Inventory

| Need | Detail |
|------|--------|
| Item catalog | Same as POS |
| Price resolution | Same as POS, but may include customer-specific pricing |
| Stock by warehouse | Available stock per warehouse (user selects which warehouse to ship from) |
| Stock reservation | When sales order is confirmed, commit stock (increase committed qty) |
| Cost for COGS | Current WAC or FIFO cost per item (for COGS calculation on invoice confirm) |

### Inventory Needs from Sales

| Event | What Inventory Does |
|-------|-------------------|
| `sales.order.confirmed` | Increase committed qty for ordered items |
| `sales.order.cancelled` | Decrease committed qty |
| `sales.invoice.confirmed` | Decrease stock (SALE movement). Decrease committed qty. |
| `sales.creditNote.confirmed` | Increase stock (SALE_RETURN movement) if goods returned |

---

## Purchase → Inventory

### Purchase Needs from Inventory

| Need | Detail |
|------|--------|
| Item catalog | Items available for purchasing |
| Current stock levels | To show buyer what's low and needs ordering |
| Reorder suggestions | Items below reorder level with suggested quantities |
| Warehouse list | Where to receive goods (destination warehouse on GRN) |

### Inventory Needs from Purchase

| Event | What Inventory Does |
|-------|-------------------|
| `purchase.order.confirmed` | Increase onOrder qty for ordered items |
| `purchase.order.cancelled` | Decrease onOrder qty |
| `purchase.grn.confirmed` | Increase stock (GRN_RECEIPT). Decrease onOrder qty. Create serial/batch records. Recalculate cost. |
| `purchase.return.confirmed` | Decrease stock (PURCHASE_RETURN). Update serial statuses. Recalculate cost. |
| `purchase.landedCost.allocated` | Recalculate item costs. Trigger retroactive COGS adjustment if items sold. |

---

## Accounting → Inventory

### Accounting Needs from Inventory

| Need | Detail |
|------|--------|
| Item cost at time of movement | WAC or FIFO cost for the COGS journal entry amount |
| Inventory valuation total | For GL reconciliation (must match Inventory control account balance) |
| Movement data | Every stock movement with cost, for the accounting event payload |

### Inventory Needs from Accounting

| Need | Detail |
|------|--------|
| Period status | `validatePeriod(date)` — is the date in an open period? Block/warn if locked. |
| Account mapping | Which inventory account to use per warehouse/category/item |

---

## Event Summary

All events Inventory **emits** (consumed by Accounting Engine):

| Event | Trigger |
|-------|---------|
| `inventory.adjustment.posted` | Adjustment approved and posted |
| `inventory.transfer.completed` | Transfer sent or received |
| `inventory.consumption.posted` | Internal consumption posted |
| `inventory.assembly.completed` | Assembly/production completed |
| `inventory.disassembly.completed` | Disassembly completed |
| `inventory.count.approved` | Stock count variances approved |

All events Inventory **listens to** (from other modules):

| Event | Source | Inventory Action |
|-------|--------|-----------------|
| `pos.transaction.completed` | POS | Decrease stock, update serials |
| `pos.return.completed` | POS | Increase stock, restore serials |
| `sales.order.confirmed` | Sales | Increase committed qty |
| `sales.order.cancelled` | Sales | Decrease committed qty |
| `sales.invoice.confirmed` | Sales | Decrease stock, decrease committed |
| `sales.creditNote.confirmed` | Sales | Increase stock (if goods returned) |
| `purchase.order.confirmed` | Purchase | Increase onOrder qty |
| `purchase.order.cancelled` | Purchase | Decrease onOrder qty |
| `purchase.grn.confirmed` | Purchase | Increase stock, create serials/batches, recalculate cost |
| `purchase.return.confirmed` | Purchase | Decrease stock, recalculate cost |
| `purchase.landedCost.allocated` | Purchase | Recalculate cost, retroactive COGS adjustment |

---

## Data Inventory Exposes (Read APIs)

| Endpoint Purpose | Consumers |
|-----------------|-----------|
| Search items (name, SKU, barcode) | POS, Sales, Purchase |
| Get item detail (with stock, cost, prices) | All modules |
| Get stock level (by item × warehouse) | POS, Sales, Purchase, Reports |
| Get available serials (by item × warehouse) | POS, Sales |
| Get price for item (resolve hierarchy) | POS, Sales |
| Get item categories (tree) | POS, Sales, Reports |
| Get reorder suggestions | Purchase |
| Get inventory valuation | Accounting, Reports |
| Get stock movement history (by item or by warehouse) | Reports, Audit |
