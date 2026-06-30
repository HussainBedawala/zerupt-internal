# Layer 0: Customer Master + AR Subledger Foundation — Overview

**Program:** Sales Module Hardening
**Layer:** 0 of N (Foundation — identity + subledger only; no quotation/SO/invoice mechanics)
**Date:** 2026-06-30
**Status:** Study only — NO code changes in this layer

---

## Scope

| In scope | Out of scope |
|----------|-------------|
| Customer identity model (fields, status, uniqueness) | Quotation/SO lifecycle (Layer 1) |
| AR subledger representation and GL tie to 1131 | Sales invoice mechanics (Layer 2) |
| Opening AR balances | Credit notes (Layer 3) |
| Multi-currency customer defaults and FX on AR | Customer payments / receipts (Layer 4) |
| Credit limit storage and enforcement | Direct sales / POS (Layer 5) |
| Blocked customer guards | Write-offs (Layer 6) |
| Frontend customer master + AR overview | |

---

## Reference Standard (Purchase Layer 0)

The purchase Layer 0 hardening established these invariants as the baseline:

1. AP balance DERIVED from party-tagged GL control account (2111), not from `SUM(invoice.balance)`.
2. Per-currency balances, functional-in-SQL, reconcile drift invariant.
3. Supplier `defaultCurrency` / `creditLimit` / `blocked` fields + transition guards.
4. `taxNumber` dup guard + name/code normalization.
5. `openingJournalEntryId` links opening bill to its JE (plain UUID, no FK).

---

## Files Studied

| File | Purpose |
|------|---------|
| `packages/db/src/schema/sales.ts` | Customer, invoice, credit note, receipt tables |
| `packages/db/src/schema/journal-entry.ts` | JE lines — partyType/partyId fields |
| `packages/db/src/schema/enums.ts` | salesCustomerStatus, systemRoleKey |
| `apps/api/src/sales/customers/customers.service.ts` | Customer CRUD + AR balance query |
| `apps/api/src/sales/customers/customers.dto.ts` | Zod validation schemas |
| `apps/api/src/sales/overview/sales-overview.service.ts` | AR aging + KPI computation |
| `apps/api/src/sales/invoices/sales-invoices.service.ts` | Invoice confirm + credit limit check |
| `apps/api/src/sales/orders/sales-orders.service.ts` | Order confirm (blocked check) |
| `apps/api/src/accounting-events/listeners/sales.listener.ts` | GL journal entry builder for sales events |
| `apps/web/src/features/customers/types.ts` | Frontend Customer type shapes |
| `agent-os/product/modules/sales/01-customer-model.md` | Spec: customer entity |
| `agent-os/product/modules/sales/07-cross-module-contracts.md` | Cross-module contracts |
| `agent-os/product/modules/sales/08-event-mappings.md` | Sales event payload schemas |

---

## Chapter Index

| # | File | Covers |
|---|------|--------|
| 01 | `01-customer-identity.md` | Fields, status lifecycle, uniqueness, deferred spec fields |
| 02 | `02-ar-subledger.md` | How AR balance is tracked; GL tie to control account 1131 |
| 03 | `03-opening-balances.md` | isOpening flag, opening JE link, import flow |
| 04 | `04-multi-currency.md` | Missing defaultCurrency, FX on AR balances |
| 05 | `05-credit-limit-and-blocked.md` | Credit limit storage + enforcement gap; blocked guard gap |
| 06 | `06-frontend.md` | Customer form, AR overview UI, gaps |

---

## Top Foundational Gaps (Quick Summary — detail in 07-gap-candidates.md)

1. **AR balance is invoice-scan, NOT GL-derived** — `SUM(sales_invoices.balance WHERE status='confirmed')`. The GL IS party-tagged correctly (customerId on all 1131 lines), but the customer-facing balance never queries it. Drift from manual JEs is invisible.
2. **No `defaultCurrency` on customer** — spec requires it; schema and both frontend DTOs omit it entirely.
3. **No `defaultPriceListId` on customer** — spec requires it; schema omits it.
4. **Credit limit is advisory, not enforced** — `checkCreditLimit()` exists but returns a warning flag only; invoice/order confirm does NOT hard-block on over-limit.
5. **No blocked guard on invoice/order confirm** — no `assertNotBlocked` check in confirm paths; a blocked customer can have new invoices confirmed.
6. **No `blockedReason` / `blockedAt` column** — spec says blocking requires a reason (audit trail); schema has only status enum.
7. **No `taxNumber` uniqueness constraint** — two customers can share the same TRN/GSTIN within a tenant.
8. **Frontend `Customer` type missing `creditLimit` and `defaultCurrency`** — `CreateCustomerPayload` / `UpdateCustomerPayload` also omit both.
