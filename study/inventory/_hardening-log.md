# Inventory Module Hardening — Overnight Log (started 2026-06-27)

> Founder mandate (2026-06-27): the accounting module is perfected (layers 0-5 done, see
> study/accounting/). Repeat the SAME process for the ENTIRE inventory module. Goal: a
> customer who wants ONLY inventory (assume no other module exists) can run their stockroom
> single-handedly — exactly as an accountant can run accounting standalone. For EACH layer:
> (1) subagent writes study material, (2) full audit identifying gaps, (3) harden the layer —
> 100% concrete & stable for 10 years, think like a stockkeeper/inventory manager, (4) apply
> all required migrations to dev tenant DB + push to prod, (5) commit + merge branch to main,
> (6) next layer. No tech debt, no follow-ups, permanent fixes. Use subagents; subagents must
> NOT spawn their own subagents. Preserve context + tokens (subagents write detail to /tmp,
> return terse summaries). Full review in the morning. Run AUTONOMOUSLY end-to-end.

## Guiding principles (apply to EVERY layer + audit)
1. **Think like a stockkeeper / inventory manager.** Assume a real warehouse/retail operator
   uses this standalone. Design for how they actually work: accurate on-hand at all times,
   audit trail for every movement, corrections via reversal/compensating entry (never delete),
   physical-count reconciliation, lot/batch & expiry discipline (grocery/pharma), drill-down
   from balance to movement. Correctness of quantity AND value is non-negotiable.
2. **Scalability / never-revisit.** When stuck on a decision, pick what will ALWAYS work at
   scale so we never revisit. The dimensional granularity of the stock ledger (item × location
   × lot/batch × serial × bin) is THE 10-year decision — get it permanently right. Permanent
   over expedient.
3. **Modular packaging (long-term).** Inventory must be a clean, self-contained CORE module.
   Dependency direction: inventory depends DOWN into accounting (via events/outbox) and never
   UP into POS/sales/purchase. Other modules depend on inventory. Watch dependency direction +
   module boundaries in every audit so inventory can be packaged & sold alone. (Map confirms
   this already holds — protect it.)

## Initial map (from read-only survey 2026-06-27 — verify per layer, don't trust blindly)
- `stock_ledger_entries`: IMMUTABLE append-only spine (no updatedAt; compensating-row
  corrections). `materialized_stock_levels` updated transactionally alongside each write.
- Ledger dimensions: itemId × warehouseId × branchId × legalEntityId. **NO lot/batch/serial/bin
  dimension on the ledger.** `inventory_cost_layers.batchId` exists but **no FK (tech debt)**.
- Batch (`item_batches`: batchNo/expiry/mfg/status) + serial (`item_serial_numbers`) schema
  fully built, BUT enforcement deferred — `trackingType='none'` is MVP default.
- Valuation: WAC only active (incremental on materialized_stock_levels). FIFO schema
  (`inventory_cost_layers`) built but DORMANT. COGS computed in InventoryEventListener,
  posted DR COGS / CR Inventory Asset via transactional outbox.
- No general reservation/ATP table (only `inTransit` for transfers; serial `reserved` status).
- UOM/pack-units fully built; base unit canonical; line snapshots conversionFactor at posting.
- Handoff: one-way event-driven inventory → accounting (EventEmitter + durable outbox). Clean.
- apps/api/src/inventory/ modules: items, item-categories, batches, serial-numbers, price-lists,
  promotions, stock-levels, stock-adjustments, transfers, stock-counts, reorder; services:
  inventory-costing, inventory-domain.listener, inventory-event.listener, landed-cost.listener.

### Layer 1 — Master data (✅ COMPLETE, merged main 067e70d1)

**Audit findings** (full: /tmp/inventory-hardening/layer-1-audit.md). Conflict resolved by reading
code: trackingType change IS hard-blocked (items.service.ts:481-493 throws) — study writer's
"CRITICAL not blocked" was WRONG, auditor correct. Real gaps:
- F1 HIGH — items.unit (canonical base UOM) mutable after movements exist → silently reinterprets
  all ledger history (pcs→kg). The standout fix.
- F2 MED — items.valuationMethod editable directly, bypasses item_costing_configs change-tracking.
- F3 MED — serials unique per (tenant,item) but resolveForSale/warrantyLookup query by serialNo
  alone + take row[0] → wrong item on shared serial (IMEI ambiguity).
