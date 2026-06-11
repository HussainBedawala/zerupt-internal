# Permissions

Reports uses the same tenant-wide RBAC system as all other modules. The **owner** (tenant owner) has full unrestricted access to everything. All other permissions are assigned by the owner at their discretion — nothing is hardcoded to specific roles.

---

## Owner Access

| Rule | Detail |
|------|--------|
| Owner sees all reports | Bypasses `visibility` on SavedReport — sees every report in the tenant |
| Owner sees all data | No branch restrictions, no field restrictions |
| Owner sees all fields | Cost, margin, profit columns always visible |
| Owner manages all schedules | Can view/edit/delete any scheduled report |
| No restrictions | Owner access is unconditional and cannot be limited |

---

## Permission Keys

The system defines these permission keys. The owner assigns them to roles/users. No defaults are prescribed.

### Report Management

| Key | Controls |
|-----|----------|
| `reports.create` | Create new saved reports |
| `reports.edit` | Edit own saved reports |
| `reports.delete` | Delete own saved reports |
| `reports.share` | Share reports with other users |
| `reports.schedule` | Create and manage scheduled report delivery |
| `reports.export` | Export reports (PDF, Excel, CSV) |

### Data Visibility

| Key | Controls |
|-----|----------|
| `reports.viewFinancial` | Access financial reports (P&L, Balance Sheet, Trial Balance, Cash Flow, GL) |
| `reports.viewTax` | Access tax reports (VAT Return Data) |
| `inventory.cost.view` | See cost, margin, and profit columns in any report |
| `sales.view` | Access sales entities (invoices, SOs, quotations, customers) |
| `purchase.view` | Access purchase entities (POs, GRNs, suppliers) |
| `inventory.view` | Access inventory entities (items, stock levels, movements) |
| `pos.view` | Access POS entities (transactions, shifts) |
| `accounting.view` | Access accounting entities (journal entries, GL balances) |

---

## Field-Level Visibility

Controlled by permission keys, not hardcoded role names.

| Sensitive Field Category | Required Permission Key | Behavior Without Permission |
|-------------------------|------------------------|---------------------------|
| Cost fields (unit_cost, cost_at_sale, total_cost) | `inventory.cost.view` | Columns stripped from result set |
| Margin fields (profit_margin, gross_profit) | `inventory.cost.view` | Columns stripped from result set |
| Financial account balances | `reports.viewFinancial` | Entity blocked entirely |
| Tax amounts and breakdowns | `reports.viewTax` | Tax columns stripped from result set |

### Enforcement

| Rule | Detail |
|------|--------|
| Column stripping | Restricted columns removed from SELECT before query execution |
| Entity blocking | If user lacks entity permission, query returns 403 |
| Filter transparency | Users can only filter on fields they can see |
| Calculation hiding | If a calculation references a hidden field, calculation is hidden |
| Export respects permissions | Exported files contain only data the user is allowed to see |

---

## Branch-Level Data Isolation

| Setting | Detail |
|---------|--------|
| Configuration | Per-user branch assignment: `allowedBranches: string[]` |
| All branches | If `allowedBranches` is empty or null, user sees all branches |
| Filter enforcement | `branch_id IN (allowedBranches)` appended to every report query |
| Owner exempt | Owner always sees all branches regardless of assignment |
| Cross-branch reports | Only available to users with access to all included branches |

---

## Scheduled Report Permissions

| Rule | Detail |
|------|--------|
| Create schedule | Requires `reports.schedule` |
| Schedule runs as owner | Scheduled report executes with the schedule **creator's** permissions |
| Permission changes | If creator loses a permission, next scheduled run reflects the reduced access |
| Creator deactivated | Schedule auto-disabled when creator's account is deactivated |
| Recipients | No permission check on recipients — they receive what the creator can see |
