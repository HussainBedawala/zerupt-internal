# Permissions

## Permission Keys

| Key | Control |
|-----|---------|
| `dashboard.view` | Access dashboard shell |
| `dashboard.widget.manage` | Add/remove/resize/reorder widgets |
| `dashboard.view.share` | Share saved views |
| `dashboard.export` | Export widget/report snapshots |
| `dashboard.alert.ack` | Acknowledge alerts |
| `dashboard.actions.execute` | Execute quick actions |
| `dashboard.financial.view` | View finance-sensitive widgets |

## Field Visibility Matrix

| Data Class | Required Key | Without Key |
|------------|--------------|-------------|
| Margin and cost KPIs | `inventory.cost.view` + `dashboard.view` | Hidden/obfuscated |
| AR/AP and cash metrics | `accounting.view` + `dashboard.financial.view` | Widget blocked |
| Tax metrics | `reports.viewTax` or `accounting.view` | Tax widgets hidden |
| Alert payload sensitive fields | module-specific view key | Fields stripped |

## Scope Rules

| Rule | Detail |
|------|--------|
| Branch isolation | All widget queries constrained by allowed branches |
| Consolidated view | Requires all selected branches in scope |
| Owner bypass | Owner sees all widgets, branches, and fields |
| Shared view access | Enforced at open-time and run-time |

## Audit Rules

| Action | Audit Requirement |
|--------|-------------------|
| View loaded | Optional telemetry log |
| Layout change | Required audit row |
| Share/update view | Required audit row |
| Export | Required audit row with filter context |
