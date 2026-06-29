# Chapter 04 — Consumed / Sold Stock Handling

The hardest case: landed cost posted after some (or all) of the received goods have been sold.

---

## The Problem

At GRN time, WAC was computed without the freight. If goods were sold at WAC-based COGS,
the COGS was understated. When the landed cost arrives, the delta must be split:
- On-hand portion → increase WAC (capitalise to inventory)
- Sold portion → retroactive COGS adjustment (expense the understatement in the current period)

---

## Detection Logic (EXISTS)

`landed-cost.listener.ts:88`:
```
totalReceived = Σ quantity from stock_ledger_entries where
               sourceDocumentId = grnId AND movementType = 'grn_receipt'

soldQty = max(totalReceived − onHand, 0)
```

`onHand` comes from `materializedStockLevels` (pessimistic-locked at start of tx).

---

## COGS Adjustment JE

When `soldQty > 0`, an accounting JE is inserted into the outbox with `lineType =
'cogs_adjustment'`, DR amount = `cogsAdjustment` (see ch 03 for the full JE shape).

The JE `occurredAt` is `new Date()` (current timestamp), NOT the original sale date or the
LC document date. This means the retroactive COGS adjustment posts to the **current open
period**, not the period in which the goods were sold.

**Design decision (EXISTS — documented in spec):**
Per `04-landed-cost-allocation.md:75`:
> "If items from target GRN(s) already sold → retroactive COGS adjustment (see accounting/05-cogs-logic.md)"

The spec delegates to `accounting/05-cogs-logic.md` (not studied here) for exact period
treatment. The implementation uses the current period.

---

## FIFO and Consumed Layers

For FIFO items, `fifoEngine.adjustLayerCost` is called only when `remainingQty > 0`
(`landed-cost.listener.ts:124`). Consumed FIFO layers are NOT adjusted in the cost layer
table — only on-hand layers receive the per-unit delta. The sold-portion cost correction
goes through the COGS JE only.

---

## Gap: Return After Landed Cost

**REQUIRES (GAP):** If a purchase return is processed against a GRN that already has a landed
cost posted, the return uses `unitCost` from the GRN line — which does NOT include the landed
cost delta. The return credit memo to inventory is understated. The spec does not address
this interaction. No guard exists in the return service to check for associated landed costs.

---

## Gap: Negative On-Hand (Stock Goes Below Zero)

**REQUIRES (GAP):** If on-hand goes negative (allowed by some tenants), `remainingQty =
max(onHand, 0) = 0` and the full delta is treated as COGS adjustment. This is correct
directionally, but "soldQty > totalReceived" means the item has been oversold. No warning
or special handling for this case.

---

## Gap: Multiple GRNs with Partial Sales per GRN

When a landed cost targets multiple GRNs, one `inventory.landed_cost.applied` event fires
per GRN line. Each event independently calculates its sold/on-hand split using the line's
specific GRN as `sourceDocumentId`. This is correct — each GRN receipt has its own sold
proportion. However, the stock level check (`getLevelForUpdate`) is per `(itemId, warehouseId)`,
not per GRN. If the same item appears in two targeted GRNs and some stock has been sold,
the `totalReceived` from the second event's ledger lookup includes ALL grn_receipt entries for
that item+warehouse (not just from the second GRN). This can over- or under-count sold qty
when multiple GRNs for the same item are targeted.

**Severity: medium** — common when bulk importing across multiple supplier shipments.
