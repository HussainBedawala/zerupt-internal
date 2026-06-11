# Year-End Closing

## Pre-Closing Checklist (Advisory, Not Blocking)

| # | Check | System Verifies |
|---|-------|----------------|
| 1 | All 12 months soft-locked | Period status for each month |
| 2 | All bank accounts reconciled | `lastReconciledDate` within fiscal year end |
| 3 | All tax returns filed | Tax return periods marked Filed |
| 4 | No unposted draft journal entries | Draft entries with dates in this year |
| 5 | No pending stock counts | In-progress counts at year-end date |
| 6 | Trial balance is balanced | Total debits = total credits |
| 7 | No inventory in transit | Balance in account 1142 |

Admin can proceed even with incomplete items. Incomplete items flagged clearly.

## Closing Process

1. **Generate closing journal entry** (see below)
2. **Hard-lock all 12 months**
3. **Create next fiscal year** with 12 open periods (if not exists)
4. **Record:** Store closing entry ID, `closedAt`, `closedBy` on fiscal year

## Closing Journal Entry

```
DR  All Income accounts (4xxx)              [each account's balance]
CR  All Expense accounts (5xxx, 6xxx, 7xxx) [each account's balance]
DR/CR  Retained Earnings — Current Year (3300)  [net difference]

Then:
DR  Retained Earnings — Current Year (3300)     [full balance]
CR  Retained Earnings — Prior Years (3200)      [same]
```

Result: All income/expense accounts start next year at zero. Net profit accumulated in Retained Earnings.

## Reopening a Closed Year

Super-admin only.

1. Create reversing entry for the closing journal entry
2. Set all 12 periods to soft-locked (not open)
3. Admin unlocks specific periods as needed
4. After corrections, year must be closed again
5. Action logged in audit trail with reason
