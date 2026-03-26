# Integration Test Scenarios — Accounting Module

> Status: **Not implemented.** P3 priority. Write these tests as the corresponding features land.
> Purpose: End-to-end verification that business events flow through the full accounting pipeline.

## Why This Spec Exists

The accounting engine has 32+ events, each producing JEs with specific DR/CR patterns. Unit tests verify individual services in isolation. Integration tests verify the **full chain**: event emission → listener → account mapping resolution → JE creation → posting pipeline → ledger balances.

Without these, a change to the posting pipeline or account mapping resolution could silently break downstream reports.

---

## Test Infrastructure

### Setup Per Test Suite

```
1. Seed tenant DB with:
   - Legal entity (functional currency = SAR)
   - Fiscal year + open period
   - COA from template (Saudi retail)
   - Account mappings (all 5 levels seeded to defaults)
   - Tax codes (15% VAT standard, 0% exempt)
   - At least 2 inventory items (one with WAC, one with FIFO)
   - Exchange rates (USD→SAR, AED→SAR) for multi-currency tests
2. Each test starts a DB transaction, rolls back after
3. Use real NestJS EventEmitter (not mocked) — the point is integration
```

### Assertion Helpers

| Helper | Purpose |
|--------|---------|
| `assertJEPosted(eventId)` | Verify a JE exists with this eventId, status=posted |
| `assertBalance(accountCode, debit, credit)` | Verify account balance matches expected DR/CR totals |
| `assertTrialBalanceBalances()` | Verify total debits = total credits across all accounts |
| `assertNoOrphanDrafts()` | Verify no JEs stuck in draft after event processing |
| `assertIdempotent(eventId)` | Fire same event twice, verify only 1 JE exists |

---

## Scenario Groups

### Group 1: POS Lifecycle

| # | Scenario | Events Fired | Assertions |
|---|----------|-------------|------------|
| 1.1 | Simple cash sale | `pos.transaction.completed` | Revenue CR, Cash DR, COGS DR/CR, VAT CR. Trial balance balances. |
| 1.2 | POS return | `pos.return.completed` | Reverses 1.1 entries exactly. Revenue DR, Cash CR, COGS reversed. Net balance = 0. |
| 1.3 | POS void | `pos.void.completed` | Full reversal of original. Idempotent — voiding twice = 1 reversal JE. |
| 1.4 | Shift close with overage | `pos.shift.closed` | Cash over/short account has balance. Cash transfer JE to safe account. |
| 1.5 | Shift close with shortage | `pos.shift.closed` | Cash short DR, Cash CR. Amount matches declared vs expected. |

### Group 2: Sales Cycle (Multi-Currency)

| # | Scenario | Events Fired | Assertions |
|---|----------|-------------|------------|
| 2.1 | Invoice in FC (USD) | `sales.invoice.confirmed` | AR in SAR (at rate), Revenue in SAR, COGS in SAR. TC amounts stored on lines. |
| 2.2 | Receipt at different rate | `sales.receipt.posted` | Cash DR, AR CR. FX gain/loss line if rate differs from invoice rate. |
| 2.3 | Credit note (full) | `sales.creditNote.confirmed` | Reverses invoice. COGS reversed (uses original WAC, not current). |
| 2.4 | Partial receipt | `sales.receipt.posted` | AR partially reduced. No FX until full settlement (or proportional — per design choice). |
| 2.5 | Invoice → receipt → credit note | All 3 events | Final balance on AR = 0. FX gain/loss nets correctly. |

### Group 3: Purchase Cycle

| # | Scenario | Events Fired | Assertions |
|---|----------|-------------|------------|
| 3.1 | GRN received | `purchase.grn.confirmed` | Inventory DR, AP/Accrual CR. WAC recalculated for item. |
| 3.2 | Landed cost allocated | `purchase.landedCost.allocated` | Inventory DR (uplift), Landed Cost Clearing CR. WAC recalculated. |
| 3.3 | Purchase return | `purchase.return.confirmed` | Reverse GRN. Inventory CR, AP DR. WAC recalculated. |
| 3.4 | Payment in FC | `purchase.payment.posted` | AP DR, Cash CR, FX gain/loss. |
| 3.5 | GRN → landed cost → sale | `purchase.grn.confirmed` → `purchase.landedCost.allocated` → `pos.transaction.completed` | COGS reflects landed cost, not just GRN cost. |

