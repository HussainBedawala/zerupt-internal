# 06 — Comparatives and Periods

## Why period selection matters

Every financial report is inherently bounded by time. "What was revenue?" is a meaningless
question without "during which period?" A balance sheet without a date is equally
meaningless. Period selection is not a UI detail — it is the foundation that determines
what data the report includes and what it excludes.

Get the period wrong and the report is wrong. A P&L that accidentally includes one extra
day of another accounting period will show inflated revenue. A balance sheet generated
the day before a large payment is received will show more receivables than one generated
the next day. These are not display glitches; they are reporting errors.

## The fiscal year

A fiscal year is a 12-month accounting period defined by the business. It does not have
to be the calendar year. Common choices:

| Country / Convention | Common Fiscal Year |
|----------------------|--------------------|
| Saudi Arabia | 1 Jan – 31 Dec (or 1 Hijri month – 12th) |
| UAE / GCC general | 1 Jan – 31 Dec |
| India | 1 Apr – 31 Mar |
| Many multinationals | 1 Jul – 30 Jun |

The fiscal year determines:
- When income and expense accounts are closed to retained earnings (year-end close)
- The boundary for "this year" vs "last year" comparatives
- The opening balance date for a new year's balance sheet

The ERP must know the fiscal year definition for each tenant and enforce it consistently.
A query for "current year P&L" must use the fiscal year start date, not 1 January, unless
1 January is the fiscal year start for that tenant.

## Fiscal periods within the year

Most businesses divide the fiscal year into monthly periods (12 periods per year). Some
use 13 periods (4-week periods) or quarterly periods. Each period has:
- A period number (1–12 for monthly)
- An open date (first day of the period)
- A close date (last day of the period)
- A status: open, soft-closed, hard-closed, or locked (covered in Layer 4, Chapter 03)

