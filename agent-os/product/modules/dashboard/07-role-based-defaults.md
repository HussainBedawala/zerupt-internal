# Role Based Defaults

## Default Layout Profiles

Roles are fully dynamic — defined by each customer during onboarding. Dashboard profiles are mapped to **permission keys**, not hardcoded role names. The system matches the user's granted permissions to the most relevant layout profile.

| Profile Key | Matched When User Has Permissions | Default Widgets |
|-------------|-----------------------------------|-----------------|
| `executive` | Full read access across all modules | Revenue KPIs, margin trend, cash position, risk queue |
| `operations` | Branch management + POS + inventory read | Daily sales, low stock, pending approvals, shift variance |
| `finance` | Accounting read + AP/AR access | AR/AP aging, cash flow trend, VAT payable, period status |
| `procurement` | Purchase module access | Open PO value, overdue GRN, supplier lead-time variance |
| `warehouse` | Inventory module access | Stock cover, low stock, transfer exceptions, count variance |

## Profile Selection Rules

| Rule | Detail |
|------|--------|
| Primary profile | Derived from highest-priority active role |
| Multi-role merge | Union of widgets, capped by layout budget |
| Branch scope | Defaults pre-filter to user branch access |
| First login | Auto-apply profile and save user layout |

## Reset and Migration Rules

| Rule | Detail |
|------|--------|
| Reset to role default | Available to all users |
| Profile upgrade | New widget additions marked `new` for 7 days |
| Deprecated widget | Auto-replaced by mapped successor |
