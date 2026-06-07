# Onboarding Coach Agent

## Purpose

Guide new tenants through feature discovery and system adoption after go-live. Advisory only — all suggestions are Info severity.

**Rate limit:** 5 suggestions/day/tenant
**Schedule:** Mornings only (`0 9 * * *`)
**Auto-deactivation:** After 60 days or when adoption score reaches 80%

---

## Monitors

| Check | Logic | Timing |
|-------|-------|--------|
| Feature adoption tracking | Has the tenant used POS? Created an invoice? Built a custom report? Set up a second user? | Continuous, checked daily |
| Configuration completeness | Branches with no warehouses? Roles with no users? Payment methods enabled but never used? | Daily for first 30 days |
| Data completeness | Products imported but no opening stock? Customers imported but no credit limits set? | Daily for first 14 days |
| Usage patterns | User logs in but only uses one module | After 7 days of activity |

## Adoption Score

The adoption score is a percentage (0–100%) calculated from weighted feature usage:

| Feature | Weight | Criterion |
|---------|--------|-----------|
| Created at least one invoice | 15% | `sales.invoice.count > 0` |
| Used POS (if enabled) | 15% | `pos.transaction.count > 0` |
| Imported or created 10+ products | 10% | `item.count >= 10` |
| Set up reorder levels | 10% | `item.withReorderLevel.count > 0` |
| Created a custom report | 10% | `report.custom.count > 0` |
| Added a second user | 10% | `user.count >= 2` |
| Completed a stock count | 10% | `inventory.count.completed > 0` |
| Used multi-currency (if enabled) | 5% | `transaction.foreignCurrency.count > 0` |
| Configured notification preferences | 5% | `notification.policy.customized = true` |
| Used Copilot | 5% | `copilot.conversation.count > 0` |
| Reconciled bank statement | 5% | `banking.reconciliation.count > 0` |

Features that are not enabled for the tenant (e.g., POS, multi-currency) are excluded and their weight redistributed.

## Example Suggestions

**INFO:**
> You've been using POS for 5 days but haven't set up your daily closing process. Daily Z-reports help you track cash discrepancies and reconcile shifts.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/pos/shifts", helpArticle: "shift-closing" } }`

**INFO:**
> You imported 245 products but 180 have no reorder levels set. Without reorder levels, the system can't alert you when stock is low.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/inventory/items?filter=noReorderLevel", helpArticle: "bulk-reorder-levels" } }`

**INFO:**
> You have 3 team members invited but none have logged in yet. Want to send a reminder?
>
> `suggestedAction: { actionType: "invitation.resend", endpoint: "/api/invitations/resend-all", payload: {} }`

**INFO:**
> You haven't tried the Report Builder yet. You can create custom reports without any technical skills.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/reports/builder", helpArticle: "report-builder-intro" } }`

## Deactivation Rules

| Condition | Action |
|-----------|--------|
| 60 days since `tenant.onboardingCompletedAt` | Agent deactivates. Setting `agent.onboarding_coach.enabled` set to `false`. |
| Adoption score >= 80% | Agent deactivates early. |
| Owner manually disables | Agent deactivates immediately. |
| Agent deactivated but re-enabled by owner | Timer resets. Agent runs for another 30 days or until 80% adoption. |

## Permissions

| Action | Required Key |
|--------|--------------|
| View onboarding suggestions | `dashboard.suggestions.view` |
| Accept navigation suggestion | Permission for the target module |
| Resend invitations | `settings.users.invite` |
