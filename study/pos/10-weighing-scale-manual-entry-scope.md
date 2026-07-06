# POS: Weighing Scale Manual Entry - Scope Document

**Date:** 2026-06-30  
**Status:** Scoped, not implemented  
**Trigger for implementation:** First grocery / produce / butcher / sweets customer onboards.

---

## 1. What exists today

`apps/web/src/features/pos/lib/weight-barcode.ts` parses GS1 in-store EAN-13 barcodes where a scale prints the weight directly onto the label (application flags `"1"` for kg, `"2"` for lb). The parsed `itemCode` (5-digit PLU) + `weightKg` flow into `addWeightItem` in `use-cart-actions.ts`, which looks up the item by PLU barcode, adds it at qty=1, then atomically re-commits the line at the parsed weight as the quantity.

This scan path works well when a scale prints a barcode label. It does NOT help when the cashier weighs on a standalone (non-label-printing) scale and must type the weight manually.

---

## 2. What marks an item as "weighable"

### Current state: no flag exists

The `inventoryItems` schema (`packages/db/src/schema/inventory-items.ts`) has a `weightKg` column, but it represents the item's own physical weight for landed-cost allocation (e.g. freight split). It is NOT a "sold by weight" flag.

There is no `soldByWeight`, `weighable`, or pricing-by-weight boolean anywhere in the schema, the POS catalog resolver, `EngineCartLine`, or `CartViewLine`. The barcode scan path infers weighable-ness purely from the scanned barcode format (starts with `"2"`, passes EAN-13 checksum) rather than from item metadata.

### What is needed

A new boolean flag on the item: `soldByWeight: boolean` (or equivalent). This requires:

- A DB migration adding a `sold_by_weight` column to `inventory_items` (tenant schema).
- Backend: expose the flag through the item-search/catalog API used by the POS resolver.
- Frontend: carry it through the POS item-lookup result, `EngineCartLine`, and `CartViewLine` to gate the UI control.

This is a non-trivial backend dependency. It is NOT a trivial one-liner.

---

## 3. The UI control

### Where it lives

The qty stepper in `cart-line-row.tsx` lives in a 7rem column (grid position 2). For a `soldByWeight` line, the stepper would be replaced by a weight input badge below the item name (same slot used today for the pack-unit picker on lines with pack units).

### Proposed interaction pattern

When a cart line has `soldByWeight = true`:

- Replace the integer stepper (Minus/qty-display/Plus) with a tappable weight display: `"0.000 kg"`.
- Tapping opens `NumericKeypad` configured for 3 decimal places, `min=0.001`, `max=999.999`, with the title "Enter weight (kg)" / "أدخل الوزن (كغ)".
- On confirm, call `onChangeQty(line.id, weightKg)` - the same `engineChangeQuantity` path used by the barcode flow; no new engine logic required since `quantity` already accepts decimal strings.
- The line total is then: `unitPrice (price/kg) × quantity (kg) = lineTotal`. This is correct without any additional pricing logic because `computeCartTotals` in `@zerupt/shared` multiplies `unitPrice × quantity` generically.

### Validation

| Rule | Value |
|------|-------|
| Type | Positive decimal |
| Min | 0.001 kg |
| Max | 999.999 kg (configurable via constant) |
| Decimal places | 3 (gram-level precision) |
| Empty/zero | Reject with inline error, do not commit |

### i18n

- `NumericKeypad` title: `pos.cart.enterWeight` (en: "Enter weight (kg)", ar: "أدخل الوزن (كغ)").
- Weight badge label: `pos.cart.weightKg` (en: "kg", ar: "كغ"), rendered with `dir="ltr"` so the number stays LTR in Arabic layout.
- Error key: `pos.cart.weightRequired`.

### Offline safety

`engineChangeQuantity` is a pure function that runs offline on the local cart store. No new offline concern is introduced. The weight is stored as the line `quantity` in the persisted cart, identical to how a scanned weight is stored today.

### Defensive UX notes

- If a `soldByWeight` line has `quantity = "1"` (default on add), show a visual indicator that the weight has not been entered yet (e.g. amber badge "Weight needed" / "يجب إدخال الوزن"). Prevent payment from proceeding until all `soldByWeight` lines have `quantity > 0.001`.
- Do not allow the stepper increase/decrease buttons on `soldByWeight` lines; integers have no meaning for these items.

---

## 4. Pricing confirmation

`computeCartTotals` (in `@zerupt/shared`, consumed by `use-cart-view.ts`) multiplies `unitPrice × quantity` for each line. Since `quantity` is already a decimal string (it is a `numeric` column, not an integer), selling by weight requires zero changes to the totals engine. The existing barcode scan path already exercises this code path (`addWeightItem` calls `engineChangeQuantity` with a fractional weight, e.g. `"0.450"`).

For weight-sold items the catalog price IS the per-kg price. No additional pricing field is needed provided the item is set up with a per-kg selling price in the item master.

---

## 5. Effort estimate

| Component | Work |
|-----------|------|
| DB migration: `sold_by_weight` boolean on `inventory_items` | Small |
| API: expose flag in item-search response + catalog resolver | Small |
| Frontend: carry flag through `EngineCartLine` + `CartViewLine` | Small |
| Frontend: gate UI in `cart-line-row.tsx` (replace stepper with weight input) | Small |
| Frontend: block payment if any `soldByWeight` line has no weight | Small |
| i18n: 3-4 keys en+ar | Trivial |
| Tests: unit (engine + UI) | Small |

**Overall: Medium** - each individual piece is small, but the flag touches 3 layers (DB, API, frontend) making it more than a trivial one-day addition. Realistically 1.5 to 2 days of careful implementation including tests.

---

## 6. Recommendation

**Defer until first grocery / produce / butcher / sweets customer onboards.**

### Rationale

The launch ICP for June 2026 is general MENA/India/SEA small retail (electronics, auto parts, fashion, general merchandise). None of these verticals sell by weight. The only weighing verticals are grocery, produce, butcher shops, and sweets counters. None of the founding 50 target accounts are in those verticals.

The barcode scan path (existing) already covers the higher-volume case for any early weighing-vertical customer who uses a label-printing scale. Manual entry is an edge case within an edge vertical.

The `soldByWeight` backend flag also does not exist today, which means any implementation requires a DB migration and API surface change, not just a frontend tweak.

### Trigger

Implement this feature when:

> A grocery, produce, butcher, or sweets shop signs up and confirms they use a standalone scale without label printing.

At that point the effort is well-justified and the scope above can be executed directly.

---

## 7. Files affected when implementing

| File | Change |
|------|--------|
| `packages/db/src/schema/inventory-items.ts` | Add `soldByWeight` boolean column |
| `packages/db/src/migrations/XXXX_sold_by_weight.sql` | Generated migration |
| `apps/api/src/modules/pos/pos-catalog.service.ts` | Expose flag in item-lookup response |
| `apps/web/src/features/pos/offline/types.ts` | Add `soldByWeight` to offline item type |
| `apps/web/src/features/pos/offline/cart-engine.ts` | Carry `soldByWeight` on `EngineCartLine` |
| `apps/web/src/features/pos/lib/use-cart-view.ts` | Carry `soldByWeight` on `CartViewLine` |
| `apps/web/src/features/pos/components/cart-line-row.tsx` | Gate stepper vs weight keypad |
| `apps/web/src/features/pos/components/cart-panel.tsx` | Block payment guard |
| `apps/web/messages/en.json` + `ar.json` | 3-4 new translation keys |