- F4 MED — sku/trackingType immutability guards are app-layer + non-transactional (TOCTOU race).
- F5 MED — category cycle/depth check in-memory, non-serialized (concurrent re-parent corrupts tree).
- F6 LOW — barcode uniqueness case/whitespace-sensitive (SKU normalized lower/btrim, barcode not).
- F7 LOW — bulkSetStatus audit fire-and-forget outside tx.
- F8 LOW — batchNo unique includes warehouseId → same physical lot in 2 warehouses = 2 master rows.
- G1 (study) — matrix variants schema-complete but item_attributes table absent (half-feature).
- G3 (study) — items.unit free-form varchar, no global UOM registry.

**Locked decisions for Layer 1:**
1. Add nullable bin_id FK to stock_ledger_entries + sle_bin_id_idx (closes Layer-0 deferral; auditor
   + study confirm safe — bins table exists, nothing references it, backfill-free).
2. Valuation-critical item immutables (unit, sku, trackingType, valuationMethod) locked behind ONE
   transactional + DB-trigger guard keyed on "ledger/batch/serial history exists" (fixes F1, F2, F4
   permanently, non-bypassable). Service keeps friendly pre-checks too.
3. Matrix variants: BLOCK matrix_parent/matrix_variant creation at service with clear "not yet
   available" (avoid shipping a half-feature) until item_attributes is built. (mirrors FIFO guard.)
4. Global UOM registry (G3): DEFER as founder decision (bigger feature); normalize items.unit
   (lower/btrim) on CREATE only (unit becomes immutable after).
5. Items stay tenant-wide (no legalEntityId) — intentional shared catalog for multi-entity tenants.

**GO-LIVE RUNBOOK item (DB review HIGH, not a code fix):** migration 0112 swaps two unique indexes
to normalized form (item_barcodes → lower(btrim(barcode)); item_batches → (tenant,item,
lower(btrim(batch_no))), warehouseId dropped from key). On a POPULATED tenant this ABORTS the
migration if existing rows collide only by case/whitespace, or if two batch rows differed only by
warehouseId + share a normalized batch_no. Safe now (dev empty, no live prod tenants per
project_books_import_template). Before any go-live with real tenant data: run the HAVING count(*)>1
dup probes per tenant as a pre-flight (Pacific Co reconciliation gate). Detection queries are in the
0112 header comment.

### Layer 2 — Movement engine + reservations/ATP (✅ COMPLETE — split into sub-layers; 2a 6e518eb1 / 2b 36097aed / 2c 6c08cea4)

Founder ruling 2026-06-27: full scope, split into separately committed+merged+validated sub-layers.
Audit (full: /tmp/inventory-hardening/layer-2-audit.md) — 2 CRITICAL + reservations gap. NOTE: the
audit corrected the Layer-0 log's claim — batch/serial attribution was actually missing on ALL paths
(including "inventory-native"); the Layer-0 chokepoint never fired. This layer makes it real.

Findings → sub-layer assignment:
- **2a (attribution + FEFO + one-engine):** F1 CRITICAL (attribution dropped by every caller —
  chokepoint dead), F2 CRITICAL (POS mutates item_batches.qtyRemaining directly, divergent from
  ledger), F4 HIGH (serial_number_id never populated), F6 MED (event contracts can't specify batch/
  expiry at receive), F7 MED (FEFO only in POS), F10 MED (POS batch decrement + ledger in different
  tx), F11 LOW (negative-stock policy in 2 places), F12 LOW (reconcileBatchRemaining O(history)).
  Fix = add required trackingType + batchId/serialNumberId to StockMovement + all payloads +
  inventoryDomainLine; attribute in EVERY caller (POS/sales/credit-note/GRN/purchase-invoice/return/
  adjustment/transfer/opening); delete POS parallel decrementBatchQty; centralize FEFO picker;
  POS batch+ledger same tx. Multi-batch sale needs multi-entry fan-out.
- **2b (reservations/ATP):** F3 HIGH — build stock_reservations table + reserve/release + ATP
  (on_hand − reserved + incoming); no model exists today.
- **2c (transfer lifecycle + reversal wiring):** F5 HIGH (adjustment decrease on serial/batch must
  retire unit/lot), F8 MED (transfer cancel-SENT + in-transit timeout + short-receipt write-off),
  F9 MED (wire stockLedger.reverse() to adjustment/sent-transfer corrections).

Module boundary confirmed healthy (inventory depends DOWN only). Per sub-layer: harden → reviewers →
dev-PG validate → real boot → merge, before the next.

