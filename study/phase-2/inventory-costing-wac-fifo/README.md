# Inventory Costing: WAC and FIFO

## Weighted Average Cost (WAC)

WAC recalculates the unit cost of inventory each time new stock arrives:

```
newWAC = (existingQty x existingWAC + incomingQty x incomingCost) / (existingQty + incomingQty)
```

- **Default method** for most retail items — simple, no layer tracking needed
- On consumption (sale), COGS = quantity x current WAC
- WAC changes only on inbound events, never on outbound
- Purchase returns use reverse formula: `(existingQty x WAC - returnQty x originalCost) / resultingQty`

### Precision and Rounding

Financial calculations require deterministic rounding. **Banker's rounding** (ROUND_HALF_EVEN) eliminates systematic bias:

- When the digit after the rounding position is exactly 5, round to the nearest even number
- `1.5000005` → `1.500000` (6th decimal is 0, even → round down)
- `1.5000015` → `1.500002` (6th decimal is 1, odd → round up to even)

Libraries like Decimal.js provide arbitrary-precision arithmetic and configurable rounding modes, avoiding floating-point errors inherent in IEEE 754.

## FIFO (First In, First Out)

FIFO tracks inventory in **cost layers** — each inbound creates a layer with its own unit cost:

```
Layer 1: 100 units @ 10.00 (oldest)
Layer 2:  50 units @ 12.00
Layer 3:  30 units @ 11.50 (newest)
```

On consumption, the oldest layers are consumed first:
- Sell 120 units → consume 100 from Layer 1 + 20 from Layer 2
- COGS = (100 x 10) + (20 x 12) = 1,240

### When to Use FIFO vs WAC

| Factor | WAC | FIFO |
|--------|-----|------|
| Complexity | Simple — one number per item/warehouse | Complex — track every layer |
| Best for | Homogeneous goods, high-volume retail | Perishables, batch-tracked items |
| COGS accuracy | Smoothed average | Reflects actual purchase costs |
| Storage overhead | Minimal | Grows with inbound frequency |

## Landed Cost Adjustments

Freight, customs duties, and insurance are often invoiced after goods receipt. These **landed costs** must be allocated retroactively:

1. Find how much was originally received vs. how much remains in stock
2. **Sold portion** → COGS adjustment (expense already recognized, now corrected)
3. **Remaining portion** → Inventory uplift (asset value increases, WAC recalculated)

```
totalReceived = 100, remaining = 80, sold = 20
landedCost = 100.00

cogsAdjustment    = 100 x (20/100) = 20.00   → DR COGS Adjustment
inventoryUplift   = 100 x (80/100) = 80.00   → DR Inventory
                                               CR Landed Cost Payable
```

## Concurrency Control

Inventory operations must be serialized per item/warehouse to prevent race conditions:

- **SELECT FOR UPDATE** locks the stock level row within a transaction
- Prevents two concurrent sales from reading the same WAC and double-decrementing
- The lock is released when the transaction commits or rolls back

## Idempotency in Event-Driven Systems

Events may be delivered more than once (at-least-once delivery). Idempotency ensures processing an event twice has the same effect as processing it once:

- Each event carries a unique `eventId`
- A **unique partial index** on the ledger table prevents duplicate inserts
- If the insert returns null (conflict), the listener skips processing

## Key Accounting Entries

| Event | Debit | Credit |
|-------|-------|--------|
| Sale (COGS) | COGS (5100) | Inventory (1141) |
| Purchase Return | AP / Vendor | Inventory (1141) |
| Landed Cost (sold portion) | COGS Adjustment | Landed Cost Payable |
| Landed Cost (remaining) | Inventory (1141) | Landed Cost Payable |
