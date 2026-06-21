# 07 — Report Integrity and Pitfalls

## The danger with financial reports

A financial statement does not announce its own errors. A P&L with a sign error looks
exactly like a correct P&L: it has revenue, expenses, and a net income line. A balance
sheet that double-counts retained earnings still has two columns that total to the same
number. Reports can be materially wrong while looking completely plausible.

This chapter catalogs the failures that occur most often in ERP-generated reports, and
how to detect and prevent each one.

## Pitfall 1: Reports that do not tie to the trial balance

**The error:** A report is computed by querying a source other than the GL — a denormalized
summary table, an invoices table, a cached monthly aggregate — and the numbers do not
match what the TB shows.

**Why it happens:** Performance optimization. Querying millions of GL lines for every
report is slow. Teams cache results in summary tables. But cache invalidation is hard:
if a reversal is posted after the cache is written, the cache is stale; if an opening
balance entry is added retroactively, the cache misses it.

**How to detect it:** Always compare report totals to TB totals programmatically. For
the P&L: sum all income accounts (credit balance) and subtract all expense accounts
(debit balance) from the TB for the same period. Compare to P&L net income. Any
discrepancy is a defect.

**The fix:** Derive reports from the GL directly (not from secondary tables) wherever
possible. If performance requires caching, include a tie-out check in the cache-refresh
job that fails loudly if the cached total differs from the raw GL sum.

## Pitfall 2: Sign and classification errors

**The error:** An account is displayed with the wrong sign, or is included in the wrong
section of a report.

**Common cases:**
- A contra-revenue account (sales returns, credit notes) has a debit balance in the GL
  but is included in the expense section instead of deducting from revenue.
- An asset with a credit balance (accumulated depreciation, a contra-asset) is displayed
  as a positive number instead of a deduction.
- An income account with an unusual debit balance (a negative revenue, net of refunds)
  is shown as a positive expense.
- A balance-sheet account is accidentally classified as an income or expense account in
  the COA, and appears on the P&L.

**Why it matters:** A SAR 2,100 sales return classified as an expense makes gross profit
SAR 4,200 too high (the contra-revenue deduction is missing, and the expense line adds
it again on the wrong side of gross profit).

**How to detect it:** Account classification review. Every account code must be assigned
exactly one of: Revenue, Contra-Revenue, COGS, Operating Expense, Other Income, Other
Expense, Asset, Contra-Asset, Liability, Equity. The report query respects this
classification. A quarterly review of the COA classification, especially for newly added
accounts, catches misclassifications before they poison reports.

**The fix:** Enforce account-type classification at the COA level, not at the reporting
layer. The reporting layer should not hard-code "account codes 4000–4999 are revenue" —
it should read the type from the accounts master. This way a new account is automatically
classified correctly the moment it is added.

## Pitfall 3: Mis-rollup and double-counting

**The error:** A parent account aggregates child accounts, but one child account is also
included separately as a line item in the report — causing it to be counted twice.

**How it happens:** A developer writes a report query that sums a parent account group
AND explicitly adds one of the children because "we want to see it separately." The
child is now in the total twice.

**Another form:** Income from a reversal entry (where the original was an expense) is
counted both as a reduction of expenses and as other income. One account, two places.

**How to detect it:** The sum of all leaf-level account balances should equal the
balance of their root parent. If the P&L total net income does not match the net of
all income and expense accounts on the TB, there is mis-rollup.

**The fix:** Build the hierarchy traversal once, correctly. A report line that says
"show this account separately" must exclude it from any parent roll-up, or the parent
roll-up must be based solely on leaf accounts not already listed.

## Pitfall 4: Double-counting reversed journal entries

**The error:** A journal entry and its reversal are both included in a period report,
making the net effect appear as zero — but also making gross numbers look inflated.

**A more serious form:** The reversal is in a different period than the original, and
the period filter includes the reversal but not the original (or vice versa). The net
effect for the period is non-zero but wrong: it shows a credit or debit that is actually
an artifact of the reversal timing, not a real economic event.

**Concrete example:**

Period: June 2025. Entries:
```
JE-0100: 1 June — DR Rent Expense 6,000 / CR Accrued Rent 6,000  (accrual)
JE-0101: 1 June — DR Accrued Rent 6,000 / CR Rent Expense 6,000  (reversal of May accrual)
```

If both entries are in June and included in the P&L, they net to zero — the June P&L
shows no rent expense. That is correct. But if JE-0101 (the reversal) was originally
dated 31 May and a period-end cutoff issue moved it to 1 June, the May P&L shows the
accrual but not the reversal, and June shows the reversal without the matching expense.
Both months are wrong.

**The filter:** All P&L and balance-sheet queries must filter to entries where
`status = 'posted' AND reversal_of IS NULL OR reversal_status != 'reversed'`.

More precisely, the correct approach is:
- Include all posted entries.
- A reversal pair (original + reversal) nets to zero for the combined period.
- For a period report, include both the original and the reversal if both fall in the
  period — they net to zero as intended.
- Exclude entries whose status is 'void' or 'draft' (not yet posted).
- Never exclude "reversed" entries from queries — a reversed entry is a real posted
  entry; its reversal entry is separately posted. Both belong in the period they fall in.