**Sub-layer 2a IMPLEMENTED (2026-06-27, code-only, NO migration).** Full detail:
`/tmp/inventory-hardening/layer-2a.md`. Summary:
- New `BatchPickerService.pick()` (F7, ledger-derived FEFO, multi-lot fan-out) +
  `MovementAttributionService` (F1/F4/F6/F7 — single expander, resolves trackingType from item
  master, find-or-create lot on receipt, serial |qty|=1 rows, cost-preserving multi-batch fan-out,
  distinct deterministic eventIds, best-effort logged fallback so shipped serial/batch flows stay green).
- Engine listener routes applyInbound/applyOutbound through `recordAttributed`; **F11** dup
  negative-stock pre-check removed (sole authority = decrementOutbound).
- **F2/F10**: POS `decrementBatchQty` mutation DELETED; POS emits batchId/serialNumbers on
  inventory lines (buildLineItems); qtyRemaining now purely ledger-derived; batch+ledger one tx.
- **F12**: qtyRemaining maintained incrementally (incrementBatchRemaining, idempotent via
  insert-detection); reconcileBatchRemaining kept for the Layer-0 detector only.
- Adjustments (increase/decrease, opening) + transfers (send/receive/shortfall) routed through
  attribution. Contracts extended (inventory.types + domain line).
- Tests: +21 new (batch-picker 4, attribution 14, POS attribution 3); updated listener/adj/transfer
  specs. typecheck + nest build clean; broad sweep `jest inventory pos sales purchase` =
  91 suites / 1861 tests green.
- KNOWN follow-ons (deliberate, not debt): GRN/sales builders don't yet forward batchNo/serials
  (those channels take the logged fallback for tracked items; POS fully attributed); serial/lot
  RETIREMENT on adjustment-decrease + batch transfer_in lot-threading handled in 2c.
- Reviewers + dev-PG validation + real boot + merge all subsequently DONE (merged main 6e518eb1).

### Tracked follow-ups (file-size hygiene — pre-existing, deferred to avoid risky financial refactors mid-layer)
- apps/api/src/sales/orders/sales-orders.service.ts (~1284 lines)
- apps/api/src/inventory/transfers/stock-transfers.service.ts (~1576 lines)
- apps/api/src/inventory/stock-adjustments/stock-adjustments.service.ts (~1341 lines)
- apps/api/src/inventory/items/items.service.ts (~1044 lines)
These exceed the 800-line guideline due to PRE-EXISTING bulk; each hardening layer extracted the
cleanly-separable pieces (ItemBarcodes/ItemPackUnits, InventoryReversalService, reserve/releaseForOrder).
Remaining extraction (cancelSent/reverse → operation files, etc.) is a mechanical refactor best done as
its own pass, NOT bundled into a financial-correctness layer. Behavior is correct + tested.

### ⚠️ FOUNDER MORNING-REVIEW FLAG — pre-existing CRITICAL found during Layer 3
**Live POS sales relieve neither inventory nor COGS.** The live POS pay/complete path
(pos-transactions.service.ts ~:898 emitTransactionCompleted) emits ONLY the revenue/tax/cash/AR
accounting JE (buildTransactionCompletedJePayload — no COGS/inventory line) and NEVER emits
POS_DOMAIN_EVENTS.TRANSACTION_COMPLETED, so inventory-domain.listener fanOutSale never fires →
on_hand is never decremented and no DR COGS/CR Inventory posts for the PRIMARY retail channel.
Effect: inventory asset overstated, COGS understated, margin overstated, continuously. buildLineItems
existed but was test-only. This broke the standalone-inventory promise → FIXED in Layer 3 (merged b4dc47b5):
live POS sale/return/void + offline sync now emit a dedicated `.inventory` domain event → existing
fanOutSale relieves stock + posts DR COGS/CR Inventory (idempotent, serial/batch-attributed, negative
allowed at till, void-after-return blocked). Durable poller re-fan-out added (emitAsync) so it's
crash-durable across POS+sales+purchase. Prod has no live tenants yet so no historical corruption.
**FOUNDER: still VERIFY POS stock-relief end-to-end on a real dev tenant before go-live** (the
reviews were code+test-level; a real POS sale → on_hand drop + COGS JE has not been exercised on a
live DB this session).

### Layer 3 DEFERRED items (founder decisions / follow-ups — NOT bugs):
- **F5 IAS 2 NRV / lower-of-cost-and-NRV write-down**: no mechanism exists; needed for pharma/grocery/
  seasonal. Decide: build (a value-only write-down op DR 5200/CR inventory) or document deferral.
- Serial POS-return physical relocation (serial not threaded on return lines → restocks at blended
  cost; COGS reversal value is already correct). Needs DTO/UI for which-serial-on-partial-return.
- Service file-size extractions (see tracked follow-ups below).

