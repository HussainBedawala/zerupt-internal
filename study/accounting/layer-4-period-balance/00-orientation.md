# 00 — Orientation: What Layer 4 Is

## Where we are in the building

```
        ┌─────────────────────────────────┐
        │ Layer 5: Reports (P&L, Balance   │
        │          Sheet, Cash Flow)       │
        ├─────────────────────────────────┤
        │ Layer 4: Period & Balance        │
        │          Integrity               │   ← YOU ARE HERE
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

## What "period and balance integrity" means

Layers 0 through 3 established correctness at the transaction level: every event
produces a balanced, immutable, atomically-written journal entry; every entry lands in
the right accounts; every control account's balance equals its subsidiary ledger.

Layer 4 asks a different question: **are the books correct over time?**

A ledger can be individually balanced at every transaction and still be unreliable across
time. Imagine these failures:

- A company's set of books started on 1 January, but the business acquired a store that
  had been trading for three years. Nobody entered the opening balances for that store's
  debtors, stock, and loans. Reports look correct for transactions since 1 January, but
  the balance sheet is missing SAR 2 million of real assets.

- A financial controller ran payroll in January. A manager later discovered a mistake and
  went back to correct it — but the January period had already been reported to investors.
  The "correction" silently changed history.

- The company buys from suppliers in EUR but reports in AED. Nobody revalued the EUR
  payables at December year-end. The liabilities are understated by AED 380,000 because
  the euro strengthened. The auditor finds this in March.

- The year-end close was run, but nobody verified the closing entry balanced. The
  retained-earnings balance on the new year's opening balance sheet is wrong, and every
  P&L period in the new year starts from a poisoned prior year.

None of these are posting bugs in the sense Layer 2 addresses. The individual entries are
perfectly formatted. The problem is time: when things start, when periods end, what you
carry forward, and what you can no longer change.

**Period and balance integrity** is the set of disciplines that keep the books trustworthy
across time. This layer covers five topics:

1. **The trial balance** — the proof that the ledger balances, at any point in time.
2. **Opening balances** — how a set of books begins in the middle of a business's life.
3. **Fiscal periods and locking** — how you carve time into reportable chunks and seal them.
4. **Year-end close** — how income and expense accounts are zeroed and rolled into equity.
5. **FX revaluation (IAS 21)** — how foreign-currency balances are updated to period-end
   rates and the resulting unrealized gain or loss is recognized.
6. **The close checklist** — the disciplined sequence that ties everything together before
   a period is locked.

## Why integrity OVER TIME is the specific theme

Layers 0–3 are largely about a single transaction at a single moment. A posting is either
correct or it is not. There is no temporal dimension to whether DR Inventory / CR AP is
balanced.

Layer 4 is fundamentally about the passage of time. You cannot define an opening balance
without a reference date. You cannot lock a period without knowing which transactions fall
inside it. You cannot do a year-end close without knowing when one year ends and the next
begins. You cannot revalue FX without a "period-end rate" that changes every month.

The key property that all Layer 4 operations must have is **idempotency across time**:

- Re-running the year-end close should produce the same result as running it once.
- Re-importing opening balances should not double the balances.
- Revaluing FX twice in the same period should not create two sets of unrealized-gain
  entries.

And they must have **temporal ordering**: opening balances must predate operating
transactions; the year-end close must happen after all period entries are posted; FX
revaluation must happen after all invoices are entered but before the period is locked.

## The IAS 21 dimension

Zerupt's target markets — GCC, India, Southeast Asia — all have businesses that transact
in foreign currencies. A Saudi retailer might buy from a German supplier in EUR, sell to
a Kuwaiti wholesaler in KWD, and report in SAR. IAS 21 (The Effects of Changes in
Foreign Exchange Rates) governs how those currencies interact with the reporting currency.

Layer 2 handles **realized FX** on settlement (the EUR payable was booked at 4.00 and
paid at 4.10 — the 0.10 difference is a real loss that hit the P&L). Layer 4 handles
**unrealized FX**: every open monetary balance denominated in a foreign currency must be
retranslated to the closing rate at period end. The retranslation difference is not cash —
it may reverse if the rate moves back — but it must be recognized in P&L for the period
as an unrealized gain or loss.

## Chapter map

| Chapter | File | What it covers |
|---------|------|----------------|
| 00 | `00-orientation.md` | This overview |
| 01 | `01-the-trial-balance.md` | TB as the proof the ledger balances; derived from posted lines; as-of vs period; what out-of-balance means |
| 02 | `02-opening-balances.md` | Starting mid-life: the opening journal, OBE plug, per-party AR/AP, inventory at WAC, idempotency |
| 03 | `03-fiscal-periods-and-locking.md` | Period lifecycle (open / soft-close / hard-close / locked); backdating danger; reversing into open period |
| 04 | `04-year-end-close.md` | Closing income statement to retained earnings; the balanced idempotent closing entry |
| 05 | `05-fx-revaluation-ias21.md` | Monetary vs non-monetary; period-end revaluation; unrealized vs realized; presentation currency |
| 06 | `06-the-close-checklist.md` | The monthly/period close sequence: sub-ledgers → FX → TB → lock |

## Where Layer 4 sits in the dependency chain

Layer 4 **depends on** Layers 0–3:

- The trial balance is derived from the ledger (Layer 0) whose entries are produced by
  the posting pipeline (Layer 2) landing in correctly typed accounts (Layer 1).
- Opening balances are posted as journal entries through the same posting pipeline (Layer 2).
- Period locking acts on journal entries already in the ledger (Layer 0).
- FX revaluation adjusts AR/AP control accounts (Layer 3).
- The close checklist requires the Layer 3 tie-outs to pass before the period is sealed.

Layer 5 **depends on** Layer 4:

- A P&L report only makes sense if it is scoped to a proper fiscal period.
- A balance sheet only makes sense if opening balances are correctly established and the
  year-end close has been run.
- Cash flow reporting depends on period boundaries.

Layer 4 is the final correctness gate before reporting. If you skip it — if you run
reports from raw ledger data without proper periods, proper openings, proper close,
and proper FX — the reports will look plausible and be wrong.

## The mental model

> Layers 0–3 make individual transactions correct. Layer 4 makes the books correct across
> time: they start from a known true state (opening balances), accumulate entries only
> inside proper periods, get sealed when those periods end (locking), have income and
> expense zeroed at year-end (close), and have every foreign-currency balance retranslated
> to the period-end rate (FX revaluation). Skip any of these disciplines and the balance
> sheet drifts away from reality — one month, one rate, one unclosed year at a time.

Next: `01-the-trial-balance.md`.
