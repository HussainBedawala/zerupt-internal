# Pre-Closing Checklist — Year-End Closing Readiness

## What is a pre-closing checklist?

Before closing a fiscal year, accountants run through a series of advisory checks to ensure the books are ready. These checks don't block the close — they're warnings that highlight potential issues.

## The 7 Standard Checks

1. **All periods locked** — Every month in the fiscal year should be at least soft-locked (no new transactions allowed). This prevents accidental postings to a year being closed.

2. **Bank accounts reconciled** — All bank statement balances should match the GL. Unreconciled differences indicate missing or duplicate transactions.

3. **Tax returns filed** — VAT/GST returns for each period should be filed before closing. Closing before filing can complicate amendments.

4. **No draft journal entries** — Draft JEs within the fiscal year date range indicate unfinished work. They should be posted or deleted.

5. **No pending stock counts** — Physical inventory counts in progress at year-end need resolution before closing, as they affect COGS and inventory valuations.

6. **Trial balance balanced** — Total debits must equal total credits across all posted entries. This is a defense-in-depth check — the DB enforces per-entry balance via CHECK constraints, but cumulative verification catches data corruption.

7. **No inventory in transit** — Account 1142 (Inventory in Transit) should have a zero balance at year-end. Non-zero means goods are still between locations and their cost hasn't settled.

## Key Concepts

### Cumulative vs. Period-Scoped Checks
- **Trial balance** and **inventory in transit** are checked cumulatively from inception to FY end date — not just within the fiscal year. This catches issues carried forward from prior periods.
- **Draft JEs** are checked within the fiscal year date range only — drafts in other years aren't relevant.

### Multi-Entity Scoping
In a multi-entity tenant (e.g., a retailer with separate legal entities for wholesale vs. retail), every check must be scoped to the specific legal entity of the fiscal year. Without this, Entity A's drafts could block Entity B's close.

### Soft-Lock vs. Hard-Lock
- **Soft-locked**: No new transactions, but authorized users can override
- **Hard-locked**: Absolutely no changes without reopening
- The pre-closing check requires at minimum soft-lock on all periods

### Skipped Checks
When a module isn't built yet (bank reconciliation, tax returns, inventory counting), the check returns `status: "skipped"` rather than `passed: true`. This prevents inflating the pass count and makes it clear the check wasn't actually performed.

## Precision in Financial Comparisons
Never use floating-point arithmetic (`===`, `==`) for monetary comparisons. Use `Decimal.js` with string inputs from Postgres `numeric` columns to avoid IEEE 754 precision loss. A balance of `0.1 + 0.2 !== 0.3` in JavaScript but `new Decimal("0.1").plus("0.2").equals("0.3")` is true.
