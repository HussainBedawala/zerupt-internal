# Profit & Loss Report — Concepts

> DEV-288 · `GET tenant/reports/profit-and-loss` · built on the same shape as Trial Balance / Tax Summary.

## What a P&L actually is

A Profit & Loss statement (a.k.a. Income Statement) answers one question: **did the
business make money over a period?** It is a *flow* report — it covers a date range
(`periodStart`..`periodEnd`), unlike a Balance Sheet which is a *snapshot* at a point in
time. Everything in a P&L comes from the **income** and **expense** account types; assets,
liabilities, and equity never appear.

The standard multi-section layout:

```
Revenue                     (income accounts)
− Cost of Goods Sold        (the direct cost of what you sold)
= Gross Profit              ← how profitable the core selling activity is
− Operating Expenses        (rent, salaries, finance charges, tax, etc.)
= Net Profit                ← the bottom line
```

Gross Profit isolates the margin on goods; Net Profit folds in everything else. Splitting
COGS out from other expenses is what makes a P&L more useful than "revenue minus all costs".

## Where the numbers come from: the ledger, not a separate table

There is no "P&L table". The statement is *derived* by aggregating posted **journal entry
lines** grouped by account, then bucketing accounts by their `type` and `subType`. This is
the same source the Trial Balance reads — the P&L is just a different *grouping and
presentation* of the same posted ledger.

Key consequence: the P&L is always correct-by-construction as long as the ledger is. You
never "write" a P&L number; you compute it on demand.

## Sign conventions — the part that trips everyone up

Double-entry accounting assigns each account a **normal balance**:

- **Income** is *credit-normal* → its value for the period is `Σ(credit − debit)`.
- **Expense** is *debit-normal* → its value is `Σ(debit − credit)`.

This signed-sum approach has an elegant payoff: **contra accounts need no special handling**.
A Sales Returns account is `type=income` but carries a debit balance (returns reduce
revenue). Because we compute `credit − debit`, a returns account naturally comes out
*negative* and pulls the revenue total down. No `if (isContra)` branch required — the
arithmetic does it. A net loss likewise just falls out as a negative Net Profit.

## Why "posted only" matters

Journal entries have a lifecycle: `draft → posted → reversed`. Only **posted** entries are
real, finalized accounting facts. The report filters `status = 'posted'`, which excludes:

- **Drafts** — unfinished, may be wrong, must never hit a financial statement.
- **Reversed originals** — when an entry is reversed, the original is flagged `reversed`
  (excluded) and a *new posted reversal entry* with opposite debits/credits is created.
  Because the reversal is itself posted, it nets the original out to zero. You get
  correctness without ever mutating or deleting the original — an **immutable audit trail**.

A subtlety worth knowing: if a reversal is posted in a *later* period than the original,
the earlier period's P&L is **not** restated. Whether that's desired is an accounting-policy
question (most statutory regimes do *not* retroactively restate closed periods).

## Money precision: never use floats

Currency math with IEEE-754 floats silently corrupts (`0.1 + 0.2 ≠ 0.3`). Two defenses
used here:

1. **`Decimal.js`** for all arithmetic — arbitrary-precision decimal, 6-dp fixed strings.
2. **`::text` cast on SQL `SUM(...)`** — the Neon serverless driver would otherwise hand
   back a JavaScript `number` and lose precision *before* our code ever sees it. Casting to
   text in Postgres keeps the full-precision decimal intact across the wire.

## Multi-tenant safety: defense-in-depth

Zerupt runs one Postgres DB per tenant, but the code still filters `tenantId` on **every
table in every query** (journal entries, journal entry lines, accounts), not just via the
foreign-key joins. The reasoning: a missing or malformed FK relationship should never be
the *only* thing standing between two tenants' financial data. Belt and suspenders. The
report also scopes to a single `legalEntityId` because each legal entity keeps its own chart
of accounts and reports independently.

Two more guardrails:
- **Leaf accounts only** (`isHeader = false`): header/summary accounts are organizational
  nodes that never receive postings; including them risks double-counting.
- **Bounded date range** (`MAX_RANGE_DAYS`): an unbounded range would let one request scan
  the entire ledger — a denial-of-service vector. Capping the window bounds the work.

## Read-model design takeaway

A report endpoint is a **read model**: read-only, no migration, no writes, derived from
authoritative tables. The hard parts aren't the SQL — they're (1) getting sign conventions
right, (2) excluding non-final data, (3) preserving decimal precision end-to-end, and
(4) never letting one tenant or entity see another's numbers. Get those four right and the
"report" is the easy part.

## Related

- Trial Balance (DEV-241) — same ledger source, different grouping (by account hierarchy).
- Tax Summary (DEV-287) — sibling period-scoped financial report; shared query/validation shape.
- COGS posting is produced upstream by inventory events; the P&L only *reads* it.
