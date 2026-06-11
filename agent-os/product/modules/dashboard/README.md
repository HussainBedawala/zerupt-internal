# Main Dashboard

## Files

| File | What It Covers |
|------|---------------|
| `01-information-architecture.md` | Dashboard sections, layout zones, navigation and drill-down rules |
| `02-kpi-catalog.md` | KPI definitions, formulas, targets, status thresholds |
| `03-widget-model.md` | Widget types, schema, states, sizing and placement constraints |
| `04-actions-and-workflows.md` | User actions from dashboard, quick actions, approvals and deep links |
| `05-filters-and-personalization.md` | Global filters, saved views, personalization and sharing rules |
| `06-alerts-and-work-queue.md` | Alert cards, anomaly feed, pending approvals, task queue rules |
| `07-role-based-defaults.md` | Default layouts by role and branch scope behavior |
| `08-performance-refresh.md` | Refresh cadence, caching, latency budgets, failure states |
| `09-cross-module-contracts.md` | Data contracts from modules and dashboard-owned event emissions |
| `10-permissions.md` | Permission keys, field visibility, branch isolation, export/share controls |

## Design Rules

| Rule | Detail |
|------|--------|
| Dashboard type | Default executive overview with role-aware widgets/actions |
| Data ownership | Dashboard is read/aggregate layer; no domain transaction writes |
| Personalization | Per-user layout, filters, and pinned widgets |
| Multi-branch | Branch-scoped data with consolidated view for authorized users |
| UX standard | Time-to-insight under 10 seconds for first meaningful render |
| Drill-down | Every KPI must deep-link to source module with preserved filters |
| i18n | Full multilingual support (Arabic, English, Hindi, Malay, etc.), proper RTL/LTR layouts, locale-aware numbers/dates/currencies. See `settings-admin/14-internationalization.md`. |
| Observability | Every widget load/error tracked with traceable request IDs |
