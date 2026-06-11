# Stock Counting

## Count Types

| Type | Scope | Frequency | Use Case |
|------|-------|-----------|----------|
| **Full Count** | Entire warehouse | Annually | Year-end inventory |
| **Cycle Count** | Subset of items | Monthly/quarterly | ABC analysis rotation |
| **Spot Check** | Specific items/locations | Ad hoc | Random verification |

## ABC Classification (for Cycle Counts)

| Class | Criteria | Count Frequency |
|-------|---------|----------------|
| **A** | Top 20% items by value (80% of inventory value) | Monthly |
| **B** | Next 30% by value | Quarterly |
| **C** | Bottom 50% by value | Annually |

System auto-classifies based on `onHand × averageCost`. Reclassifies periodically (configurable).

## Count Document

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `type` | enum | `Full`, `Cycle`, `SpotCheck` |
| `warehouseId` | string | |
| `zoneIds` | array | Null = entire warehouse |
| `binIds` | array | Null = all bins in zone |
| `status` | enum | `Draft`, `InProgress`, `PendingReview`, `Approved`, `Posted` |
| `blindMode` | boolean | Default true. Hides system qty from counters. |
| `createdBy` | string | |
| `assignedTo` | array | User IDs of counters |
| `createdAt` | datetime | |
| `completedAt` | datetime | |

## Count Line

| Field | Type | Description |
|-------|------|-------------|
| `itemId` | string | |
| `binId` | string | |
| `systemQty` | decimal | System's quantity at time of count creation (frozen snapshot) |
| `countedQty` | decimal | Physically counted quantity |
| `variance` | decimal | `countedQty - systemQty` |
| `varianceValue` | decimal | `variance × cost` |
| `notes` | string | Explanation for discrepancy |
| `status` | enum | `Pending`, `Counted`, `Reviewed`, `Approved` |

## Count Workflow

```
1. Create Count
   → Select warehouse/zones/bins
   → System generates count lines (one per item per bin)
   → Freeze system quantities (snapshot)
   → Status: Draft

2. Start Count
   → Assign counters
   → Status: InProgress
   → Counter opens count sheet (blind mode: system qty hidden)

3. Enter Counts
   → Scanner: scan barcode → enter qty
   → Manual: select item → enter qty
   → Each line moves to Counted status

4. Multi-Count (optional)
   → Multiple counters count same items independently
   → System compares their counts
   → Discrepancy between counters → requires recount

5. Complete Count
   → All lines counted
   → System reveals variances (countedQty vs systemQty)
   → Status: PendingReview

6. Review
   → Manager reviews variances
   → Adds investigation notes to large discrepancies
   → Can order recount for specific items

7. Approve
   → Manager approves adjustments
   → Status: Approved

8. Post
   → Each variance line creates a stock adjustment
   → Movement type: COUNT_ADJUSTMENT
   → Accounting event emitted for each adjustment
   → Status: Posted
```

## Variance Thresholds

| Threshold | Action |
|-----------|--------|
| Within auto-approve range (e.g., ±2 units or ±$50) | Auto-approved, no manager review needed |
| Above auto-approve, below investigation threshold | Manager reviews and approves |
| Above investigation threshold (e.g., >10% or >$500) | Flagged for investigation. Requires notes before approval. |

Thresholds configurable per tenant.

## Counting During Business

Stock counts happen while the business operates. To handle concurrent movements:

1. System qty is **frozen at count creation time**
2. Any movements after the freeze (sales, GRNs) are tracked separately
3. At posting time: `adjustment = countedQty - (frozenQty + movements_since_freeze)`
4. This ensures movements during the count don't cause false variances

## Offline Counting

For warehouse staff using mobile devices without reliable connection:
1. Count sheet downloaded to device
2. Counts entered offline
3. When connection restored: sync counted quantities
4. Conflict: if item was counted both online and offline, latest timestamp wins with flag for review
