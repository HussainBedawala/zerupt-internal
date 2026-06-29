# Chapter 6 — Frontend

---

## PO Path UI

### Entry Points

| Screen | File | Route |
|--------|------|-------|
| Orders list | `components/orders/orders-list-panel.tsx` | `/purchase/orders` |
| Create PO | `components/orders/order-create-panel.tsx` | `/purchase/orders/new` |
| PO detail | `components/orders/order-detail-panel.tsx` | `/purchase/orders/[id]` |

### Create Flow

1. User fills supplier, branch, date on order-create-panel.
2. Lines added one by one (item search + qty + price).
3. "Confirm" action calls `PUT /tenant/purchase/orders/:id/confirm`.
4. If total > threshold: UI must prompt for manager PIN + approvedBy (current state of this prompt: check order-create-panel for implementation).

### PO List Filtering

The `list()` service method filters `sourceType = 'manual'` (line 519 of purchase-orders.service.ts) so hidden `DP-` POs never appear.

---

## Direct Purchase UI

### Entry Point

| Screen | File | Route |
|--------|------|-------|
| Direct purchase form | `components/direct/direct-purchase-panel.tsx` | `/purchase/direct` |

### Form Structure

```
Header:
  - Supplier (combobox + inline quick-add dialog)
  - Branch (select)
  - Purchase date (date input, defaults today)
  - Supplier invoice # (optional text)

Lines:
  - BillLineSearch (item search with barcode stub)
  - Per-line: qty, unit picker (base or pack), unit cost
  - Trash icon to remove

Totals:
  - Subtotal only (no tax row shown — tax is backend-computed)

Settlement:
  - Toggle: Paid | Credit
  - If Paid: method (cash / bank transfer) + date + bank account select
  - If Credit: optional due date

Notes: optional

Actions: Cancel (with unsaved-changes confirm dialog) | Save
```

### Key UX Details

- `idempotencyKey` generated on mount via `crypto.randomUUID()` (ref, not state — stable across re-renders).
- "New entry" button rotates the key and resets all state.
- `beforeunload` handler warns if lines are present and form not saved.
- On success: shows a success screen (bill number + "View Bill" link + "New Entry" button).
- Quick-add supplier dialog: name (required) + phone (optional) → `POST /tenant/purchase/suppliers`.
- Barcode scan button is present but stubbed ("coming soon" toast).

### Validation (client-side)

| Check | When |
|-------|------|
| Supplier required | On submit (if not selected, `supplierTouched` shows error) |
| Branch required | Same |
| At least one line | canSubmit guard |
| Each line: qty > 0 and cost > 0 | `isPositiveDecimal()` check per line |
| Payment date valid if paid | `isValidDateOnly()` |
| Bank account selected if bank transfer | `bankSelectionMissing` flag |

Source: `direct-purchase-panel.tsx:270–293`.

---

## UOM in Direct Purchase

- `LineUnitPicker` component is used per line (same as sales/POS).
- If item has pack units: shows pack unit dropdown.
- If no pack units: shows base unit label (text only).
- `computeBaseQty()` is called at submit time to convert entered qty to base units before sending to API.

---

## Gaps Visible in Frontend

1. **No tax display:** Totals section shows subtotal = total (no tax row). Tax is backend-computed but the user never sees the tax breakdown in the direct purchase form.
2. **No warehouse selection:** User cannot choose per-line receiving warehouse.
3. **No approval gate UI:** No manager PIN prompt in the direct purchase form.
4. **No reversal/void:** No action to reverse a submitted direct purchase from any UI.
5. **Invoice scan stubbed:** The "Upload Invoice" button shows a "coming soon" toast — Mira invoice scan is not wired to the direct purchase form.

**REQUIRES (design note):** Wiring Mira invoice scanner to direct purchase would enable the ideal shopkeeper flow: photograph the supplier invoice → Mira extracts lines, costs, supplier reference → user confirms → one save. This is the AI-first mandate applied to intake.
