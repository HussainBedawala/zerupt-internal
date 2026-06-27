# 00 — Overview: What "Stock Ledger Foundation" Means for Inventory

## The inventory system as a building

```
        ┌─────────────────────────────────────────┐
        │ Layer 5: Inventory Reports               │  ← what the owner SEES
        │   (valuation, movement, aging, ABC)      │
        ├─────────────────────────────────────────┤
        │ Layer 4: Stock Counts & Period Integrity │
        │   (physical counts, variance, close)     │
        ├─────────────────────────────────────────┤
        │ Layer 3: Valuation & Costing + GL Handoff│
        │   (WAC, FIFO, COGS, landed cost, outbox) │
        ├─────────────────────────────────────────┤
        │ Layer 2: Movement Engine + Reservations  │
        │   (sales, GRN, transfers, adjustments,   │
        │    ATP, reservations, serial allocation)  │
        ├─────────────────────────────────────────┤
        │ Layer 1: Master Data                     │
        │   (items, UOM, locations, categories)    │
        ├─────────────────────────────────────────┤
        │ Layer 0: Stock Ledger Foundation  ← HERE │
        │   movement-entry model, dimensions,      │
        │   immutability, materialized levels,     │
        │   idempotency, atomicity                 │
        └─────────────────────────────────────────┘
```

Layer 0 is the concrete foundation on which everything else rests. Every stock movement —
a sale, a goods receipt, a transfer, a manual adjustment — lands as a **row in
`stock_ledger_entries`** before anything else matters. The on-hand balance that the POS
shows, the COGS that flows to the P&L, the variance a stockkeeper investigates during a
count — all of it derives from that spine.

## Why call it a "ledger"?

The word comes from accounting. A ledger is a permanent, append-only record of
transactions. The stock ledger does for quantities exactly what the accounting general
ledger does for money:

| Accounting GL | Stock Ledger |
|---|---|
| `journal_entry_lines` rows | `stock_ledger_entries` rows |
| DR/CR signed amounts | signed `quantity` (+ = in, − = out) |
| Account dimension | Item + Location dimensions |
| Immutable once posted | Immutable once posted |
| Correction = reversal JE | Correction = compensating entry |
| `on_hand = Σ quantity` | `on_hand = Σ quantity` (perpetual) |

The analogy is exact. If you understand how double-entry accounting works, you already
understand how the stock ledger works — just swap money for quantity and accounts for
item-location pairs.

## What Layer 0 covers (and does NOT cover)

**In scope for this layer:**

- The `stock_ledger_entries` model: every column, every constraint, every index
- Dimensional granularity: item × location × lot/batch × serial × bin — what exists,
  what is missing, what it means for a 10-year horizon
- Immutability semantics: why no UPDATE or DELETE is ever the right answer
- Quantity integrity invariants enforced at the DB level
- `materialized_stock_levels`: the read model and its consistency contract with the ledger
- Idempotency (eventId / partial unique index) and transactional atomicity
- Multi-tenant + branch / legal-entity scoping on the ledger
- The public contract: how every other module writes to and reads from the ledger

**Out of scope for Layer 0 (covered in later layers):**

- Valuation math — WAC blending, FIFO consumption, COGS posting (Layer 3)
- Stock counts and variance (Layer 4)
- Item master fields — UOM, categories, reorder points (Layer 1)
- Reservation / ATP (Layer 2)

## The three core tables in Layer 0

```
stock_ledger_entries         ← the immutable spine (append-only)
materialized_stock_levels    ← the transactional read model (item × warehouse)
inventory_cost_layers        ← FIFO layers (touched in Layer 3; introduced here
                                             because batchId on the layer affects
                                             the dimensional-granularity question)
```

The fourth table `item_costing_configs` is also defined in
`packages/db/src/schema/inventory-costing.ts` but is properly a Layer 3 concern.
It is mentioned in Chapter 08 only where it touches the ledger write path.

## Key files

| Purpose | Path |
|---|---|
| Schema — all 4 costing tables | `packages/db/src/schema/inventory-costing.ts` |
| Schema — adjustments header | `packages/db/src/schema/inventory-adjustments.ts` |
| Schema — batches/lots | `packages/db/src/schema/item-batches.ts` |
| Ledger service (append-only API) | `apps/api/src/inventory/stock-ledger.service.ts` |
| Stock level service | `apps/api/src/inventory/stock-level.service.ts` |
| WAC engine | `apps/api/src/inventory/wac-engine.service.ts` |
| Adjustment posting | `apps/api/src/inventory/stock-adjustments/stock-adjustments.service.ts` |
| Domain event → ledger (POS/Sales/Purchase) | `apps/api/src/inventory/inventory-domain.listener.ts` |
