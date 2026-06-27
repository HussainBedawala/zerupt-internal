# Chapter 00 — Overview & the "One Engine" Principle

## What this layer covers

Layer 2 is the movement engine: every event that changes on-hand stock flows
through a single, consistent path into the immutable `stock_ledger_entries` table.
This chapter introduces the architecture; subsequent chapters walk each movement type
in detail.

## The "one engine" principle

All inbound movements converge on `InventoryEventListener.applyInbound()` and all
outbound movements on `applyOutbound()`. Neither function is called directly by
business modules. Instead:

1. Business documents (POS, Sales Invoice, GRN, Transfer, Adjustment) **emit domain
   events** (e.g. `pos.transaction.completed`, `purchase.invoice.confirmed`).
2. `InventoryDomainEventListener` (`inventory-domain.listener.ts`) receives those
   events, validates the payload via Zod (`inventoryDomainEventSchema`), and **fans
   them out per line** to `applyInbound` / `applyOutbound`.
3. Direct callers (StockAdjustmentsService, StockTransfersService) invoke the engine
   services directly (bypassing the EventEmitter) but still go through the same
   `StockLedgerService.record()` / `StockLevelService.upsert*` path.

```
Business event ──► InventoryDomainEventListener
                          │ per-line fan-out
                          ▼
          InventoryEventListener.applyInbound / applyOutbound
                          │
                 ┌────────┴────────┐
                 ▼                 ▼
    StockLedgerService        StockLevelService
    .record() / .recordMany() .upsertInbound / .decrementOutbound
                 │
                 ▼
        stock_ledger_entries (immutable)
        materialized_stock_levels (transactional projection)
```

## Key contracts (enforced by the engine today)

| Contract | Where enforced |
|---|---|
| Immutable ledger — INSERT only | DB trigger (Layer-0 migration 0111) |
| Idempotency — deterministic uuid-v5 eventId | `deterministicUuidV5()` in every caller |
| occurredAt (business date ≠ createdAt) | mandatory on all payloads |
| Negative-stock guard | `applyOutbound` + `decrementOutbound` |
| COGS/GL handoff — transactional outbox | `OutboxService.insert()` inside every tx |
| No P&L for reclassifications (transfer, assembly) | `isReclassificationMovement()` guard |

## What is NOT in this layer

- Valuation math (WAC formula, FIFO layer consumption detail) → Layer 3
- Physical count / variance → Layer 4
- Reporting projections → Layer 5
- Item master immutability guards → Layer 1

## Key files

| File | Role |
|---|---|
| `apps/api/src/inventory/inventory-event.listener.ts` | Core engine: applyInbound / applyOutbound |
| `apps/api/src/inventory/inventory-domain.listener.ts` | Domain event → per-line fan-out |
| `apps/api/src/inventory/stock-ledger.service.ts` | record / recordMany (ledger INSERT) |
| `apps/api/src/inventory/stock-level.service.ts` | Materialized stock level writes |
| `apps/api/src/inventory/stock-adjustments/stock-adjustments.service.ts` | Manual adjustments |
| `apps/api/src/inventory/transfers/stock-transfers.service.ts` | Two-legged transfers |
| `packages/db/src/schema/inventory-costing.ts` | stock_ledger_entries, materialized_stock_levels |
| `packages/db/src/schema/inventory-adjustments.ts` | stock_adjustments header |
| `packages/db/src/schema/stock-transfers.ts` | stock_transfers + stock_transfer_lines |
