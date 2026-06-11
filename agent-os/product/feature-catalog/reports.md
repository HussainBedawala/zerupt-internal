<!-- Feature catalog partition | Module: reports | Generated: 2026-06-11 | Source: as-built audit -->
# Reports — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

---

## Reports Index Grid

- **Status:** shipped
- **Description:** A landing page listing all available reports as a navigable grid, giving users a single entry point to every report in the system.
- **Who it's for:** All users with any report permission.
- **Constraints / notes:** Displays only reports the user has permission to access (permission-filtered via `report-registry.ts`). Routes live under `/reports/`.

---

## Trial Balance

- **Status:** shipped
- **Description:** Lists every GL account with its total debit and credit balances for a selected date range, fiscal period, or fiscal year — the foundational accounting sanity check.
- **Who it's for:** Accountant, owner.
- **Constraints / notes:** Requires exactly one of `fromDate+toDate`, `fiscalPeriodId`, or `fiscalYearId`. Routed under `/accounting/trial-balance`, not `/reports/`. Permission: `reports.financial.view`.

---

## General Ledger

- **Status:** shipped
- **Description:** Shows a paginated chronological history of every journal entry line posted to a specific account, including the running balance and opening balance.
- **Who it's for:** Accountant, owner.
- **Constraints / notes:** Scoped to a single account at a time; max 200 rows per page. Routed under `/accounting/general-ledger`. Permission: `reports.financial.view`.

---

## Profit & Loss (Income Statement)

- **Status:** shipped
- **Description:** Summarises Revenue, COGS, Gross Profit, Operating Expenses, and Net Profit for a chosen date range, broken down by COA category and sub-type.
- **Who it's for:** Owner, accountant.
- **Constraints / notes:** Date range capped at 400 days. Optionally scoped by legal entity. Permission: `reports.financial.view`.

---

## Balance Sheet

- **Status:** shipped
- **Description:** Presents the company's Assets, Liabilities, and Equity as of a chosen date — the standard snapshot of financial position.
- **Who it's for:** Owner, accountant.
- **Constraints / notes:** Cumulative — sums all posted periods up to and including the selected date. Permission: `reports.financial.view`.

---

## Cash Flow Statement

- **Status:** shipped
- **Description:** Shows cash movements across Operating, Investing, and Financing activities using the indirect method derived from journal entries.
- **Who it's for:** Owner, accountant.
- **Constraints / notes:** Date range capped at 400 days. Optionally scoped by legal entity. Permission: `reports.financial.view`.

---

## AR Aging

- **Status:** shipped
- **Description:** Buckets every customer's outstanding receivables into five age brackets (Current, 1–30, 31–60, 61–90, 90+ days past due) as of any chosen date.
- **Who it's for:** Owner, accountant, sales manager.
- **Constraints / notes:** Defaults to today if no `asOf` date supplied. Optionally filtered by branch. Permission: `reports.financial.view`.

---

## AP Aging

- **Status:** shipped
- **Description:** Buckets every supplier's outstanding payables into the same five age brackets, giving a clear view of what is owed and when payments are due.
- **Who it's for:** Owner, accountant, purchasing manager.
- **Constraints / notes:** Same bucket structure and filtering options as AR Aging. Permission: `reports.financial.view`.

---

## Tax Summary

- **Status:** shipped
- **Description:** Aggregates output tax amounts by tax code (VAT, GST, SST) for a given period, drawn from posted journal entry lines — ready to feed a VAT/GST return.
- **Who it's for:** Accountant, owner.
- **Constraints / notes:** Requires `legalEntityId`. Permission: `reports.tax.view`.

---

## Daily Sales

- **Status:** shipped
- **Description:** Displays a day-by-day sales summary merging POS transactions and sales invoices — showing invoice count, POS count, total sales, tax, and gross profit per day with zero-filled gaps.
- **Who it's for:** Owner, store manager, sales team.
- **Constraints / notes:** Optionally filtered by branch. Permission: `reports.sales.read`.

---

## Top Sellers

- **Status:** shipped
- **Description:** Ranks inventory items by net revenue or quantity sold for a period, net of credit notes, including margins and COGS — up to 100 items.
- **Who it's for:** Owner, store manager, buyer.
- **Constraints / notes:** Sort by `revenue` (default) or `quantity`. Cost/margin columns require `inventory.cost.view`. Permission: `reports.sales.read`.

---

## Stock Levels

- **Status:** shipped
- **Description:** Shows current on-hand quantity and WAC-based valuation for every item, filterable by warehouse and category.
- **Who it's for:** Warehouse manager, owner, accountant.
- **Constraints / notes:** Real-time on-hand from inventory ledger. Cost columns require `inventory.cost.view`. Permission: `reports.operational.view`.

