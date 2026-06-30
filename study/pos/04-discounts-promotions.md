# POS Layer 3 — Discounts & Promotions: Pre-Hardening Audit

**Audit date:** 2026-06-30  
**Branch audited:** main (L2 pay-surface changes in working tree)  
**Scope:** line discount, order discount, approval gate, promotions/coupons, GL/tax correctness

---

## 1. Line-Level Discount — How It Works Today

### Entry point (frontend)
`apps/web/src/features/pos/components/cart-line-row.tsx:190–198`

The discount column is a `<button>` displaying the current `line.discountAmount`. Tapping it opens a `NumericKeypad` (line 269–278) with `decimals={dp}`, `min={0}`, `allowZero`. The cashier enters an **absolute amount** in the currency. There is no percentage mode and no cap enforced in the UI.

```tsx
// cart-line-row.tsx:190
<button
  type="button"
  ...
  onClick={() => setOpenField("discount")}
  dir="ltr"
>
  {fmt(line.discountAmount, locale, currency)}
</button>
```

### Cart engine (frontend)
`apps/web/src/features/pos/offline/cart-engine.ts:297–305`

```ts
export function setLineDiscount(state, lineId, discountAmount): CartState {
  assertDecimal(discountAmount, "discountAmount");
  return replaceLine(state, lineId, (line) => ({ ...line, discountAmount }));
}
```

Only validates non-negative decimal. No cap. No approval check. Immutable state update.

### Promotion auto-seeding
When an item is added (`addItem`, cart-engine.ts:158), `autoDiscountAmount` from `resolvePromoForLine` is seeded onto `discountAmount` (line 233):
```ts
discountAmount: new Decimal(perUnitDiscount).times(initialBaseQty).toString(),
```
On merge (qty increment) the discount scales with base qty (line 221):
```ts
const discountAmount = new Decimal(perUnitDiscount).times(nextBaseQty).toString();
```

### Backend storage
`packages/db/src/schema/pos.ts:465`
```
discountAmount: numeric("discount_amount", MONEY).default("0").notNull()
```
CHECK constraint: `>= 0`. No upper bound. No `approvedById` column on lines for discounts (only `priceOverrideById` at line 463).

### How it is stored: absolute amount only, not %

The `discountAmount` on `pos_transaction_lines` is always an **absolute monetary amount**. Percentage discounts (from promos) are resolved to an absolute figure in the promo-engine before being written. No percentage column exists.

---

## 2. Order-Level Discount — STATUS: MISSING

`pos_transactions.discountTotal` (schema line 342) is a **DERIVED** read-only aggregate: it is computed by `recompute()` as `Σ(line.discountAmount)`. It is never an entry point — there is no way to apply a discount at the cart header level.

Confirmation points:
- `CartState` (cart-engine.ts:74–78): no `orderDiscount` field
- `CartTotals` component (cart-totals.tsx): displays `discountTotal` but there is no input to set one
- `SyncTransactionInput` (sync-payload.types.ts:68): has `discountTotal` only as a computed total field
- `pos_transactions` schema: no `order_discount_amount` or equivalent column

**This is a genuine gap.** Order-level ("whole-basket") discounts must be modelled as a virtual extra line or a header field that feeds into the totals engine.

---

## 3. Discount Approval Gate — STATUS: NONE EXISTS

### What exists
- `pos_transaction_lines.priceOverrideById` (schema:463) — stamps who overrode the unit price. Used with `pos.transaction.price-override` permission.
- `PinVerificationService` (`apps/api/src/approval-pin/`) — used for cash movements (permission `pos.cash.approve`).
- No `approvedById` column on `pos_transaction_lines` for discounts.
- No `maxDiscountPercent` or any threshold config on `pos_registers` or any settings table.
- No approval logic anywhere in the discount write path (frontend or backend).

### Gap summary
A cashier can grant an arbitrarily large discount with zero approval or audit trail. A 100% discount is syntactically valid (passes `assertDecimal`; the only DB check is `>= 0`).

### Proposed design
A tenant/register configurable threshold: `maxDiscountPercentWithoutApproval` (e.g. on `pos_registers` or a new `pos_register_settings` JSONB column). When the cashier enters a per-line discount that pushes `discount/lineGross > threshold`, the engine should:
1. Flag the line as requiring approval (local cart state).
2. Show an inline `PinVerificationService`-backed approval prompt (same pattern as cash pay-out).
3. Stamp `discountApprovedById` on the line row in the DB.
4. The backend re-derives the effective discount % at `addLine`/`updateLine` and enforces the same gate server-side.

Permission: `pos.discount.approve` (new, parallels `pos.cash.approve`).

---

## 4. Promotions & Coupons

### Promotions (auto-apply — EXISTS)
`packages/shared/src/pos-money/promo-engine.ts`

The `resolvePromoForLine` function resolves the best applicable promotion (lowest effective price, tie-broken by promo id) from the `PromoDefinition[]` cache. Types: `percent_off`, `fixed_price`, `amount_off`. Targets: specific items or categories.