### Layer 3 findings (full: /tmp/inventory-hardening/layer-3-audit.md + study ch00-09)
WAC-only LOCKED permanently (no FIFO, no cost-layer occurred_at). Fixes: landed-cost JE → outbox
in-tx (was crash-losable); FIFO selectability removed (dead-end); serial relief at specific cost
(GL==subledger); negative true-up extended to transfer_in/sale_return; sale-return COGS at original
cost. Reviewer-caught: costAtSale mixed per-unit/total semantics (regression, fixed wave A →
normalized per-unit); POS costs-Map mutation; shared cost helper. F5 NRV/write-down DEFERRED (founder
decision — IAS 2 lower-of-cost-and-NRV not built).

### Layer 4 — Counts & period integrity (✅ COMPLETE, merged main e38f96fb)

**Audit findings** (full: /tmp/inventory-hardening/layer-4-audit.md): F1 CRIT (count posts variance as a
blind DELTA vs LIVE on-hand, not set-to-counted → sales during the count silently leave on-hand wrong),
F2 CRIT (approvePost = up to 4 separate stockAdjustments.create calls each own tx + separate header flip,
no wrapping tx/row-lock → partial-failure retry or concurrent reviewers double-post stock+GL), F3 HIGH
(no inventory period cutoff/as-of: counts have no occurredAt, post at `now`; can't book shrinkage into the
period counted), F4 HIGH (detectQuantityVariances = 1 manual endpoint; detectReservedQuantityVariances has
NO endpoint/scheduler = dead; no cron → standalone operator never sees cache/ledger drift), F5 MED (count
shortage posts allowNegative=true, silently bypasses strict policy), F6 MED (items absent from snapshot can't
be counted; recount/full-completeness unenforced), F7 MED (stored variance VALUE uses stale WAC vs GL),
F8 LOW (negative policy tenant-wide only), F9 LOW (standalone inventory hard-deps accounting fiscalPeriod —
allowed DOWN dep; confirm provisioning seeds an open period).

**Locked decisions for Layer 4 hardening:**
1. **F2 (atomic+idempotent post):** extract an internal `postAdjustmentInTx(tx, ...)` core from
   StockAdjustmentsService.create (applyLines + header insert + outbox enqueue), then approvePost wraps the
   WHOLE post in ONE tenant tx: `SELECT ... FOR UPDATE` count header first, strict status guard
   (pending_review only; posted → no-op return), call postAdjustmentInTx for each (≤4) batch + the
   serial→defective transition + header flip to 'posted' all inside that tx. One atomic unit = no partial,
   no concurrent double. create() keeps its public behaviour (opens its own tx, calls the same core).
2. **F1 (set-to-counted):** at approvePost, for NON-serial lines re-read LIVE on_hand inside the locked tx
   and post `adjustmentQty = countedQty − liveOnHand` (count = truth), not the frozen line.varianceQty. Keep
   frozen systemQty for audit/display; log/flag drift when live ≠ frozen. Serial lines already reconcile vs
   live expected serials at post — leave as-is.
3. **F3 (as-of/period):** migration 0114 adds `stock_counts.count_date timestamptz` (business/effective date
   of the physical count; default createdAt for existing). Thread count_date → adjustment occurredAt via
   postAdjustmentInTx; assertPeriodOpen already bounds backdating into closed periods. No inventory-period
   table (overkill) — bounded as-of date is the minimal permanent fix. count_date ≤ now (DTO).
4. **F4 (detectors live):** expose a reserved-variance endpoint; add ONE scheduled detector (reuse the
   batch-expiry-scheduler pattern) running both detectors per active legal entity, logging/alerting when not
   inSync. No new tables.
5. **F5:** keep allowNegative for counts (count IS truth) but record/warn when a count drives on_hand
   negative under strict policy (documented carve-out, not silent).
6. **F6:** block posting a `full` count that still has recount-flagged or null-counted lines (cheap
   completeness guard). Found-item-not-in-snapshot (add lines for unstocked items) = FOUNDER DECISION /
   deferred feature, not a correctness bug — surface, don't silently build.
7. **F7:** recompute line varianceValue at post from current WAC so the document value matches the GL it
   produced.
8. F8 (per-item/per-warehouse negative policy) + F9 (confirm provisioning seeds an open fiscal period) =
   surfaced for founder; F8 deferred (MVP tenant-wide acceptable), F9 verified during dev-PG validation.

