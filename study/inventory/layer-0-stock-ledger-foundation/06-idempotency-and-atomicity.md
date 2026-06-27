# 06 — Idempotency and Atomicity of a Stock Write

## The two guarantees every stock write must provide

**Atomicity:** Either the stock ledger entry AND the materialized stock level update
BOTH commit, or neither does. There is never a half-committed movement.

**Idempotency:** If the same movement is delivered twice (network retry, BullMQ job
re-queued, event replayed), it is applied exactly once. The second delivery is silently
detected and discarded.

Without atomicity the ledger and the materialized view drift apart.
Without idempotency a retried sale posts twice, creating phantom COGS and double inventory
reduction.

## Atomicity: one DB transaction per stock write

Every write path in the inventory engine passes an explicit `tx` (Drizzle transaction)
to both `StockLedgerService.record()` and the `StockLevelService` write method. They run
in the same Neon transaction and commit together.

Example from `StockAdjustmentsService.create()` (stock-adjustments.service.ts ~132):

```typescript
await this.getTenantDb().transaction(async (tx: Transaction) => {
  // 1. ledger entry: StockLedgerService.record(movement, tx)
  // 2. level update: StockLevelService.upsertInbound(..., tx)
  //                  OR decrementOutbound(..., tx)
  // 3. document header: tx.insert(stockAdjustments).values(...)
  // 4. outbox entry: OutboxService.insert(..., tx)
  //
  // All four writes are in the same transaction. If any throws, all roll back.
});
```

The outbox entry for the accounting GL journal is ALSO in the same transaction (point 4).
This means the accounting event is durably queued in the DB atomically with the stock
change — no gap where the stock is committed but the GL event is lost.

## The transactional outbox pattern

The outbox (`accounting_outbox` table) is not Kafka or RabbitMQ — it is a Postgres table.
Writing to it inside the same transaction as the stock write means:

- If the stock write succeeds: the outbox row exists and will be polled/delivered
- If the stock write fails: the outbox row is rolled back too — no phantom events
- If the process crashes after commit: the outbox poller picks up the event on restart

This is the standard transactional outbox pattern (similar to what the accounting module
uses for journal entry events). It is the correct approach for Zerupt's architecture.

## Idempotency: the `event_id` mechanism

### The partial unique index

```sql
CREATE UNIQUE INDEX sle_event_id_key
  ON stock_ledger_entries (event_id)
  WHERE event_id IS NOT NULL;
```

When `event_id` is set, Postgres will reject a second INSERT with the same `event_id`.
The `StockLedgerService.record()` method catches this unique constraint violation and
returns `null` instead of re-throwing:

```typescript
} catch (error) {
  if (isUniqueConstraintError(error)) {
    this.logger.warn(`Duplicate eventId=${movement.eventId} ... — skipping (idempotent)`);
    return null;
  }
  throw error;
}
```

The caller checks for `null` and short-circuits the rest of the write (no WAC update, no
outbox insert).

### Deterministic `event_id` generation

For domain events (POS, Sales, Purchase), `inventory-domain.listener.ts` generates a
deterministic UUID v5 per ledger row:

```typescript
const lineEventId = deterministicUuidV5(sourceDocumentLineId ?? String(lineIndex), parentEventId);
```

A parent event (e.g., `pos.transaction.completed`) has ONE `eventId` but fans out to N
ledger entries (one per line item). Each entry needs a unique `event_id`, so it is derived
from `(lineId_or_index, parentEventId)`. The result is:
- Stable across retries (same inputs → same UUID)
- Unique per line (different lineId/index → different UUID)
- No external state required (no counter, no DB read)

### When `event_id` is NULL

Manual adjustments (posted directly by the API, not via an event queue) may not set
`event_id`. The schema allows NULL (partial unique index), so this is valid. For these
paths, idempotency at the transaction level is handled by the document-number uniqueness
constraint on `stock_adjustments` — you cannot post the same adjustment document twice.

The `recordMany()` batched path (used for opening balances) also does not set per-row
`event_id`. This is acceptable because opening balance imports are designed to be
transactional (all-or-nothing per import run) and are run only once at onboarding.

## The SELECT FOR UPDATE lock

Concurrent sales of the same item at the same warehouse could race. Without a lock, two
transactions might both read `on_hand = 10`, both decide to sell 8, and both decrement to
2 — ending with `on_hand = 2` instead of the correct `on_hand = -6` (with strict policy)
or the correct warning (with flexible policy).

`StockLevelService.getLevelForUpdate()` issues a `SELECT ... FOR UPDATE` inside the
transaction:

```sql
SELECT ... FROM materialized_stock_levels
WHERE item_id = $1 AND warehouse_id = $2
FOR UPDATE
```

This holds a row-level exclusive lock until the transaction commits or rolls back. Any
concurrent transaction trying to update the same `(item_id, warehouse_id)` row will wait
or deadlock-abort.

**Lock ordering:** `getLevelsForUpdate()` (the batched variant) orders by `item_id`:
```sql
ORDER BY item_id FOR UPDATE
```
This prevents AB/BA deadlocks when two concurrent transactions lock the same items in
different orders.

## Full atomicity sequence for a stock write

```
BEGIN TRANSACTION
  1. SELECT FOR UPDATE on materialized_stock_levels row (acquire row lock)
  2. INSERT into stock_ledger_entries (immutable record)
  3. UPDATE/UPSERT materialized_stock_levels (delta applied)
  4. INSERT into accounting_outbox (durable GL event)
  5. INSERT into stock_adjustments header (if applicable)
COMMIT (all of the above, atomically)

POST-COMMIT (non-transactional, guarded):
  6. Emit in-process EventEmitter events (negative-stock alerts, etc.)
```

Steps 1–5 succeed together or fail together. Step 6 is a post-commit side effect — the
document is already safe in the DB, so a listener error cannot corrupt it, though it may
delay secondary effects (alerts, etc.).

## Known gap: the document number reservation

The document number for adjustments is reserved before the transaction starts
(step 0 in the actual code):

```typescript
const { reservationId, documentNumber } = await this.reserveAdjustmentNumber(...);
// ... then the transaction runs ...
// on success: commitQuietly(reservationId)
// on failure: releaseQuietly(reservationId)
```

This reservation is a separate transaction (in `doc_sequences`). If the main stock
transaction fails, the service calls `releaseQuietly()` to return the number. This is
the correct pattern: document numbers do not need to be gapless for inventory adjustments
(gaps are acceptable — they just mean an aborted attempt). But it means there is a brief
window between the reservation and the release where the number is unavailable to other
writers. This is a known and accepted design trade-off.
