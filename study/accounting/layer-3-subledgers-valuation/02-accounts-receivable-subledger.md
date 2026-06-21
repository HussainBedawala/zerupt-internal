# 02 — Accounts Receivable Subledger

## What the AR sub-ledger is

The AR sub-ledger is a running record of what each customer owes the business. It is
not a set of journal entries. It is a per-customer ledger -- a flat list of transactions
with a running balance -- maintained in parallel with the GL control account
**Trade Receivables (1131)**.

Each entry in the customer ledger corresponds to a posting that also touched 1131 in
the GL. If a transaction appears in the sub-ledger but not in the GL, or in the GL but
not in the sub-ledger, something has gone wrong.

## Structure of a customer ledger

The customer ledger for one customer looks like this:

**Al-Nasser Trading -- AR Ledger (SAR)**

| Date | Reference | Description | Debit | Credit | Balance |
|------|-----------|-------------|-------|--------|---------|
| 2026-01-05 | INV-001 | Sale of goods | 2,100.00 | | 2,100.00 |
| 2026-01-18 | INV-002 | Sale of goods | 1,050.00 | | 3,150.00 |
| 2026-02-03 | RCP-001 | Payment received -- INV-001 | | 2,100.00 | 1,050.00 |
| 2026-02-10 | CN-001 | Credit note -- partial return on INV-002 | | 525.00 | 525.00 |

Closing balance: SAR 525.00 still owed by Al-Nasser Trading.

Debits increase the customer's balance (they owe more). Credits decrease it (they owe
less, either because they paid or because a return was processed). This mirrors the GL:
**Trade Receivables (1131)** has a debit normal balance.

## Invoice allocation: matching payments to invoices

A payment in the AR context is not just a credit to the customer's running balance -- it
must also be matched to specific open invoices. This matching is called **allocation**.
Allocation matters for two reasons: it determines which invoices are closed (and
therefore off the aging report), and it determines whether any partial balance remains
on an invoice.

### FIFO allocation

Under **FIFO allocation**, a payment is applied to the oldest outstanding invoice first,
then the next oldest, and so on until the payment amount is exhausted. The customer does
not get to choose which invoice is settled; the system decides based on invoice date.

FIFO is simple and systematic. It also tends to minimize the age of overdue items.

### Specific allocation

Under **specific allocation**, the customer specifies which invoices the payment covers.
This is common in B2B -- a customer might pay invoice #INV-007 and #INV-009 while
leaving #INV-003 open because it is in dispute.

Specific allocation requires that the sum of amounts allocated does not exceed the
total payment. Any unallocated remainder sits as an **unapplied credit** on the
customer's account until the customer directs it to an invoice.

### Worked example: specific allocation with FIFO fallback

Al-Nasser Trading has three open invoices:

| Invoice | Date | Amount (SAR) | Status |
|---------|------|--------------|--------|
| INV-010 | 2026-03-01 | 1,050.00 | Open |
| INV-011 | 2026-03-15 | 2,100.00 | Open |
| INV-012 | 2026-04-02 | 630.00 | Open |

Total owed: SAR 3,780.00.

The customer sends a payment of SAR 3,150.00, specifying that it covers INV-010 in
full and most of INV-011. The allocation:

| Allocated to | Amount (SAR) |
|-------------|--------------|
| INV-010 (full) | 1,050.00 |
| INV-011 (partial) | 2,100.00 |
| **Total payment** | **3,150.00** |

Wait -- that exceeds the payment. The customer specified INV-011 in full, but the
payment only covers SAR 2,100.00 of it after INV-010. Actually: payment is SAR 3,150.00,
INV-010 absorbs SAR 1,050.00, leaving SAR 2,100.00 for INV-011. INV-011 is SAR 2,100.00,
so it is exactly cleared.

After allocation:

| Invoice | Date | Amount (SAR) | Paid (SAR) | Remaining (SAR) | Status |
|---------|------|--------------|------------|-----------------|--------|
| INV-010 | 2026-03-01 | 1,050.00 | 1,050.00 | 0.00 | Closed |
| INV-011 | 2026-03-15 | 2,100.00 | 2,100.00 | 0.00 | Closed |
| INV-012 | 2026-04-02 | 630.00 | 0.00 | 630.00 | Open |

Customer's new sub-ledger balance: SAR 630.00. The GL credit of SAR 3,150.00 has been
applied against 1131, reducing it by the same amount.

## Partial payment

A customer pays SAR 700.00 against INV-001 for SAR 1,050.00. The invoice does not
close. It remains open for the unpaid balance of SAR 350.00.

The sub-ledger records two entries for this invoice:

| Date | Reference | Description | Debit | Credit | Balance |
|------|-----------|-------------|-------|--------|---------|
| 2026-01-05 | INV-001 | Sale of goods | 1,050.00 | | 1,050.00 |
| 2026-02-01 | RCP-002 | Partial payment -- INV-001 | | 700.00 | 350.00 |

