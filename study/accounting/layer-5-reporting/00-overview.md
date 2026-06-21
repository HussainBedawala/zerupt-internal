# 00 — Overview: What Financial Reporting Is

## Where we are in the building

```
        ┌─────────────────────────────────┐
        │ Layer 5: Reporting               │   ← YOU ARE HERE
        │  (P&L, Balance Sheet, Cash Flow) │
        ├─────────────────────────────────┤
        │ Layer 4: Period & Balance        │
        │          Integrity               │
        ├─────────────────────────────────┤
        │ Layer 3: Sub-ledgers (AR/AP),    │
        │          Inventory valuation     │
        ├─────────────────────────────────┤
        │ Layer 2: The Posting Pipeline    │
        ├─────────────────────────────────┤
        │ Layer 1: Chart of Accounts       │
        ├─────────────────────────────────┤
        │ Layer 0: The Ledger Foundation   │
        └─────────────────────────────────┘
```

## What financial reporting is

Financial reporting is the act of summarizing the general ledger into a set of structured
statements that answer the questions every stakeholder asks:

- **Did we make money?** — The income statement (profit & loss) answers this.
- **What do we own and owe?** — The balance sheet answers this.
- **Where did the cash go?** — The cash flow statement answers this.

These three statements are not separate systems. They are three different views of the
same underlying ledger. Every number in every report traces back to journal entries posted
to specific accounts. That chain from posted entry → account balance → report line is the
source of truth. When that chain breaks — when a report number cannot be traced back to a
journal entry — the report is wrong, regardless of how plausible it looks.

## The three primary statements

### 1. Income Statement (Profit & Loss, P&L)

The income statement shows **flows over a period**: how much revenue was earned and how
much cost was incurred between two dates. The result is net income (profit) or net loss.

It is fundamentally a measure of **change**: it answers "what happened to equity
through operations during this period?" Every income and expense account on the chart
of accounts feeds the income statement.

### 2. Balance Sheet (Statement of Financial Position)

The balance sheet shows **balances at a point in time**: what the business owns (assets),
what it owes (liabilities), and the residual interest of the owners (equity). It is a
snapshot, not a flow.

The balance sheet must always satisfy the accounting equation:

```
Assets = Liabilities + Equity
```

Equity at any date includes retained earnings from prior periods plus the current period's
net income. That is the direct link between the income statement and the balance sheet.

### 3. Cash Flow Statement

The cash flow statement shows **movements of cash** over a period, organized into three
activities: operating, investing, and financing. It reconciles the opening cash balance
to the closing cash balance, and explains why the change in cash may differ from the
net income reported on the P&L.

A business can be profitable and run out of cash (customers haven't paid), or be unprofitable
and have growing cash (raising debt). The cash flow statement makes this visible.

## The golden rule: every report must tie to the trial balance

This is non-negotiable. A financial statement is derived from the general ledger. If any
number in a report cannot be traced to the trial balance, it is either computed separately
(a dangerous anti-pattern) or the report has a bug.

**The golden rule:**

> Every line in every financial statement must be derivable from the general ledger by
> aggregating the balances (or movements) of a defined set of accounts, over a defined
> date range, scoped to a defined set of posting statuses (posted and non-reversed).

The practical test is simple. Take the net income from the P&L. Take the sum of all
income-account credit balances minus all expense-account debit balances from the trial
balance for the same period. The two numbers must match to the cent. If they do not, the
report has a bug.

The same test applies to each line on the balance sheet. The Trade Receivables line must
equal the sum of all account codes in the Receivables group on the leaf-level trial
balance. No exceptions.

## Why Layer 4 is a prerequisite

Reports are only meaningful when they are scoped to a proper fiscal period (Layer 4).
A P&L report that spans a period not bounded by a formal fiscal year close will include
income and expense from prior years that should have been closed to retained earnings.
A balance sheet that has not gone through the year-end close will show income-statement
accounts in the equity section, which is nonsensical.

Before any report is run, the following Layer 4 conditions must hold:
- The trial balance for the period balances (SUM debits = SUM credits).
- The period is well-defined (start date and end date, fiscal year boundaries respected).
- Opening balances have been established (Layer 4, Chapter 02).
- The year-end close has been run for any prior years (Layer 4, Chapter 04).
- FX revaluation has been run for all open foreign-currency balances at period end.

Running a report against a ledger that fails any of these checks produces numbers that
look authoritative and are not. The report will not announce its own invalidity.

## The sub-ledger tie-out

Layer 3 established that the AR control account on the TB must equal the sum of all
individual customer balances in the AR sub-ledger, and the AP control account must equal
the sum of all supplier balances. Reports that show AR aging, customer statements, or
supplier balances all consume the sub-ledger. They must tie to the control account on the
TB. If they do not, either the sub-ledger has drifted from the GL (a Layer 3 defect) or
the report is querying the wrong table.

## Chapter map

| Chapter | File | What it covers |
|---------|------|----------------|
| 00 | `00-overview.md` | This overview |
| 01 | `01-income-statement-pnl.md` | Revenue, COGS, gross profit, opex, net income; period-scoped flows; sign conventions |
| 02 | `02-balance-sheet.md` | Assets = Liabilities + Equity; point-in-time balances; retained earnings rollup |
| 03 | `03-cash-flow-statement.md` | Direct vs indirect; operating/investing/financing; reconciliation to cash change |
| 04 | `04-multi-currency-reporting.md` | Functional vs presentation currency; IAS 21 translation |
| 05 | `05-ar-ap-aging.md` | Aging buckets; why aging derives from the GL sub-ledger; tie-out to control account |
| 06 | `06-comparatives-and-periods.md` | Period selection, comparatives, YTD vs period, fiscal boundaries |
| 07 | `07-report-integrity-and-pitfalls.md` | The danger list: sign errors, double-counting reversals, off-by-one periods, currency mixing |
| 08 | `08-summary.md` | Recap and the accountant's close checklist for reports |

## The mental model

> Financial statements are not separate systems — they are three reorganizations of the
> same general ledger. Every report number must trace back to a posted journal entry via
> the trial balance. If it cannot be traced, the report is wrong. The TB is the source of
> truth; the reports are views of it. Layer 5 adds nothing to the ledger; it only reads it.
> Its job is to read it correctly.

Next: `01-income-statement-pnl.md`.
