# Suggestion Card Data Model and Lifecycle

## Overview

Suggestion cards are the output of all background agents. They represent actionable insights surfaced to users via the dashboard work queue and notification bell.

---

## Entity Definition

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `tenantId` | UUID | Tenant scope (dedicated DB isolation, tenantId retained for defense-in-depth) |
| `agentKey` | string | `accounting_guardian`, `inventory_sentinel`, `compliance_watcher`, `onboarding_coach` |
| `category` | string | Agent-specific category. E.g., `journal_imbalance`, `reorder_needed`, `tax_misconfiguration`, `feature_adoption` |
| `severity` | enum | `Info`, `Warning`, `Critical` |
| `title` | string | Human-readable summary (max 120 chars) |
| `description` | string | Detailed explanation (supports markdown) |
| `suggestedAction` | json | Machine-readable action. Structure: `{ actionType: string, endpoint: string | null, payload: object }`. Null for informational-only suggestions. |
| `contextData` | json | Supporting data: referenced document IDs, amounts, account codes, etc. |
| `status` | enum | `Open`, `Accepted`, `Dismissed`, `Expired` |
| `dismissReason` | string | Nullable. Set when dismissed. |
| `feedbackRating` | enum | Nullable. `Helpful`, `NotHelpful` |
| `resolvedByUserId` | UUID | Nullable. User who accepted or dismissed. |
| `resolvedAt` | datetime | Nullable. Timestamp of accept/dismiss. |
| `createdAt` | datetime | When the agent created the suggestion. |
| `expiresAt` | datetime | Nullable. If set, card auto-transitions to `Expired`. |

## State Machine

```
Created (by agent)
  → Open (visible to user)
    → Accepted (user approves action)
      → [suggestedAction executed via API]
    → Dismissed (user rejects)
      → dismissReason: "Not relevant" | "Already handled" | "Incorrect" | "Not now"
    → Expired (expiresAt reached without action)
```

### Transition Rules

| Transition | Condition |
|------------|-----------|
| Created → Open | Immediate. Suggestion is visible as soon as it's inserted. |
| Open → Accepted | User clicks Accept. If `suggestedAction` has an `endpoint`, the action is executed via the API. The user must have the required permission for the action. |
| Open → Dismissed | User clicks Dismiss. Must select a `dismissReason`. |
| Open → Expired | Background job checks `expiresAt` and transitions overdue cards. Runs every hour. |
| Any terminal state | Immutable. Cannot transition back to Open. |

## Dismiss Reasons

| Reason | Meaning | Agent Learning Impact |
|--------|---------|----------------------|
| `Not relevant` | The suggestion doesn't apply to this business | Deprioritise this category for this tenant |
| `Already handled` | The issue was already resolved outside the system | No threshold change — correct detection, late delivery |
| `Incorrect` | The agent's analysis was wrong | Flag for review. High `Incorrect` rate triggers threshold adjustment. |
| `Not now` | Valid suggestion but not actionable right now | No threshold change — re-suggest if condition persists |

## Feedback Aggregation

Monthly background job aggregates per agent per tenant:

| Metric | Calculation |
|--------|-------------|
| Accept rate | `accepted / (accepted + dismissed + expired)` |
| Dismiss rate | `dismissed / (accepted + dismissed + expired)` |
| Incorrect rate | `dismissed WHERE reason = 'Incorrect' / total dismissed` |
| Ignore rate | `expired / (accepted + dismissed + expired)` |
| Helpful rate | `rated Helpful / (rated Helpful + rated NotHelpful)` |

### Threshold Learning (Phase 2)

In Phase 2, feedback metrics adjust agent thresholds per tenant:
- If a tenant consistently dismisses slow-moving stock alerts for items under 50 KWD value, the Inventory Sentinel raises its value threshold for that tenant.
- If a tenant has a high accept rate for rounding error corrections, the Accounting Guardian can auto-apply fixes below a configurable amount (with audit trail).

### Cross-Tenant Learning (Phase 3)

In Phase 3, anonymised aggregated feedback across tenants improves global agent defaults:
- Default thresholds for new tenants are set based on industry + country averages from existing tenants.

## Storage

- Table: `suggestion_cards`
- Stored in tenant's dedicated database
- Indexed on: `(tenantId, status, createdAt)`, `(tenantId, agentKey, createdAt)`
- Retention: Active (Open) cards kept indefinitely. Terminal cards (Accepted, Dismissed, Expired) retained for 1 year, then archived.

## Delivery

1. `SuggestionService.createSuggestion()` inserts into `suggestion_cards` (tenant's dedicated DB)
2. NestJS WebSocket gateway (Socket.io) emits event to tenant's channel
3. Frontend receives via Socket.io client

## UI Placement

| Location | What Shows |
|----------|------------|
| Dashboard Work Queue (`suggestions.ai` tab) | All Open suggestion cards, sorted by severity then date |
| Notification Bell | Critical and Warning suggestions appear as notifications |
| Individual suggestion card | Severity icon, title, description, Accept/Dismiss/Ask Copilot buttons, optional rating after action |

## Rate Limits

| Agent | Max Suggestions/Day/Tenant |
|-------|---------------------------|
| `accounting_guardian` | 20 |
| `inventory_sentinel` | 30 |
| `compliance_watcher` | 10 |
| `onboarding_coach` | 5 |

When an agent hits its daily limit, it stops creating new suggestions until the next UTC day. Critical severity suggestions bypass the rate limit.

## Permissions

| Action | Required Key |
|--------|--------------|
| View suggestions | `dashboard.suggestions.view` |
| Accept suggestion | Permission key for the underlying action type |
| Dismiss suggestion | `dashboard.suggestions.acknowledge` |
| Rate suggestion | `dashboard.suggestions.acknowledge` |
