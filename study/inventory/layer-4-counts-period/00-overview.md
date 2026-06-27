# Layer 4 — Counts & Period Integrity: Overview & Scope

## What Layer 4 covers

Layer 4 is the intersection of two concerns:

1. **Physical / cycle counts** — the process by which a stockkeeper reconciles what the system
   says is on hand against what is physically present in the warehouse. Every gap surfaces as a
   variance that must be posted to the ledger before the period is closed.

2. **Inventory period cutoff & close** — the rules that prevent movements from being backdated
   into a period that accounting has already closed, and the discipline around which movements
   "belong to" which reporting period. For a standalone inventory operator who does not run the
   full accounting module, this also answers: when can a manager print a definitive on-hand
   report and know it will not change under them?

## Relationship to accounting Layer 4

The accounting program's Layer 4 (study/accounting/layer-4-period-balance/) covered:
- Fiscal period table + status machine (open / soft_locked / hard_locked)
- `assertPeriodOpen` guard on every JE posting path
- Year-end close procedure

Inventory's Layer 4 inherits the **same fiscal period infrastructure** (`fiscal_periods` table,
`FiscalPeriodService.validatePeriod`, `assertPeriodOpen`). However:
- There is **no independent inventory period close** — inventory piggybacks on the accounting
  fiscal period. Closing an accounting period is what locks inventory postings into that period.
- The stock-counts module does NOT call `assertPeriodOpen` directly. It delegates all posting
  to `StockAdjustmentsService`, which does call `assertPeriodOpen`.
- There is **no inventory-specific close checklist** (accounting has `close_management.ts`
  / `closeChecklistTemplates`; inventory has no equivalent).

## AS-BUILT modules in scope

| File | Role |
|------|------|
| `apps/api/src/inventory/stock-counts/stock-counts.service.ts` | Physical count lifecycle |
| `apps/api/src/inventory/stock-counts/stock-counts.controller.ts` | REST endpoints |
| `packages/db/src/schema/stock-counts.ts` | `stock_counts` + `stock_count_lines` tables |
| `apps/api/src/inventory/stock-adjustments/stock-adjustments.service.ts` | Variance posting + period guard |
| `apps/api/src/fiscal-period/fiscal-period.service.ts` | `assertPeriodOpen` / `validatePeriod` |
| `apps/api/src/inventory-reconciliation/inventory-reconciliation.service.ts` | Automated detectors |

## Key conclusions going into this study

- Physical count lifecycle is **fully built** (all 6 states, serial reconciliation, variance posting).
- Period guard is **inherited from adjustments** — indirectly correct but not explicit in the
  count service. The count posting date is always `new Date()` (wall clock), never the count's
  creation or completion date.
- No mechanism prevents two concurrent counts on the same warehouse.
- No inventory-specific period close exists. Chapters 04 and 08 detail the implications.
