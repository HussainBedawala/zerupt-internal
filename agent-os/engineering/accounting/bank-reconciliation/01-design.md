# Bank Reconciliation — Design

> Status: **Not implemented.** No schema, no service, no UI.
> Product spec: `product/accounting/10-bank-reconciliation.md`
> Route: `/accounting/bank-reconciliation`

## Schema (new tables)

### `bank_statements`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenantId, legalEntityId | uuid | |
| bankAccountId | uuid | FK → accounts (must be bank-type account) |
| statementDate | date | |
| periodStart, periodEnd | date | Statement coverage period |
| openingBalance, closingBalance | numeric(19,6) | Bank's reported balances |
| status | enum | draft / in_progress / reconciled |
| reconciledAt, reconciledBy | timestamp/uuid | Set on completion |
| importSource | enum | csv / manual |

### `bank_statement_lines`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| statementId | uuid | FK → bankStatements |
| date | date | Transaction date |
| description | varchar(500) | Bank's description |
| reference | varchar(100) | Cheque #, transfer ref |
| amount | numeric(19,6) | Positive = in, Negative = out |
| matchStatus | enum | unmatched / matched / reconciled / no_match_needed |
| matchedJournalEntryLineId | uuid | FK → journalEntryLines (nullable) |
| noMatchReason | varchar(500) | Required when no_match_needed |

### `bank_csv_mappings` (per bank account)

| Column | Type | Notes |
|--------|------|-------|
| bankAccountId | uuid | PK (one mapping per bank account) |
| tenantId | uuid | |
| dateColumn, descriptionColumn, amountColumn, referenceColumn | smallint | Column indexes |
| dateFormat | varchar(50) | e.g. `DD/MM/YYYY` |
| skipHeaderRows | smallint | Default 1 |

## Backend — Endpoints

| Method | Route | Permission |
|--------|-------|-----------|
| POST | `/tenant/bank-statements` | `accounting.bank.create` |
| POST | `/tenant/bank-statements/import-csv` | `accounting.bank.create` |
| GET | `/tenant/bank-statements?bankAccountId=` | `accounting.bank.read` |
| GET | `/tenant/bank-statements/:id` | `accounting.bank.read` |
| POST | `/tenant/bank-statements/:id/auto-match` | `accounting.bank.reconcile` |
| POST | `/tenant/bank-statements/:id/match-line` | `accounting.bank.reconcile` |
| POST | `/tenant/bank-statements/:id/unmatch-line` | `accounting.bank.reconcile` |
| POST | `/tenant/bank-statements/:id/no-match` | `accounting.bank.reconcile` |
| POST | `/tenant/bank-statements/:id/reconcile` | `accounting.bank.reconcile` |
| GET | `/tenant/bank-statements/:id/summary` | `accounting.bank.read` |

## Auto-Match Algorithm

Run in priority order, stop on first match per line:

| # | Method | Logic |
|---|--------|-------|
| 1 | Exact amount + reference | `ABS(line.amount) = jel.debit OR jel.credit` AND `line.reference = je.sourceDocumentNumber` |
| 2 | Exact amount + date | `ABS(line.amount) match` AND `ABS(line.date - jel.postingDate) <= 2 days` |
| 3 | Cheque number | `line.reference` matches cheque number pattern in JE description |

Auto-matches set `matchStatus = matched` (not reconciled). User must confirm.

## Reconciliation Summary

```
System book balance (GL account balance)
+ Deposits in transit (matched but not yet in bank)
- Outstanding cheques (issued but not cleared)
= Adjusted book balance

Bank statement closing balance
+ Unrecorded deposits (in bank, not in system)
- Unrecorded withdrawals (in bank, not in system)
= Adjusted bank balance

Difference = Adjusted book - Adjusted bank → MUST BE ZERO
```

Cannot complete reconciliation if difference ≠ 0.

## Frontend — 3-Step Wizard

**Step 1: Import** — CSV upload with column mapping UI, or manual entry table. Preview before import.

**Step 2: Match** — Split view: bank lines (left) | system JE lines (right). Auto-match button runs algorithm, shows results for confirmation. Manual match via drag-and-drop or checkbox pairing. "Create JE" button for unrecorded bank items (charges, direct debits). "No match needed" with mandatory reason.

**Step 3: Reconcile** — Summary table (as above). Confirm button (disabled if difference ≠ 0). On confirm: all matched lines → reconciled, statement → reconciled.

## Carry-Forward

Outstanding items (unmatched from previous period) auto-appear in next period's reconciliation.
