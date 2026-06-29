# Inventory — Promotions Testing Checklist

> Persona: **storekeeper (+ manager for promo setup)**. Test every item as the person who needs to run a Ramadan discount on cooking oil or a fixed-price deal on a bundle — and who will definitely try to set a 110% discount or forget to add targets. Ask at every screen: **"what's the dumbest thing a storekeeper could do when creating a promotion?"**

- **Route(s):** `/inventory/promotions`
- **Feature dir:** `apps/web/src/features/inventory/` (`promotions-list-panel.tsx`, `promotion-form-dialog.tsx`, `promotion-delete-dialog.tsx`, `promotion-type-badge.tsx`, `promotions-toolbar.tsx`)
- **API:** `tenant/inventory/promotions` — GET `/`, POST `/`, GET `/active`, GET `/:id`, PATCH `/:id`, POST `/:id/activate`, POST `/:id/deactivate`, DELETE `/:id`, POST `/:id/targets`, DELETE `/:id/targets/:targetId` — `PromotionsService`
- **Depends on:** `01-items-catalog.md` (item targets), `02-categories.md` (category targets), `15-price-lists.md` (price resolution precedence)

---

## 0. Preconditions

- [ ] Dataset loaded with at least 15 items across 3 categories; know item names in both languages.
- [ ] At least one promotion of each type exists (`percent_off`, `fixed_price`, `amount_off`) or create them during testing.
- [ ] Logged in as a role with promotions read + write permission; separately confirm a read-only role cannot create/edit/activate/delete.
- [ ] Tenant currency and precision confirmed (e.g. KWD = 3dp). Verify no hardcoded currency strings or fixed 2dp formatting.

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

- [ ] **List loads** — promotions display with name, type badge, value, validity range, and active/inactive status.
  - [ ] Loading skeleton shown while fetching; does not flash blank screen.
  - [ ] Empty state when no promotions exist is descriptive, not a blank div.
  - [ ] Error state (simulate 500) shows user-friendly message; retry works without full page reload.

- [ ] **Create promotion** (`POST /`) — form accepts name, type, value, validFrom, validTo; saves and appears in list.
  - [ ] Loading state on submit; button debounced — rapid re-click does not create duplicate promotions.
  - [ ] Validation rejects: blank name, missing type, missing value, validFrom > validTo.
  - [ ] Both client and server reject bad data (disable frontend validation manually to test server path).
  - [ ] Success feedback shown; list refreshes.

- [ ] **Edit promotion** (`PATCH /:id`) — change name, value, dates; changes persist after page refresh.
  - [ ] Form pre-fills with current values; partial edits do not reset other fields.
  - [ ] Editing an active promotion is either allowed (with a warning) or blocked — behavior must be consistent and communicated.

- [ ] **Delete promotion** (`DELETE /:id`) — requires confirmation dialog; list refreshes on success.
  - [ ] Targets are cleaned up server-side after deletion (no orphaned `promotion_targets` rows).
  - [ ] Cancelling the confirmation dialog does nothing.
  - [ ] Deleting an active promotion is blocked or prompts a warning — silent deletion of a live promo is a bug.

- [ ] **Activate** (`POST /:id/activate`) — status changes to active; badge updates; `GET /active` now includes this promo.
  - [ ] Cannot activate a promo with no targets (or system warns clearly).
  - [ ] Cannot activate a promo whose validTo is in the past (or system warns).
  - [ ] Loading state during transition; success feedback shown.

- [ ] **Deactivate** (`POST /:id/deactivate`) — status changes to inactive; badge updates; `GET /active` no longer includes this promo.
  - [ ] Deactivation is immediate and reflected in pricing at POS/sales.
  - [ ] Loading state during transition; success feedback shown.

- [ ] **Add targets** (`POST /:id/targets`) — can add individual item IDs or category IDs; picker is searchable (by name, SKU in en and ar).
  - [ ] Adding a target that already exists is handled: blocked or merged cleanly — never silent duplicate.
  - [ ] Adding a category target applies the promo to all items in that category at runtime (or to the listed items at assignment time — document which).
  - [ ] Loading state on submit; target list refreshes on success.

- [ ] **Delete target** (`DELETE /:id/targets/:targetId`) — target removed; promo no longer applies to that item/category.
  - [ ] Requires confirmation if removing the last target (leaves promo with no targets).

- [ ] **Active promotions endpoint** (`GET /active`) — returns only promotions where `isActive = true` AND today is between `validFrom` and `validTo`. Manually verify by creating a promo valid yesterday-to-yesterday and confirming it does not appear in `/active`.

- [ ] **Filters / search / toolbar** — filter by type, active status, validity date range; search by name; reset clears all filters.
  - [ ] Inactive promotions are visually distinct; they do not vanish without a filter toggle.
  - [ ] Promotions-toolbar renders without layout breaks in both RTL and LTR.

- [ ] **Type badge** — `percent_off`, `fixed_price`, `amount_off` render with distinct labels/colors; no mismatched badge.

---

## 2. Domain invariants

> Cross-cutting inventory invariants (currency precision, tenant isolation, audit trail, permission enforcement) are defined in `README.md` and apply here without repetition. The invariants below are promotions specific.

