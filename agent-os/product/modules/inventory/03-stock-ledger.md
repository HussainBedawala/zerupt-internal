# Stock Ledger

## Concept

The stock ledger is the single source of truth for item quantities. Every stock change creates an immutable ledger entry. Current stock = sum of all ledger entries for that item at that location.

## Stock Ledger Entry

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `itemId` | string | |
| `warehouseId` | string | |
| `zoneId` | string | null if not used |
| `binId` | string | null if not used |
| `movementType` | enum | See movement types below |
| `quantity` | decimal | Positive = stock in, Negative = stock out |
| `unitCost` | decimal | Cost per unit at time of movement (functional currency) |
| `totalCost` | decimal | `quantity × unitCost` |
| `sourceDocumentType` | string | `GRN`, `SalesInvoice`, `POSTransaction`, `Adjustment`, `Transfer`, etc. |
| `sourceDocumentId` | string | |
| `serialNumberId` | string | If serial-tracked item |
| `batchId` | string | If batch-tracked item |
| `notes` | string | |
| `createdBy` | string | User ID |
| `createdAt` | datetime | |

## Movement Types

| Type | Quantity | Source |
|------|----------|--------|
| `GRN_RECEIPT` | + | Purchase GRN |
| `SALE` | - | Sales Invoice or POS Transaction |
| `SALE_RETURN` | + | Credit Note or POS Return |
| `PURCHASE_RETURN` | - | Purchase Return |
| `ADJUSTMENT_IN` | + | Stock Adjustment (found/surplus) |
| `ADJUSTMENT_OUT` | - | Stock Adjustment (lost/damaged/write-off) |
| `TRANSFER_OUT` | - | Stock Transfer (source) |
| `TRANSFER_IN` | + | Stock Transfer (destination) |
| `CONSUMPTION` | - | Internal Consumption |
| `ASSEMBLY_IN` | + | Assembly (finished goods produced) |
| `ASSEMBLY_OUT` | - | Assembly (components consumed) |
| `DISASSEMBLY_IN` | + | Disassembly (components recovered) |
| `DISASSEMBLY_OUT` | - | Disassembly (finished goods broken down) |
| `COUNT_ADJUSTMENT` | +/- | Stock Count variance |
| `OPENING_BALANCE` | + | Initial stock import |

## Stock Quantities

For any item at any location, multiple quantity types exist:

| Quantity | Calculation | Description |
|----------|------------|-------------|
| **On Hand** | Sum of all ledger entries | Physical stock present |
| **Committed** | Sum of confirmed but undelivered sales orders | Reserved for customers |
| **In Transit** | Sum of sent but unreceived transfers | Moving between locations |
| **On Order** | Sum of confirmed but unreceived POs | Coming from suppliers |
| **Available** | On Hand − Committed | What can actually be sold |

```
Available = On Hand - Committed
Projected = On Hand - Committed + On Order + In Transit (inbound)
```

## Stock Level Snapshot (Materialized)

For performance, maintain a materialized stock level per item per location:

| Field | Type | Description |
|-------|------|-------------|
| `itemId` | string | |
| `warehouseId` | string | |
| `onHand` | decimal | Current physical stock |
| `committed` | decimal | Reserved by sales orders |
| `inTransit` | decimal | Moving between locations |
| `onOrder` | decimal | Expected from POs |
| `available` | decimal | `onHand - committed` |
| `lastCost` | decimal | Cost from most recent inbound movement |
| `averageCost` | decimal | Current WAC |
| `updatedAt` | datetime | |

Updated transactionally whenever a ledger entry is created.

## Immutability Rules

| Rule | Detail |
|------|--------|
| Ledger entries are never edited | Corrections create new counter-entries |
| Ledger entries are never deleted | Soft delete not even available |
| Every entry has a source document | No orphan movements |
| Timestamp is server-generated | Cannot be manually set (except opening balances) |

## Inventory Valuation

Total inventory value at any point:

```
WAC items:  sum(onHand × averageCost) per item per warehouse
FIFO items: sum(remaining cost layers) per item per warehouse
Total:      sum of all items across all warehouses
```

This must always match the Inventory control account (1141) in the General Ledger. Any discrepancy = bug.
