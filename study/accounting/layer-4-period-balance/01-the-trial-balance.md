# 01 — The Trial Balance

## What the trial balance is

The **trial balance** (TB) is a summary of every account in the general ledger, showing
the net debit or credit balance of each account as of a given date. Its purpose is to
prove that the ledger balances: the sum of all debit balances must equal the sum of all
credit balances.

This is not a special report. It is the simplest possible output of the double-entry
ledger. Because every journal entry posts equal debits and credits, the sum of all
entries — across all accounts, from inception to any chosen date — must also produce
equal debits and credits. The TB is the check that confirms this.

The TB is the foundation of every financial statement. The balance sheet is a reorganized
subset of TB accounts (assets, liabilities, equity). The P&L is a reorganized subset of
TB accounts (income, expenses). The cash flow statement is derived from changes in TB
accounts across periods. None of these reports can be trusted if the TB does not balance.

## How the TB is derived from posted lines

Every journal entry consists of one or more debit lines and one or more credit lines. Each
line belongs to one account. The balance of an account at any point in time is:

```
balance = SUM(debit amounts posted to this account up to date T)
        - SUM(credit amounts posted to this account up to date T)
```

If that number is positive, the account has a net debit balance. If negative, it has a
net credit balance.

The TB is simply the list of all accounts with their net balances as of date T:

```
Trial Balance as at T

Account                             Debit          Credit
────────────────────────────────────────────────────────
[each account with a balance]
────────────────────────────────────────────────────────
TOTAL                           XXXXX.XX       XXXXX.XX
────────────────────────────────────────────────────────
```

The totals must be equal. That equality is not a coincidence — it is a mathematical
consequence of double-entry. If they are not equal, at least one journal entry was
posted incorrectly (or the summing code has a bug).

## As-of vs period TB

There are two common presentations:

**As-of (cumulative) TB:** every account's balance from the beginning of the books up
to the chosen date. This is what most accounting software produces when you ask for "TB
as at 30 June 2025." Balance-sheet accounts carry their full historical balance. Income
and expense accounts carry their balance since the last year-end close (or since inception
if the books are new and never closed).

**Period (movement) TB:** the net debits and credits posted during a specific period only.
This is less common but useful for reconciling what happened in a single month. If you
want to see only August's activity, you restrict the JE lines to those dated in August.

