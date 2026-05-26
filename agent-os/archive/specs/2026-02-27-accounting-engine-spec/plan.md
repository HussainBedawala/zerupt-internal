# Accounting Engine Specification — Plan

## Context

Merpec is a retail ERP with complete UI specs for 7 modules (POS, Sales, Purchase, Inventory, Accounting, Reports, Settings) but **no backend, database, or accounting logic defined**. An accounting audit revealed 5 critical P0 gaps: no tax model, no multi-currency support, no COGS logic, no year-end closing, and no bank reconciliation data model. Additionally, 13+ business events across all modules have zero defined accounting treatment.

Without this spec, developers cannot design the database schema, APIs, or system architecture because they don't know **what journal entries the system must produce** for any given business event.

**Deliverable:** A single comprehensive spec document at `agent-os/product/accounting-engine.md` + supporting shaping artifacts in `agent-os/specs/2026-02-27-accounting-engine-spec/`.

## Key Design Decisions

- **Country-agnostic**: No hardcoded currencies, VAT rates, or jurisdiction assumptions. Functional currency is per-tenant.
- **Event-driven**: Modules emit typed events → accounting engine listens → journal entries created. Uses NestJS EventEmitter.
- **Systematic instruction**: This spec tells developers "when X happens, Y must occur" — not database schemas or API designs.
- **WAC default, FIFO for batch-tracked items**
- **All 5 P0 audit gaps must be addressed**
- **All 13+ undefined business events must have complete journal entry mappings**

---

## Tasks

### Task 1: Save Spec Scaffolding

Create `agent-os/specs/2026-02-27-accounting-engine-spec/` with:
- **plan.md** — This plan
- **shape.md** — Shaping decisions (country-agnostic, event-driven, systematic instruction, no base currency, WAC/FIFO)
- **standards.md** — Empty (none defined yet)
- **references.md** — Links to all existing specs, the audit, data shape, and tech stack

### Task 2: Write Section 1 — Accounting Engine Architecture

Where the engine sits conceptually. The pattern: `BusinessEvent → AccountingEngine → JournalEntry`. Event naming convention. Idempotency. Transactional guarantees (journal entry in same DB transaction as source document). Reversals (never delete, always reverse). Auto-generated entries posted immediately; manual entries go through draft → posted. Account mapping configuration concept.

### Task 3: Write Section 2 — Tax Configuration Model

`TaxCode` (id, code, name, rate, type: inclusive/exclusive, isCompound). `TaxGroup` (bundle of codes for multi-component taxes like India GST). `TaxRate` (versioned rates with effectiveFrom/To). Exemption rules per customer/item/transaction type. Tax calculation logic. How taxes flow to journal entries (output tax liability on sales, input tax asset on purchases). Country-agnostic examples: zero-tax, single VAT, multi-component GST, US state sales tax.

### Task 4: Write Section 3 — Multi-Currency Design

Functional currency per tenant. Transaction currency per document. Exchange rate table. Journal entry lines store both FC amount and functional currency equivalent. FX gain/loss on settlement (realized). Month-end revaluation (unrealized). Decimal precision rules per currency. FX accounts in COA.

### Task 5: Write Section 4 — Default Chart of Accounts Template

Depends on: Tasks 3, 4 (tax accounts and FX accounts must be defined first).

4-5 level hierarchy. Code convention (1xxx-7xxx). Account subtypes for P&L auto-structuring (CostOfSales, OperatingExpense, etc.). `normalBalance` field. System/control accounts (non-deletable). Full "General Retail" template (~60-80 accounts). Notes on vertical variations (Fashion, Electronics, Grocery). Opening balance mechanism via special journal entry type + Opening Balance Equity account.

### Task 6: Write Section 5 — COGS Calculation Logic

WAC formula and recalculation triggers (GRN, purchase return, landed cost, stock adjustment). FIFO cost layers and consumption rules. When COGS entries fire (invoice confirmation, POS transaction completion). Retroactive COGS recalculation when landed costs arrive after sales. Assembly/production cost roll-up from BOM.

### Task 7: Write Section 6 — Account Mapping Configuration

