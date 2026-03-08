# Inventory Sentinel Agent

## Purpose

Detect inventory anomalies, prevent stockouts, and flag shrinkage patterns. Surfaces suggestions for reorder needs, negative stock, slow-moving items, and stock count variances.

**Rate limit:** 30 suggestions/day/tenant

---

## Monitors

### Event-Driven Checks

| Check | Trigger Event | Logic |
|-------|---------------|-------|
| Reorder level breach | `inventory.stock.moved` | After any stock movement, check if item's stock at that location fell below `reorderLevel`. If yes, create Warning with reorder suggestion. |
| Negative stock detection | `inventory.stock.moved` | If stock goes below zero (when soft-negative policy is enabled), create Critical suggestion. |
| Stock count variance | `inventory.count.approved` | After a stock count is approved, calculate variance per item. Flag items where variance exceeds configured shrinkage threshold (default 2%). |

### Scheduled Checks

| Check | Schedule | Logic |
|-------|----------|-------|
| Slow-moving stock | Weekly (`0 3 * * 1`) | Items with zero sales in 60+ days. Report total count and stock value. |
| Dead stock | Monthly (`0 3 1 * *`) | Items with zero sales in 180+ days. Report total count, stock value, and storage cost impact. |
| Shrinkage pattern detection | After each stock count | Analyse variance history per location. Flag locations with consistent negative variances across multiple counts. |
| Expiry risk (Phase 2) | Daily (`0 6 * * *`) | For `BatchTracked` / `Mixed` inventory concepts: batch items approaching expiry with remaining stock. |

## Example Suggestions

**WARNING:**
> Stock for "Samsung Galaxy S24 Ultra (256GB, Black)" at Salmiya Branch is at 2 units (reorder level: 5). Average weekly sales: 3 units. Estimated stockout in 4 days.
>
> `suggestedAction: { actionType: "purchase.order.create", endpoint: "/api/purchase-orders", payload: { supplierId: "...", items: [{ itemId: "...", qty: 10 }], branchId: "..." } }`

**INFO:**
> 23 items have had zero sales in the last 90 days with a total stock value of 8,750.000 KWD.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/reports/slow-moving-stock" } }`

**CRITICAL:**
> Stock count at Kuwait City warehouse found -47 units variance across 12 items (total value: 3,200.000 KWD). Highest variance: "Apple AirPods Pro" (-15 units). This exceeds your configured shrinkage threshold of 2%.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/inventory/counts/{id}" } }`

**WARNING (Expiry — Phase 2):**
> 15 batch items at Doha warehouse expire within 30 days. Total value at risk: 2,100.000 KWD.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/inventory/expiry-report?warehouseId=..." } }`

## Event References

Events from `accounting/07-event-mappings.md` and inventory module:
- `inventory.stock.moved` (any stock movement: sale, purchase receipt, transfer, adjustment)
- `inventory.count.approved`
- `inventory.adjustment.approved`
- `purchase.grn.approved` (stock received)
- `pos.transaction.completed` (stock decremented)

## Inventory Concept Sensitivity

Agent behaviour adapts based on `tenant.inventoryConcept`:

| Concept | Additional Checks |
|---------|-------------------|
| `Serialized` | Flag duplicate serial numbers, unaccounted serials after count |
| `BatchTracked` | Expiry risk checks, FEFO compliance verification |
| `WeightedMeasured` | Variance thresholds adjusted for measurement tolerance |
| `SimpleSKU` | Standard checks only |
| `Mixed` | All checks applicable based on per-item tracking type |

## Permissions

| Action | Required Key |
|--------|--------------|
| View inventory suggestions | `dashboard.suggestions.view` + `inventory.stock.view` |
| Accept reorder suggestion | `purchase.order.create` |
| View slow-moving report | `reports.inventory.view` |
| Investigate stock count | `inventory.count.view` |
