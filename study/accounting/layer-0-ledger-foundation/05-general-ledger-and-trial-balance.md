# 05 — The General Ledger and the Trial Balance

## From entries to balances

Journal entries (Chapter 04) are the *chronological* record — "what happened, in order." But to
answer "how much cash do I have?" you don't want to scroll through history; you want the running
total for the Cash account.

The **General Ledger (GL)** is that reorganization. Same data, grouped *by account* instead of
*by time*. For each account it collects every line that ever touched it and keeps a running
balance.

```
Journal (by time)                 General Ledger (by account)
─────────────────                 ───────────────────────────
Jan 1  Cash      Dr 1000   ──┐    CASH account:
       Loan         Cr 1000   ├──▶   Jan 1  Dr 1000   bal 1000
Jan 3  Inventory Dr  300   ──┤       Jan 3  Cr  300   bal  700
       Cash         Cr  300 ──┘
                                  INVENTORY account:
                                     Jan 3  Dr  300   bal  300
                                  LOAN account:
                                     Jan 1  Cr 1000   bal 1000
```

The journal and the GL are **the same facts, two views**. The GL isn't a separate store — in our
system it's derived by querying journal lines grouped by account. (This is why the index on
`(account_id, posting_date)` matters: it powers the "general ledger drill-down" for one account.)

## Account balance = which side wins

An account's balance is `Σ debits − Σ credits` on that account. The *sign* you show depends on the
account's normal balance:

- An **asset** (debit-normal) with Dr 1000, Cr 300 → balance **700 debit** (a positive cash
  balance — correct).
- A **liability** (credit-normal) with Cr 1000 → balance **1000 credit** (you owe 1000 — correct).

You report each account on its normal side as a positive number. A debit-normal account ending on
the credit side is unusual (often an error, or a legitimate contra/overdraft).

## The Trial Balance (TB)

The **Trial Balance** is a list of *every* account with its ending balance, in two columns:
debit balances on the left, credit balances on the right. Then you sum each column.

```
Account                 Debit      Credit
──────────────────────────────────────────
Cash                      700
Inventory                 300
Accounts Receivable       105
Loan Payable                        1,000
VAT Payable                             5
Owner Equity                          100
Sales Revenue                         ...
...
──────────────────────────────────────────
TOTALS                  X,XXX       X,XXX     ← these MUST be equal
```

**The headline property:** if every journal entry was balanced (Σ Dr = Σ Cr per entry), then when
you sum *all* accounts, total debits MUST equal total credits. The trial balance **balances**.

This is the system-wide health check. "Do the books balance?" literally means "does the trial
balance balance?" If it doesn't, something is fundamentally broken — an entry was written
one-sided, or a total drifted. In a correct Layer 0, **the TB can never not balance**, because the
engine refuses to post an unbalanced entry in the first place.

## Why this is the proof of Layer 0

Everything above Layer 0 — the Balance Sheet, the P&L — is just the trial balance *grouped and
formatted*:

- **Balance Sheet** = the asset, liability, and equity accounts from the TB.
- **P&L** = the income and expense accounts from the TB.

If the TB balances and every account is correctly typed, those reports are automatically correct
and self-consistent. That's the entire payoff of getting Layer 0 right: **correctness flows
upward for free.**

## Opening balances (where the TB comes from on day one)

When a business migrates to Zerupt mid-life, it already has balances — cash, stock, what customers
owe, what it owes suppliers. We capture these as an **opening trial balance**: one big journal
entry (or a set) that establishes every account's starting balance as of go-live. It must balance
like any entry; the plug that makes it balance is the **Opening Balance Equity** account. (This is
exactly what the import-template work feeds. Layer 4 covers opening balances in depth.)

## The reconciliation idea (preview)

For control accounts (AR, AP, Inventory), the TB balance must also equal the detail sub-ledger:
- AR control on the TB = Σ of what each customer owes
- Inventory control on the TB = Σ (quantity × cost) of every item

When these tie out, the books are not just *balanced* but *correct in detail*. That's Layer 3.

Next: `06-money-in-software.md`.
