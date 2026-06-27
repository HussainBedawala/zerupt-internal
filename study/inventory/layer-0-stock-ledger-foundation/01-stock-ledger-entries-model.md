# 01 — The `stock_ledger_entries` Model

> Schema file: `packages/db/src/schema/inventory-costing.ts` (lines 46–193)

## What the table is

`stock_ledger_entries` is the **append-only, immutable spine** of the inventory system.
Every time stock moves — a sale, a goods receipt, a transfer, a manual adjustment, an
opening balance seed — one row is inserted. No row is ever updated. No row is ever
deleted. Corrections are new rows.

Think of it as a journal: pages are added, never torn out.

## Column-by-column walkthrough

### Identity

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | Row identity. Random UUID — no semantics, just uniqueness. |
| `tenant_id` | uuid NOT NULL | Defense-in-depth multi-tenant isolation. No FK because the tenants table lives in the admin DB (separate Neon project). Enforced at application level by `TenantContextMiddleware`. |

### Organizational dimensions

| Column | Type | Purpose |
|---|---|---|
| `legal_entity_id` | uuid NOT NULL → `legal_entities` (RESTRICT) | The legal entity that owns this stock movement. RESTRICT prevents deletion of a legal entity that has ledger history. |
| `branch_id` | uuid NOT NULL → `branches` (RESTRICT) | The branch that originated the movement. Needed for branch-level stock-movement reports and for the GL journal entry (`branchId` travels in the outbox payload). |
| `warehouse_id` | uuid NOT NULL → `warehouses` (RESTRICT) | The specific warehouse where the quantity changed. This is the primary location dimension on the ledger. |

### Item dimension

| Column | Type | Purpose |
|---|---|---|
| `item_id` | uuid NOT NULL → `items` (RESTRICT) | The inventory item. RESTRICT prevents deletion of an item with ledger history — enforcing the immutable audit trail from the item side. |

### Movement

| Column | Type | Purpose |
|---|---|---|
| `movement_type` | enum `stock_movement_type` NOT NULL | The economic type of the movement. The enum has 13 values (see Chapter 02). This is NOT a direction flag — the sign of `quantity` carries direction. `movement_type` carries business meaning ("why did this quantity change?"). |
| `quantity` | numeric(19,6) NOT NULL | **Signed**: positive = stock entering, negative = stock leaving. 6 decimal places accommodates fractional items (kg, litre, metre). 19 digits total prevents overflow even for bulk commodities. A CHECK constraint prevents zero (`sle_quantity_nonzero_check`) except for the `landed_cost_adjustment` type, which adjusts cost not quantity. |

### Cost (belongs here structurally; valuation semantics in Layer 3)

| Column | Type | Purpose |
|---|---|---|
| `unit_cost` | numeric(19,6) NOT NULL ≥ 0 | Cost per unit in functional currency at time of posting. For outbound SALE entries this is the WAC or FIFO-layer cost at the time of the movement. For inbound GRN entries this is the supplier's unit cost + allocated landed cost. Free goods have `unit_cost = 0`. |
| `total_cost` | numeric(19,6) NOT NULL ≥ 0 | `abs(quantity) × unit_cost`. **Denormalized** for query performance. The service layer is responsible for setting this correctly. CHECK constraint rejects negative values. |
| `currency` | varchar(3) NOT NULL | ISO 4217 functional currency of the legal entity at posting time. CHECK constraint enforces 3 uppercase letters. All amounts are in this currency; transaction-currency amounts (if needed) belong on the source document, not here. |

### Source document traceability

| Column | Type | Purpose |
|---|---|---|
| `source_document_type` | enum `document_type` NOT NULL | Short code for the business document that caused this movement: `pos`, `so`, `inv`, `cn`, `grn`, `adj`, `trf`, `ob`, etc. |
| `source_document_id` | uuid NOT NULL | The PK of the source document header. Indexed (`sle_source_document_id_idx`) so "show all movements for GRN-0042" is a fast lookup. |
| `source_document_line_id` | uuid nullable | Optional FK to the line within the source document. NULL for documents without line-level granularity (e.g., some adjustment types). |

Together these three columns create a complete audit trail: from any ledger row you can
navigate back to the exact document and line that caused the movement.

