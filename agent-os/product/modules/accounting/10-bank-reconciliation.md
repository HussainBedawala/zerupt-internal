# Bank Reconciliation

## Bank Statement

| Field | Description |
|-------|-------------|
| `bankAccountId` | System bank account |
| `statementDate` | Statement date |
| `periodStart` | Period start |
| `periodEnd` | Period end |
| `openingBalance` | Bank's opening balance |
| `closingBalance` | Bank's closing balance |
| `lines` | Statement line items |

### Statement Line

| Field | Description |
|-------|-------------|
| `date` | Transaction date |
| `description` | Bank's description |
| `reference` | Reference number (cheque #, transfer ref) |
| `amount` | Positive = money in, Negative = money out |
| `matchStatus` | `Unmatched`, `Matched`, `Reconciled` |
| `matchedTransactionId` | Matched system journal entry line (null if unmatched) |

## Import Methods

- **CSV upload**: Column mapping interface (date, description, amount, reference). Mapping saved per bank account.
- **Manual entry**: User enters lines directly.

## Matching Process

**Step 1 — Auto-match:**
- Exact amount + reference number
- Exact amount + date (±2 days configurable)
- Cheque number match

Auto-matches presented for user review. Not reconciled until confirmed.

**Step 2 — Manual match:**
- User pairs statement lines with system transactions
- Create new journal entries for unrecorded items (bank charges, direct debits)
- Mark lines as "no match needed" with reason

**Step 3 — Reconcile:**
- Review summary
- Confirm
- Period marked as reconciled

## Reconciliation Summary

```
System book balance                         XX,XXX
+ Deposits in transit                       +X,XXX
- Outstanding cheques                       -X,XXX
= Adjusted book balance                    XX,XXX

Bank statement closing balance              XX,XXX
+ Unrecorded deposits                       +X,XXX
- Unrecorded withdrawals                    -X,XXX
= Adjusted bank balance                    XX,XXX

Difference                                  0.000  ← must be zero
```

Cannot complete if difference is not zero.

## Outstanding Items

Carry forward to next period:
- Outstanding cheques (issued, not cleared)
- Deposits in transit
- Unmatched bank items (require investigation)
