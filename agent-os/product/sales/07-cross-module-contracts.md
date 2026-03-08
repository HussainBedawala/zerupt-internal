# Cross-Module Contracts

What each module needs from Sales, and what Sales needs from each module.

---

## Sales → Inventory

### Sales Needs from Inventory

| Need | Detail |
|------|--------|
| Item catalog | Items with name, SKU, barcodes, category, variant info |
| Price resolution | Given item + customer + branch + qty → final price (see `inventory/07-pricing-engine.md`) |
| Stock by warehouse | Available stock per warehouse (user selects which warehouse to ship from) |
| Stock reservation | On SO confirm, increase committed qty at specified warehouse |
| Cost for COGS | Current WAC or FIFO cost per item at invoice confirmation |
| Serial picker | For serial items: list of available serials at selected warehouse |
| Batch list | For batch items: available batches in FEFO order |

### Inventory Needs from Sales

| Event | What Inventory Does | Reference |
|-------|--------------------|----|
| `sales.order.confirmed` | Increase `committed` qty for ordered items | `inventory/11-cross-module-contracts.md` |
| `sales.order.cancelled` | Decrease `committed` qty | `inventory/11-cross-module-contracts.md` |
| `sales.invoice.confirmed` | SALE movement: decrease stock, decrease committed qty, update serial status | `inventory/05-stock-movements.md` → Sale |
| `sales.creditNote.confirmed` | SALE_RETURN movement: increase stock, restore serial status (if `GoodsReturn`) | `inventory/05-stock-movements.md` → Sale Return |

---

## Sales → Accounting

### Sales Needs from Accounting

| Need | Detail |
|------|--------|
| Period validation | `validatePeriod(date)` before invoice confirm, credit note confirm, receipt posting (see `accounting/08-period-control.md`) |
| Account mapping | Which accounts to use per event type (see `accounting/06-account-mappings.md`) |
| Exchange rates | Rate lookup for multi-currency invoices/payments (see `accounting/03-multi-currency.md`) |
| Tax calculation | Tax computation per `accounting/02-tax-model.md` |

### Accounting Needs from Sales

| Event | What Accounting Does | Reference |
|-------|---------------------|----|
| `sales.invoice.confirmed` | DR Trade Receivables / CR Product Sales + Output Tax. DR COGS / CR Inventory. | `accounting/07-event-mappings.md` → Sales Events |
| `sales.creditNote.confirmed` | DR Sales Returns + Output Tax / CR Trade Receivables. If GoodsReturn: DR Inventory / CR COGS. | `accounting/07-event-mappings.md` → Sales Events |
| `sales.receipt.posted` | DR Bank/Cash / CR Trade Receivables + FX gain/loss | `accounting/07-event-mappings.md` → Sales Events |

---

## Sales vs POS

| Aspect | Sales Module | POS Module |
|--------|-------------|-----------|
| Customer type | B2B (trade customers with credit terms) | B2C (walk-in, immediate payment) |
| Payment timing | After delivery (Accounts Receivable) | At point of sale (immediate) |
| Document flow | Quotation → SO → Invoice → Receipt | Cart → Payment → Receipt |
| Stock reservation | On SO confirm (committed qty) | None (deducted on completion) |
| Pricing | Customer-specific, price lists, negotiated | Standard retail, promotional |
| Returns | Credit notes linked to invoices | POS returns linked to transactions |

Both modules emit events to the same Accounting and Inventory engines.

---

## Event Summary

All events Sales **emits**:

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `sales.order.confirmed` | SO Draft → Confirmed | Inventory |
| `sales.order.cancelled` | SO Confirmed → Cancelled | Inventory |
| `sales.invoice.confirmed` | Invoice Draft → Confirmed | Inventory, Accounting |
| `sales.creditNote.confirmed` | Credit Note Draft → Confirmed | Inventory (if GoodsReturn), Accounting |
| `sales.receipt.posted` | Receipt Voucher Draft → Posted | Accounting |

Sales **listens to** no events from other modules. It reads data from Inventory (item catalog, stock levels, prices, costs) and Accounting (period status, exchange rates, tax) via synchronous calls.

---

## Data Sales Exposes (Read APIs)

| Endpoint Purpose | Consumers |
|-----------------|-----------|
| Customer list/detail | POS (customer lookup), Reports |
| Quotation list/detail | Reports |
| SO list/detail with status | Reports, Inventory (for committed visibility) |
| Invoice list/detail | Reports, Accounting (for AR aging) |
| Outstanding AR by customer | Accounting, Reports |
| Sales history by item | Inventory (for demand forecasting), Reports |
