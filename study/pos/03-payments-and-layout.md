# POS Layer 2 — Payments / Tender + Phase-aware Layout

Pre-hardening audit. Read-only. 2026-06-30.

---

## Part A — Payment / Tender Integrity

### Schema: `pos_payments` (packages/db/src/schema/pos.ts:618–681)

Key columns:

| Column | Type | Notes |
|--------|------|-------|
| `method` | `posPaymentMethod` enum | `cash | card | store_credit | gift_card | custom | on_account` |
| `tenderTypeId` | uuid nullable | composite FK → `pos_tender_types` (same tenant) |
| `amount` | numeric(19,6) | gross tendered (never net of change) |
| `amountFC` | numeric(19,6) nullable | FC cash only |
| `currency` | varchar(3) | FC currency or functional |
| `exchangeRate` | numeric(18,10) nullable | required when amountFC set |
| `changeGiven` | numeric(19,6) | default 0, non-negative CHECK |
| `giftCardId` | uuid nullable | **no backing table** |
| `storeCreditId` | uuid nullable | **no backing table** |

DB CHECKs on `pos_payments`:

- `amount > 0` (line 660)
- `changeGiven >= 0` (line 661)
- `amountFC IS NULL OR (exchangeRate IS NOT NULL AND exchangeRate > 0)` (lines 663–667)

**Missing DB CHECK:** no constraint preventing `changeGiven > 0` when `method != 'cash'`.
This must be enforced purely at the service layer.

### 1. Split / Multi-tender

**Server (`pos-transactions-payments.ts`):** `validatePayments` (line 33) accepts
`readonly PaymentInput[]` — an arbitrary-length array. N rows are supported at the DB level too
(`pos_payments` cascade-inserts one row per element). The server correctly computes
`nonCashTotal`, `remainingForCash`, and `cashTendered` across all rows (lines 41–79).

**Frontend (`payment-modal.tsx`):** SINGLE tender only. `handleComplete` (line 137) builds exactly
one-element `payments` array:

```tsx
// lines 145–154
const payments: readonly SyncPaymentInput[] = isCashTender
  ? [{ method: "cash", amount: normalizedTendered, ... }]
  : [{ method: "card", amount: grandTotalStr, reference: cardRef.trim(), ... }];
```

There is no multi-tender UI. The cashier cannot add a second row. This means split payment
(e.g. KWD 5 cash + KWD 3 KNET) is architecturally supported by the server but completely
unreachable from the current UI.

**What is needed for inline multi-tender:**
- Running "remaining" amount after each row is added
- Change is computed only on the cash row
- The PAY button is enabled only when `Σ(amounts) >= grandTotal`
- A row list (method, amount, [reference]) with an "Add another tender" affordance

### 2. `changeGiven` on non-cash tenders

**DB:** No `CHECK(method = 'cash' OR changeGiven = 0)`. The schema comment says
"cash change returned (cash only)" but this is documentation, not enforcement.

**Server:** `validatePayments` (line 52–56) checks that non-cash total does not exceed the grand
total (`nonCashTotal.greaterThan(total)` → throw). This prevents card overpayment, but only as
a sum-level guard. The `changeGiven` column is always written as `"0"` for non-cash rows
(lines 72–79 — only the `p.method === "cash"` branch sets a non-zero value), so the service
is correct in practice. However, there is no explicit `if method != 'cash' then changeGiven = 0`
assertion before the insert; it relies on the conditional logic never being wrong.

**Risk:** No DB CHECK. If the branch logic in `validatePayments` ever regresses or if
`normalizeOfflinePayments` (line 112) is extended carelessly, a card row could receive
non-zero `changeGiven` and persist silently.

### 3. Overpayment

**Server:** `validatePayments` (line 59–61):

```ts
const sum = payments.reduce((acc, p) => acc.plus(p.amount), new Decimal(0));
if (sum.lessThan(total)) throw UnprocessableEntityException("Payments do not cover the total");
```

Over-payment is *allowed* (no upper-bound check on total sum). The server computes change
correctly on cash rows. For non-cash, `nonCashTotal.greaterThan(total)` throws (line 53–57),
so a card over-payment is blocked.

