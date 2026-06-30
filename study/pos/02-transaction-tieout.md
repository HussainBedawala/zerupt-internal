# POS Layer 1 — Transaction Lifecycle + Three-Way Tie-Out

> Audit date: 2026-06-30. Author: Claude (pre-hardening read-only pass).  
> Reference files: `packages/db/src/schema/pos.ts`, `apps/api/src/pos/transactions/pos-transactions.service.ts`, `pos-transactions-totals.ts`, `pos-inventory-events.ts`, `pos-receipt.service.ts`, `apps/web/src/features/pos/components/catalog-panel.tsx`, `lib/use-pos-shortcuts.ts`.

---

## 1. Transaction Lifecycle

```
cashier                     POS service                     Outbox → Listeners
  │ create (draft)              │                                │
  │ addLine / updateLine        │ recompute() per mutation       │
  │ pay (complete)              │─── status → completed ────────►│
  │                             │    costAtSale persisted        │
  │                             │    receiptToken generated      │
  │                             │─── outbox: ACCOUNTING.POST ───►│ revenue JE
  │                             │─── outbox: POS_INV.TXNCMP ────►│ stock–, COGS
  │                             │    in-process emits (fast path)│
  │ void (draft or completed)   │─── status → voided ───────────►│
  │                             │ [completed only] outbox: ACCTG.POST (void JE)
  │                             │ [completed only] outbox: POS_INV.VOID (restock)
  │ createReturn (of completed) │─── return txn → completed ────►│
  │                             │    return lines (neg qty)      │
  │                             │─── outbox: ACCTG.POST (return JE)
  │                             │─── outbox: POS_INV.RETURN ────►│ restock + reverse COGS
```

**Status machine:** draft → completed | voided; held ↔ draft; return is directly inserted as completed.

---

## 2. The Three-Way Tie-Out

A completed sale must satisfy ALL THREE simultaneously:

| Leg | Write | Key |
|-----|-------|-----|
| POS record | `pos_transactions` header totals + `pos_transaction_lines.costAtSale` | grandTotal = subtotal − discountTotal + taxTotal |
| GL journal | DR Cash/Card/AR → CR Sales; DR COGS → CR Inventory | posted via accounting listener from outbox |
| Stock ledger | `stock_ledger_entries` ON_HAND− per line | posted via inventory domain listener from outbox |

Both the GL and stock writes are driven by the **transactional outbox** inserted inside the same DB transaction as the status flip. Post-commit, the in-process EventEmitter provides the fast path; the outbox poller guarantees at-least-once on crash.

**Idempotency:** the inventory listener derives a per-line eventId from `(sourceDocumentLineId, parentEventId)` so outbox re-delivery never double-relieves stock or COGS.

### Reversal tie-out (void / return)

| Path | GL reversed? | Stock reversed? |
|------|-------------|----------------|
| Void of a **draft** | N/A (never posted) | N/A (stock never relieved) |
| Void of a **completed** | Yes — `buildVoidCompletedJePayload` inserted atomically | Yes — `buildPosInventoryVoidPayload` inserted atomically |
| Return | Yes — `buildReturnCompletedJePayload` | Yes — `buildPosInventoryReturnPayload` |

Both event payloads are built and outbox-inserted inside the SAME `db.transaction()` as the status flip, so GL and stock either both reverse or both roll back. There is no path where one reverses and the other does not — the tie-out holds for reversals.

**Return cost:** return lines carry `costAtSale` copied from the original line (service line 1351). The inventory payload uses `NO_COST_OVERRIDES` which falls back to `line.costAtSale` (pos-inventory-events.ts:88), so COGS is reversed at the exact original cost.

---

## 3. Invariants (intended)

1. `grandTotal = subtotal − discountTotal + taxTotal` (recompute invariant).
2. `Σ payments.amount ≥ grandTotal` (enforced by `validatePayments`).
3. One GL JE and one stock-ledger event per completed sale, each deduped by eventId.
4. A return never exceeds original qty (per-line cumulative guard inside advisory lock).
5. A completed sale with existing returns cannot be voided (double-reversal guard, service line 987).
6. `pos_receipts` has exactly one row per transaction (schema comment says "unique per transaction" — but see Gap 3 below).

---

## 4. Identified Gaps

### Gap 1: No DB CHECK enforcing grandTotal = subtotal − discountTotal + taxTotal

The schema (`pos.ts:385-388`) has four non-negative CHECKs only. The totals equation is enforced exclusively by `recompute()` in application code. A bug, direct DB write, or offline sync path that skips `recompute()` can silently persist a mismatched `grandTotal`.

