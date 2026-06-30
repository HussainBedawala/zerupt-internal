# Layer 1 — Sales Order Lifecycle: Spec vs Implementation

## Sources read
- `agent-os/product/modules/sales/03-sales-order-lifecycle.md` (spec v1)
- `agent-os/product/modules/sales/09-sales-orders.md` (as-built lean spec)
- `agent-os/product/modules/sales/08-event-mappings.md`
- `packages/db/src/schema/sales-orders.ts`
- `apps/api/src/sales/orders/sales-orders.service.ts` (1 262 lines)
- `apps/api/src/sales/orders/sales-orders.controller.ts`
- `apps/api/src/sales/direct/direct-sale.service.ts`
- `apps/api/src/sales/direct/direct-sale.dto.ts`
- `apps/api/src/sales/invoices/sales-invoices.service.ts` (credit-limit section)
- `apps/web/src/features/sales-orders/components/order-detail-panel.tsx`
- `apps/web/src/features/sales/components/direct/direct-sale-panel.tsx`

---

## 1. Schema (packages/db/src/schema/sales-orders.ts)

| Spec field | Impl column | Notes |
|---|---|---|
| `id`, `tenantId`, `number`, `channel`, `customerId`, `branchId` | ✅ present | — |
| `warehouseId` | ✅ present | order-level default warehouse |
| `status` enum | ✅ `draft/confirmed/fulfilled/cancelled` | CHECK constraint line 106 |
| `subtotal`, `taxTotal`, `grandTotal` | ✅ numeric(19,6) | — |
| `confirmedAt`, `confirmedBy` | ✅ null until confirmed | CHECK enforces both present together (line 115) |
| `notes` | ✅ | — |
| **Spec field `quotationId`** | ❌ MISSING | Spec 03 defines `quotationId` for quotation→SO conversion; no column exists |
| **Spec field `paymentTermsId`** | ❌ MISSING | Spec 03 defines it; not present in schema |
| **Spec field `exchangeRate`** | ❌ MISSING | Spec 03 defines per-SO exchange rate; not in schema |
| **Spec field `taxGroupId` (header)** | ❌ MISSING | Spec 03 defines header-level default; lines have it, header does not |
| **Spec `approvedBy`** | ❌ MISSING | Spec 03 says manager PIN required above threshold; column absent |
| **`invoicedQty` tracking on lines** | ❌ MISSING | Spec defines partial-invoicing states; no column tracks invoiced qty per line |

**Line table — exists and correct for lean scope:**
- `qty` (base units), `unitPrice` (GROSS per-base), `discountAmount` (pack saving), `taxGroupId`, `taxAmount`, `lineTotal`
- Pack-unit snapshot columns present: `unitPackId`, `unitName`, `unitQty`, `conversionFactor`, `packDiscountType`, `packDiscountValue`

---

## 2. State Machine

Spec (03-sales-order-lifecycle.md) defines:
```
Draft → Confirmed → PartiallyInvoiced → Invoiced → Closed
```

Actual DB CHECK + service implement:
```
Draft → Confirmed → Fulfilled → (terminal)
Draft/Confirmed → Cancelled
```

| Spec state | Impl state | Delta |
|---|---|---|
| `Draft` | `draft` | ✅ |
| `Confirmed` | `confirmed` | ✅ |
| `PartiallyInvoiced` | ❌ absent | Not implemented; spec says auto-transition when first invoice confirmed |
| `Invoiced` | ❌ absent | Not implemented |
| `Closed` (manual lock) | ❌ absent | Not implemented |
| `Fulfilled` | present | Impl-only state: set when `convert-to-invoice` is called; order is locked after single conversion |

**Impact:** the lean spec (09-sales-orders.md) confirms `Fulfilled` is the as-built terminal state. The granular `PartiallyInvoiced→Invoiced→Closed` chain from 03 is unbuilt. Partial invoicing (multiple invoices against one SO, `invoicedQty` tracking) is spec-only.

---

## 3. Confirm Transition — Guards Implemented

| Guard | Spec requirement | Impl | File:line |
|---|---|---|---|
| At least one line | ✅ | ✅ service:570-575 | `sales-orders.service.ts:570` |
| Customer active | ✅ | ✅ service `requireActiveCustomer` | `:904-912` |
| Concurrency-safe (`UPDATE WHERE status='draft'`) | implicit | ✅ | `:591-612` |
| Gapless SO number via `DocNumberingService` | spec implies | ✅ reserve→commit pattern | `:578-629` |
| **Credit-limit gate at confirm** | ✅ spec 01 customer model | ❌ NOT checked on SO confirm | — |
| **Approval threshold (manager PIN)** | ✅ spec 03 | ❌ NOT implemented | — |
| **SoD: confirm requires separate `approve` permission** | best practice | ⚠️ `sales.order.approve` permission used (controller:146) but service does nothing extra | `:144-155` |

**Credit-limit check exists only on invoice confirm** (`sales-invoices.service.ts:990`) as a *warn-only advisory* endpoint — it never blocks. No credit-limit enforcement exists at SO confirm.

---

## 4. Stock Reservation

| Spec requirement | Impl | File:line |
|---|---|---|
| `committed` qty increases on Draft→Confirmed | ✅ `StockReservationService.reserve()` called inside confirm tx with FOR UPDATE on stock rows | `sales-orders.service.ts:618, 1207` |
| `committed` decreases on Confirmed→Cancelled | ✅ `StockReservationService.release()` inside cancel tx | `:792, 1227` |
| `committed` decreases on invoice confirmation | ✅ `SalesInvoicesService.confirm()` calls release on `sourceOrderId` | `sales-invoices.service.ts:734,955` |

Stock reservation is clean and transactional.

---

## 5. Event Emission (sales.order.confirmed / sales.order.cancelled)

Spec (08-event-mappings.md) requires:
- `sales.order.confirmed` on Draft→Confirmed (consumer: Inventory committed qty)
- `sales.order.cancelled` on Confirmed→Cancelled

**Implementation:** Neither event is emitted anywhere in `sales-orders.service.ts`. No `EventEmitter` import, no outbox insert, no post-commit emit. The stock reservation is driven by **direct service call** (synchronous inside the tx), not by events. The spec's event-driven inventory coupling does not match the actual implementation; the synchronous call is functionally correct but diverges from the event-driven architecture contract.

---

## 6. Convert to Invoice

| Spec | Impl | File:line |
|---|---|---|
| Creates draft invoice with `sourceOrderId` | ✅ | `sales-orders.service.ts:677-743` |
| Lines copied from SO | ✅ pack-unit snapshot columns copied | `:698-743` |
| SO status → fulfilled atomically | ✅ `UPDATE WHERE status='confirmed'` inside same tx | `:679-695` |
| Spec: partial invoicing — `invoicedQty` on SO lines updated by invoice confirm | ❌ not implemented | — |
| Spec: SO auto-transitions PartiallyInvoiced→Invoiced as invoices confirm | ❌ not implemented | — |

The as-built lean spec (09-sales-orders.md) confirms single conversion only — no partial invoicing. This is an intentional scope reduction, not a bug.
