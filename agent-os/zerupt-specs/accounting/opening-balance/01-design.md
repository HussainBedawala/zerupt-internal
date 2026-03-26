# Opening Balance Wizard — Design

> Status: **Not implemented.** Spec'd as event #28 in `product/accounting/07-event-mappings.md`.
> Route: `/accounting/opening-balances` or onboarding step

## What It Is

Guided flow for new entities to enter opening balances. Required when migrating from another system or starting fresh mid-year.

## Backend

### Endpoint

```
POST /tenant/opening-balances
Permission: accounting.journal.create
```

### Payload

```ts
{
  legalEntityId: string;
  asOfDate: string; // YYYY-MM-DD (typically fiscal year start date)
  balances: Array<{
    accountId: string;
    debit?: string; // XOR credit
    credit?: string;
    currency?: string; // defaults to functional currency
    exchangeRate?: string;
  }>;
}
```

### Processing

1. Validate fiscal period for `asOfDate`
2. Validate all accounts exist, active, correct entity
3. Calculate `balancingAmount = sum(debit) - sum(credit)`
4. Auto-add Opening Balance Equity (3900) line to balance:
   - `balancingAmount > 0` → CR Opening Balance Equity
   - `balancingAmount < 0` → DR Opening Balance Equity
5. Post as single JE: `source='manual'`, `sourceDocumentType='OpeningBalance'`
6. Emit `"accounting.openingBalance.posted"`

**Goal state:** Opening Balance Equity (3900) should net to zero after ALL opening balances entered. If non-zero, user hasn't finished entering balances.

## Frontend — Wizard

### Step 1: Setup

- Select legal entity
- Select "as of" date (defaults to current FY start date)
- Warning if periods before this date have posted entries

### Step 2: Enter Balances

Table grouped by account type:

| Section | Accounts |
|---------|----------|
| Assets | All asset accounts (current + non-current) |
| Liabilities | All liability accounts |
| Equity | Equity accounts (excluding 3900 Opening Balance Equity) |

Each row: Account Code | Account Name | Debit | Credit

- Pre-populated with all active non-header accounts
- Empty rows (no balance) are fine — skipped on submit
- Running total shown per section and overall
- Opening Balance Equity (3900) shown as auto-calculated balancing line (read-only)

### Step 3: Review & Post

- Summary: total debits, total credits, OBE balance
- If OBE balance ≠ 0: info message "You can add more balances later to zero out Opening Balance Equity"
- Post button → creates JE → navigates to JE detail

### Defensive UX

- Cannot enter both debit AND credit for same account
- Warn if entering balance for an account that already has posted entries
- "Save Draft" option for partial entry (resume later)
- Large entity warning: if >100 accounts, show search/filter