**Layer 4 COMPLETE (merged main e38f96fb, migration 0114).** Implemented all locked decisions + reviewer
fixes. Reviewer panel (5, opus): code-reviewer + nestjs-reviewer both caught **C1 CRITICAL** — the new F4
recon @Cron scheduler called a tenant-DB-resolving method with NO tenant ALS context (getTenantDb throws
outside tenantStore.run) → every nightly sweep silently failed while logging success. accounting-reviewer
caught **HIGH** — zero-WAC found-increase threw "unitCost required", and because F2 made the post one atomic
tx that single item rolled back the WHOLE count. Both fixed in the review-fix wave:
- C1: scheduler now injects TenantDbResolverService + wraps each tenant in tenantStore.run(systemContext)
  (mirrors zatca-reporting.worker.ts); spec asserts detectors run inside ALS.
- HIGH: count post resolves fallback unitCost (items.costPrice, else 0+warn) for zero-WAC found lines.
- M1 doc-number reservation leak (loop moved inside try); LOW serial-vs-strict carve-out
  (forceNegativePolicy on count decreases); L3 F7 rounding; L2 orphan comment; M2 approvePost helpers
  extracted (computeNonSerialBatches/computeSerialBatches).
- G3 (study-writer flag): one active count per warehouse guard added in create().
DB review: migration 0114 SAFE (now() STABLE → fast-path ADD COLUMN, no rewrite; journal/snapshot
consistent). Gates: dev tenant migrated + real-PG validated (count_date timestamptz NOT NULL default now());
real `node dist/main` boot DI gate PASSED (scheduler "cron registered", both controllers resolved); broad
sweep 97 suites / 1940 tests green.
**Layer 4 DEFERRED / founder follow-ups (surfaced, not bugs):**
- **BatchExpirySchedulerService has the IDENTICAL C1 latent flaw** — calls a tenant-DB-resolving method from
  @Cron without tenantStore.run → batch-expiry alerts likely never fire either. NOT fixed (out of Layer 4
  scope). HIGH-value standalone follow-up.
- F6 found-item-not-in-snapshot (add count lines for unstocked/post-snapshot items) = deferred feature.
- F8 per-item/per-warehouse negative-stock policy (tenant-wide today).
- DB MED: add an index on stock_counts.count_date when Layer 5 date-range/period query predicates are locked.
- M1-nestjs: leaky public seam (6 StockAdjustmentsService methods made public for cross-service tx reuse) —
  ACCEPTED (same-module, minimal change); revisit with an AdjustmentPostingCore collaborator if it spreads.

### Layer 5 — Reporting (✅ COMPLETE, merged main 6b98fa34) — FINAL LAYER

**Audit findings** (full: /tmp/inventory-hardening/layer-5-audit.md): all 5 report families EXIST but
tie-to-ledger + as-of are the systemic gaps. F1 CRIT (valuation + stock-levels read ONLY
materialized_stock_levels cache, never reconcile to Σledger, no drift flag), F3 CRIT (movement ledger orders
AND date-filters by createdAt not occurredAt → backdated entries mis-periodised + excluded; correct
occurredAt index exists, unused), F2 HIGH (no as-of/point-in-time valuation — asOfDate echoed only; year-end
stock value impossible), F4 HIGH (running balance resets to 0 per page; sourceModule filtered AFTER
pagination while meta.total counts unfiltered → pagination lies), F5 HIGH (expiry report reads qtyRemaining
projection + excludes already-expired stock → expired on-shelf stock invisible), F6 HIGH (slow-moving/
dead-stock aging report ABSENT), F7 MED (no standalone count-variance report), F8 MED (reorder uses on_hand
only, ignores ATP reserved+incoming), F9 MED (no legal-entity dimension in valuation/stock-levels/reorder),
F10 MED (in-app pagination/unbounded fetch in reorder; per-page count in ledger), F11 LOW (negative on-hand
silently folded into valuation total), F12 LOW (reorder imports PurchaseOrdersService = inventory→purchase
UP dependency, packaging violation).

**Locked decisions for Layer 5 hardening:**
1. **F1 + F2 (tie valuation to ledger + as-of):** the permanent answer is ledger-derived valuation. As-of
   qty = Σ ledger.quantity WHERE occurredAt ≤ asOf; as-of VALUE = Σ signed ledger.total_cost WHERE
   occurredAt ≤ asOf, grouped by (item,warehouse) — this is the moving-average running inventory value, ties
   to the ledger BY CONSTRUCTION and is historically correct (no "current WAC × old qty" approximation).
   Use sle_item_warehouse_occurred_at_idx. For the "now" valuation keep the materialized cache for speed BUT
   cross-check against detectQuantityVariances and surface a "ledger drift detected" flag per drifting row +
   a summary banner (reuse the recon detector; do NOT silently show a drifting cache).
