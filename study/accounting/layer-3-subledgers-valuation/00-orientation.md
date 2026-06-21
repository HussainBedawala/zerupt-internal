# 00 — Orientation: What Layer 3 Is

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
        │          Inventory valuation     │   ← YOU ARE HERE
        ├─────────────────────────────────┤
        │ Layer 2: The Posting Pipeline    │
        ├─────────────────────────────────┤
        │ Layer 1: Chart of Accounts       │
        ├─────────────────────────────────┤
        │ Layer 0: The Ledger Foundation   │
        └─────────────────────────────────┘
```

## What "sub-ledgers and valuation" means

The general ledger (GL) is a set of accounts. Each account carries one balance. That
balance is correct and computable at any moment by summing the debits and credits posted
to it since inception. The GL always balances -- the fundamental invariant of
double-entry never breaks.

The problem is that a single GL balance can hide a lot of detail. The GL account
**Trade Receivables (1131)** might show SAR 47,300.00. That number is accurate in the
aggregate. But it tells you nothing about which customer owes how much, which invoices
are outstanding, or how old the debts are. For that you need the sub-ledger.

A **sub-ledger** is the detailed record that sits behind a GL account. It tracks the
same money in the same direction, but broken out by the unit that matters: individual
customers for AR, individual suppliers for AP, individual stock-keeping units for
inventory. The GL account that represents the total is called the **control account**.

Valuation is the second concern at this layer. Inventory sits on the balance sheet at
cost, not at selling price. But when you buy the same item at different prices over
time, "cost" becomes ambiguous. This layer covers how to assign a cost to each unit
leaving inventory. The answer -- for most retail systems -- is the
**weighted average cost (WAC)** method.

## The invariant

The single most important rule of this layer is:

> The balance of a control account in the GL must always equal the sum of all
> individual balances in its subsidiary ledger.

This must hold at every moment, not just at month-end. Every posting that changes the
GL control account must simultaneously change the sub-ledger. They move together. The
instant they diverge, the books are wrong -- even though the trial balance still
balances.

## Why this is a distinct layer

Layer 2 handled the posting pipeline. It made sure that every business event produces a
correct, balanced, atomic journal entry in the GL. That is necessary but not sufficient.

Consider what Layer 2 does not enforce:

- That the subledger row for the specific customer is updated alongside the GL entry.
- That inventory unit costs are recalculated correctly when a new purchase arrives at a
  different price.
- That a manual journal entry posted directly to the GL (bypassing the subledger) is
  flagged.

A developer can write code that posts `DR Bank / CR Trade Receivables (1131)` perfectly
and still forget to update the customer's subledger balance. The GL entry is correct.
The trial balance is balanced. But the customer's balance in the subledger still shows
the old amount. The next time an aged receivables report is generated, the numbers will
be wrong. Collections will be chased on the wrong invoices. This is the category of bug
that Layer 3 exists to prevent.

The same logic applies to inventory. You can post `DR COGS / CR Merchandise Inventory
(1141)` with the right total and still get the unit cost calculation wrong. The GL
balance stays correct. The per-item cost history does not.

## The three control accounts this layer covers

**Trade Receivables (1131):** The AR control account. Its sub-ledger is every customer
that owes the business money. The invariant: sum of all customer running balances equals
the GL balance of 1131.

**Trade Payables (2111):** The AP control account. Its sub-ledger is every supplier the
business owes money to. The invariant: sum of all supplier running balances equals the
GL balance of 2111.

**Merchandise Inventory (1141):** The inventory control account. Its sub-ledger is every
stock-keeping unit, carrying a quantity on hand and a unit cost. The invariant: sum of
(quantity x unit cost) across all items equals the GL balance of 1141.

## Chapter map

| Chapter | File | Description |
|---------|------|-------------|
| 00 | `00-orientation.md` | What Layer 3 is and why it exists |
| 01 | `01-control-accounts-and-subledgers.md` | The structural relationship between control accounts and subsidiary ledgers |
| 02 | `02-accounts-receivable-subledger.md` | AR subledger: invoices, receipts, credit notes, write-offs, aging |
| 03 | `03-accounts-payable-subledger.md` | AP subledger: bills, payments, debit notes, aging, duplicate bill risk |
| 04 | `04-inventory-valuation-wac.md` | Weighted average cost: the moving-average formula, a full worked ledger, rounding and negative-inventory dangers |
| 05 | `05-cogs-and-inventory-movements.md` | COGS at WAC on every issue; how sales, returns, transfers, adjustments, counts and write-downs each hit valuation |
| 06 | `06-vat-gst-subledgers.md` | Output/input tax as control accounts; GCC VAT vs India GST (CGST/SGST/IGST); reverse charge; mapping detail to return boxes |
| 07 | `07-reconciliation-and-tie-outs.md` | The monthly discipline: AR, AP, stock and VAT tie-outs; hunting the rogue posting; reconciliation by construction |

Next: `01-control-accounts-and-subledgers.md`.
