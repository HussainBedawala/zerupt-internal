# 07 — Reconciliation and Tie-Outs

## What reconciliation means

Reconciliation at Layer 3 is the act of proving that each control account in the GL equals the sum of its subsidiary ledger. It is not optional and not a "nice to have." It is the quality gate that certifies the books are internally consistent. A balance sheet with unreconciled control accounts is not a balance sheet you can sign off on.

In a well-designed system the reconciliation should pass by construction on every transaction, because every posting that touches the GL also touches the subledger within the same atomic database transaction. Reconciliation is then a confirmatory check: run it, see zero difference, move on. It takes five minutes at month-end.

In a system with bugs, shortcuts, or manual overrides, reconciliation becomes a diagnostic tool. It tells you that something is wrong, and the difference amount is the first clue to where. The difference is the entry point for the forensic investigation, not the end of it.

## The four tie-outs

### Tie-out 1: AR aging ties to GL

**Statement:** SUM(all open invoice balances per customer in the AR subledger) = Balance of **Trade Receivables (1131)** in the GL, as of the same date and time.

To run it: export the AR aging report with all customers, all aging buckets, net of payments and credit notes already applied. Sum the "Total Outstanding" column. Compare to the 1131 GL balance on the trial balance at the same date. The two numbers must be equal.

Common failure modes:

A cash receipt posted as DR Bank / CR 1131 at the GL level, but the corresponding allocation in the AR subledger (matching the payment against the open invoice) was never recorded. The GL balance dropped by the payment; the customer's subledger balance did not. The subledger overstates receivables by the payment amount.

A credit note posted to GL (DR 1131 DR 4110, effectively reducing the receivable at the GL level) but the credit note was never allocated against a specific invoice in the subledger. The subledger shows the original invoice as still fully open.

A manual JE directly to 1131 — for example, an accountant writing off a balance by debiting 1131 and crediting a gain account — without a corresponding subledger entry. The control account should have zero manual JEs from unrelated sources. Every entry to 1131 should trace to a business event (invoice, payment, credit note, write-off) that also has a subledger row.

### Tie-out 2: AP aging ties to GL

**Statement:** SUM(all open bill balances per supplier in the AP subledger) = Balance of **Trade Payables (2111)** in the GL, as of the same date and time.

Common failure modes are the mirror image of the AR failures. A payment posted to the GL against 2111 without a subledger allocation. A debit note (supplier credit) posted to the GL but not matched to a specific bill in the subledger. A manual JE to 2111.

An additional failure mode specific to AP: a GRN (Goods Received Note) was posted, creating an entry in the GRN Accrual account (2121) and increasing inventory. The supplier bill then arrived and was posted against 2111 directly — but 2121 was never cleared. The company now has a real liability in 2111 and a ghost liability still sitting in 2121 for the same goods. Total AP plus accrual is overstated by one receipt amount. The three-way match (PO → GRN → bill) is the process control that prevents this; the reconciliation detects it after the fact.

### Tie-out 3: Stock valuation report ties to inventory GL

**Statement:** SUM(qty × unit_cost) for all items and all locations in the stock subledger = Balance of **Merchandise Inventory (1141)** in the GL, as of the same date and time.

This is the most demanding tie-out to maintain because inventory movements are high-frequency. A retail business may post thousands of sale and receipt transactions per day. Each one must produce a matching inventory JE. The cumulative effect of even small per-transaction errors — a quantity counted wrong, a WAC rounding handled inconsistently, a return processed without reinstating stock — compounds into a material difference over weeks.

Common failure modes:

A sale posted to revenue with no corresponding COGS and inventory JE. Revenue is overstated; inventory on the balance sheet is overstated; gross profit is overstated. This is both an accounting error and a P&L error.

A stock adjustment entered in the sub-ledger (qty corrected by the warehouse manager) without a corresponding GL JE being emitted. The subledger now shows a different quantity than the one used to compute the GL balance.

WAC rounding errors accumulated over many transactions. Each transaction is off by a fraction of a cent, but after tens of thousands of transactions the sum is a real number. Prevented by storing WAC to sufficient precision and using the "plug" method for the last unit.

### Tie-out 4: VAT control ties to return

**Statement:** SUM(output VAT lines in the tax subledger for the period) = Movement in **Output VAT Payable (2131)** for that period. SUM(input VAT lines) = Movement in **Input Tax Recoverable (1162)** for that period.

The VAT return boxes are populated from the subledger, not from the GL balance directly. The GL is the aggregate; the subledger carries the category, rate, and net amount per transaction. If the subledger is the source of truth and the return is generated from the subledger, the return and the GL will always agree. If the return is prepared manually — someone exports a spreadsheet and re-totals it by category — it is extremely likely to diverge from the subledger over time.

A subtlety: the VAT control account may carry balances from prior periods that have not yet been remitted. The tie-out for a given filing period should use movement (change in balance during the period) rather than ending balance, to separate the current period's tax from prior period carry-forwards.

