# Chapter 03 — Issue / Sale Path

## Entry points

| Source | Event | Handler |
|---|---|---|
| POS sale | `pos.transaction.completed` | `handlePosTransactionCompleted` → `fanOutSale` |
| POS void | `pos.void.completed` | `handlePosVoidCompleted` → `fanOutSaleReturn` |
| POS return | `pos.return.completed` | `handlePosReturnCompleted` → `fanOutSaleReturn` |
| Sales invoice | `sales.invoice.confirmed` | `handleSalesInvoiceConfirmed` → `fanOutSale` |
| Sales credit note | `sales.creditNote.confirmed` | `handleSalesCreditNoteConfirmed` → `fanOutSaleReturn` |

`inventory-domain.listener.ts:150–229`

## Negative-stock policy by channel

`inventory-domain.listener.ts:165`:

```typescript
const blockNegativeStock = effectiveSourceDocType !== 'pos'
```

POS sales are physical facts (cash already taken, offline sync possible) — they NEVER
block; stock goes negative and raises `NEGATIVE_STOCK_FLAG`. Sales invoices ALWAYS block
(`blockNegativeStock: true`). This is a deliberate business policy.

## The outbound engine path (per line)

`InventoryEventListener.applyOutbound` (`inventory-event.listener.ts:288`):

1. **Cross-entity guard** — `assertSameLegalEntityForTransfer()` — rejects `transfer_out`
   across legal entities (not relevant for sale, but same path).
2. **Pessimistic lock** — `SELECT FOR UPDATE` on materialized level.
3. **Negative-stock guard** — if `requestedQty > onHand` and `blockNegativeStock: true`
   → `BadRequestException`. If `flexible`, captures a `negativeStockFlag` object for
   post-commit emit.
4. **COGS calculation**:
   - Serial-tracked line: caller supplies `cogsSpecificTotalCost` (specific-ID, computed
     in the confirm tx). Engine posts that exact value. (`inventory-event.listener.ts:349`)
   - Non-serial line: `cogsCalculator.calculateOutbound()` — reads `averageCost` from the
     materialized level (WAC path). FIFO is guarded off until Layer 3.
5. **Ledger INSERT** — negative quantity, `movementType='sale'`, deterministic eventId.
6. **Outbox insert (inside tx)** — `outboxService.insert()` for the COGS JE
   (DR COGS / CR Inventory). This is the durable guarantee.
7. **Materialized level decrement** — `stockLevel.decrementOutbound()`.
8. **Post-commit** — in-process `eventEmitter.emit(accounting.post)` fast path.
   Journal posting deduplicates on `eventId` so poller re-emit is a no-op.

## Sale return (inbound path)

`fanOutSaleReturn` builds an `StockInboundPayload` with `movementType='sale_return'`.
The engine's `applyInbound` enters the returned goods at **current WAC** (not original
sale cost) — `inventory-event.listener.ts:645–658`. This is spec-correct for WAC
(`newWac = existingWac` by construction) but means the COGS-reversal JE uses the
ledger `totalCost` (at current WAC), not the original sale COGS. If WAC has drifted
significantly between sale and return, the reversal may differ from the original COGS —
P&L is not perfectly symmetric. This is a known limitation of WAC (not a bug, but
warrants documentation).

## Serial-specific COGS

Serial-tracked sales: the sales/POS confirm tx looks up `acquisitionCost` on each
serial row, sums to `cogsSpecificTotalCost`, and passes it in the domain event line.
`applyOutbound` posts that exact value without touching WAC.
`inventory-event.listener.ts:486–497` — `buildSpecificCostResult`.

**GAP — serial attribution on the ledger:** `fanOutSale` at
`inventory-domain.listener.ts:168` builds a `StockOutboundPayload` that has NO
`serialNumberId` field. The ledger's `serialNumberId` column exists (Layer-0 addition)
but the sale fan-out never populates it. Same gap as batch: the serial history query
`Σ ledger WHERE serial_number_id` always returns nothing.

## SOUND vs RISKY

**SOUND:** Dual-delivery (outbox inside tx + in-process emit) is the correct
at-least-once pattern. Specific-ID COGS for serials is financially correct.

**RISKY:**
- Serial/batch attribution not threaded → `serialNumberId`/`batchId` NULL on all sale
  ledger rows; serial transaction history is broken.
- POS void is treated identically to POS return (`fanOutSaleReturn`) — correct for
  stock, but the source_document_type is still `pos`, making void and return
  indistinguishable in the ledger. Void should arguably carry a distinct
  `sourceDocumentType` for audit.
