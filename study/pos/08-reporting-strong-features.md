# POS Layer 7 — Reporting + Strong Features

Pre-hardening audit. Read-only. 2026-06-30.

---

## 1. Reporting — What Exists vs What Is Missing

### 1.1 General Reports Module

The reports module (`apps/api/src/reports/`, `apps/web/src/features/reports/`) is mature and
reusable. Relevant existing reports:

| Report | API endpoint | POS data used | Filter support |
|--------|-------------|---------------|----------------|
| Daily Sales | `GET /tenant/reports/daily-sales` | `pos_transactions` + `pos_payments` | dateFrom/dateTo, branchId only |
| Top Sellers | `GET /tenant/reports/top-sellers` | `pos_transaction_lines` | dateFrom/dateTo, branchId, sortBy, limit |

`DailySalesRow` already contains:
- `posTransactions: number` (count)
- `posSales: string` (gross)
- `paymentBreakdown: Record<string, string>` (keyed by payment method)
- `itemsSold: string`
- `avgTransactionValue: string`

These two reports cover "daily revenue" and "top items" adequately for back-office use.
**No registerId or cashierId filter exists on either.** A store owner cannot see "Register 2 only"
or "Cashier Ahmed only" from these reports.

### 1.2 Z/X Report per Shift

`GET /tenant/pos/shifts/:id/z-report` and `x-report` — EXISTS and detailed.

`ZReportResponse` (`apps/api/src/pos/shifts/pos-shifts.dto.ts:113–156`) contains:

```ts
readonly salesSummary: ZReportSalesSummary;  // grossSales, voidedSales, netSales, txCount
readonly paymentBreakdown: Readonly<Record<string, string>>;  // by method
readonly taxCollected: string;
readonly taxLines: readonly ZReportTaxLine[];
readonly cashSummary: ShiftCashSummary;
readonly cashReconciliation: ...  // null until closed
readonly itemsSold: string;
readonly reportType: "z_report" | "x_report";
readonly cashierId: string;
```

Payment-method breakdown EXISTS at the per-shift level. The Z-report print view
(`apps/web/src/features/pos/components/z-report-print-view.tsx:151–154`) renders it.

### 1.3 What Is Missing — POS Reporting Gaps

| Missing feature | Gap description |
|----------------|-----------------|
| **Sales-by-hour** | No hourly breakdown exists anywhere. The daily-sales service uses `date` grouping only; no `DATE_TRUNC('hour', completedAt)` path. |
| **Z-history list** | `PosShiftsController` has only `current`, `:id`, `:id/z-report`, `close`. No `GET /tenant/pos/shifts` list/paginate endpoint. The back-office cannot see past shifts or browse Z-history for a register. |
| **Cashier performance** | No cross-shift cashier aggregate. Would require a query grouping `pos_transactions` by `cashierId` over a date range, joining `pos_shifts` for shift count. |
| **Register filter on existing reports** | Daily-sales and top-sellers only filter by branchId. A manager with 3 registers at one branch cannot drill to a specific till. |

### 1.4 Design: New Endpoints Needed

**A. Z-History list** — add to `PosShiftsController`:

```ts
// GET /tenant/pos/shifts?registerId=&dateFrom=&dateTo=&page=&limit=
@Get()
@RequiresPermission("pos.session.read")
async list(@Query(...) query: ListShiftsQuery): Promise<PaginatedShifts>
```

Response: `{ id, registerId, registerCode, cashierId, status, openedAt, closedAt, netSales, shiftNumber }[]`.
No migration needed — all data is in `pos_shifts` + `pos_transactions`.

**B. Sales-by-Hour** — add to reports module:

```ts
// GET /tenant/reports/pos-hourly-sales?dateFrom=&dateTo=&registerId=&cashierId=&branchId=
```

SQL: `DATE_TRUNC('hour', pos_transactions.completed_at AT TIME ZONE tenant_tz)` GROUP BY.
Returns `{ hour: 0..23, transactionCount, netSales, avgTicket }[]`.
No migration. Uses existing `pos_transactions` + `pos_registers` for register/branch join.

**C. Cashier Performance** — add to reports module:

```ts
// GET /tenant/reports/cashier-performance?dateFrom=&dateTo=&registerId=&branchId=
```

Returns `{ cashierId, shiftCount, transactionCount, grossSales, voidCount, avgTicket, itemsSold }[]`.
No migration. Query: GROUP BY `cashierId` over `pos_transactions JOIN pos_shifts`.

**D. Register filter on existing reports** — small DTO extension:

- `daily-sales.dto.ts`: add `registerId: z.string().uuid().optional()`
- `top-sellers.dto.ts`: add `registerId: z.string().uuid().optional()`
- Service layer: add `registerId ? eq(posTransactions.registerId, registerId) : undefined` to WHERE.

