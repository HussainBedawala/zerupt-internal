# Sales Layer 2 — GAP CANDIDATES

Gaps are listed in order of accounting/data-integrity risk. Severity: CRITICAL / HIGH / MEDIUM / LOW.

---

## G1 — No `FOR UPDATE` Lock on Invoice at Confirm (MEDIUM)

**File:** `sales-invoices.service.ts:604-754`

The invoice confirm transaction reads `materializedStockLevels` for the pre-check without a `FOR UPDATE` lock on the invoice row. The guarded UPDATE on `status=draft` prevents double-confirm, but the pre-check stock read is a snapshot — two concurrent confirms of different invoices covering the same item/warehouse can both pass the pre-check and both proceed. The engine's `blockNegativeStock` in `inventory-domain.listener.ts:195` is the authoritative backstop, but it fires AFTER the commit, in the async listener. If the engine rejects (stock went negative between invoice commit and listener run), the invoice is already `confirmed` with no rollback path. Mitigation: add a `FOR UPDATE` on a stock reservation row, or move the authoritative check into the confirm tx.

Compare: purchase GRN uses `FOR UPDATE` on the GRN row at confirm; sales does not on the stock level.

---

## G2 — Batch-Tracked Lines: `costAtSale` != Engine COGS (LOW-MEDIUM)

**File:** `sales-invoices-cogs.ts:1-52`; `sales-invoices-events.ts:107-130`

For batch-tracked items, `costAtSale` is the WAC snapshot from `materializedStockLevels`. The inventory engine FEFO-picks lots and computes the actual cost from lot layers. These can differ. Result: `salesInvoiceLines.costAtSale` (used in reporting, returns cost basis) != COGS JE amount. A goods-return credit note uses `costAtSale` as `returnCost` — so the COGS reversal may not equal the original COGS JE. Net COGS error on round-trip return.

---

## G3 — Invoice Void Not Supported; Only Credit Note Path (MEDIUM)

**File:** `sales-invoices.service.ts` (no void method exists)

If a confirmed invoice must be cancelled outright (wrong customer, wrong date, before any payment), there is no void. The user must raise a full credit note covering all lines. This is auditable but operationally cumbersome, and creates a CN number gap on what was effectively a user error. A void path (requiring zero balance, no receipts) would be cleaner and mirrors purchase GRN void semantics.

---

## G4 — Pre-Check Reads Materialized WAC, Not Current Ledger (MEDIUM)

**File:** `sales-invoices-cogs.ts:37-44`

`readStockByItem` reads `materializedStockLevels` which is a materialized/cached view. If the materialization lags (e.g. a stock movement just posted but the materialized row hasn't updated), the pre-check may report stale `onHand` or `averageCost`. This is a known design tradeoff (materialized WAC vs real-time ledger scan) but should be flagged for the audit: it means the `costAtSale` snapshot can be stale for recently-received stock.

---

## G5 — No Partial Delivery Document (LOW for MVP, MEDIUM for B2B)

**Architecture**

Sales Orders exist, but there is no "delivery order" or "dispatch" document. The SO → Invoice flow requires invoicing the full line or splitting manually. For customers who ship and bill separately (B2B trade terms), stock cannot be relieved at dispatch before billing. This is by design for the MENA retail MVP but will need a DO layer for B2B.

---

## G6 — Batch Return: No Lot Column on Credit Note Line (LOW)

**File:** `credit-notes.events.ts:71-74` (comment)

Batch-tracked goods returns don't carry a `batchId` on the credit note line. The engine restocks without a specific lot reference. This means batch-tracked inventory returned via credit note gets blended back into WAC without tying back to the original lot. Serial returns work correctly (serial units are relocated in the confirm tx). The code comment acknowledges this: "batch credit-note lot capture needs a schema column, out of 2a scope."

---

## G7 — `emitCreditNoteConfirmed` Not Awaited (LOW)

**File:** `credit-notes.service.ts:412`

```ts
emitCreditNoteConfirmed(...)   // no await
```

The sales invoice path uses `await emitInvoiceConfirmed(...)`. The credit note emit is fire-and-forget. If the event bus has a synchronous error at emit time, the DLQ insert inside `emitCreditNoteConfirmed` is async and may be swallowed. Low risk because the outbox row is already durable before the emit, but inconsistent with the invoice pattern.

---

## G8 — `balanceFn` on Credit Note Apply Could Be NULL-Safe Issue (LOW)

**File:** `credit-notes.service.ts:371-373`

```ts
balanceFn: sql`${salesInvoices.balanceFn} - (${total.toString()} * ${invoice.exchangeRate})`,
```

If `balanceFn` is NULL (functional balance not yet computed for older invoices), subtracting from NULL yields NULL — silently leaving `balanceFn` as NULL instead of a negative. Should use `COALESCE(balanceFn, 0)`.

---

## G9 — No Delivery Reversal (MEDIUM for B2B future)

Once a sales invoice is confirmed, the only reversal path is credit note. There is no "unconfirm" / "cancel delivery" for cases where goods have not yet left but the invoice was confirmed by mistake. The CR note workaround creates unnecessary revenue + returns entries in the GL, inflating gross figures. For MVP retail this is acceptable; for B2B it matters.

---

## Summary Table

| ID | Description | Severity |
|----|-------------|----------|
| G1 | No FOR UPDATE lock on stock at confirm pre-check | MEDIUM |
| G2 | Batch costAtSale != engine COGS (WAC vs FEFO gap) | MEDIUM |
| G3 | No invoice void path | MEDIUM |
| G4 | Materialized WAC may lag; costAtSale snapshot can be stale | MEDIUM |
| G5 | No partial delivery / delivery order document | LOW (MVP) |
| G6 | Batch returns lack batchId on CN line — lot-level traceability lost | LOW |
| G7 | emitCreditNoteConfirmed not awaited | LOW |
| G8 | balanceFn NULL arithmetic on CN apply | LOW |
| G9 | No delivery reversal / unconfirm path | MEDIUM (B2B) |
