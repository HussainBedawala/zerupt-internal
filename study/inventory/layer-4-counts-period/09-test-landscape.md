# Chapter 09 — Test Landscape: Counts, Period Integrity & Reconciliation

## Stock counts spec

File: `apps/api/src/inventory/stock-counts/stock-counts.service.spec.ts` (418 lines)

| Test group | Coverage |
|------------|----------|
| `saveLines` — F-02 inArray batch fetch | Line fetch, update, NotFoundException for missing line, NotFoundException for missing count, ConflictException for wrong status |
| `approvePost` — serial reconciliation | Missing serials (decrease + defective transition), extra serials (increase), matched set (zero variance, no adjustment), non-serial aggregate path unaffected by serial logic |

**What is NOT tested:**
- `create()` — the snapshot query and transaction are not tested.
- `submit()` — status transition not tested.
- `cancel()` — not tested.
- `list()` / `get()` — not tested.
- Multi-call partial failure in `approvePost()` (G1 gap).
- Non-serial variance posting (increase and decrease paths for non-serial items).
- Blind mode flag behavior.
- Partial count (null countedQty lines skipped at posting — G4 gap).
- Period guard on count posting (not tested because count service never calls it directly;
  period guard is tested in stock-adjustments.service.spec.ts).

**Assessment:** Coverage is narrow — 4 test groups, focused on the serial reconciliation
path (which is the most complex). The non-serial main path, lifecycle transitions, and
all the gap scenarios have zero test coverage.

## Inventory reconciliation spec

File: `apps/api/src/inventory-reconciliation/inventory-reconciliation.spec.ts` (597 lines)

| Test group | Coverage |
|------------|----------|
| `detectQuantityVariances` | In-sync (no variances), level variance detected, batch variance (attributed rows present), batch pending note (zero attributed rows), tolerance threshold |
| `detectReservedQuantityVariances` | In-sync, variance detected (orphaned hold + orphaned reservation), tolerance threshold |

**What is NOT tested:**
- The reverse-direction LEFT JOIN gap (orphaned ledger rows with no materialized row).
- Detector invocation after count posting (no integration path tested).
- Serial projection check (none exists to test).
- Value reconciliation (none exists to test).

**Assessment:** The reconciliation spec is solid for the detectors that exist. Coverage
of the mathematical assertions is good (all major variance shapes are exercised).

## Fiscal period / assertPeriodOpen

File: `apps/api/src/fiscal-period/fiscal-period.service.spec.ts`

`assertPeriodOpen` is tested via the fiscal-period service spec and the
stock-adjustments.service.spec.ts (which calls the adjustment service with mocked period
states). The period guard IS tested at the adjustment layer, even if the count service
never tests it directly.

## Overall assessment for Layer 4

- Stock count lifecycle: **low test coverage** (serial path only; core create/submit/cancel
  paths untested).
- Reconciliation detectors: **good coverage** for existing detector logic.
- Period guard on count: **indirectly covered** by adjustment specs; the gap is that the
  count service always uses wall clock (G2 gap), and this is not tested.
- Concurrent count prevention (G3 gap): **zero test coverage**.
- Partial count warning (G4 gap): **zero test coverage**.
- Atomic posting (G1 gap): **zero test coverage**.

## Recommended test additions

1. `create()`: snapshot query → correct line count inserted; empty warehouse → zero lines,
   no error.
2. `approvePost()` with non-serial variances: surplus posts Found, shortage posts Lost,
   zero-variance lines skipped.
3. `approvePost()` partial failure simulation: first adjustment succeeds, second throws →
   verify idempotent retry behavior (currently double-posts — test should expose this).
4. `submit()`: happy path + ConflictException on wrong status.
5. Partial count: lines with null countedQty skipped; warning/count returned.
6. Concurrent count: second create on same warehouse should fail (once G3 fix is in place).
