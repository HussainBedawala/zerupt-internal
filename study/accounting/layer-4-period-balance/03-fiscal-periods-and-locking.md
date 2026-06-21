# 03 — Fiscal Periods and Locking

## What a fiscal period is

A **fiscal period** is a defined slice of time within a fiscal year — typically a
calendar month — during which transactions are grouped for reporting and analysis. A
**fiscal year** is the twelve-month span the business uses for annual reporting. It may
or may not align with the calendar year.

Examples:
- A Saudi company (SAR) often uses the Hijri calendar for tax purposes but a Gregorian
  fiscal year for IFRS reporting. The fiscal year might be 1 January 2025 – 31 December
  2025.
- An Indian company (INR) with a financial year ending 31 March follows FY 2025–26:
  1 April 2025 – 31 March 2026.
- A UAE company (AED) might have a fiscal year of 1 July 2025 – 30 June 2026.

In the general ledger, every journal entry carries a posting date. That posting date
determines which period the entry belongs to. A JE dated 15 March 2025 belongs to
March 2025 (Period 3 of FY 2025).

## The period lifecycle

A fiscal period passes through several states:

| Status | Meaning |
|--------|---------|
| **Open** | Transactions can be posted freely. Any date within the period is accepted. |
| **Soft-closed** | The preliminary reports have been run. New transactions require a supervisor override or a specific permission. Warning shown to users. |
| **Hard-closed** | No new transactions are accepted. The period's books are finalized but not yet sealed in the system. Manual override by a finance manager still possible in some implementations. |
| **Locked** | The period is immutable. No new postings, no reversals, no corrections are accepted for this period. The only action available is posting a reversing entry into a later open period. |

Not every system has all four states. The minimum meaningful set is **Open** and
**Locked**. Soft-close and hard-close are operational conventions that reduce errors
during the close process.

## Why you lock periods

The purpose of locking is to **stop changing reported history.**

When a period is locked, the numbers you reported to the board, to the bank, to tax
authorities, or to the auditor are frozen. Nobody can go back and change the P&L for
March 2025 after it has been reported.

Consider what happens without locking:

A manager discovers in May that a supplier invoice for SAR 8,500 was missed in February.
They post the invoice in the system, which helpfully defaults to the invoice's original
date of 12 February. The system accepts the February date. February's P&L is now
different from what was reported. If someone pulls the February TB in June, it will not
match the February TB that was emailed to the bank in March. There is no audit trail of
the change. The bank cannot reconcile.

With locking: the system refuses a February posting date because February is locked. The
accountant must post the missed invoice in May (the current open period). The May P&L
is slightly higher than expected — a known, disclosed, auditable fact. February stays
exactly as reported.

## The backdating danger

Backdating is posting a transaction with a date in a prior period. There are two
scenarios:

**Legitimate backdating:** correcting an error before the period is locked. The period
is still open; the entry date belongs to that period; the correction is proper.

**Dangerous backdating:** posting to a period that has already been reported. Even if the
system allows it (period is open), doing so creates a discrepancy between what was
reported and what the books now show. The books become inconsistent with history.

The lock is the hard technical control. But the soft control — the discipline — is: once
a period's reports have been distributed to any external party (bank, investor, tax
authority), treat the period as locked even if it is not technically so in the system.
Soft-close flags are the operational mechanism that enforces this discipline before the
technical lock is applied.

## Reversing a closed-period entry into the open period

When an error is discovered after a period is locked, the correct approach is never to
unlock the period and change the entry. The correct approach is:

1. Post a **reversing entry** in the current open period, dated in the current period,
   that exactly offsets the erroneous entry.
2. Post the **correct entry** in the current open period.

The effect: the locked period is untouched. The correction is visible in the current
period. The correction is auditable — the reversal explicitly references the original
entry.

**Example:**

February (locked) contains an incorrect entry: a SAR 5,000 expense was posted to the
wrong account — charged to **Rent Expense (6210)** instead of **Repairs & Maintenance
(6230)**. Discovered in May.

Step 1 — Reversal in May:
```
DR  Rent Expense (6210)             5,000.00
      CR  Repairs & Maintenance (6230)          5,000.00

  ← this reverses the mis-categorization; note: reversals post
    debits and credits swapped from the original
```

