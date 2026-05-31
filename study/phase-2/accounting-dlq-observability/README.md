# Dead-Letter Queue for Event-Driven Accounting

## The Problem: Silent JE Loss

Accounting listeners use `@OnEvent({ async: true })` — NestJS fires and forgets them. When `eventEmitter.emit()` is called, it returns synchronously; the listener runs on the next tick. If the listener throws (bad payload, missing account mapping, unbalanced JE), the error used to become an unhandled promise rejection.

DEV-339 fixed the unhandled rejection by wrapping all listener bodies in `runListenerHandler`, which catches and logs errors. But the original implementation only logged — errors were **permanently dropped** with no retry path, no admin visibility, no alerting signal.

## Two Failure Surfaces

There are two places an accounting event can fail:

### 1. Emitter side (`emitBillConfirmed` etc.)
When the business service calls `eventEmitter.emit(PURCHASE_EVENTS.INVOICE_CONFIRMED, payload)` and the emit itself throws (rare — the event bus is in-process — but possible under shutdown or memory pressure). The payload object must be built BEFORE the emit call so the same object (with its `eventId`) can be written to the DLQ, preserving idempotency.

### 2. Listener side (`@OnEvent` handler)
When the listener receives the event and fails during processing — schema validation (`EventValidationError`), missing account mapping (`AccountMappingMissingError`), unbalanced JE amounts. These fire asynchronously after the originating transaction has already committed.

## The Fix: DLQ via Existing Outbox

Rather than a new table, failed listener errors write a `dead_letter` row directly into `accounting_event_outbox` — the table that already exists for event durability. The outbox's admin API already covers replay:
- `GET /tenant/accounting/dead-letters` — list all failures
- `POST /tenant/accounting/dead-letters/:id/retry` — reset to `pending` for reprocessing

Key insight: `dead_letter` is a terminal status in the outbox state machine. Inserting directly with `dead_letter` bypasses the normal `pending → processing → completed/failed` flow. The unique index on `(tenantId, eventType, payload::jsonb->>'eventId')` prevents duplicates.

## Interface Design: DlqSink

`runListenerHandler` accepts an optional `DlqContext` to keep it unit-testable without a hard dependency on `OutboxService`:

```typescript
export interface DlqSink {
  insertDeadLetter(tenantId, eventType, payload, error): Promise<void>;
}

export interface DlqContext {
  readonly tenantId: string;
  readonly payload: unknown;
  readonly sink: DlqSink;
}
```

`makeDlqContext(rawPayload, outboxService)` extracts `tenantId` from the raw unvalidated payload. If `tenantId` is absent or not a string, it returns `undefined` and `runListenerHandler` falls back to log-only — important for truly malformed events where we don't even know which tenant they belong to.

## Double-Fault Safety

The DLQ write can itself fail (DB down, network timeout). The catch block wraps the DLQ write in its own `try/catch`:

```
handler throws → log error → try DLQ write
                               ├── DLQ succeeds → done
                               └── DLQ throws → log second error → done (never re-throw)
```

Two logger.error calls max, zero unhandled rejections.

## Replay Semantics

Dead-lettered events are replayed by resetting status to `pending` with 0 attempts — they re-enter the normal outbox polling cycle. Before replaying, the operator must fix the root cause (e.g. add the missing account mapping), otherwise the event will dead-letter again after exhausting retries.

Events dead-lettered from the `@OnEvent` path (listener failure) vs the outbox poller path (processing failure) both end up in the same table and are indistinguishable at replay time — intentionally. The replay mechanism is identical either way.

## RBAC on the DLQ Admin API

`GET /tenant/accounting/dead-letters` and `POST /tenant/accounting/dead-letters/:id/retry` require `accounting.journal.read` and `accounting.journal.post` respectively. Any authenticated tenant user can see their tenant's accounting data — but only a user with journal posting rights can trigger a replay. This is correct because a replay posts a JE, and the same permission gate that protects manual JE posting should gate replays.

## What's NOT Covered

- **Prometheus/StatsD counter**: the issue's minimum viable option. Not implemented — no metrics infrastructure is wired yet. The DLQ table serves as the observable signal: non-empty `dead_letter` rows = something failed.
- **Automatic retry for listener-path failures**: listener-path events don't have a retry mechanism. Once dead-lettered, replay is always manual. This is acceptable because listener failures are almost always caused by configuration bugs (missing account mappings) that require a human fix before replay anyway.
- **Re-throw for `Unbalanced` errors**: the issue mentioned escalating these. Deferred — the DLQ row captures the full error message, so ops can distinguish unbalanced JE errors from validation errors when reviewing dead letters.