Depends on: Tasks 2, 5.

The registry mapping event types to debit/credit accounts. Default mappings ship with COA template. Override hierarchy: System Default → Tenant Default → Warehouse → Item Category → Item. Validation rules. Example mappings table for all events.

### Task 8: Write Section 7 — Complete Event-to-Journal-Entry Mapping (LARGEST SECTION)

Depends on: Tasks 2-7 (all foundational sections).

32 events across all modules. For each: event name, source module, trigger, journal entry template (accounts, debit/credit, amount formula), multi-currency behavior, tax handling, COGS entry if applicable, example with real numbers, edge cases.

**Events by module:**
- POS (4): sale, return, shift close cash over/short, void
- Sales (3): invoice confirmed, credit note, receipt voucher posted
- Purchase (4): GRN confirmed, purchase return, payment voucher posted, landed cost allocated
- Inventory (6): adjustment, transfer, consumption, assembly, disassembly, count variance
- Cheques (7): received, deposited, cleared, bounced, issued, issued cleared, cancelled
- Banking (1): inter-account transfer
- Accounting (3): FX revaluation, year-end close, opening balance
- Future stubs (4): gift card sale/redemption, store credit issued/redeemed

### Task 9: Write Section 8 — Period Control

Depends on: Task 2.

Fiscal year configuration (configurable start month). Period statuses: Open → Soft-Locked → Hard-Locked. Soft lock: warning + override with reason. Hard lock: block all transactions. Cross-module enforcement via `validatePeriod(date)`. Reversals can be posted in current period even if original is locked.

### Task 10: Write Section 9 — Year-End Closing Logic

Depends on: Tasks 5, 9.

Pre-closing checklist (advisory). The closing journal entry: zero out all income/expense accounts → net to Retained Earnings. Post-closing: income/expense start at zero, balance sheet carries forward. Reopening a closed year (admin-only, reversing entry).

### Task 11: Write Section 10 — Bank Reconciliation Model

Depends on: Task 5.

BankStatement and BankStatementLine concepts. Import methods (CSV, manual). Auto-matching algorithm (amount + date + reference). Manual matching. Reconciliation summary (book vs bank, outstanding items). Completion and period marking. Outstanding cheques and deposits in transit.

---

## Task Execution Order

```
Parallel:  Task 2 (Architecture), Task 3 (Tax), Task 4 (Multi-Currency), Task 6 (COGS)
Then:      Task 5 (COA Template) — needs 3, 4
Parallel:  Task 7 (Account Mapping), Task 9 (Period Control), Task 11 (Bank Recon) — need 2, 5
Then:      Task 8 (Event Mapping) — needs 2-7
Then:      Task 10 (Year-End Closing) — needs 5, 9
```

## Critical Reference Files

| File | Purpose |
|------|---------|
| `agent-os/product/accounting-audit.md` | 5 P0 gaps + 13 undefined events to address |
| `merpec-frontend/product/sections/accounting/spec.md` | Current accounting UI spec |
| `merpec-frontend/product/sections/inventory/spec.md` | Inventory valuation, COGS, landed cost, accounting integration table |
| `merpec-frontend/product/sections/pos/spec.md` | POS flows that generate accounting events |
| `merpec-frontend/product/sections/sales/spec.md` | Sales flows |
| `merpec-frontend/product/sections/purchase/spec.md` | Purchase flows |
| `merpec-frontend/product/sections/settings-admin/spec.md` | Tax configuration UI, fiscal year, currencies |
| `merpec-frontend/product/data-shape/data-shape.md` | Entity definitions and relationships |
| `agent-os/product/tech-stack.md` | NestJS EventEmitter, Drizzle ORM, PostgreSQL, modular monolith |

## Verification

After all tasks complete:
1. Every P0 gap from the accounting audit has a corresponding section in the spec
2. Every one of the 13 undefined business events from the audit has a complete journal entry mapping
3. The COA template includes every account referenced in any event mapping
4. The spec is self-consistent: no event references an account that doesn't exist in the COA
5. A developer can read this spec and answer: "When a customer buys something at POS, what exactly happens in the accounting system?" with full precision
