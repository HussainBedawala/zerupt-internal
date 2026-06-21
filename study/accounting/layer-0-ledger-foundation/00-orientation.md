# 00 — Orientation: What Layer 0 Is

## What is a "ledger"?

A **ledger** is just a permanent record of money movements. For thousands of years it was a
physical book. Merchants wrote down, line by line, what came in and what went out. The word
"book-keeping" is literal: keeping the books.

An ERP (Enterprise Resource Planning system) like Zerupt is, at its accounting core, a
**digital ledger** plus a lot of machinery that automatically writes into that ledger whenever
something happens in the business — a sale at the till, a purchase from a supplier, a stock
adjustment, a customer paying an invoice.

## Why "Layer 0"?

Imagine the accounting module as a building:

```
        ┌─────────────────────────────────┐
        │ Layer 5: Reports (P&L, Balance   │   ← what the owner SEES
        │          Sheet, Cash Flow)       │
        ├─────────────────────────────────┤
        │ Layer 4: Periods, Opening        │
        │          Balances, Close, FX     │
        ├─────────────────────────────────┤
        │ Layer 3: Sub-ledgers (AR/AP),    │
        │          Inventory valuation     │
        ├─────────────────────────────────┤
        │ Layer 2: The Posting Engine      │   ← the ONE door all data enters through
        ├─────────────────────────────────┤
        │ Layer 1: Chart of Accounts       │
        ├─────────────────────────────────┤
        │ Layer 0: The Ledger Foundation   │   ← YOU ARE HERE (the concrete)
        │   journals, double-entry, money, │
        │   immutability, atomic posting   │
        └─────────────────────────────────┘
```

Layer 0 is the concrete foundation. It answers the most primitive questions:

- What is the smallest unit of accounting data we store? (a **journal entry**)
- What rule must *every* one of those units obey? (**debits = credits**)
- How do we store money so it's never wrong by a fraction of a cent?
- Once written, can a record ever change? (**no** — only be reversed)
- How do we guarantee a record is written *completely or not at all*, and *never twice*?

If Layer 0 is bulletproof, every layer above inherits its trustworthiness. If Layer 0 has a
crack, no amount of polish on the reports above will hide it — the numbers will simply be wrong,
and an accountant *will* find it.

## The promise we are making to the customer

A retail owner in our market is often not an accountant. They are trusting software to keep
their books correctly. Our standard is:

> The user should never be able to find a fault in our accounting.

That promise is *kept or broken at Layer 0*. A wrong report is a Layer 0 failure wearing a suit.

## What you'll be able to do after this layer

After these chapters you will be able to read any journal entry in our system and say:
"this is balanced, this is correct, this can't be secretly edited, and it could not have been
double-posted." That is the whole game.

Next: `01-double-entry-from-zero.md`.
