# 02 — Account Types and the Accounting Equation

## The five types, again — but deeper this time

Layer 0 introduced the five account types as part of the debit/credit conversation. Now
we go deeper: not just what they are, but *why* they're split this way, what they represent
economically, and exactly which financial report each one lands on.

The five types:

| # | Type | What it represents |
|---|------|--------------------|
| 1 | **Asset** | Something the business **owns or controls** that has future economic value |
| 2 | **Liability** | Something the business **owes** to outsiders |
| 3 | **Equity** | The owners' **residual claim** — what's left after liabilities |
| 4 | **Income** | What the business **earned** by delivering goods or services |
| 5 | **Expense** | What the business **consumed** to generate that income |

## The accounting equation — the deep version

The equation you've seen is:

```
Assets  =  Liabilities  +  Equity
```

But equity is not static. It changes when the business earns income or incurs expenses:

```
Equity at period end  =  Equity at start  +  Income  −  Expenses
```

Substitute that into the main equation:

```
Assets  =  Liabilities  +  (Opening Equity  +  Income  −  Expenses)
```

This is the **full accounting equation**. It's always true. Every journal entry you ever
post is just rearranging numbers in this equation while keeping it balanced.

When you earn income → the right side grows (income up) → an asset grows or a liability
shrinks on the left to match. When you incur an expense → the right side shrinks → an
asset shrinks or a liability grows on the left to match. The equation never breaks.

## How types split across the two financial reports

There are exactly two primary financial statements. Understanding which accounts feed
which report is the most important thing to know about account types.

### The Balance Sheet (a snapshot)

The Balance Sheet shows the business at **a point in time** — as of a date. It answers:
"What do we own, what do we owe, and what do the owners have left?"

| Section | Account types | What it shows |
|---------|---------------|---------------|
| Assets | Asset | Everything owned or controlled |
| Liabilities | Liability | Everything owed to outsiders |
| Equity | Equity | Owners' residual value |

The Balance Sheet is a *permanent* record. Asset, Liability, and Equity accounts
**accumulate forever** — their balances carry over from year to year. If you had 50,000
in cash on 31 Dec, you start 1 Jan with 50,000 in cash. These are called **permanent
accounts** (or real accounts).

### The Profit & Loss Statement / Income Statement (a period)

The P&L shows the business **over a period of time** — e.g., January 1 to December 31.
It answers: "What did we earn, what did we spend, and how much profit did we make?"

| Section | Account types | What it shows |
|---------|---------------|---------------|
| Revenue | Income | Total earnings from the business |
| Cost of Sales | Expense (sub-type: cost_of_sales) | Direct cost to produce what was sold |
| Gross Profit | Calculated | Revenue − Cost of Sales |
| Operating Expenses | Expense (operating_expense) | Running costs of the business |
| Net Profit | Calculated | Gross Profit − Operating Expenses |

Income and Expense accounts are **temporary** (or nominal accounts). At the end of each
fiscal year, their balances are *zeroed out* and transferred to Retained Earnings in
Equity. This is called the **closing process** (Layer 4). A new P&L starts fresh every
year.

```
Year end closing:
  Dr  All Income accounts      (zero them out)
  Cr  All Expense accounts     (zero them out)
  The net → Cr Retained Earnings  (if profit) or Dr Retained Earnings (if loss)
```

## Why the type is the most important attribute of an account

Imagine an account mis-typed as Income when it should be Liability. Example: a customer
deposits a 1,000 advance. The correct entry is:

```
  Dr  Cash                1,000  (asset up)
  Cr  Customer Deposits   1,000  (liability up — we owe them the goods)
```

If Customer Deposits is mis-typed as Income instead of Liability, the credit of 1,000
lands on the P&L as *revenue*. The business looks 1,000 more profitable than it is, and
the Balance Sheet doesn't show the 1,000 it owes the customer. Both reports are wrong,
silently.

**The type of an account determines its entire downstream behavior.** It is not cosmetic
labeling. Every report, every calculation, every reconciliation check flows from it.

## Normal balances fall directly out of the equation

From the equation, assets and expenses sit on the "left side" and increase with debits.
Liabilities, equity, and income sit on the "right side" and increase with credits.

| Type | Normal balance | Increases with | Decreases with |
|------|----------------|----------------|----------------|
| Asset | Debit | Dr | Cr |
| Expense | Debit | Dr | Cr |
| Liability | Credit | Cr | Dr |
| Equity | Credit | Cr | Dr |
| Income | Credit | Cr | Dr |

This is not arbitrary — it falls out of the structure of the equation. You don't need to
memorize it once you understand why.

## The mental model

> The five types split into two reports: Asset/Liability/Equity live on the Balance Sheet
> (permanent, accumulate forever); Income/Expense live on the P&L (temporary, reset each
> year). A mis-typed account puts its balance on the wrong report — and the error is
> invisible until an accountant checks the numbers by hand.

Next: `03-sub-types-and-classification.md`.
