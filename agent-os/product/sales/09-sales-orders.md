# Sales Orders (Lean)

> As-built spec — DEV-390 (2026-06). Draft/confirm/cancel + convert-to-invoice. Sales orders are commitment documents only — they never touch the stock ledger or GL.

---

## Document Type

`doc_type = so`. Prefix `SO-` (sequential, no gaps). Separate sequence from quotations (`QT-`) and invoices (`INV-`).

---

## States

```
Draft → Confirmed → PartiallyInvoiced → Invoiced → Closed
Draft → Cancelled
Confirmed → Cancelled  (only if zero invoices exist)
```

---

## What Sales Orders Do and Do Not Do

| Action | SO behaviour |
|--------|-------------|
| Stock ledger entry | **Never.** SOs are commitment documents, not movement documents. |
| GL journal entry | **Never.** No accounting impact at order creation or cancellation. |
| Stock `committed` qty | Increases on confirm; decreases on cancel or when invoice confirmed. |
| Totals | Subtotal, tax, total are **estimates** — they reflect the order at the time of confirmation. Actual figures live on the invoice. |
| Approval threshold | If `total` exceeds `so.approvalThreshold`, manager PIN required on confirm. |

---

## Convert to Invoice

`POST /sales/orders/:id/convert-to-invoice`

- Creates a sales invoice with `sourceOrderId = so.id`.
- Lines copied from the SO; quantities editable before invoice confirmation (partial invoicing supported).
- On invoice confirmation: `invoicedQty` on SO lines updated; stock ledger and GL entries created by the invoice, not the SO.
- SO auto-transitions: `Confirmed → PartiallyInvoiced → Invoiced` as invoices are confirmed.

---

## Stock Reservation

On `Draft → Confirmed`: inventory `committed` qty increases per line at the specified warehouse.
On `Confirmed → Cancelled`: `committed` qty released.
On invoice confirmation: `committed` decreases by invoiced qty (physical movement handled by invoice).

---

## Events Emitted

| Event | Trigger |
|-------|---------|
| `sales.order.confirmed` | Draft → Confirmed |
| `sales.order.cancelled` | Confirmed → Cancelled |

No events for invoice-side transitions — those are owned by the invoice module.
