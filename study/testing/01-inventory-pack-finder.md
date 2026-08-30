# Auto-parts pack: What-fits / Part-finder / Part-reference

Tenant: Gulf Auto Parts (KWD). Logged in as owner (anonymator8@gmail.com, "HB"),
branch Al Rai Main Showroom. Routes confirmed live (the old `/auto-parts/*` paths
are 1:1 redirects to `/inventory/*`, see `apps/web/src/app/[locale]/(app)/auto-parts/what-fits/page.tsx`):

- What-fits: `/inventory/what-fits` → `WhatFitsPanel`
- Part-finder: `/inventory/part-finder` → `PartFinderBrowse` → `PartFinder` + `PartFinderRow`
- Part-reference: `/inventory/part-reference` → `PartGradesPanel` + `PartBrandsPanel` (tabs)

**Method note:** the gstack browse instance is shared with several other concurrent
testing sessions this run; every few commands another session's navigation stomped
mine (redirected to `/inventory/vehicles`, `/inventory/price-lists`, `/inventory/items/new`
mid-flow). I confirmed login (owner, Al Rai branch) and reached the What-fits screen with
its vehicle picker live, but could not hold the browser long enough to click through to a
full What-fits results set or the reference-data dialogs without another session
hijacking the tab. Findings below marked CONFIRMED are code read end-to-end (controller →
service → query hook → component, values like `MAX_FITMENT_SAMPLE`, `limit` defaults, and
`@RequiresPermission`/`@Audited` decorators verified directly in source) plus the one live
screen state I did capture. None are SQL/DB-verified this pass since no fitment DB checks
were needed to resolve the specific questions asked.

## The central question, screen by screen

**Can a Kuwaiti counter clerk holding a broken part, or naming a car, find the right
part fast, first try?**

### Part-finder — YES, and it is the best-built screen of the three.
Search-first (`part-finder.tsx`): type a SKU/part number/barcode/name/brand fragment,
results stream in with a 300-ish click count of **1** (click the field, type, click the
result — effectively a 2-action flow with full keyboard support: arrow keys move a real
DOM-focused row, Enter selects, Escape backs out one level at a time without leaking to a
parent Sheet). Server caps results to `limit ≤ 50` (default 20, `part-finder.dto.ts:17`)
and fitment sample to `MAX_FITMENT_SAMPLE = 5` vehicles per hit
(`part-finder.service.ts:96`) with an honest `familyVehicleCount` badge instead of dumping
the full family list — this is the RIGHT pattern for the family-scoped-fitment problem (see
below), and it stands in clear contrast to What-fits. Route rate-limited 30/min/user
(`part-finder.controller.ts:73`), permission `inventory.item.read`. Verdict: this screen
solves the "clerk holds a part, needs to find/reprice/check stock" case in well under 60
seconds, first try.

### What-fits — WORKS for a clean single-vehicle case, but degrades badly at real volume — this is where the family-scoping problem actually bites.
Flow: pick Make (searchable combobox) → pick Vehicle (searchable combobox, scoped to make)
→ results render automatically, no submit button. That is genuinely **2 clicks** to a
result set for a vehicle whose make/model the clerk already knows — good, no defaults left
on the table here (branch is read from the already-selected branch context, not re-asked).

The problem is what happens after the picker: **CONFIRMED (code, `what-fits-panel.tsx:267-289`)**
— `results.map()` renders every match as a flat unpaginated `<ul>`, no search box, no
per-family grouping, no "load more". The server (`fitments.service.ts` `whatFits()`) caps
matches at `query.limit` which **defaults to 100 and can go to 200** (`fitments.dto.ts:36`,
`whatFitsQuerySchema`). Given the already-recorded fact that `fitments.item_id` is NULL for
all rows and fitment is family-scoped (one water pump family already observed returning
~100 unrelated vehicles), the inverse is now confirmed structurally: **picking ONE vehicle
can legitimately return up to 100 items** (every part in every family that has ANY fitment
row for that vehicle, deduped per-family via `MAX_FAMILY_MEMBER_ITEMS = 25`,
`fitments.service.ts:36/207`), rendered as one long scroll with zero narrowing tools. A
clerk with a customer's car who wants "the brake pads" out of a 100-row mixed-category
result has no filter by category/family and no search-within-results — they must
eyeball-scroll the whole list. **HIGH, CONFIRMED (code)**: this is the same unfiltered-
firehose pattern already flagged elsewhere in the pack, but it independently repeats here
in the primary "name a car" flow, at up to 100 rows with no mitigation at all (Part-finder,
by contrast, explicitly bounds and summarizes). Rank HIGH rather than the prior MEDIUM
because this is the screen's PRIMARY listing (not a drill-down inside an item), so the
firehose is the first and only thing the clerk sees.

