# Agent System Architecture

## Overview

The AI agent system consists of two user-facing surfaces and one infrastructure layer:

- **HSN Copilot** — conversational assistant (see `02-copilot.md`)
- **Suggestion Cards** — output from background agents (see `07-suggestion-model.md`)
- **Agent Runtime** — BullMQ workers in NestJS API service

---

## Agent Runtime Model

All background agents are implemented as BullMQ workers in the NestJS API service (not in FastAPI).

### Why NestJS, Not FastAPI

1. Agents primarily need database access and business logic, not LLM calls
2. Simple rule-based checks don't need Python/ML infrastructure
3. When an agent needs LLM assistance (e.g., natural language explanations for suggestion cards), it calls the FastAPI AI service via HTTP
4. This avoids giving the Python service write access to the `suggestion_cards` table

### Module Structure

```
NestJS API
  ├── AgentModule
  │   ├── AccountingGuardianService     (03-accounting-guardian.md)
  │   │   ├── onJournalPosted(event)          # Event listener
  │   │   ├── nightlyBalanceCheck()            # BullMQ cron: 0 2 * * *
  │   │   └── periodCloseReadinessCheck()      # BullMQ cron: 0 8 * * *
  │   ├── InventorySentinelService      (04-inventory-sentinel.md)
  │   │   ├── onStockMovement(event)           # Event listener
  │   │   ├── weeklySlowMovingCheck()          # BullMQ cron: 0 3 * * 1
  │   │   └── monthlyDeadStockCheck()          # BullMQ cron: 0 3 1 * *
  │   ├── ComplianceWatcherService      (05-compliance-watcher.md)
  │   │   ├── onInvoiceConfirmed(event)        # Event listener
  │   │   ├── dailyRateExpiryCheck()           # BullMQ cron: 0 7 * * *
  │   │   └── filingDeadlineCheck()            # BullMQ cron: 0 7 * * *
  │   ├── OnboardingCoachService        (06-onboarding-coach.md)
  │   │   └── dailyAdoptionCheck()             # BullMQ cron: 0 9 * * *
  │   └── SuggestionService
  │       ├── createSuggestion(card)
  │       ├── acceptSuggestion(id, userId)
  │       ├── dismissSuggestion(id, userId, reason)
  │       └── rateSuggestion(id, rating)
  │
  └── EventListeners (NestJS EventEmitter)
      ├── accounting.journal.posted → AccountingGuardianService
      ├── inventory.stock.moved → InventorySentinelService
      ├── sales.invoice.confirmed → ComplianceWatcherService
      └── ... (all events from accounting/07-event-mappings.md)
```

## Execution Models

| Agent | Model | Rationale |
|-------|-------|-----------|
| Accounting Guardian | Hybrid: event-driven + nightly batch | Transaction checks must be near-real-time; aggregate checks can batch |
| Inventory Sentinel | Hybrid: event-driven + weekly/monthly batch | Stockout alerts immediate; trend analysis batched |
| Compliance Watcher | Hybrid: event-driven + daily scheduled | Tax issues caught at creation; deadline checks scheduled |
| Onboarding Coach | Scheduled daily (mornings only) | No urgency; low-frequency advisory |

### Event-Driven Execution

Agents subscribe to NestJS `EventEmitter` events. When a business event fires (e.g., `accounting.journal.posted`), the relevant agent service method is invoked synchronously within the same process. The agent performs its check and, if a suggestion is warranted, calls `SuggestionService.createSuggestion()`.

### Scheduled Execution

BullMQ cron jobs run at configured intervals. Each job queries the Central Admin DB for all active tenants (where the agent is enabled), then connects to each tenant's dedicated database to perform batch checks. Jobs are idempotent — re-running a job for the same period produces the same results.

## Suggestion Delivery Pipeline

```
Agent check detects issue
  → SuggestionService.createSuggestion()
    → INSERT into suggestion_cards table (tenant's dedicated DB)
      → NestJS WebSocket gateway emits event to tenant channel (Socket.io)
        → Frontend receives new suggestion
          → Dashboard work queue (suggestions.ai tab)
          → Notification bell (Critical + Warning only)
```

## Safety Guarantees

| Guarantee | Implementation |
|-----------|----------------|
| Suggest-only | Agents write to `suggestion_cards` table only. No agent has write access to any business entity table. |
| Audit trail | Every suggestion creation, acceptance, and dismissal logged in immutable audit log |
| Tenant isolation | Each tenant has a dedicated database. Agent workers connect to the correct tenant DB via TenantConnectionService. `WHERE tenant_id = $1` retained as defense-in-depth. |
| Rate limiting | Per-agent max suggestions/day/tenant: Accounting Guardian 20, Inventory Sentinel 30, Compliance Watcher 10, Onboarding Coach 5 |
| Graceful degradation | If AI service is down, agents needing LLM calls fall back to template-based descriptions. Rule-based checks continue. |
| Per-tenant disable | Each agent can be disabled per tenant via `settings-admin/08-notifications-alert-policy.md` toggles |

## Graceful Degradation

When the FastAPI AI service is unavailable:

| Capability | Degraded Behaviour |
|------------|-------------------|
| Natural language suggestion descriptions | Use template strings with variable substitution |
| Anomaly explanation (Copilot "Why?") | Return "AI explanation temporarily unavailable. Raw data: {contextData}" |
| AI column mapping (import) | Fall back to manual mapping UI |
| NLQ queries (Copilot) | Return "Natural language queries are temporarily unavailable. Use the Report Builder instead." |

Rule-based agent checks (balance verification, reorder level comparison, tax rate validation) continue without any degradation since they don't use the AI service.

## Permissions

| Action | Required Key |
|--------|--------------|
| View suggestion cards | `dashboard.suggestions.view` |
| Accept suggestion | Requires the permission key for the underlying action (e.g., `purchase.order.create` to accept a reorder suggestion) |
| Dismiss suggestion | `dashboard.suggestions.acknowledge` |
| Rate suggestion | `dashboard.suggestions.acknowledge` |
| Enable/disable agent | `settings.agents.manage` |
