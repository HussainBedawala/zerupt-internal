# Phase A — permission testing: `accountant1` and `storekeeper1`

---

## PERM-003 — HIGH — The entire `(pos)` route group has NO route-level permission gate
**Verified in source, not inferred.**

`RequirePermission` wraps exactly ONE layout: `apps/web/src/app/[locale]/(app)/layout.tsx`.
The `(pos)` route group has its own `layout.tsx` with **no permission gate at all**.

So every route in `(pos)` is reachable by any authenticated tenant user regardless of role:
- `/pos` (the terminal)
- `/pos/display` (customer-facing display)
- `/pos/shifts/[id]/z-report` (shift cash report)

Demonstrated: `accountant1` holds **zero** `pos.*` permissions and `/pos` is correctly absent
from their nav, yet navigating directly to `/en/pos` rendered the full Open Shift UI (register
picker, opening float). The backend refused the data ("Could not load registers. Retry."), so
**no data leaked** — but the shell renders and the user is left at a broken screen instead of a
clean permission message.

**Why this matters beyond cosmetics:** the static audit concluded permission enforcement is
single-point and non-bypassable. That is true *of the point*. Nobody noticed an entire route
group sits outside it. Any future route added under `(pos)` inherits zero gating silently.
The Z-report route in particular displays shift cash figures and needs checking that its data
endpoint is independently gated.

**Fix:** gate the `(pos)` group too (its own `RequirePermission` on `pos` access), and add a
test asserting every route group that renders tenant data is wrapped by a permission gate, so
the next new group cannot repeat this.
**Status:** FIX DISPATCHED

---

## PERM-004 — MEDIUM — A read-only user can open and fill an entire create form
`storekeeper1` (Viewer, read-only) can navigate to `/inventory/items/new` and the **complete
create-item form renders with every field enabled** (name, SKU, cost, price, stock, brand,
fitment). Only the final "Add item" button is disabled, with "You do not have permission to
save items."

The user can spend real time filling a long form before discovering they were never allowed to
save it. That is the opposite of defensive UX.

Notably the **Purchase module already does this correctly**: "New direct purchase" / "New
purchase order" render as *disabled buttons with a tooltip* ("You don't have permission to do
this"), so the user never enters the form. Inventory should follow the pattern that already
exists in this codebase rather than inventing a new one.
**Status:** OPEN

---

## PERM-005 — MEDIUM — Dead-end "Access denied" screens instead of graceful degrade
For `storekeeper1`, `/en/inventory/items` and `/en/accounting` both threw
"Something went wrong: Access denied" rather than rendering a scoped read-only view or a clean
permission message. Same "something went wrong" wording problem as PERM-002.

---

## CORRECTION — a reported CRITICAL was NOT a leak (I verified and downgraded it)
The UI sweep reported CRITICAL cross-branch leakage for `storekeeper1`, on two grounds. Both
fail verification:

1. **"Shuwaikh Central Warehouse is outside the four branches."** FALSE. Verified in the DB:
   warehouse `WH1_B1` ("Shuwaikh Central Warehouse") has `branch_id` = **B1 Al Rai**, the very
   branch this user is entitled to. Al Rai owns three warehouses (Main, Transit, Shuwaikh).
   Showing it is correct behaviour. The agent assumed warehouse names map 1:1 to branch names.
2. **"Active items: 5,000 instead of 3,790."** Not a leak. The item CATALOGUE is company-wide
   by design (items are not branch-owned); 5,000 is the catalogue size. This is the labelling
   ambiguity already logged as INV-OV-002, not a scoping failure.

This matches the independent API-level test, which called the endpoints directly as this user
and found correct scoping, including a 403 when explicitly requesting a forbidden branch.

**Residual, genuinely unexplained (MEDIUM, open):** "Below reorder level" showed **2,867** for
storekeeper1/B1. Computed from the DB, B1 is either 1,922 (stocked items at/below reorder) or
3,132 (whole catalogue incl. zero-stock). 2,867 is neither. The same tile matched Fahaheel
EXACTLY (1,280 vs measured 1,280), so the metric is branch-varying and not a company-wide leak,
but its B1 value does not reconcile. Combined with the dashboard-vs-overview disagreement
already logged as INV-OV-001 (1,247 vs 1,280), the low-stock metric needs one authoritative
definition. **Do not treat as a leak. Do treat as an unreconciled number.**

---

## Confirmed GOOD (verified)
- **Branch switcher cannot be used to self-escalate.** `accountant1` (all branches) is offered
  all 4 plus "All branches". `storekeeper1` (single branch) is offered **no switcher at all** —
  there is simply no control to pick another branch.
- **`accountant1`'s nav has zero POS/Sales/Purchase links**, matching their zero pos permissions.
- **`storekeeper1` sees exactly the 316 Al Rai invoices** — matches ground truth precisely.
- **Journal Entries auto-scopes** to "Branch: Al Rai Main Showroom" and the branch filter offers
  only B1, with no escape hatch.
- Purchase create buttons correctly disabled with an explanatory tooltip.
- Money is 3-decimal KWD everywhere checked (`KWD 587,827.958`, `2,506.070`, `144.592`), except
  the known POS opening-float placeholder.
- Arabic renders `dir=rtl`, fully translated, no raw key paths, layout intact for both users.

## Still untested
- Whether the Z-report endpoint under `(pos)` is independently gated (route group is not).
- Server-side tamper of the Journal Entries `branchId` query param (the API-level test did prove
  the equivalent attack is refused with 403 on other endpoints).
