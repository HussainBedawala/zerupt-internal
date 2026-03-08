# Actions and Workflows

## Quick Action Catalog

| Action Key | Destination | Permission Key |
|------------|-------------|----------------|
| `pos.openSession` | POS register open | `pos.session.open` |
| `sales.createInvoice` | Sales invoice create | `sales.invoice.create` |
| `purchase.createPo` | Purchase PO create | `purchase.order.create` |
| `inventory.createAdjustment` | Inventory adjustment create | `inventory.adjustment.create` |
| `accounting.postReceipt` | Accounting receipt voucher | `accounting.receipt.post` |
| `reports.newReport` | Report builder | `reports.create` |

## Dashboard Workflow Rules

| Rule | Detail |
|------|--------|
| Action visibility | Show only actions user can execute |
| Action ordering | Top 3 by role relevance + usage frequency |
| Confirmation | Required for actions with financial/stock impact |
| Return path | After complete/cancel, return to dashboard with context |

## Approval Queue Actions

| Queue Type | Action | Result |
|------------|--------|--------|
| `discountApproval` | Approve/Reject | Writes in source module |
| `poApproval` | Approve/Reject | Writes in purchase module |
| `periodOverride` | Approve/Reject | Writes in accounting module |
| Ownership boundary | Dashboard launches action flow; source module owns state transition |
