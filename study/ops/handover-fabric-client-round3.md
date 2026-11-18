# Handover: fabric/scarf client requirements, testing flow + round 3

You are taking over a multi-round build in the Zerupt ERP. Read this whole file before doing anything.

## 0. Ground rules (binding)
- Read `/Users/hus3ain/Development/Zerupt/CLAUDE.md` first (lazy-first ladder, delegation mandate, model policy, never-lazy list).
- Code repo: `/Users/hus3ain/Development/Zerupt/erp`. All work below is UNCOMMITTED in that working tree. **Do not commit, push, stash, checkout, reset, or create worktrees** unless Hussain explicitly asks in that message.
- Another session also has uncommitted work in the same tree (deleted direct-sale / direct-purchase / invoice-create files and ~50 removed i18n keys under `purchases.direct.list.*`, `sales.direct.*`, `nav.directPurchase`, `documentLookup.*-direct`). That is NOT ours. Don't touch or "restore" it.
- **Nothing hardcoded, ever:** no fixed lists, unit names (m, yd, roll, pcs), packs, conversions, brands, material types, thresholds or code series. Every list is tenant-defined data. Conversions are set per line in purchase, sales, POS, transfers, adjustments, production.
- **Industry standard beats the client's literal wording.** When a client point is less accurate than standard practice, build the standard version and flag the difference; Hussain explains it to the client (they have never used software, all manual).
- i18n ar+en (`en/` source of truth), CSS logical properties, no em dashes in copy, no text truncation, defensive UX states.
- Delegate heavy work to subagents (sonnet for building/testing, haiku for lookups). Implementation prompts must include the lazy-first ladder and reuse targets. Subagents write tests but don't run suites. Main loop runs targeted tests one file at a time (`cd apps/api && npx jest <fragment> --no-coverage`; web `npx vitest run <fragment>`), then a single typecheck. Check the exit code: api tsc can OOM with exit 134, so use `NODE_OPTIONS=--max-old-space-size=8192`.
- Parallel agents must own disjoint files, and only ONE agent may change schema / run `drizzle-kit generate` per round. After schema changes: rebuild `@zerupt/shared` + `@zerupt/db` (consumers read dist/), `pnpm --filter @zerupt/db snapshot:generate` + `snapshot:equivalence`.

## 1. Client and source document
- Client: Kuwait scarf/fabric retailer, brands Noura Scarf and MyChoice. 3 shops, 2 warehouses plus brand storerooms. Raw material = fabric rolls (yards/metres); finished goods = scarves (pcs).
- Requirements doc: `/Users/hus3ain/Downloads/NEW SOFTWARE POINTS (1).docx` (read with `textutil -convert txt -stdout "<path>"`). 34 points. **Every point must be verified working in the testing flow.**

## 2. Status of the 34 points (after rounds 1 and 2)
Legend: DONE = built + tests pass; STD = built as industry standard, which differs from the literal wording (explain to client); FU = round-3 follow-up.

