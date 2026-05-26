# Shape: New Approach Spec Alignment

**Date:** 2026-03-01
**Status:** In Progress

---

## Problem

The existing product specs were written before the agentic onboarding and background AI agent systems were designed. Section 4 of `new-approach.md` identifies four specs that need updates and thirteen new specs that need to be written to support:

1. Agentic onboarding (questionnaire → AI configuration → AI-assisted import → go-live)
2. Background AI agents (Accounting Guardian, Inventory Sentinel, Compliance Watcher, Onboarding Coach)
3. HSN Copilot (conversational assistant with NLQ)
4. Suggestion card system (agent output → user feedback loop)

## Scope

### Updated Specs (4)

| Spec | Key Changes |
|------|-------------|
| `settings-admin/11-data-import-migration-controls.md` | AI column mapping step, `mappingConfidence`, `aiSuggestedFixes`, `columnMappings` fields |
| `dashboard/06-alerts-and-work-queue.md` | `SuggestionCard` entity, AI Suggestions queue type, feedback mechanism |
| `settings-admin/01-organisation-governance.md` | `onboardingState`, `onboardingCompletedAt`, `onboardingVersion`, `inventoryConcept` fields; `industry` changed to dynamic string |
| `settings-admin/08-notifications-alert-policy.md` | Agent suggestion events, severity routing, per-agent enable/disable |

### New Specs (13)

| Directory | Files |
|-----------|-------|
| `product/onboarding/` | `01-questionnaire.md`, `02-configuration-pipeline.md`, `03-ai-import-assistant.md`, `04-go-live.md` |
| `product/agents/` | `01-architecture.md`, `02-copilot.md`, `03-accounting-guardian.md`, `04-inventory-sentinel.md`, `05-compliance-watcher.md`, `06-onboarding-coach.md`, `07-suggestion-model.md` |

## Decisions

- `SuggestionCard` is a new entity, not a subtype of `AlertCard` — they share severity/status patterns but have different lifecycles (feedback, expiry, suggestedAction)
- `industry` on Tenant changes from hardcoded enum to dynamic string — decouples from verticals, supports inventory-concept-based logic instead
- Added `inventoryConcept` enum to Tenant — this drives configuration decisions (serialized tracking, batch tracking, etc.) more precisely than industry alone
- Agent specs reference event keys from `accounting/07-event-mappings.md` for event-driven triggers
- All specs use permission keys (not role names) per the dynamic roles approach from `settings-admin/03-roles-permissions-policy.md`
- All specs are region-agnostic: GCC + India + SEA coverage from day one

## Out of Scope

- `product/roadmap.md` restructure (separate task)
- `product/settings-admin/13-tenant-provisioning.md` (separate task)
- `product/accounting/11-coa-templates.md` (separate task)
- Implementation code
