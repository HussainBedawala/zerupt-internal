# 05 — AR/AP Aging Reports

## What aging measures

An aging report answers a simple question: **how old is the money we are owed (or owe)?**

For trade receivables (AR aging): which customer invoices are unpaid, and how long have
they been outstanding?

For trade payables (AP aging): which supplier invoices are unpaid, and how long have
they been outstanding?

Aging is a sub-ledger report. It does not appear in the three primary financial statements,
but it is foundational to managing the business:
- AR aging drives collections: which customers need a call today?
- AP aging drives payment runs: which suppliers must we pay to avoid penalties?
- Both aging reports validate the control accounts on the balance sheet.

## The aging buckets

Invoices are classified into buckets based on how many days they have been overdue (or,
for current invoices, how many days until they are due). The standard retail buckets are:

| Bucket | Definition |
|--------|-----------|
| Current | Not yet due (due date ≥ today) |
| 1–30 days | Overdue 1–30 days |
| 31–60 days | Overdue 31–60 days |
| 61–90 days | Overdue 61–90 days |
| 91–120 days | Overdue 91–120 days |
| 120+ days | Overdue more than 120 days |

Some businesses use fewer buckets (Current / 30 / 60 / 90+). The specific bucket
boundaries are a business choice. What matters is that the boundaries are consistent
across periods and clearly defined (is day 30 the 30th or 31st day?).

The **aging date** is the date as of which the aging is calculated. Usually this is today,
but for a period-end aging (to match the balance sheet) it should be the last day of the
period. Computing an aging as of today against a prior-period balance sheet will produce
bucket numbers that do not reconcile to the control account.

## Why aging must derive from the GL party sub-ledger

There are two ways to compute an aging:

**Wrong approach:** select from an `invoices` table, filter to unpaid status, group by
customer and bucket. Sounds simple. The problem is that `invoices.balance` or
`invoices.is_paid` are derived columns that must be maintained in sync with payments
posted in the GL. Every payment, credit note, advance settlement, or reversal must update
the invoice record. If any of these fail (application bug, partial payment not matched,
reversal not propagated), the aging shows an incorrect balance for that invoice, and the
total aging does not tie to the GL AR control account.

**Correct approach:** drive the aging from journal entry lines in the GL, filtering on
the AR control account codes and grouping by party (customer). The balance for each
customer is the sum of all posted, non-reversed GL lines touching the AR account for
that customer. Individual invoices and payments are identified by their document reference
on the GL line.

When aging is derived from the GL:
- Every posted transaction is included automatically.
- Reversals reduce the balance automatically (a reversed entry nets to zero).
- The sum of all customers' aging balances equals the AR control account balance on the
  TB — because both come from the same source (GL lines).

This is the tie-out that proves the aging is correct.

## The control account tie-out

At any point in time:

```
SUM(all customer balances in AR aging as at date T)
  = AR control account balance on TB as at date T
```

If this equality does not hold, one of the following has happened:

1. **The aging query uses a different date filter or status filter than the TB.** The most
   common cause. If the TB includes "all posted lines" but the aging filters to "open
   invoices only" (omitting invoices that have had payments matched but not fully settled),
   they will differ.

2. **A GL entry was posted to the AR control account without a party reference.** This
   breaks the sub-ledger model. The control account receives a posting that has no
   corresponding customer, so the aging cannot reflect it.

3. **The aging is driven from a denormalized `invoices` table** that is out of sync with
   the GL (the wrong approach described above).

The tie-out test should be run automatically whenever the aging report is generated.
Any discrepancy is surfaced as an error, not hidden.

## Multi-currency aging

A customer may owe amounts in more than one currency. A supplier may be owed in EUR and
USD simultaneously. The aging must be presented **per (party, currency) pair**:

| Customer | Currency | Current | 1–30 | 31–60 | 61–90 | 90+ | Total |
|----------|----------|--------:|-----:|------:|------:|----:|------:|
| Al Noor Trading | SAR | 12,000 | 5,000 | – | – | – | 17,000 |
| Global Parts Inc | USD | 8,000 | – | 3,500 | – | – | 11,500 |
| Gulf Retail Co | KWD | – | 2,200 | – | 1,100 | – | 3,300 |

