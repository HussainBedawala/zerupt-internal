# Bank Reconciliation

## What is Bank Reconciliation?

Bank reconciliation is the process of comparing a company's internal accounting records (the General Ledger) against the bank's statement to identify and explain differences. It ensures that every transaction recorded by the bank is also recorded in the books, and vice versa.

## The Two-Sided Model

A bank reconciliation has two sides that must arrive at the same adjusted balance:

### Book Side (General Ledger)
```
  Book Balance (GL balance for the bank account)
+ Deposits in Transit (recorded in books, not yet on bank statement)
- Outstanding Cheques (issued by company, not yet cleared by bank)
= Adjusted Book Balance
```

### Bank Side (Bank Statement)
```
  Bank Closing Balance (per the bank statement)
+ Unrecorded Deposits (on bank statement, not yet in books)
- Unrecorded Withdrawals (on bank statement, not yet in books)
= Adjusted Bank Balance
```

**When Adjusted Book Balance = Adjusted Bank Balance, the reconciliation is complete.**

## Timing Differences vs. Errors

Most differences are **timing differences** — transactions that appear in one record but haven't yet appeared in the other:
- A cheque written on March 28 may not clear the bank until April 2
- A deposit made on March 31 afternoon may not appear until April 1

**Errors** are genuine mistakes that need correction (wrong amounts, duplicate entries, etc.).

## Auto-Matching Strategies

Automated matching typically uses multiple strategies in priority order:

1. **Exact match** — same amount, same date, same reference number
2. **Amount + date window** — same amount within N days
3. **Reference match** — matching reference/cheque numbers regardless of date

Each strategy produces candidate matches that require user confirmation. No auto-match should ever be applied without review in a financial system.

## "No Match Needed" and Audit Trails

Some bank items genuinely have no corresponding journal entry (bank fees, interest charges). These are marked as "no match needed" with a mandatory reason. The reason is an immutable audit record — once saved, it cannot be changed or deleted.

## CSV Import Considerations

Bank statements come in varied CSV formats. A column mapping step is essential:
- Different banks use different column orders
- Some banks use separate debit/credit columns; others use a single signed amount
- Date formats vary by region (DD/MM/YYYY in MENA, MM/DD/YYYY in US)
- Header rows vary (some have 0, some have 2+)

Saving column mappings per bank account avoids re-mapping on every import.

## Reconciliation as a Period-Closing Control

Completing a reconciliation is an **irreversible** action that serves as a period control:
- It confirms that all bank activity for the period has been accounted for
- It creates an audit trail of who reconciled, when, and what the balances were
- It prevents re-opening or modifying matched transactions
- Unmatched items carry forward to the next period's reconciliation

## Key Accounting Concepts

- **Deposits in Transit**: Cash received and recorded in books but not yet reflected on the bank statement
- **Outstanding Cheques**: Cheques issued and recorded in books but not yet presented to/cleared by the bank
- **Bank Charges**: Fees debited by the bank that the company may not have recorded yet
- **Interest Income**: Interest credited by the bank that the company may not have recorded yet
- **NSF Cheques**: Cheques deposited but returned due to insufficient funds in the payer's account
