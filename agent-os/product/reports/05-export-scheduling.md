# Export and Scheduling

## Export Formats

| Format | Engine | Use Case |
|--------|--------|----------|
| PDF | Puppeteer (server-side) | Formatted, branded reports for sharing and printing |
| Excel | ExcelJS | Data analysis, formulas preserved, multiple sheets |
| CSV | Native | Raw data, integrations, bulk processing |

See `tech-stack.md` → PDF & Export.

---

## Export Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `reportId` | string | SavedReport that was exported |
| `format` | enum | `pdf`, `excel`, `csv` |
| `locale` | string | User's locale at export time (for headers, formatting) |
| `status` | enum | `queued`, `processing`, `completed`, `failed` |
| `filePath` | string | Supabase Storage path (set on completion) |
| `fileSize` | integer | Bytes |
| `rowCount` | integer | Rows exported |
| `requestedBy` | string | User ID or `system` (for scheduled) |
| `error` | string? | Error message if failed |
| `expiresAt` | datetime | Auto-delete from storage (default: 7 days) |
| `createdAt` | datetime | |
| `completedAt` | datetime? | |

---

## Export Rules

| Rule | Detail |
|------|--------|
| Inline threshold | Reports ≤ 10,000 rows export inline (synchronous response) |
| Queue threshold | Reports > 10,000 rows queued via BullMQ |
| Max export rows | 500,000 (hard limit) |
| PDF page limit | 200 pages max |
| File retention | Exported files auto-deleted after 7 days |
| Storage | Supabase Storage, tenant-scoped path: `exports/{tenantId}/{exportId}.{format}` |
| Permission check | Export respects same permission filters as viewing (see `04-query-engine.md`) |

---

## PDF Export Details

| Setting | Value |
|---------|-------|
| Engine | Puppeteer (headless Chromium) |
| Template | HTML template rendered with report data, tenant branding (logo, colors) |
| Page size | A4 default, configurable |
| Header | Report name, date range, tenant name |
| Footer | Page numbers, generation timestamp |
| **Locale** | Rendered in requesting user's locale. RTL layout for Arabic (`ar`). |
| **Direction** | `dir="rtl"` for Arabic exports, `dir="ltr"` for others |
| **Fonts** | Noto Sans Arabic embedded for Arabic exports |

## Excel Export Details

| Setting | Value |
|---------|-------|
| Engine | ExcelJS |
| Sheet 1 | Report data with column headers |
| Sheet 2 | Report metadata (name, filters applied, generated at) |
| Formatting | Column widths auto-fit, header row bold and frozen, number formatting per field type |
| Formulas | SUM row appended for numeric columns |
| **Locale** | Column headers translated to user's locale. Data values as stored. |
| **Direction** | Sheet direction set to RTL for Arabic exports (`worksheet.views = [{ rightToLeft: true }]`) |

## CSV Export Details

| Setting | Value |
|---------|-------|
| Encoding | UTF-8 with BOM (for Excel compatibility with Arabic/Hindi characters) |
| Headers | Translated to user's locale |
| Data | As stored (no formatting transformation) |

---

## Scheduled Report Delivery

### ScheduledReport Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `reportId` | string | SavedReport to execute |
| `name` | string | Schedule name |
| `frequency` | string | Cron expression (e.g., `0 8 * * 1` = Monday 8 AM) |
| `timezone` | string | IANA timezone for cron evaluation |
| `format` | enum | `pdf`, `excel`, `csv` |
| `recipients` | string[] | Email addresses |
| `enabled` | boolean | |
| `ownerId` | string | User who created the schedule |
| `lastRunAt` | datetime? | |
| `lastRunStatus` | enum? | `success`, `failed`, `no_data` |
| `createdAt` | datetime | |

### Frequency Presets

| Preset | Cron | Description |
|--------|------|-------------|
| Daily | `0 8 * * *` | Every day at 8 AM |
| Weekly | `0 8 * * 1` | Every Monday at 8 AM |
| Monthly | `0 8 1 * *` | First of every month at 8 AM |
| Custom | User-defined | Any valid cron expression |

### Execution Pipeline

```
BullMQ Cron Trigger
  → Load ScheduledReport
  → Load SavedReport definition
  → Execute query (with owner's permissions)
  → Generate export in specified format
  → Upload to Supabase Storage
  → Send email via Resend with file attachment
  → Update lastRunAt, lastRunStatus
```

### Scheduling Rules

| Rule | Detail |
|------|--------|
| Permission context | Scheduled reports run with the **owner's** permissions at execution time |
| Owner deactivated | If owner's account is deactivated, schedule auto-disabled |
| No data | If report returns zero rows, email sent with "No data for this period" message |
| Failure retry | Failed exports retry once after 15 minutes |
| Max recipients | 20 per schedule |
| Email provider | Resend (see `tech-stack.md`) |
| Max schedules per tenant | 50 |
