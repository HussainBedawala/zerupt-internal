# Inventory Module — Testing Index

> **Persona for the whole module: a storekeeper / inventory manager.** Assume the only person touching these screens runs the warehouse: receives goods, issues stock, transfers between locations, counts shelves, and watches reorder levels. They are NOT an accountant. They expect on-hand quantities to always match reality, valuation to be sane, and the system to stop them before they do something stupid (issue more than they have, count wrong, transfer to nowhere). At every screen ask: **"what's the dumbest thing a storekeeper could do here?"**

Inventory is a **ledger-first** module: every stock change is an immutable `stock_ledger_entries` row, and on-hand quantity is the sum of those rows per item/location. Inventory also auto-posts to the GL (event-driven) for every movement, so correctness depends on **both** the screens here **and** the journal entries flowing out to accounting (inventory control, COGS, variance accounts).

## Submodule checklists (run in order — dependencies flow downward)

> Filled in after recon. Catalog/items and locations must be correct before stock movements; movements before valuation/reports.

| # | Submodule | Route |
|---|-----------|-------|
| 01 | [Items / Catalog](01-items-catalog.md) | `/inventory/items`, `/inventory/items/new`, `/inventory/items/[id]` |
| 02 | [Categories](02-categories.md) | `/inventory/categories` |
| 03 | [Barcodes & Label Printing](03-barcodes-labels.md) | within item detail (`barcodes-section`, label print dialog) |
| 04 | [Pack Units / UOM](04-pack-units-uom.md) | within item detail (`pack-units-section`) |
| 05 | [Warehouses / Zones / Bins](05-warehouses-locations.md) | `/settings/locations` |
| 06 | [Stock Levels / On-Hand](06-stock-levels.md) | `/inventory/stock` |
| 07 | [Stock Ledger / Movements](07-stock-ledger.md) | backend ledger; viewed via item stock + valuation |
| 08 | [Adjustments & Opening Stock](08-adjustments-opening.md) | `/inventory/adjustments`, `/inventory/opening-stock` |
| 09 | [Stock Transfers](09-transfers.md) | `/inventory/transfers` |
| 10 | [Stock Counts / Stocktake](10-stock-counts.md) | `/inventory/stock-counts` |
| 11 | [Serial Numbers](11-serial-numbers.md) | `/inventory/serial-numbers` |
| 12 | [Batch / Lot Tracking](12-batches.md) | `/inventory/batches` |
| 13 | [Valuation / Costing (WAC/FIFO)](13-valuation-costing.md) | `/reports/inventory-valuation` |
| 14 | [Reorder / Min-Max](14-reorder.md) | `/inventory/reorder` |
| 15 | [Price Lists](15-price-lists.md) | `/inventory/price-lists` |
| 16 | [Promotions](16-promotions.md) | `/inventory/promotions` |

Findings: [`_findings.md`](_findings.md)

---

## Cross-cutting inventory invariants (apply to EVERY submodule)

These must hold no matter the dataset. If any fails anywhere, it is at least HIGH, usually CRITICAL.

### Ledger integrity (ledger-first)
- [ ] **On-hand = Σ ledger:** for every item/location, on-hand quantity equals the sum of `stock_ledger_entries.quantity`. The materialized stock level is a cache; it must always agree with the ledger.
- [ ] **Movements are immutable:** a posted stock movement cannot be edited or deleted — only reversed. A reversal creates a new, mirrored ledger entry (`reverses_entry_id`), never deletes history.
- [ ] **No partial posts:** a movement either fully posts (ledger + GL + cache) or not at all (atomic). A failed post leaves nothing behind.
- [ ] **Every ledger entry links to its source document** (`source_document_type`/`source_document_id`) and the link resolves.

### Costing (WAC)
- [ ] **Weighted-average cost moves correctly:** receipts re-weight the average cost; issues consume at the current average (do NOT change it). `average_cost` and `total_value` on the stock level recompute correctly after each movement.
- [ ] **total_value = on_hand × average_cost** to currency precision on every stock level (no rounding leak).
- [ ] Issuing stock never produces a negative valuation or a negative average cost.

### GL posting (ties to accounting)
- [ ] **Inventory valuation = inventory control account balance.** Σ total_value across all stock = balance of the Merchandise Inventory control account in the GL.
- [ ] Every movement type posts the CORRECT, balanced journal entry:
  - Receipt / GRN: Dr Inventory, Cr GRNI / payable / cash.
  - Issue / sale: Dr COGS, Cr Inventory (at WAC).
  - Transfer: in-transit handling; net GL impact zero across locations (or in-transit account used).
  - Positive adjustment: Dr Inventory, Cr gain/variance. Negative: Dr write-down/variance, Cr Inventory.
  - Stock count: variance posts to the count gain/loss account.
- [ ] Failed auto-postings land in the dead-letter queue (nothing silently dropped).

### Quantity & UOM
- [ ] **Multi-location quantities sum to the item total** shown anywhere an item-level on-hand is displayed.
- [ ] **Negative-stock guard:** issuing/transferring more than on-hand is blocked (or explicitly allowed per a tenant setting) — never silently goes negative without intent.
- [ ] **Pack/UOM conversions to base unit are correct** (`resolvePackUnit`): a movement entered in a pack unit stores the correct base-unit quantity; on-hand is always in base units.

### Currency & precision
- [ ] All costs/values display in the **tenant functional currency** (never hardcoded USD/SAR) at the **currency's precision** (KWD = 3dp) via the shared `currency-precision` util — never hardcoded 2 or 3.

### Audit & tenant isolation
- [ ] Every mutation writes an immutable audit-trail record (who/when/what, before/after).
- [ ] All data shown belongs to the current tenant only; no cross-tenant leakage in any list/report/drill-down.
- [ ] Permission checks enforced server-side, not just hidden in the UI.

---

## Cross-cutting systemic findings (check these on EVERY screen)

Recurred across nearly every accounting screen; check proactively on every inventory screen too:

1. **Hardcoded currency defaults** (USD/SAR) instead of `useTenantCurrency()`.
2. **2dp formatting** instead of dynamic precision — reuse `apps/web/src/lib/currency-precision.ts`; never hardcode.
3. **Redundant module layout header** on sub-pages (section resolver should return `""` for non-section sub-paths).
4. **Free-text inputs that should be searchable pickers** (item, location, category) — reuse existing pickers/endpoints.
5. **Secondary-language label/placeholder** must be generic via `useBilingualLabels()`, `dir="auto"`, hidden for monolingual tenants.
6. **Toolbar polish**: filter chevron alignment; date-picker icon overlap; missing CSV export on list/report screens.
7. **Defensive UX**: every action needs loading/error/empty/success; destructive actions need confirmation + data-loss warning; debounce; validate client + server.

## Severity rubric

See [`../README.md`](../README.md). Fix CRITICAL/HIGH immediately; batch MEDIUM/LOW for review (founder generally wants them fixed too).
