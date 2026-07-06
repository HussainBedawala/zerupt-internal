# POS Loyalty + Customers Design

**Status:** Design only. No implementation. Pending founder decision on pre/post-launch timing.
**Date:** 2026-06-30
**Scope:** Loyalty points and customer-at-POS for MENA/India/SEA small retail

---

## 1. Current State

### What exists

`pos_transactions.customer_id` (uuid, nullable) is fully wired through the stack:

- Schema: `packages/db/src/schema/pos.ts:348` -- plain uuid, no FK, comment says "no customers table yet"
- Cart state: `apps/web/src/features/pos/offline/cart-engine.ts:87` -- `customerId: null` default
- Offline persistence: `apps/web/src/features/pos/offline/repositories/cart-repo.ts:32`
- Sync payload: `apps/web/src/features/pos/offline/sync-payload.types.ts:99`
- Receipt: `apps/web/src/features/pos/components/receipt-document.tsx:512` -- shows customer name when present
- AR: `apps/api/src/pos/transactions/pos-credit-ar.ts:77` -- looks up `salesCustomers` by `customerId` for on-account sales
- Receipt service: `apps/api/src/pos/transactions/pos-receipt.service.ts:347` -- also looks up `salesCustomers` for phone/name on receipt

**The `salesCustomers` table already exists** (`packages/db/src/schema/sales.ts:72`). POS already uses it for on-account credit sales and receipt printing. There is NO separate customers table; there is NO loyalty table anywhere in the schema.

### salesCustomers columns (relevant subset)

```
sales_customers
  id            uuid PK
  tenant_id     uuid NOT NULL
  code          varchar(50)    -- CUST-0001, unique per tenant
  name          varchar(300)   -- primary language
  name_alt      varchar(300)   -- secondary language (Arabic/English)
  phone         varchar(50)    -- already present
  email         varchar(320)
  tax_number    varchar(50)
  status        enum (active | blocked | archived)
  credit_limit  numeric(18,4)
  default_price_list_id uuid FK
  created_at, updated_at
```

Index: `sales_customers_tenant_id_idx` on `(tenant_id)`. No phone index currently.

---

## 2. Customer Table Decision

**Decision: Reuse `salesCustomers`.** Do NOT create a new table.

Rationale:
- POS already references `salesCustomers` for AR and receipt data
- Adding a second customer master would fragment AR aging and create double-master risk (the schema comment on `salesCustomers` explicitly flags this hazard)
- Phone is already a column on `salesCustomers`
- `defaultPriceListId` enables per-customer pricing at POS without extra joins
- Modular boundary is respected: POS depends DOWN on the sales schema; the sales schema does not depend on POS

**One addition needed:** a partial unique index on phone for fast lookup:

```sql
CREATE UNIQUE INDEX sales_customers_tenant_phone_uniq
  ON sales_customers (tenant_id, lower(btrim(phone)))
  WHERE phone IS NOT NULL AND btrim(phone) <> '';
```

This mirrors the existing `tax_number` uniqueness pattern in the same table.

### Loyalty columns (add to salesCustomers via migration)

```sql
ALTER TABLE sales_customers ADD COLUMN loyalty_points_balance numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE sales_customers ADD COLUMN loyalty_tier varchar(50);
ALTER TABLE sales_customers ADD COLUMN loyalty_enrolled_at timestamptz;
```

A separate **`loyalty_ledger`** table holds the immutable earn/redeem history (see section 4).

---

## 3. Customer-Attach-at-POS UX

### Phase: BUILD (before SETTLE)

Customer attach belongs in the BUILD phase, not SETTLE. Reasons:
- Tier-based discounts and price lists must apply to line items before the total is computed
- Offline-safe: `customerId` is already stored in `CartState` and persisted to IndexedDB

### Cashier flow

1. **Phone lookup** -- cashier types the first few digits; debounced search hits `GET /tenant/customers/search?phone=&limit=5`. Returns `{ id, name, nameAlt, phone, loyaltyPointsBalance }`. Component: a small drawer or inline search box in the cart header.
2. **Quick-create** -- if no match, a minimal form collects `name` + `phone` (required), `nameAlt` optional. Creates the customer and attaches in one step. No tax number, no credit limit -- those can be filled in later from the Customers module.
3. **Scan loyalty card** -- future: barcode on physical card encodes `customerId`; scanner attaches without typing.
4. **Walk-in** -- no customer. `customerId` stays null. No points, no price-list override.

