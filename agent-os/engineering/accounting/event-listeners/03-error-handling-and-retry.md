# Event Listener Error Handling & Retry — Design

> Status: **Partially implemented.** Inventory event listener has idempotency guards (eventId dedup). No BullMQ retry, dead letter queue, or structured error handling exists.
> Priority: **P1** — production reliability for the core posting pipeline.
> Depends on: `event-listeners/01-design.md`, `event-listeners/02-je-mappings-per-event.md`

## Problem

28 business events flow through `AccountingEventListenerService` to create journal entries. Any failure (missing account mapping, locked period, DB timeout, FX rate not found) must be handled gracefully — not silently dropped or left in a broken state.

## Current State (What Exists)

The `InventoryEventListener` has:
- **Idempotency:** `eventId` unique constraint on `stock_ledger` — duplicate events return `null` and skip downstream writes.
- **Validation:** Zod schema validation on inbound payloads (`safeParse`).
- **Negative stock guard:** `blockNegativeStock` flag throws `BadRequestException`.

What's **missing**:
- No BullMQ queue between event emitters and listeners (all events use NestJS `EventEmitter2` which is in-process, fire-and-forget).
- No retry logic for transient failures (DB timeouts, connection drops).
- No dead letter queue for permanently failed events.
- No alerting or monitoring for failed events.
- No manual retry UI for operations teams.

## Architecture Decision: NestJS EventEmitter vs BullMQ

### Phase 1 (Now): NestJS EventEmitter + Transactional Outbox

Keep `EventEmitter2` for simplicity but add reliability via outbox pattern:

```
Module commits business data + outbox row (single transaction)
  → Outbox poller picks up unprocessed rows (every 5s)
  → Emits NestJS event
  → On success: marks outbox row as processed
  → On failure: increments attempt count, records error
  → After max attempts: marks as dead_letter
```

### Phase 2 (Future): BullMQ

When event volume or latency requires it, replace the outbox poller with BullMQ queues. The handler logic stays identical — only the transport changes.

## Schema: `accounting_event_outbox`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenantId | uuid | Tenant isolation |
| eventType | varchar(100) | e.g. `pos.transaction.completed` |
| payload | jsonb | Full event payload (immutable after insert) |
| status | enum | `pending`, `processing`, `completed`, `failed`, `dead_letter` |
| attempts | smallint | Default 0, max 5 |
| lastError | text | Last error message + stack trace |
| lastAttemptAt | timestamptz | |
| nextRetryAt | timestamptz | Calculated from backoff schedule |
| processedAt | timestamptz | When status became `completed` |
| createdAt | timestamptz | Event creation time |

### Indexes

- `idx_outbox_pending`: `(tenantId, status, nextRetryAt)` WHERE `status IN ('pending', 'failed')` — poller query
- `idx_outbox_dead_letter`: `(tenantId, status)` WHERE `status = 'dead_letter'` — admin query
- `unique_outbox_event`: `(tenantId, eventType, payload->>'eventId')` — idempotency

## Error Classification

| Error Type | Class | Retryable? | Action |
|-----------|-------|-----------|--------|
| `AccountMappingMissingError` | Configuration | No | → `dead_letter` immediately. Alert: "Account mapping missing for lineType={x} in entity={y}" |
| `PeriodLockedError` | Business rule | Yes (conditional) | → `failed`, retry when period reopens. No auto-retry — requires manual period unlock. |
| `CogsCalculationError` | Data integrity | No | → `dead_letter`. Alert: "COGS calculation failed for item={x}". Requires manual resolution. |
| `RateNotFoundError` | Configuration | Yes (conditional) | → `failed`, retry after rate entry. Alert: "Exchange rate missing for {currency} on {date}". |
| `DatabaseTimeoutError` | Transient | Yes | → `failed`, auto-retry with backoff. |
| `ConnectionError` | Transient | Yes | → `failed`, auto-retry with backoff. |
| `ValidationError` (Zod) | Permanent | No | → `dead_letter` immediately. Bad payload — developer must fix emitter. |
| `UnknownError` | Unknown | Yes (cautious) | → `failed`, auto-retry up to max attempts, then `dead_letter`. |

## Retry Strategy

| Attempt | Delay | Notes |
|---------|-------|-------|
| 1 | Immediate | First try |
| 2 | 30 seconds | Transient recovery window |
| 3 | 2 minutes | |
| 4 | 10 minutes | |
| 5 | 1 hour | Final attempt |
| 6 | — | → `dead_letter` |

Formula: `nextRetryAt = lastAttemptAt + backoffSeconds[attempt]`

Backoff schedule: `[0, 30, 120, 600, 3600]`

## Backend — New Services

### `OutboxService`

| Method | Purpose |
|--------|---------|
| `insert(tenantId, eventType, payload, tx)` | Insert outbox row within the business transaction |
| `poll(batchSize)` | Fetch pending/failed events ready for retry |
| `markProcessing(id)` | Optimistic lock (CAS on status) |
| `markCompleted(id)` | Set status + processedAt |
| `markFailed(id, error)` | Increment attempts, set lastError, calculate nextRetryAt |
| `markDeadLetter(id, error)` | Terminal failure |
| `retryDeadLetter(id)` | Manual retry — resets status to `pending`, attempts to 0 |

### `OutboxPollerService`

- Runs on a `setInterval` (5 second default, configurable via `OUTBOX_POLL_INTERVAL_MS`).
- Calls `OutboxService.poll(10)` — processes up to 10 events per tick.
- For each event: `markProcessing` → emit to listener → `markCompleted` or `markFailed`.
- Concurrency: single-threaded per instance. Multiple API replicas each poll independently — `markProcessing` CAS prevents double-processing.

### `DeadLetterAlertService`

- On `markDeadLetter`: logs CRITICAL, emits `accounting.deadLetter.created` event.
- Future: webhook/email notification to tenant admin.

## Idempotency Contract

Every event handler MUST be idempotent. The outbox guarantees at-least-once delivery, so handlers may receive the same event multiple times.

Idempotency mechanisms by handler:

| Handler | Mechanism |
|---------|-----------|
| Inventory events | `eventId` unique on `stock_ledger` (exists) |
| Accounting JE posting | `eventId` unique on `journal_entries.sourceEventId` (add index) |
| All handlers | Check outbox status before processing (belt + suspenders) |

## API — Dead Letter Management

| Method | Route | Permission |
|--------|-------|-----------|
| GET | `/tenant/accounting/dead-letters` | `accounting.admin` |
| POST | `/tenant/accounting/dead-letters/:id/retry` | `accounting.admin` |
| GET | `/tenant/accounting/dead-letters/:id` | `accounting.admin` |

Response shape:
```ts
{
  id: string;
  eventType: string;
  payload: Record<string, unknown>;
  error: string;
  attempts: number;
  createdAt: string;
  lastAttemptAt: string;
}
```

## Migration Path

1. Add `accounting_event_outbox` table
2. Add `sourceEventId` unique index to `journal_entries`
3. Create `OutboxService` + `OutboxPollerService`
4. Modify event emitters: insert outbox row inside business transaction instead of `EventEmitter2.emit()`
5. Outbox poller replaces direct event emission
6. Add dead letter API + basic admin UI

## Monitoring

| Metric | Alert threshold |
|--------|----------------|
| `outbox.pending.age_seconds` | > 60s (events not being processed) |
| `outbox.dead_letter.count` | > 0 (any dead letter = action needed) |
| `outbox.failed.count` | > 10 in 5 min (systemic issue) |
| `outbox.processing.stuck` | status = processing for > 5 min (poller crashed?) |
