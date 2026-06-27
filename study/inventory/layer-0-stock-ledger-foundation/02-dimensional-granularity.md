# 02 — Dimensional Granularity: Item / Location / Lot / Serial / Bin

## What "dimension" means on a stock ledger

A ledger dimension is a column that determines WHICH stock position a movement belongs
to. If two movements have different dimension values, they belong to different buckets and
their quantities do NOT add up.

In accounting, the dimensions are Account + Entity. In inventory, the fundamental question
is: **how precisely do you track WHERE a unit is and WHICH unit it is?**

The answer varies by business and by item:

- A grocery store selling loose rice: item + warehouse is enough
- A food distributor: item + warehouse + batch (lot + expiry) — FEFO
- A pharma wholesaler: item + warehouse + batch (mandatory by regulation)
- An electronics retailer: item + warehouse + serial number (warranty + theft)
- A large warehouse with bins: item + warehouse + zone + bin

Getting the dimensional model permanently right is **the 10-year decision** for the
inventory ledger. Changing it later requires migrating millions of rows.

## Current state of the ledger dimensions

The `stock_ledger_entries` table (as of 2026-06-27) has these location/item dimensions:

```
item_id          ✓ present
warehouse_id     ✓ present
branch_id        ✓ present (org scope, not location granularity)
legal_entity_id  ✓ present (org scope)

batch_id         ✗ MISSING from stock_ledger_entries
serial_number_id ✗ MISSING from stock_ledger_entries
bin_id           ✗ MISSING from stock_ledger_entries
```

The batch and serial tracking schemas (`item_batches`, `item_serial_numbers`) are fully
built, but they are **not linked as dimensions on the ledger**.

## What exists for batch/serial tracking today

### `item_batches` table (`packages/db/src/schema/item-batches.ts`)

Tracks batch/lot records per `(tenant_id, item_id, warehouse_id, batch_no)`. Has:
- `qty_remaining` maintained by the service layer
- `expiry_date` + `manufactured_date` for FEFO
- FEFO index: `item_batches_fefo_idx` on `(tenant_id, item_id, warehouse_id, status, expiry_date)`

The batch is a **separate tracking record**, not a ledger dimension. The ledger does NOT
record which batch was sold.

### `inventory_cost_layers` table

Has a `batch_id` column:
```
batchId: uuid("batch_id"),
// TECH DEBT: Add FK once batches table exists.
```
The comment is outdated — `item_batches` does exist. But `batch_id` on cost layers is
still present without a FK, and it does NOT flow onto the ledger entry itself. So a FIFO
layer can be associated with a batch, but the ledger row that consumed that layer has no
`batch_id` of its own.

### `item_serial_numbers` table (serial-numbers.ts)

Tracked per item with status (`available`, `reserved`, `sold`, `returned`). Serial
lifecycle is managed in document confirm transactions, NOT via the ledger.

## The gap and its consequences

**Gap:** `stock_ledger_entries` cannot answer "how many units of batch LOT-2024-07 were
sold to which customers?" or "which serial number was sold in transaction POS-0041?"
without joining to the source documents (POS/invoice lines).

**Consequence for a stockkeeper:**
- A pharmacist cannot run a batch recall trace from the ledger alone
- A jeweller cannot prove which serial number was in stock at a given date from the ledger
- A FEFO audit cannot verify that the earliest-expiry lot was actually consumed first
  (the ledger is silent; only `item_batches.qty_remaining` tracks it)

**Consequence for valuation:**
- FIFO layers have `batch_id` (optional, nullable), so cost-layer-to-batch linkage exists
  but is incomplete: no FK, and the ledger entry itself doesn't carry `batch_id`

## Is this a design flaw or an MVP deferral?

Both. For the MVP (retail, WAC, no lot-mandatory regulation) this is acceptable. The
`item_batches` qty_remaining gives the stockkeeper batch-level balances, and the FEFO
index enables correct depletion order at sale time.

For a 10-year-horizon multi-tenant product serving:
- pharma wholesale (batch recall is regulatory, not optional)
- food distribution (FEFO mandatory, batch audit mandatory)
- electronics (serial-level warranty + theft)

...the ledger needs `batch_id` and `serial_number_id` as **optional** dimensions.

## The 10-year dimensional model (what it should become)

```
stock_ledger_entries columns to add:
  batch_id          uuid nullable → item_batches.id (RESTRICT)
  serial_number_id  uuid nullable → item_serial_numbers.id (RESTRICT)
  bin_id            uuid nullable → bins.id (RESTRICT)
```

Rules:
- `batch_id` is set when `item.tracking_type = 'batch'`, else NULL
- `serial_number_id` is set when `item.tracking_type = 'serial'`, else NULL
- `bin_id` is set when the warehouse uses bin-level tracking, else NULL
- Materialized stock levels: the `(item_id, warehouse_id)` unique key would need to
  become `(item_id, warehouse_id, batch_id, bin_id)` — a significant schema change

Adding these dimensions NOW (while the ledger is young and tenant counts are low) is far
cheaper than adding them after go-live with real transaction history.

## Current `materialized_stock_levels` granularity

`materialized_stock_levels` is keyed by `(item_id, warehouse_id)` — one row per item per
warehouse. This means:
- On-hand is aggregated across all batches and serials for that item+warehouse
- You cannot read "how many units of LOT-2024-07 are on-hand at warehouse W" from
  `materialized_stock_levels` — you need to query `item_batches.qty_remaining`

This is a consistent deferral: the materialized view granularity matches the ledger
granularity. Both need to expand together.

## `stockMovementType` enum — the 13 movement types

```
Inbound (positive quantity):
  grn_receipt        — goods received from supplier
  sale_return        — customer returns goods
  adjustment_increase — manual increase (found goods, opening balance via adj, etc.)
  transfer_in        — received at destination warehouse
  assembly_in        — finished goods entering stock from assembly
  opening_balance    — onboarding-only stock seed (no GL event)

Outbound (negative quantity):
  sale               — sold at POS or invoiced
  purchase_return    — returned to supplier
  adjustment_decrease — manual decrease (damaged, lost, write-off)
  transfer_out       — sent from source warehouse
  assembly_out       — components consumed in assembly
  consumption        — internal consumption (not yet actively used)

Special (quantity can be zero):
  landed_cost_adjustment — adjusts unit_cost on FIFO layers, not qty
```

The enum is clean and extensible. Adding new movement types (e.g., `consignment_in`,
`loan_out`) requires only `ALTER TYPE ADD VALUE` — safe in a Neon PG16 transaction.

## Decision for the audit

The audit (Layer 0 hardening) must resolve:

1. **Add `batch_id` and `serial_number_id` to `stock_ledger_entries` now?**
   - If yes: also update `materialized_stock_levels` unique key (breaking schema change)
   - If deferred: document explicitly and accept that batch-level ledger trace requires
     joining to source documents for the foreseeable future
2. **Add FK from `inventory_cost_layers.batch_id` to `item_batches.id`?**
   - Low-risk, should be done now (the table exists, the comment is stale)
3. **Add `bin_id` to the ledger?**
   - Bins exist in the schema (`bins` table, `bins.controller.ts`). If bin-level
     tracking is planned, adding the column now costs nothing.
