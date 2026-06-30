# Layer 1 — GAP CANDIDATES (audit assigns severity)

All gaps are cited to file:line. Severity to be assigned during the hardening audit pass.

---

## GAP-S1-001 — Credit-limit gate absent on SO confirm AND direct sale

**Where:** `apps/api/src/sales/orders/sales-orders.service.ts:562-631` (confirm),
`apps/api/src/sales/direct/direct-sale.service.ts` (runWithinTx)

**What:** `SalesInvoicesService.checkCreditLimit()` exists (`sales-invoices.service.ts:990`) as a
warn-only advisory endpoint (never throws). Neither SO confirm nor direct sale calls it or enforces
it. The spec (`03-sales-order-lifecycle.md` guard table) requires credit-limit check at
Draft→Confirmed.

**Risk:** A customer can be over-limit and sales staff will not be warned or blocked at the point of
commitment (SO confirm). Overselling on credit is invisible until AR aging review.

---

## GAP-S1-002 — Approval threshold not implemented

**Where:** `apps/api/src/sales/orders/sales-orders.service.ts:562` (confirm),
`packages/db/src/schema/sales-orders.ts` (no `approvedBy` column)

**What:** Spec requires manager PIN when SO total > `so.approvalThreshold`. No column, no
tenant-config, no service-level check, no frontend PIN dialog.

**Risk:** High-value orders bypass manager authorization. SoD gap for large sales.

---

## GAP-S1-003 — `sales.order.confirmed` and `sales.order.cancelled` events never emitted

**Where:** `apps/api/src/sales/orders/sales-orders.service.ts` (entire file — no EventEmitter import,
no outbox insert)

**What:** Spec (08-event-mappings.md) defines these events. Inventory committed-qty is managed by
a **direct synchronous call** to `StockReservationService` inside the same tx (lines 618, 792)
rather than the event-driven outbox pattern used by invoices/receipts. Functionally correct today
but:
1. Architecture contract mismatch — the event envelope (with `eventId`, `occurredAt`, `exchangeRate`) is never produced for orders.
2. Any new consumer of these events (e.g. a demand-planning or B2B integration listener) gets nothing.
3. Inconsistency with purchase module's order events which DO flow through the outbox.

---

## GAP-S1-004 — Partial invoicing states not implemented

**Where:** `packages/db/src/schema/sales-orders.ts:83` (status CHECK), spec 03

**What:** Spec defines `PartiallyInvoiced` and `Invoiced` states with `invoicedQty` tracking per
line. Impl skips directly to `fulfilled` on first (and only) convert-to-invoice. Multiple invoices
against one SO are structurally impossible today. No `invoicedQty` column on `sales_order_lines`.

**Scope note:** The lean as-built spec (09-sales-orders.md) documents this as intentional scope
reduction. Gap exists vs 03-sales-order-lifecycle.md.

---

## GAP-S1-005 — `quotationId` linkage absent from schema

**Where:** `packages/db/src/schema/sales-orders.ts` (no `quotation_id` column), spec 03

**What:** Spec defines SO created from a quotation carries `quotationId`. No column, no FK, no
conversion path from quotation to SO in the service. The quotation lifecycle (02-quotation-lifecycle.md)
is unbuilt entirely.

---

## GAP-S1-006 — `Closed` state and manual short-close not implemented

**Where:** `apps/api/src/sales/orders/sales-orders.service.ts`, schema CHECK line 107

**What:** Spec defines `Confirmed → Closed` (short-close with committed-qty release) and
`Invoiced → Closed`. Neither transition nor state exists. A confirmed order can only `cancel`
or `convert-to-invoice`; there is no way to close a partially-fulfilled SO and release remaining
reservation.

---

## GAP-S1-007 — Direct sale path: latent multi-currency gap

**Where:** `apps/api/src/sales/direct/direct-sale.service.ts:147`

**What:** `exchangeRate: "1"` is hardcoded. For a multi-currency tenant (e.g. USD invoice from AED
entity) the direct sale would silently post at rate=1. The DTO intentionally omits the field so no
client-supplied rate trust issue exists — but the architectural assumption (functional-currency-only)
is undocumented as a business constraint and would silently corrupt FX books if a multi-currency
tenant uses the direct-sale path.

**Severity context:** Not exploitable for current single-currency GCC tenants. Latent gap for
international expansion.

---

## GAP-S1-008 — SO cancel: no check for existing invoices on `confirmed` orders

**Where:** `apps/api/src/sales/orders/sales-orders.service.ts:760-797`

**What:** Spec requires "Confirmed → Cancelled only if zero invoices exist for this SO." The service
allows cancel on any `confirmed` order without checking `salesInvoices` for `sourceOrderId = orderId`.
Since `convert-to-invoice` atomically flips status to `fulfilled`, there is no window where
`confirmed + invoice exists` today (single-conversion-only). But if partial invoicing were added
later this guard would be missing.

**Current risk:** Low (single conversion guards against it indirectly). Pre-emptive gap for spec
fidelity.

---

## GAP-S1-009 — No credit-limit warning surfaced in direct-sale frontend

**Where:** `apps/web/src/features/sales/components/direct/direct-sale-panel.tsx`

**What:** `checkCreditLimit` endpoint exists at `GET /sales/invoices/:id/credit-limit-check`
but is never called in the direct sale panel. Users cannot see a credit warning before submitting.

---

## Summary Table

| ID | Area | Severity (TBD) |
|---|---|---|
| S1-001 | Credit-limit gate missing at SO confirm + direct sale | — |
| S1-002 | Approval threshold not implemented | — |
| S1-003 | Order events (confirmed/cancelled) never emitted; sync direct call instead | — |
| S1-004 | Partial invoicing states / invoicedQty absent | — |
| S1-005 | quotationId linkage absent | — |
| S1-006 | Closed state / short-close not implemented | — |
| S1-007 | Direct sale: latent multi-currency rate=1 assumption | — |
| S1-008 | Cancel confirmed SO: no invoice-existence guard | — |
| S1-009 | No credit-limit warning in direct-sale UI | — |
