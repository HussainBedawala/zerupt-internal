# Reorder Engine

## Reorder Configuration (Per Item Per Warehouse)

| Field | Type | Description |
|-------|------|-------------|
| `itemId` | string | |
| `warehouseId` | string | |
| `reorderLevel` | decimal | Alert when available stock falls to this level |
| `reorderQty` | decimal | Suggested order quantity |
| `maxLevel` | decimal | Alert when stock exceeds this (overstock) |
| `safetyStock` | decimal | Buffer above reorder level for demand variability |
| `leadTimeDays` | integer | Days from PO to delivery (per supplier) |
| `preferredSupplierId` | string | Default supplier for this item |

## Alert Triggers

| Alert | Condition | Priority |
|-------|-----------|----------|
| **Low Stock** | `available <= reorderLevel` | Medium |
| **Out of Stock** | `onHand == 0` | High |
| **Overstock** | `onHand > maxLevel` | Low |
| **Slow Moving** | No sales in X days (configurable, default 90) | Low |
| **Expiring Soon** | Batch expiry within X days (configurable, default 30) | Medium |
| **Negative Stock** | `onHand < 0` | Critical |

Alerts delivered via in-app notification center + optional email.

## Stock Alert Check

Runs:
- **Real-time:** After every stock ledger entry, check the affected item
- **Daily batch job:** Full scan of all items (catches anything missed)

## Suggested PO Generation

When items hit reorder level:

1. Group items by preferred supplier
2. For each supplier group, generate a suggested PO:
   - Items where `available <= reorderLevel`
   - Suggested qty = `reorderQty` (or `maxLevel - onHand` if configured to fill-to-max)
   - Expected delivery = `today + leadTimeDays`
3. Present to user for review
4. User can adjust quantities, add/remove items
5. One-click conversion to actual Purchase Order

## Reorder Calculation Methods

| Method | Formula | When |
|--------|---------|------|
| **Fixed quantity** | Order `reorderQty` when `available <= reorderLevel` | Default. Simple. |
| **Fill to max** | Order `maxLevel - onHand` when `available <= reorderLevel` | When overstock prevention matters |
| **Economic Order Quantity** | Based on demand rate, ordering cost, holding cost | Weeks 3-6 / AI enhancement |

## AI-Powered Suggestions (Weeks 3-6)

The reorder engine exposes data for the AI service to enhance:

| Data Point | Purpose |
|-----------|---------|
| Sales velocity (units/day, last 30/60/90 days) | Predict future demand |
| Seasonality patterns (same month prior years) | Adjust for seasonal peaks |
| Supplier lead time reliability (actual vs promised) | Buffer for late deliveries |
| Stockout history | Identify chronic under-ordering |

AI provides **suggested overrides** to reorderLevel and reorderQty. User can accept or ignore.