| # | Point | Status / how it's satisfied |
|---|---|---|
| 1 | Stock by location + brand | DONE. Stock report groupBy location/brand, brand master. STD: brand is an item attribute, never a location (no warehouses nested under brands). |
| 2 | Price update import/export | DONE. Items list → "Update prices" (download, edit, upload, review, apply). Matches SKU/barcode/part no/alt code; sell, cost, active price lists; blank = unchanged; per-row statuses; audited; sync, 50k cap. |
| 3 | Purchase orders | DONE (pre-existing). |
| 4 | Sales order + pick list | DONE. Pick list now has PDF + WhatsApp. |
| 5 | Transfers, adjustments, m/yd + rolls | DONE. |
| 6 | Dashboard (payments, low stock, purchases, sales, P/L, shipments) | DONE (pre-existing). |
| 7 | Search: new barcode / name / old barcode | DONE. Old barcode = extra barcode or alternate code. |
| 8 | Raw material in length + rolls, others pcs | DONE. Rolls shown for production-pack tenants (roll = batch lot). |
| 9 | Reports show unit type | DONE. Stock report shows the item's own unit (and unitAlt in Arabic). |
| 10 | Brand master, addable | DONE. `/inventory/brands`, reuses `part_brands`, `items.brand_id` (migration 0581 backfills free text, case-insensitive dedupe). |
| 11 | Fabric/material type, filterable | DONE via item custom fields (create a "Material" select field; stock report filters `cf.<key>`). Category filter includes descendants. |
| 12 | PO in yards + rolls | DONE. PO detail line → "Plan rolls" (RollsGrid), table `purchase_order_line_lots`. |
| 13 | Per-roll yard entry on PO / stock add | DONE on PO plan, GRN, direct purchase, adjustment, opening stock. GRN-from-PO prefills unreceived planned rolls. |
| 14 | Receive from PO | DONE. |
| 15 | Import/export: adjustments, opening, prices, MOQ, rack | Mostly DONE. FU: per-warehouse reorder/max/MOQ import (must MERGE with existing `item_reorder_config`, never null safety stock / lead time / supplier). |
| 16 | Stock on hand next to qty on all lines | DONE (pre-existing). |
| 17 | Designable barcode labels, with/without price | DONE. Added print date + "Print sequence no." STD: a 1..N counter per print job, not a true serial. |
| 18 | Adjustment add/less | DONE. |
| 19 | Negative stock + auto reconcile | DONE (pre-existing). STD: allowed at POS, strict on transfers. |
| 20 | Transfers with Excel import | DONE. |
| 21 | Export PDF, Excel, WhatsApp | DONE: .xlsx on all reports + PO/items/transfers lists, PDF+WhatsApp for PO and pick list, WhatsApp on reports, exports follow chosen columns. FU: xlsx on the ~17 remaining export dialogs (invoices, bills, GRNs, returns, delivery orders, quotations...). |
| 22 | Page sizes 50/100/250/500 | DONE on main lists (25/50/100/250/500; 25 kept for phones). Heavy lists deliberately left at 100. |
| 23 | Hide zero, highlight <20 / >75, sort | DONE. STD: highlights = per-item min/max with tenant defaults (set the defaults to 20/75). Asc/desc toggle on code/name/qty. |
| 24 | Separate code series RM vs FG, old barcode | DONE. SKU sequence per category (give RM and FG their own category codes). |
| 25 | Extra cost per colour | DONE STD: each variant has its own cost; matrix editor "parent cost + amount" helper writes it once (no costing change). FU: allow a negative amount (final cost >= 0). |
| 26 | Item history | DONE (pre-existing stock movement ledger). |
| 27 | Scrap/leftover rolls | DONE STD: three states. Whole = never cut; Opened = cut and >= the item's offcut threshold (or any cut if unset); Remnant = below threshold. Stock report + offcut/remnant report. |
| 28 | Colour variant live stock | UNCONFIRMED. Verify in testing (variant matrix + per-warehouse stock). |
| 29 | Damage & return report by category | DONE (pre-existing). |
| 30 | Core fields incl. opening/closing, rolls | DONE. Opening/closing via the new `/reports/stock-movement-summary`. System code: DECIDED NOT TO BUILD (internal id is hidden; Hussain's call). |
| 31 | Report format customizable | DONE. Persisted per-user column chooser (`useReportColumnLayout`), on stock-levels + movement summary; other reports adopt with 2 lines. |
| 32 | Transfer report source/destination | DONE. |
| 33 | New items appear in reports at 0 | DONE. Stock report is items-first LEFT JOIN. |
| 34 | Creation date shown | DONE. Visible by default in the items list. |

Also built (founder asks beyond the doc):
- Packs everywhere, user-defined. Production movements, recipes and planned order quantities accept a saved pack or an ad-hoc per-line unit (migration 0582 adds unit snapshot columns to recipe/order input/output tables).
- Removed the hardcoded "PCS" default (new item defaults to the tenant's most-used unit; an empty tenant gets an empty required field). Removed `BASE_UNIT_WORDS`; imports match the item's own unit and pack names.
- "Roll" copy is now generic "lot", or the item's saved pack name via `features/shared/lots/lot-terms.ts`.

## 3. Production flow facts (for explaining and testing)
- Packs: stored in base units. Line snapshot = pack id, name, qty, factor. Ad-hoc "just this line" units never touch the item master.
- Rolls = `item_batches` with per-roll length lots.
- There is no transfer into a production location (blocked by design). Use production order **Issue**.
- JEs:

  | Event | Dr | Cr |
  |---|---|---|
  | GRN (unbilled) | 1141 | 2121 |
  | Bill | 2121 (+1162 VAT, 5210 PPV) | 2111 |
  | Landed cost | 1141 | 2111 / 1121 / 2122 |
  | Issue | 1146 WIP | 1141 |
  | Step cost | 1146 | 5510 |
  | Receive FG | 1141 | 1146 |
  | Waste over tolerance | 5220 | 1146 |
  | Close true-up | 1141 / 5230 | 1146 |
  | Sale | 5100 | 1141 |

  WAC per legal entity.
- RM and FG both post to 1141 (1143 unused). Multi-stage = two separate orders, with the intermediate held as normal stock.
- Enable: activate the production pack (forces batchTracking + packUnits, adds accounts 1146/5220/5230/5510/1193) and create a warehouse of type `production`.

## 4. YOUR TASK, in order

### Step A: write the in-depth testing flow (no code changes yet)
Give Hussain a step-by-step manual test script for local testing. It must cover:
1. Tenant setup: production pack, production warehouse, brands, Material custom field, categories with RM/FG codes, tenant low/high defaults 20/75, items (RM batch-tracked fabric with a user-named pack, FG scarf with colour variants).
2. One section per doc point 1-34, each with: where to click (route), exact inputs, expected result, and the accounts/stock to check where relevant. Mark which points are STD and the line Hussain can use with the client.
3. End-to-end scenarios:
   - Local RM purchase in packs (2 × 100 and 4 × 50) → PO roll plan → GRN prefill → bill → production issue by rolls and partial roll in a user pack → step cost → receive FG → waste → close → POS sale. Check the JEs at each step.
   - Foreign purchase with FX + landed cost → production → second-stage customization order → sale.
4. Packs/no-hardcoding checks:
   - Create a custom pack name and use it in purchase, sales, POS, transfer, adjustment, production issue/receive, recipe.
   - Confirm no "PCS"/"roll" appears unless the user typed it.
5. Exports: xlsx, PDF, WhatsApp; chosen columns respected.
6. Rolls: whole / opened / remnant after cutting.
7. Reports: stock levels, stock movement summary (opening = previous closing), roll register, offcuts, production WIP vs GL 1146.

Then WAIT for Hussain's results and any additional points.

### Step B: round 3. Fix his findings plus these follow-ups
1. Per-warehouse reorder / max / MOQ import+export, merging with existing config.
2. Optional plural pack name, with Arabic plural stored (schema). Show "5 Rolls".
3. Production order detail shows the pack and the base, e.g. "3 Roll (300 m)".
4. Stock movement summary: rolls as of the range end (needs an as-of query in `rolls-on-hand`); add PDF export.
5. Variant cost helper accepts a negative amount (final cost >= 0).
6. xlsx toggle on the remaining ~17 export dialogs (swap `downloadCsv` for `downloadExportFile` and add the toggle).
7. Dedicated i18n error for a missing unit in purchase import (instead of `REQUIRED_VALUE_MISSING`).
8. Update codemaps (reports, inventory, production; no production codemap exists yet).
9. Confirm point 28 (colour-variant live stock) and close it if there's a gap.

Then: targeted tests one file at a time, one typecheck (web + api), i18n:check, snapshot:equivalence, `study/ops/graphify/check-drift.sh` from the root repo (read the violation-count line). Report results. Do not commit until asked.

## 5. Key files touched (for orientation)
- Stock report: `apps/api/src/reports/stock-levels-report.{service,dto,rows,zero}.ts`, `stock-levels-rolls.service.ts`
- Movement summary: `apps/api/src/reports/stock-movement-summary.*`, web `features/reports/components/reports/stock-movement-summary/`
- Column layout and exports: `features/reports/lib/use-report-column-layout.tsx`, `report-hidden-columns.ts`, `use-report-csv-export.ts`, `lib/export/{xlsx-export,download-export,csv-parse}.ts`, `features/send-print/*share*`
- Rolls: `apps/api/src/inventory/batches/rolls-on-hand.ts`, `reports/{roll-rows,offcut-report.service}.ts`, `features/shared/lots/{rolls-grid.tsx,lot-terms.ts}`
- PO rolls: `apps/api/src/purchase/orders/po-line-lots.service.ts`, web `orders/order-detail/roll-plan-dialog.tsx`, `grns/grn-create-panel.tsx`
- Price update: `apps/api/src/inventory-import/price-update/`, web `features/inventory-import/components/price-update-*`
- Brands: `apps/api/src/inventory/brands/`, web `features/inventory/components/brands-panel.tsx`
- Units: `apps/api/src/inventory/items/tenant-units.ts`, `import/line-cell-readers.ts`, `production/movements/production-movement-units.ts`, `production/shared/production-plan-units.ts`, web `features/inventory/lib/use-default-unit.ts`, `features/production/lib/line-qty.ts`
- Migrations: `packages/db/drizzle/0581_amused_dracula.sql`, `0582_mature_thor.sql` (not applied to any real DB; apply to dev per the manual tenant-migration process when Hussain asks).
