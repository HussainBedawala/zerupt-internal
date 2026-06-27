# 09 — Test Landscape

## Reports module spec coverage

| Service | Spec file | Exists? | Notes |
|---|---|---|---|
| `StockLevelsReportService` | `reports/stock-levels-report.service.spec.ts` | YES | Tests: empty result, filter by warehouse/category, status derivation (negative/OutOfStock/Low/OK), summary aggregation |
| `InventoryValuationService` | — | NO | Zero test coverage |
| `StockMovementLedgerService` | — | NO | Zero test coverage |
| `TrialBalanceService` | `reports/trial-balance.service.spec.ts` | YES | Accounting report |
| `GeneralLedgerService` | `reports/general-ledger.service.spec.ts` | YES | Accounting report |
| `ProfitAndLossService` | `reports/profit-and-loss.service.spec.ts` | YES | Accounting report |
| `CashFlowStatementService` | `reports/cash-flow-statement.service.spec.ts` | YES | Accounting report |
| `ArAgingService` | `reports/ar-aging.service.spec.ts` | YES | Accounting report |
| `ApAgingService` | `reports/ap-aging.service.spec.ts` | YES | Accounting report |
| `DailySalesService` | `reports/daily-sales.service.spec.ts` | YES | Sales report |
| `TopSellersService` | `reports/top-sellers.service.spec.ts` | YES | Sales report |
| `TaxSummaryService` | `reports/tax-summary.service.spec.ts` | YES | Financial report |
| `BalanceSheetService` | `reports/balance-sheet.service.spec.ts` | YES | Accounting report |

## Inventory module spec coverage (reporting-relevant)

| Service | Spec file | Exists? | Coverage |
|---|---|---|---|
| `BatchesService` (expiry) | `batches/batches-expiry.service.spec.ts` | YES | markExpiredBatches, selectFefoBatch, decrementBatchQty, expired-sale guard, tenant isolation |
| `BatchPickerService` (FEFO) | `batches/batch-picker.service.spec.ts` | YES | FEFO order, multi-lot fan-out, quantity depletion |
| `ReorderService` | — | NO | Zero test coverage |
| `StockCountsService` (variance) | `stock-counts/stock-counts.service.spec.ts` | YES (Layer 4) | atomic post, set-to-counted, count_date threading |
| `BatchExpirySchedulerService` | — | NO | Zero test coverage (no spec for the scheduler itself) |

## Coverage summary

| Domain | Covered | Not covered |
|---|---|---|
| Stock Levels Report | YES | — |
| Stock Valuation Report | NO | all paths |
| Stock Movement Ledger | NO | all paths |
| Batch Expiry (service) | YES | scheduler |
| FEFO picker | YES | — |
| Reorder Report | NO | all paths |
| Stock-Take Variance | YES (embedded in counts spec) | period-summary report |

## What the stock-levels spec covers

`stock-levels-report.service.spec.ts`:
- Empty result → zeroed summary
- Filter by warehouseId (verifies WHERE clause applied)
- Filter by categoryId (verifies WHERE clause applied)
- `deriveStatus()`: negative / OutOfStock / Low / OK (unit test, exported function)
- Multiple rows → correct summary aggregation (totalItems, totalValue)

It does NOT cover:
- Valuation amounts (the spec mocks the DB response, doesn't verify arithmetic)
- Pagination (the service returns all rows, no pagination)
- Tenant isolation (no multi-tenant assertions)

## What the batch expiry spec covers

`batches-expiry.service.spec.ts`:
- `markExpiredBatches`: boundary dates (today = expiry, today > expiry, within warning window)
- `selectFefoBatch`: FEFO ordering, expired excluded, exhausted excluded, null when none
- `decrementBatchQty`: normal, exact depletion (→ exhausted), over-decrement rejection
- POS expired-sale guard
- Tenant isolation (tenant A cannot see tenant B batches)

## Gaps to close

Priority order for hardening:

1. **StockMovementLedgerService** — no spec + HIGH bugs (createdAt ordering, sourceModule
   pagination, running balance reset). New spec should cover: date filtering uses occurredAt,
   pagination count is consistent with filtered results, running balance seeds from carry-forward.

2. **InventoryValuationService** — no spec + asOfDate silently ignored. New spec should cover:
   category grouping, grand total arithmetic, warning when asOfDate is provided (or rejection).

3. **ReorderService** — no spec + status post-filter pagination bug. New spec should cover:
   getSuggestions with warehouseId/supplierId/status filters, suggestedQty formula, KPI totals.

4. **BatchExpirySchedulerService** — no spec for the scheduler. Test should verify that
   `runDailyExpirySweep()` wraps each tenant in tenantStore.run() (once C1 flaw is fixed).

## Existing spec quality

The accounting reports (TrialBalance, GL, P&L, CFS, AR/AP aging) all have specs that
verify the arithmetic against mocked DB data. The inventory reports specs (stock-levels)
mock the DB and verify structure but not arithmetic correctness. The standard should
be raised to match accounting: mock specific movement/cost data and assert that the
aggregated output matches expected sums.