### Idempotency

| Column | Type | Purpose |
|---|---|---|
| `event_id` | uuid nullable | Deduplication key. The BullMQ worker or domain listener sets this to a deterministic UUID v5 derived from `(sourceDocumentId, movementType, itemId, lineIndex)`. A partial unique index (`sle_event_id_key WHERE event_id IS NOT NULL`) makes duplicate delivery of an event a no-op — the insert silently returns null instead of throwing. Manual adjustments (where replay risk is low) may omit `event_id`. |

### Cost layer link

| Column | Type | Purpose |
|---|---|---|
| `cost_layer_id` | uuid nullable | For FIFO items: links this ledger entry to the specific `inventory_cost_layers` row that was consumed (outbound) or created (inbound). NULL for WAC items. Partial index `sle_cost_layer_id_idx WHERE cost_layer_id IS NOT NULL` keeps the index small. |

### Audit

| Column | Type | Purpose |
|---|---|---|
| `created_by` | uuid NOT NULL | Supabase Auth user who triggered the movement. System jobs (BullMQ workers, listeners) use the sentinel `00000000-0000-0000-0000-000000000000`. |
| `created_at` | timestamptz NOT NULL | Wall-clock insertion time. This is NOT the business date for the movement — the business date lives on the source document (`occurred_at` on `stock_adjustments`; `confirmed_at` on invoices, etc.). |

**Intentionally absent: `updated_at`.**  
There is no `updated_at` column. This table is immutable. The absence of `updated_at` is
a deliberate signal to any future developer: there is no legitimate reason to UPDATE this
table. If you find yourself wanting to add `updated_at`, you are solving the wrong problem.

## CHECK constraints summary

| Constraint name | Rule |
|---|---|
| `sle_quantity_nonzero_check` | `quantity != 0` unless `movement_type = 'landed_cost_adjustment'` |
| `sle_unit_cost_non_negative_check` | `unit_cost >= 0` |
| `sle_total_cost_non_negative_check` | `total_cost >= 0` |
| `sle_currency_format_check` | `currency ~ '^[A-Z]{3}$'` |

## Indexes summary

| Index | Columns | Use case |
|---|---|---|
| `sle_event_id_key` (partial unique) | `event_id` WHERE NOT NULL | Idempotency deduplication |
| `sle_item_warehouse_created_at_idx` | `item_id, warehouse_id, created_at` | COGS / FIFO ledger replay for one item at one warehouse |
| `sle_item_id_created_at_idx` | `item_id, created_at` | Item movement history across all warehouses |
| `sle_branch_id_created_at_idx` | `branch_id, created_at` | Branch stock movement reports |
| `sle_warehouse_movement_type_created_at_idx` | `warehouse_id, movement_type, created_at` | "Show all sales for this warehouse this month" |
| `sle_source_document_id_idx` | `source_document_id` | Drill-through from a GRN/SO to its ledger entries |
| `sle_cost_layer_id_idx` (partial) | `cost_layer_id` WHERE NOT NULL | FIFO layer → ledger audit |
| `sle_legal_entity_id_idx` | `legal_entity_id` | FK restrict check |
| `sle_warehouse_id_idx` | `warehouse_id` | FK restrict check |

## Why no `tenant_id` index?

Each tenant runs in its own Neon database (per-tenant isolation). There is only one
tenant's data in the database — a `tenant_id` index would be wasteful. The column is
still present for defense-in-depth (application-level assertions) and for emergency
cross-tenant forensics if a table is shared in the future, but the planner never needs it
as a filter.

## The `StockLedgerService` API

`apps/api/src/inventory/stock-ledger.service.ts` wraps the table with exactly three
public methods:

```
record(movement, tx?)         → insert one entry; returns null on duplicate eventId
recordMany(movements[], tx)   → batched insert (chunked for PG 65k bind-param cap)
findBySourceDocument(docId)   → read all entries for a document
findByEventId(eventId)        → idempotency pre-check
```

No `update()`. No `delete()`. The service enforces immutability by design.

## Design quality assessment

The model is sound and production-ready for the 10-year horizon with one observation:
the absence of lot/batch and serial dimensions on the ledger (covered in Chapter 02).
