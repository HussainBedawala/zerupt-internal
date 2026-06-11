# Report Engine

> Rules for how users build, save, schedule, and export reports across all ERP modules. Each file is self-contained.

## Files

| File | What It Covers |
|------|---------------|
| `01-report-definition.md` | ReportDefinition JSON schema, SavedReport entity, ownership and sharing |
| `02-report-builder.md` | Available entities, queryable fields, field types, filter operators, groupings, calculations |
| `03-report-templates.md` | Pre-built report templates shipped with the system |
| `04-query-engine.md` | Query translation, tenant isolation (dedicated DB), permission filtering, pre-aggregation, performance rules |
| `05-export-scheduling.md` | Export formats (PDF, Excel, CSV), scheduled delivery via BullMQ + Resend |
| `06-cross-module-contracts.md` | What Reports reads from every module, no events emitted |
| `07-permissions.md` | Permission keys, field-level visibility, branch-level isolation |

## Design Decisions

- Reports is read-only — it queries data from other modules, never writes or emits events
- Report definitions stored as JSON metadata, not code (see `tech-stack.md` → Dynamic Report Engine)
- All queries execute within the tenant's dedicated database — cross-tenant access is architecturally impossible
- Permission-based filtering (branch, field visibility) applied at the application level
- Pre-aggregation layer for common metrics (daily sales totals, stock snapshots) via BullMQ nightly jobs
- Financial reports respect fiscal year/period boundaries (see `accounting/08-period-control.md`)
- Financial reports align with COA structure (see `accounting/04-chart-of-accounts.md`)
- Inventory valuation reports use WAC/FIFO costs from inventory cost engine (see `inventory/04-cost-engine.md`)
- No standalone reports dashboard — reports feed widgets into the main ERP dashboard (defined elsewhere)
- Owner has full unrestricted access to all reports, data, fields, and branches
- All other permissions are owner-assigned — the system defines permission keys but never hardcodes role assignments