### Group 4: Inventory Operations

| # | Scenario | Events Fired | Assertions |
|---|----------|-------------|------------|
| 4.1 | Stock adjustment (write-down) | `inventory.adjustment.posted` | Expense DR, Inventory CR. Amount = qty × WAC. |
| 4.2 | Stock transfer (inter-warehouse) | `inventory.transfer.completed` | Transit account used if two-step. No P&L impact. |
| 4.3 | Assembly | `inventory.assembly.completed` | FG inventory DR (sum of components), Component inventory CR (each at WAC). |
| 4.4 | Physical count variance | `inventory.count.approved` | Adjustment JEs per item. Positive = inventory DR, negative = expense DR. |

### Group 5: Period & Year-End

| # | Scenario | Events Fired | Assertions |
|---|----------|-------------|------------|
| 5.1 | Post to locked period | Direct call | Rejected with `PERIOD_LOCKED` error. No JE created. |
| 5.2 | Year-end close | `yearEnd.close.executed` | Income/expense accounts zeroed. Retained earnings updated. |
| 5.3 | Reopen closed period | Direct call | Only allowed for admin role. Audit log entry created. |
| 5.4 | Post to reopened period | Direct call | Succeeds. Trial balance recalculated. |

### Group 6: Cross-Cutting

| # | Scenario | Purpose |
|---|----------|---------|
| 6.1 | Idempotency — duplicate event | Fire `pos.transaction.completed` with same eventId twice. Assert 1 JE only. |
| 6.2 | Missing account mapping | Fire event where mapping isn't seeded. Assert descriptive error, no partial JE. |
| 6.3 | Concurrent posting | Fire 2 events for same legal entity simultaneously. Assert both post, no deadlock, sequential entry numbers. |
| 6.4 | Event ordering — reversal before original | Fire `pos.return.completed` before `pos.transaction.completed`. Assert graceful failure or queue retry. |
| 6.5 | Zero-amount event | Fire sale with 0 amount. Assert no JE created (or empty JE rejected). |
| 6.6 | Trial balance after full cycle | Run all Group 1-4 scenarios, then query trial balance. Assert DR = CR. |

---

## Coverage Matrix

Every event in `event-listeners/01-design.md` must appear in at least one scenario. Track coverage here:

| Event | Scenarios |
|-------|-----------|
| `pos.transaction.completed` | 1.1, 3.5, 6.1, 6.3, 6.6 |
| `pos.return.completed` | 1.2, 6.4 |
| `pos.void.completed` | 1.3 |
| `pos.shift.closed` | 1.4, 1.5 |
| `sales.invoice.confirmed` | 2.1, 2.5 |
| `sales.creditNote.confirmed` | 2.3, 2.5 |
| `sales.receipt.posted` | 2.2, 2.4, 2.5 |
| `purchase.grn.confirmed` | 3.1, 3.5 |
| `purchase.landedCost.allocated` | 3.2, 3.5 |
| `purchase.return.confirmed` | 3.3 |
| `purchase.payment.posted` | 3.4 |
| `inventory.adjustment.posted` | 4.1 |
| `inventory.transfer.completed` | 4.2 |
| `inventory.assembly.completed` | 4.3 |
| `inventory.count.approved` | 4.4 |

> **Gap check:** When new events are added to the event listeners spec, add corresponding test scenarios here.

---

## Implementation Notes

- Use Jest + Supertest for API-level tests, Jest + direct service calls for service-level
- Real Neon DB (test tenant), not mocks — per project testing policy
- Seed data via Drizzle insert helpers, not raw SQL
- Each test file = one scenario group
- File naming: `integration/accounting/pos-lifecycle.spec.ts`, etc.
- Target: 100% event coverage (every event has ≥1 integration test)