**Web — POS Analytics page:**

New route `/pos/analytics` (app shell, not register shell) with tabs:
- Hourly Sales (bar chart by hour)
- Cashier Performance (data table)
- Z-History (shift list with drill-in to existing Z-report print view)

Reuse the existing `ReportShell`, `ReportDataTable`, date/branch filters from `apps/web/src/features/reports/`.

---

## 2. Cash Rounding — Status: COMPLETE (L6)

`roundCashAmount` / `hasCashRounding` live in `packages/shared/src/pos-money/currency.ts`
(landed in DEV-389-395 batch, commit `4b7c0363`).

Coverage:
- **Server**: `pos-transactions.service.ts:1000–1004` — stamps `roundedCashDue` on completed cash-sale detail response.
- **Client pay-surface**: `pay-surface.tsx:162–165` — advisory banner shown before completion for cash lines (`roundedCashAdvisory`). Auto-fills tendered amount with the rounded advisory (`pay-surface.tsx:469–470`).
- **Offline**: `sale-builder.ts:113` — change-due rounded using `roundCashAmount`.
- Currencies covered: KWD (5-fils), BHD (5-fils), AED (25-fils), SAR (5-halalas), USD (1-cent).

**Note from L2 audit (study/pos/03-payments-and-layout.md:141, 323):** `roundedCashDue` from the
server response is not shown to the cashier during the payment modal in the old `payment-modal.tsx`
flow. The `pay-surface.tsx` component (which replaced the modal) DOES handle it correctly. Confirm
the register uses `pay-surface.tsx` (it does — `PaySurface` component in `register-shell.tsx`).
**Verdict: cash rounding is done. No L7 work needed.**

---

## 3. Customer Attach at POS — Status: PARTIAL

**What exists:**
- `CartState.customerId: string | null` (`apps/web/src/features/pos/offline/cart-engine.ts:76`)
- `ActiveCartRow.customerId` / `HeldCartRow.customerId` in IndexedDB types (`offline/types.ts:187,194`)
- `sale-builder.ts:150`: `...(cart.customerId ? { customerId: cart.customerId } : {})`
- `pos_transactions.customer_id uuid` column exists in DB schema (`packages/db/src/schema/pos.ts:334-335`)
- `pos_transactions_customer_id_idx` index exists (`pos.ts:416`)

**What is missing:**
- No `customers` table in the tenant DB schema (schema comment at `pos.ts:16`: "FK them once those modules land")
- No `CustomerSearch` / `CustomerPicker` UI component anywhere in `apps/web/src/features/pos`
- No cart action `setCustomerId` in `use-cart-actions.ts`
- No customer module in `apps/api/src/`

Customer attach is a prerequisite for loyalty. Building it means: (1) customers table/module, (2) customer search at POS.

---

## 4. Loyalty Points — Status: MISSING

Zero loyalty infrastructure exists. No `customers` table, no `loyalty_accounts` or `loyalty_transactions` table, no earn/redeem logic anywhere.

### Design: MVP Loyalty

**Scope:** earn points on POS sale completion, redeem at pay-surface as a discount tender.

**GL implication (flag for accounting review):**
- Earn: DR Marketing expense / CR Loyalty liability (2XXX). Points are a deferred obligation.
- Redeem: DR Loyalty liability / CR Revenue discount. The exact accounts and whether to net from revenue or separate as an expense is a policy decision. Loyalty liability must be a real GL account.
- This is NOT a trivial accounting extension. It requires a new account (liability), two JE legs per earning event, and a redeem JE at point of use. The accounting reviewer must sign off before shipping.

**Schema additions (migration required):**

```sql
-- customers table (prerequisite)
CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name varchar(300) NOT NULL,
  name_alt varchar(300),
  phone varchar(30),
  email varchar(255),
  loyalty_points_balance numeric(19,6) NOT NULL DEFAULT 0,
  -- CHECK loyalty_points_balance >= 0
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- loyalty_transactions (earn/redeem ledger)
CREATE TABLE loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id),
  pos_transaction_id uuid,  -- null for manual adjustments
  type varchar(20) NOT NULL CHECK (type IN ('earn','redeem','expire','adjust')),
  points numeric(19,6) NOT NULL,  -- positive = earn, negative = redeem/expire
  points_value numeric(19,6),     -- monetary value of redeemed points
  gl_journal_id uuid,             -- links to accounting JE
  created_at timestamptz DEFAULT now() NOT NULL
);
```

