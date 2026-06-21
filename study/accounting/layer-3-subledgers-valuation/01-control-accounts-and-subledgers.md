# 01 — Control Accounts and Subsidiary Ledgers

## What a control account is

A **control account** is a GL account whose balance equals the sum of a set of
individual subsidiary records. Nothing is ever posted to it directly by a human. The
only legitimate way to change its balance is through the defined posting pipeline --
invoice confirmation, payment posting, bill entry, adjustment -- where the code that
touches the GL account also updates the corresponding sub-ledger record in the same
atomic operation.

This is both a technical constraint and an accounting discipline. The constraint: the
posting pipeline enforces the two-sided update. The discipline: no one opens a manual
journal entry and debits or credits a control account in isolation. If they do, the GL
changes but the sub-ledger does not, and the invariant breaks immediately.

## What a subsidiary ledger is

A **subsidiary ledger** (sub-ledger) is the detail behind the control account. It is
not a set of double-entry journal entries. It is a set of running-balance records, one
per entity -- one per customer, one per supplier, one per inventory item. Each record
answers the question: "how much does this specific entity owe, or how much of this
specific item do we hold?"

The sub-ledger record is updated at the same moment as the GL entry. Not eventually.
Not in a batch job that runs at midnight. At the same moment, in the same database
transaction.

## The fundamental rule

Every posting that touches the control account must simultaneously update the sub-ledger
by the same amount, in the same direction.

If a confirmed invoice increases **Trade Receivables (1131)** by SAR 1,050.00 in the
GL, the customer's sub-ledger balance must increase by SAR 1,050.00 in the same
transaction. If a payment decreases 1131 by SAR 1,050.00, the customer's sub-ledger
balance must decrease by SAR 1,050.00. There is no valid intermediate state where
they differ.

## A concrete AR example

Suppose the business has three customers with outstanding balances:

| Customer | Balance (SAR) |
|----------|---------------|
| Al-Nasser Trading | 3,500.00 |
| Gulf Retail LLC | 1,200.00 |
| Hamid & Sons | 800.00 |
| **TOTAL** | **5,500.00** |

The GL account **Trade Receivables (1131)** shows SAR 5,500.00. The sum of the three
sub-ledger rows is also SAR 5,500.00. They match. The invariant holds.

### Posting an invoice

Al-Nasser Trading buys SAR 2,100.00 of goods (net) plus SAR 105.00 VAT. The confirmed
invoice posts this journal entry:

```
DR  Trade Receivables (1131)     2,205.00
      CR  Product Sales (4110)              2,100.00
      CR  Output VAT Payable (2131)           105.00
```

In the same transaction, the sub-ledger record for Al-Nasser Trading increases by
SAR 2,205.00. The updated table:

| Customer | Balance (SAR) |
|----------|---------------|
| Al-Nasser Trading | 5,705.00 |
| Gulf Retail LLC | 1,200.00 |
| Hamid & Sons | 800.00 |
| **TOTAL** | **7,705.00** |

GL balance of 1131: SAR 7,705.00. Sub-ledger sum: SAR 7,705.00. Still equal.

### Posting a payment

Al-Nasser Trading pays SAR 3,500.00 against their existing balance. The payment posts:

```
DR  Cash / Bank (1111)           3,500.00
      CR  Trade Receivables (1131)           3,500.00
```

In the same transaction, the sub-ledger record for Al-Nasser Trading decreases by
SAR 3,500.00. Their new balance: SAR 2,205.00.

| Customer | Balance (SAR) |
|----------|---------------|
| Al-Nasser Trading | 2,205.00 |
| Gulf Retail LLC | 1,200.00 |
| Hamid & Sons | 800.00 |
| **TOTAL** | **4,205.00** |

GL balance of 1131: SAR 4,205.00. Sub-ledger sum: SAR 4,205.00. Still equal.

## What divergence looks like

A developer writes a script to record a bank transfer. The script posts:

```
DR  Cash / Bank (1111)           3,500.00
      CR  Trade Receivables (1131)           3,500.00
```

The GL entry is correct. The trial balance still balances. But the script forgot to
update the sub-ledger. The sub-ledger still shows Al-Nasser Trading with a balance of
SAR 5,705.00 instead of the correct SAR 2,205.00.

The updated state of the books:

| What | Value (SAR) |
|------|-------------|
| GL balance of 1131 | 4,205.00 |
| Sub-ledger sum | 5,705.00 |
| **Divergence** | **1,500.00** |

The GL balances. The P&L is unaffected. The balance sheet total is correct. But the
AR aging report will show Al-Nasser Trading owing SAR 5,705.00 when they owe
SAR 2,205.00. Collections will send a demand notice for an amount that has already
been paid. This is the "GL balances but the detail is wrong" class of bug. It is
discovered at month-end reconciliation -- or when an angry customer calls.

## The reconciliation discipline

A well-run system runs a reconciliation check continuously or at least daily:

```
SELECT
    gl.balance         AS gl_control_balance,
    SUM(sl.balance)    AS subledger_sum,
    gl.balance - SUM(sl.balance) AS divergence
FROM
    gl_accounts gl
    JOIN subledger_balances sl ON sl.control_account = gl.account_code
WHERE
    gl.account_code = '1131'
GROUP BY
    gl.balance;
```

If `divergence` is anything other than zero, there is a bug or a manual posting that
bypassed the pipeline. The reconciliation report should name the posting that caused
the gap so it can be investigated and corrected.

In a properly built system, the only time this number is non-zero is when there is an
actual code defect or a deliberate (and therefore suspicious) manual journal entry. There
is no legitimate scenario where a control account and its sub-ledger are allowed to
differ.

## The three control accounts in scope

**Trade Receivables (1131):** AR. Sub-ledger: one record per customer. Unit of detail:
outstanding invoice balance per customer.

**Trade Payables (2111):** AP. Sub-ledger: one record per supplier. Unit of detail:
outstanding bill balance per supplier.

**Merchandise Inventory (1141):** Inventory. Sub-ledger: one record per SKU. Unit of
detail: quantity on hand and weighted average unit cost per item. The control account
balance equals the sum of (quantity x unit cost) across all items.

All three follow the same structural logic. The chapters ahead work through each one
in full detail.

## The mental model

> The GL is the total; the sub-ledger is the list of parts that add up to that total.
> A healthy set of books keeps them in lockstep by design -- every code path that moves
> money in the GL simultaneously moves it in the right sub-ledger row. The moment those
> two things can diverge, the books are unreliable even when the trial balance is
> perfectly balanced.

Next: `02-accounts-receivable-subledger.md`.