**The invariant: `Σpayments − change == grandTotal`** — not asserted explicitly. What IS
enforced: `Σ(non-cash) ≤ grandTotal` AND `Σ(all) ≥ grandTotal`. The change calculation
`changeRemaining = cashTendered − remainingForCash` (line 70) produces `Σpayments − change ==
grandTotal` arithmetically, but there is no post-validate assertion to prove it.

### 4. `gift_card` / `store_credit` — stub tenders

**FE:** The `FALLBACK_TENDERS` list (payment-modal.tsx:34–51) contains only `cash` and `card`.
The `tenders` prop is populated from the offline catalog (`TenderTypeRow[]`). `TenderTypeRow`
maps to `pos_tender_types.method` which can be `gift_card` or `store_credit` if a tenant
creates such a tender type.

**Question:** are these methods reachable? Yes — if an admin creates a tender type with
`method = 'gift_card'`, it appears as a tab in `payment-modal.tsx` and the cashier can select
it. The FE will send `method: "gift_card"` in the payments array (via the "card" branch —
`isRefTender` is true, so it requires a reference string and sends `amount: grandTotalStr`).

**Server-side blocking:** `validatePayments` does NOT block `gift_card` or `store_credit`. The
only special handling is the non-cash overpayment guard. No balance lookup is performed. A
gift_card row writes to `pos_payments.giftCardId = null` (the stub column), charges the
customer, and credits `accounts.receivable` for any on-account portion, with no card
charge and no deduction from any balance ledger. This is **financially incorrect and
silently wrong.**

**Required fix:** The service must reject `gift_card` and `store_credit` methods until the
balance tables are built. Either block in `payTransactionSchema` (`z.enum(["cash","card","on_account"])`)
or add an explicit guard at the top of `validatePayments`:

```ts
const LIVE_METHODS = new Set(["cash", "card", "on_account"]);
for (const p of payments) {
  if (!LIVE_METHODS.has(p.method)) {
    throw new BadRequestException(`Payment method "${p.method}" is not available yet`);
  }
}
```

### 5. Cash Rounding

**Shared library (`packages/shared/src/pos-money/currency.ts`):**
`roundCashAmount(amount, currencyCode)` implements denomination rounding:
- KWD/BHD → 5 fils (0.005)
- AED → 25 fils (0.25)
- SAR → 0.05

**Service (`pos-transactions.service.ts:671–674`):**
> "The stored grandTotal is EXACT… Cash rounding is advisory only."

`roundedCashDue` is returned in `TransactionDetailResponse` as an advisory field (line 1000–1004).
The stored `grandTotal` is never rounded. Change computation uses the exact total.

**FE `payment-modal.tsx`:** does NOT call `roundCashAmount`. The cashier types or quick-tenders
the exact `grandTotalStr`. There are no denomination quick-buttons (e.g. "KWD 5", "KWD 10").

**Gap:** `roundedCashDue` exists on the API response for a completed transaction (back-office view)
but is never surfaced to the cashier during the payment flow. The cashier can only see the raw
numeric total; there is no "tender KWD 0.500 → change KWD 0.005" shortcut for sub-denomination
rounding.

### 6. Foreign-Currency Tender

**Schema:** `amountFC` + `exchangeRate` columns exist with a DB CHECK
(`amountFC IS NULL OR (exchangeRate IS NOT NULL AND exchangeRate > 0)`).

**DTO validation (`pos-transactions.dto.ts:208–215`):**
```ts
.refine((v) => v.amountFC === undefined || v.exchangeRate !== undefined, {
  message: "amountFC requires exchangeRate",
})
```

**FE `payment-modal.tsx`:** there is NO FC entry UI. The modal collects only local-currency
cash tendered (or card reference). `amountFC` is never sent by the FE.

**Status:** FC tender is schema-ready and server-validated but completely unimplemented in the
UI. Currently unreachable (no cashier path to enter amountFC).

---

## Part B — Phase-aware Layout Architecture