INV-001's **open item** balance is SAR 350.00. It stays on the aging report at its
original invoice date until the remaining SAR 350.00 is paid or written off.

The GL journal entry for the partial payment:

```
DR  Cash / Bank (1111)             700.00
      CR  Trade Receivables (1131)             700.00
```

The GL decreases by SAR 700.00. The customer's sub-ledger decreases by SAR 700.00.
The invoice allocation records SAR 700.00 against INV-001, leaving it open for
SAR 350.00.

## Credit notes

A credit note is issued when goods are returned, when a pricing error is corrected, or
when a discount is granted after the fact. It reduces what the customer owes.

### Journal entry for a credit note

Suppose Al-Nasser Trading returns goods originally sold for SAR 500.00 (net) with
SAR 25.00 VAT:

```
DR  Sales Returns and Allowances (4190)     500.00
DR  Output VAT Payable (2131)                25.00
      CR  Trade Receivables (1131)               525.00
```

The credit reduces the AR control account. In the same transaction, the customer's
sub-ledger record decreases by SAR 525.00.

### Allocation of a credit note

A credit note can be:

1. Applied against a specific open invoice, reducing the balance due on that invoice.
2. Left as an **open credit** on the customer's account, to be applied against a future
   invoice.

In either case, the sub-ledger balance reflects the net position. An open credit sitting
unallocated still appears as a credit balance on the customer's account and reduces the
total AR balance in the GL.

## Write-offs

When a receivable is deemed uncollectable, it must be removed from the books. There are
two approaches.

### Direct write-off

The simplest approach: write off the specific customer's balance directly.

```
DR  Bad Debt Expense (6100)        350.00
      CR  Trade Receivables (1131)             350.00
```

The GL control account decreases. The customer's sub-ledger balance decreases by
SAR 350.00 to zero. The loss hits the P&L immediately as an expense.

The direct write-off is straightforward but violates the matching principle in GAAP
because the bad debt expense is recognized in the period the debt is written off, not
the period the sale was made.

### Allowance method (GAAP proper)

The allowance method estimates bad debt in advance and creates a contra-asset account:
**Allowance for Doubtful Accounts (1132)**.

Step 1 -- recognize the estimated loss at period-end (this does NOT touch the customer
sub-ledger):

```
DR  Bad Debt Expense (6100)        800.00
      CR  Allowance for Doubtful Accounts (1132)     800.00
```

On the balance sheet, AR is presented net: 1131 minus 1132. The sub-ledger is unchanged
at this stage -- no specific customer has been identified.

Step 2 -- when a specific customer's balance is confirmed uncollectable, write it off
against the allowance:

```
DR  Allowance for Doubtful Accounts (1132)     350.00
      CR  Trade Receivables (1131)                       350.00
```

Now both the GL control account and the customer's sub-ledger decrease by SAR 350.00.
The net AR on the balance sheet is unchanged (1132 decreases and 1131 decreases by the
same amount). The P&L impact was recognized in Step 1.

If the customer later pays (a recovery), the write-off is reversed and the payment is
applied normally.

## AR aging

The AR aging report is the primary management tool for receivables. It shows each
customer's balance broken into buckets by how old the underlying invoices are.

Aging is calculated from the **invoice date**, not the due date. The due date matters
for collection -- an invoice might have 30-day payment terms and therefore not be
"overdue" until day 31. But for aging purposes, the clock starts at invoice date so
the report shows how long the money has actually been outstanding.

**AR Aging Report -- as of 2026-04-30 (SAR)**

| Customer | Current (0-30d) | 31-60d | 61-90d | 90d+ | Total |
|----------|----------------|--------|--------|------|-------|
| Al-Nasser Trading | 1,050.00 | 0.00 | 0.00 | 0.00 | 1,050.00 |
| Gulf Retail LLC | 0.00 | 800.00 | 400.00 | 0.00 | 1,200.00 |
| Hamid & Sons | 0.00 | 0.00 | 0.00 | 800.00 | 800.00 |
| **TOTAL** | **1,050.00** | **800.00** | **400.00** | **800.00** | **3,050.00** |

The TOTAL column (SAR 3,050.00) must equal the GL balance of **Trade Receivables
(1131)**. If it does not, the sub-ledger has diverged from the GL.

The 90d+ bucket is where bad debt risk concentrates. Hamid & Sons owes SAR 800.00 that
is more than 90 days old. This is a candidate for an allowance or a direct write-off
depending on the circumstances.

Gulf Retail LLC has balances in the 31-60d and 61-90d buckets. Their oldest outstanding
balance is approaching the critical threshold. A collection call is due.

## The mental model

> The AR sub-ledger is the GL's trade receivables balance broken into named rows -- one
> per customer, with every invoice, payment, and credit note posted against the right
> row at the same moment it hits the GL. Aging makes the sub-ledger actionable: it tells
> a collector exactly who to call, for which invoices, and how overdue they are. A
> sub-ledger that drifts from the GL makes collections blind.

Next: `03-accounts-payable-subledger.md`.
