# References: New Approach Spec Alignment

## Primary Source

- **`product/new-approach.md`** — HSN Agentic ERP: New Approach (March 2026 draft)

### Sections Used

| Section | Used For |
|---------|----------|
| §2 The Agentic Onboarding System | Questionnaire steps (Phase 2), configuration pipeline (Phase 3), data import flow (Phase 4), go-live (Phase 5) |
| §2 Phase 2 Questionnaire tables | All 7 steps, field mappings, conditional logic, UX principles |
| §2 Phase 3 Configuration Pipeline | 10-step pipeline, progress UI, review screen, diff-based re-configuration |
| §2 Phase 4 Data Import | AI column mapping flow, validation assistance, import order, opening balance AI |
| §2 Phase 5 Go Live | Checklist, team invitations, onboarding coach activation |
| §3.1 HSN Copilot | Capabilities table, safety constraints, technical implementation, plugin architecture |
| §3.2 Background Agents | Suggestion Card entity, all 4 agent definitions (monitors, triggers, example suggestions) |
| §3.3 Agent Infrastructure | Runtime architecture (BullMQ + NestJS), safety guarantees table, rate limits |
| §4 What Changes in Existing Specs | Spec update requirements table, new spec locations |
| Appendix A | Onboarding questionnaire decision tree |
| Appendix B | Suggestion card state machine |
| Appendix C | Agent safety matrix |

## Cross-Referenced Specs

| Spec | Why Referenced |
|------|---------------|
| `accounting/07-event-mappings.md` | Event keys that agents subscribe to |
| `accounting/04-chart-of-accounts.md` | COA template used in onboarding configuration pipeline |
| `settings-admin/03-roles-permissions-policy.md` | Permission key convention used across all new specs |
| `dashboard/07-role-based-defaults.md` | Dashboard defaults created during onboarding |
| `reports/04-query-engine.md` | NLQ execution backend for Copilot |
| `tech-stack.md` | Plugin registry pattern, BullMQ, Upstash Redis, Socket.io WebSocket |
