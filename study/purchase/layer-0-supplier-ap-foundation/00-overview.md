# Layer 0: Supplier Master + AP Subledger Foundation — Overview

**Program:** Purchase Module Hardening  
**Layer:** 0 of N (Foundation — identity + subledger only; no PO/GRN/invoice mechanics)  
**Date:** 2026-06-29  
**Status:** Study only — NO code changes in this layer

---

## Scope

| In scope | Out of scope |
|----------|-------------|
| Supplier identity model (fields, status, uniqueness) | PO lifecycle (Layer 1) |
| supplier_item_codes integrity | GRN receiving (Layer 2) |
| AP subledger representation and GL tie | Purchase invoices (Layer 3) |
| Opening AP balances | Supplier payments (Layer 4) |
| Multi-currency supplier defaults and FX on AP balances | Landed cost (Layer 5) |
| Dual path (direct-purchase vs PO chain) at foundation level | Purchase returns (Layer 6) |
| Frontend supplier master + AP views | |

---

## Files Studied

| File | Purpose |
|------|---------|
| `packages/db/src/schema/purchase.ts` | Suppliers, purchase_invoices, supplier_payments tables |
| `packages/db/src/schema/supplier-item-codes.ts` | Supplier SKU cache |
| `packages/db/src/schema/opening-balance-import.ts` | Opening balance import orchestration |
| `apps/api/src/suppliers/suppliers.service.ts` | Supplier CRUD + outstanding balance query |
| `apps/api/src/suppliers/suppliers.dto.ts` | Zod validation schemas |
| `agent-os/product/modules/purchase/01-supplier-model.md` | Spec: supplier entity |
| `agent-os/product/modules/purchase/06-supplier-payments.md` | Spec: payments + FX |
| `agent-os/product/modules/purchase/07-cross-module-contracts.md` | Spec: events + cross-module |
| `agent-os/product/modules/accounting/03-multi-currency.md` | FX / functional currency rules |

---

## Chapter Index

| # | File | Covers |
|---|------|--------|
| 01 | `01-supplier-identity.md` | Fields, status lifecycle, uniqueness, deferred spec fields |
| 02 | `02-ap-subledger.md` | How AP balance is tracked; GL tie to control account 2111 |
| 03 | `03-opening-balances.md` | isOpening flag, opening JE link, import orchestration |
| 04 | `04-multi-currency.md` | Default currency gap, FX on AP balances |
| 05 | `05-dual-path-foundation.md` | Direct-purchase vs PO-chain paths and foundation requirements |
| 06 | `06-frontend.md` | Supplier list/detail UI, AP overview, gaps |

---

## Top Foundational Gaps (Summary)

1. **No `defaultCurrency` on supplier** — spec requires it; schema/DTO omit it. Multi-currency AP bookings use the invoice-level `currency` field but there is no supplier-level default to pre-fill.
2. **No `creditLimit` on supplier** — spec requires it; deferred (DEV-300 MVP note). Outstanding balance is computed live but never checked against a limit.
3. **No `blocked` reason stored** — status enum has `blocked` but no `blockedReason`/`blockedAt` columns and no audit entry is enforced.
4. **AP subledger is implicit** — the "subledger" is just a `SUM(balance)` scan of `purchase_invoices`. There is no `ap_subledger_entries` table; reconciliation to GL account 2111 is procedural, not structural.
5. **No `taxNumber` uniqueness** — two suppliers can share the same TRN/GSTIN within a tenant. For VAT-registered countries this is a compliance gap.
6. **`supplier_item_codes` has no FK to suppliers table** — `supplierId` is a plain uuid with no FK constraint; referential integrity is service-only.
7. **Payment terms are flat** — `paymentTermDays` (integer) is the only term captured. Spec calls for a PaymentTerms master with early-payment discount rates; deferred.
8. **Opening bills are not currency-aware at subledger level** — `isOpening` bills carry `exchangeRate` but there is no check that the opening JE was posted at the same rate.
