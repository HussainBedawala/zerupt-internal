# 00 — Overview: What Master Data Means for Inventory

## Role of master data

The stock ledger (Layer 0) is an append-only log of quantity events. Every row in
`stock_ledger_entries` references an `itemId` and a `warehouseId`. Those UUIDs are
meaningless unless the master records behind them are complete, accurate, and stable.

Master data is the vocabulary the ledger speaks. Get it wrong and:
- A "Box of 12" receipt posts as 1 unit (wrong conversion factor).
- A pharma batch ships without expiry because `trackingType = 'none'`.
- Stock appears in "Warehouse A" on reports but physically lives in bin A-3-07.

Layer 1 defines all master data that Layer 0's ledger dimensions can reference:

```
items (SKU master)
  ├── item_categories        (classification tree)
  ├── item_barcodes          (scan-to-item resolution)
  ├── item_pack_units        (UOM conversion + sell/buy defaults)
  └── trackingType           (none | batch | serial — drives Layer 0 enforcement)

item_batches               (lot/batch identity, expiry, lifecycle)
item_serial_numbers        (individual unit identity, warranty, lifecycle)

org_structure
  ├── legal_entities
  ├── branches
  ├── warehouses             (the ledger dimension)
  ├── zones                  (sub-warehouse)
  └── bins                   (deferred ledger dimension — wire-in Layer 1)
```

## What is NOT in scope for this layer

- Quantity movements — those are Layer 2 (movement engine).
- Valuation math (WAC/FIFO, COGS) — Layer 3.
- Stock counts — Layer 4.
- Reports — Layer 5.
- `item_batches.qtyRemaining` — that is a ledger projection (Σ ledger.quantity WHERE
  batch_id), not a master-data field. It is read here for context but owned by Layer 0/2.

## The 10-year promise

A standalone stockkeeper must be able to:
1. Define every item exactly as the business sells it (units, packs, barcodes,
   batch/serial/expiry tracking, variant matrix).
2. Organize items into a navigable category tree.
3. Model every physical storage location down to bin level.
4. Trust that master records are immutable as identity (SKU/code never silently renamed),
   deactivatable but never deleted while history exists, and isolated per tenant.

Chapters 01–09 make this concrete, cite the real schema, and flag gaps for the audit.
