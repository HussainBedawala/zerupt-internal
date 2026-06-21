# Fiscal Periods — Locking & Validation

> Service: `apps/api/src/fiscal-period/fiscal-period.service.ts`

## Status Transitions

```
Open ↔ SoftLocked ↔ HardLocked
Open ←→ HardLocked (direct)
HardLocked → SoftLocked: NOT ALLOWED
```

| From | To | Requires |
|------|----|----------|
| Open | SoftLocked | `accounting.period.lock` permission |
| Open | HardLocked | `accounting.period.lock` permission |
| SoftLocked | Open | `accounting.period.unlock` permission |
| SoftLocked | HardLocked | `accounting.period.lock` permission |
| HardLocked | Open | `accounting.period.unlock` + mandatory `reason` |

Invalid: `HardLocked → SoftLocked` (must unlock fully first).

## `validatePeriod(tenantId, legalEntityId, transactionDate)`

Called by ALL financial modules before any transaction. Returns `ValidatePeriodResult`.

| Check | Logic |
|-------|-------|
| Find period | `startDate <= date <= endDate` for entity |
| Closed year override | If `fiscalYear.isClosed`, force status = HardLocked |
| Future period | `period.startDate > today` |
| Backdated past lock | `transactionDate < earliestOpenPeriod.startDate` |
| Soft-lock override | Returns `allowSoftLockOverride` + `softLockOverrideRoles` for caller to decide |

Date normalization: midnight UTC date-only string to avoid MENA/India/SEA timezone mismatches with Postgres DATE columns.

## Soft-Lock Override Threading (both JEs must post)

When a document confirms into a **SoftLocked** period, the originating service must call
`assertSoftLockOverrideAllowed` and build an authorized override via
`buildSoftLockOverride(...)` (`apps/api/src/accounting-events/helpers/soft-lock-override.ts`).
The override is then threaded onto **every** `accounting.post` the document produces so the
posting engine posts into the soft-locked period instead of dead-lettering.

Several documents emit **TWO** JEs from **ONE** domain event — the financial leg AND a
separate inventory-engine leg:

| Document | Financial-leg JE (accounting listener) | Inventory-leg JE (inventory engine) |
|----------|----------------------------------------|-------------------------------------|
| Sales invoice | AR / Revenue / Output-Tax | COGS / Inventory |
| Sales credit note | Sales-Returns / AR / Output-Tax | COGS reversal (Inventory / COGS) |
| Purchase return | AP 2111 / 1192 clearing / variance | 1192 → 1141 inventory relief |

The override MUST reach BOTH. The chain: service → domain event payload
(`softLockOverride`) → `inventory-domain.listener` copies it onto the `Stock*Payload` →
`inventory-event.listener` sets it on the COGS / reversal / purchase-return-relief
`accounting.post` via `withSoftLockOverride`. Missing it on the inventory leg = the
document shows posted while its COGS/inventory JE silently dead-letters (clearing/COGS drift).

POS sales carry no override (real-time, open period → `undefined`). The negative-stock COGS
true-up fires on a later cost-establishing receipt and is NOT threaded with the original
override (separate event/period).

## Batch Operations

- **Batch lock:** Sets all non-target periods to target status in one UPDATE. Audited per-period.
- **Batch unlock:** Sets all locked periods to open. Requires mandatory `reason`.
- Both blocked if fiscal year is closed.

## Fiscal Year Close

1. `SELECT FOR UPDATE` (race protection)
2. Auto-lock all non-hard-locked periods → HardLocked (audited as "System: Auto-locked on close")
3. Generate year-end closing entry via `YearEndClosingService`
4. Set `isClosed=true, closedAt, closedBy`
5. Auto-create next fiscal year (idempotent, errors swallowed — close still succeeds)

## Fiscal Year Reopen

1. Reverse closing entry (if exists) via `YearEndClosingService.reverseClosingEntry()`
2. Set `isClosed=false`, clear `closedAt/closedBy`
3. **Periods stay locked** — admin must manually unlock desired periods

## API Endpoints

| Method | Route | Permission |
|--------|-------|-----------|
| GET/PUT | `/tenant/fiscal-settings/:legalEntityId` | `settings.fiscal.read/update` |
| POST | `/tenant/fiscal-years` | `settings.fiscal.create` |
| GET | `/tenant/fiscal-years` | `settings.fiscal.list` |
| GET | `/tenant/fiscal-years/:id` | `settings.fiscal.read` |
| GET | `/tenant/fiscal-years/:id/pre-closing-checklist` | `settings.fiscal.read` |
| GET | `/tenant/fiscal-years/:id/closing-entry-preview` | `settings.fiscal.read` |
| POST | `/tenant/fiscal-years/:id/close` | `accounting.period.lock` |
| POST | `/tenant/fiscal-years/:id/reopen` | `accounting.period.unlock` |
| POST | `/tenant/fiscal-years/:id/lock-periods` | `accounting.period.lock` |
| POST | `/tenant/fiscal-years/:id/unlock-periods` | `accounting.period.unlock` |
| POST | `/tenant/fiscal-periods/:id/lock` | `accounting.period.lock` |
| POST | `/tenant/fiscal-periods/:id/unlock` | `accounting.period.unlock` |

## Pre-Closing Checklist (7 Items)

| # | Check | Status |
|---|-------|--------|
| 1 | All periods locked | DB query |
| 2 | Bank accounts reconciled | Skipped (module not built) |
| 3 | Tax returns filed | Skipped (module not built) |
| 4 | No draft journal entries in FY | DB query |
| 5 | No pending stock counts | Skipped (module not built) |
| 6 | Trial balance balanced | DB query: `SUM(debit) = SUM(credit)` from inception |
| 7 | No inventory in transit | DB query: account 1142 balance = 0 |
