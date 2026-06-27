# 00 — Layer 3 Overview: Valuation & Costing + GL Handoff

## Scope

Layer 3 owns every number that turns a quantity movement into a money movement:

- WAC computation (how the pool updates on receipt)
- COGS derivation on every issue (WAC path, FIFO path, specific-ID path for serials)
- The inventory → GL handoff: DR COGS / CR Inventory and the symmetric receipts
- FIFO engine (current guarded state, what must be fixed before activation)
- Serial-tracked specific-identification cost (separate from WAC pool)
- Landed-cost capitalization (retroactive cost adjustment after GRN)
- Valuation under returns, reversals, and negative-stock true-up
- Revaluation / write-down / NRV

Out of scope: batch attribution routing (Layer 2), stock counts / period reconciliation (Layer 4),
inventory valuation reports (Layer 5) — but this layer supplies the per-unit costs those consume.

## Invariant that must hold at all times

```
GL: Merchandise Inventory (1141) balance
  = Σ (materialized_stock_levels.total_value) across all (item, warehouse)
  = Σ (stock_ledger_entries.total_cost WHERE movement is inbound)
  − Σ (stock_ledger_entries.total_cost WHERE movement is outbound)
```

This invariant is perpetual (real-time), not period-end. Every outbound event debits COGS and
credits Inventory by the SAME amount written to the ledger row. Every inbound event credits
Inventory by the SAME amount written to the ledger row. If any path can write the ledger but
fail to post the JE — or post the JE at a different amount — the GL and subledger drift apart.

## Service map (all under `apps/api/src/inventory/`)

| Service | File | Role |
|---|---|---|
| WacEngineService | `wac-engine.service.ts` | Pure WAC math — no DB |
| FifoEngineService | `fifo-engine.service.ts` | Layer CRUD + consumption (guarded) |
| CogsCalculatorService | `cogs-calculator.service.ts` | Orchestrator: WAC vs FIFO dispatch |
| InventoryEventListener | `inventory-event.listener.ts` | Lock → cost → ledger → level → outbox |
| LandedCostListener | `landed-cost.listener.ts` | Retroactive cost split + WAC uplift |
| StockLevelService | `stock-level.service.ts` | materialized_stock_levels updates |
| OutboxService | `../accounting-events/outbox.service.ts` | Durable at-least-once JE delivery |

## Key schema

| Table | File | Purpose |
|---|---|---|
| `materialized_stock_levels` | `inventory-costing.ts:425` | WAC state: on_hand, average_cost, total_value |
| `inventory_cost_layers` | `inventory-costing.ts:288` | FIFO layers (remainingQty mutable) |
| `item_costing_configs` | `inventory-costing.ts:570` | Per-item method override (WAC default) |
| `stock_ledger_entries` | `inventory-costing.ts:49` | Immutable spine; unit_cost + total_cost on every row |
| `outbox` | `accounting-outbox.ts` | Durable JE queue (at-least-once delivery) |
