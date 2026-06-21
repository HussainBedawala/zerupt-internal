# 09 — How Zerupt Implements Layer 0

> This chapter maps the concepts (Chapters 01–08) onto our actual code, from a code audit on
> 2026-06-20. File references are real. Use this as the bridge from theory to our system.

## The tables

**`journal_entries`** (header) and **`journal_entry_lines`** (lines) live in
`packages/db/src/schema/journal-entry.ts`. Accounts live in
`packages/db/src/schema/chart-of-accounts.ts`. Enums in `packages/db/src/schema/enums.ts`.

- Header carries: status (`draft|posted|reversed`), source (`manual|auto`), posting date, fiscal
  period, legal entity, currency + exchange rate, denormalized `total_debit`/`total_credit`,
  source-document reference, `event_id` (idempotency), reversal links, audit columns.
- Lines carry: account, `debit`/`credit` (functional), `debit_tc`/`credit_tc` (transaction
  currency), currency + rate + rate-date (IAS 21), tax metadata, party (AR/AP), branch, cost
  center. No `updated_at` — lines are write-once (Chapter 07).

## How each Layer 0 concept is enforced

| Concept (chapter) | How Zerupt enforces it | Where |
|-------------------|------------------------|-------|
| Balance Σdr=Σcr (01,04) | DB CHECK `je_posted_balanced_check` + code check in engine | schema + `journal-posting.service.ts:292` |
| Debit XOR credit per line (04) | DB CHECK `jel_debit_xor_credit_check` | schema lines ~437 |
| Non-negative amounts (04,06) | DB CHECKs on debit/credit/_tc | schema |
| Five account types + normal balance (02,03) | `account_type` & `normal_balance` enums; `normalBalance` column; `DEFAULT_NORMAL_BALANCE` map | chart-of-accounts.ts |
| Post only to leaf accounts (03) | `isHeader` flag; checked in draft path | `journal-entry-draft.service.ts:484` (NOT in auto path — gap) |
| Money as decimal, not float (06) | `numeric(19,6)` columns; Decimal.js precision 28, banker's rounding | schema + engine |
| Dual currency / IAS 21 (06) | `debit_tc/credit_tc`, `exchange_rate(18,10)`, `exchange_rate_date` | schema |
| Immutability (07) | DB triggers block UPDATE/DELETE of posted/reversed; column allowlist for reversal | migrations 0002 + 0091 |
| Reversal (07) | swap dr/cr, post to today, bidirectional links, SELECT FOR UPDATE | `journal-reversal.service.ts` |
| Atomic write (08) | header+lines+number in one `db.transaction` | `journal-posting.service.ts` |
| Transactional outbox (08) | `accounting_event_outbox` written inside source tx; poller → event | `accounting-events/` |
| Idempotency (08) | partial unique index on `event_id`; outbox unique key; duplicate-error handling | schema + engine |

## The posting paths (important nuance)

There is **one chokepoint for automated business events**:
`JournalPostingService.postFromEvent` (`journal-posting.service.ts`), reached via the
`accounting.post` event. POS, sales, purchase, GRN, payments, etc. funnel through it.

But there are **five other paths that write to the ledger directly**, each with its own
validation:
1. `journal-reversal.service.ts` — reversals
2. `journal-entry-draft.service.ts` — manual entries
3. `year-end-closing.service.ts` — closing entries
4. `opening-balance.service.ts` — opening balances (GL/AR/AP)
5. `inventory-reconciliation.service.ts` — stock value corrections

These exist for legitimate reasons (they don't have an event payload shape), but their validation
**diverges** — some check `isHeader`, some assert balance, some don't. The 10-year fix is to give
the posting service a second low-level entry point (`postDirect(header, lines, tx)`) that ALL
special paths call, so validation lives in one place. (See the audit report for the full list.)

## What's solid vs what needs hardening (summary)

**Solid:** DB-enforced balance + immutability + idempotency; proper reversals; Decimal.js
precision; dual-currency; transactional outbox with dead-letter/retry; thorough tests for the auto
path, reversal, period control, FX math, year-end close.

**Needs hardening (tracked separately):**
- COGS, FX-revaluation, POS, cheque postings use fire-and-forget emit instead of outbox → an entry
  can be lost on a crash.
- Auto path doesn't check `isHeader`.
- No DB CHECK guaranteeing posted balance is *also* defended against raw SQL (code-only in some
  paths); the header CHECK covers `total_debit=total_credit` but special paths set those totals.
- `commitReservation` runs outside the transaction in opening-balance / year-end / recon.
- TC-side balance not asserted for mixed-rate entries.
- Sub-type and contra/normal-balance validity not DB-enforced; fiscal-period lock not DB-enforced.

These are the inputs to the Layer 0 bulletproofing plan. None are dead code — the module is clean.

## How to read the code, fast

1. Schema first: `packages/db/src/schema/journal-entry.ts` (the shape + all CHECKs).
2. The engine: `apps/api/src/journal-entries/journal-posting.service.ts` (`postFromEvent`).
3. The guarantees: migrations `0002_immutability_triggers.sql`, `0091_ledger_header_immutability.sql`.
4. The tests: `apps/api/src/journal-entries/*.spec.ts` and
   `apps/api/src/__tests__/integration/ledger-immutability.integration.spec.ts`.
