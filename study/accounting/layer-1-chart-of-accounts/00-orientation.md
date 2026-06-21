# 00 — Orientation: What Layer 1 Is

## Where we are in the building

```
        ┌─────────────────────────────────┐
        │ Layer 5: Reports (P&L, Balance   │
        │          Sheet, Cash Flow)       │
        ├─────────────────────────────────┤
        │ Layer 4: Periods, Opening        │
        │          Balances, Close, FX     │
        ├─────────────────────────────────┤
        │ Layer 3: Sub-ledgers (AR/AP),    │
        │          Inventory valuation     │
        ├─────────────────────────────────┤
        │ Layer 2: The Posting Engine      │
        ├─────────────────────────────────┤
        │ Layer 1: Chart of Accounts       │   ← YOU ARE HERE
        ├─────────────────────────────────┤
        │ Layer 0: The Ledger Foundation   │
        └─────────────────────────────────┘
```

Layer 0 taught you what a journal entry is, what double-entry means, and why money is
exact. But every journal entry you learned about points at *accounts* — Cash, Sales
Revenue, Inventory, Accounts Receivable. Where do those accounts come from? How are they
organized? Who decides what types they are, and what rules keep them correct?

That's Layer 1.

## The Chart of Accounts is the skeleton

If Layer 0 is the concrete foundation, Layer 1 is the steel skeleton built on it. The
**Chart of Accounts (COA)** is the complete, organized list of every account in the
business. Every journal entry line references exactly one account. Every report queries
accounts. Every rule about "what can be posted here" lives on an account.

Without the COA, the ledger is just a pile of numbers with no labels. With the COA,
every number belongs to a named, typed, classified bucket — and you know exactly which
report it flows into.

## What depends on Layer 1

Almost everything:

- **Journal entries** (Layer 0) reference accounts by id. If the account type is wrong,
  the entry posts to the right number but the wrong report.
- **The posting engine** (Layer 2) resolves accounts by *semantic role*: "give me the
  COGS account for this entity." That resolution only works if the role is bound to a
  correctly-typed account.
- **Sub-ledgers** (Layer 3) have *control accounts* — single GL accounts that must match
  the detail in AR/AP/Inventory. Whether an account is a control account is a Layer 1 flag.
- **Reports** (Layer 5) group by account type, sub-type, and hierarchy. A misclassified
  account silently puts its balance in the wrong section of the report.

If Layer 1 has a flaw — wrong type, wrong hierarchy, wrong normal balance, no system-role
binding — every layer above inherits that flaw. The P&L will be wrong and the mistake
will be invisible until an auditor runs the numbers manually.

## What you'll be able to do after this layer

After these chapters you will be able to:

- Read any account in our system and say what type and sub-type it has, what normal balance
  it carries, whether it's a leaf or a header, and which reports it feeds.
- Understand why the posting engine looks up accounts by *role* not by *code*.
- Know what a "system account" is and why it can't be deleted or retyped.
- Understand how our seeded regional COA is structured and why it ships pre-built.
- Read `chart-of-accounts.ts` and `account-system-roles.ts` and understand every column.

## The one sentence to remember for Layer 1

> Every posting lands on an account; every account has a type that decides which report
> it appears on; the COA is the master directory that makes those types correct,
> organized, and enforced.

Next: `01-what-is-a-chart-of-accounts.md`.