- [ ] **percent_off in range 0–100:** server rejects any `value` outside [0, 100] for `percent_off` type with a 400 error. A discount of 100% (free item) should be explicitly allowed or explicitly blocked — whichever is the product decision, it must be enforced consistently.
- [ ] **fixed_price > 0:** server rejects zero or negative `value` for `fixed_price` type. Zero-priced fixed-price promotions are a product risk; if allowed, require explicit confirmation.
- [ ] **amount_off ≤ item price:** an `amount_off` value greater than or equal to the item's current price produces a non-positive result. Server must either reject on creation (if item price is known) or guard at application time to floor at zero — never apply a negative net price.
- [ ] **validFrom ≤ validTo:** the API rejects (400) any promotion where validFrom is after validTo; the form enforces this client-side.
- [ ] **GET /active precision:** the active filter is evaluated server-side against the current timestamp — never client-side. A promotion whose validTo was 1 second ago must not appear in `GET /active`.
- [ ] **Activate/deactivate lifecycle is consistent:** a promotion in `inactive` state can be activated; an `active` promotion can be deactivated; neither transition leaves the record in an ambiguous intermediate state.
- [ ] **Targets scoped correctly:** a promotion's discount applies only to its listed item or category targets — it must not bleed to un-targeted items. Verify at POS/sales that a non-targeted item does not receive the discount.
- [ ] **Overlapping promos resolved deterministically:** if two active promotions cover the same item (e.g. a category promo + an item-level promo), the resolution rule is fixed and documented (highest discount wins, first-created wins, etc.). Silent non-determinism is a bug.
- [ ] **Target cleanup on delete:** after deleting a promotion, confirm (via DB query or API) that no `promotion_targets` rows remain for that `promotionId`.
- [ ] **Currency precision on fixed_price and amount_off:** values are stored and displayed at tenant currency precision — no silent rounding. For KWD, 1.500 must not round to 1.50.

---

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do"

- [ ] **percent_off = 0:** accepted (no-op discount) or rejected — must not silently appear as "active promo" with no effect.
- [ ] **percent_off = 100:** if allowed, the resulting price is zero — verify downstream does not error or produce negative values.
- [ ] **percent_off = 101 or 999:** rejected by both client and server with clear message.
- [ ] **amount_off larger than any item price:** server must either reject or floor the applied price at zero — never produce a negative cart line.
- [ ] **fixed_price = 0.000:** edge case — may be intentional (free-item promo). Confirm the system either allows it with a warning or blocks it explicitly.
- [ ] **Negative value for any type:** rejected both client and server.
- [ ] **Very large value:** entering 9,999,999 as `amount_off` or `fixed_price` is rejected or handled without overflow.
- [ ] **Promo with no targets activated:** if activation is allowed with no targets, the promo is effectively inert — at minimum, surface a warning. If blocked, the error message must be clear.
- [ ] **Past validTo on creation:** creating a promo that is already expired is allowed (historical) but must display an "expired" indicator and must not appear in `GET /active`.
- [ ] **Future validFrom:** a promo with a future start shows as "upcoming" — not active. Confirm `GET /active` excludes it.
- [ ] **Stale data:** open the detail/edit view, another session deletes the promo, first session submits an edit — error is user-friendly, not a raw 404.
- [ ] **Rapid re-click on activate/deactivate:** second click does not toggle state a second time or create duplicate requests.
- [ ] **RTL (Arabic) UI:** name field renders right-to-left with Arabic input (`dir="auto"`); numeric fields (value) remain LTR; currency/percent symbols render in correct position.
- [ ] **Long promotion names and target lists:** 200-character names and 100 targets do not break layout.
- [ ] **Category target with empty category:** adding a category that has zero items as a target — system accepts without error; discount has no effect (which is correct, but a warning would improve UX).

---

## 4. Cross-module / integration

- [ ] **POS discount application:** at checkout, an active `percent_off` promo on a targeted item reduces the line price by the correct percentage at tenant precision — not a rounded intermediate.
- [ ] **POS `amount_off` application:** the discount is subtracted from the item price before tax; result is floored at zero.
- [ ] **POS `fixed_price` application:** the item's POS price becomes exactly `value` regardless of catalog price or price list — the most specific override wins.
- [ ] **Sales order discount:** same discount logic applies when creating a sales order line for a targeted item.
- [ ] **Price list vs promotion precedence:** when both an active price list and an active promotion cover the same item, the precedence rule is deterministic and documented. Verify the correct final price appears at POS.
- [ ] **Category-level target expands correctly:** a promotion targeting a category applies to all items in that category at the point of sale — adding a new item to the category makes it eligible without re-saving the promo.
- [ ] **Deactivation propagates immediately:** deactivating a promo is reflected at POS on the next transaction — it must not linger for a session or cache window.
- [ ] **GL / accounting:** promotions that reduce revenue (percent_off / amount_off) post the correct net sale amount to the GL; any promotional discount account entry (if modeled) balances. Verify with the accounting team if a discount GL account is used.

---

## 5. Known gaps (from recon — verify or track)

- **amount_off floor guard at application time (HIGH):** if `amount_off` exceeds item price, the system may produce a negative net price at the point of application (POS/sales). Confirm there is a floor-at-zero guard in the service layer; if not, this is a silent financial bug.
- **Overlapping promo conflict UI (MEDIUM):** no visible indicator when two active promos cover the same item. A conflict-detection warning at save or activate time would prevent silent wrong-pricing; currently absent.
- **Activate guard — no targets (MEDIUM):** if activation is permitted with zero targets, the promo is silently inert. The guard may not be enforced server-side; verify and escalate if missing.
- **percent_off = 100 policy (LOW):** product decision unresolved — free-item promos may be valid (BOGO) or may be a data entry error. Currently no guard or warning; track for a future policy flag.
- **Promo history / audit log (LOW):** no visible history of when a promo was activated, deactivated, or edited. If mutations write to the audit trail (required by cross-cutting invariants), confirm those rows exist — they are not currently surfaced in the UI.
- **Multi-currency promos (LOW):** `fixed_price` and `amount_off` are implicitly in the tenant currency. If a multi-currency sale ever occurs, the conversion rule is undefined. Track as a future gap.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
