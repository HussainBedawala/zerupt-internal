# Alerts and Work Queue

## Alert Card Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `alertKey` | string | |
| `severity` | enum | `Info`, `Warning`, `Critical` |
| `moduleSource` | string | |
| `summary` | string | |
| `contextJson` | json | |
| `createdAt` | datetime | |
| `status` | enum | `Open`, `Acknowledged`, `Resolved` |

## Suggestion Card Entity

AI agent suggestions extend the alert pattern with agent-specific fields.

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `agentSource` | string | `accounting_guardian`, `inventory_sentinel`, `compliance_watcher`, `onboarding_coach` |
| `severity` | enum | `Info`, `Warning`, `Critical` |
| `title` | string | Human-readable summary |
| `description` | string | Detailed explanation |
| `suggestedAction` | json | Machine-readable action the user can approve. Structure: `{ actionType: string, endpoint: string, payload: object }` |
| `contextData` | json | Supporting data (referenced documents, amounts, etc.) |
| `status` | enum | `Open`, `Accepted`, `Dismissed`, `Expired` |
| `dismissReason` | string | Nullable. One of: `Not relevant`, `Already handled`, `Incorrect`, `Not now` |
| `feedbackRating` | enum | Nullable. `Helpful`, `NotHelpful` |
| `resolvedByUserId` | UUID | Nullable. User who accepted or dismissed. |
| `resolvedAt` | datetime | Nullable. |
| `createdAt` | datetime | |
| `expiresAt` | datetime | Nullable. If set, card transitions to `Expired` after this time. |

## Work Queue Types

| Queue Key | Source Module |
|-----------|---------------|
| `approvals.pending` | Sales, Purchase, Accounting |
| `exceptions.discrepancy` | POS, Inventory |
| `collections.overdue` | Accounting, Sales |
| `procurement.risk` | Purchase, Inventory |
| `suggestions.ai` | Agent System (Accounting Guardian, Inventory Sentinel, Compliance Watcher, Onboarding Coach) |

## Queue Rules

| Rule | Detail |
|------|--------|
| Priority scoring | Severity + financial impact + aging |
| Sort order | Descending priority, then oldest first |
| SLA badges | Show time-to-breach indicator |
| Batch actions | Allowed only when source module supports |

## Acknowledgement Rules

| Rule | Detail |
|------|--------|
| Who can acknowledge | Role with relevant module approval key |
| Critical alert ack | Reason required |
| Audit | Every ack/resolve action audited |

## AI Suggestion Feedback Rules

| Rule | Detail |
|------|--------|
| Accept | Executes `suggestedAction` via the specified API endpoint. Requires relevant module permission key for the action type. |
| Dismiss | Records `dismissReason`. No action executed. |
| Rate | Optional `Helpful` / `NotHelpful` feedback. Available after accept or dismiss. |
| Expiry | Cards with `expiresAt` auto-transition to `Expired` via scheduled job. |
| Rate limiting display | Each agent has a max suggestions/day/tenant. The queue UI shows remaining quota per agent: Accounting Guardian 20, Inventory Sentinel 30, Compliance Watcher 10, Onboarding Coach 5. |
