# Inventory: Price Lists, Price List Detail, Promotions, Transfer Edit

Tenant: Gulf Auto Parts (KWD, 3dp). Logged in as owner `anonymator8@gmail.com`, branch
"Al Rai Main Showroom" unless noted. Ledger check before first write: `0.000000`. Ledger
check after last write: not re-run (see Method Note below) — no journal-affecting write was
made (all writes were draft-only price list / promotion / draft-transfer rows; the one
ledger-affecting action attempted, sending the transfer, was rejected 409 by the server, so no
journal entries were created by this session).

**Method note on environment noise**: this session's browser (gstack `browse`) is shared with
other concurrent agents. Logins were repeatedly kicked back to `/login` mid-session, and the
API returned transient `ERR_CONNECTION_REFUSED` at least once (another session rebuilding the
API per its no-watcher requirement). All CONFIRMED findings below were reproduced after
re-authenticating and are backed by a screenshot, a DB query, or a full server-side code read
end to end (rule 1). One observed latency of 21s for a single POST (rule 4) is noted as
environment/contention noise, not a product finding.

---

## 1. Price Lists (list) + Price List Detail

Routes: `/inventory/price-lists` (master list + right-hand detail panel — single combined
screen), file `apps/web/src/app/[locale]/(app)/inventory/price-lists/page.tsx`.

### Schema / storage (CONFIRMED via `packages/db/src/schema/price-lists.ts`)
- `price_list_items.unit_price` and `.min_qty` are `numeric(19,6)` — matches the "other
  financial fields" convention. **No 2dp rounding risk in storage.**
- Verified live: added `ZZTEST-SKU-0001` to the "Wholesale" price list at `15.777` KWD via the
  UI Add Item dialog. DB row: `unit_price = 15.777000`, `min_qty = 1.000000`. CONFIRMED — exact
  3dp value round-trips through the API with no truncation.
- List rows in the UI screenshot render full 3dp (`31.533`, `28.301`, `21.675`, `8.056`,
  `41.258`) — no 2dp truncation anywhere observed. CONFIRMED.

