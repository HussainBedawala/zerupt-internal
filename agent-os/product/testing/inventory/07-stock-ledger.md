# Inventory — Stock Ledger / Movements Testing Checklist

> Persona: **storekeeper / inventory manager**. You are not an accountant, but you need to trust the trail: every piece of stock that came in or went out must have a record that says when, why, from where, and at what cost. If a number looks wrong, you need to trace it back to the source document. Test every item as that person. Verify the *invariant*, not just that the button works.

- **Route(s):** No dedicated storekeeper-facing movement history screen exists (noted as a gap). Ledger is viewable via item stock detail and the Inventory Valuation report (`/reports/inventory-valuation`). Functional tests are therefore primarily API/service-level or via drill-downs from other screens.
- **Feature dir:** No dedicated frontend panel; drill-down surfaces in `stock-levels-panel.tsx` and valuation report.
- **API / Service:** `StockLedgerService` — `apps/api/src/inventory/stock-ledger.service.ts` — `record`, `recordMany`, `reverse`, `findBySourceDocument`, `findByEventId`, `findByItemWarehouseOrdered`.
- **Movement types (built):** `GRN_RECEIPT`, `SALE`, `SALE_RETURN`, `PURCHASE_RETURN`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `TRANSFER_OUT`, `TRANSFER_IN`, `COUNT_ADJUSTMENT`, `OPENING_BALANCE`.
- **Movement types (spec-only, not yet built):** `CONSUMPTION`, `ASSEMBLY_IN`, `ASSEMBLY_OUT`, `DISASSEMBLY` — listed as gaps in section 5.
- **Depends on:** All upstream submodules that post movements: GRN (Purchase), Sales, Adjustments, Transfers, Stock Counts, Opening Balance import.

## 0. Preconditions

- [ ] Dataset loaded with at least one of every built movement type posted; know the expected quantity and cost for each.
- [ ] Logged in as a user with Inventory read permission. Ledger entries are immutable; no user should be able to edit or delete them — confirm no edit/delete UI is exposed.
- [ ] Know the tenant functional currency and its decimal precision.

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

- [ ] **Ledger drill-down from item stock** — clicking an item on `/inventory/stock` opens a movement history for that item; entries are ordered by `occurred_at` descending (most recent first).
  - [ ] Empty state (item with no movements beyond opening balance) is clear, not a broken component.
  - [ ] Each row shows: movement type (human-readable, localized), quantity (signed — positive for in, negative for out), unit cost, total cost, source document type + link, warehouse/zone/bin, date/time, created-by.
