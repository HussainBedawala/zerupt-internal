# Period Control

## Fiscal Year

| Field | Description |
|-------|-------------|
| `startMonth` | Month fiscal year begins (1-12). Not always January. |
| `label` | Display name: "FY 2026", "2026-2027" |

12 consecutive monthly periods auto-generated per fiscal year.

## Period Statuses

```
Open  →  Soft-Locked  →  Hard-Locked
```

| Status | Who Sets | Effect |
|--------|---------|--------|
| **Open** | Users with `period.manage` permission | All transactions allowed |
| **Soft-Locked** | Users with `period.manage` permission | Warning shown. User can override with reason (logged). |
| **Hard-Locked** | Users with `period.lock` permission | All transactions blocked. Must unlock first. |

## Cross-Module Enforcement

Every module calls `validatePeriod(date)` before persisting any financial transaction:

- **POS** → before completing a transaction
- **Sales** → before confirming invoice/credit note
- **Purchase** → before confirming GRN/posting payment
- **Inventory** → before posting adjustment/transfer/consumption
- **Accounting** → before posting manual journal entry

Returns: `OPEN`, `SOFT_LOCKED`, or `HARD_LOCKED`.

## Rules

| Rule | Detail |
|------|--------|
| No future dating | Transactions cannot be dated beyond current period |
| No backdating past locks | Cannot date before earliest open period |
| Reversals in locked periods | Original entry stays. Reversing entry created in current open period. |
| Unlock hard-locked | Admin-only action, logged in audit trail |
