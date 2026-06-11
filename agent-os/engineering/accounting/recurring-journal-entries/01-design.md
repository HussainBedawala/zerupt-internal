# Recurring Journal Entries — Design

> Status: **Not implemented.** P3 priority — future phase.
> Route: `/accounting/recurring-entries`
> Schema: `packages/db/src/schema/recurring-journal-entry.ts` (does not exist yet)

## Purpose

Automate repetitive journal entries that recur on a fixed schedule: monthly rent, depreciation, insurance amortization, loan interest, salary accruals. Users define a template once; the system generates draft or auto-posted JEs each period.

---

## Table: `recurring_journal_entries`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | no | PK |
| tenantId | uuid | no | |
| legalEntityId | uuid | no | FK → legalEntities RESTRICT |
| name | varchar(200) | no | e.g. "Monthly Office Rent" |
| description / descriptionAlt | varchar(500) | yes | Bilingual EN/AR, copied to generated JE |
| frequency | enum | no | `monthly`, `quarterly`, `semi_annual`, `annual` |
| startDate | date | no | First occurrence |
| endDate | date | yes | NULL = indefinite |
| nextRunDate | date | no | Computed: next date a JE should be generated |
| dayOfMonth | smallint | yes | 1-28 for monthly. NULL for other frequencies. |
| autoPost | boolean | no | Default false. If true, generated JEs skip draft status. |
| status | enum | no | `active`, `paused`, `expired`, `cancelled` |
| lastGeneratedDate | date | yes | Last period for which a JE was generated |
| totalGenerated | integer | no | Default 0. Counter for audit. |
| currency | varchar(3) | no | ISO 4217 |
| createdBy / updatedBy | uuid | no/yes | |
| createdAt / updatedAt | timestamp | no | |

### Status Transitions

```
active → paused     (user pauses)
paused → active     (user resumes)
active → expired    (system: nextRunDate > endDate)
active → cancelled  (user cancels — soft delete)
paused → cancelled
```

### CHECK Constraints

- `dayOfMonth BETWEEN 1 AND 28` (avoids month-end edge cases)
- `endDate IS NULL OR endDate >= startDate`
- `nextRunDate >= startDate`

### Indexes

- `(legal_entity_id, status, next_run_date)` — batch generation query
- `(legal_entity_id, name)` — uniqueness within entity (unique constraint)

---

## Table: `recurring_journal_entry_lines`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | no | PK |
| recurringJournalEntryId | uuid | no | FK → recurringJournalEntries CASCADE |
| accountId | uuid | no | FK → accounts RESTRICT |
| lineNumber | smallint | no | |
| debit / credit | numeric(19,6) | no | Template amounts (functional currency) |
| description / descriptionAlt | varchar(500) | yes | Bilingual |

### CHECK Constraints

- `debit XOR credit` — same as regular JE lines
- `lineNumber > 0`

---

## Generation Service: `RecurringJournalEntryService`

### Method: `generateDueEntries(legalEntityId, asOfDate)`

Called by cron job or manual trigger. Steps:

```
1. SELECT * FROM recurring_journal_entries
   WHERE legal_entity_id = :legalEntityId
     AND status = 'active'
     AND next_run_date <= :asOfDate

2. For each template:
   a. Resolve fiscal period for next_run_date
      → If period locked or not found → skip, log warning, do NOT advance nextRunDate
   b. Build JE payload from template lines
      → Copy: description, currency, all lines with amounts
      → Set: postingDate = nextRunDate, source = 'auto', sourceDocumentType = 'RecurringEntry'
      → Set: sourceDocumentId = recurringJournalEntry.id
   c. If autoPost = true:
      → Call JournalPostingService.postFromEvent() (reuses posting pipeline)
   d. If autoPost = false:
      → Create JE with status = 'draft' for user review
   e. Update template:
      → lastGeneratedDate = nextRunDate
      → totalGenerated += 1
      → nextRunDate = computeNextDate(frequency, nextRunDate, dayOfMonth)
      → If nextRunDate > endDate → status = 'expired'

3. Return { generated: number, skipped: number, errors: RecurringError[] }
```

### Method: `computeNextDate(frequency, currentDate, dayOfMonth)`

| Frequency | Logic |
|-----------|-------|
| monthly | Add 1 month, set day to `dayOfMonth` |
| quarterly | Add 3 months, set day to `dayOfMonth` |
| semi_annual | Add 6 months, set day to `dayOfMonth` |
| annual | Add 12 months, keep same day |

Uses `date-fns` (already in project). Day clamping: if `dayOfMonth = 31` not allowed (CHECK constraint caps at 28).

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounting/recurring-entries` | List all for legal entity. Filter: status, frequency |
| GET | `/accounting/recurring-entries/:id` | Detail with lines |
| POST | `/accounting/recurring-entries` | Create template + lines |
| PATCH | `/accounting/recurring-entries/:id` | Update (only if no JEs generated, or only future-affecting fields) |
| POST | `/accounting/recurring-entries/:id/pause` | Set status = paused |
| POST | `/accounting/recurring-entries/:id/resume` | Set status = active, recalculate nextRunDate |
| POST | `/accounting/recurring-entries/:id/cancel` | Set status = cancelled |
| POST | `/accounting/recurring-entries/generate` | Manual trigger: generate all due entries for legal entity |
| GET | `/accounting/recurring-entries/:id/history` | List JEs generated from this template |

### Validation (Create/Update)

- Lines must balance (total debit = total credit)
- All accountIds must exist and be active
- At least 2 lines
- `dayOfMonth` required for monthly/quarterly/semi_annual
- `startDate` must fall in an existing fiscal year

---

## Cron Job

```json
// vercel.json (or BullMQ repeatable job for Railway)
{
  "schedule": "0 2 * * *",
  "path": "/api/cron/recurring-entries"
}
```

Cron handler:
1. Fetch all legal entities for tenant
2. Call `generateDueEntries(legalEntityId, today)` for each
3. Log results per entity
4. If any errors, emit `accounting.recurring.generationFailed` event (for alerting)

---

## UI Components

| Component | Notes |
|-----------|-------|
| RecurringEntryList | Table with status badge, frequency, next run date, actions |
| RecurringEntryForm | Template editor: header fields + line items (reuse JE line editor) |
| RecurringEntryHistory | Generated JEs list with links to the actual JE detail |
| GenerateButton | Manual trigger with confirmation dialog ("Generate all due entries?") |

---

## Audit & Safety

- Every generated JE links back via `sourceDocumentType = 'RecurringEntry'` + `sourceDocumentId`
- Cancelling a template does NOT reverse already-posted JEs
- Editing amounts only affects future generations (past JEs are immutable)
- `totalGenerated` counter provides quick audit without querying JE table
