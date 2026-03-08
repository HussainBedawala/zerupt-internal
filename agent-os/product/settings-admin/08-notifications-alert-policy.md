# Notifications and Alert Policy

## Notification Event Policy

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `eventKey` | string | e.g. `inventory.lowStock` |
| `isEnabled` | boolean | |
| `severity` | enum | `Info`, `Warning`, `Critical` |
| `channels` | array(enum) | `InApp`, `Email`, `Both` |
| `thresholdJson` | json | Optional |
| `throttleWindowMinutes` | integer | De-duplication window |

## Recipient Rule Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `policyId` | UUID | |
| `recipientType` | enum | `Role`, `User`, `Owner` |
| `recipientId` | UUID | nullable for Owner |
| `branchScope` | array(UUID) | nullable = all |
| `digestMode` | enum | `Immediate`, `Hourly`, `Daily` |
| `isActive` | boolean | |

---

## Event Catalog (Minimum)

| Event Key | Source Module |
|-----------|---------------|
| `inventory.lowStock` | Inventory |
| `purchase.approvalRequired` | Purchase |
| `sales.overdueReceivable` | Sales |
| `accounting.periodLockedOverride` | Accounting |
| `pos.shiftDiscrepancy` | POS |
| `settings.securityCriticalChange` | Settings/Admin |
| `agent.accounting.suggestion` | Accounting Guardian |
| `agent.inventory.suggestion` | Inventory Sentinel |
| `agent.compliance.suggestion` | Compliance Watcher |
| `agent.onboarding.suggestion` | Onboarding Coach |

## Agent Suggestion Event Routing

| Severity | Channel | Delivery |
|----------|---------|----------|
| Critical | InApp + Email | Immediate |
| Warning | InApp + Email | InApp immediate, Email in daily digest |
| Info | InApp | Immediate |

### Per-Agent Enable/Disable

Each agent can be individually enabled or disabled per tenant via a toggle in Settings > Notifications. When disabled, the agent still runs but does not create suggestion cards for that tenant.

| Setting Key | Default |
|-------------|---------|
| `agent.accounting_guardian.enabled` | `true` |
| `agent.inventory_sentinel.enabled` | `true` |
| `agent.compliance_watcher.enabled` | `true` |
| `agent.onboarding_coach.enabled` | `true` (auto-disables after 60 days or 80% adoption score) |

## Delivery Rules

| Rule | Detail |
|------|--------|
| Branch filter | Event branch must intersect recipient branch scope |
| Permission-aware payload | Hide restricted fields in notification payload |
| Email fallback | If email disabled globally, in-app only |
| Retry policy | Channel-specific retries from integrations policy |

## Escalation Rules

| Severity | Default Escalation |
|----------|--------------------|
| Info | No escalation |
| Warning | Owner notified on second unacknowledged trigger |
| Critical | Owner + designated role immediate |

### Agent Suggestion Escalation

| Condition | Action |
|-----------|--------|
| Critical agent suggestion unacknowledged for 4 hours | Escalate to tenant owner |
| Agent produces 3+ Critical suggestions in 24 hours for same category | Bundle into single escalation with summary |
| Agent disabled but Critical condition detected | Still log internally; surface on next enable |

## Acknowledgement Rules

| Rule | Detail |
|------|--------|
| Acknowledge right | Requires event-specific permission or owner |
| Critical acknowledgement | Reason required |
| Tamper prevention | Acknowledgements append-only in audit log |

## Permissions

| Action | Required Key |
|--------|--------------|
| View notifications | `settings.notifications.view` |
| Configure notification policies | `settings.notifications.manage` |
| Enable/disable agents | `settings.agents.manage` |
| Acknowledge agent suggestions | `dashboard.suggestions.acknowledge` |
