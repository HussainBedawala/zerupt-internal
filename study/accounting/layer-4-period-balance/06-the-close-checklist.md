# 06 — The Close Checklist

## What the close checklist is

Every accounting period ends with a structured sequence of steps before the period is
locked. This sequence is the **close checklist** — the discipline that proves the period
is complete, correct, and safe to seal.

The checklist is not bureaucracy. Each step exists because leaving it out risks locking
incorrect numbers into history. A period locked with an unreconciled AR subledger, or
with FX balances still at last month's rates, or with a trial balance that has not been
reviewed, is a period whose reports cannot be trusted.

This chapter walks through the sequence step by step and explains what each step proves.

## The ordering constraint

The steps must be run in order. Each step depends on the step before it being complete.
Doing them out of order produces either meaningless results or incorrect entries:

- You cannot revalue FX before all invoices for the period are entered — the revaluation
  must cover all open balances.
- You cannot verify the TB before FX revaluation — the TB will show stale FC balances
  if revaluation has not been run.
- You cannot lock the period before the TB is verified — locking freezes whatever the
  TB shows, correct or not.

The sequence is:

```
1. Post all period transactions (cutoff enforcement)
2. Sub-ledger reconciliations (AR, AP, inventory, VAT)
3. Accruals and prepayments
4. FX revaluation
5. Trial balance review
6. Period lock
```

## Step 1 — Post all period transactions (cutoff enforcement)

Before any reconciliation or adjustment can happen, every transaction that belongs to
the period must be in the system.

**What this means in practice:**

- All sales invoices for the period have been confirmed (or accrued if not yet confirmed
  but goods have been delivered).
- All supplier invoices received up to the cutoff date have been entered.
- All purchase receipts (GRNs) for goods received in the period have been posted.
- All bank receipts and payments for the period have been recorded.
- Payroll has been posted.
- Depreciation has been posted for the period.

**Common mistake:** a supplier invoice arrives on 3 November but is dated 29 October. The
accountant enters it in November, letting the system default to 3 November. The October
books close without this cost. October's profit is overstated; November's is understated.

**The fix:** enforce the posting date equal to the economic date (delivery date for
goods, service-completion date for services), not the entry date. If October is still
open when the November-dated invoice arrives, correct the posting date before closing.

**Cutoff checklist:**
- [ ] All confirmed sales invoices for the period are posted
- [ ] All GRNs for goods received in the period are posted
- [ ] All supplier invoices matched to GRNs are posted; unmatched GRNs have been accrued
- [ ] All bank transactions through the period-end date are entered
- [ ] Payroll for the period is posted
- [ ] Depreciation for the period is posted

## Step 2 — Sub-ledger reconciliations

The Layer 3 tie-outs must all pass before proceeding. If any fails, the difference must
be investigated and corrected before moving forward.

**AR reconciliation:**
```
SUM(all open customer invoice balances in AR subledger)
= Balance of Trade Receivables (1131) in the GL
```

Both figures must be measured at the same timestamp. Any difference is an error — find
it, fix it.

**AP reconciliation:**
```
SUM(all open supplier bill balances in AP subledger)
= Balance of Trade Payables (2111) in the GL
```

Also verify: **GRN Accrual (2121)** — the total of goods received but not yet invoiced.
Every GRN without a matching supplier invoice should be represented in 2121. If it is
not, the accrual must be posted:

```
DR  Merchandise Inventory (1141)    [GRN amount]
      CR  GRN Accrual (2121)                [GRN amount]
```

This ensures the balance sheet reflects the liability for goods already received even
if the invoice has not yet arrived.

**Inventory reconciliation:**
```
SUM(qty × unit_cost for all items at all locations in the stock subledger)
= Balance of Merchandise Inventory (1141) in the GL
```

**VAT reconciliation:**
```
SUM(output VAT lines in tax subledger for the period)
= Movement in Output VAT Payable (2131) for the period

SUM(input VAT lines in tax subledger for the period)
= Movement in Input Tax Recoverable (1162) for the period
```

