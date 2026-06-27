# 09 — Open Questions and Decisions for the Audit

## Confirmed gaps requiring decisions or fixes

### F1 CRITICAL — LandedCostListener has no outbox

`landed-cost.listener.ts:244`: in-process emit only. If the process dies post-commit, the
GL JE for the landed-cost adjustment is permanently lost. GL/subledger invariant breaks.
FIX: insert outbox row INSIDE the `db.transaction(...)` block (step 7), then emit in-process
post-commit as the fast-path. One-line change + `OutboxService` injection.

### F2 HIGH — FIFO: inventory_cost_layers has no occurred_at

`fifo-engine.service.ts:130`: `ORDER BY created_at ASC` — wrong for backdated GRNs.
FIX: add `occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()` to `inventory_cost_layers`
(migration), populate from GRN's `occurredAt` in `addLayer`, change ORDER BY to
`occurred_at ASC, created_at ASC`. Then lift the activation guard.
Requires: migration + FifoEngineService + AddLayerParams change.

### F3 MEDIUM — Serial specific-cost corrupts WAC pool

`inventory-event.listener.ts:528`: specific-ID COGS debits `specificTotalCost` from
`totalValue` without isolating the pool. If serialUnitCost ≠ poolWAC, remaining units'
WAC is incorrect after the sale.
DECISION NEEDED: (a) require FIFO method for serial-tracked items (per-serial layers =
exact specific-ID with no pool corruption), (b) accept the pool drift as a tolerable
simplification for the MVP (common in retail where serials share a homogeneous batch cost),
or (c) track `acquisition_cost` per serial_number row and subtract it exactly from
`totalValue` without re-averaging.

### F4 MEDIUM — COGS reversal on sale_return uses current WAC, not original sale WAC

`resolveInboundWac:689`: uses `existingWac` not `originalUnitCost`. If WAC changed between
sale and return, COGS reversal ≠ original COGS. Unrecorded difference.
DECISION NEEDED: store `wac_at_sale_time` on `sales_invoice_lines` and thread to credit note
payload as `originalUnitCost`. Or accept the simplification (IAS 2 does not strictly require
reversal at original cost for WAC; it requires the return to reduce COGS by the cost assigned
to the goods when originally sold — which is the WAC at sale time).

### F5 MEDIUM — No NRV write-down capability

No `write_down` movement type. Inventory asset may be overstated for perishables/seasonal.
DECISION NEEDED: build for MVP or defer. If defer, document as a known IAS 2 non-compliance
for tenants with perishable stock (pharma, grocery) until post-MVP.

### F6 MEDIUM — Landed cost split uses total GRN quantity, not item quantity

`landed-cost.listener.ts:86-90`: `totalReceived` sums all `grn_receipt` entries for the
source document. For multi-item GRNs with per-item landed cost allocation, the split ratio
is wrong. FIX: filter receipt entries to `entry.itemId === payload.itemId` when computing
`totalReceived`.

### F7 LOW — WAC→FIFO mid-life method change has no migration path

`item_costing_configs` allows changing costing method. No procedure to synthesize the
"opening FIFO layer" at current WAC for current on-hand when switching. Will throw
"insufficient stock" on first outbound. FIX: synthesize one FIFO layer on method change.

### F8 LOW — totalValue not zeroed on last unit (rounding residual)

Schema comment says totalValue resets to 0 when onHand=0. Audit: does
`StockLevelService.decrementOutbound` explicitly zero `totalValue` when `newOnHand <= 0`?
If not, rounding cents accumulate across thousands of transactions.

## Questions for the founder

1. Serial-specific cost (F3): accept WAC pool drift or require FIFO-by-serial (more complex)?
2. Sale return COGS reversal (F4): is the simplification (reversal at current WAC) acceptable
   for the target retail use case? Most MENA retail uses the simplification.
3. NRV write-down (F5): build for MVP or defer? Affects pharma/grocery tenants most.
4. FIFO activation timeline: the guard will be lifted once F2 (occurred_at) is fixed.
   Is FIFO needed for launch or can it remain guarded through MVP?

## What is sound and should not change

- WAC at item × warehouse (not per-batch) — confirmed correct for 10 years.
- Dual-path outbox + in-process emit for all other JEs — sound.
- Negative-stock true-up (HIGH-1) — correct IFRS treatment.
- Purchase return 3-leg JE with mandatory originalUnitCost — sound.
- Non-recoverable tax capitalization (C1) — correct IAS 2.11.
- FIFO layer CHECK constraints (`remainingQty >= 0`, `remainingQty <= originalQty`) — sound.
- Decimal.js ROUND_HALF_EVEN 6dp throughout — correct for IFRS monetary precision.
