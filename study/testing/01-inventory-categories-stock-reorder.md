# Inventory: Categories / Stock Levels / Reorder — Findings

Date: 2026-08-26
Scope: `/inventory/categories`, `/inventory/stock-levels`, `/inventory/reorder`
Method: code read end-to-end (services + shared helpers) + live SQL against the Gulf Auto Parts
tenant DB. Browser verification was attempted but the shared gstack browser instance was
contended by a concurrent session throughout this run (repeated "Another instance is
starting the server" / stale-ref failures even after fresh snapshots) and login could not be
completed reliably. UI-only claims below are marked SUSPECTED where I could not personally
observe the rendered screen; DB/code-level claims are CONFIRMED with inline evidence.

Ledger balance check before/after (no writes performed this session, code-and-DB-read only):
`select round(sum(debit-credit),6) from journal_entry_lines;` → `0.000000`. No writes made, so
no after-check was needed.

Warehouse → branch mapping (confirming method rule 3 before drawing any leak conclusion — none
were drawn, this is reference evidence only):
```
warehouse_code                       warehouse_name              type       branch_name
B1_AL_RAI_MAIN_SHOWROOM-MAIN         Al Rai Main Showroom        store      Al Rai Main Showroom
B1_AL_RAI_MAIN_SHOWROOM_TR           Transit                     transit    Al Rai Main Showroom
WH1_B1                               Shuwaikh Central Warehouse  warehouse  Al Rai Main Showroom
B2_FAHAHEEL_BRANCH-MAIN              Fahaheel Branch              store      Fahaheel Branch
B3_JAHRA_BRANCH-MAIN                 Jahra Branch                 store      Jahra Branch
B4_SALMIYA_SERVICE_CENTER-MAIN       Salmiya Service Center       store      Salmiya Service Center
```
Confirms the briefing: WH1_B1 ("Shuwaikh Central Warehouse") belongs to Al Rai despite its
display name suggesting a separate branch. No leak findings are reported for this reason in
this file.

---

## FINDING 1 — HIGH, CONFIRMED: stock-levels "Low" badge and the reorder screen disagree on 262 live (item, warehouse) rows, purely from a `<` vs `<=` comparator mismatch

**What defines "needs reorder" in each place (read end to end):**

- `apps/api/src/inventory/stock-levels/stock-levels.service.ts` `deriveStatus()`:
  `status = "Low"` when `items.reorderLevel !== null && onHand < reorderLevel` (strict `<`,
  raw `on_hand`, ignores `reserved_qty`/`in_transit`, ignores `item_reorder_config` entirely).
  This same predicate backs both the stock-levels list's per-item/per-location badge and
  `stock-levels.service.ts#getByItem` (item detail page's stock tab).

- `apps/api/src/inventory/reorder/reorder.service.ts` `triggerConditionSql` /
  `deriveStatus()`: an (item, warehouse) row is "low" when
  `effectiveAvailable = onHand - reservedQty + inTransit` is `<= reorderPoint`, where
  `reorderPoint = COALESCE(item_reorder_config.reorder_point, items.reorder_level, 0)`
  (non-strict `<=`, effective-available, config-aware).

- `apps/api/src/inventory/shared/low-stock-metric.ts` `countLowStockItemsByBranch()`: a THIRD,
  branch-grain definition, but this one is explicitly the shared fix for the earlier
  INV-OV-001 problem — its own header states it replaced two independently-computed,
  disagreeing definitions (dashboard tile vs reorder KPI) that also double/triple-counted
  multi-warehouse branches. It is imported by BOTH `dashboard.service.ts`
  (`lowStockCount`) and `reorder.service.ts#getKpis` (`itemsBelowReorder`). **CONFIRMED live
  in code:** `dashboard.service.ts:36` and `reorder.service.ts:47` both import
  `countLowStockItemsByBranch` from the same file, and `dashboard.service.ts:385` /
  `reorder.service.ts:432` both call it directly. So the Inventory Overview low-stock tile and
  the Reorder screen's own KPI strip are now the SAME number (INV-OV-001 as originally filed
  — dashboard tile vs reorder KPI — is fixed).

**What is NOT fixed:** the stock-levels screen's own "Low" status (badge + item-detail stock
tab) is a separate, un-unified fourth predicate, explicitly called out as intentionally
separate in the code comment ("itemStatusPredicate() ... remains a SEPARATE predicate by
design"). That is a reasonable design call for "status within one row" vs "count of items
needing action" — but it still means a user can see an item marked "OK" on Stock Levels while
that exact same (item, warehouse) row appears in the Reorder screen's suggestion list, purely
because on-hand equals the reorder point exactly (`<` vs `<=`).

**Live evidence (Gulf Auto Parts DB):**
```sql
-- rows where stock-levels status and reorder-trigger status disagree
select count(*)
from materialized_stock_levels msl
join items i on i.id = msl.item_id
where i.reorder_level is not null
  and (msl.on_hand < i.reorder_level) <> ((msl.on_hand - msl.reserved_qty + msl.in_transit) <= i.reorder_level);
-- => 262
```
Sample rows, all with `reserved_qty = 0` and `in_transit = 0` — confirming the disagreement is
purely the comparator, not the reserved/in-transit netting:
```
sku               reorder_level  on_hand  reserved_qty  in_transit
GAP-BRKDSC-03681  2.000000       2.000000 0.000000      0.000000
GAP-TYR-04861     21.000000      21.000000 0.000000     0.000000
GAP-FLTOIL-01671  9.000000       9.000000  0.000000     0.000000
GAP-BRKDSC-03940  24.000000      24.000000 0.000000     0.000000
GAP-TYR-03537     5.000000       5.000000  0.000000     0.000000
```
For every one of these 262 rows: Stock Levels shows the item as **OK**; Reorder shows the same
item/warehouse as **needing reorder** (status "low", `effectiveAvail(=onHand) <= reorderPoint`).
This is a fourth disagreeing low-stock predicate, and it is user-visible (a shop owner looking
at Stock Levels for `GAP-BRKDSC-03681` sees "OK" while the same item sits in their Reorder
queue) — not just an internal inconsistency.

**Fix recommendation:** either (a) change `deriveStatus()` in `stock-levels.service.ts` to use
`<=` and to read `item_reorder_config.reorder_point` when present (matching the reorder
screen's threshold source), or (b) if the two are meant to answer genuinely different
questions, say so explicitly in the UI (e.g. stock-levels badge tooltip: "below reorder point"
vs reorder screen: "at or below reorder point, including exact matches"). Currently nothing in
the UI explains the discrepancy, so a user has no way to know why the two screens disagree.

Severity: HIGH, not CRITICAL — no money/tenant-leak/data-loss involved, but it directly
contradicts the founder's "count/definition must never lie to the user" bar and affects real
reorder decisions (262 live rows in one tenant).

---

## FINDING 2 — INFO/GOOD: dashboard tile and reorder-page KPI are now unified (previously reported as disagreeing)

Confirmed via code: `dashboard.service.ts` and `reorder.service.ts#getKpis` both call the same
`countLowStockItemsByBranch()` (see Finding 1 evidence). The file's own header documents the
prior bug it replaced (double/triple counting across a branch's multiple warehouses — the
exact Al Rai 3-warehouse scenario the briefing warns about) and states this is now the single
authoritative branch-grain low-stock count. If INV-OV-001 was filed against dashboard-vs-reorder-KPI
specifically, that finding is resolved. Finding 1 above is the surviving, still-open gap
(stock-levels row status vs the unified KPI/reorder-list predicate).

One caveat noted directly in the code comment, worth flagging as a LOW/latent risk: the
branch-level threshold rollup sums `item_reorder_config.reorder_point` across a branch's
warehouses when config rows exist, but falls back to a single `items.reorder_level` taken once
via `MAX()` when no config exists. **Live check: `item_reorder_config` currently has 0 rows for
this tenant**, so this rollup logic is entirely untested against real data — the code comment
itself says as much ("this tenant has 0 rows in that table... revisit if it produces a
confusing number in practice"). Not a bug today, but flagging since it's explicitly
self-identified as an untested code path.

---

## FINDING 3 — MEDIUM, SUSPECTED (code-read, not browser-confirmed): reorder-generated PO items with no preferred supplier block the WHOLE batch, not just the unconfigured rows

`ReorderService.generatePo()` (`apps/api/src/inventory/reorder/reorder.service.ts`): if ANY row
in the selected batch lacks a `preferredSupplierId` (and no `fallbackSupplierId` was given), the
whole call throws `UnprocessableEntityException` naming every offending item, and NO purchase
orders are created for any supplier — including ones for items that DID have a configured
supplier. Given `item_reorder_config` has 0 rows tenant-wide today, EVERY item lacks a preferred
supplier unless the user supplies a single `fallbackSupplierId` for the whole batch (which only
works if all selected rows are meant to go to the same supplier). For a first-time user with a
mixed selection across multiple suppliers, "Generate PO" would currently always 422 unless they
first configure `item_reorder_config.preferred_supplier_id` per item — there is no partial-success
path ("create POs for the rows that have a supplier, list the rest as blocked"). Could not verify
the actual button/error copy in the browser this session (login contention); rating SUSPECTED
pending a UI check, but the all-or-nothing behavior itself is CONFIRMED by reading the service
code end to end.

---

## FINDING 4 — Categories: tree structure, delete-with-items, and cycle prevention — CONFIRMED safe

Read `apps/api/src/inventory/items/item-categories.service.ts` end to end.

- **Tree, not flat.** `listTree()` builds a real parent/child tree (`buildTree()`), max depth
  enforced via `MAX_CATEGORY_DEPTH` on both create and re-parent.
- **Delete with items referencing it:** correctly blocked, not silently orphaned.
  - If the category has child categories, delete is refused with a clear message ("Remove or
    move the subcategories first").
  - If the category has items, delete requires an explicit `reassignTo` — either `"none"`
    (uncategorize, sets `items.categoryId = null`) or a target category id (validated to exist,
    be active, and not equal to the category being deleted). Without `reassignTo`, delete is
    refused with a 409 telling the caller items must be moved or uncategorized first. This
    matches "assume dumb customers" — no dead-ending, no silent data loss.
- **Cycle prevention:** re-parenting locks the tenant's category rows `FOR UPDATE` inside a
  transaction, loads the full graph, and calls `isDescendantOf()` before allowing the move —
  moving a category beneath its own descendant (which would create a cycle) is rejected with a
  400 ("Cannot move a category beneath one of its descendants"). Setting a category as its own
  parent is rejected explicitly (`newParentId === categoryId` check) before the graph walk even
  runs. The `FOR UPDATE` lock means concurrent re-parents can't race into a cycle either — each
  serializes and re-validates against the committed tree. This is solid, no findings here.

No live browser confirmation this session (contention), but this is a full code-path read
(create/update/delete all traced, transaction boundaries verified) — rated CONFIRMED per method
rule 1's allowance for "the code path read end to end" as valid evidence.

---

## FINDING 5 — LOW/FRICTION, SUSPECTED: reorder screen's "generate PO" flow forces a single order date + single branch for a mixed-supplier batch

Not fully explored (browser contention), but `GeneratePoInput` in the service signature takes
one `branchId` and one `orderDate` for the whole batch of selected reorder rows, then groups by
resolved supplier downstream in the Purchase module's listener. That's reasonable (one intent
event, purchase raises one draft PO per supplier), but means a user cannot select rows across
two branches in a single "generate PO" action — worth a UI check to confirm the reorder list is
itself branch-scoped (it is — `suggestionsScope = branchScopeCondition(...)` is applied in
`getSuggestions`), which would make this a non-issue in practice since the screen never shows
mixed-branch rows to begin with. Downgrading to FRICTION/not-a-bug on this basis, but flagging
for whoever does the live UI pass since I couldn't confirm the branch selector behavior visually.

---

## Not completed this session (browser contention)

The shared gstack browser instance was contended by a concurrent agent session for the
duration of this run (repeated "Another instance is starting the server" and stale-ref
failures immediately after fresh `snapshot` calls; login never completed). The following
checklist items from the briefing (sections B, D, E, F) were NOT independently verified in the
browser this session and should be picked up by a follow-up pass:
- Permission gating live behavior (route gate + `@RequiresPermission` parity, `cost.view` strip
  in the rendered UI) for all three screens — code-level gates were not inspected this session
  either (time-boxed to the low-stock-definition and categories investigation per the task's
  explicit focus areas).
- KWD 3-decimal rendering on-screen (stock-levels total value, reorder suggested-PO-value KPI).
  The backend consistently returns `.toFixed(6)` string decimals for money/qty fields (see
  `reorder.service.ts` `toFixed(6)` throughout, `stock-levels.service.ts` allocated-value SQL
  casts to `::text`) — full precision is preserved server-side, but whether the frontend
  formatter renders 3dp KWD correctly was not visually confirmed.
- i18n/RTL completeness on all three screens.
- List behavior (pagination edges, search, filters, sort, empty/error states) beyond what the
  service code implies (stock-levels and reorder both implement server-side pagination with
  parallel COUNT, confirmed in code; not confirmed live).

## Summary

- Confirmed via code + live SQL: the stock-levels "Low" badge disagrees with the reorder
  screen's own trigger on 262 live (item, warehouse) rows in this tenant, purely due to a
  `<` vs `<=` comparator difference (Finding 1, HIGH).
- Confirmed via code: the dashboard tile and reorder-page KPI are unified on one shared
  branch-grain definition (`countLowStockItemsByBranch`) — the disagreement between those two
  specifically appears already fixed (Finding 2).
- Confirmed via code: categories are a real tree, deletion is safely gated (blocks on child
  categories, requires explicit reassignment for items, no orphaning), and cycles are
  structurally prevented under a row lock (Finding 4).
- Suspected, needs live UI confirmation: reorder's generate-PO all-or-nothing supplier
  validation (Finding 3), and reorder's implicit single-branch generate-PO flow (Finding 5).
- Live browser verification (permissions, 3dp money rendering, i18n/RTL, list UX) is
  outstanding due to shared-browser contention this session — flagged for follow-up, not
  claimed as tested.