Wait — that is not right. Let us think clearly. The original (wrong) February entry was:

```
DR  Rent Expense (6210)             5,000.00    ← wrong account debited
      CR  Bank (1121)                           5,000.00
```

The bank credit was correct. The wrong thing was which expense account was debited.
To correct: we need to move the charge from Rent to Repairs. In the open period (May):

```
DR  Repairs & Maintenance (6230)    5,000.00    ← correct account
      CR  Rent Expense (6210)                   5,000.00    ← reverses the wrong account
```

This reclassifying entry does not touch Bank (1121) because the Bank leg was always
correct. The net effect across the two periods:

- **February (locked):** DR Rent 5,000 / CR Bank 5,000 — unchanged.
- **May (open):** DR Repairs 5,000 / CR Rent 5,000.
- **Cumulative (all time):** DR Repairs 5,000 / CR Bank 5,000 — correct.

The year-to-date P&L as of May is now correct. February is unaltered.

## Permissions and audit for re-opening

Unlocking a period should require elevated permissions and must produce an audit trail.
The minimum:

- Only a **Finance Manager** or **System Administrator** role can change period status.
- Any status change (especially from Locked back to Open) is recorded: who did it, when,
  what the previous status was, and a mandatory reason.
- A notification is sent to the business owner / CFO when a locked period is re-opened.

Re-opening a locked period should be rare — almost never. Acceptable reasons:
- Auditors found an error in the locked period that materially changes the financial
  statements and must be corrected in-period (comparative period restatement).
- A statutory requirement mandates a specific correction dated in the period.

Not acceptable reasons:
- "It's easier to post it in February than to understand why May's P&L looks off."
- "The manager wants the report to look better."

When a locked period must be re-opened, the audit log entry is the record that makes the
action defensible. Without it, re-opening is a cover-up risk.

## Period end date and posting cutoff

Every period has a clear **cutoff date**: the last date on which a transaction can belong
to that period. Invoices, receipts, and other events sometimes carry dates close to the
cutoff. The rules:

- A purchase invoice dated 31 March but received on 3 April: in accrual accounting, the
  liability existed at 31 March, so it should be accrued in March (or posted in April
  with a note). The system's period configuration determines which approach is used.
- A payment made on 1 April that clears a March invoice: the payment belongs to April.
  The March AR (or AP) should remain open at 31 March; the April receipt clears it.

Strict cutoff discipline is essential for period-over-period comparisons. Allowing
December invoices to bleed into January — or January payments to be backdated into
December — makes month-on-month P&L comparison unreliable.

## Fiscal year boundaries and period numbering

A 12-period fiscal year numbered 1–12. The system maintains:

```
Fiscal Year 2025 (1 Jan 2025 – 31 Dec 2025)
  Period 01: 1 Jan – 31 Jan 2025  [Locked]
  Period 02: 1 Feb – 28 Feb 2025  [Locked]
  Period 03: 1 Mar – 31 Mar 2025  [Soft-closed]
  Period 04: 1 Apr – 30 Apr 2025  [Open]
  …
  Period 12: 1 Dec – 31 Dec 2025  [Open]
Period 00 (Opening): 1 Jan 2025   [Locked]  ← the migration entry
```

Period 00 (or a specially designated "opening period") is useful as a container for the
opening balance entry only. It is always locked after migration is complete and is never
re-opened.

A 13th period is sometimes added to accommodate year-end adjustments (auditor
adjustments, tax provisions) after Period 12 is closed. Period 13 contains only
adjusting entries and has no calendar days of its own; it is a logical bucket for
year-end work.

## The mental model

> A fiscal period is a named slice of time that collects journal entries. Locking a
> period freezes history: once locked, no entry can be added, changed, or removed for
> that period. Corrections to locked periods are never made in-period — they are
> reclassifying entries in the current open period, which auditors can trace and verify.
> Unlock a period only in genuine emergencies, with elevated permissions, a mandatory
> reason, and a permanent audit log entry. The discipline of locking is what makes
> reported numbers trustworthy across time.

Next: `04-year-end-close.md`.
