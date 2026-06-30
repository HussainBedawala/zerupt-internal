# Sales Layer 2 — COGS Recognition

## Where and When COGS Posts

**Trigger:** `sales.invoice.confirmed` event → `InventoryDomainEventListener.fanOutSale()` → `InventoryEventListener.applyOutbound()` with `movementType: "sale"`

The inventory engine is the **single source of COGS truth**. It owns WAC/FIFO when it processes the SALE movement and posts the COGS/Inventory JE itself.

**GL entry (posted by inventory engine):**
```
DR 5100 COGS           (SALE movement value)
CR 1141 Inventory
```

**GL entry (posted by SalesAccountingListener):**
```
DR 1131 Trade Receivables  (revenue + tax)
CR Revenue / Sales
CR Output Tax Liability
```

These are TWO SEPARATE LISTENERS on the same event — there is NO double-count. The listeners are:
1. `InventoryDomainEventListener` → moves stock + posts COGS/Inventory JE
2. `SalesAccountingListener` → posts AR/Revenue/Tax JE

Source: `sales-invoices-events.ts:1-12` (comment at top of file); `sales.listener.ts:1-9`

---

## Cost Basis: WAC at Moment of Confirm (with Serial Overrides)

### Non-serial (WAC) lines:
- `costAtSale` = `materializedStockLevels.averageCost` read inside the confirm tx: `sales-invoices.service.ts:654`
- Passed to inventory engine as `unitCost` in the event payload
- Engine recomputes WAC on the fly — the `materializedStockLevels` read is a **snapshot for reporting only**; the engine owns authoritative costing: `sales-invoices-cogs.ts:3-7`

### Serial-tracked lines:
- `claimSerialLines()` calls `SerialAllocationService.claimForSale()`: `sales-invoices.service.ts:1370`
- Returns `totalAcquisitionCost` = sum of each serial's own acquisition cost (specific identification)
- Stored as PER-UNIT `costAtSale = totalAcquisitionCost / qty`: `sales-invoices.service.ts:1379-1384`
- Event carries `cogsSpecificTotalCost` for serial lines: `sales-invoices-events.ts:122`
- Engine uses `cogsSpecificTotalCost` instead of WAC for the COGS JE

### Batch-tracked lines:
- No `batchId` resolved at invoice add-line — the engine FEFO-picks lots at movement time
- `unitCost` in the event = WAC snapshot from `materializedStockLevels` (best-effort; engine picks FEFO actual cost)
- GAP: if WAC snapshot drifts from FEFO engine cost, `costAtSale` (reporting) != COGS JE. Acceptable by design (FIFO/FEFO cost is authoritative for GL; reporting is approximate).

---

## Revenue Recognized At Same Point as COGS

Both the revenue JE and COGS JE fire on the same `sales.invoice.confirmed` event, so they are always concurrent. Neither can post without the other unless one listener fails. If `SalesAccountingListener` succeeds but `InventoryDomainEventListener` fails (or vice versa), the outbox poller retries the failed side until both post. The outbox eventId deduplicates re-posts. This is architecturally sound but **not atomic** — a gap window exists between the two listener executions.

---

## Double-Count Check

| Scenario | Verdict |
|----------|---------|
| Revenue posted twice | Not possible — single `handleInvoiceConfirmed` listener, eventId-deduped |
| COGS posted twice | Not possible — inventory engine deduplicates on `eventId` per SLE row |
| Revenue without COGS | Possible if inventory listener DLQs; outbox poller will retry |
| COGS without Revenue | Possible if sales listener DLQs; outbox poller will retry |
| `costAtSale` (reporting) != COGS JE | Possible for batch-FEFO lines (by design); for WAC non-serial lines the snapshot is taken from the same `materializedStockLevels` the engine reads |