### Offline behaviour

- The customer lookup hits the API; if offline the cashier cannot search. The field becomes a free-text "Customer Name" note field stored in `CartState.notes` only -- no loyalty accrual offline until sync.
- On sync, `pos-sync.service.ts` has `customerId` in the sync DTO already (`apps/api/src/pos/sync/pos-sync.dto.ts:109`). Loyalty earn is computed server-side at sync time, same as AR.
- This is consistent with how gift cards and store credit work offline: optimistic on device, authoritative on server.

---

## 4. Earn / Redeem Flow

### Earn rules (tenant-configurable)

A `loyalty_config` JSON blob on `tenantIdentity` (or a dedicated `loyalty_settings` table) stores:
- `pointsPerUnit`: points earned per 1 unit of functional currency spent (e.g. 1 point per 1 KWD)
- `minimumRedeemPoints`: floor before redemption is allowed (e.g. 100)
- `pointValueInCurrency`: how much 1 point is worth at redemption (e.g. 0.01 KWD)
- `expiryDays`: nullable; points expire after N days if set

### Earn at settlement

When `pos.transaction.completed` fires with a non-null `customerId`, a new `LoyaltyService.earn()` call computes:

```
pointsEarned = floor(netRevenue * pointsPerUnit)
```

`netRevenue` = revenue minus discount (post-tax-exclusive amount). This is available in the `pos.listener.ts` payload already (`payload.revenue`, `payload.discountTotal`).

`LoyaltyService` inserts a row into `loyalty_ledger`:

```
loyalty_ledger
  id            uuid PK
  tenant_id     uuid NOT NULL
  customer_id   uuid NOT NULL FK -> sales_customers(id) RESTRICT
  transaction_id uuid              -- pos_transactions.id, nullable (manual adjustments)
  type          enum (earn | redeem | expire | adjust)
  points        numeric(18,2)     -- always positive; sign implied by type
  balance_after numeric(18,2)     -- snapshot for auditing
  description   varchar(500)
  created_at    timestamptz NOT NULL DEFAULT now()
```

Then atomically: `UPDATE sales_customers SET loyalty_points_balance = balance_after WHERE id = customerId AND tenant_id = tenantId`.

The update is inside the same DB transaction as the ledger insert. Immutable: rows are never updated or deleted (audit trail).

### Redeem at pay surface (SETTLE phase)

Redemption is a tender method, alongside cash/card. The cashier taps "Use Points" at the pay surface; the system shows the available balance and the max redeemable amount for this sale:

```
maxRedeemAmount = min(loyaltyPointsBalance * pointValueInCurrency, grandTotal)
```

The cashier enters points to redeem (or accepts the max). This produces a `loyalty_redemption` tender in the payment payload:

```
{ method: "loyalty_redemption", amount: "5.000" }
```

On the server, `LoyaltyService.redeem()` inserts a `redeem` row in `loyalty_ledger` and decrements `loyalty_points_balance`.

### Running balance display

In the cart header (BUILD phase) and on the receipt (post-SETTLE), show:
- Points balance before sale
- Points that will be / were earned
- Points that were redeemed
- New balance

i18n keys: `pos.loyalty.balance`, `pos.loyalty.earn`, `pos.loyalty.redeem`, `pos.loyalty.newBalance` (ar + en).

---

## 5. GL Implications

**Loyalty points are a deferred-revenue liability.** When a customer earns points, the merchant has incurred an obligation to provide future value. This is standard IFRS 15 / ASC 606 practice.

### Double-entry on earn

```
DR  Sales Discounts (contra-revenue)   4310   XX.XX
    CR  Loyalty Points Liability        2153   XX.XX
```

Proposed new account: **2153 Loyalty Points Liability** (sub-account under 215x Current Liabilities). The debit hits contra-revenue (same family as `4300 Sales Discounts`) to reduce recognised revenue for the portion that is, in effect, deferred.

The amount is: `pointsEarned * pointValueInCurrency` -- i.e. the fair value of the points issued.

### Double-entry on redeem

```
DR  Loyalty Points Liability           2153   XX.XX
    CR  Sales Revenue (or AR)          4110   XX.XX
```

