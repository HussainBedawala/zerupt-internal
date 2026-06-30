# 07 — Layer 0 Gap Candidates

**Status:** Study-phase findings for audit agent to formalize severity.
All citations are to actual code lines; this is not speculative.

---

## G1 — AR Balance Derived from Invoice Scan, Not GL

**Where:** `customers.service.ts` (getCustomer, listCustomers), `sales-overview.service.ts` (outstandingReceivables KPI, AR aging, top customers, credit limit check in `sales-invoices.service.ts`)

**What:** Outstanding AR is computed as `SUM(sales_invoices.balance WHERE status='confirmed')`. The GL trade receivables account (1131) IS correctly party-tagged (partyType='customer', partyId=customerId on all JE lines in `sales.listener.ts`). But the customer-facing balance and KPIs never query the GL.

**Risk:** A manual journal entry posted to 1131 (e.g. a write-off posted outside the write-off flow, or an accounting correction) does not appear in the customer's outstanding balance. Subledger-to-GL drift is invisible to users.

**Compare purchase Layer 0:** Same gap found for AP (AP is also a SUM scan, not GL-derived). Identified as a shared structural debt.

**Severity candidate:** MEDIUM — the GL is correctly party-tagged so the data is recoverable; but the displayed balance and the ledger can silently diverge.

---

## G2 — No `balance = total - paidAmount` DB CHECK on `sales_invoices`

**Where:** `packages/db/src/schema/sales.ts` lines 260–285 (CHECK constraints)

**What:** The `sales_invoices` table has individual non-negative CHECKs on `subtotal`, `tax_total`, `discount_total`, `total`, `paid_amount`, `balance`, and `exchange_rate`. But there is **no CHECK enforcing `balance = total - paidAmount`**. Compare `purchase_invoices` which has a named `purchase_invoices_balance_integrity_check`.

**Risk:** A service bug that incorrectly updates `balance` (e.g. receipt applies paidAmount but forgets to subtract from balance) would silently corrupt AR without DB-level detection.

**Severity candidate:** HIGH — integrity constraint missing at DB level for the core AR balance field.

---

## G3 — No `defaultCurrency` on Customer

**Where:** `packages/db/src/schema/sales.ts` (salesCustomers table), `apps/api/src/sales/customers/customers.dto.ts`, `apps/web/src/features/customers/types.ts`

**What:** Spec requires `defaultCurrency` (string, ISO-4217) on the customer master for pre-filling invoice currency. Column does not exist in schema, DTO, or frontend types.

**Severity candidate:** MEDIUM — usability gap now; correctness gap when multi-currency goes live.

---

## G4 — No `defaultPriceListId` on Customer

**Where:** `packages/db/src/schema/sales.ts` (salesCustomers table)

**What:** Spec (`01-customer-model.md`) requires `defaultPriceListId` — the assigned price list for price resolution. Column does not exist. The pricing engine spec references this field for customer-specific pricing.

**Severity candidate:** MEDIUM — price list assignment cannot be per-customer until this exists.

---

## G5 — Credit Limit Not Enforced at Invoice/Order Confirm

**Where:** `apps/api/src/sales/invoices/sales-invoices.service.ts` confirm path; `apps/api/src/sales/orders/sales-orders.service.ts` confirm path

**What:** `checkCreditLimit()` returns a warning flag but is never called as a hard gate during confirm. Spec says "Block confirmation. Manager PIN required to override." Neither block nor PIN flow exists.

**Severity candidate:** HIGH — spec calls for a hard block; current behavior is no enforcement at all.

---

## G6 — Blocked Customer Not Guarded on New Document Creation/Confirm

**Where:** `apps/api/src/sales/invoices/sales-invoices.service.ts`, `apps/api/src/sales/orders/sales-orders.service.ts`

**What:** No `assertNotBlocked` check in invoice create, invoice confirm, order create, or order confirm paths. A blocked customer can have new invoices and orders created and confirmed with no system resistance.

**Severity candidate:** HIGH — blocked status has zero enforcement effect.

---

## G7 — No `blockedReason` / `blockedAt` Columns

**Where:** `packages/db/src/schema/sales.ts` (salesCustomers table)

**What:** Status can transition to `blocked` via a simple status field update with no reason stored. Spec says "Blocking requires a reason (stored in audit trail)." No `blocked_reason` column, no `blocked_at` timestamp, no status history table.

**Severity candidate:** MEDIUM — compliance/auditability gap; reason is lost immediately.

---

## G8 — No `taxNumber` Uniqueness Constraint

**Where:** `packages/db/src/schema/sales.ts` line 85 (`tax_number` column)

**What:** No unique index on `(tenant_id, tax_number)`. Two customers can share the same TRN/GSTIN within a tenant. For GCC/India VAT-registered entities, a TRN uniquely identifies one legal entity.

**Severity candidate:** MEDIUM — compliance gap for VAT-registered markets; same gap exists on suppliers.

---

## G9 — Frontend `Customer` Type Missing `creditLimit`

**Where:** `apps/web/src/features/customers/types.ts` — `Customer`, `CustomerDetail`, `CreateCustomerPayload`, `UpdateCustomerPayload`

**What:** Backend has `creditLimit` in schema and DTO; frontend type shapes omit it. Credit limit cannot be set or displayed from the frontend UI.

**Severity candidate:** MEDIUM (coupled to G5 — limit cannot be enforced if it cannot be set).

---

## G10 — Multi-Currency AR KPIs Sum Mixed Currencies

**Where:** `apps/api/src/sales/overview/sales-overview.service.ts` — `outstandingReceivables`, `arAging`, `topCustomersByBalance`

**What:** All three KPIs sum `sales_invoices.balance` regardless of the invoice currency. For multi-currency tenants, this mixes currency denominations into a single number. The currency label shown is the functional currency of the first branch's legal entity, but the sum is not converted to functional.

**Severity candidate:** LOW now (all existing tenants are single-currency), but will be HIGH when multi-currency goes live.

---

## G11 — Opening Invoice→JE Link Has No Consistency CHECK

**Where:** `packages/db/src/schema/sales.ts` (`is_opening`, `opening_journal_entry_id` columns)

**What:** No DB CHECK enforcing `is_opening = true ↔ opening_journal_entry_id IS NOT NULL`. The link is by convention only.

**Severity candidate:** LOW — service layer handles this correctly in practice.

---

## G12 — No `journal_entry_id` FK on `sales_invoices` for Non-Opening Postings

**Where:** `packages/db/src/schema/sales.ts` (`sales_invoices` table)

**What:** Regular (non-opening) invoices have no `journal_entry_id` column. The only traceability from invoice to JE is via the accounting outbox event / audit log. Same gap as purchase (`purchase_invoices`).

**Severity candidate:** LOW — traceability gap; not a correctness issue.

---

## Priority Matrix

| Gap | Area | Severity |
|-----|------|----------|
| G2 | DB integrity | HIGH |
| G5 | Credit limit enforcement | HIGH |
| G6 | Blocked customer guard | HIGH |
| G1 | AR balance derivation | MEDIUM |
| G3 | Missing defaultCurrency | MEDIUM |
| G4 | Missing defaultPriceListId | MEDIUM |
| G7 | No blockedReason column | MEDIUM |
| G8 | taxNumber uniqueness | MEDIUM |
| G9 | Frontend creditLimit missing | MEDIUM |
| G10 | Multi-currency KPI sum | LOW (HIGH when MC live) |
| G11 | Opening link no CHECK | LOW |
| G12 | No JE FK on invoices | LOW |