2. **F3 + F4 (movement ledger):** order by occurredAt (createdAt tiebreak) + date-range filter on occurredAt;
   seed page running-balance with opening = Σ ledger.quantity WHERE occurredAt < window-start (one indexed
   query); push sourceModule into SQL WHERE (map module→docType in-list) so count + page + filter agree.
3. **F5 (expiry):** add an "expired (not yet written off)" bucket (expiryDate < today AND qtyRemaining > 0);
   tie displayed qty to Σledger by batch_id where attribution present.
4. **F6 (aging):** NEW slow-moving/dead-stock report built from the ledger — max(occurredAt) per
   (item,warehouse) over outbound movement types, bucketed by age. Pure read over the occurredAt index.
5. **F7:** count-variance report endpoint aggregating POSTED count lines (countedQty − systemQty × WAC).
6. **F8:** reorder effective-available = on_hand − reserved_qty + incoming(open PO + inTransit); suggest off
   ATP. **F10:** reorder → SQL LIMIT/OFFSET + SQL count (no in-app slice); ledger keep count but optional.
7. **F9:** add optional legalEntityId filter to valuation/stock-levels/reorder. **F11:** surface negative-value
   count/flag in valuation summary.
8. **F12 (reorder→purchase UP dep) = FOUNDER DECISION / DEFERRED packaging item** — not a correctness bug,
   not a report; event-ifying PO creation is an architectural change for a dedicated packaging pass. Surface,
   don't fix this layer.
Reports are read-only and don't pull inventory UP (boundary clean except F12). No migration expected (reports
are queries); add count_date / occurredAt indexes only if a reviewer flags a real scan.

**Layer 5 COMPLETE (merged main 6b98fa34, migration 0115).** All locked decisions implemented across 5
parallel harden waves (disjoint files): valuation tie-to-ledger + as-of (Σ signed total_cost), movement
ledger occurredAt + seeded running balance + SQL sourceModule, batch expiry expired-bucket + G4 scheduler ALS
fix, NEW stock-aging report, NEW count-variance report, reorder ATP + SQL pagination. Reviewer panel (5:
code/accounting/nestjs/db/api) — nestjs clean; the rest found blockers, all fixed in one fix wave:
- **db C1 / code HIGH:** SQL injection in stock-aging (sql.raw `'${tenantId}'`) → bound param.
- **accounting HIGH#1:** "now" valuation flagged only QUANTITY drift, not VALUE drift vs GL's Σ signed
  total_cost → "now" path now values FROM the ledger (same as as-of); cache used only to flag qty+value drift.
- **accounting HIGH#2:** F7/count varianceValue understated for zero-WAC found items (0 vs GL's resolved found
  cost) → count post now values found legs at resolveFoundUnitCost (document + report match GL).
- **api HIGH:** stock-aging double-nested {data:{data}} envelope → DTO field data→rows, return service result.
- **db H2:** stock-aging ran the full-ledger CTE twice → single scan, page/total/summary derived in-app.
- **db H3:** sequential per-entity drift detection → Promise.all. + asOf date-regex validation, pagination
  tiebreaks, movement-ledger dateFrom≤dateTo refine, inArray for batch ledger, limit caps.
- **MIGRATION 0115** (founder principle: permanent index, not deferred): sle_legal_entity_occurred_at_idx
  (legal_entity_id, occurred_at) supports the as-of valuation + aging full-ledger aggregates at 10-yr scale.
Gates: dev migrated + real-PG validated (index present); real `node dist/main` boot DI gate PASSED
(stock-aging controller + both schedulers resolved); broad sweep 119 suites / 2372 tests green.
**Layer 5 DEFERRED / founder follow-ups (surfaced, not bugs):**
- **F12 — reorder.service imports PurchaseOrdersService (inventory→purchase UP dependency).** The ONE
  remaining module-boundary violation blocking clean inventory packaging. Fix = event-ify PO creation / move
  to a purchase-side orchestrator. Dedicated packaging pass (not a correctness bug).
- IAS 2 NRV / lower-of-cost-and-NRV write-down still UNBUILT (Layer 3 deferral) — touches valuation+reporting.
- Movement-ledger high-page OFFSET sub-scan (limit capped at 100; keyset pagination = future optimisation).
- File-size: stock-counts.service.ts (>800 lines) + other tracked oversized services — mechanical extraction pass.
- Permission-naming split (reports.operational.view vs inventory.stock.read) — RBAC-matrix consistency.

