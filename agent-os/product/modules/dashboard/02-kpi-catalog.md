# KPI Catalog

## KPI Registry Schema

| Field | Type | Description |
|-------|------|-------------|
| `kpiKey` | string | Unique key |
| `label` | string | Localized display label |
| `moduleSource` | enum | `POS`, `Sales`, `Purchase`, `Inventory`, `Accounting`, `Reports` |
| `formula` | string | Deterministic formula expression |
| `aggregationWindow` | enum | `Today`, `WTD`, `MTD`, `QTD`, `YTD`, `Custom` |
| `comparisonMode` | enum | `PreviousPeriod`, `Target`, `None` |
| `thresholdProfile` | string | Alert threshold set |
| `permissionKey` | string | Access key |

## Core KPI Set

| KPI Key | Formula | Target/Threshold |
|---------|---------|------------------|
| `sales.net.today` | `sum(net_sales where date=today)` | warn < prior day -15% |
| `sales.grossMargin.mtd` | `(net_sales-cogs)/net_sales` | critical < 18% |
| `inventory.lowStock.count` | `count(items where available <= reorderLevel)` | warn > 0 |
| `inventory.stockCover.days` | `availableQty / avgDailySales` | warn < 7 days |
| `purchase.pendingPo.value` | `sum(open_po_remaining_value)` | warn > policy limit |
| `purchase.grn.delay.count` | `count(po overdue not received)` | warn > 0 |
| `accounting.ar.overdue` | `sum(ar where due_date < today)` | critical > target |
| `accounting.ap.overdue` | `sum(ap where due_date < today)` | warn > target |
| `cash.register.variance.today` | `sum(pos_shift_variance)` | critical != 0 by policy |
| `tax.vat.payable.current` | `output_tax - input_tax` | informational |

## KPI Display Rules

| Rule | Detail |
|------|--------|
| Precision | Currency and decimal precision follow accounting currency rules |
| Color state | `Good`, `Warning`, `Critical`, `Neutral` |
| Trend indicator | Arrow + percentage delta when comparison enabled |
| Click behavior | Opens L2 breakdown with same filters |
| Sensitive KPI gating | Enforced via permission key and field visibility policy |