### Current Layout (as-built)

**`register-shell.tsx`** renders a fixed horizontal split:

```
[ HEADER ]
[ STALE/SYNC BANNERS ]
[ cart section | PanelSplitter | catalog section ]   ← flex row, min-h-0 flex-1
[ ActionBar ]
[ overlay: PaymentModal (Dialog) | VoidDialog | ... ]
```

The cart section width is driven by `cartFraction` from `pos-layout-store` (persisted in
localStorage, default 60%). The `PanelSplitter` component is a draggable divider (pointer events,
RTL-aware, double-click resets).

**Payment is triggered** by `ActionBar → openOverlay("payment")` → `overlay === "payment"` →
`<PaymentModal>` mounted as a `<Dialog>` overlay. It covers the entire screen.

**Stores:**
- `pos-store.ts`: `overlay: PosOverlay` (one of `none | payment | recall | void | close | receipt | cash_movement`). No phase concept.
- `pos-layout-store.ts`: `cartFraction` only. No phase concept.

### Target: Phase-aware Layout (LOCKED)

Two phases, zero modal for payment:

| Phase | Screen area | What renders |
|-------|-------------|-------------|
| **BUILD** | Full screen | catalog + cart with totals + PAY button at bottom of cart |
| **SETTLE** | Cart zone (catalog dims) | inline pay surface: tender rows, quick-cash denominations, giant CHANGE DUE display |

Small screen: BUILD = catalog (cart as sheet), SETTLE = full-screen pay (catalog hidden).

---

### Component Plan

#### 1. Store changes

**Extend `pos-store.ts`:** add `phase: 'build' | 'settle'` (not persisted). Replace `overlay === "payment"` with `phase === 'settle'`. Keep the rest of the overlay system unchanged (void/recall/close/receipt/cash_movement remain modal overlays as-is).

```ts
// new fields in PosState:
readonly phase: 'build' | 'settle';
readonly enterSettle: () => void;
readonly exitSettle: () => void;
```

`enterSettle` sets `phase: 'settle'` (and can open the cart sheet on small screens).
`exitSettle` sets `phase: 'build'`.

**`pos-layout-store.ts`:** remove `cartFraction`, `setCartFraction`, `resetLayout`.
Replace with fixed breakpoint constants:

```ts
// lg+: cart = 40%, catalog = 60% (BUILD); cart = 40%, catalog dims (SETTLE)
// <lg: catalog full, cart sheet
```

No persisted fraction; no draggable splitter.

#### 2. Delete / repurpose

- **`PanelSplitter`** (`panel-splitter.tsx`): delete entirely. Remove from `register-shell.tsx`.
- **`PaymentModal`** (`payment-modal.tsx`): keep its logic (multi-tender engine, numeric keypad,
  card reference); **remove the `<Dialog>` wrapper** and extract inner content to a new component.

#### 3. New components

**`PaySurface`** (`components/pay-surface.tsx`):
- Rendered inline inside the cart column when `phase === 'settle'`
- Replaces the Dialog content of `PaymentModal`
- Contains:
  - Running "remaining" display (grandTotal minus payments entered so far)
  - Tender row list (method select + amount field + reference field per row)
  - "Add tender" affordance
  - Quick-cash denomination buttons (KWD: 0.5, 1, 5, 10, 20; configurable per currency)
  - Giant CHANGE DUE display (shows only when cash sum covers total)
  - COMPLETE SALE button (full-width, ink fill)
  - BACK / cancel link (returns to BUILD, does NOT clear cart)
- Accepts same props as current PaymentModal minus `onCancel` (replaced by `exitSettle`).
- Multi-tender state is local (array of `{ method, amount, reference }`).

**`CartColumn`** (rename/extend `cart-panel.tsx`):
- BUILD mode: renders lines + totals + PAY button (moves PAY from ActionBar into bottom of cart column).
- SETTLE mode: renders `<PaySurface>` replacing the lines/totals area.
- Small screen SETTLE: unmount catalog section entirely, make CartColumn full-screen.

#### 4. Catalog dimming

