# Audit Trail Viewer

UI for browsing audit logs captured by `@Audited` decorator. Filterable by entity type, user, date, action.

## Files

1. `01-design.md` — Backend endpoint, response shape, frontend layout, diff view

## Key Decisions

- **Backend already captures data** — this spec adds the read endpoint + UI only
- **Before/after diff view** — expandable rows show exactly what changed
- **Context-aware access** — pre-filtered panel from entity detail pages
- **Color-coded actions** — visual distinction between create/update/lock/delete