**Why all four must pass:** the balance sheet accounts for AR, AP, inventory, and VAT
carry control-account balances. If the control account and subledger disagree, the
balance sheet is wrong. Locking the period with that disagreement bakes the error in
permanently.

## Step 3 — Accruals and prepayments

Accrual accounting requires that income and expenses are recognized when earned or
incurred, not when cash changes hands. Some amounts are not captured by regular invoice
processing:

**Accrued expenses** — costs incurred but not yet invoiced (e.g., the electricity bill
for October arrives on 10 November, but the cost belongs to October):

```
DR  Utilities Expense (6250)        [estimated amount]
      CR  Accrued Expenses (2120)            [estimated amount]
```

When the actual invoice arrives in November, the accrual is reversed and the actual
invoice is posted.

**Prepaid expenses** — cash paid in advance for future-period benefit (e.g., twelve
months' rent paid upfront in January; only one month's rent is an expense each period):

```
Monthly release of prepaid rent:
DR  Rent Expense (6210)             [1/12 of annual rent]
      CR  Prepaid Rent (1161)                 [1/12 of annual rent]
```

**Accrued income** — revenue earned but not yet invoiced. Less common in retail but
relevant for milestone-based services:

```
DR  Accrued Income (1135)           [earned but unbilled]
      CR  Service Revenue (4210)             [earned but unbilled]
```

Accruals ensure the P&L reflects the true economic activity of the period, not just what
has been invoiced.

## Step 4 — FX revaluation

After all invoices are entered and sub-ledgers reconcile, revalue all open
foreign-currency monetary balances at the period-end closing rate.

Identify every open monetary balance in a foreign currency:
- Open AR invoices denominated in FC
- Open AP invoices denominated in FC
- Bank accounts denominated in FC
- Any loans in FC

For each, compute:

```
revaluation_difference = (fc_amount × closing_rate) − carrying_amount
```

Post the revaluation journal entry (one entry per currency pair, or one entry per
individual balance — either is acceptable, but per-balance is more auditable):

```
If positive difference (asset increased OR liability decreased):
DR  [asset account or liability account]    [difference]
      CR  Unrealized FX Gain (4825)                 [difference]

If negative difference (asset decreased OR liability increased):
DR  Unrealized FX Loss (7215)               [difference]
      CR  [asset account or liability account]      [difference]
```

**Why FX revaluation happens after sub-ledger reconciliation (not before):**
The revaluation changes the carrying amounts of AR and AP control accounts. If
reconciliation runs after revaluation, the subledger (which also must be revalued in
its FC amounts) must be updated at the same time as the GL. Running reconciliation
first with original carrying amounts, confirming it passes, then revaluing both GL and
subledger simultaneously, keeps the tie-out logic clean.

**Source the closing rate from a published authoritative source.** Record the rate used,
the source, and the date. Auditors will ask.

## Step 5 — Trial balance review

After all entries, accruals, and revaluations are posted, pull the period trial balance
and review it:

**Check 1 — The TB balances:**
```
SUM(debit balances) = SUM(credit balances)
```
This should be guaranteed by construction. If it is not, there is a system bug.

**Check 2 — Unusual account balances:**
Review each account's balance for reasonableness:
- Does **Merchandise Inventory (1141)** reflect the expected stock level?
- Does **Trade Receivables (1131)** seem reasonable relative to outstanding invoices?
- Are any income or expense accounts showing balances on the wrong side (e.g., a credit
  balance in an expense account)? This might indicate a misposting.
- Is **Opening Balance Equity (3100)** zero? (It should be after the first period.)

**Check 3 — Period movement makes sense:**
Compare this period's TB to the prior period. Investigate large or unexpected changes.

| Account | Prior month | This month | Change | Explanation needed? |
|---------|------------:|----------:|-------:|:---:|
| Product Sales (4110) | 38,200 CR | 41,500 CR | +3,300 | Within range, seasonal |
| COGS (5100) | 24,100 DR | 27,800 DR | +3,700 | Higher sales, slightly higher ratio — investigate |
| FX Loss (7215) | 0 | 1,500 DR | +1,500 | EUR payable revaluation — confirmed |

