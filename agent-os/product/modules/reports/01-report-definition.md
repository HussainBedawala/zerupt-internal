# Report Definition

## ReportDefinition Schema (JSON)

Stored as JSON metadata in the database. See `tech-stack.md` → Dynamic Report Engine.

```json
{
  "entity": "string",
  "columns": ["string"],
  "filters": [
    { "field": "string", "op": "string", "value": "any" }
  ],
  "groupings": ["string"],
  "calculations": [
    { "type": "string", "field": "string", "label": "string" }
  ],
  "sort": { "field": "string", "direction": "asc | desc" },
  "visualization": "string"
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `entity` | string | Root entity to query. See `02-report-builder.md` for available entities. |
| `columns` | string[] | Fields to include. Must be valid fields for the chosen entity. |
| `filters` | Filter[] | Conditions to restrict results. See `02-report-builder.md` for operators. |
| `groupings` | string[] | Fields to group by. Supports date extraction: `month(field)`, `quarter(field)`, `year(field)`. |
| `calculations` | Calculation[] | Aggregate calculations. See `02-report-builder.md` for types. |
| `sort` | Sort | Sort order. `field` must be a column or calculation label. |
| `visualization` | enum | `table`, `bar_chart`, `line_chart`, `pie_chart`, `kpi_card` |

---

## SavedReport Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `name` | string | User-defined report name |
| `description` | string | Optional |
| `definition` | JSON | ReportDefinition object |
| `templateId` | string? | If cloned from a pre-built template (`03-report-templates.md`) |
| `ownerId` | string | User who created the report |
| `visibility` | enum | `private`, `shared` |
| `sharedWith` | string[] | User IDs (only when `visibility = shared`) |
| `createdAt` | datetime | |
| `updatedAt` | datetime | |

---

## Ownership Rules

| Rule | Detail |
|------|--------|
| Creator is owner | `ownerId` set on creation, immutable |
| Owner can edit/delete | Full control over their reports |
| Owner can share | Set `visibility = shared`, add user IDs to `sharedWith` |
| Shared users can view/clone | Cannot edit or delete the original |
| Clone creates new report | New `id`, new `ownerId`, `visibility = private` |
| Tenant owner sees all | Tenant owner bypasses `visibility` — sees every saved report |

---

## Document Numbering

Reports are not numbered documents. They use UUIDs only.
