# Trial Balance Report

## What is a Trial Balance?

A trial balance is a bookkeeping report that lists the closing balances of all general ledger accounts at a point in time. Its primary purpose is to verify that total debits equal total credits — confirming the double-entry system is balanced.

## Key Accounting Concepts

### Debit vs Credit Balance Direction

Every account has a "normal balance" — the side that increases it:
- **Assets & Expenses** → normal balance is **debit** (left side)
- **Liabilities, Equity & Income** → normal balance is **credit** (right side)

The accounting equation: `Assets = Liabilities + Equity`

A trial balance shows whether the books are balanced by summing all debit balances and all credit balances — they must be equal.

### Header Account Subtotals

Chart of Accounts is hierarchical (e.g., 1000 Assets → 1100 Current Assets → 1110 Cash). Header accounts are grouping nodes that never receive direct postings. Their balances are computed by summing all descendant leaf accounts — this is called **bottom-up aggregation**.

### Why Include Inactive Accounts?

Accounts can be deactivated but never deleted if they have transactions. A trial balance for a historical period must include deactivated accounts that had postings during that period — otherwise the report won't balance.

## Precision-Safe Financial Arithmetic

### The Problem with `parseFloat`

JavaScript's `Number` type is IEEE-754 double-precision (64-bit). It can only represent ~15-17 significant decimal digits accurately. Financial amounts stored as `numeric(19,6)` in Postgres can have up to 19 significant digits — exceeding JavaScript's safe range.

```
parseFloat("123456789012.123456") * 1_000_000
// Expected: 123456789012123456
// Actual:   123456789012123460 (precision lost)
```

### The Solution: Decimal Libraries

Libraries like `decimal.js` or `big.js` perform arithmetic on string representations without converting to IEEE-754 floats. They use algorithms that operate on individual digits, preserving arbitrary precision.

```typescript
new Decimal("123456789012.123456").plus("0.000001").toFixed(6)
// "123456789012.123457" — correct
```

### Rule of Thumb

- **Never use `parseFloat` or `Number()` for financial arithmetic**
- **Display is borderline** — `Number()` is safe for amounts < 10^15 (most practical cases)
- **Always use decimal libraries for addition, subtraction, comparison**

## Fiscal Period Resolution

Accountants think in fiscal periods (January, Q1, FY2026), not raw date ranges. A trial balance endpoint should accept:
- Explicit date range (`fromDate` + `toDate`)
- Fiscal period ID (auto-resolves to that period's date range)
- Fiscal year ID (auto-resolves to that year's date range)

These modes should be **mutually exclusive** — accepting multiple creates ambiguity about which filter applies.

## Multi-Tenant Data Isolation

When resolving fiscal periods/years by ID, always include the `legalEntityId` filter alongside `tenantId`. Without it, a multi-entity tenant could accidentally query dates from a different legal entity's fiscal calendar — a subtle cross-entity data leak.
