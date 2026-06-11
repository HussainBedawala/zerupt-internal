# Inventory Engine

> Rules for how items, stock levels, costs, locations, and pricing work. Each file is self-contained.

## Files

| File | What It Covers |
|------|---------------|
| `01-item-model.md` | Item structure (flat vs matrix), variants, attributes, barcodes, categories |
| `02-location-hierarchy.md` | Branch → Warehouse → Zone → Bin, how stock is tracked at each level |
| `03-stock-ledger.md` | The stock ledger: how quantity is tracked, available vs committed vs in-transit |
| `04-cost-engine.md` | WAC and FIFO mechanics, cost layers, when cost recalculates |
| `05-stock-movements.md` | Every movement type: adjustment, transfer, consumption, assembly, GRN receipt |
| `06-serial-batch.md` | Serial number and batch/lot tracking, lifecycle, constraints |
| `07-pricing-engine.md` | Price lists, hierarchy, quantity breaks, promotions, resolution logic |
| `08-stock-counting.md` | Full/cycle/spot counts, blind counting, variance handling, approval |
| `09-reorder-engine.md` | Reorder levels, safety stock, lead times, suggested PO generation |
| `10-negative-stock.md` | Strict vs flexible mode, per-item overrides, alerts |
| `11-cross-module-contracts.md` | What POS, Sales, Purchase, and Accounting expect from Inventory |

## Design Decisions

- Stock tracked at bin level (most granular) but queryable at any level (warehouse, branch, company)
- Flat items and matrix items coexist — user chooses per product
- WAC default, FIFO for batch-tracked items (matches accounting engine)
- Perpetual inventory system — every movement creates a stock ledger entry and triggers an accounting event
- Negative stock configurable: strict (block) or flexible (warn) at company level, with item-level overrides
- Serial items always block negative (can't sell what you don't have)
- All movements are immutable — corrections via new counter-movements, never edits
