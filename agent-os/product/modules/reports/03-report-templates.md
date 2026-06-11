# Pre-Built Report Templates

Default reports shipped with the system. Users can run as-is or clone and customize.

---

## Sales Reports

### Top Sellers

| Property | Value |
|----------|-------|
| Entity | `sales_invoices` (line-level) |
| Columns | `item_name`, `sku`, `category`, `total_qty`, `total_revenue` |
| Filters | `invoice_date: between [period start, period end]` |
| Groupings | `item_id` |
| Calculations | `sum(quantity)` as Total Qty, `sum(line_total)` as Total Revenue |
| Sort | `Total Revenue desc` |

### Slow Movers

| Property | Value |
|----------|-------|
| Entity | `inventory_items` joined with `sales_invoices` |
| Columns | `item_name`, `sku`, `category`, `on_hand`, `total_qty_sold`, `last_sale_date` |
| Filters | `is_active: eq true`, `last_sale_date: lt [90 days ago]` OR `total_qty_sold: eq 0` |
| Groupings | `item_id` |
| Calculations | `sum(quantity)` as Total Qty Sold |
| Sort | `Total Qty Sold asc` |

### Daily Sales Summary

| Property | Value |
|----------|-------|
| Entity | `sales_invoices` + `pos_transactions` |
| Columns | `date`, `invoice_count`, `pos_count`, `total_sales`, `total_tax`, `total_cost`, `gross_profit` |
| Filters | `date: between [period]` |
| Groupings | `day(date)` |
| Calculations | `count` as Count, `sum(total)` as Total Sales, `sum(tax_total)` as Total Tax, `sum(cost_total)` as Total Cost, `formula(Total Sales - Total Cost)` as Gross Profit |
| Sort | `date desc` |

---

## Accounts Receivable / Payable

### AR Aging

| Property | Value |
|----------|-------|
| Entity | `ar_aging` |
| Columns | `customer_name`, `current`, `1_30`, `31_60`, `61_90`, `over_90`, `total_outstanding` |
| Filters | `total_outstanding: gt 0` |
| Groupings | `customer_id` |
| Calculations | `sum(total_outstanding)` as Grand Total |
| Sort | `total_outstanding desc` |

### AP Aging

| Property | Value |
|----------|-------|
| Entity | `ap_aging` |
| Columns | `supplier_name`, `current`, `1_30`, `31_60`, `61_90`, `over_90`, `total_outstanding` |
| Filters | `total_outstanding: gt 0` |
| Groupings | `supplier_id` |
| Calculations | `sum(total_outstanding)` as Grand Total |
| Sort | `total_outstanding desc` |

---

## Financial Reports

All financial reports respect fiscal year/period boundaries from `accounting/08-period-control.md` and align with the COA structure from `accounting/04-chart-of-accounts.md`.

### Trial Balance

| Property | Value |
|----------|-------|
| Entity | `gl_balances` |
| Columns | `account_code`, `account_name`, `debit_balance`, `credit_balance` |
| Filters | `period: eq [selected period]` |
| Groupings | `account_code` |
| Sort | `account_code asc` |

### Profit & Loss

| Property | Value |
|----------|-------|
| Entity | `gl_balances` |
| Columns | `account_code`, `account_name`, `balance` |
| Filters | `period: between [fiscal year range]`, `account_type: in [Income, Expense]` |
| Groupings | `account_type`, `account_sub_type` |
| Calculations | `sum(balance)` per group, Net Profit = Income - Expense |

### Balance Sheet

| Property | Value |
|----------|-------|
| Entity | `gl_balances` |
| Columns | `account_code`, `account_name`, `balance` |
| Filters | `period: lte [as-of period]`, `account_type: in [Asset, Liability, Equity]` |
| Groupings | `account_type`, `account_sub_type` |
| Calculations | `sum(balance)` per group |

### Cash Flow

| Property | Value |
|----------|-------|
| Entity | `journal_entries` |
| Columns | `cash_flow_category`, `account_name`, `net_amount` |
| Filters | `period: between [fiscal year range]`, `cash_flow_category: neq None` |
| Groupings | `cash_flow_category` |
| Calculations | `sum(net_amount)` per category |

### VAT Return Data

| Property | Value |
|----------|-------|
| Entity | `journal_entries` |
| Columns | `tax_code`, `taxable_amount`, `tax_amount`, `direction` |
| Filters | `period: between [return period]`, `account_code: in [2131, 1162]` |
| Groupings | `tax_code`, `direction` (Output / Input) |
| Calculations | `sum(taxable_amount)`, `sum(tax_amount)`, Net VAT = Output - Input |

---

## Inventory Reports

### Stock Valuation

| Property | Value |
|----------|-------|
| Entity | `stock_levels` joined with `inventory_items` |
| Columns | `item_name`, `sku`, `warehouse`, `on_hand`, `unit_cost`, `total_value`, `valuation_method` |
| Filters | `on_hand: gt 0` |
| Groupings | `warehouse_id` |
| Calculations | `sum(total_value)` as Total Valuation |
| Note | Cost from `inventory/04-cost-engine.md` — WAC or FIFO per item |

### Reorder Report

| Property | Value |
|----------|-------|
| Entity | `inventory_items` joined with `stock_levels` |
| Columns | `item_name`, `sku`, `on_hand`, `reorder_level`, `reorder_qty`, `preferred_supplier`, `lead_days` |
| Filters | `on_hand: lte reorder_level`, `is_active: eq true` |
| Sort | `on_hand asc` |

### Inventory Movement History

| Property | Value |
|----------|-------|
| Entity | `stock_movements` |
| Columns | `date`, `item_name`, `movement_type`, `quantity`, `cost`, `warehouse`, `reference_doc` |
| Filters | `date: between [period]` |
| Sort | `date desc` |