**API additions:**
- `CustomerModule` with `GET /tenant/customers?search=&page=` (phone/name search)
- `POST /tenant/customers` (quick-create at POS)
- Loyalty earn: triggered by `pos.transaction.completed` event listener in `LoyaltyService`. Earn rate is a tenant setting (e.g. 1 point per KWD 1 spent). Posts earn JE.
- Loyalty redeem: new payment method `loyalty_points` in `PaymentMethod` enum + `payTransactionSchema`. Service validates sufficient balance, deducts, posts redeem JE.

**Frontend:**
- `CustomerAttachButton` in the cart header (search popover → attach/detach)
- `LoyaltyPointsRow` in pay-surface (shows available points, toggle to redeem, input redemption amount capped at balance value)
- Points earned shown on receipt

**Effort estimate:** LARGE — 2-3 sessions. Blocked until customers table ships. GL implications require accounting review.

---

## 5. Customer-Facing Display (Mirror View) — Status: MISSING

No second-screen concept exists. No secondary route, no BroadcastChannel/SharedWorker pattern, no secondary window management.

### Design: Read-Only Mirror Route

MVP approach: a URL the cashier opens on a second monitor/tablet. No hardware integration needed.

**New route:** `/pos/display` (separate from the register shell, no auth required — or a token-gated read-only view)

**Mechanism:** `BroadcastChannel` API (works cross-tab same origin):
- Register shell emits cart state + totals on every change via `BroadcastChannel('pos-display')`
- Mirror page subscribes and renders: item list (name, qty, line total), subtotal, tax, grand total, change due (after payment)
- On completion: "Thank you" screen with total paid + change

**API changes:** None. Pure client-side via BroadcastChannel.
**Migration:** None.
**Effort:** SMALL — 1 session. Pure frontend.

---

## 6. Weighing Scale Integration — Status: MISSING

`apps/web/src/features/pos/lib/barcode.ts` is a CODE128 **encoder** for receipt barcodes only — not a barcode parser. No EAN-13 weight-embedded barcode parsing exists.

### Design: Two-Phase Approach

**Phase 1 (MVP — this layer): EAN-13 weight-embedded barcode parsing**

GS1 EAN-13 weight barcodes: prefix `20`–`29`, digits 7–11 encode weight in grams (× 0.001 = kg) or price. Standard in MENA supermarkets (deli counters, produce, bakery).

Add `parseWeightBarcode(barcode: string): { itemBarcode: string; weight: string } | null` to a new
`apps/web/src/features/pos/lib/weight-barcode.ts`:

```ts
// EAN-13 weight-embedded: prefix 2X, check-digit validated
// digits 1-7: item identity prefix, digits 7-11: weight (5 digits, kg × 1000)
export function parseWeightBarcode(ean13: string): { sku: string; weightKg: string } | null
```

Wire into `use-barcode-capture.ts`: if `parseWeightBarcode` returns non-null, set `unitQty = weightKg` and resolve item by the 6-digit item identifier prefix.

**Phase 2 (post-MVP): USB/serial scale**

Browser Serial API (`navigator.serial`) for direct scale connection. MENA common scales: Digi, CAS, Toledo. Protocol is typically 9600 8N1. Post-MVP — hardware dependency, complex driver.

**Migration:** None for Phase 1.
**Effort Phase 1:** SMALL-MEDIUM — 1 session. Pure lib + wire-up.

---

## 7. Prayer/Break Mode (Screen Lock) — Status: MISSING

No screen-lock or "back in N minutes" overlay exists anywhere.

### Design: Overlay Component

Simple `PrayerModeOverlay` component:

```tsx
// apps/web/src/features/pos/components/prayer-mode-overlay.tsx
// Props: isActive, message (i18n key), onUnlock (PIN or any keypress)
// Renders: full-screen overlay (ink bg, citron accent), "Back in N minutes" or custom message,
//          store name, clock, unlock by clicking / PIN entry
```

State: `prayerMode: boolean` in `pos-store.ts`.
Toggle: new button in the register action bar (the "..." overflow menu or a clock icon).
Unlock: clicking the overlay (or optionally PIN-gating via the existing `ApprovalPin` flow).
**No server/DB side.** Local state only — if the page reloads, the shift is still open.

**Migration:** None.
**Effort:** SMALL — half a session.

---

## 8. Build List — Ordered by Priority

### Must-ship (reporting)

