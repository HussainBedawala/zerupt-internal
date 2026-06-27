# 08 — How Other Modules Read and Write the Ledger (The Public Contract)

## The golden rule

**All writes to `stock_ledger_entries` and `materialized_stock_levels` go through
the inventory engine — never via direct SQL from external modules.**

This is the module boundary that makes the inventory module packagable as a standalone
product. External modules (POS, Sales, Purchase) emit events; the inventory engine
processes them. They do not call stock level service methods directly.

## The dependency graph

```
                    ┌───────────────────────────────────────┐
                    │         INVENTORY ENGINE               │
                    │  StockLedgerService (write)           │
                    │  StockLevelService (write)            │
                    │  WacEngineService (cost compute)      │
                    │  StockAdjustmentsService (manual adj) │
                    │  StockTransfersService (transfers)    │
                    └───────────────────────────────────────┘
                          ↑ events             ↓ events
           ┌──────────────┴──────────┐    ┌───┴────────────────────┐
           │ POS / Sales / Purchase  │    │ Accounting Module      │
           │ (emit domain events)    │    │ (consumes outbox events │
           └─────────────────────────┘    │  to post GL journals)  │
                                          └────────────────────────┘
           ┌──────────────────────────────────────────────────────┐
           │ Reports / Reorder / Stock Counts (read-only readers) │
           └──────────────────────────────────────────────────────┘
```

Arrows: external modules emit events → inventory processes → inventory emits GL events.

## Write paths: who writes to the ledger

### Path A: Domain events from POS / Sales / Purchase

File: `apps/api/src/inventory/inventory-domain.listener.ts`

The domain listener translates business events into stock movements:

| Event | Movement type | Direction |
|---|---|---|
| `pos.transaction.completed` | `sale` | outbound |
| `pos.return.completed` | `sale_return` | inbound |
| `pos.void.completed` | `sale_return` | inbound (void = full reversal) |
| `sales.invoice.confirmed` | `sale` | outbound |
| `sales.creditNote.confirmed` | `sale_return` | inbound |
| `purchase.invoice.confirmed` | `grn_receipt` | inbound |

Each event fans out to N ledger entries (one per line item). Per-line idempotency uses
deterministic UUID v5 from `(lineId_or_index, parentEventId)`.

**Contract the POS/Sales/Purchase MUST honour:**
- `warehouseId` is required on every line — the inventory engine never guesses which warehouse
- `quantity` and `unitCost` are positive numeric strings in functional currency (post-FX)
- `sourceDocumentId` is the document PK
- `sourceDocumentLineId` is the line PK (enables per-line idempotency)

### Path B: Manual stock adjustments

`StockAdjustmentsService.create()` and `createOpeningBalance()` — direct API calls from
the frontend. These post an adjustment header + ledger entries + materialized level update
+ outbox entry in one transaction.

### Path C: Transfers

`StockTransfersService` — handles inter-warehouse transfers. Posts a `transfer_out` at the
source warehouse and a `transfer_in` at the destination warehouse (in the same transaction
for same-branch transfers; separately for cross-entity).

## The `StockMovement` type: the write contract

`apps/api/src/inventory/inventory.types.ts` defines the shape every write path must
provide:

```typescript
interface StockMovement {
  tenantId: string
  legalEntityId: string
  branchId: string
  warehouseId: string
  itemId: string
  quantity: string            // signed numeric string
  movementType: StockMovementType
  unitCost: string
  totalCost: string
  currency: string
  sourceDocumentType: DocumentType
  sourceDocumentId: string
  sourceDocumentLineId?: string
  eventId?: string
  costLayerId?: string
  createdBy: string
}
```

This type is the single contract between movement producers (POS listener, adjustments
service, transfers service) and the ledger. All write paths instantiate this type before
calling `StockLedgerService.record()`.

## Read paths: who reads from the ledger

### Hot read: `materialized_stock_levels`

POS, stock-level displays, reorder monitoring, and COGS computation all read from
`materialized_stock_levels` — they NEVER query `stock_ledger_entries` for the current
on-hand.

The primary query:
```sql
SELECT on_hand, average_cost, last_cost, total_value
FROM materialized_stock_levels
WHERE item_id = $1 AND warehouse_id = $2
```

This is a point-lookup on the `(item_id, warehouse_id)` unique key — always O(1)
regardless of ledger history length.

### Audit reads: `stock_ledger_entries`

Reports, drill-through, and the stock count reconciliation read from
`stock_ledger_entries`:
- "Show me all movements for item X in warehouse W this month" → `sle_item_warehouse_created_at_idx`
- "Show me all movements for document GRN-0042" → `sle_source_document_id_idx`
- "Show me all sales this branch this week" → `sle_branch_id_created_at_idx`

These are read-only and do not hold locks.

### Accounting reads via outbox

The accounting module reads from the `accounting_outbox` table (not from the ledger
directly). The inventory engine posts outbox events with the cost data embedded — the
accounting module never needs to join to `stock_ledger_entries` to compute journal
entries.

## What the inventory module is NOT allowed to do

By the modular packaging principle (CLAUDE.md: "inventory depends DOWN into accounting
via events/outbox and never UP into POS/sales/purchase"):

- The inventory engine does NOT import from `@zerupt/pos`, `@zerupt/sales`, or
  `@zerupt/purchase` modules
- The inventory engine does NOT call POS or sales service methods
- Cross-module communication is exclusively via NestJS EventEmitter events (one-way:
  POS/Sales/Purchase → Inventory → Accounting)

This is verified by the module boundary comment in `inventory-domain.listener.ts`:
the listener is a consumer, not a caller.

## The `item_costing_configs` lookup (touched here)

Before every outbound write, the inventory engine resolves the costing method for the
item (`item_costing_configs` table, hot path). If a row with `is_active = true` exists,
that method is used; otherwise the tenant default is used.

This lookup is cached per-request (inside the transaction) to avoid repeated round-trips.
It is a read of master data, not a write to the ledger — but it is part of the ledger
write pipeline and must be correctly resolved before `unit_cost` is set on the entry.
