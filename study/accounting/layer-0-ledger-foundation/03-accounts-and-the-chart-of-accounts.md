# 03 — Accounts and the Chart of Accounts

## What is an "account"?

An **account** is a labeled bucket that collects all the movements of one specific thing. "Cash"
is an account. "Sales Revenue" is an account. "Rent Expense" is an account. Every journal line
(Chapter 04) points at exactly one account.

Think of each account as a running tally. Every debit and credit posted to it adjusts its
balance. At any moment you can ask an account "what's your balance?" and sum its history.

## The five types (recap, because everything keys off this)

Every account belongs to exactly one of five types. The type determines its normal balance
(Chapter 02) **and** which financial report it lands on:

| Type | Normal balance | Lives on report |
|------|----------------|-----------------|
| Asset | Debit | Balance Sheet |
| Liability | Credit | Balance Sheet |
| Equity | Credit | Balance Sheet |
| Income | Credit | Profit & Loss (Income Statement) |
| Expense | Debit | Profit & Loss (Income Statement) |

This is why correct typing is *foundational*: an account mis-typed as income instead of liability
will silently inflate your profit. The report is only as correct as the account types.

## Sub-types: more precise classification

Real reports need finer buckets than five. Assets split into **current** (cash, receivables,
stock — turn to cash within a year) vs **non-current** (equipment, property). Liabilities split
into current vs non-current. Income splits into operating revenue vs other income. These finer
labels are **sub-types**, and they control the *ordering and grouping* on the Balance Sheet and
P&L. Only certain sub-types are valid per type (a `cost_of_sales` sub-type can't belong to an
`asset`).

## The Chart of Accounts (COA)

The **Chart of Accounts** is the complete, organized list of every account a business uses. It's
the "table of contents" of the books. A retail shop's COA might have 60–200 accounts.

Accounts are arranged in a **hierarchy** — parents (headers) and children (leaves):

```
1000  Assets                         (header — type: asset)
  1100  Current Assets               (header)
    1110  Cash & Bank                (header)
      1111  Cash on Hand             (LEAF — you post here)
      1112  Bank — Main Account      (LEAF)
    1120  Accounts Receivable        (LEAF)
    1130  Inventory                  (LEAF)
4000  Income                         (header — type: income)
  4100  Sales Revenue                (LEAF)
5000  Expenses                       (header — type: expense)
  5100  Cost of Goods Sold           (LEAF)
  5200  Rent                         (LEAF)
```

Two critical rules:

1. **You only ever post to LEAF accounts** (the ones with no children). Header accounts are
   summary roll-ups; posting to them would double-count. A correct engine *rejects* a posting to
   a header account. (Zerupt has an `isHeader` flag for exactly this.)
2. **Account numbers encode the type** by convention (1xxx assets, 2xxx liabilities, 3xxx equity,
   4xxx income, 5xxx expenses). This is a human convenience; the *real* source of truth is the
   `type` column, never the number.

## Why Zerupt ships a pre-built COA

Our customers are retail owners, not accountants. Asking them to design a chart of accounts from
scratch would be a non-starter. So we **seed** a sensible, region-appropriate COA (GCC, India,
SEA variants) with the standard headers and common leaf accounts already in place, correctly
typed and bilingual (EN/AR). The customer then adds their own leaf accounts under the locked
upper levels. (This is the seed that the onboarding template work will build on.)

## Control accounts vs sub-ledgers (preview of Layer 3)

Some leaf accounts are **control accounts**: a single GL account that summarizes many individual
balances tracked in detail elsewhere. Example: "Accounts Receivable" is one control account in
the GL, but the *detail* — which customer owes what — lives in the AR **sub-ledger**. The
invariant (Layer 3) is: **control account balance = sum of its sub-ledger**. Layer 0 just needs
to know these exist; we'll go deep later.

## What "getting Layer 1 right" will mean

Layer 1 (next study folder) is entirely about the COA: correct types, correct normal balances,
valid sub-types, enforced hierarchy, header/leaf rules, and the seeded regional templates. Layer
0 just needs the *account* concept and the five types locked in your head.

Next: `04-the-journal-entry-the-atom.md`.
