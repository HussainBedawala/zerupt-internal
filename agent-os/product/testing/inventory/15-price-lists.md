# Inventory — Price Lists Testing Checklist

> Persona: **storekeeper (+ manager for price-list admin)**. Test every item as the person who looks up prices when a customer asks "how much does this cost for 6 boxes?" They are NOT an accountant. The storekeeper expects prices to always reflect the right amount at the right quantity, in the right currency, with no rounding surprises. Ask at every screen: **"what's the dumbest thing a storekeeper could do when setting a price?"**

- **Route(s):** `/inventory/price-lists` (list), `/inventory/price-lists/[id]` (detail with items)
- **Feature dir:** `apps/web/src/features/inventory/` (`price-lists-panel.tsx`, `price-list-detail-panel.tsx`, `price-list-form-dialog.tsx`, `price-list-add-item-dialog.tsx`, `price-list-type-badge.tsx`)
- **API:** `tenant/inventory/price-lists` — GET `/`, GET `/:id`, POST `/`, PATCH `/:id`, DELETE `/:id`, GET `/:id/items`, POST `/:id/items`, PATCH `/:id/items/:itemRowId`, DELETE `/:id/items/:itemRowId` — `PriceListsService`
- **Depends on:** `01-items-catalog.md` (items must exist), `04-pack-units-uom.md` (prices may be per pack unit)

---

## 0. Preconditions

- [ ] Dataset loaded with at least 20 items across 3+ categories; know a handful of item names and their base costs.
- [ ] At least one `standard` price list and one `promotional` price list exist (or create them).
- [ ] Logged in as a role with price-list read + write permission; separately confirm a read-only role cannot create/edit/delete.
- [ ] Tenant currency and precision confirmed (e.g. KWD = 3dp). Verify `useTenantCurrency()` is used throughout — no hardcoded "KWD" strings or fixed 2dp formatting.

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

- [ ] **List loads** — price lists display with name, type badge, currency, active/inactive status, and validity range.
  - [ ] Loading skeleton shown while fetching; does not flash blank screen.
  - [ ] Empty state when no price lists exist is descriptive, not a blank div.
  - [ ] Error state (simulate 500) shows user-friendly message; retry is possible without page reload.

- [ ] **Create price list** (`POST /`) — form accepts name, type (`standard` / `promotional`), currencyCode, validFrom, validTo; saves and appears in list.
  - [ ] Loading state on submit; button debounced — rapid re-click does not create duplicate lists.
  - [ ] Validation rejects: blank name, validFrom > validTo, missing type.
  - [ ] Both client and server reject bad data (disable frontend validation manually to test server path).
  - [ ] Success toast/banner shown; list refreshes to show new entry.

- [ ] **Edit price list** (`PATCH /:id`) — rename, toggle active, change dates; changes persist after page refresh.
  - [ ] Form pre-fills with current values; partial edits do not reset other fields.
  - [ ] Loading state while saving; no stale data shown after save.

- [ ] **Delete price list** (`DELETE /:id`) — requires confirmation dialog; list refreshes on success.
  - [ ] A price list with items assigned prompts with clear warning or is blocked server-side.
  - [ ] A price list in use by a customer/sale prompts with clear warning (guard per invariant).
  - [ ] Cancelling the confirmation dialog does nothing.

- [ ] **Price list detail — item list** (`GET /:id/items`) — shows all items with name, price, minQty; pagination/scroll works for large lists.

- [ ] **Add item to price list** (`POST /:id/items`) — item picker is searchable (by name, SKU, barcode in en and ar); price and minQty fields accept valid values.
  - [ ] Adding the same item twice is handled: either blocked with a message or merges cleanly — never silent duplicate.
  - [ ] Price field enforces tenant currency precision (e.g. 3dp for KWD) — no silent rounding on save.
  - [ ] Loading state on submit; success refreshes item list.

- [ ] **Edit item row** (`PATCH /:id/items/:itemRowId`) — change price or minQty; persists correctly; does not affect other rows.

- [ ] **Delete item row** (`DELETE /:id/items/:itemRowId`) — requires confirmation; row removed immediately from list.

- [ ] **Quantity break rows** — adding multiple rows for the same item with different `minQty` values creates a break tier.
  - [ ] Breaks display in ascending minQty order.
  - [ ] Attempting overlapping minQty for the same item on the same list is rejected (see invariants).

- [ ] **Filters / search** on the list page — filter by type, active status, validity date range; search by name; reset clears all filters.
  - [ ] Inactive price lists are clearly distinguished (badge or muted style); they do not vanish without a filter toggle.

- [ ] **Type badge** — `standard` and `promotional` render distinctly and correctly; no mismatched badge for the stored type.

---

## 2. Domain invariants

> Cross-cutting inventory invariants (currency precision, tenant isolation, audit trail, permission enforcement) are defined in `README.md` and apply here without repetition. The invariants below are price-list specific.