The SAR total of the AR aging (after translating all currencies to functional currency
at the appropriate rates) must tie to the AR control account balance on the TB. This
requires using the same period-end revaluation rates in the aging as were used in the
GL revaluation.

A common mistake: the aging shows USD balances at today's live rate; the GL shows them
at the period-end rate used during revaluation. The two do not reconcile. The fix: always
use the same period-end rate in the aging that was used in the GL revaluation for that
period.

## AP aging — the mirror image

AP aging works identically for trade payables:

```
SUM(all supplier balances in AP aging as at date T)
  = AP control account balance on TB as at date T
```

The aging is driven from GL lines on the AP control account codes, grouped by supplier.

AP aging has an additional operational dimension: **payment due dates and early-payment
discounts**. A supplier may offer 2/10 net 30 (2% discount if paid within 10 days;
full amount due in 30 days). The aging must show the due date and discount expiry date
so that payment runs can be optimized.

## Aging as a credit-risk and provisioning tool

Beyond operations, AR aging drives the **provision for doubtful debts** (bad debt
allowance). Accounting standards require that receivables be measured at their expected
collectible amount. An aging-based provisioning matrix applies different default rates
to different buckets:

| Bucket | Provision Rate | Reasoning |
|--------|---------------:|-----------|
| Current | 0.5% | Very low risk |
| 1–30 days | 2% | Minor delay |
| 31–60 days | 5% | Moderate risk |
| 61–90 days | 15% | High risk |
| 91–120 days | 30% | Very high risk |
| 120+ days | 50–100% | Likely uncollectible |

The provision is a balance-sheet adjustment:
```
DR  Bad Debt Expense (6410)         [calculated amount]
  CR  Provision for Doubtful Debts (1132)   [same amount]
```

The AR balance sheet line shows net receivables: Trade Receivables (gross) minus
Provision for Doubtful Debts.

## Worked example — AR aging

Zerupt Demo Retail. As at 30 June 2025. SAR functional currency. Three customers.

**Underlying GL lines (AR account 1131, party-tagged, in SAR):**

| Doc | Customer | Date | Amount (SAR) |
|-----|----------|------|-------------:|
| INV-001 | Al Noor | 15 May 2025 | 12,000 |
| REC-001 | Al Noor | 28 May 2025 | (5,000) |
| INV-002 | Al Noor | 10 Jun 2025 | 8,000 |
| INV-003 | Global Parts | 1 Apr 2025 | 15,000 |
| REC-002 | Global Parts | 30 Apr 2025 | (15,000) |
| INV-004 | Global Parts | 20 May 2025 | 11,200 |

**Customer balances:**
- Al Noor: 12,000 − 5,000 + 8,000 = **SAR 15,000**
  - INV-001 balance: SAR 7,000 (partly paid) — 46 days overdue → 31–60 bucket
  - INV-002 balance: SAR 8,000 — 20 days overdue → 1–30 bucket
- Global Parts: 15,000 − 15,000 + 11,200 = **SAR 11,200**
  - INV-004 balance: SAR 11,200 — 41 days overdue → 31–60 bucket

**Aging table:**

| Customer | Current | 1–30 | 31–60 | 61–90 | 90+ | Total |
|----------|--------:|-----:|------:|------:|----:|------:|
| Al Noor Trading | – | 8,000 | 7,000 | – | – | 15,000 |
| Global Parts Inc | – | – | 11,200 | – | – | 11,200 |
| **Total** | **–** | **8,000** | **18,200** | **–** | **–** | **26,200** |

**Tie-out to TB:** AR control account (1131) balance on TB = SAR 26,200 ✓

(Note: The worked TB in Chapter 01 showed 1131 at SAR 31,200. The difference reflects
other customers and entries not shown here. In a real aging, ALL customers are included
and the total must match the full TB balance.)

## The mental model

> Aging is a sub-ledger report: it breaks down the AR or AP control account balance by
> party and by time. It must be driven from the GL, not from a denormalized invoice
> table, and its total must equal the control account balance on the trial balance to the
> cent. If it does not tie, there is a data integrity failure — either a posting without
> a party reference, or the aging is reading from the wrong data source. Multi-currency
> aging must use the same period-end revaluation rates as the GL. Never publish an aging
> that does not tie to the control account.

Next: `06-comparatives-and-periods.md`.