In `register-shell.tsx`, when `phase === 'settle'`:
- Apply `aria-hidden` + `pointer-events-none opacity-50` to catalog section.
- Keep catalog mounted (last-second add: cashier can click through dim → triggers `exitSettle` 
  → returns to BUILD with item added). OR: add a thin "add item" affordance on the dim overlay
  that fires `exitSettle()` + focuses search.

#### 5. ActionBar changes

- **Remove PAY button from `action-bar.tsx`** (it moves to the cart column footer in BUILD mode).
- Or keep a secondary PAY shortcut in ActionBar as a text-only link for keyboard-flow cashiers.
- ActionBar remains visible in both phases (Hold / Recall / Void / Cash Movement stay accessible).

#### 6. Keyboard shortcuts

`use-pos-shortcuts.ts`: `onPay` currently calls `openOverlay("payment")`. Change to call
`enterSettle()`. `onCancel` while `phase === 'settle'` calls `exitSettle()`. No other changes needed.

#### 7. Receipt dwell

After `completeSale()` succeeds: call `showLocalSale(...)` which sets `overlay: 'receipt'`
(unchanged). `PaySurface` calls `exitSettle()` then `showLocalSale(...)`. The receipt Dialog
renders on top as now.

#### 8. Offline / sync

No changes needed. Cart engine, sale queue, sync engine are untouched. `PaySurface` calls the
same `useCompleteSale()` hook.

#### 9. Small screen sheet (BUILD phase)

The existing pattern of cart-as-sheet on small screens is not yet implemented (current layout
uses lg: only to show the splitter; on small screens the cart panel simply fills `flexBasis 60%`
which is often off-screen or cramped). The phase rebuild is an opportunity to fix this properly:
- `<lg`: BUILD renders catalog full-width with a floating cart FAB / bottom bar.
- SETTLE: full-screen `<PaySurface>` over catalog.

---

## Payment Integrity Invariants (for future maintainers)

1. **Balance:** `Σpayments(amount) − changeGiven(cash row) == grandTotal` (arithmetic guarantee from `validatePayments`; no explicit assertion).
2. **Non-cash ≤ total:** card/store_credit/gift_card cannot exceed grandTotal (server throws).
3. **Cash change:** attributed to first cash row only (single-drawer model).
4. **Card always exact:** FE sends `amount: grandTotalStr`; no change.
5. **`changeGiven` only on cash:** enforced by conditional logic in `validatePayments`, NOT by DB CHECK.
6. **Gift card / store credit:** schema-ready but no balance table exists. Must be blocked at server until built.
7. **FC tender:** schema-ready but no UI exists. Advisory only.
8. **Rounding:** advisory (`roundedCashDue` on completed transaction response). Stored amounts are always exact. Cash over/short at shift close absorbs physical denomination gaps.
9. **Offline:** `normalizeOfflinePayments` skips under-coverage guard (sale already happened); gap is flagged in `totalsMismatch.paymentGap`.

---

## Summary of gaps found

| # | Area | Severity | Finding |
|---|------|----------|---------|
| 1 | DB | HIGH | No `CHECK(method = 'cash' OR change_given = 0)` on `pos_payments` |
| 2 | Server | CRITICAL | `gift_card` and `store_credit` methods are accepted and written with no balance validation |
| 3 | Server | LOW | No post-validate assertion that `Σpayments − change == grandTotal`; relies on arithmetic branch correctness |
| 4 | FE | HIGH | Payment modal is single-tender only; no multi-tender UI exists |
| 5 | FE | MEDIUM | No quick-cash denomination buttons (cashier must type amount) |
| 6 | FE | MEDIUM | `roundedCashDue` from server response is never shown to cashier during payment |
| 7 | Layout | HIGH | PaymentModal is a Dialog overlay, not an inline phase; violates locked design target |
| 8 | Layout | HIGH | `PanelSplitter` must be removed; layout must be fixed-ratio per breakpoint |
| 9 | Layout | MEDIUM | No BUILD/SETTLE phase concept in store |
| 10 | FE | LOW | No FC cash entry UI despite schema + server support |
