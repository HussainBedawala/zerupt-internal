# Journal Entry Schema Design

## Double-Entry Bookkeeping in Databases

The fundamental accounting equation: **Assets = Liabilities + Equity**. Every transaction must have equal debits and credits. In a database, this is enforced via:

1. **Separate debit/credit columns** (not a signed amount) — accountants think in debit/credit, not positive/negative
2. **CHECK constraint** on the header: `total_debit = total_credit` — enforces balance at the storage layer
3. **XOR constraint** on lines: each line is either a debit OR a credit, never both

## Immutability Pattern

Posted journal entries are never modified or deleted. Corrections are made via **reversal entries** — a new entry with debits and credits swapped, linked to the original via a bidirectional self-FK (`reversal_of_entry_id` ↔ `reversed_by_entry_id`).

Why not just update? Audit trail. Every state change is a new record, creating a complete history.

## IAS 21: Multi-Currency in Journal Entries

International Accounting Standard 21 governs foreign currency transactions:

- **Functional currency**: the entity's reporting currency (e.g., AED for a UAE company)
- **Transaction currency (TC)**: the original transaction currency (e.g., USD for a US supplier payment)

Every journal entry line stores both:
- `debit`/`credit` — functional currency amounts (for financial statements)
- `debitTC`/`creditTC` — transaction currency amounts (original values)
- `exchange_rate` — conversion factor used

Naming matters: "FC" in IFRS means Functional Currency, not Foreign Currency. Use "TC" for Transaction Currency to avoid confusion.

## Gap-Free Sequential Numbering

Tax authorities require gap-free journal entry numbers (JE-0001, JE-0002, ...). The key insight: **assign numbers at posting time, not at draft creation**. This prevents gaps from abandoned drafts.

Implementation: `UPDATE document_sequences SET next_number = next_number + 1 ... RETURNING next_number` — atomic, lock-safe, single round trip.

## Idempotency for Auto-Generated Entries

Business events (e.g., `sales.invoice.confirmed`) produce journal entries automatically. If the same event is processed twice (network retry, queue replay), only one JE should be created.

Solution: **partial unique index** on `event_id WHERE event_id IS NOT NULL`. Manual entries have no `event_id`, so multiple NULLs are allowed.

## Index Strategy for Accounting Queries

Key queries and their indexes:

| Query | Index Pattern | Why |
|-------|--------------|-----|
| JE list (entity + date) | `(legal_entity_id, status, posting_date)` | Equality columns before range/sort |
| Trial balance | `(legal_entity_id, fiscal_period_id, status)` | All equality filters |
| Account ledger | `(account_id, posting_date)` on lines | Date-sorted per account |
| Draft queue | Partial index `WHERE status = 'draft'` | Tiny index, rare rows |

Rule: equality-filtered columns lead, range/sort columns follow.

## Denormalization Trade-offs

Two deliberate denormalizations in this schema:

1. **`total_debit`/`total_credit` on header** — avoids aggregating all lines on every read. Maintained atomically in the same transaction as line inserts.
2. **`posting_date` on lines** — eliminates the header join on every account ledger query.

Both require service-layer discipline to keep in sync with source data.
