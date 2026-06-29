# Chapter 1 — PO State Machine

## States

| Status | Meaning |
|--------|---------|
| `draft` | Created, editable, no number assigned yet |
| `confirmed` | Immutable; gapless PO- number assigned; `onOrder` inventory incremented |
| `partially_received` | At least one GRN confirmed; some lines still open |
| `received` | All lines fully received (`receivedQty >= orderedQty` on every line) |
| `closed` | Terminal; locked from further GRNs (manual or auto after full receipt) |
| `cancelled` | Terminal; only from draft or confirmed (if zero GRNs exist) |

Source: `purchase.ts:651` (`purchaseOrderStatus` enum), `purchase-orders.service.ts:307`.

---

## Transitions (as implemented)

```
draft ──confirm──▶ confirmed ──[first GRN confirmed]──▶ partially_received ──[all lines received]──▶ received ──close──▶ closed
  │                    │                                                                                     │
  └──cancel──▶ cancelled (no side effects)              closed ◀────────────────────short-close──────────────┘
               confirmed ──cancel──▶ cancelled (only if zero GRNs; emits order.cancelled)
```

| Transition | Guard (implemented) | Event emitted |
|-----------|---------------------|---------------|
| draft → confirmed | ≥1 line with qty > 0; active supplier; approval PIN if total > threshold | `purchase.order.confirmed` |
| confirmed → partially_received | Auto via GRN confirm (GRN service updates PO line `receivedQty`) | none |
| partially_received → received | Auto when all line `receivedQty >= orderedQty` | none |
| received → closed | Manual `close()` action | none |
| confirmed → closed | Short-close via `close()` (remaining qty written off) | none |
| draft → cancelled | `cancel()` — no side effects | none |
| confirmed → cancelled | `cancel()` — guard: `count(grns) = 0` | `purchase.order.cancelled` |

Source: `purchase-orders.service.ts:426–471` (cancel), `purchase-orders.service.ts:476–501` (close).

---

## Gapless Number Assignment

- Draft PO carries placeholder `DRAFT-<uuid>` (satisfies unique constraint without wasting numbers).
- On confirm: `DocNumberingService.reserveNumber(tenantId, { documentType: 'PO', branchId })` runs BEFORE the DB transaction.
- If the transaction fails the reservation is released (`safeReleaseReservation`).
- On transaction commit: reservation is committed to the order id.

Source: `purchase-orders.service.ts:322–410`.

---

## Auto-Transitions (partially_received / received)

The spec (`02-purchase-order-lifecycle.md:57`) states these are auto-transitions driven by GRN confirms. The implementation delegates this to the GRN service, which updates `purchase_order_lines.receivedQty` and then recomputes PO status.

**REQUIRES (gap):** The auto-transition logic (`partially_received → received`) is owned by the GRN service (Layer 2), not this service. Layer 1 does not contain this logic. A robust design would have an explicit PO status recalculator called from GRN confirms — verify this exists in Layer 2 study.

---

## Immutability Rule

- Confirmed POs are immutable — no line edits, no deletions.
- `requireDraft()` gate (`purchase-orders.service.ts:557`) enforces this: all mutating operations (`addLine`, `updateLine`, `removeLine`) call `requireDraft()` first.
- `lockDraftOrder()` (`purchase-orders.service.ts:570`) acquires `FOR UPDATE` within transactions to prevent concurrent confirms racing with edits.

**REQUIRES:** No amendment / revision log exists. A 10-year design needs PO revision history (version number, snapshot of prior lines) so audit trails survive "why did we order 100 but only 80 arrived."

---

## Cancellation of `direct_purchase` POs

- `sourceType = 'direct_purchase'` POs are created already confirmed (no draft phase).
- They are hidden from the PO list (`list()` filters `sourceType = 'manual'`).
- They can theoretically be cancelled via the same cancel endpoint but there is no UI for it.

**REQUIRES:** A cancellation / reversal story for direct purchases is not defined. If a shopkeeper needs to undo a direct purchase, the path is unclear.
