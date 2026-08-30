# Dashboard — findings (2026-08-25)

Screen: `/:locale/dashboard` · Context: **Viewing "Fahaheel Branch" (B2)** · locale en
Ground truth from DB (`zerupt_tenant_gulf_auto_parts_mt5kya1i`):

| Scope | Distinct items w/ stock | Qty | Inventory value |
|---|---|---|---|
| Company (all 4 branches) | 5,000 | 197,900 | 9,490,157.975 |
| B1 Al Rai | 3,790 | 82,174 | (per-branch value not stored) |
| **B2 Fahaheel (active)** | **2,120** | **37,326** | |
| B3 Jahra | 2,243 | 40,722 | |
| B4 Salmiya | 2,133 | 37,678 | |

Company AR (acct 1131) = 587,827.958 · AP (2111) = 1,346,117.088 · Inventory (1141) = 9,490,157.975
**All opening-balance journal lines have `branch_id = NULL`.** (verified)

---

## DASH-001 — CRITICAL — FIXED & VERIFIED — "Idle Inventory" tile ignores branch scope entirely
**What the user sees**, while the top bar says *Viewing: Fahaheel Branch*:
> Idle Inventory — 5000 items haven't sold in 90+ days, with 9,490,157.975 tied up

**Ground truth:** Fahaheel holds **2,120** items, not 5,000. The figure 9,490,157.975 is the
exact company-wide `item_cost_pools` total, and 5,000 is the exact company-wide pool row count.
The tile is reading company-wide totals and printing them verbatim on a branch-scoped screen.

**Why CRITICAL:** a branch manager is told 5,000 idle items and ~9.5M KWD of dead stock sitting
in their branch. They would act on it. The real branch figure is less than half.
This is the precise failure mode the branch-scope primitive exists to prevent: `item_cost_pools`
has no branch dimension (it is keyed by item + legal entity by design), so any tile built on it
MUST either scope through `materialized_stock_levels` or state plainly that it is company-wide.

**Repro:** log in, choose Fahaheel Branch, scroll to "Stock & Cash Intelligence".
**Evidence:** `/tmp/zerupt-shots/16-idle.png`

---

## DASH-002 — HIGH — FIXED & VERIFIED — Three contradictory scope models on ONE screen
The same dashboard simultaneously applies three different scopes with no explanation:

1. **Top bar:** "Viewing: Fahaheel Branch" (the user's stated scope)
2. **"Sales: Last 7 Days"** has its OWN Branch dropdown, defaulted to **"All branches"** —
   silently contradicting the top bar the user just set
3. **"Idle Inventory"** is company-wide (DASH-001)
4. **"Outstanding Receivables"** IS branch-scoped, and therefore reads 0.000 (DASH-003)

A user cannot tell which number means what. Either every tile obeys the top-bar branch, or any
tile that cannot must say so on its face. A second branch selector that defaults to a DIFFERENT
scope than the one just chosen is worse than no selector.

**Evidence:** `/tmp/zerupt-shots/15-tiles.png`

---

## DASH-003 — WITHDRAWN — NOT A BUG (my misdiagnosis, 2026-08-25)
I reported that "Outstanding Receivables" silently reads 0.000 on every branch. **That was wrong.**

**My error:** I measured AR from `journal_entry_lines`, where every opening-balance line has
`branch_id = NULL`, and inferred the tile would read zero on all branches. But the tile reads
`sales_invoices`, where the branch IS populated: all 316 opening invoices (587,827.958 exactly)
belong to **B1 Al Rai**.

**Verified in browser:** switching to B1 shows `KWD 587,827.958` (3dp, correct).
Fahaheel truly has no receivables, so `0.000` was the correct answer there.

**Settled by schema:** `sales_invoices.branch_id` is `NOT NULL` (also `sales_orders`,
`purchase_invoices`). An "unattributed / branch IS NULL" bucket can never be non-empty.

**Consequence:** the "plus {amount} not assigned to a branch" hint built in response to this
report is unreachable code plus an extra query per dashboard load. REVERTED.

**Lesson for the rest of this programme:** verify which TABLE a screen actually reads before
reasoning about its scope. Two tables can both legitimately represent "AR" and disagree about
branch attribution. Read the query, do not infer it from the ledger.

## DASH-004 — MEDIUM — FIXED & VERIFIED — Money rendered with no currency at all
> "with **9,490,157.975** tied up"

No `KWD` prefix, unlike every other money figure on the page. Also a double space before the
number. Must go through the canonical money formatter (`formatMoneyAmount`), never string concat.

---

## DASH-005 — LOW — FIXED & VERIFIED — Inconsistent number formatting on the same screen
> "**5000** items haven't sold"  vs  Low Stock Items "**1,247**"

Same page, same kind of quantity, two different formats. 5000 needs a thousands separator.

---

## DASH-006 — LOW — FIXED & VERIFIED — Em dash used as the empty placeholder
"Gross Margin (MTD)" renders **—** when there is no data. House rule forbids em dashes in
product copy/UI strings. Also it is not self-explanatory: prefer a short phrase
("No sales this month") consistent with the other empty states on this page, which are good.

---

## OPEN — to verify, not yet a finding
- **Low Stock Items = 1,247.** Could not reproduce this exact number from either scope
  (naive company calc = 1,274, Fahaheel = 1,280). Formula differs from mine. VERIFY the scope
  of this tile when testing `/inventory/reorder`, do not assume it is wrong.
- **"Setup 1 of 5" checklist** is present on a tenant that is LIVE with onboarding frozen.
  Confirm this is intentional post-go-live guidance and not leftover onboarding state.

---

## Confirmed GOOD
- KWD renders with **3 decimals** correctly (KWD 0.000) in every money tile.
- Empty states are genuinely good: icon + plain-language explanation + a next action
  ("No sales yet / Your daily sales will show up here once you start selling" + "Record your first sale").
- Top bar states the active scope explicitly ("Viewing: Fahaheel Branch") rather than hiding it.
- `localhost:8097` console errors are React DevTools, correctly gated behind
  `NODE_ENV === "development"` in `apps/web/src/app/[locale]/layout.tsx:177`. NOT a bug, do not re-chase.
- Login preserves intent: unauthenticated deep link redirects to `/login?returnTo=%2Fdashboard`.


---

## Verification run — 2026-08-26 (after API rebuild + restart)

Viewing **Fahaheel Branch**, dashboard now reads:
> Idle Inventory — **2,120 items** haven't sold in 90+ days, with **KWD 1,765,263.922** tied up

- 2,120 == Fahaheel's true distinct-item count in the DB (was 5,000, the company figure). DASH-001 fixed.
- Currency prefix present, 3 decimals, single space. DASH-004 fixed.
- Thousands separator on the count. DASH-005 fixed.
- Gross Margin placeholder now reads "No sales yet", no em dash. DASH-006 fixed.
- Sales chart per-widget branch dropdown removed; dashboard reads the top-bar branch only. DASH-002 fixed.
- Cross-check: KWD 1,765,263.922 matches Fahaheel's opening stock value seen independently on
  Inventory Overview, so the branch-scoped valuation is internally consistent.

**HOW THE FIX WORKS (worth remembering):** quantity and item count are branch-scoped through
`materialized_stock_levels` (warehouse -> branch, via the shared `branchScopeCondition`
primitive), while average unit cost stays company-wide from `item_cost_pools`. That is the
correct split: it respects the company-wide-average-cost architecture without leaking
company-wide QUANTITIES onto a branch view.
