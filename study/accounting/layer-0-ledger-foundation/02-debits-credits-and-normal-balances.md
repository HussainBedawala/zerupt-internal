# 02 — Debits, Credits, and Normal Balances

This is the chapter everyone finds confusing. We'll make it click and never let it un-click.

## Forget what the words mean in English

"Debit" sounds like *subtract* (debit card takes money out). "Credit" sounds like *add* (you got
credited). **Throw that intuition away.** In accounting, debit and credit do NOT mean plus and
minus. They are just the **names of the two sides** of every entry.

- **Debit** = the **left** side.
- **Credit** = the **right** side.

That's the *only* universal truth. Debit = left, Credit = right. Often written **Dr** (debit) and
**Cr** (credit).

From Chapter 01: every transaction has two ends that must be equal. We now name them: one end goes
on the left (debit), the other on the right (credit). The law becomes:

> **Total Debits (left) = Total Credits (right).**

## So does debit increase or decrease an account?

**It depends on the account's type.** This is the key insight. Each account has a "**normal
balance**" — the side it *increases* on.

There are five account types. Memorize this table; it's the spine of all accounting:

| Account type | Normal balance (increases on) | Decreases on | Examples |
|--------------|-------------------------------|--------------|----------|
| **Asset** | **Debit** (left) | Credit | Cash, Inventory, Receivables, Equipment |
| **Expense** | **Debit** (left) | Credit | Rent, Salaries, COGS, Utilities |
| **Liability** | **Credit** (right) | Debit | Payables, Loans, VAT owed |
| **Equity** | **Credit** (right) | Debit | Owner capital, Retained earnings |
| **Income** | **Credit** (right) | Debit | Sales revenue, Interest earned |

A memory hook: **"DEA-LER"**
- **D**ebit increases: **E**xpenses, **A**ssets → **DEA**
- Credit increases: **L**iabilities, **E**quity, **R**evenue → **LER**

## Why this split exists (it's not arbitrary)

Remember the accounting equation (full chapter next):

```
Assets  =  Liabilities  +  Equity
```

Things you OWN (left) = claims against them (right). Assets sit on the left, so they *increase on
the left* (debit). Liabilities and equity sit on the right, so they *increase on the right*
(credit). Income increases equity (you earned it) → credit. Expenses decrease equity → the
opposite → debit. The whole table just falls out of the equation. It's internally consistent, not
memorization for its own sake.

## Worked example: a cash sale of 500

You sell goods for 500 cash.

- Cash (an **asset**) goes **up** 500 → assets increase on debit → **Debit Cash 500**
- Sales (an **income**) goes **up** 500 → income increases on credit → **Credit Sales 500**

```
                       Debit (left)   Credit (right)
  Cash       (asset)       500
  Sales      (income)                     500
                       ───────────    ────────────
                          500             500        ✓ balanced
```

Left = right. The entry is valid.

## Worked example: buy stock for 300 on credit (you'll pay supplier later)

- Inventory (**asset**) up 300 → **Debit Inventory 300**
- Accounts Payable (**liability**, you now owe) up 300 → **Credit Accounts Payable 300**

```
  Inventory          (asset)      300
  Accounts Payable   (liability)              300
                                  ───         ───
                                  300         300   ✓
```

## "Normal balance" and contra accounts

An account's **normal balance** is just which side it normally sits on (the increase side from the
table). An asset normally has a **debit** balance; a liability normally has a **credit** balance.

A **contra account** deliberately carries the *opposite* of its category's normal balance.
Example: *Accumulated Depreciation* is reported under assets but normally has a **credit** balance,
because it *reduces* the value of the assets it's paired with. Sales Returns is a contra-income
account (debit normal). These are legitimate and must be explicitly flagged as contra — otherwise
a credit-balance "asset" looks like a data error.

> In Zerupt this is the `normalBalance` column plus an `isContra` flag on each account. The rule:
> a non-contra account's `normalBalance` must equal the default for its type. (We'll see in the
> code-audit chapter whether the DB *enforces* that or only the application does.)

## The one trap to avoid forever

Do not ask "is a debit good or bad / up or down?" The right question is always:

> **"What TYPE is this account, and is it going up or down?"** — then the table tells you the side.

Next: `03-accounts-and-the-chart-of-accounts.md`.