## What to do when they don't tie

When a tie-out fails, the first number you need is the difference:

```
D = GL balance - subledger sum
```

D tells you how much is misaligned, not why. A positive D means the GL is higher than the subledger; the subledger is understating the balance. A negative D means the subledger is overstating relative to the GL.

The next step is to narrow the date range. If D appeared in the last 30 days, focus the search on transactions posted in that window. Pull the subledger movement for the period and compare it to the GL movement for the same period. If both moved by the same net amount but the ending balances differ, the opening balance difference is from a prior period — look there instead.

Once you have the period isolated, look for these in order:

First, run a query to find all manual JEs posted directly to the control account (1131, 2111, or 1141) where the source is "manual" or where there is no corresponding subledger row ID. A control account should have zero orphan JEs — every posting must trace to a business event. Manual JEs to control accounts are the most common cause of irreconcilable differences.

Second, look for a posting where the GL and subledger moved in opposite directions, or where the GL moved but the subledger shows no corresponding entry at all. This usually means a code path that calls `gl.post()` and returns before calling `subledger.record()`, or where an exception was caught silently between the two calls.

Third, look for a subledger update without a JE. This is less common but possible if a background process updates a balance column directly (say, adjusting an open invoice balance for a rounding correction) without emitting a JE event.

Fourth, confirm that the subledger and GL are being queried at exactly the same point in time. If the AR aging report uses "end of business day" and the GL balance is pulled at midnight UTC while the business is in a UTC+3 timezone, they are three hours apart. Both queries must target the same UTC timestamp.

### Numeric example

GL shows **Trade Receivables (1131)** = SAR 8,500.00 at month-end. AR aging sum = SAR 8,200.00. Difference = SAR 300.00 (GL is higher by SAR 300.00; subledger understates by SAR 300.00).

Search for JEs posted to 1131 during the month with no corresponding subledger movement. Result: on 18 Jun, a cash receipt from Customer X was posted:

```
DR  Bank (1110)                        300.00
      CR  Trade Receivables (1131)             300.00
```

The GL was credited SAR 300.00. But the AR subledger was never updated. Customer X's balance still shows the original invoice of SAR 300.00 as fully open.

Fix: open the original invoice in the AR subledger and record an allocation of SAR 300.00 against the cash receipt. The customer balance clears to zero. The subledger sum increases by SAR 300.00 to SAR 8,500.00. Tie-out passes.

## By-construction reconciliation

The goal of system architecture at this layer is to make the tie-outs pass automatically. There is no engineering reason to accept a system where reconciliation requires manual repair.

The requirements are three:

First, all postings to control accounts flow through the same pipeline that also writes the subledger row. There is no code path that writes to 1131, 2111, or 1141 except through a service that simultaneously writes the corresponding subledger entry.

Second, no code path writes to a control account without a matching subledger write. This is enforced not by policy but by the structure of the code — the subledger write is not a separate optional call; it is part of the same operation.

Third, the database enforces atomicity. The GL JE insert and the subledger row insert are in the same database transaction. If the transaction commits, both rows exist. If it rolls back — for any reason, including a network error, a constraint violation, or an application crash — neither row exists. The invariant holds even under failure.

When this architecture is followed, the monthly reconciliation is a five-minute confirmation. When it is not followed, reconciliation is a days-long forensic exercise, and the finance team loses trust in the system.

## Frequency of reconciliation

The AR and AP aging tie-outs should run daily, ideally as an automated background check that alerts if a difference appears. Manual monthly review before close is the minimum; automated daily checking is the professional standard.

The inventory tie-out in a perpetual system should be exact at every point in time because each movement posts both sides atomically. In practice, run a formal check weekly and before every period close.

The VAT/GST control tie-out should run before filing each return — which means monthly (UAE, KSA) or quarterly (India quarterly filers) depending on jurisdiction. Always tie the subledger to the GL before submitting; never file from a spreadsheet that has not been reconciled to the books.

Before closing any period, all four tie-outs must pass. A period with an unresolved control account difference should not be closed. Closing locks the numbers and makes the difference harder to trace.

## The one-sentence discipline

If you cannot prove the subledger ties to the GL, you cannot trust the balance sheet — and if you cannot trust the balance sheet, you cannot trust any number derived from it.

## The mental model

> Reconciliation is not an accounting chore; it is a correctness proof. Each tie-out is a
> statement of an invariant: the control account equals the subledger sum. In a system built
> correctly, these invariants hold by construction on every transaction. When they fail, the
> difference amount is a clue — narrow the date, find the orphan JE or the missed subledger
> row, fix the root cause, and redesign the code so the failure cannot recur. Reconciliation
> that passes automatically is a sign of a trustworthy system; reconciliation that requires
> manual adjustment every month is a sign of a broken one.