## 🏁 PROGRAM COMPLETE (2026-06-27)
All 6 layers (0,1,2a/2b/2c,3,4,5) audited + hardened + reviewer-panelled + dev-PG-validated + real-boot-gated
+ merged to main + pushed. The inventory module now runs as a standalone, ledger-true core: immutable
append-only stock ledger with full batch/serial/bin dimensions; enforced movement attribution + FEFO;
reservations/ATP; WAC valuation with crash-durable GL handoff via outbox; atomic period-aware counts;
nightly reconciliation; and reports that tie to the ledger by construction. Remaining items are all
founder-decision features or packaging/optimisation follow-ups (above), NOT correctness gaps.
**TOP FOUNDER ACTIONS:** (1) verify live POS stock-relief end-to-end on a real dev tenant before go-live
(Layer 3/4 — reviews were code/test-level); (2) decide F12 packaging fix + IAS 2 NRV; (3) go-live runbook
items (0112 normalized-index dup pre-flight on populated tenants).

## Layer status

| Layer | Study | Audit | Hardening | Migrations (dev+prod) | Merged to main |
|-------|-------|-------|-----------|-----------------------|----------------|
| 0 Stock ledger foundation | ✅ ch00-09 | ✅ (9 findings + OQ-03) | ✅ | ✅ dev validated on real PG (trigger blocks UPDATE on real row; constraints convalidated) + prod via Railway | ✅ 310967be |
| 1 Master data (items/UOM/locations) | ✅ ch00-09 | ✅ (F1-F9, G1/G3) | ✅ | ✅ migration 0112 dev validated on real PG (items trigger proven: no-history allowed, with-history blocked) + prod via Railway | ✅ 067e70d1 |
| 2a Movement attribution + FEFO | ✅ ch00-09 | ✅ (F1/F2 CRIT + F4-F12) | ✅ | n/a (no migration — code makes Layer-0/1 spine live) | ✅ 6e518eb1 |
| 2b Reservations + ATP | ✅ ch08 | ✅ (F3 + design) | ✅ | ✅ migration 0113 dev validated on real PG (2-conn last-unit race: no oversell) + prod via Railway | ✅ 36097aed |
| 2c Transfer lifecycle + reversal | ✅ ch04/05 | ✅ (F5/F8/F9, code-only) | ✅ | n/a (no migration) | ✅ 6c08cea4 |
| **3 Valuation & costing + GL handoff** | ✅ ch00-09 | ✅ (F1-F9 + POS-COGS critical) | ✅ | n/a (no migration) | ✅ b4dc47b5 |
| **4 Counts & period integrity** | ✅ ch00-09 | ✅ (F1/F2 CRIT + F3-F9 + study G1-G8) | ✅ | ✅ migration 0114 dev validated on real PG (count_date timestamptz NOT NULL default now()) + prod via Railway | ✅ e38f96fb |
| **5 Reporting** | ✅ ch00-09 | ✅ (F1/F3 CRIT + F2/F4/F5/F6 + F7-F12) | ✅ | ✅ migration 0115 dev validated on real PG (sle_legal_entity_occurred_at_idx present) + prod via Railway | ✅ 6b98fa34 |

## Process gates (from accounting program — apply here)
- Real `node dist/main` boot is the DI gate, NOT just the metadata test (a prior layer shipped
  a DI cycle the metadata test passed but real boot crashed).
- Run reviewers every layer: code-reviewer always; database-reviewer + neon-postgres for
  migrations; accounting-reviewer for the valuation/GL-handoff layer; nestjs-reviewer + api-reviewer
  for service/contract changes.
- Coverage: 100% on valuation/COGS (financial), 80%+ elsewhere.
- Migrations: generate → (edit SQL if backfill) → migrate on dev tenant, validate on REAL PG,
  then prod via Railway pre-deploy. Quote bracket paths in git add.

## Per-layer work log

### Layer 0 — Stock ledger foundation (✅ COMPLETE, merged main 310967be)

**Audit findings** (full: /tmp/inventory-hardening/layer-0-audit.md):
- F1 CRITICAL — ledger has no batch/serial/bin dimension
- F2 HIGH — manual/opening movements no idempotency (double-post)
- F3 HIGH — no reconciliation of materialized on_hand vs Σ ledger.quantity
- F4 HIGH — no effective/occurredAt date; backdating corrupts FIFO order + period reports
- F5 MEDIUM — no reversesEntryId link on compensating entries
- F6 MEDIUM — total_cost integrity convention-only (no CHECK)
- F7 MEDIUM — inventory_cost_layers.batchId no FK
- F8 MEDIUM — negative-stock default flexible; decrementOutbound has no guard (bypassable)
- F9 LOW — FOR UPDATE reads omit tenant predicate (defense-in-depth); drops in_transit
- OQ-03 (study) MEDIUM — immutability app-layer only; no Postgres rule denying UPDATE/DELETE

