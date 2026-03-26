# Journal Entries — Schema Design

> Schema: `packages/db/src/schema/journal-entry.ts`

## Table: `journal_entries`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | no | PK |
| tenantId | uuid | no | No FK (admin DB) |
| legalEntityId | uuid | no | FK → legalEntities RESTRICT |
| fiscalPeriodId | uuid | no | FK → fiscalPeriods RESTRICT |
| branchId | uuid | yes | FK → branches RESTRICT |
| entryNumber | varchar(50) | yes | NULL for drafts, assigned at posting |
| postingDate | date | no | |
| description / descriptionAlt | varchar(500) | yes | Bilingual EN/AR |
| status | enum | no | draft / posted / reversed |
| source | enum | no | manual / auto |
| currency | varchar(3) | no | ISO 4217, regex `^[A-Z]{3}$` |
| exchangeRate | numeric(18,10) | no | Default '1' |
| totalDebit / totalCredit | numeric(19,6) | no | Denormalized, default '0' |
| sourceDocumentType | enum | yes | e.g. SalesInvoice, GRN |
| sourceDocumentId | uuid | yes | |
| sourceDocumentNumber | varchar(100) | yes | Human-readable |
| eventId | uuid | yes | Idempotency key |
| correlationId | uuid | yes | Groups related entries |
| reversalOfEntryId | uuid | yes | Self-FK: "I reverse this entry" |
| reversedByEntryId | uuid | yes | Self-FK: "I was reversed by this entry" |
| postedAt / postedBy | timestamp/uuid | yes | Set on posting |
| createdBy / updatedBy | uuid | no/yes | Audit |

### Key CHECK Constraints

| Rule | Constraint |
|------|-----------|
| Posted must balance | `status != 'posted' OR total_debit = total_credit` |
| Posted must be non-zero | `status != 'posted' OR total_debit > 0` |
| Posted requires metadata | `posted_at`, `posted_by`, `entry_number` all NOT NULL when posted |
| No self-reversal | `reversal_of_entry_id != id` |
| Cannot be both reversal and reversed | NOT both non-null |
| Reversed must have link | `status = 'reversed' → reversed_by_entry_id IS NOT NULL` |
| Reversal must be posted | `reversal_of_entry_id IS NOT NULL → status = 'posted'` |

### Key Indexes

- **Unique (partial):** `(legal_entity_id, entry_number) WHERE entry_number IS NOT NULL` — gap-free numbering
- **Unique (partial):** `(event_id) WHERE event_id IS NOT NULL` — idempotency
- **Composite:** `(legal_entity_id, status, posting_date)` — list queries
- **Partial:** `(legal_entity_id, created_at) WHERE status = 'draft'` — draft inbox

## Table: `journal_entry_lines`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | no | PK |
| tenantId | uuid | no | |
| journalEntryId | uuid | no | FK → journalEntries RESTRICT |
| accountId | uuid | no | FK → accounts RESTRICT |
| branchId | uuid | yes | Per-line branch override |
| costCenterId | uuid | yes | Future (no FK yet) |
| taxCodeId | uuid | yes | FK → taxCodes RESTRICT |
| lineNumber | smallint | no | Unique per entry |
| postingDate | date | no | Denormalized from header |
| debit / credit | numeric(19,6) | no | Functional currency |
| debitTC / creditTC | numeric(19,6) | no | Transaction currency |
| currency | varchar(3) | no | ISO 4217 |
| exchangeRate | numeric(18,10) | no | Line-level rate |
| exchangeRateDate | date | yes | IAS 21 sourcing date |
| taxAmount / taxAmountTC | numeric(19,6) | yes | FC and TC |
| description / descriptionAlt | varchar(500) | yes | Bilingual |

### Key CHECK Constraints

- `debit XOR credit` — cannot have both > 0
- `debitTC XOR creditTC` — same for transaction currency
- At least one amount pair must be > 0
- `lineNumber > 0`

### Key Indexes

- **Composite:** `(account_id, posting_date)` — GL drill-down queries
- **Unique:** `(journal_entry_id, line_number)`

## Design Decisions

- **Dual amounts:** FC (functional) + TC (transaction) on every line. IAS 21 compliant.
- **Lines are immutable** — no `updatedAt` column. Corrections via reversal only.
- **Entry numbers NULL for drafts** — prevents gaps from abandoned drafts. Assigned atomically at posting via `DocNumberingService`.
- **Precision:** `numeric(19,6)` for amounts (handles KWD 3 decimals + headroom), `numeric(18,10)` for rates (handles IDR/KWD extreme ratios).
