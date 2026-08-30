# Inventory Overview (`/:locale/inventory`) — findings

Context: Viewing **Fahaheel Branch (B2)**, locale en.
DB ground truth for B2: 2,120 distinct items with stock · company catalogue = 5,000 items.

---

## INV-OV-001 — HIGH — Same metric, same branch, two different numbers on two screens
| Screen | Label | Value |
|---|---|---|
| Dashboard | "Low Stock Items" | **1,247** |
| Inventory Overview | "Below reorder level" | **1,280** |

Both viewed under the same branch (Fahaheel), at the same moment.

Independent DB check: items at/below `reorder_level` computed against Fahaheel stock = **1,280**,
computed company-wide = **1,274**. So Inventory Overview (1,280) matches the branch-scoped truth.
The dashboard's 1,247 matches NEITHER scope, so it is not simply a scoping difference — the
dashboard is using a third, different definition.

**Why it matters:** the owner sees two "how many items need reordering" numbers that disagree.
Whichever is right, one screen is lying, and there is no way for the user to tell which.

**Action:** find both queries, pick ONE definition, make the other call it. This is a shared-metric
problem, so fix it once in a shared place rather than patching each screen.
**Status:** OPEN

---

## INV-OV-002 — QUESTION (not yet a finding) — "Active items 5,000" on a branch view
The catalogue is company-wide (items are not branch-owned), so 5,000 may be strictly correct.
But sitting on a branch view next to three branch-scoped tiles, it reads as "this branch has
5,000 items", when Fahaheel stocks 2,120.

Either label it as catalogue-wide, or show the count of items actually stocked in this branch.
Needs a product call. Flagged, not auto-fixed.

---

## Confirmed GOOD
- **Branch scoping works here.** Every "Running low" row is tagged `· Fahaheel Branch`, and
  "Below reorder level" (1,280) matches the branch-scoped DB truth exactly.
- **KWD 3 decimals correct**: `KWD 832,849.362`, `KWD 1,765,263.922`.
- Row layout is genuinely good for a parts counter: item name, part number, branch, `1 of 9`
  stock-vs-reorder, and a Low badge. A user can triage without opening anything.
- Quick actions (New item / adjustment / transfer / stock count) are on the overview where a
  shop owner would look for them.

---

## INV-OV-001 — RESOLVED (root cause found, all three numbers reproduced exactly)

There are **two** low-stock definitions in the codebase, not three. Inventory Overview and
`/inventory/reorder` share one call site (`reorder.service.ts:411 getKpis`); the Dashboard has
its own (`dashboard.service.ts:376 lowStockCount`). Both were reproduced in SQL to the exact
observed values, with nothing guessed.

| Branch | Dashboard formula | Reorder-KPI formula | Observed in UI |
|---|---|---|---|
| Al Rai | 2,745 | **2,867** | 2,867 (Overview) |
| Fahaheel | **1,247** | **1,280** | 1,247 (Dashboard) / 1,280 (Overview) |
| Jahra | 1,266 | 1,320 | |
| Salmiya | 1,200 | 1,253 | |

### Two independent defects

**1. The definitions disagree.** Dashboard uses `on_hand < reorder_level` and drops rows with
negative on-hand. Reorder-KPI uses `on_hand - reserved_qty + in_transit <= reorder_point`.
Different comparator, different availability concept. Hence 1,247 vs 1,280 on the same branch.

**2. THE REAL BUG — the count is per (item, warehouse), so multi-warehouse branches inflate.**
Both queries count ROWS at (item, warehouse) grain, never aggregating per item.
For Al Rai, which owns three warehouses:
- Showroom rows below reorder: 1,306
- Shuwaikh Central rows below reorder: 1,561
- Sum = **2,867** (exactly the tile)
- **Distinct ITEMS below reorder across Al Rai: 2,425**

So **442 items are counted twice**, purely because they are low in two of the same branch's
warehouses. Fahaheel/Jahra/Salmiya never show this because they own one warehouse each, so rows
== items by construction.

**Why this matters commercially:** the number inflates in proportion to how many warehouses a
branch happens to run. A shop owner comparing branches would conclude Al Rai has far more
distressed stock than it does, and would over-order. The metric punishes a branch for having a
stockroom.

### Fix (dispatched)
One shared item-grain predicate, per branch, summing across that branch's warehouses:
`SUM(on_hand) - SUM(reserved_qty) + SUM(in_transit)` vs the item's reorder point.
`item_reorder_config` is EMPTY in this tenant (0 rows, verified), so both paths already fall
back to `items.reorder_level`; the divergence is not about config.

The correct shape ALREADY EXISTS at `stock-levels.service.ts:176-190` (its item-grain "Low"
status predicate) and is simply not wired to the KPI tiles. Extract it once and have both call
sites use it, rather than writing a third variant.

---

## INV-OV-003 — RESOLVED — the duplicated `/auto-parts/*` routes are legacy redirect stubs
Earlier I flagged that families/vehicles/what-fits appeared at two URLs. Investigated:
all five `/auto-parts/*` pages are one-line `redirect()` components carrying the comment
"Legacy route - the Auto Parts pack was de-siloed into Inventory". The real implementations
live under `/inventory/*`. Nav links exclusively to `/inventory/*`; no other reference exists
anywhere in web or api.

**No action. Not duplication.** They are bookmark-preserving redirects with no logic to drift.
Deleting them would 404 old links for no benefit. Closing this question.

### INV-OV-001 fix landed — but it changes the SEMANTIC, flag for founder
New shared helper `apps/api/src/inventory/shared/low-stock-metric.ts`
(`countLowStockItemsByBranch`), used by BOTH `dashboard.service.ts` and `reorder.service.ts`.
Placed under `inventory/shared/` alongside existing cross-call-site domain logic
(`assert-sellable.ts`, `location-context.ts`) so dashboard depends DOWN into inventory and the
architecture-drift direction stays correct.

| Branch | Before (row grain) | "distinct items, low in ANY warehouse" | After (branch-aggregate) |
|---|---|---|---|
| Al Rai (3 warehouses) | 2,867 | 2,425 | **1,922** |
| Fahaheel | 1,280 | 1,280 | 1,280 |
| Jahra | 1,320 | 1,320 | 1,320 |
| Salmiya | 1,253 | 1,253 | 1,253 |

Independent corroboration: 1,922 matches EXACTLY the figure I computed by hand earlier for B1
("stocked items at-or-below reorder, summed per branch"). Two independent derivations agree.

Single-warehouse branches are unchanged, as expected.

**The 2,425 -> 1,922 step is a semantic change, not just a dedupe.** 503 items are low in ONE
Al Rai warehouse while the branch's TOTAL stock across all three locations is NOT low.

- Branch-aggregate (1,922) answers **"should I BUY more?"** -> correct for a reorder metric.
- Per-warehouse (2,425) answers **"should I MOVE stock between my own rooms?"** -> a real and
  different need (replenishing the showroom from Shuwaikh Central).

The fix is right for the tile it feeds. But the transfer/replenishment need now has no surface.
**FOUNDER DECISION NEEDED:** is a "needs internal transfer" signal wanted somewhere
(reorder page, transfers screen), or is intra-branch distribution left to the shopkeeper?