**Locked decisions for Layer 0 hardening:**
1. **binId deferred to Layer 1** (bins table belongs to Locations layer; nullable dimension added
   later is a cheap backfill-free migration since bins aren't operational yet). Layer 0 does
   batchId + serialId only.
2. **Do NOT fragment materialized_stock_levels by batch.** WAC valuation stays at (item, warehouse).
   batchId/serialId are dimensions on the IMMUTABLE LEDGER only; item_batches.qtyRemaining becomes a
   ledger-derived projection (Σ ledger.quantity WHERE batch_id), reconcilable like materialized levels.
   This decouples quantity-per-batch (FEFO/recall/expiry) from value-per-item (WAC).
3. occurredAt = effective movement date (NOT NULL), distinct from createdAt; FIFO + all date-range
   reports order by occurredAt (createdAt tiebreak).
4. eventId mandatory + deterministic (uuid v5 of sourceDocType+sourceDocId+movementType+itemId
   +lineId); full unique constraint replaces partial; recordMany generates deterministic ids → re-run no-op.
5. Negative-stock guard centralized inside decrementOutbound (single chokepoint reading policy).
6. Postgres trigger/rule denying UPDATE/DELETE on stock_ledger_entries (DB-level immutability).
7. Quantity reconciliation detector: materialized.on_hand == Σ ledger.quantity per (item,warehouse);
   batch projection: item_batches.qtyRemaining == Σ ledger.quantity per batch.

**Carried forward to later layers (deliberate, not tech debt):**
- bins table ALREADY EXISTS (org-structure.ts: warehouses/zones/bins) → Layer 1 just adds nullable
  `binId` column to stock_ledger_entries + wires it (no new table needed).
- FIFO cost-layer consumption still orders by created_at (inventory_cost_layers has no occurred_at;
  FIFO is DORMANT, WAC active) → Layer 3 (valuation) adds occurred_at to cost layers when FIFO is
  activated. Ledger-level FIFO/reports already order by occurredAt.
- F1 batch/serial write-time enforcement is live on inventory-native paths (adjustments/transfers/
  opening). POS/sales/purchase confirm paths thread trackingType in Layer 2 (movement engine).

**Self-caught + fixed before applying:** migration 0111 total_cost integrity CHECK would have
rejected landed_cost_adjustment rows (qty=0, cost>0) → added `movement_type='landed_cost_adjustment'
OR ...` exclusion to both schema + migration (mirrors the existing nonzero-check exclusion).

**Reviewer panel (3 reviewers, all opus, ZERO CRITICAL):**
- accounting-reviewer VERDICT: "WAC stays item×warehouse, batch=quantity projection" is CORRECT for
  10 years. GL handoff fires once, on_hand=Σledger invariant holds, WAC self-correction intact.
- DB review (HIGH/MED/LOW): CHECK→NOT VALID+VALIDATE (avoid lock/abort on legacy drift); add batch_id
  indexes for FK RESTRICT probes; event_id SET NOT NULL (full unique still allows NULLs in PG).
- nestjs review (1 HIGH, 1 LOW): F1 attribution not threaded by callers → chokepoint dormant + batch
  recon could false-positive; F9 tenantId passed inconsistently.

**Review-fix wave (✅ applied):** migration hardening (NOT VALID+VALIDATE, batch indexes, event_id
NOT NULL); LEDGER_INSERT_COLUMNS 19→20; F9 tenantId on remaining FOR UPDATE callers; batch-recon
false-positive guard (only compare where attribution present; else informational note); FIFO
activation guard (block FIFO until Layer 3 — WAC only).

**Deferred to Layer 2 (movement engine) — recorded, principled boundary not debt:**
- Batch/serial ATTRIBUTION threading through movement callers (adjustments/transfers/receipts +
  POS/sales/purchase). Capture of which batch/serial a movement affects belongs to the movement
  engine + Layer-1 trackingType-as-enforced-master-data. Layer 0 ships the spine: ledger CAN carry
  the dimension, chokepoint EXISTS, immutability + reconciliation in place.

**Deferred to Layer 3 (valuation) — recorded:**
- Serial-tracked specific-cost valuation (WAC pool incompatible w/ specific-ID COGS for serials).
- FIFO cost-layer consumption ordering by occurred_at (cost layers lack occurred_at; FIFO guarded
  off until then). Ledger-level FIFO/reports already order by occurredAt.
