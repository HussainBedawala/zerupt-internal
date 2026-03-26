# Unrealized FX Revaluation — Month-End Close

> Service: `apps/api/src/fx-revaluation/fx-revaluation.service.ts`
> Controller: `apps/api/src/fx-revaluation/fx-revaluation.controller.ts`
> Constants: `apps/api/src/fx-revaluation/fx-revaluation.constants.ts`
> DTOs: `apps/api/src/fx-revaluation/fx-revaluation.dto.ts`
> Module: `apps/api/src/fx-revaluation/fx-revaluation.module.ts`
> Product spec: `agent-os/product/accounting/03-multi-currency.md`

## Status

**Code: Fully implemented.** Service, controller, DTOs, constants, and module all exist and are wired into the app. **Tests: Missing** — no `.spec.ts` file for `FxRevaluationService`. This spec documents the implementation and identifies the testing gap.

---

## Purpose

At month-end, all open foreign currency balances must be revalued at the closing exchange rate per IAS 21. The difference between the book value (posted at historical rates) and the revalued amount is posted as an unrealized FX gain or loss. This entry **auto-reverses** on the first day of the next period.

---

## Algorithm

```
For each legal entity:
1. Aggregate all posted JE lines by (account_id, currency) where currency ≠ functional currency
   - Exclude: drafts, reversed entries
   - Result: net balance in transaction currency (TC) per account
2. For each (account, currency) pair:
   a. Look up closing rate for (TC → FC) on revaluation date
   b. revalued_fc = net_balance_tc × closing_rate
   c. current_book_value_fc = sum of FC amounts from posted JE lines
   d. difference = revalued_fc - current_book_value_fc
3. If difference ≠ 0:
   - difference > 0 → Unrealized FX Gain (4830, credit)
   - difference < 0 → Unrealized FX Loss (7220, debit)
   - Offset: balance sheet account (the original account being revalued)
4. Post main JE via EventEmitter
5. Post auto-reversal JE for first day of next fiscal period (swaps debits/credits)
```

---

## Which Accounts Get Revalued

All balance sheet accounts with foreign currency balances:

| Category | Typical Accounts | Example |
|----------|-----------------|---------|
| AR | Trade Receivables (1131) | USD invoice booked at 3.67, closing rate 3.69 |
| AP | Trade Payables (2111) | EUR bill booked at 4.01, closing rate 3.98 |
| Bank | FC Bank Accounts (1121-FC) | GBP bank account |
| Deposits | Customer Deposits (2151) | Advance in foreign currency |
| Prepayments | Supplier Prepayments (1161) | FC prepayment |

**Excluded:** P&L accounts (revenue, expenses) — these use average rate per IAS 21, not closing rate. Equity accounts — not revalued.

---

## Journal Entry Structure

### Main Entry (revaluation date)

```
Event Type: fx.unrealized_revaluation
Source Document Type: FxRevaluation

Example: USD AR balance revalued, gain of KWD 150.000

DR  Trade Receivables (1131)       KWD 150.000   (balance sheet offset)
CR  Unrealized FX Gain (4830)      KWD 150.000

Example: EUR AP balance revalued, loss of KWD 200.000

DR  Unrealized FX Loss (7220)      KWD 200.000
CR  Trade Payables (2111)          KWD 200.000   (balance sheet offset)
```

### Auto-Reversal (first day of next period)

```
Event Type: fx.unrealized_revaluation.reversal
Posting Date: first day of next fiscal period

CR  Trade Receivables (1131)       KWD 150.000   (reverses the gain)
DR  Unrealized FX Gain (4830)      KWD 150.000

DR  Trade Payables (2111)          KWD 200.000   (reverses the loss)
CR  Unrealized FX Loss (7220)      KWD 200.000
```

---

## API

### `POST /tenant/fx-revaluations`

**Permission:** `accounting.revaluation.post`

**Request:**

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `legalEntityId` | uuid | yes | Must exist, active |
| `revaluationDate` | date (ISO) | yes | Must fall within an open fiscal period |

**Response:**

```ts
{
  mainEntryIds: string[];       // JE IDs for revaluation entries
  reversalEntryIds: string[];   // JE IDs for auto-reversal entries
  lines: Array<{
    accountId: string;
    currency: string;
    netBalanceTC: string;
    revaluedFC: string;
    bookValueFC: string;
    difference: string;
    type: "fx_gain" | "fx_loss";
  }>;
  totals: {
    totalGain: string;
    totalLoss: string;
    netImpact: string;
  };
}
```

**Validations:**

1. Legal entity exists and is active
2. Functional currency resolved from legal entity
3. Revaluation date falls within an open fiscal period
4. Next fiscal period exists (needed for auto-reversal posting date)
5. Closing rates available for all FC pairs on revaluation date

---

## Account Mapping

| Line Type | Account Code | Direction | Category |
|-----------|-------------|-----------|----------|
| `fx_gain` | 4830 Unrealized FX Gain | Credit | Other Income |
| `fx_loss` | 7220 Unrealized FX Loss | Debit | Other Expense |
| `balance_sheet_offset` | (original account) | Opposite of gain/loss | Balance Sheet |

---

## Idempotency

Event ID is derived from `legalEntityId + revaluationDate`. Running revaluation twice for the same entity and date produces the same event ID, preventing duplicate JEs.

---

## Design Decisions

- **Book value from posted lines, not recomputed** — avoids rounding drift. The actual FC amounts posted are summed, not recalculated from TC × historical rate.
- **EventEmitter for JE posting** — avoids circular dependency between FxRevaluationModule and JournalEntriesModule.
- **Auto-reversal is a separate JE** — not a flag on the original entry. Makes it auditable and reversible independently.
- **Immutable line creation** — reversal lines are new objects with swapped debits/credits, no mutation of original lines.
- **Per legal entity** — each entity revalued independently (different functional currencies possible).

---

## Gaps

### 1. Unit Tests (Missing)

No `fx-revaluation.service.spec.ts` exists. Needs tests for:
- Basic gain/loss calculation
- Multiple currencies in single revaluation
- Zero-difference accounts (should be skipped)
- Idempotency (same entity+date = same event ID)
- Missing closing rate → error
- Next period not found → error
- Reversal line generation (debits/credits swapped correctly)

### 2. Update Existing FX Spec

`fx-gain-loss/01-calculation-and-lines.md` states "not yet implemented in code" for unrealized FX. This is now outdated — the code is complete. The spec should be updated to reflect implementation status.

### 3. Preview Endpoint (Not Implemented)

No dry-run endpoint exists. Users should be able to preview revaluation impact before posting:
- `POST /tenant/fx-revaluations/preview` — same input, returns calculated lines without posting
- Important for month-end close review workflow