When the customer redeems, the liability is extinguished and revenue is recognised. At the POS pay surface, the `loyalty_redemption` tender line in `pos.listener.ts` would map to a new `lineType: "loyalty_redemption"` which routes to `4110` on the credit side and `2153` on the debit side.

### Double-entry on expiry

```
DR  Loyalty Points Liability           2153   XX.XX
    CR  Other Income                   7110   XX.XX
```

Breakage (expired points) is recognised as other income when points lapse.

### Account-mapping-defaults.ts additions needed

In `apps/api/src/journal-entries/account-mapping-defaults.ts`:

```typescript
{ eventType: "pos.transaction.completed", lineType: "loyalty_earn_expense",  accountCode: "4310" },
{ eventType: "pos.transaction.completed", lineType: "loyalty_liability",      accountCode: "2153" },
{ eventType: "pos.transaction.completed", lineType: "loyalty_redemption",     accountCode: "2153" },
```

### Three-way tie-out implications

The existing tie-out checks `cash + card + on_account + gift_card_used + store_credit_used = revenue + tax - discount`. Loyalty redemption is another tender so it must be added to the debit side:

```
cash + card + on_account + gift_card_used + store_credit_used + loyalty_redemption = revenue + tax - discount
```

On the GL side: `2153` DR (redemption) + other tender DRs = `4110` CR (revenue) + `2131` CR (tax) - `4300` DR (discount). Must balance.

**Flag:** This section requires sign-off from the accounting-reviewer before any migration is generated. The contra-revenue approach (DR 4310 on earn) vs. the full-liability-at-face-value approach have different P&L effects. The accounting-reviewer must confirm which treatment matches the tenant's reporting jurisdiction (IFRS vs local GAAP for KSA/Kuwait/India).

---

## 6. Effort Estimate

| Layer | Work | Size |
|-------|------|------|
| DB migration | Phone unique index, loyalty columns on salesCustomers, loyalty_ledger table, account 2153 seed | S |
| API -- LoyaltyService | Earn, redeem, expiry logic, balance query | M |
| API -- POS listener hook | loyalty_earn lines in pos.transaction.completed handler | S |
| API -- sync service | Loyalty earn at offline sync time | S |
| API -- customer search endpoint | Phone/name search with loyalty balance | S |
| Web -- customer attach UI | Search drawer, quick-create form, balance display in cart | M |
| Web -- redeem at pay surface | Loyalty tender option, points input, max calc | M |
| Web -- receipt display | Points earned/redeemed/balance on receipt | S |
| GL account mapping + tie-out | New lineTypes, balance check update | S |
| Tests | Unit + integration across all layers | M |

**Total: ~L** (roughly 8-12 engineer-days solo, not counting accounting-reviewer sign-off and stakeholder decisions on earn rates).

---

## 7. Pre-Launch vs Post-Launch Recommendation

**Recommendation: Post-launch.**

Justification:

- The ICP (MENA/India/SEA small retail, independent shops) does not require loyalty to make a first purchase or to evaluate the ERP. Loyalty is a retention tool, not an acquisition tool.
- MVP launch (already past June 15) is about getting the first live tenant transacting. Loyalty has zero bearing on that.
- The salesCustomers table and `customerId` wire are already in place. Customer-attach at POS (without loyalty points) can be done as a small standalone task post-launch; loyalty earn/redeem then layers on top.
- The GL implications need accounting-reviewer sign-off (jurisdiction-specific contra-revenue vs liability-at-face-value decision). Rushing this creates a financial reporting risk.
- The offline redemption story is incomplete: a cashier cannot verify the live points balance offline, so fraudulent double-redemption is possible without a reservation mechanism. Solving that correctly adds scope.
- No launch-blocking dependency: the POS three-way tie-out and AR path do not require loyalty to balance.

**Suggested post-launch sequencing:**
1. Customer attach at POS (phone lookup + quick-create, no points) -- small, unlocks named receipts and AR credit sales for walk-in customers who are not yet in the system.
2. Loyalty earn (passive, no redeem UI) -- lets the tenant seed a points bank before launch.
3. Loyalty redeem at pay surface + GL -- once accounting sign-off is obtained and the reserve/fraud path is designed.
