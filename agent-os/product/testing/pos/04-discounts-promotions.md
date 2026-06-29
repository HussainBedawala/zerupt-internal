# POS — Discounts & Promotions Testing Checklist

> Persona: **Counter cashier / shift supervisor.** You apply discounts under time pressure; the supervisor approves anything above their threshold. Ask at every screen: **"what's the dumbest thing a cashier could do here, at speed, with a customer waiting?"**

- **Route(s):** Inline within `/pos` cart (discount inputs on line items and order level)
- **Feature dir:** `apps/web/src/app/[locale]/(pos)/pos/` — line discount and order discount components
- **API:** `PATCH tenant/pos/transactions/:id/lines/:lineId` (discount fields), `PATCH tenant/pos/transactions/:id/lines/:lineId/price` (price override), payment endpoint applies order-level discount; coupon apply endpoint unconfirmed — verify path
- **Tables:** `pos_transaction_lines` (`discountAmount`, `discountPercent`, `priceOverride`, `priceOverrideById`, `approvedById`), `pos_transactions` (order-level discount fields)
- **Depends on:** 01-register-session (open shift), 02-transaction-lifecycle (transaction with at least one line), user roles with and without discount/override permissions.

## 0. Preconditions

- [ ] At least two items on the cart (to test line-level vs. order-level discount interaction).
- [ ] Two user accounts: one cashier (no override permission), one supervisor (has discount override permission).
- [ ] Know the discount threshold above which supervisor approval is required (read from tenant config or register settings).
- [ ] Coupon codes: at least one valid single-use coupon and one expired/exhausted coupon, if the coupon feature is live.

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Line-level discount

- [ ] **Discount by amount** — cashier enters a flat discount amount on a line; `discountAmount` stored; line total decreases correctly.
  - [ ] Discount greater than line subtotal: rejected (line total cannot go negative); clear message.
  - [ ] Discount = line subtotal: allowed (free item); line total = 0; confirm tax is also zeroed or handled per tenant config.
- [ ] **Discount by percent** — cashier enters a percentage (0–100); `discountPercent` stored; `discountAmount` computed by server; line total correct.
  - [ ] Percent > 100: rejected client- and server-side.
  - [ ] Percent = 0: accepted; no discount applied; no spurious rounding.
- [ ] **Discount requiring approval** — cashier enters a discount above the configured threshold; system prompts for supervisor PIN / approval; `approvedById` set on approval; discount not applied until approved.
  - [ ] Supervisor cancels the approval prompt: discount is NOT applied; line reverts to previous total.
  - [ ] Cashier without approval permission tries to bypass by direct API call: server checks `approvedById` presence and the approving user's permission; rejects if missing.
- [ ] **Removing a discount** — cashier clears the discount field; line total restores to original; `discountAmount = 0` stored (not null).

### Price override

- [ ] **Price override** (`PATCH :id/lines/:lineId/price`) — supervisor enters a new unit price; `priceOverride = true` and `priceOverrideById` set to the supervisor's user ID; line total recalculates.
  - [ ] Override to a price above the list price: allowed (e.g. emergency surcharge); confirm no accidental block on upward overrides.
  - [ ] Override to 0: treated as free item; confirm tax and discount behaviour is defined, not a crash.
  - [ ] Override to negative: rejected client- and server-side.
  - [ ] Cashier WITHOUT override permission: button hidden; server-side PATCH with `priceOverride=true` returns 403.
  - [ ] `priceOverrideById` is the supervisor who approved, not the cashier who triggered the flow — verify the correct user ID is stored.

### Order-level discount

- [ ] **Single order-level discount per transaction** — cashier applies a discount to the whole order; only one order-level discount record is created; applying a second replaces the first, does not stack or create a second row.
  - [ ] Order-level discount combined with a line-level discount: both applied; grand total is the correct combination (verify no double-counting).
  - [ ] Order-level discount that brings grand total to 0: allowed; payment panel shows total = 0; cashier can complete without payment.

### Coupon / promo code

- [ ] **Valid coupon** — cashier enters a valid code; discount applied; `usedCount` incremented atomically on completion (not on apply — a coupon applied to a held or abandoned transaction must not decrement `usedCount` permanently).
- [ ] **Expired coupon**: rejected with a clear expiry message; not applied.
- [ ] **Exhausted coupon** (`usedCount ≥ maxUses`): rejected with a clear "coupon fully redeemed" message.
- [ ] **Void transaction with coupon applied**: `usedCount` decremented atomically; coupon is reusable again (or returned to available state).
- [ ] **Same coupon applied twice to one transaction**: second application rejected; not doubled.

