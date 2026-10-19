# Negative Stock Handling

## Company-Level Setting

| Mode | Behavior |
|------|----------|
| **Strict** | Block any transaction that would cause on-hand to go below zero |
| **Flexible** (default) | Warn the user but allow the transaction to proceed |

Set during onboarding. Changeable by admin.

## Item-Level Overrides

| Item Type | Override | Rationale |
|-----------|----------|-----------|
| Serial-tracked | Always strict (block) | Each serial is a physical unit. Cannot sell what doesn't exist. |
| Batch-tracked | Warn | Batch consumption tracks layers. Negative means data issue. |
| Regular (no tracking) | Follow company setting | |

## Enforcement Points

Every outbound movement checks before proceeding:

| Module | Check Point |
|--------|------------|
| POS | Before completing transaction |
| Sales | Before confirming invoice |
| Inventory | Before posting adjustment (decrease), transfer (send), consumption |
| Assembly | Before consuming components |

## Check Logic

```
availableAfter = currentOnHand - outboundQty

if availableAfter < 0:
  if item.trackingType == 'Serial':
    → BLOCK (always)
  elif companyMode == 'Strict':
    → BLOCK
  elif companyMode == 'Flexible':
    → WARN (show dialog: "This will cause negative stock. Proceed?")
    → If user confirms, allow and log the override
    → Create negative stock alert
```

## When Negative Stock Occurs

1. Alert created immediately (priority: Critical)
2. Item flagged in inventory dashboard
3. Inventory value may be incorrect (negative qty × WAC = negative value)
4. Resolution options:
   - Receive pending GRN (stock was sold before receipt was recorded)
   - Create positive adjustment (found stock)
   - Investigate data entry error

## Costing a Sale Made Before the Stock Arrives (as built)

Selling before receiving is normal retail (auto parts especially), so a sale is never blocked for want of a cost under the Flexible policy. Strict refuses instead (`requireCostBasis`). Transfers stay strict regardless.

**Provisional cost at the sale.** One ladder, shared by the posting engine and every cost-at-sale snapshot (POS, invoice, delivery order), in `apps/api/src/inventory/provisional-cost.ts`:

1. The entity cost pool's own average, when the pool has a basis (`poolHasCostBasis`). Not provisional.
2. The item's **last known real cost**. Candidates are pools with an ESTABLISHED cost (`poolHasEstablishedCostSql`: a receipt set `last_cost`, or the pool holds units at a positive average); a pool that is oversold and only adopted a provisional average never qualifies, so an estimate can never launder into "last known cost". The costed entity's OWN pool ranks first. Other legal entities are candidates only when the tenant setting `provisionalCostAcrossEntities` (tenant_identity, default OFF) is on, and only in the SAME functional currency; then most recently moved first. Other currencies are ignored, never converted.
3. The item's stated cost price (`items.cost_price`).
4. Nothing: relieve at 0, post no COGS, raise the `no_cost_basis` review flag.

**Snapshot is the single source.** Sales lines carry their confirm-time `costAtSale` to the engine as `provisionalUnitCost`; when the pool still has no basis at relief, the engine relieves at exactly that figure instead of re-reading the ladder, so reported COGS equals posted COGS. (Pool WAC wins whenever a basis exists by then.) Returns reverse at the engine's ledger cost (`readRealizedSaleCosts`), not at `costAtSale`. The engine keys rung 2 on the locked pool's entity and currency; the pool currency is always the entity's functional currency (`resolveFunctionalCurrency`, fails loud), never the document currency.

The pool adopts the provisional unit cost as its average while oversold, so the negative quantity is carried at that figure.

**True-up at the receipt.** The cost-establishing receipt posts a negative-stock true-up (`negative-stock-trueup.ts`): Dr COGS 5100 / Cr Inventory 1141 (or the reverse) for short qty x (receipt cost - the cost those units were ACTUALLY relieved at), dated in the RECEIPT's period and linked to the receipt document number, plus a zero-qty `negative_stock_trueup` ledger row so the sub-ledger ties to the GL. Closed periods are never rewritten; a better provisional cost only shrinks the true-up, it never changes the final COGS. This is IAS 2 weighted average with the correction recognised when the cost becomes known (a change in estimate, not a restatement).

The relieved cost is `oversoldReliefUnitCost`: -total_value / |on_hand| of the oversold pool (total_value is additive, so it holds exactly what the short units were relieved at), not the frozen average. This matters for a mixed pool: 1 unit relieved at 0, then 1 at an adopted 10, then a receipt of 2 at 12 trues up 14, not 2 x (12 - 10) = 4. Pools with pinned (migration replay) short units keep the average.

The old formula below (blending the negative quantity into the new WAC) is NOT used: it would push the sold units' cost difference into the cost of the units still on hand instead of into COGS.

**Review place.** Dashboard > Negative stock marks lines sold with no cost to go on (rung 4) with a "No cost" badge and a "Set cost" action that opens the item editor. Setting a cost price only improves future provisional costs; past sales are corrected by the true-up when the purchase is recorded. Quick-create item already asks for a cost price. The badge uses the SAME candidate predicate as the engine (`lastKnownCandidateCondition`: established cost, the warehouse entity's functional currency, own entity unless borrowing is on), so it can never disagree with what the engine relieved.

## WAC with Negative Stock (superseded, kept for history)

If on-hand is negative and new stock arrives:
```
New WAC = (negative_qty × old_WAC + incoming_qty × incoming_cost)
          ÷ (negative_qty + incoming_qty)
```

This can produce unexpected results. The system should flag items where WAC changed significantly due to negative stock resolution.