The TB review is the finance controller's sanity check. It does not require every number
to be explained, but any unexpected movement should be understood before locking.

## Step 6 — Lock the period

Once all five prior steps are complete and the finance controller is satisfied:

1. Change the period status from Open (or Soft-closed) to **Locked**.
2. The system records: who locked it, when, and that the TB was verified.
3. No further postings to this period are accepted.

After locking, if a correction is needed, follow the process from Chapter 03: post a
reclassifying entry in the next open period, do not reopen the locked period.

## Full close checklist (one-page reference)

```
PERIOD CLOSE CHECKLIST — [Period] [Year]

STEP 1: TRANSACTION CUTOFF
  [ ] All sales invoices for the period confirmed
  [ ] All GRNs for goods received in the period posted
  [ ] All supplier invoices / GRN accruals posted
  [ ] All bank transactions entered through period-end date
  [ ] Payroll posted
  [ ] Depreciation posted

STEP 2: SUB-LEDGER RECONCILIATIONS
  [ ] AR aging sum = GL 1131 balance          Difference: ______
  [ ] AP aging sum = GL 2111 balance          Difference: ______
  [ ] GRN accrual (2121) matches unmatched GRNs
  [ ] Inventory valuation report = GL 1141 balance   Difference: ______
  [ ] Output VAT subledger movement = GL 2131 movement
  [ ] Input tax subledger movement = GL 1162 movement

STEP 3: ACCRUALS & PREPAYMENTS
  [ ] Accrued expenses posted (utilities, services, etc.)
  [ ] Prepaid releases posted
  [ ] Accrued income posted (if applicable)

STEP 4: FX REVALUATION
  [ ] Closing rates sourced and documented (date, source, rates per currency pair)
  [ ] All open FC monetary AR balances revalued
  [ ] All open FC monetary AP balances revalued
  [ ] All FC bank accounts revalued
  [ ] Revaluation journal posted; subledger updated at same rates

STEP 5: TRIAL BALANCE REVIEW
  [ ] TB balances (debits = credits)
  [ ] No accounts on unexpected side
  [ ] Opening Balance Equity (3100) = 0
  [ ] Period movements reviewed; material variances explained
  [ ] Finance controller sign-off

STEP 6: LOCK
  [ ] Period status changed to Locked
  [ ] Lock recorded: who, when, TB verified
  [ ] Next period confirmed Open
```

## Why ordering matters — a failure scenario

Suppose a finance team does FX revaluation first (Step 4), then AR reconciliation
(Step 2). After revaluation, the GL balance for AR (1131) has been updated by the
unrealized gain entry. But the AR subledger was not updated simultaneously. The
subledger still carries the pre-revaluation balances. The reconciliation will now show
a difference exactly equal to the revaluation amount — a false alarm that wastes time
to investigate.

The correct sequence eliminates this: reconcile first (subledger = GL at original
rates), then revalue both simultaneously.

Another failure: locking without running the TB review. In October, a coding error
caused depreciation to be posted as a debit to **Accumulated Depreciation (1511)** —
a credit-balance account — instead of crediting it. The account now has a debit balance.
This is visible in seconds on a TB review: an accumulated-depreciation account with a
debit balance is obviously wrong. Without the review, the lock freezes the error. The
year-end balance sheet will overstate fixed assets by the depreciation amount.

The checklist exists precisely to catch errors that are individually subtle but become
obvious when you stop and look at the full picture before locking.

## The mental model

> The monthly close is not an accounting event — it is a quality gate. Each step proves
> one invariant: (1) all period transactions are in; (2) sub-ledger details tie to GL
> control accounts; (3) accrual matching is complete; (4) foreign-currency balances are
> at period-end rates; (5) the trial balance is clean and reviewed; (6) the period is
> sealed. Skip a step and you lock a lie. Follow the sequence in order and you lock a
> truth. The discipline of the close checklist is what makes financial reports reliable
> enough to act on.
