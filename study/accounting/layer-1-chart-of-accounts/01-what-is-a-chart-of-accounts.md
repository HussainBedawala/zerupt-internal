# 01 — What Is a Chart of Accounts?

## The table of contents of your books

Imagine you wrote a 10,000-page book but didn't have a table of contents. Every piece of
information is somewhere in there, but you can't find anything. The book is useless.

A general ledger without a chart of accounts is the same problem. You have thousands of
journal entries — debit Cash 500, credit Sales 500, debit Rent 2000, credit Bank 2000 —
but without a directory that defines what "Cash" is, what "Rent" is, and how they're
organized, those numbers can't produce a report.

The **Chart of Accounts (COA)** is the table of contents of the ledger. It defines:

1. Every *labeled bucket* the business will use (each bucket is an **account**).
2. The *type* of each bucket (asset, liability, equity, income, or expense).
3. How buckets are *organized* into a hierarchy (the tree).

Once the COA is in place, every journal entry just points at accounts in the list, and
reports are simply queries over those accounts filtered by type and hierarchy.

## What a real retailer's COA looks like

Here is a realistic, simplified COA for a mid-size GCC retail shop. This is not abstract
— this is roughly what Zerupt seeds when you sign up:

```
1000  Assets                                [header]
  1100  Current Assets                      [header]
    1110  Cash & Bank                       [header]
      1111  Petty Cash                      [leaf — postable]
      1112  Cash Register                   [leaf — postable, system]
      1120  Bank — Current Account          [leaf — postable]
    1130  Receivables                       [header]
      1131  Trade Receivables               [leaf — postable, CONTROL, system]
    1140  Inventory                         [header]
      1141  Merchandise Inventory           [leaf — postable, CONTROL, system]
    1160  Tax Recoverable                   [header]
      1162  Input VAT Recoverable           [leaf — postable, system]
    1190  Suspense & Clearing               [header]
      1191  Opening Balance Suspense        [leaf — postable, system]
  1200  Non-Current Assets                  [header]
    1210  Property, Plant & Equipment       [header]
      1211  Leasehold Improvements          [leaf]
      1212  Furniture & Fixtures            [leaf]
      1213  Accumulated Depreciation        [leaf — CONTRA]

2000  Liabilities                           [header]
  2100  Current Liabilities                 [header]
    2111  Trade Payables                    [leaf — postable, CONTROL, system]
    2131  Output VAT Payable                [leaf — postable, system]
  2200  Non-Current Liabilities             [header]
    2210  Long-Term Loans                   [leaf]

3000  Equity                                [header]
  3100  Share Capital                       [leaf]
  3200  Retained Earnings — Prior Years     [leaf — system]
  3300  Retained Earnings — Current Year    [leaf — system]
  3900  Opening Balance Equity              [leaf — system]

4000  Income                                [header]
  4100  Sales                               [header]
    4110  Product Sales                     [leaf — postable, system]
  4200  Sales Returns & Allowances          [leaf — CONTRA income, system]

5000  Cost of Sales                         [header]
  5100  Cost of Goods Sold (COGS)           [leaf — postable, system]

6000  Operating Expenses                    [header]
  6100  Salaries & Wages                    [leaf]
  6200  Rent                                [leaf]
  6300  Utilities                           [leaf]
  6700  Cash Over/Short                     [leaf — system]
```

Read through that list and notice:
- **Every account has a code** (1111, 1131, 2111...). Codes signal type by convention
  (1xxx = assets, 2xxx = liabilities, 3xxx = equity, 4xxx = income, 5xxx+ = expenses).
- **Some accounts are headers** — you never post directly to them; they just group their
  children.
- **Some accounts are leaves** — these are the postable buckets. Every journal line lands
  on a leaf.
- **Some accounts are flagged CONTROL** — only the engine can post to them, not a human
  entering a manual journal.
- **Some accounts are CONTRA** — they carry the opposite of their type's normal balance
  (Accumulated Depreciation is an asset-type account with a credit balance).
- **Some accounts are flagged "system"** — they're essential for the engine to work and
  cannot be deleted or retyped.

## The COA is not optional

You cannot run an accounting system without one. Even the simplest bookkeeping spreadsheet
has a COA — it's just the list of column headings. A proper ERP formalizes it:

- Every account is explicitly typed.
- The hierarchy is enforced in the database (parent/child relationships with FK constraints).
- The rules (leaf-only posting, type-consistent hierarchy, no-delete-if-used) are enforced
  in code and in the database.

## How many accounts does a business need?

It depends. A tiny retailer might run with 40 accounts. A mid-market retailer might have
100–200. A large manufacturer might have 1,000+. The right size is "enough to produce
accurate reports and drill down into meaningful categories, but not so many that it
becomes noise."

Zerupt's base template for a GCC retail shop starts with roughly 80 accounts. Users can
add leaf accounts under the locked upper hierarchy. The upper levels — type structure,
main headers — are seeded and protected.

## The mental model

> The COA is the master directory. Every piece of financial history in the system is a
> journal entry, and every journal entry line points at exactly one account in that
> directory. The quality of your books is bounded by the quality of your COA.

Next: `02-account-types-and-the-equation.md`.