- [ ] **Source document links resolve** — clicking the source document link from a ledger row navigates to the correct GRN, sale, adjustment, transfer, or count record. No dead links.
- [ ] **Reversal entries are visually linked** — a reversed entry and its mirror entry are distinguishable (e.g. "Reversed by…" label); the `reverses_entry_id` is surfaced somehow.
- [ ] **`findBySourceDocument`** — querying ledger by a known source document (e.g. GRN #42) returns exactly the entries created by that document, no more, no less.
- [ ] **`findByEventId`** — querying by event ID returns the correct grouped batch of entries (for `recordMany` batches).
- [ ] Currency precision: cost and total cost columns display in tenant currency at tenant precision — no hardcoded decimal place count.
- [ ] Arabic locale: movement type labels, date formats, and quantity signs all render correctly under RTL.

## 2. Domain invariants — the heart of ledger-first

> These are the most CRITICAL invariants in the entire inventory module. A violation here is a data-integrity failure, not a UI bug.

- [ ] **Append-only — no edit, no delete:** no API endpoint or service method modifies or deletes an existing `stock_ledger_entries` row. Confirm by attempting a direct `PATCH`/`DELETE` to the entries table via API — must be 404 or 403.
- [ ] **Reversal creates a mirror, never a mutation:** `reverse()` inserts a new row with inverted quantity and the same unit cost, sets `reverses_entry_id` on the new row pointing to the original. The original row is untouched.
- [ ] **On-hand = Σ ledger:** for any item/warehouse combination, `Σ stock_ledger_entries.quantity` equals `materialized_stock_levels.on_hand`. Spot-check after each movement type below.
- [ ] **Every entry links to a resolvable source document:** `source_document_type` and `source_document_id` are non-null; the referenced record exists (no orphan ledger entries).
- [ ] **Serial / batch traceability:** entries for serialized items carry `serialNumberId`; entries for batched items carry `batchId`. Neither is silently null when the item is serial/batch-tracked.
- [ ] **Cost layer reference:** entries that create a FIFO cost layer carry `costLayerId`; consumption entries reference the correct layer (or WAC if no FIFO).

### Per-movement-type GL posting checks

> Reference: README cross-cutting GL invariant. Each movement type must post the CORRECT balanced journal entry to the GL (via NestJS EventEmitter → accounting module). "Balanced" = Dr total = Cr total. A failed post must land in the dead-letter queue, never silently disappear.

- [ ] **GRN_RECEIPT** — Dr Merchandise Inventory (at unit cost × qty), Cr GRNI / Accounts Payable / Cash (depending on purchase type). Net effect: inventory up, liability or cash down.
- [ ] **SALE** — Dr Cost of Goods Sold (at WAC × qty), Cr Merchandise Inventory. Net effect: inventory down, COGS up. WAC used is the average cost at time of sale, not a recalculated retrospective value.
- [ ] **SALE_RETURN** — reverses SALE entry: Dr Inventory (at original WAC), Cr COGS. Average cost may re-weight if policy allows; verify direction is correct.
- [ ] **PURCHASE_RETURN** — reverses GRN_RECEIPT: Dr GRNI/Payable, Cr Inventory. Net effect: inventory down, liability reduced.
- [ ] **ADJUSTMENT_IN** — Dr Inventory, Cr Inventory Gain / Variance account. Net effect: inventory up, variance recognized.
- [ ] **ADJUSTMENT_OUT** — Dr Inventory Write-down / Variance, Cr Inventory. Net effect: inventory down, loss recognized.
- [ ] **TRANSFER_OUT** — Dr In-Transit Inventory (or destination Inventory depending on immediate/staged transfer model), Cr Source Warehouse Inventory. Net GL impact across all locations: zero (internal movement).
- [ ] **TRANSFER_IN** — Dr Destination Warehouse Inventory, Cr In-Transit (or Source). Completes the pair with TRANSFER_OUT; net GL impact still zero.
- [ ] **COUNT_ADJUSTMENT** — Dr/Cr Inventory, Cr/Dr Stock Count Gain/Loss account. Direction depends on whether count found more or less than recorded.
- [ ] **OPENING_BALANCE** — Dr Inventory (at opening cost), Cr Opening Balance Equity / Retained Earnings. Posted exactly once per item/warehouse; a second import for the same item/warehouse is idempotent (does not double-post).
- [ ] **Failed GL posting** — simulate a GL posting failure (e.g. missing account mapping); confirm the failed event lands in the dead-letter queue and an alert/log is produced. Nothing silently dropped.

## 3. Edge cases & defensive UX — "the dumbest thing a storekeeper could do here"

- [ ] Post a GRN with unit cost = 0 — ledger entry recorded with zero cost; average cost recomputes correctly (does not divide by zero or corrupt).
- [ ] Post a SALE for more units than on-hand when negative stock is disabled — movement is blocked before any ledger row is written; on-hand remains unchanged.
- [ ] Reverse the same entry twice — second reversal is blocked (the entry already has a `reverses_entry_id`); no double-reversal.
- [ ] Attempt to reverse an entry that is itself a reversal — blocked or clearly rejected; no reversal chains.
- [ ] Post a batch of movements (`recordMany`) where one entry is invalid — entire batch rolls back atomically; no partial posts leave the ledger in an inconsistent state.
- [ ] Very large quantity movement (e.g. 999,999 units) — stored and displayed without overflow or truncation; total cost computed correctly at currency precision.
- [ ] Fractional quantity (e.g. 0.333 kg) with a fractional unit cost — total cost rounded correctly to currency precision; no accumulation error across many entries.
- [ ] Simultaneous movements from two sessions on the same item/warehouse — `getLevelForUpdate` uses a row-level lock; final on-hand reflects both movements, not just one.
- [ ] Ledger query for an item with thousands of entries — `findByItemWarehouseOrdered` paginates or limits correctly; does not time out or return an unbounded result set.
- [ ] Source document is later voided/deleted — ledger entry is NOT retroactively deleted; a reversal entry must be present instead. The drill-down link should show "voided" state, not a broken link.

## 4. Cross-module / integration

- [ ] **Stock levels agree after every movement type** (see invariant above) — spot-check on-hand via `materialized_stock_levels` vs. Σ ledger after each type.
- [ ] **Valuation report ties to ledger:** `Σ total_value` in the valuation report equals `Σ (quantity × unit_cost)` across all ledger entries for the same snapshot date.
- [ ] **GL trial balance agrees:** the Merchandise Inventory control account balance in the GL equals `Σ materialized_stock_levels.total_value` at the same point in time.
- [ ] **Serial number traceability:** a serialized item's ledger entries allow reconstructing the full chain — received in GRN X, sold in Sale Y, returned in Return Z — with no gaps.
- [ ] **Batch/lot traceability:** same chain possible for batch-tracked items via `batchId`.
- [ ] **Audit trail:** every `stock_ledger_entries` row was created by a known user (`createdBy`) and has a non-null `createdAt`; no anonymous or system-null entries unless explicitly a system action (e.g. opening balance import).

## 5. Known gaps (from recon — verify or track)

- **No storekeeper-facing movement history screen** — there is no `/inventory/movements` or per-item history panel accessible to the storekeeper. They must rely on item drill-down from stock levels or on the valuation report. CRITICAL UX gap for a warehouse-operating tenant; a dedicated screen with movement-type filter, date range, and source document link would cover the core need. Track as HIGH.
- **CONSUMPTION movement type** — spec-only; no controller or service method built. Required for manufacturing/assembly use cases (raw material consumption). MEDIUM gap (not needed for pure retail MVP).
- **ASSEMBLY_IN / ASSEMBLY_OUT / DISASSEMBLY movement types** — spec-only; no implementation. Required for kit building, BOM assembly, disassembly into components. MEDIUM gap.
- **Dead-letter queue UI** — failed GL postings are presumed to go to a DLQ, but whether there is an admin-facing view to inspect and replay them is unverified. HIGH operational gap; silent failures in a financial system are unacceptable.
- **Reversal authorization** — it is unclear whether reversing a ledger entry (via the source-document void/cancel flow) requires a separate permission beyond general inventory write. If not enforced, any inventory user can silently undo any movement. MEDIUM security/audit gap.
- **`occurred_at` vs `createdAt` divergence** — `occurred_at` allows backdating; there is no apparent guard preventing a movement from being backdated to a closed accounting period. May conflict with period-lock enforcement. MEDIUM.
- **Per-bin ledger breakdown** — `zoneId` and `binId` are stored on ledger entries, but whether any UI surfaces per-bin movement history is unverified. LOW for MVP; needed once bin-level picking is live.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