The common mistake: filtering out entries where `is_reversed = true`. This removes the
original entry but keeps the reversal, netting to an incorrect result.

## Pitfall 5: Period boundary off-by-one

**The error:** The period end date is used with a strict less-than (`<`) instead of
less-than-or-equal (`<=`), causing entries posted on the last day of the period to be
excluded.

**Why it hurts:** Year-end is 31 December. The largest sale of the year is posted on
31 December. The year-end P&L query uses `posted_date < '2026-01-01'`. This correctly
includes 31 December because '2025-12-31' < '2026-01-01'. So in this case it works.

But if the query uses `posted_date <= '2025-12-30'` (off by one in the constant), the
entire last day is missing. Or if the end date is stored as a timestamp and entries are
posted at `2025-12-31 23:59:59` against a filter of `< 2025-12-31 00:00:00`, the
entries fall outside.

**The fix:** Use date-only comparisons (not timestamps) for period filters, and use
`<= period_end_date` (inclusive) for all period end conditions. Validate the period
boundaries by running a count of entries on the first and last day of the period and
confirming they are included.

## Pitfall 6: Currency mixing

**The error:** Balances in different currencies are added together without conversion.
A SAR 100,000 receivable and a USD 100,000 receivable are summed to "200,000" — in what
currency?

**How it happens:** A query aggregates GL lines without filtering to functional currency
or without applying exchange rates. Foreign-currency amounts (stored in original currency
in the `foreign_amount` column) are summed against functional-currency amounts in the
`amount` column.

**How to detect it:** Any report total should have a clear currency label. If the sum of
AR aging across all customers includes USD amounts added to SAR amounts without conversion,
the total is meaningless.

**The fix:** All GL lines store two amounts: the original foreign-currency amount
(`foreign_amount`, `foreign_currency`) and the functional-currency equivalent (`amount`,
`currency`). Report queries always sum the functional-currency `amount` column, never
the `foreign_amount`. Sub-reports that show foreign-currency detail are clearly labeled
and not added into the functional-currency total.

## Pitfall 7: Including draft or unposted entries

**The error:** A report includes journal entries that are in draft status — not yet
reviewed and posted. This makes the P&L show revenue or expense that has not been
formally recognized.

**Why it happens:** A developer queries the `journal_entries` table without a status
filter, inadvertently including `status = 'draft'` entries.

**The fix:** Every report query must include `WHERE status = 'posted'`. This should be a
non-negotiable default in the reporting layer — draft entries are never included in any
financial statement. Reports designed to show drafts (e.g., a preview before posting)
must be clearly labeled as such and must not be confused with the authoritative report.

## Pitfall 8: Missing accounts

**The error:** A new account code is added to the COA (e.g., a new expense category
during the year), but it is not included in any report query because the query hard-codes
a list of account codes or account code ranges.

**Why it hurts:** The TB balances (because the new account has entries), but the P&L
does not show those entries. The net income on the P&L is higher (or lower) than it
should be. The difference equals the balance of the missing account.

**How to detect it:** The TB tie-out: if the sum of income minus expense accounts on the
TB does not equal the P&L net income, an account is missing from the P&L query.

**The fix:** Report queries should derive their account list from the COA classification
(account type = 'expense'), not from hard-coded ranges. Any account classified as
'expense' in the COA is automatically included in the P&L query, even if added after
the report was built.

## Pitfall 9: Year-end close entry polluting prior-year P&L

**The error:** The year-end close entry (which zeros income/expense accounts by posting
to retained earnings) is included in the prior-year P&L query. The result: all income and
expense accounts show zero for the year (they were cancelled by the close entry).

**How to detect it:** Run the prior-year P&L. If net income is zero but the balance sheet
shows non-zero retained earnings, the P&L query is likely including the close entry.

**The fix:** Tag year-end close entries with `entry_type = 'year_end_close'` and exclude
them from P&L period queries. The balance sheet query should include them (because the
retained earnings balance must reflect the closed net income).

## The integrity checklist

Run these checks before publishing any report:

| Check | How |
|-------|-----|
| TB balances (SUM debits = SUM credits) | Query GL totals before running any report |
| P&L net income = TB income/expense net | Compare P&L bottom line to TB account net |
| Balance sheet balances (Assets = L + E) | Compare both sides of BS |
| AR aging total = AR control account | Sum aging buckets vs TB account 1131 |
| AP aging total = AP control account | Sum aging buckets vs TB account 2111 |
| Cash flow closing cash = BS cash | Compare CF end cash to bank/cash accounts on BS |
| All accounts classified in COA | No account with a balance missing from any report |
| No draft entries in reports | All queries filter to status = 'posted' |
| Period boundaries inclusive | Run spot check: count entries on first and last day |
| FX revaluation run before BS | Check revaluation log for the period |

## The mental model

> A financial statement that cannot be independently verified against the trial balance
> is not trustworthy, regardless of how professional it looks. The TB is the ground truth.
> Every report total must match the corresponding TB aggregation. The most common bugs
> are not calculation errors — they are filter errors: wrong status filters, off-by-one
> date boundaries, missing accounts, currency mixing. These are invisible to the reader
> of the report; only systematic tie-out testing exposes them.

Next: `08-summary.md`.