**MEDIUM, CONFIRMED (code)**: label ambiguity repeats here too. Each result row's own label
comes from item name/SKU/part number (fine, distinct per part), but the vehicle PICKER
itself (`vehicle-picker.tsx`, `vehicleLabel()`) composes `model + year + trim` and omits
`engine` entirely; `trim` is NULL for every seeded row (already recorded). So when a clerk
searches for "Camry 2018" and the dropdown shows two or more visually identical "Camry
2018" options (different engines, no trim to disambiguate), they cannot tell which vehicle
they are actually picking — and What-fits' results then depend entirely on having picked
the RIGHT one. This is a real product gap (the label omits a real, populated-when-present
field, `engine`) independent of the seed-data trim-null noise, so it is in scope: fix is
cheap (append engine when present) but the code as shipped never surfaces it anywhere in
`vehicleLabel()`.

Price/currency handling on this screen is well hardened (KWD 3dp respected via
`useTenantCurrency` + null-currency guard, no 2dp fallback trap) — no finding there.

### Part-reference (grades + brands tabs) — administrative screen, works, minor friction only.
2-tab layout (`Tabs`/`TabsList`), each tab is a CRUD table + dialog
(`useEntityCrudDialog`). Create/edit a grade or brand is a single dialog, no stacked
confirms observed in code (`part-grades-panel.tsx`), permission split correctly: list =
`inventory.item.list`, create/edit = `inventory.autoparts.manage`, delete =
`inventory.autoparts.delete` (`grades.controller.ts`) — proper least-privilege tiering, not
a single blanket permission. Delete goes through `DeleteWithUsageDialog` (a usage-check
before delete, not a blind confirm) — correct pattern, avoids orphaning parts that
reference a grade/brand. Every mutation is `@Audited("PartGrade")` /
`@Audited("PartBrand")` at the controller (declarative audit interceptor, not manual
service calls — confirmed present, not missing, on all three of grades/brands/fitments
controllers). No findings here beyond noting this is the ONLY path that can populate
`part_grades` (per the file's own header comment) — if a fresh auto-parts tenant is
onboarded without visiting this screen first, the item form's grade dropdown has nothing in
it. That is a genuine first-run-experience risk worth flagging even though it isn't a bug in
this screen itself.

## Findings summary

| # | Severity | Status | Screen | Finding |
|---|----------|--------|--------|---------|
| 1 | HIGH | CONFIRMED (code) | What-fits | Results list is a flat, unpaginated, unfilterable `<ul>` of up to 100 items (server default/max `limit` 100/200) with no search-within-results and no per-family/category grouping. The family-scoped-fitment firehose pattern repeats here, on the screen's primary result set, worse than the already-recorded item-detail instance because there is no drill-down context to make 100 rows tolerable. |
| 2 | MEDIUM | CONFIRMED (code) | What-fits (vehicle picker) | `vehicleLabel()` in `vehicle-picker.tsx` never includes `engine`, only `model + year(s) + trim`. Combined with the already-known NULL `trim`, this makes the vehicle picker itself ambiguous for any make/model with multiple engine variants — a real code gap (a populated field is silently dropped from the label), not only a seed-data artifact. |
| 3 | LOW | SUSPECTED | Part-reference | Grades screen is the sole path to populate `part_grades` (no seed/installer path, per the file's own header). A fresh auto-parts tenant that skips this screen ships with an empty grade dropdown on the item form. Not verified against a fresh-tenant DB this pass — flagged as a first-run risk to check, not a confirmed bug. |
| — | — | — | Part-finder | No findings. Correctly bounded results (`limit` ≤ 50), bounded fitment sample (5) with an honest overflow count instead of a dump, full keyboard nav, rate-limited, KWD 3dp-safe pricing, least-privilege reference-data permissions on the sibling screen. This is the reference implementation the other two screens should be judged against. |

## Answering the central question directly

- **Clerk names a car (What-fits):** 2 clicks to a result set, but if the named vehicle's
  family has broad fitment (plausible for common models — the water pump precedent already
  shows ~100), the clerk then faces an unscrollable-in-practice flat list with nothing to
  narrow it. Under 60 seconds only when the result set happens to be small; not guaranteed,
  and the UI gives the clerk no tool to fix it themselves.
- **Clerk holds a broken part (Part-finder):** yes, reliably under 60 seconds, first try —
  type, look, click. This is the strongest screen in the pack.
- **Reference data (grades/brands):** not a counter-clerk screen (it's back-office setup),
  but the CRUD flow itself is minimal-friction and correctly permissioned.

---

# Orchestrator verification of the What-fits HIGH (2026-08-26)

Agent claim verified and **upgraded on evidence**. The agent reported "up to 100 mixed-category
items with no narrowing tools". The live data shows every vehicle exceeds that cap, so the
screen is not merely un-narrowable — it **silently truncates its own answer**.

## Confirmed in code

- `apps/api/src/auto-parts/fitments/fitments.dto.ts:36`
  `limit: z.coerce.number().int().min(1).max(200).optional().default(100)`
- `apps/api/src/auto-parts/fitments/fitments.service.ts:175-176`
  `selectFamilyMatches(db, tenantId, query.vehicleId, query.limit)` then `return { data: [] }`
  — the response shape carries **`data` only. No `total`, no `hasMore`, no truncation flag.**
- `apps/web/.../what-fits-panel.tsx:268-269`
  flat `<ul>` + `results.map(...)`. No pagination, no search-within-results, no grouping.
  The only length check in the file is `results.length === 0` (the empty state).

## Confirmed in live tenant data

```sql
select count(*) as vehicles_with_fitments, max(n) as max_items, round(avg(n),1) as avg_items,
       count(*) filter (where n > 50) as over_50,
       count(*) filter (where n >= 100) as at_or_over_100_capped
from (select f.vehicle_id, count(distinct pd.item_id) as n
      from fitments f join part_details pd on pd.family_id = f.family_id
      where f.item_id is null group by f.vehicle_id) t;
```

| vehicles_with_fitments | max_items | avg_items | over_50 | at_or_over_100_capped |
|---|---|---|---|---|
| 4555 | 3383 | 641.5 | **4555** | **4555** |

**Every single one of the 4,555 vehicles returns at least 100 matching items.** The average is
641. The worst is 3,383. So on this tenant the 100-cap is not an edge case — it is hit 100% of
the time, and the user is shown an arbitrary 100 of 641 with nothing on screen saying so.

## Why this is HIGH rather than MEDIUM

"What fits this car?" is the question the screen exists to answer. It currently answers with a
silently truncated, unordered, unfiltered slice, and the API response has no field that would
even let the UI say "showing 100 of 641". A clerk who scrolls to the bottom and does not see the
part concludes the shop does not stock it. That is a wrong answer delivered confidently, not a
layout complaint.

The codebase already knows how to do this correctly: **part-finder** bounds its fitment sample
to 5 and renders an honest overflow count. What-fits should adopt the same pattern, plus
server-side pagination and at minimum a category filter.

## Data-quality caveat, stated so the fix is not over-scoped

This tenant has **17 part families for 5,000 items** (~294 items/family), and fitment is
family-scoped (`fitments.item_id` IS NULL on all 9,266 rows). Real catalogue data would have far
more families and thus smaller per-vehicle result sets. So the *magnitude* above is inflated by
seed shape. **The structural defects are not** — the missing total/hasMore, the absent
pagination, and the absent filters are properties of the shipped code and would matter at any
realistic family granularity.
