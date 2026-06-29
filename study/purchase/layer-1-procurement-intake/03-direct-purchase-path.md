# Chapter 3 — The Direct Purchase Path

**Purpose:** An inventory-only shopkeeper buys stock from a supplier and wants to record it immediately, without raising a formal PO first. One screen, one save, stock is in.

---

## What the User Sees

The `DirectPurchasePanel` (`erp/apps/web/src/features/purchase/components/direct/direct-purchase-panel.tsx`) collects:

| Field | Required? | Notes |
|-------|-----------|-------|
| Supplier | Yes | Combobox with search + quick-add inline |
| Branch | Yes | The receiving branch |
| Purchase date | Yes | Business date (defaults today) |
| Supplier invoice # | No | Their reference |
| Lines (item + qty + unit + unit cost) | Yes | BillLineSearch picker + barcode scan stub |
| Settlement: paid or credit | Yes | Toggle |
| If paid: payment method (cash/bank transfer) + date | Yes | |
| If credit: due date | No | Optional |
| Notes | No | |

On submit → single `POST /tenant/purchase/direct` with an `idempotencyKey` (generated on form mount, rotated on "new entry").

---

## What the API Does (7 Steps, One Transaction)

Source: `direct-purchase.service.ts:69–308`.

```
db.transaction(async (tx) => {
  1. Create purchase_orders (sourceType='direct_purchase', status='confirmed', number='DP-<uuid>')
  2. Create purchase_order_lines (one per input line)
  3. Create grns (status='draft', hasSupplierInvoice=false)
  4. Create grn_lines (one per input line)
  5. grns.confirm() → stock posted, JE: DR Inventory 1141 / CR GRN Accrual 2121
  6. bills.fromGrn() → draft purchase_invoice from GRN
     bills.confirm() → JE: DR GRN Accrual 2121 / CR AP 2111 + input tax
  7. (if settlement=paid) payments.create() + payments.post()
     → JE: DR AP 2111 / CR Cash/Bank
  8. Insert direct_purchases anchor row (idempotencyKey UNIQUE per tenant)
})
// post-commit: drain outbox → EventEmitter → inventory/accounting listeners
```

Net accounting after all steps (paid case):
- DR Inventory 1141 (cost of goods)
- DR Input Tax 1162 (if applicable)
- CR Cash/Bank (settled at purchase)

Net accounting (credit case):
- DR Inventory 1141
- DR Input Tax 1162
- CR AP 2111 (open payable, settled later via standard supplier payment)

---

## Documents Created

| Document | Table | Number Pattern | Status at end |
|----------|-------|---------------|---------------|
| Hidden PO | `purchase_orders` | `DP-<uuid>` | `confirmed` |
| GRN | `grns` | `GRN-NNNN` (gapless on confirm) | `confirmed` |
| Bill | `purchase_invoices` | `PINV-NNNN` | `confirmed` |
| Payment (if paid) | `supplier_payments` | `PV-NNNN` | `posted` |
| Anchor | `direct_purchases` | — (internal id) | `paid` or `credit` |

The **user-facing document** is the bill (`PINV-NNNN`). The GRN and DP-PO are internal plumbing.

---

## Idempotency

- Client generates a `crypto.randomUUID()` `idempotencyKey` on form mount.
- Server stores it in `direct_purchases.idempotency_key` (UNIQUE per tenant, enforced by DB partial unique index).
- On replay (double-tap, network retry): `findExisting()` returns prior anchor → returns prior result, no re-post.
- On concurrent race: unique violation caught, prior result looked up and returned.
- "New entry" button rotates the key on the client.

---

## hasSupplierInvoice = false (Accrual Path)

The GRN is created with `hasSupplierInvoice = false`. This means:
- GRN confirm posts to GRN Accrual 2121 (not directly to AP 2111).
- The subsequent bill confirm then clears 2121 and posts to AP 2111.
- This is the two-step matched-receipt accounting pattern, even though it happens atomically.
- The rationale: `bills.fromGrn()` requires an accrual GRN (not a supplier-invoice-matched GRN).

---

## Warehouse Resolution

The direct purchase panel does NOT expose a per-line warehouse picker to the user. The service auto-resolves the default warehouse for the branch (`resolveDefaultWarehouse()`).

**REQUIRES:** If a branch has multiple warehouses, the user cannot choose which warehouse receives the goods. This is a known limitation for phase-4c. A 10-year design should allow per-line warehouse selection.

---

## Tax in Direct Purchase

- `taxAmount` on PO lines is set to `"0"` at creation (no `recompute()` call during DP).
- The bill's `fromGrn()` / `confirm()` path handles tax calculation when the bill is created.
- The user does NOT enter tax separately — it is derived from the item's `taxGroupId`.

**REQUIRES:** No tax-inclusive cost entry (e.g. "I paid 115 total including 15% VAT, compute the cost back"). The frontend shows subtotal only (no tax row in the totals UI).

---

## Anchor Table Purpose

`direct_purchases` serves three purposes:
1. Idempotency: unique (tenantId, idempotencyKey) prevents double-post.
2. Audit linkage: grnId + billId + paymentId FK chain keeps the 3-4 documents tied together.
3. Future graduation: the anchor is the hook for a "convert to full PO" workflow (not yet built).