Reports should be designed to accept either a period identifier (e.g., "Period 6 of FY
2025") or a specific date range. When a period identifier is used, the system maps it
to the exact start and end dates — no ambiguity.

## Period-scoped reports (flows)

The income statement and the cash flow statement are **flow reports** — they show what
happened between a start date and an end date. The query filters journal-entry lines to
those posted within the period:

```
WHERE posted_date >= period_start
  AND posted_date <= period_end
  AND status = 'posted'
  AND reversal_status != 'reversed'
```

The `period_end` must be inclusive. Off-by-one errors here are notorious: entries posted
on the last day of the month must be included. If the query uses `< period_end` instead
of `<= period_end`, the last day of the period is excluded — a one-day error that can
involve a month's worth of sales posted on the 31st.

## Point-in-time reports (balances)

The balance sheet is a **balance report** — it shows account balances at a single date.
The query aggregates all journal-entry lines posted up to and including the report date:

```
WHERE posted_date <= report_date
  AND status = 'posted'
  AND reversal_status != 'reversed'
```

Note: there is no start date for a balance report. The balance is cumulative from the
beginning of the books. Opening balances (Layer 4, Chapter 02) are simply journal entries
with a posted date equal to the opening date, and they are included automatically.

## Year-to-date (YTD) vs period

When a report is described as "YTD through June," it means: flows from the start of the
fiscal year through 30 June. This is not the same as the June period report (flows
during June only).

| Report | Date filter |
|--------|------------|
| June period P&L | `posted_date >= 1 Jun AND posted_date <= 30 Jun` |
| YTD P&L through June | `posted_date >= 1 Jan (fiscal start) AND posted_date <= 30 Jun` |
| Balance sheet at 30 June | `posted_date <= 30 Jun` |

YTD revenue is always larger than (or equal to) a single period's revenue. A manager
comparing a single month's P&L to a YTD P&L is looking at two different things and must
not be confused about which is which. The report header must be unambiguous.

## Comparative periods

A comparative period is a prior period shown alongside the current period for context.
There are two common comparative structures:

**Prior year same period (YoY):** Compare June 2025 to June 2024. Useful for identifying
seasonal trends and growth.

**Prior period (MoM or sequential):** Compare June 2025 to May 2025. Useful for
identifying sudden changes in trading.

Both comparatives run the same query structure, just with different date parameters.
The comparative period must use the same account classification and the same status
filter as the current period. If the current period excludes reversed entries, the
comparative must too.

A balance sheet comparative shows two columns: balance at current date and balance at
prior year-end (the standard IFRS presentation). The prior year-end balance is a
point-in-time query as of the last day of the prior fiscal year.

## Opening balances in reports

At the start of a new fiscal year, the balance sheet must show the correct opening
position. This is not computed by the reporting system — it is the result of the prior
year's:
1. Year-end close (income and expense accounts zeroed, net income rolled to retained
   earnings)
2. Opening balance carry-forward (the closing balance sheet of the prior year becomes
   the opening balance sheet of the new year for balance-sheet accounts)

The first-day balance sheet of a new fiscal year should be identical to the last-day
balance sheet of the prior fiscal year for all balance-sheet accounts. The income
statement for the new fiscal year starts at zero because income and expense accounts
were closed.

If a business is converting from manual books or a prior ERP, opening balances are
established via an opening journal entry (Layer 4, Chapter 02). The balance sheet at
the opening date should show those balances and zero income/expense.

## Handling mid-year reporting

Management often wants reports for non-standard periods:
- "Show me Q2 (April–June)" — a 3-month period
- "Show me the last 12 months rolling" — not a fiscal year
- "Show me since we opened the new Riyadh location in March" — a partial year

All of these are valid queries on the same GL. The reporting engine should support
arbitrary start and end dates, with the understanding that:
- A P&L for a non-standard period may not add up to the full-year P&L if the period
  boundaries don't align with fiscal period starts and ends.
- A balance sheet at a mid-year date is valid: it shows balances at that date.
- A cash flow statement for a non-standard period is valid as long as opening and closing
  cash balances are correctly computed.

## Fiscal year boundaries and the close gate

When querying P&L accounts for a prior fiscal year, the query must only include entries
up to and including the last day of that fiscal year — not including the year-end close
entry itself (or rather, the year-end close entry nets to zero against the P&L accounts).

In practice: after the year-end close, the income and expense account balances for the
prior year are zero (the close entry wiped them). A P&L query for the prior year must
therefore be based on the closing balances before the close entry, or equivalently,
the query must exclude the year-end close entry (which is typically tagged as
`entry_type = 'year_end_close'`).

This is a subtle but important point. If the year-end close entry is included in the
prior-year P&L query, all revenues and expenses will appear to be zero (they were closed
to retained earnings). The report must exclude the close entry for period P&L queries.

## Worked example

Fiscal year: 1 Jan – 31 Dec 2025. Monthly periods.

| Report requested | Date parameters | Entry filter |
|------------------|-----------------|-------------|
| June 2025 P&L | start: 1 Jun 2025, end: 30 Jun 2025 | posted, non-reversed, exclude YE-close |
| H1 2025 P&L (YTD) | start: 1 Jan 2025, end: 30 Jun 2025 | posted, non-reversed, exclude YE-close |
| Balance sheet at 30 Jun 2025 | as-at: 30 Jun 2025 | all posted non-reversed (cumulative) |
| Comparative: June 2024 P&L | start: 1 Jun 2024, end: 30 Jun 2024 | posted, non-reversed, exclude YE-close |
| Comparative: BS at 31 Dec 2024 | as-at: 31 Dec 2024 | all posted non-reversed (includes FY2024 close) |

Note the last row: the balance sheet at year-end INCLUDES the year-end close entry,
because the close entry moves net income into retained earnings. That is the correct
closing balance sheet. It is only the P&L query that should exclude the close entry.

## The mental model

> Period selection is not a filter — it is the definition of what the report measures.
> Flow reports (P&L, cash flow) have a start date and an end date; balance reports
> (balance sheet) have only an as-at date. YTD and period reports answer different
> questions and must not be mixed without clear labeling. Comparatives are the same
> query against a different set of dates. The off-by-one error on period boundaries
> (using < instead of <=) is the most common and hardest-to-spot period bug — it
> silently excludes the last day of the period.

Next: `07-report-integrity-and-pitfalls.md`.
