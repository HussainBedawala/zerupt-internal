# Sales Layer 2 — Delivery / Fulfillment + Stock Relief + COGS
## Overview

**Date:** 2026-06-30  
**Purpose:** Study the outbound stock mechanics and COGS recognition for Sales invoices (mirror of Purchase Layer 2 GRN receipt).

---

## Key Finding: No Separate Delivery Step

Unlike purchase which has a distinct GRN document, **sales has no separate delivery/fulfillment document**. Stock leaves at invoice confirm. There is no delivery order, picking slip, or dispatch note. The `salesInvoices` table moves directly from `draft` → `confirmed`, and stock relief fires from the same confirm event.

This is intentional (POS-style). Implications for the audit:
- Partial delivery is impossible — the invoice is all-or-nothing.
- No pick-and-confirm workflow exists even for SO-sourced invoices.
- Sales Orders exist and can have reservations, but fulfillment happens at invoice confirm (not a distinct "ship" step).

---

## Stock Relief Trigger

**When:** `SalesInvoicesService.confirm()` at line ~604 of `sales-invoices.service.ts`  
**What:** Emits `sales.invoice.confirmed` → `InventoryDomainEventListener.handleSalesInvoiceConfirmed()` → `fanOutSale()` → `InventoryEventListener.applyOutbound()` per line with `movementType: "sale"`

### Sequence inside confirm() transaction:
1. Per-warehouse stock pre-check (best-effort, reads `materializedStockLevels`): `sales-invoices.service.ts:627-655`
2. Serial claim: `claimSerialLines()` → `SerialAllocationService.claimForSale()` atomically sets status `available → sold` inside the SAME confirm tx: `sales-invoices.service.ts:666`
3. `costAtSale` frozen per line: `sales-invoices.service.ts:669-675`
4. Guarded UPDATE `status=draft` filter closes race window: `sales-invoices.service.ts:688-706`
5. SO reservations fulfilled in same tx via `StockReservationService.fulfill()`: `sales-invoices.service.ts:738-743`
6. Outbox row inserted (durable): `sales-invoices.service.ts:726-731`
7. Post-commit fast-path emit: `emitInvoiceConfirmed()` → `InventoryDomainEventListener` + `SalesAccountingListener`

---

## Idempotency

- Event payload carries `eventId = deterministicUuidV5(invoice.id, INVOICE_CONFIRMED_NS)` — stable on retry: `sales-invoices-events.ts:83`
- Per-line event IDs derived by `InventoryDomainEventListener.deriveLineEventId(parentEventId, line, i)` using `sourceDocumentLineId` (always sent): `inventory-domain.listener.ts:160-178`
- Outbox + poller re-emit is a no-op (deduplicates on eventId): `sales-invoices-events.ts:150-156`

---

## Negative Stock Policy

- **Sales invoices (`inv`):** `blockNegativeStock = true` — inventory engine is the authoritative guard, pre-check is best-effort: `inventory-domain.listener.ts:195`
- **POS:** `blockNegativeStock = false` (physical fact, cash taken)
- Pre-check reads `materializedStockLevels` but does NOT hold a `FOR UPDATE` lock. Race between two concurrent confirms of the same item/warehouse is caught by the engine's authoritative guard, not the pre-check.
