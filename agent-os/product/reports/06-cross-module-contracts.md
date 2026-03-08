# Cross-Module Contracts

Reports is a read-only module. It queries data from all other modules. It never writes data or emits events.

---

## Reports Reads from Inventory

Source: `inventory/11-cross-module-contracts.md` → Data Inventory Exposes.

| Data | Purpose |
|------|---------|
| Item catalog (name, SKU, barcodes, category, attributes, cost) | Item-level reporting, product analytics |
| Stock levels (by item × warehouse) | Stock Valuation, Reorder Report |
| Item categories (tree) | Category-based grouping and filtering |
| Inventory valuation (WAC/FIFO totals) | Stock Valuation report, Balance Sheet reconciliation |
| Stock movement history (by item or warehouse) | Inventory Movement History report |
| Reorder suggestions | Reorder Report |

Cost data from `inventory/04-cost-engine.md` — WAC default, FIFO for batch-tracked items.

---

## Reports Reads from Sales

Source: `sales/07-cross-module-contracts.md` → Data Sales Exposes.

| Data | Purpose |
|------|---------|
| Customer list/detail | Customer-based filtering and grouping |
| Quotation list/detail | Quotation conversion reporting |
| SO list/detail with status | Order fulfillment reporting |
| Invoice list/detail | Sales reporting, Top Sellers, Daily Sales Summary |
| Outstanding AR by customer | AR Aging report |
| Sales history by item | Top Sellers, Slow Movers |

---

## Reports Reads from Purchase

Source: `purchase/07-cross-module-contracts.md` → Data Purchase Exposes.

| Data | Purpose |
|------|---------|
| Supplier list/detail | Supplier-based filtering and grouping |
| PO list/detail with status | Purchase order reporting |
| GRN list/detail | Receiving reporting, landed cost analysis |
| Outstanding AP by supplier | AP Aging report |
| Purchase history by item | Purchase analytics, cost trending |

---

## Reports Reads from POS

POS does not expose dedicated read APIs. Reports queries POS data directly from the tenant's dedicated database tables.

| Data | Purpose |
|------|---------|
| Transaction records (lines, payments) | Daily Sales Summary, sales analytics |
| Shift summaries (sales totals, payment breakdown, cash count) | Shift reporting, cash management |
| Return records | Return analysis |

---

## Reports Reads from Accounting

| Data | Purpose |
|------|---------|
| Journal entries with lines | Cash Flow, custom GL reports |
| GL balances by account × period | Trial Balance, P&L, Balance Sheet |
| Chart of Accounts structure | Financial report grouping (see `accounting/04-chart-of-accounts.md`) |
| Fiscal year/period definitions | Period filtering, fiscal year boundaries (see `accounting/08-period-control.md`) |
| Tax codes and rates | VAT Return Data report |

---

## Events

### Events Reports Emits

None. Reports is a read-only module.

### Events Reports Listens To

None. Reports queries data on demand via synchronous reads and pre-aggregated snapshots.

---

## Permission Enforcement on Reads

| Rule | Detail |
|------|--------|
| Tenant isolation | Query executes against the tenant's dedicated database. Cross-tenant data is architecturally impossible. |
| Branch filtering | Applied at application level based on user's allowed branches |
| Field stripping | Sensitive fields (cost, margin, profit) removed if user lacks permission keys |
| Entity blocking | Entire entities blocked if user lacks module-level access |

See `07-permissions.md` for permission keys. See `04-query-engine.md` for enforcement details.
