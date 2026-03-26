# Transactional Outbox Pattern

## What is it?

The outbox pattern guarantees that a business event and its side effect (e.g., posting a journal entry) are eventually consistent, even if the process crashes between them.

## How it works

1. **Write phase**: The business operation and an outbox row are written in the **same database transaction**. If the transaction commits, both the business data and the event record are guaranteed to exist. If it rolls back, neither exists.

2. **Poll phase**: A background poller queries for unprocessed outbox rows and dispatches them to the event handler.

3. **Claim phase**: To prevent multiple pollers from processing the same row, use `FOR UPDATE SKIP LOCKED` — an atomic PostgreSQL construct that claims rows exclusively. Each poller gets a disjoint set.

4. **Completion**: After the handler succeeds, the row is marked `completed`. If it fails, the row is marked `failed` with a retry time based on an exponential backoff schedule.

## Why not just emit events directly?

Without the outbox, there's a window between "business data committed" and "event emitted" where a crash loses the event forever. The outbox eliminates this window by making the event a part of the same transaction.

## Key concepts

### Compare-and-Swap (CAS)
An update that only succeeds if the row is in an expected state. Used to prevent double-processing:
```sql
UPDATE outbox SET status = 'processing'
WHERE id = ? AND status IN ('pending', 'failed')
```

### FOR UPDATE SKIP LOCKED
PostgreSQL locking clause that skips rows already locked by another transaction. Essential for concurrent pollers — each worker gets its own batch without blocking or wasting round-trips.

### Exponential backoff
Retry delays increase with each attempt: 0s, 30s, 2min, 10min, 1hr. Prevents overwhelming a failing downstream system.

### Dead letter queue
After max retries, an event moves to `dead_letter` status. It requires manual investigation and can be retried via an admin API. Non-retryable errors (e.g., invalid payload) go directly to dead letter without burning retry attempts.

## EventEmitter2: emit vs emitAsync

- `emit()` is fire-and-forget — async listeners are started but not awaited
- `emitAsync()` awaits all async listeners and propagates their errors

For financial infrastructure, always use `emitAsync()` before marking an outbox row as completed. Otherwise, a crash between emit and listener completion silently loses the event.

## Decimal arithmetic in financial code

Never use `parseFloat()` or JavaScript `number` for monetary values. IEEE 754 floats cannot represent values like 0.10 exactly. Use a decimal library (e.g., `decimal.js`) for all monetary comparisons and arithmetic.

## Balance validation

Every journal entry must satisfy: `SUM(debits) = SUM(credits)`. This check belongs in the payload builder (fail fast) rather than only in the downstream posting service (fail late). Use `Decimal` arithmetic for the check.