### Price resolution logic (read end-to-end, CONFIRMED via code)
The tenant has exactly one price list ("Wholesale", standard, KWD, no validity window). Price
resolution is NOT inside `PriceListsService` (that's CRUD-only) — it lives in
`apps/api/src/inventory/price-lists/strategies/`, orchestrated by `PriceStrategyRegistry`:

1. **Explicit price list** (line/order-level override) — highest default priority.
2. **Customer price memory** (what a specific customer last actually paid, replayed for
   fairness/consistency) — a promotion campaign compares against and never silently
   overwrites this (see Promotions section).
3. **Customer default price list**.
4. **Item selling price** — the terminal strategy, structurally guaranteed to always run last
   (`TERMINAL_STRATEGY_KEY`, `pinTerminalLast()`), and it cannot be disabled via
   `price_strategy_config` even if a tenant admin tries — "a price must always resolve." **So
   an item in NO applicable list still always resolves to a price** (never null/undefined),
   and the fallback order is explainable to a shop owner in one sentence: "explicit list, then
   what this customer last paid, then their default list, then the catalog price."
3'. **Multiple applicable lists / multiple qty-break tiers on the same list**: within one list,
   `pickListPrice()` picks the tier with the **greatest `minQty` that is still ≤ the ordered
   quantity** (best qty-break the order legitimately earns), tie-broken deterministically by
   the lower unit price rather than trusting DB row order — comment explicitly flags this as
   defensive since the DB unique constraint on `(price_list_id, item_id, min_qty)` should make
   the tie impossible. Across DIFFERENT lists, ordering is controlled by the strategy
   priority chain above (never "cheapest of all applicable lists" — it is priority-ordered,
   deterministic, and the priority order is admin-configurable via
   `price_strategy_config`, not hardcoded).
- Priority ties in the registry break on `strategy.key.localeCompare()` — deterministic, never
  array/DB order.

### Effective-date boundary (read + verified in code, CONFIRMED)
`isEffectiveOn()`: `validFrom <= asOfDate <= validTo`, **inclusive on both boundaries**, using
the **document's business date**, never the server wall clock — explicitly called out in the
sales-invoice line builder ("a backdated invoice must get the promotions/lists in force on ITS
date," not today's). This is the correct behaviour: an invoice dated on the list's exact
`validTo` day still gets the list price; the day after does not.
Currency mismatch is a **fail-closed** case: a price list whose currency differs from the
tenant's functional currency is silently excluded from consideration (logged as a warning)
rather than applied wrong — correct, conservative behaviour, though it is a case that should be
structurally impossible given create/import already enforces list currency == functional
currency.

**No findings (CRITICAL/HIGH/MEDIUM) in price list resolution or storage** — this is a mature,
well-guarded module with defense-in-depth comments referencing prior incident numbers
(`.review-findings.md`), Decimal-only arithmetic (never `Number()` on a `numeric(19,6)`
column), and a terminal-strategy safety net.

### FRICTION
- **F1 (LOW/FRICTION)**: after adding a price-list item via the dialog, the left sidebar item
  count updated live (5,000 → 5,001) but the detail panel header still showed the stale
  "Items (5000)" until reload/refetch. Cosmetic, not a correctness bug (confirmed the DB write
  itself was correct).

---

## 2. Promotions

Route: `/inventory/promotions`, file
`apps/web/src/app/[locale]/(app)/inventory/promotions/page.tsx`.
Zero promotions existed at session start (DB confirmed). List renders a correct empty state
("No promotions found," pagination controls correctly disabled, `Showing 0–0 of 0`).

### Value guard at creation (CONFIRMED, code + live)
`PromotionsService.assertValidPromoValue()`: value must be `> 0`; `percent_off` must be
`<= 100`. Tested the **boundary**: created `ZZTEST Boundary Promo`, type `percent_off`, value
`100` (the maximum legal value), targeting `ZZTEST-SKU-0001`. **Accepted** — DB row
`634c7cea-2e18-4fbd-b032-6221be69272a`, `value = 100.000000`, `is_active = true`. This is
correct per the stated contract (0–100 inclusive) but is worth flagging as a product decision:
a tenant CAN configure a promotion that prices an item at exactly 0.000 KWD with no extra
confirmation or warning at creation time.

### Can a promotion produce a negative price? (CONFIRMED via code read,
`packages/shared/src/pos-money/promo-engine.ts`)
**No.** `effectivePrice()` clamps every type with `Decimal.max(..., 0)`:
- `percent_off`: `catalogPrice * (1 - value/100)`, floored at 0 (so even if `value` could
  somehow exceed 100 — it structurally cannot, per the guard above — price cannot go negative).
- `fixed_price`: `Decimal.max(value, 0)` (value is already required positive at creation).
- `amount_off`: `catalogPrice - value`, floored at 0.
A promo priced at/above the catalog price is treated as a no-op (`price >= catalogPrice`
skipped) — so a promotion can never make a customer pay MORE.

### Can a promotion price below cost, and is the user warned? (CONFIRMED via code read — GAP)
**There is no cost-vs-promo-price comparison anywhere in the promotion create/edit form, the
`PromotionsService`, or `resolvePromoForLine()`.** The engine only ever compares the promo's
resulting price against the catalog selling price (to reject promos that raise price), never
against the item's cost (`item_cost_pools` / WAC). A `fixed_price` or `amount_off` promotion
can legally be created and will silently apply at a price below the item's landed cost — margin
erosion with zero warning to the person creating the promotion or to the cashier applying it at
sale time.
**MEDIUM, CONFIRMED (design gap, not a broken guard):** no below-cost warning on promotions.
Recommend: a non-blocking warning in the promotion create/edit form ("this price is below the
item's average cost of X") — consistent with the "warn, don't silently proceed" standard
applied elsewhere in the app (e.g. the insufficient-stock guard on transfers, see below).

### Can two promotions stack? (CONFIRMED — by design, not a bug)
**No, and this is intentional and documented in the schema comment**: "the caller (POS engine)
picks the best deal (lowest effective price)" — `resolvePromoForLine()` iterates all
active/in-window/targeted promotions and picks the single BEST (lowest resulting price),
tie-broken by promotion id. Overlapping promotions on the same item are allowed to exist
simultaneously but never combine; only the best one applies. This is explainable and fair to a
shop owner ("your customer always gets the better of any two promotions that both apply, they
never add together").

### Promotion vs. remembered customer price (CONFIRMED, code read)
A subtle, well-reasoned interaction in `sales-invoices.service.ts` (~line 906-983): when a
customer has a remembered/negotiated price that suppresses automatic discounts, a live
promotion is NOT silently ignored (which would make repeat customers pay MORE than a walk-in
during a campaign) and is NOT silently stacked on top (which would make a negotiated price
erode further every campaign). Instead the invoice bills **whichever is lower**, and the
discount is recorded as a PROMOTION discount (not folded into the remembered price) so the
campaign correctly expires when the campaign ends. This is genuinely good design — flagging as
a positive finding, not a bug.

### FRICTION
- **F2 (LOW/FRICTION)**: two "New Promotion" buttons visible simultaneously on the empty list
  state (one in the toolbar, one as the empty-state CTA) — harmless duplication, not confusing
  in practice since both do the same thing, but is visual clutter on a screen with nothing else
  to look at.
- Positive: the promotion form has genuinely good micro-copy — inline tooltips explain what
  each type means in plain language ("% Off takes a percentage off the price. Fixed Price sets
  one price no matter what it normally costs...") and the date-range tooltip explains the
  open-ended default ("Leave dates empty to run the promotion until you turn it off
  yourself.") — meets the plain-language and defaults-over-questions standard.

---

## 3. Transfer Edit (`/inventory/transfers/[id]/edit`)

File: `apps/web/src/app/[locale]/(app)/inventory/transfers/[id]/edit/page.tsx` →
`TransferDraftEditPanel` → `TransferFormPanel` (same component the create flow uses).

### Which statuses are editable, and is it enforced server-side too? (CONFIRMED both layers)
**Only `draft`.** Verified at both layers, per method rule 1:
- **Frontend**: `TransferDraftEditPanel` checks `transfer.status !== "draft"` and renders a
  clear info banner + "Back to transfer" link instead of a form, for ANY non-draft status.
  Live-verified against a REAL pre-existing `received` transfer
  (`3dfe7438-4fe8-4df8-9cb1-a2d2748e1cb7`, not modified): navigating directly to its `/edit`
  URL shows "This transfer can no longer be edited directly / Only drafts can be edited in
  place. Use Edit on the transfer page to correct a sent or received transfer." — no form
  rendered, no way to submit a mutation from this screen.
- **Backend**: `StockTransfersService.updateDraft()` (`stock-transfers.service.ts:450`) throws
  `ConflictException` if `header.status !== "draft"` on entry, AND re-checks status inside the
  same DB transaction with a conditional `UPDATE ... WHERE status = 'draft'` — if a concurrent
  `send`/`cancel` wins the race between the initial read and the write, `updated.length === 0`
  and the whole rewrite rolls back with another `ConflictException` ("no longer a draft and can
  no longer be edited"). This is race-safe: a genuine TOCTOU guard, not just a status check at
  the top of the function.

### Does editing a draft correctly adjust stock / can quantity be stranded in transit?
**A draft carries no stock or GL history — editing it never touches stock at all** (confirmed
by code comment and behaviour: `updateDraft()` does a full delete+reinsert of
`stockTransferLines`, which is explicitly safe only because nothing has been posted yet). Stock
only moves on `send()` (stock-out from source, "in transit") and `receive()` (stock-in at
destination) — both separate, non-draft-editable actions. So there is no path where editing a
transfer can strand quantity in transit; the stranding risk window (draft → sent → received)
simply doesn't overlap with the editable window (draft only).

### Live exercise (CONFIRMED)
Created draft `ZZTEST` transfer (id `5aa0ee56-5678-43ec-81d3-5b7a919fd82d`, Al Rai Main
Showroom → Jahra Branch, 1 line `ZZTEST-SKU-0001` qty 3, notes "ZZTEST transfer edit screen
test"). On the `/edit` screen:
- "From Location" defaulted correctly to the current branch (defaults-over-questions).
- The "To Location" dropdown correctly **disabled** the current branch's own warehouse as a
  destination option (can't transfer a branch to itself).
- Edited qty 3 → 5, saved. DB confirmed `qty_sent = 5.000000` after save — edit round-trips
  correctly.
- Item picker showed **"0 available at source"** next to the line even before send — a good
  advisory, but it does not block the edit/save (by design — a draft can legitimately be
  edited before stock arrives at the source, e.g. planning ahead of a purchase receipt).
- Attempted **Send Transfer** on this same draft (qty 5, 0 on hand at source). Frontend showed
  a single, appropriately-scoped confirmation dialog for the irreversible action ("This will
  post a stock-out... This cannot be undone" — no stacked/duplicate dialogs, meets the
  confirm-once standard). On confirm, the **server rejected it with 409**: *"Insufficient stock
  for item ZZTEST-Brake Pad Set Front Test 2 (ZZTEST-SKU-0001): requested 5.000000, on hand
  0.000000. Stock transfers cannot drive source on-hand negative."* — shown to the user as a
  clear, actionable, plain-language error banner. **This confirms the negative-stock guard is
  enforced server-side, not just advisory in the UI**, and the error message is genuinely good
  (names the item, the requested vs. on-hand quantity, and the rule, all in one sentence).
  Transfer intentionally left in `draft` status (not force-sent) — the write-safety rule against
  creating impossible states was respected.

### FRICTION / minor
- One POST to `/send` took **21.1s** (second attempt) after an initial 11.4s — both against the
  shared dev machine's ~700-900ms Neon Singapore RTT baseline (rule 4), this is far outside
  normal and reads as environment contention (other concurrent sessions rebuilding/restarting
  the API during this window, confirmed via a separate `ERR_CONNECTION_REFUSED` burst in the
  browser console at the same time) rather than a product-code latency finding. Not scored.
- Qty Sent input on the edit form showed `3.00000` / `3.000000` (quantity, not money) — 6dp
  matches the schema's `numeric` scale for quantities; not a money-precision bug since this is
  a unit count field, not currency, and out of scope for the KWD 3dp rule.

### No findings on scoping/permissions for transfer edit within this pass
Not independently re-verified with a second role (cashier/storekeeper) in this session due to
the login churn described above — this is a gap, not a negative result. **SUSPECTED, not
tested**: whether `storekeeper1` / `cashier1` see the Edit action gated appropriately per
`@RequiresPermission`. Recommend a follow-up pass specifically re-testing permissions on this
screen with a non-owner role.

---

## Summary of findings

| # | Severity | Status | Area | Finding |
|---|----------|--------|------|---------|
| 1 | MEDIUM | CONFIRMED | Promotions | No below-cost warning: a `fixed_price`/`amount_off` promotion can be created and will silently sell below item cost with zero warning anywhere (creation form, promotions API, or POS/sales resolution). Percent/amount are bounded (0-100, >0) but never compared to cost. |
| 2 | LOW/FRICTION | CONFIRMED | Price Lists | Item count in the detail-panel header ("Items (5000)") does not live-update after adding an item via the dialog; sidebar count does. Cosmetic. |
| 3 | LOW/FRICTION | CONFIRMED | Promotions | Two "New Promotion" CTAs visible on the empty list state (toolbar + empty-state button). Harmless duplication. |
| 4 | — (not a bug) | CONFIRMED | Promotions | Promotions never stack — by design, documented in the schema, and correctly implemented as "best single deal wins." |
| 5 | — (not a bug) | CONFIRMED | Transfer Edit | Only `draft` transfers are editable, enforced identically on frontend (clear banner + link) and backend (status check + race-safe conditional UPDATE inside the same transaction). |
| 6 | — (not a bug) | CONFIRMED | Transfer Edit | Sending a transfer that would drive source stock negative is rejected server-side (409) with a clear, specific, plain-language error, even though the UI lets you type/save any quantity on the draft itself. |
| 7 | — (positive) | CONFIRMED | Price Lists | Price resolution precedence is deterministic, always resolves to a price (terminal strategy cannot be disabled), explainable in one sentence, and effective-date boundaries are correctly inclusive using the document's business date, not server wall-clock. |
| 8 | — (positive) | CONFIRMED | Price Lists | `numeric(19,6)` storage confirmed live: a 3dp KWD price (15.777) round-tripped through create → DB with no truncation, at both storage and every list/detail render observed. |
| 9 | — (gap, not tested) | SUSPECTED | Transfer Edit | Permission gating on the Edit action was not independently re-verified with a non-owner role in this session (shared-browser login churn prevented a clean second-role pass). Needs follow-up. |

No CRITICAL findings. No money-precision (2dp rounding) bugs found in price lists or
promotions, in storage or display — the KWD 3dp requirement is respected everywhere checked.