- [ ] **Price at tenant precision:** every price stored and displayed uses the tenant functional currency at its correct decimal places — never hardcoded 2dp. For KWD, 1.500 must not display as 1.50.
- [ ] **validFrom ≤ validTo:** the API rejects (400) any price list where validFrom is after validTo; the form enforces this client-side as well (date picker should prevent or warn).
- [ ] **Quantity breaks are ordered and non-overlapping:** for a given item on a given price list, each `minQty` must be unique; breaks must not overlap. Server rejects duplicates with a clear error.
- [ ] **Item picker is exhaustive:** every active catalog item can be found in the item picker; deactivated items do not appear.
- [ ] **Deactivation guard:** deactivating a price list that is the sole active price for items in an open sale/order either blocks the action with an explanation or issues a clear warning. Silent deactivation with live downstream impact is a bug.
- [ ] **Delete guard:** deleting a price list that has open references (sales orders, POS sessions using it) is blocked server-side (not just UI-hidden). If the guard is not yet implemented, this is a known gap — see Section 5.
- [ ] **Effective price uniqueness:** at query time, one effective price per item/qty-break applies (no ambiguous overlap from two active standard lists for the same item). If multiple standard lists exist, the resolution rule must be deterministic and documented.
- [ ] **CurrencyCode on the list:** the `currencyCode` stored on the price list must match the tenant functional currency for all pricing to be meaningful. Confirm the UI does not allow creating a list in a foreign currency unless multi-currency pricing is built (it is not, per current spec).

---

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do"

- [ ] **Zero price:** entering a price of 0.000 is accepted (zero-price promotional items exist) OR rejected with a clear message — never silently saved as NULL.
- [ ] **Negative price:** entering -5 is rejected both client and server.
- [ ] **Very large price:** entering 9,999,999.999 KWD does not overflow the numeric column or break display layout.
- [ ] **MinQty = 0 or negative:** rejected — quantity breaks below 1 are nonsensical.
- [ ] **Wrong currency characters in price field:** typing "KD 1.500" or "١٫٥٠٠" (Arabic numerals) is handled gracefully — either parsed or rejected with a helpful message.
- [ ] **Past dates:** creating a promotional list with validTo in the past is allowed (historical record) but should display a visible "expired" indicator on the list.
- [ ] **Future validFrom:** a list with a future validFrom is shown as "upcoming" or similar — it must not appear as active when queried for pricing today.
- [ ] **Stale data:** open the detail page, another session deletes the price list, then the first session tries to add an item — the error is user-friendly, not a raw 404 or console error.
- [ ] **Rapid re-click on delete confirmation:** second click does not attempt a second DELETE request.
- [ ] **RTL (Arabic) UI:** name field renders right-to-left when an Arabic name is entered (`dir="auto"`); number fields (price, minQty) remain LTR; currency symbol position follows locale convention.
- [ ] **Long item names in the detail table:** 200-character names wrap or truncate cleanly — they do not break the table layout.
- [ ] **Item picker with many results:** searching returns a paginated or virtualized list — does not load all catalog items into the DOM at once.

---

## 4. Cross-module / integration

- [ ] **POS price resolution:** at the POS checkout, if a standard price list is active, the item price defaults to the price list value — not the catalog `selling_price`. Confirm the correct list is being applied.
- [ ] **Sales order price resolution:** creating a sales order line picks up the matching price list entry (by item + minQty break) when a price list is assigned to the customer or the order.
- [ ] **Promotional list vs standard list precedence:** when both are active for the same item, the system resolves deterministically (promotional wins, or whichever rule is documented). Conflicting active lists must not cause silent wrong pricing.
- [ ] **Import pipeline:** if items were imported via the Mira/unified import, their catalog entries appear in the item picker correctly with original names (en + ar).
- [ ] **Deactivated item on price list:** if a catalog item is deactivated after being added to a price list, the price list still shows the item (historical) but the item does not appear in new item picker searches.

---

## 5. Known gaps (from recon — verify or track)

- **Customer-specific prices (MEDIUM):** spec defines per-customer price list assignment; not yet built. Attempting to assign a price list to a specific customer from this screen will fail or have no effect. Track as a gap — do not treat current multi-list resolution as customer-specific pricing.
- **Branch-level prices (MEDIUM):** spec defines per-branch price overrides; not yet built. All price lists apply tenant-wide.
- **Delete guard completeness (HIGH):** server-side blocking of price list deletion when referenced by open orders needs verification — if not guarded, a deleted price list leaves order lines with a dangling reference. Confirm or escalate.
- **Multi-currency price lists (LOW):** currencyCode stored on price_lists but multi-currency pricing not built; the field may always equal the tenant currency. Confirm the UI does not surface this as a user-selectable option.
- **Effective-price conflict logging (LOW):** if two active standard lists cover the same item with the same minQty, the resolution is silent. No warning surfaces to the user. Consider a future conflict-detection banner.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
