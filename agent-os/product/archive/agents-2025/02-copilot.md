# HSN Copilot

## Overview

A conversational assistant accessible from every screen via a floating action button (FAB) in the bottom-right corner. Opens a slide-out panel (400px, right side). Full-screen on mobile. Also embedded inline during onboarding as the primary guidance interface.

---

## Capabilities

| Capability | Example | How It Works |
|------------|---------|--------------|
| Natural Language Query (NLQ) | "What were my top 10 products last month?" | Translates to `ReportDefinition` JSON, executes via query engine (`reports/04-query-engine.md`), returns formatted results in chat |
| Data Exploration | "Show me all overdue invoices over 500 KWD" | NLQ pipeline with drill-down: "Want to see details for customer X?" |
| Action Suggestions | "How do I create a purchase order?" | Step-by-step walkthrough with deep links to the relevant screen |
| Report Building | "Create a report showing monthly sales by category" | Generates report definition, shows preview in chat, offers "Save as report" button |
| Onboarding Help | "How do I set up a new branch?" | Contextual guidance with links to Settings > Branches |
| Data Entry Assistance | "Add a new customer: Al-Rashid Trading, Kuwait City, credit limit 5000 KWD" | Generates pre-filled form, shows preview, user clicks "Create" to confirm |
| Anomaly Explanation | User clicks "Why?" on a suggestion card | Explains the anomaly in plain language with supporting data |

## Safety Constraints

The Copilot CANNOT:

- Execute create/update/delete without user clicking a confirmation button
- Access data outside the user's tenant (dedicated database per tenant — cross-tenant access is architecturally impossible)
- Access data outside the user's RBAC scope (cashier asking about financial statements gets "You don't have permission. Ask your admin.")
- Provide tax or legal advice ("Based on your configuration, your VAT rate is 5%. For compliance questions, please consult your accountant.")
- Make up data. If the query returns no results, it says so.

## Data Access Model

1. Every Copilot request includes the user's JWT (tenant-scoped, RBAC-scoped)
2. NLQ pipeline generates SQL always wrapped with tenant and RBAC filters (query engine enforces this)
3. Copilot never receives raw database credentials — calls NestJS API which routes to the tenant's dedicated database
4. All conversations logged: `userId`, `tenantId`, `timestamp`, `query`, `response`, `dataAccessed`
5. Copilot has no write access to the database — all actions routed through standard API endpoints with standard auth

## NLQ Safety

| Guarantee | Implementation |
|-----------|----------------|
| Whitelisted tables/columns | NLQ plugin only generates queries against an allow-list of tables and columns per module |
| Tenant isolation | Query executes against the tenant's dedicated database. `WHERE tenant_id = $1` retained as defense-in-depth. |
| Parameterized queries | All user-provided values are parameterized, never interpolated |
| Confidence thresholds | If NLQ confidence < 0.70, Copilot asks for clarification instead of executing. If < 0.50, suggests the Report Builder. |
| Read-only | NLQ plugin connects via a read-only database role |

## Technical Implementation

The Copilot is a plugin in the FastAPI AI service:

```
register("copilot", CopilotPlugin)
```

The `CopilotPlugin` orchestrates between:
- `NLQPlugin` — for data queries
- `ReportAssistPlugin` — for report building
- `ActionPlugin` — for form pre-filling and workflow guidance
- `HelpPlugin` — for documentation and onboarding guidance (RAG over product docs via pgvector)

## Conversation State

| Storage | Purpose | TTL |
|---------|---------|-----|
| Upstash Redis | Active session context (current conversation turn, entity references, follow-up state) | 24 hours |
| PostgreSQL | Long-term conversation history (for training, improvement, audit) | Indefinite |

## UI

| Element | Description |
|---------|-------------|
| FAB button | Bottom-right on every screen. Badge shows unread count if Copilot has proactive messages. |
| Chat panel | Slide-out, 400px wide. Message bubbles. Supports markdown rendering. |
| Result display | Tables rendered inline. Charts rendered as embedded visualisations. |
| Follow-up suggestions | After each response, 2–3 suggested follow-up queries shown as clickable chips |
| "Ask Copilot" from suggestion card | Opens Copilot with suggestion context pre-loaded |

## Fallback Behaviour

| Condition | Behaviour |
|-----------|-----------|
| AI service down | "I'm temporarily unavailable. You can use the Report Builder for data queries or contact support." |
| NLQ confidence low (< 0.50) | "I'm not confident I understand your question. Would you like to try the Report Builder instead?" with a deep link. |
| User lacks permission for requested data | "You don't have permission to view [module]. Ask your admin to grant access." |
| No results | "No data found for your query. This might mean [possible reasons based on context]." |

## Permissions

| Action | Required Key |
|--------|--------------|
| Access Copilot | `copilot.access` (granted to all roles by default) |
| Execute NLQ queries | Copilot inherits the user's data permissions — no additional key needed |
| Execute actions via Copilot | Requires the same permission key as performing the action directly |
