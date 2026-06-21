# 06 — System Accounts and Roles

## The problem: the engine needs to find specific accounts

The posting engine (Layer 2) needs to know, at posting time, exactly which account to use
for each leg of a journal entry. When a sale completes:

- Which account gets the credit for revenue? → Product Sales
- Which account gets the debit for cost? → COGS
- Which account gets the credit for tax collected? → Output VAT Payable
- Which account gets the debit from the customer? → Trade Receivables

A naive approach: **hardcode the account code**. "Revenue is always account 4110." But
this breaks immediately when:

- A customer renumbers their COA ("our sales account is now 4001").
- A country overlay uses a different numbering scheme (India vs GCC vs SEA).
- An accountant renames an account.

The engine would reference `4110`, which no longer exists, and crash.

A second naive approach: **let users configure the mapping manually** — an "account
mapping" screen where you say "Sales → account X". But then the engine could be
mis-configured, pointing at the wrong account type. It has no way to verify the selection
makes accounting sense.

The real solution: **system roles**.

## System roles: semantic names for engine-critical accounts

A **system role** is a *named semantic role* that the accounting engine knows about. Roles
have names like `trade_receivables`, `cogs`, `output_tax_payable`, `opening_balance_equity`.

The engine always resolves accounts by role:
> "Give me the `cogs` account for legal entity X."

At setup time, the COA is seeded and each system role is **bound** to a specific account
(the account that plays that role for this entity). The binding is stored in a separate
table (`account_system_roles`). The engine queries that table by role — not by code — and
gets back the account ID.

If the customer later renumbers account `5100` to `5001`, they also move the binding.
The engine doesn't care about the code; it only cares about the binding.

## The complete system role list (current)

| Role key | Accounting meaning | Account | Type |
|----------|--------------------|---------|------|
| `cash_register` | Cash at the POS register | 1112 | Asset |
| `cheques_in_transit` | Cheques deposited but not cleared | 1129 | Asset |
| `trade_receivables` | AR control account | 1131 | Asset (control) |
| `merchandise_inventory` | Inventory control account | 1141 | Asset (control) |
| `inventory_in_transit` | Stock shipped, not yet received | 1142 | Asset |
| `cheques_in_hand` | Customer cheques held before deposit | 1150 | Asset |
| `supplier_prepayments` | Advances paid to suppliers | 1161 | Asset |
| `input_tax_recoverable` | VAT/GST paid on purchases | 1162 | Asset |
| `opening_balance_suspense` | Residual plug during TB import | 1191 | Asset |
| `trade_payables` | AP control account | 2111 | Liability (control) |
| `grn_accrual` | Goods received, invoice not yet arrived | 2121 | Liability |
| `output_tax_payable` | VAT/GST collected on sales | 2131 | Liability |
| `cheques_issued` | Cheques written to suppliers | 2140 | Liability |
| `customer_deposits` | Advance payments received from customers | 2151 | Liability |
| `retained_earnings_prior` | Accumulated profit from previous years | 3200 | Equity |
| `retained_earnings_current` | Current year P&L accumulation | 3300 | Equity |
| `opening_balance_equity` | Plug for TB import equity balancing | 3900 | Equity |
| `product_sales` | Primary revenue | 4110 | Income |
| `sales_returns` | Customer returns contra-income | 4200 | Income (contra) |
| `cogs` | Cost of Goods Sold | 5100 | Expense |
| `cash_over_short` | Till variance | 6700 | Expense |

These 21 roles cover every automated posting path in the system. If the engine posts a
POS sale, an invoice, a payment, a GRN, or an opening balance import — it resolves the
accounts it needs by role.

## The system role binding table

The binding lives in `account_system_roles` (a separate table from `accounts`). Each
row is:

```
  (tenantId, legalEntityId, roleKey)  →  accountId
```

The DB enforces a **unique constraint** on `(tenantId, legalEntityId, roleKey)`. This
means: there is **exactly one** account bound to each role for each legal entity. The
engine can always resolve a role to a single, unambiguous account. Ambiguity here would
be catastrophic — if two accounts claimed the `cogs` role, which one does the engine use?

The `onDelete: restrict` on the FK from `accountSystemRoles.accountId → accounts.id`
means: you cannot delete an account that is bound to a role. You must move the binding to
a different account first. This is the hard guard that prevents the engine from being left
pointing at a ghost.

## The `isSystemAccount` flag

Accounts that are bound to system roles at seed time are also flagged `isSystemAccount = true`.
This flag means:
- **Cannot be deleted**, even if it were unbound from a role.
- **Cannot have its `type`, `subType`, or `code` changed.** The shape is locked.
- **Cannot be deactivated.** The engine needs it available at all times.

System accounts are created by the seeding process using the sentinel UUID
`00000000-0000-0000-0000-000000000000` as `createdBy`, marking them as system-originated.

## Control accounts: a subset of system accounts

Some system accounts are additionally marked `isControlAccount = true`. These are:
- `trade_receivables` (1131)
- `merchandise_inventory` (1141)
- `trade_payables` (2111)

**Control accounts** receive postings exclusively from the accounting engine. A human
cannot create a manual journal entry that debits or credits a control account. If a user
tries to post "Dr Trade Receivables / Cr Cash" manually, the system rejects it.

Why? Because control accounts must equal their sub-ledger (Layer 3). If a human can
post to them directly, they can break the reconciliation invariant — the sub-ledger shows
individual customer balances, but the GL account would have an extra posting that came
from nowhere. The sub-ledger would no longer sum to the GL.

The schema enforces this: `isHeader = true` and `isControlAccount = true` cannot both be
true (a header isn't postable anyway), and the service layer rejects manual JEs targeting
control accounts.

## Why this design survives multi-region

The same role `output_tax_payable` maps to:
- Account `2131` in a GCC entity (VAT Payable)
- Account `2131.10` for GCC reverse-charge VAT
- A different account code in an India entity (GST payable, possibly split CGST/SGST)

The engine code never changes. Only the binding changes. This makes the system work
correctly in UAE, Saudi, India, and Malaysia without touching the engine logic.

## The mental model

> The engine never hardcodes an account code. It resolves accounts by *role* — a semantic
> name. The role is bound to exactly one account per legal entity, DB-enforced. If the
> business renumbers or restructures their COA, they move the binding, and the engine
> follows. System accounts are the accounts backing roles — locked in type, undeletable,
> engine-exclusive for control accounts.

Next: `07-account-lifecycle-and-integrity.md`.