**Lifecycle:**
1. On add-item in `use-cart-actions.ts:96–111`, `loadPromotions()` fetches from server (if online) and replaces the IndexedDB `promotions` store via `replacePromotions`.
2. `resolveItem` (`lib/resolve-item.ts:66–86`) calls `resolvePromoForLine` and seeds the result as `autoDiscountAmount` onto the `ResolvedCatalogItem`.
3. Cart engine stamps it as `discountAmount` on the new line.

The promo resolution is **identical online and offline** — single money path, same shared engine.

**What is NOT persisted:** The `appliedPromotionId`/`appliedPromotionName` from `PromoResult` are resolved but never written to `pos_transaction_lines`. There is no `applied_promotion_id` column. No promo redemption count is tracked.

**Promo catalog sync:** Promotions are fetched from `/tenant/inventory/promotions/active` (`promotions-api.ts:32`). They are NOT part of the offline catalog sync snapshot (not in `CatalogSnapshotResponse` — the catalog service has no promo section). The `loadPromotions()` best-effort fetch happens per add-item action.

### Coupons — STATUS: NONE
- No coupon-code UI exists anywhere in the POS frontend.
- No `coupon_code`, `promo_uses`, or redemption table in the DB schema.
- No coupon entry path in sync payloads.
- **Recommendation: defer coupon-code entry to a later layer.** L3 should only add: (a) order-level discount, (b) discount approval gate, (c) `appliedPromotionId` stamping on lines. Coupons require schema work (coupon table, redemption tracking) that is not commensurate with the L3 hardening goal.

---

## 5. GL & Tax Correctness

### Recompute (backend)
`apps/api/src/pos/transactions/pos-transactions-totals.ts:52–120`

Tax is calculated on the **net (post-discount) base**, not gross:
```ts
const gross = new Decimal(line.quantity).times(line.unitPrice);
const net = Decimal.max(gross.minus(line.discountAmount), 0);  // line 65
```
Net is passed to `taxCalc.calculate()`. Header totals:
```ts
const grandTotal = subtotal.minus(discountTotal).plus(taxTotal);  // line 109
```

**Tax correctness: CORRECT.** VAT is computed on the discounted net, not the gross.

### GL events
`apps/api/src/pos/transactions/pos-transactions-events.ts`

At `pos.transaction.completed`:
- **DR Cash/Card/AR** = net payments received
- **CR Revenue (5100)** = `grossRevenue = subtotal` (full pre-discount)
- **DR Sales Discounts (4300)** = `discountTotal` (contra-revenue, separate line)
- **CR Output VAT** = tax computed on net base

This matches the pattern used by the Sales module. Gross revenue and discount expense are both visible in GL reports. The net revenue reported is `subtotal - discountTotal` = correct.

Void reversal (`buildVoidCompletedJePayload`, line 258–273) reverses both the gross revenue AND the discount contra-revenue line correctly.

**GL correctness: CORRECT for current line-discount path.**

### Gap with order-level discount
Once order-level discount is added, the recompute must aggregate it into `discountTotal` so the GL event picks it up automatically (no change to the event builder needed — it just reads `txn.discountTotal`).

---

## Gaps Summary

| # | Gap | Severity |
|---|-----|----------|
| G1 | No order-level (header) discount | HIGH — cashiers routinely give basket-wide promos |
| G2 | No discount approval threshold / `approvedById` audit trail on lines | HIGH — any cashier can give 100% discount silently |
| G3 | `appliedPromotionId` not stamped on line (no promo redemption tracking) | MEDIUM — can't report on which promos drive revenue |
| G4 | Promo sync not part of catalog snapshot — per-add-item fetch only | LOW — works offline from last-synced cache |
| G5 | No coupon-code support | DEFERRED — requires separate schema work |

---

## Architecture Notes for L3 Build

**Where to add order-level discount:**
- Add `orderDiscount: string` to `CartState` (cart-engine.ts).
- Add `setOrderDiscount(state, amount)` engine mutator.
- `computeTotals` distributes it across lines proportionally OR treats it as a synthetic extra line (prefer: pass it to `computeCartTotals` in `@zerupt/shared` as an additional header amount — check shared API).
- `CartTotals` component gets an editable discount field (tappable, opens NumericKeypad).
- Sync payload and backend `SyncTransactionInput` need an `orderDiscountAmount` field, applied before line totals in `pos-sync.service.ts`.

**Where to add approval gate:**
- `pos_registers` JSONB settings (or new column) `maxDiscountPctWithoutApproval` (default: 100 = no gate).
- Frontend: `use-cart-actions.ts` `setLineDiscount` checks `discount / (qty × unitPrice) > threshold`; if yes, sets a pending-approval flag in cart state.
- `cart-line-row.tsx` shows an inline PIN prompt (reuse the same approval UI pattern as cash movement dialog).
- Backend: `addLine` / `updateLine` in `pos-transactions.service.ts` re-derives the effective %, calls `pinVerification.verifyApproval(tenantId, { approvedBy, pin, requiredPermission: "pos.discount.approve" })`.
- New column: `pos_transaction_lines.discount_approved_by_id uuid` (migration required).
