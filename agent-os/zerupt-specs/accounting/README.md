# Accounting Module — Implementation Specs

All implementation specs for the accounting module. Product specs (what to build) live in `agent-os/product/accounting/`.

## Directory Map

### Implemented (documenting what was built)

| Directory | What |
|-----------|------|
| `chart-of-accounts/` | COA schema, API, templates, bilingual (3 files) |
| `journal-entries/` | JE schema, 10-step posting pipeline, idempotency (2 files) |
| `journal-reversal/` | Reversal mechanics, race protection, IAS 21 rates |
| `fiscal-periods/` | Period generation, 3-tier locking, close/reopen (2 files) |
| `account-mappings/` | 5-level override resolution, CRUD, seed defaults |
| `fx-gain-loss/` | Realized FX calculation, line building |
| `fx-revaluation/` | Unrealized FX month-end revaluation, auto-reversal (IAS 21) |
| `year-end-closing/` | Closing entry generation, RE transfer, preview |
| `taxation/` | Tax reference files — GCC, MENA, SEA, India, design implications (5 files) |
| `legal-entities/` | Legal entity schema, CRUD API, currency lock mechanism |
| `doc-numbering/` | Document sequence schema, reservation lifecycle, gap-free numbering |
| `currency-master/` | Currency policies, tenant currencies, decimal precision rules |
| `permissions-matrix/` | RBAC matrix for all accounting endpoints, SoD rules, role templates |

### Not Yet Built (designing what to build next)

| Directory | What | Priority |
|-----------|------|----------|
| `trial-balance/` | Report: all accounts with debit/credit totals | HIGH — Phase 2 |
| `general-ledger/` | Drill-down: JE lines per account + date range | HIGH — Phase 2 |
| `manual-journal-entry/` | Draft→post form, account picker component | HIGH — critical UX gap |
| `tax-configuration/` | CRUD for tax codes/groups/rates, country quick setup | HIGH — blocks POS/Sales |
| `exchange-rates/` | Exchange rate CRUD API, lookupRate algorithm (schema built, service missing) | HIGH — blocks multi-currency |
| `event-listeners/` | NestJS handlers for 32 business events + per-event DR/CR mappings (2 files) | HIGH — blocks all modules |
| `cogs-engine/` | WAC/FIFO costing, recalculation triggers | HIGH — blocks POS/Sales |
| `bank-reconciliation/` | CSV import, auto-match, reconciliation wizard | HIGH — Phase 2 |
| `opening-balance/` | Wizard for GL + sub-ledger opening balances (2 files) | MEDIUM |
| `audit-trail/` | UI for browsing audit logs captured by @Audited decorator | MEDIUM |
| `financial-statements/` | P&L, Balance Sheet, Cash Flow Statement | MEDIUM — Phase 6 |

### Future Phases (P3 — spec'd, not scheduled)

| Directory | What |
|-----------|------|
| `integration-tests/` | End-to-end test scenarios: event → JE → ledger → reports (30+ scenarios) |
| `recurring-journal-entries/` | Template-based auto-generation of periodic JEs (rent, depreciation, etc.) |
| `budget/` | Budget vs actual reporting with spreadsheet-style editor |
| `consolidation/` | Multi-entity consolidated financial statements with IAS 21 translation |

## Reading Order

**To understand the accounting engine:** `chart-of-accounts/` → `account-mappings/` → `journal-entries/` → `journal-reversal/` → `fiscal-periods/` → `year-end-closing/` → `fx-gain-loss/`

**To build missing features:** Read the `README.md` in each directory — it has key decisions and links to the design file.

**Build order for "Not Yet Built":** `event-listeners/` + `cogs-engine/` first (unlocks all modules), then `trial-balance/` + `general-ledger/` + `manual-journal-entry/` + `tax-configuration/` (Phase 2 essentials), then `bank-reconciliation/` → `opening-balance/` → `audit-trail/` → `financial-statements/` (Phase 6).
