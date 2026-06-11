# Report Builder

## Available Entities

| Entity Key | Source Module | Description |
|-----------|--------------|-------------|
| `sales_invoices` | Sales | Invoices with lines, customer, tax, payment status |
| `sales_orders` | Sales | Sales orders with lines, status, fulfillment |
| `quotations` | Sales | Quotations with lines, status, conversion |
| `credit_notes` | Sales | Credit notes with lines, reason |
| `customers` | Sales | Customer master data, credit limits, balances |
| `purchase_orders` | Purchase | POs with lines, supplier, receipt status |
| `grns` | Purchase | Goods received notes with lines |
| `purchase_returns` | Purchase | Returns to suppliers |
| `suppliers` | Purchase | Supplier master data, balances |
| `inventory_items` | Inventory | Item master with attributes, categories, costs |
| `stock_levels` | Inventory | Current stock by item × warehouse × bin |
| `stock_movements` | Inventory | All movement history (GRN, sale, adjustment, transfer) |
| `pos_transactions` | POS | Completed POS transactions with lines and payments |
| `pos_shifts` | POS | Shift summaries (sales, payments, cash count) |
| `journal_entries` | Accounting | All journal entries with lines |
| `gl_balances` | Accounting | Account balances by period |
| `ar_aging` | Sales | Outstanding receivables by customer, aged |
| `ap_aging` | Purchase | Outstanding payables by supplier, aged |

---

## Field Types

| Type | Examples | Supported Operators |
|------|---------|-------------------|
| `string` | customer_name, sku, category | eq, neq, in, contains, startsWith |
| `decimal` | total, quantity, unit_price, cost | eq, neq, gt, gte, lt, lte, between |
| `date` | invoice_date, created_at | eq, neq, gt, gte, lt, lte, between |
| `datetime` | completed_at, confirmed_at | eq, neq, gt, gte, lt, lte, between |
| `enum` | status, payment_method, movement_type | eq, neq, in |
| `boolean` | is_active, is_serial_tracked | eq |
| `uuid` | branch_id, warehouse_id, category_id | eq, neq, in |

---

## Filter Operators

| Operator | Description | Value Type |
|----------|------------|------------|
| `eq` | Equals | single value |
| `neq` | Not equals | single value |
| `gt` | Greater than | single value |
| `gte` | Greater than or equal | single value |
| `lt` | Less than | single value |
| `lte` | Less than or equal | single value |
| `between` | Between two values (inclusive) | [min, max] |
| `in` | In list of values | array |
| `contains` | Contains substring (case-insensitive) | string |
| `startsWith` | Starts with (case-insensitive) | string |
| `isNull` | Is null | none |
| `isNotNull` | Is not null | none |

---

## Grouping Options

| Grouping | Description |
|----------|-------------|
| `{field}` | Group by field value (e.g., `customer_name`, `branch_id`) |
| `month({date_field})` | Extract month from date |
| `quarter({date_field})` | Extract quarter from date |
| `year({date_field})` | Extract year from date |
| `week({date_field})` | Extract ISO week from date |
| `day({date_field})` | Extract day from date |

---

## Calculation Types

| Type | Description |
|------|-------------|
| `sum` | Sum of field values |
| `avg` | Average of field values |
| `count` | Count of rows |
| `countDistinct` | Count of distinct values |
| `min` | Minimum value |
| `max` | Maximum value |
| `formula` | Custom formula referencing other calculations (e.g., `sum(total) - sum(cost)`) |

### Formula Rules

- Formulas reference other calculation labels within the same report
- Supported operators: `+`, `-`, `*`, `/`
- Division by zero returns `null`
- Nested formulas not allowed (max one level of reference)