| # | Feature | Priority | File / Location | Change | Migration |
|---|---------|----------|-----------------|--------|-----------|
| R1 | Z-history list endpoint | HIGH | `apps/api/src/pos/shifts/pos-shifts.controller.ts` + service | Add `GET /` list with registerId/dateFrom/dateTo/page | No |
| R2 | Z-history page (web) | HIGH | `apps/web/src/app/[locale]/(app)/pos/shifts/page.tsx` (new) | Shift list table → drill to existing Z-report route | No |
| R3 | Register filter on daily-sales | MEDIUM | `apps/api/src/reports/daily-sales.dto.ts` + service | Add `registerId` optional filter | No |
| R4 | Register filter on top-sellers | MEDIUM | `apps/api/src/reports/top-sellers.dto.ts` + service | Add `registerId` optional filter | No |
| R5 | Sales-by-hour endpoint | MEDIUM | `apps/api/src/reports/` new `pos-hourly-sales.*` | New controller/service/DTO; register+cashier+branch filters | No |
| R6 | Sales-by-hour web page | MEDIUM | `apps/web/src/features/reports/components/reports/pos-hourly-sales-report.tsx` | Bar chart by hour; add to report-registry.ts | No |
| R7 | Cashier performance endpoint | MEDIUM | `apps/api/src/reports/` new `cashier-performance.*` | Group by cashierId over shifts+transactions | No |
| R8 | Cashier performance web page | MEDIUM | `apps/web/src/features/reports/components/reports/` | Data table; registerId/dateRange filters | No |

### Quick-win strong features (do these first)

| # | Feature | Priority | File / Location | Change | Migration |
|---|---------|----------|-----------------|--------|-----------|
| S1 | Prayer/break mode overlay | QUICK WIN | `apps/web/src/features/pos/components/prayer-mode-overlay.tsx` (new) + `pos-store.ts` + `action-bar.tsx` | Full-screen lock overlay, unlock on click | No |
| S2 | Customer-facing display mirror | QUICK WIN | `apps/web/src/app/[locale]/(pos)/pos/display/page.tsx` (new) + `register-shell.tsx` BroadcastChannel emit | Read-only cart mirror via BroadcastChannel | No |
| S3 | Weight-embedded barcode parsing | QUICK WIN | `apps/web/src/features/pos/lib/weight-barcode.ts` (new) + `use-barcode-capture.ts` | EAN-13 prefix-2X parser → auto-set qty | No |

### Large — sequence carefully

| # | Feature | Priority | File / Location | Change | Migration |
|---|---------|----------|-----------------|--------|-----------|
| L1 | Customers table + module | BLOCKER for loyalty | `packages/db/src/schema/customers.ts` (new) + `apps/api/src/customers/` module | Full CRUD + search | YES (mig) |
| L2 | Customer attach UI at POS | Depends on L1 | `apps/web/src/features/pos/components/customer-attach-button.tsx` (new) + `use-cart-actions.ts` | setCustomerId action + search popover | No |
| L3 | Loyalty earn/redeem | Depends on L1+L2 | `packages/db/src/schema/loyalty.ts` (new) + `apps/api/src/loyalty/` + pay-surface + receipt | Full earn/redeem + GL JEs | YES (mig) |

---

## 9. Recommended Sequencing

**Session 1 (half-day):**
- S1 Prayer mode — 30 min, zero risk, immediately visible
- S2 Customer display mirror — 2–3 hrs, zero backend

**Session 2:**
- R1 + R2 Z-history list (API + web) — most-requested operator feature, no migration
- R3 + R4 register filter on daily-sales/top-sellers — small DTO extension

**Session 3:**
- R5 + R6 Sales-by-hour (API + web)
- S3 Weight-embedded barcode — scope-limited (parsing only, no hardware)

**Session 4:**
- R7 + R8 Cashier performance (API + web)

**Session 5+ (defer unless June 15 launch needs it):**
- L1 Customers table — this is a whole module (CRUD, search, import). Treat as a mini-phase.
- L2 Customer attach at POS — unblocked after L1
- L3 Loyalty — requires accounting review BEFORE coding. GL accounts for loyalty liability
  (2XXX range) must be added to the COA seed. Earn/redeem JEs must be reviewed by the
  accounting-reviewer agent. Scope is 2-3 full sessions minimum.

**Defer from this layer entirely:** hardware serial scale (post-MVP), AI-driven recommendations (deferred per scope).

---

## 10. GL Implications Summary (for Accounting Review)

| Feature | GL impact | Notes |
|---------|-----------|-------|
| Reporting (R1-R8) | None | Read-only queries |
| Prayer mode | None | UI only |
| Customer display | None | UI only |
| Weight barcodes | None | Quantity/pricing only, same GL path |
| Customers module | None | CRM data, no accounting entries |
| Customer attach at POS | None | FK only, no JE |
| Loyalty earn | **YES** — DR Marketing expense / CR Loyalty liability (2XXX) per earned point | New account class required; materiality threshold? Expense vs deferred? Accounting reviewer must decide |
| Loyalty redeem | **YES** — DR Loyalty liability / CR Sales discount per redemption | Must net against same liability account; must tie out on close |