---

## Inventory Valuation

- **Status:** shipped
- **Description:** Provides a detailed cost-layer breakdown of inventory value per item and warehouse, surfacing unit cost, total value, and valuation method (WAC).
- **Who it's for:** Owner, accountant, warehouse manager.
- **Constraints / notes:** Extends stock levels with cost-layer detail. Requires `inventory.cost.view` to see cost figures.

---

## Stock Movement Ledger

- **Status:** shipped
- **Description:** A chronological audit trail of every inventory movement (GRN, sale, adjustment, transfer, return) for an item, showing quantity in/out and running balance.
- **Who it's for:** Warehouse manager, auditor, owner.
- **Constraints / notes:** Filterable by item, warehouse, and date range. Complements the General Ledger for inventory reconciliation.

---

## CSV Export

- **Status:** shipped
- **Description:** Allows any report to be downloaded as a UTF-8 (with BOM) CSV file directly from the browser, with column headers translated to the user's active locale.
- **Who it's for:** All users with `reports.export` permission.
- **Constraints / notes:** Inline browser download (no server queue). Arabic headers output correctly via BOM encoding. Implemented in `features/reports/lib/csv-export.ts`.

---

## PDF Export

- **Status:** shipped
- **Description:** Renders any report as a formatted PDF ready for sharing or printing, with tenant branding, date range header, and page numbers.
- **Who it's for:** All users with `reports.export` permission.
- **Constraints / notes:** Client-side implementation exists (`features/reports/lib/pdf-export.ts`). RTL layout and Arabic font support specced; verify rendering fidelity before marketing as fully server-rendered branded PDF.

---

## Permission-Based Field and Entity Access (RBAC)

- **Status:** shipped
- **Description:** Every report endpoint is guarded by granular permission strings; cost/margin columns are stripped from results if the user lacks `inventory.cost.view`, and financial entities are blocked entirely without `reports.financial.view`.
- **Who it's for:** Owner (manages permissions), all users (subject to restrictions).
- **Constraints / notes:** Branch-level data isolation also enforced — users restricted to a branch set only see data for their branches. Owner always bypasses all restrictions unconditionally.

---

## Date and Period Filters

- **Status:** shipped
- **Description:** All reports expose flexible time-range controls — free-form date pickers, fiscal-period selector, fiscal-year selector, branch/warehouse/category/legal-entity filters, and a `useCurrentMonth` default.
- **Who it's for:** All report users.
- **Constraints / notes:** Financial reports enforce exactly one period mode (date range OR fiscal period OR fiscal year). Implemented in `features/reports/components/filters/`.

---

## Report Builder (Custom Reports)

- **Status:** planned
- **Description:** A drag-and-drop interface for building custom reports from any entity (sales, purchase, inventory, accounting, POS) with configurable columns, filters, groupings, calculations, and visualisation type (table, bar chart, line chart, pie chart, KPI card).
- **Who it's for:** Owner, power users.
- **Constraints / notes:** Full spec exists (`02-report-builder.md`, `04-query-engine.md`); no implementation found in codebase as of audit date. Includes SavedReport entity (save, share, clone) and formula calculations.

---

## Scheduled Report Delivery

- **Status:** planned
- **Description:** Automatically runs a saved report on a cron schedule and emails the result as a PDF, Excel, or CSV attachment to a configurable recipient list via Resend.
- **Who it's for:** Owner, managers who need recurring reports delivered automatically.
- **Constraints / notes:** Specced in `05-export-scheduling.md` with BullMQ trigger, ScheduledReport entity, frequency presets (daily/weekly/monthly/custom cron), and failure retry. No implementation found in codebase as of audit date.

---

## Excel Export

- **Status:** planned
- **Description:** Exports any report to a formatted `.xlsx` file with auto-fit columns, frozen header row, number formatting, a SUM row, and a metadata sheet — using ExcelJS; RTL sheet direction for Arabic.
- **Who it's for:** Accountants and analysts who work with data in Excel.
- **Constraints / notes:** Specced in `05-export-scheduling.md`. No ExcelJS implementation found in codebase; only CSV and PDF exports are currently shipped.

---

## Pre-Aggregation / Nightly Snapshots

- **Status:** planned
- **Description:** BullMQ nightly jobs that pre-compute daily sales totals, stock snapshots, and AR/AP aging buckets so reports load near-instantly rather than querying raw transaction tables at runtime.
- **Who it's for:** Transparent to users; benefits all report consumers with faster load times.
- **Constraints / notes:** Specced in `04-query-engine.md` with four jobs and a UI staleness indicator. No BullMQ job implementations for reports found in codebase; all current reports query live data.