The period TB does not show opening balances — only the movement for the period. Adding
the opening balances (from the prior period's closing TB) to the period movement TB gives
you the as-of TB at the end of the period.

## Leaf accounts vs roll-up

A chart of accounts is hierarchical. Header accounts (parents) do not receive postings
directly — they aggregate the balances of their child accounts. Leaf accounts (children
with no further children) receive all the actual postings.

The TB can be presented either way:

**Leaf TB:** lists only accounts that have received at least one posting. This is the
most granular view — every account that carries a balance is shown. The totals balance
because every JE line targets a leaf account.

**Roll-up TB:** groups accounts under their parent headers, showing subtotals. For
example, "Current Assets" might aggregate **Cash in Hand (1111)**, **Bank (1121)**,
and **Trade Receivables (1131)** into a single line. Roll-up TBs are more readable for
management but hide detail. The underlying leaf-level data still balances.

For accounting work — posting audits, reconciliations, period closes — always use the
leaf TB. The roll-up TB is a reporting convenience for Layer 5.

## Worked trial balance

Company: Zerupt Demo Retail. Reporting currency: SAR. Date: 30 June 2025. Books opened
1 January 2025. Half-year of transactions posted.

| Account Code | Account Name                  | Debit (SAR)  | Credit (SAR) |
|:-------------|:------------------------------|-------------:|-------------:|
| **1111**     | Cash in Hand                  |    2,500.00  |              |
| **1121**     | Bank — Al Rajhi               |   84,300.00  |              |
| **1131**     | Trade Receivables             |   31,200.00  |              |
| **1141**     | Merchandise Inventory         |   47,600.00  |              |
| **1162**     | Input Tax Recoverable         |    3,820.00  |              |
| **1510**     | Furniture & Fixtures          |   18,000.00  |              |
| **1511**     | Accumulated Depreciation      |              |    1,500.00  |
| **2111**     | Trade Payables                |              |   28,750.00  |
| **2131**     | Output VAT Payable            |              |    6,940.00  |
| **2151**     | Customer Deposits             |              |    4,000.00  |
| **3110**     | Share Capital                 |              |  100,000.00  |
| **3120**     | Retained Earnings             |              |   14,200.00  |
| **4110**     | Product Sales                 |              |  138,800.00  |
| **4200**     | Sales Returns                 |    2,100.00  |              |
| **5100**     | Cost of Goods Sold            |   83,400.00  |              |
| **6100**     | Salaries Expense              |   12,000.00  |              |
| **6210**     | Rent Expense                  |    6,000.00  |              |
| **7130**     | Bank Charges                  |      270.00  |              |
| **7210**     | FX Loss                       |      500.00  |              |
|              | **TOTAL**                     | **291,690.00** | **294,190.00** |

Wait — the totals do not equal. That is deliberate. The difference is SAR 2,500.00.
Let us trace what happened.

A post-dated cheque received from a customer (SAR 2,500) was posted as:

```
DR  PDC Receivable (1134)        2,500.00
      CR  Trade Receivables (1131)          2,500.00
```

Both sides posted correctly. But when pulling the TB the developer's query omitted
account **1134** (PDC Receivable) because it had not been added to the account listing
table yet. The debit side is short by SAR 2,500. The credit side is correct.

The fix: ensure every account that has received a posting appears in the TB. If an account
exists in the ledger lines but not in the accounts master, the software has a data
integrity gap. The TB total difference immediately reveals this.

Corrected TB with account 1134 added:

| Account Code | Account Name                  | Debit (SAR)  | Credit (SAR) |
|:-------------|:------------------------------|-------------:|-------------:|
| **1134**     | PDC Receivable                |    2,500.00  |              |
| *(all others as above)* | …                |  289,190.00  |  294,190.00  |
| | **TOTAL**                     | **291,690.00** | **291,690.00** |

Balanced. The TB sum is SAR 291,690.00 on both sides. The books are proven to balance
as at 30 June 2025.

## What an out-of-balance TB means

If the trial balance does not balance, exactly one of three things has happened:

**1. A journal entry was posted with unequal debits and credits.** This should be
impossible in a correct system because the posting service validates balance before
writing. If it happens, the posting service has a bug that allowed a malformed entry
through — a critical defect.

**2. A posting was partially written.** One leg of a journal entry committed to the
database but the other did not, because the database transaction was not atomic. This
also should be impossible if the system uses a single database transaction per JE. If it
happens, it means the application wrote two separate database operations without wrapping
them in a transaction — a critical defect.

**3. The TB query is wrong.** The most common reason. An account is missing from the
query (as in the example above), a filter excludes a posting that should be included, or
a sign convention error (debits added as negatives) produces an incorrect total. The
ledger is balanced; the query is misleading.

In a correctly built system, scenarios 1 and 2 are prevented by construction. Scenario 3
is a reporting bug that must be hunted by examining the raw JE lines, not the TB itself.
The rule is: **if the TB does not balance, audit the TB query before assuming the ledger
is broken.**

## Why software should make the TB balance by construction

Manual bookkeeping can produce an unbalanced ledger — a clerk can make an entry with
unequal sides by accident. That is why "preparing a trial balance" was historically a
manual step, and finding the error was a real bookkeeping skill.

In software there is no reason to accept this risk. The posting service can and must
enforce balance before writing:

```
if (SUM(debit_lines) ≠ SUM(credit_lines)):
    raise BalanceViolation("JE does not balance — cannot post")
```

This check is the posting equivalent of a database constraint. It runs inside the same
transaction as the write. If the check fails, nothing is written. The ledger never
receives an unbalanced entry.

With this check in place, the TB is guaranteed to balance by construction. Running the TB
then becomes a confirmation (it always passes) rather than a diagnostic (did we make an
error this month?). The time a software accountant spends on TB reconciliation is zero —
and that is the correct amount of time to spend on it.

## The mental model

> The trial balance is the mathematical certificate that the ledger is internally
> consistent: SUM(debits) = SUM(credits) across every account, at every point in time.
> In correctly built software this is guaranteed by construction — the posting service
> enforces balance before writing, and every TB run is a confirmation not a hunt. When a
> TB does not balance, audit the query first: a missing account or a sign error in the
> reporting code is far more likely than a broken ledger. The TB is the prerequisite for
> every report in Layer 5 — nothing built on it can be trusted until it balances.

Next: `02-opening-balances.md`.
