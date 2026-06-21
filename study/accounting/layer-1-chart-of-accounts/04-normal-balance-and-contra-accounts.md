# 04 — Normal Balance and Contra Accounts

## What "normal balance" means

Every account has a **normal balance** — the side it typically carries a balance on, and
the side on which transactions *increase* it. This flows directly from the accounting
equation (Layer 0, Chapter 02):

| Type | Normal balance | Reasoning |
|------|----------------|-----------|
| Asset | **Debit** | Left side of the equation; increases with debit |
| Expense | **Debit** | Decreases equity; opposite of credit-side equity |
| Liability | **Credit** | Right side of the equation; increases with credit |
| Equity | **Credit** | Right side of the equation; increases with credit |
| Income | **Credit** | Increases equity; same side as equity |

This is not a coincidence or convention — it's a logical consequence of the equation.
You don't memorize it; you derive it once and never forget it.

## What a "wrong-side" balance signals

If an account has a balance on the *opposite* of its normal side, that's almost always a
sign of a problem:

- **Asset with a credit balance?** Either the account is over-credited (a posting error)
  or something is being returned that wiped the asset to below zero. Suspicious.
- **Liability with a debit balance?** Maybe you overpaid a supplier — you're owed money
  back. Needs investigation.
- **Income with a debit balance?** You've returned more than you sold? Almost certainly an
  error.

When a bookkeeper or system sees a non-contra account with a balance on the wrong side,
the first instinct should be: *is there a posting error?*

There is one legitimate exception, and it has a name.

## Contra accounts

A **contra account** is an account that intentionally carries the *opposite* of its
type's normal balance. It exists to *reduce* another account's reported value without
eliminating the original account.

This sounds strange. Why would you do that? Because you need to see *both* the gross
amount and the reduction separately for transparency.

### The classic example: Accumulated Depreciation

You buy equipment for 50,000. Equipment is an asset (debit normal balance — it goes up
with debits). Over time, the equipment wears out. Each year you record depreciation —
the cost of using it up.

You could just reduce the Equipment account directly:

```
  Dr  Depreciation Expense    10,000
  Cr  Equipment               10,000
```

But then you'd lose the history. Someone asking "how much did that equipment originally
cost?" would get no answer.

Instead, you create a **contra asset** account called Accumulated Depreciation. It's
typed as Asset (paired with the equipment category) but has a **credit** normal balance.
Each year:

```
  Dr  Depreciation Expense     10,000
  Cr  Accumulated Depreciation 10,000
```

On the Balance Sheet, Equipment shows the gross cost, and Accumulated Depreciation is
subtracted from it:

```
  Property, Plant & Equipment
    Equipment (cost)                 50,000
    Less: Accumulated Depreciation  (30,000)   ← the contra
    Net Book Value                   20,000
```

This preserves the original cost (auditable, insurable) while showing the realistic
current value. The contra is doing an important job.

### Another example: Sales Returns & Allowances

When a customer returns goods, you could debit Sales directly (reduce it). But that hides
the gross sales from the returns. A retailer wants to know: "Did we sell 1,000,000 and
accept 50,000 in returns? Or did we sell 950,000?" These are different business realities.

So you use a contra income account, **Sales Returns & Allowances**, with a *debit*
normal balance even though it's typed as Income:

```
  Dr  Sales Returns & Allowances   50,000
  Cr  Accounts Receivable / Cash   50,000
```

The P&L shows:
```
  Product Sales                  1,000,000
  Less: Sales Returns              (50,000)
  Net Revenue                      950,000
```

Transparency. You can see the gross and the reduction.

## The two flags on every account

Zerupt stores two flags to handle this correctly:

1. **`isContra`** — marks the account as a deliberate contra. The system knows "this
   account is expected to have the opposite-of-normal balance."
2. **`normalBalance`** — stores the *actual* normal balance (debit or credit) for this
   account. For a contra, this is the *opposite* of the type's default.

And the DB enforces the constraint:

```
  A non-contra account's normalBalance MUST equal the type default:
    asset/expense  → debit
    liability/equity/income → credit

  A contra account (isContra = true) is exempt from this check.
```

This means: if you create an asset account with credit normal balance and don't set
`isContra = true`, the database rejects it. You can't have a "weird" asset by accident.

## Why a non-contra mismatch is a bug, not a preference

Imagine a developer creates a "Provision for Bad Debts" account (an asset contra), but
forgets to set `isContra = true`. The application sends `normalBalance = 'credit'` for an
`asset` account. The DB check fires and rejects the insert. Good — you have to fix it.

Without the DB check, the account silently exists with contradictory flags. The posting
engine can't tell whether a credit balance on that asset is normal or wrong. Reports
treat it incorrectly. Reconciliation checks fail silently.

The check constraint is not pedantry — it's a correctness guarantee.

## Common contra accounts to know

| Account | Typed as | Normal balance | Reduces |
|---------|----------|----------------|---------|
| Accumulated Depreciation | Asset | Credit | PP&E gross cost |
| Provision for Bad Debts | Asset | Credit | Trade Receivables |
| Sales Returns & Allowances | Income | Debit | Product Sales |
| Purchase Returns & Allowances | Expense | Credit | Purchase cost |
| Discount Allowed | Income | Debit | Revenue (customer discounts) |

## The mental model

> An account's normal balance is which side makes it go up. A contra account deliberately
> carries the opposite balance to reduce the account it's paired with — and must be
> explicitly flagged so the system doesn't treat it as a posting error. A non-contra
> mismatch is always a bug; the database enforces this.

Next: `05-hierarchy-headers-and-leaves.md`.
