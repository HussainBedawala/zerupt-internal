# Stock Levels & Adjustments UI (DEV-267)

The front-end for two very different inventory surfaces: a **read-only window** onto
current stock, and a **write path** that physically moves stock. The interesting parts
are not the tables — they're the decisions that keep a non-technical retail user from
corrupting their own inventory.

## Why two surfaces, one feature slice

Stock levels are *projections* (materialized on-hand + WAC, never edited directly).
Adjustments are *documents* that, once posted, emit ledger entries and an accounting
event. They share types/api/query-keys but answer opposite questions: "what do I have?"
vs "change what I have." Keeping them in one slice lets a posted adjustment invalidate
the stock-levels cache (and the items list's on-hand column) in one place — the mutation
knows everything it touched.

## Money and quantities are strings, not numbers

Every qty/cost crosses the wire as a decimal **string** (Postgres `numeric`, 6dp). The
UI parses to `Number` only for *display* (locale formatting) and for the *running-total
estimate* — never for anything that gets posted. The payload forwards the user's exact
strings. This is the single most important rule: the moment you do `parseFloat` and send
the result back, you've introduced IEEE-754 drift into a financial document. The server
is the source of truth for the posted total; the UI's running total is explicitly an
estimate that `formatNumber` rounds to 2dp.

## Direction is derived, not asked

A retail user shouldn't have to reason about "is this an increase or a decrease?" The
adjustment *type* implies it: Purchase Received / Found → increase; Damaged / Lost /
Write Off → decrease. Only `Other` is genuinely ambiguous, so it's the only type that
exposes a direction selector. Unit cost is collected only for increases (the value
entering the WAC pool); decreases exit at current WAC, so asking for a cost would be
misleading. The form's shape follows the domain, not the database columns.

## The negative-stock override: a 409 as a conversation

The company has a policy column (`strict` vs `flexible`). Rather than fetch the policy
up front and branch the UI, the form **asks by trying**: it posts with
`allowNegative=false`. The server is the authority:
- Under **strict** policy, or any other conflict, the 409 is terminal → plain error toast.
- Under **flexible** policy, the 409 message hints `allowNegative` → the UI surfaces a
  warning dialog ("stock will go negative, you sure?") and, on confirm, **reposts the
  same payload with `allowNegative=true`**.

This keeps the client ignorant of policy state (no extra round-trip, no stale-policy bug)
and lets the server own the rule. The cost is parsing intent out of an error message,
which is a deliberate trade: the message contract is owned by the same team.

## Double-submit is a race, not a disabled button

`isPending` is necessary but not sufficient. Between the confirm-dialog post and the
negative-override repost, the mutation settles (`isPending` flips false) before the
override dialog's button is clicked — a window where a double-tap can fire two posts and
create two adjustments. The fix is a **synchronous ref lock** set before `mutate` and
cleared only in `onSuccess`/`onError`. State is for rendering; refs are for "has this
already started?" guards that must be correct *within the same tick*. The barcode scanner
has the same shape: a gun can emit two `Enter` events faster than React re-renders, so
the scan lookup is guarded by a ref too.

## Barcode scanning is just "Enter on a focused input"

No special hardware integration: a USB barcode gun is a keyboard that types fast and
presses Enter. So the search field auto-focuses on mount, and `Enter` triggers an exact
barcode lookup (`/items/barcode/:code`). If that 404s, fall back to the single search
match if there's exactly one; otherwise tell the user nothing matched. Re-scanning an
item already on the sheet bumps its quantity instead of adding a duplicate row — the
behavior a cashier expects when they wave the gun twice.

## Introducing toast infrastructure

Success needed a non-blocking confirmation ("Adjustment ADJ-0001 posted") while the user
is navigated away. The app had no toast system, so this added `sonner` to the shared UI
package and a single `<Toaster />` at the root — theme-aware via the existing `dark`
class. One feature's need, but built as shared infra so the next feature inherits it.

## Defensive details that matter for the target market

- Server error strings (which may contain Arabic item names) are bidi-isolated with
  `<bdi>` so RTL/LTR mixing doesn't scramble the message.
- Clickable table rows are keyboard-activatable (`role`/`tabIndex`/Enter-Space).
- Item search requires ≥2 characters — a 1-char query on thousands of SKUs is useless
  and hammers the API.
- Every surface has explicit loading / error+retry / empty states.

## Known gaps (API-bound)

The spec asked for a category filter on stock levels and an item-count column on the
adjustments list. Neither backend endpoint exposes that data yet (`/stock-levels` filters
on warehouse/search/below-reorder only; the adjustments list returns headers without line
counts). Shipping the UI around the real contract beats faking columns the API can't fill.
