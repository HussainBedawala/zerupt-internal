# Fiscal Periods — Schema & Generation

> Schema: `packages/db/src/schema/fiscal.ts`
> Generator: `apps/api/src/fiscal-period/period-generator.ts`

## Tables

### `fiscal_settings` (singleton per legal entity)

| Column | Type | Notes |
|--------|------|-------|
| legalEntityId | uuid | PK + FK → legalEntities |
| tenantId | uuid | |
| fiscalYearStartMonth | smallint | 1-12, CHECK enforced |
| periodClosePolicy | enum | open / soft_locked / hard_locked — default for new periods |
| allowSoftLockOverride | boolean | Default false |
| softLockOverrideRoles | uuid[] | Role UUIDs allowed to override |

### `fiscal_years`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenantId, legalEntityId | uuid | |
| label | varchar(50) | "FY 2026" or "FY 2026-2027" |
| startDate, endDate | date | |
| isClosed | boolean | Default false |
| closedAt, closedBy | timestamp/uuid | Set on close |
| closingEntryId | uuid | Links to year-end JE |

Unique: `(tenant_id, legal_entity_id, start_date)`

### `fiscal_periods`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenantId, fiscalYearId, legalEntityId | uuid | |
| periodNumber | smallint | 1-12, CHECK enforced |
| label | varchar(50) | "Jan 2026", "Apr 2026" |
| startDate, endDate | date | |
| status | enum | open / soft_locked / hard_locked |
| lockedAt, lockedBy | timestamp/uuid | Set on lock |

Unique: `(fiscal_year_id, period_number)`. Index: `(tenant_id, legal_entity_id, start_date, end_date)` for date lookups.

## Period Generation Algorithm

```
Input: startMonth (1-12), calendarYear
Output: 12 frozen periods

for i in 0..11:
  month = (startMonth - 1 + i) % 12
  year  = calendarYear + floor((startMonth - 1 + i) / 12)
  start = UTC(year, month, 1)
  end   = UTC(year, month+1, 0)  // day 0 = last day of prev month (handles leap years)
```

Label format: `"FY 2026"` (Jan start) or `"FY 2026-2027"` (non-Jan start).

## Country Defaults

| Country | Start Month |
|---------|-------------|
| India, NZ, GB, JP | April (4) |
| Australia | July (7) |
| UAE, Saudi, Singapore, Malaysia, all others | January (1) |

Auto-applied via `@OnEvent("settings.legal-entity.created")`.
