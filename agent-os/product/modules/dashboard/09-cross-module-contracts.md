# Cross Module Contracts

## Dashboard Reads

| Source Module | Required Data |
|---------------|---------------|
| POS | Transactions, shift summaries, payment mix, cash variance |
| Sales | Invoice/order summaries, overdue receivables, top customers |
| Purchase | Open PO value, GRN status, supplier performance |
| Inventory | Stock availability, low-stock list, valuation snapshots |
| Accounting | AR/AP aging, GL aggregates, VAT and cash metrics |
| Reports | Saved report outputs for pinned widgets |
| Settings/Admin | Permission resolution, branch scope, locale/currency preferences |

## Dashboard Emits

| Event | Trigger | Consumer |
|-------|---------|----------|
| `dashboard.view.loaded` | Dashboard opened | Analytics/observability |
| `dashboard.widget.refreshed` | Widget refresh success/failure | Analytics/observability |
| `dashboard.action.launched` | Quick action clicked | Analytics/audit |
| `dashboard.alert.acknowledged` | Alert acknowledged | Source module + audit |

## Contract Rules

| Rule | Detail |
|------|--------|
| Ownership | Source modules own source truth and state transitions |
| Write restrictions | Dashboard does not mutate domain entities directly |
| Filter propagation | Dashboard must pass normalized filter envelope to source queries |
| Idempotency | Emitted events include `eventId` and `traceId` |