## 2. Domain invariants (cash / GL / stock)

- [ ] **Line total never negative:** `lineTotal = (qty × unitPrice) − discountAmount + taxAmount ≥ 0` for every line; the server must reject any combination that produces a negative line total, regardless of how the inputs arrive.
- [ ] **`discountPercent` ∈ [0, 100]:** no stored row has a `discountPercent` outside this range; server enforces on write.
- [ ] **At most one order-level discount per transaction:** querying `pos_transactions` for any row with two order-level discount records returns zero results; if the field is a single column this is trivially true; if a separate table, confirm the unique constraint.
- [ ] **`priceOverride = true` requires `priceOverrideById` non-null:** no row exists where `priceOverride = true` but `priceOverrideById` is null; the DB can enforce this with a CHECK or the service must enforce it unconditionally.
- [ ] **Discounts above threshold require `approvedById` non-null:** any line with `discountPercent` or `discountAmount` above the configured threshold must have a non-null `approvedById`; a row without it is a bypass. Verify this is checked on the server, not just the UI.
- [ ] **Coupon `usedCount` is atomic on completion:** `usedCount` is incremented in the same DB transaction as the pos_transaction status change to `completed`; it is NOT incremented on hold, apply, or abandon. Verify by holding a transaction with a coupon, then abandoning it — `usedCount` must not increase.

## 3. Edge cases & defensive UX — "the dumbest thing a cashier could do here"

- [ ] **Cashier types 100% discount on every line:** grand total = 0; the cashier should see a confirmation "Total is zero — are you sure?"; not silently completed.
- [ ] **Cashier types discount in the wrong currency unit** (e.g. types 500 when they mean 0.500 KWD): no guardrail here beyond showing the resulting line total clearly before confirmation — verify the total is prominent and in the correct format.
- [ ] **Supervisor approves a huge discount then immediately logs out:** `approvedById` is already stored on the line; the discount stands even after logout — confirm the approval is captured at the moment of approval, not re-validated at payment time.
- [ ] **Rapid discount + pay:** cashier enters a discount and immediately taps pay before the PATCH response returns — the pay endpoint must use server-computed totals, not client-cached values; test by throttling the network.
- [ ] **Stale coupon cache (offline):** offline cashier applies a coupon using cached data; at sync, the coupon may have been exhausted by another cashier; over-redemption must be flagged on sync, not silently accepted.
- [ ] **Order-level discount applied to a zero-line cart:** rejected clearly; not a crash.
- [ ] **RTL (Arabic):** discount fields, approval prompts, and coupon error messages all render correctly under RTL.
- [ ] **Double-apply order discount (two taps):** second tap while PATCH is in flight; only one update is applied (button debounced or server idempotent).

## 4. Cross-module / integration

- [ ] Discount amounts flow correctly into the GL posting: `pos.transaction.completed` listener posts the correct net revenue (revenue − discount) to account 4110; no discount is posted as revenue.
- [ ] If a discount account (e.g. 4190 Sales Discounts) is configured, the GL entry credits 4110 for gross revenue and debits 4190 for the discount; verify the JE is balanced.
- [ ] Void of a discounted transaction fully reverses the discount JE; the discount GL account returns to its pre-transaction balance.
- [ ] Order-level and line-level discounts appear on the receipt with clear per-line and summary breakdown.

## 5. Known gaps (from recon — verify or track)

- **Coupon table not visible in schema** — it is unclear whether the coupon feature is live, stubbed, or planned. If coupons are not yet built, the coupon UI must not be reachable or must show a "coming soon" state rather than a broken flow. Investigate before testing. **MEDIUM**.
- **Offline coupon over-redemption** — when offline, coupon redemptions use cached `usedCount`; if two offline registers each redeem the last use of a coupon, both succeed locally; on sync one is over-redemption flagged but not blocked. Ensure the sync conflict is surfaced to the manager, not silently accepted. **MEDIUM**.
- **Approval threshold configuration location** — where the discount approval threshold is configured (register settings, tenant settings, or role permissions) is unconfirmed; if it is not in the API, cashiers may not know the threshold until they hit the approval prompt. **LOW**.
- **`approvedById` vs. `priceOverrideById` schema overlap** — it is unclear whether the same field covers both approval and override scenarios or whether they are separate columns; confirm the schema to avoid test blind spots. **LOW**.
- **GL account for discounts** — whether the system uses a dedicated discount revenue account or nets discounts directly against 4110 is unconfirmed; both are valid but must be consistent and documented. **MEDIUM** for accounting correctness.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