`recompute()` math (pos-transactions-totals.ts:93-119):
```typescript
subtotal    = Σ(quantity × unitPrice)        // gross, pre-discount
discountTotal = Σ discountAmount
taxTotal    = Σ tax (resolved by TaxCalcService)
grandTotal  = subtotal − discountTotal + taxTotal
```
All values are `toFixed(6)` (MONEY_SCALE = 6). A DB-level equality CHECK is NOT safe with floating-point strings — `0.000001` rounding in Postgres `numeric` arithmetic vs. `Decimal.js`'s `toFixed(6)` could produce false failures. The correct mitigation is an **application-level assertion** that the server-computed totals agree with what is being persisted, thrown as a 422 before the write.

### Gap 2: costAtSale = 0 for tracked items with no WAC (silent)

`readWacByItem` (pos-transactions-payments.ts:168-186) seeds every item with `"0"` and overwrites only from `materializedStockLevels.averageCost`. If an item has `trackingType != 'none'` but has never been received (no stock ledger entries), `averageCost` is `NULL` in the materialized row (or the row is absent), and the fallback is `"0"`.

Consequence at pay time (service lines 813-820):
```typescript
const cost = costByLineId.get(line.id) ?? "0";
await tx.update(posTransactionLines).set({ costAtSale: cost }) ...
```
`costAtSale = "0"` is persisted silently. The outbox inventory payload also carries `totalCost = "0"`, so DR COGS = 0 and CR Inventory = 0 — the COGS JE is a no-op for that line. This understates COGS and overstates Inventory.

There is no flag, warning, or audit marker. The schema has `costAtSale >= 0` CHECK only — zero is valid. This is a **silent data quality gap**.

Blocking the sale is incorrect for the MENA retail persona (a physical till sale is a fact). The fix is a **non-blocking flag**: set a `totalsMismatch`-style flag (or a new column) when `costAtSale = 0` AND `trackingType != 'none'`, so the ops team can review and correct later.

### Gap 3: pos_receipts row semantics — lazy-first-reprint, not at completion

Schema comment (pos.ts:739-742) documents this explicitly:
> "The row is created lazily on the FIRST reprint (the original print is a client/printer action with no server call), so this is the first-reprint time, not the original print time."

`pos-receipt.service.ts:75-101` confirms: `reprint()` does an INSERT … ON CONFLICT DO UPDATE. `getReceipt()` (the normal print path) does NOT insert a row.

Consequence: a transaction that was printed once and never reprinted has **zero** `pos_receipts` rows. Any query that assumes "no row = never printed" is wrong. Any audit tool or compliance check on "was this receipt printed" cannot rely on this table.

The cleanest fix is to **insert the pos_receipts row at transaction completion** (in the same DB transaction as the status flip in `pay()`), with `reprintCount = 0` and `printedAt = completedAt`. The `reprint()` path then always UPDATE (never INSERT). This requires a backfill migration for existing completed transactions.

### Gap 4: Scan-anywhere not implemented — cashier must focus search box

`use-pos-shortcuts.ts` binds F1/F2/F3/F4/Esc globally on `window` — F1 focuses the search box. However, **barcode scanner input** is NOT captured globally. The scanner emits keystrokes into whatever element is focused. If the cashier clicks outside the search input (e.g., on a cart line to adjust quantity), the barcode scan goes into that element instead of the search input.

`catalog-panel.tsx:80-106` handles `handleSubmit` only when the `<Input ref={inputRef}>` form is submitted — focus is required. There is no `window.addEventListener('keydown')` global barcode accumulator.

**Impact:** In a busy MENA retail environment where cashiers hand back receipts, click cart lines, and scan the next item without looking at the screen, this is a real error path. Items get scanned into quantity fields or price overrides silently.

### Gap 5: No price-check / no-sale mode

There is no way for a cashier to look up an item's price without adding it to the cart. Searching in the catalog shows an item and its price in the `search-results-dropdown`, but tapping the result immediately calls `addItem`. There is no "show price only" tap path.

For MENA retail, customers frequently ask "how much is this?" — a common defensive UX gap.

---

## 5. Reversal Idempotency

- **Void:** guarded by `status = txn.status` in the UPDATE predicate (service line 1021). A concurrent double-void has one succeed and the other return "Transaction was modified concurrently" (ConflictException). The outbox row is inserted only once (inside the winning transaction). The in-process emit is post-commit only. No double-reversal is possible.
- **Return:** guarded by a per-sale `pg_advisory_xact_lock` (service line 1163-1164). Cumulative-qty is re-read inside the lock (line 1170+). A concurrent double-return for the same line blocks, then the second sees the qty already consumed and is rejected. Idempotent.
- **Outbox re-delivery:** per-line `sourceDocumentLineId + parentEventId` → deterministic eventId in the inventory listener. Never double-posts.
