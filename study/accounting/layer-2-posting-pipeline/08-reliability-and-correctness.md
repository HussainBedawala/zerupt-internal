# 08 — Reliability and Correctness

## The two promises Layer 2 makes

Every time a business event happens, Layer 2 must deliver two promises:

1. **The entry posts exactly once.** A sale that was confirmed once has exactly one
   revenue journal entry. Not zero (missing entry), not two (double-counted books).

2. **The entry is balanced.** Every entry's debits equal its credits. Always. No
   exceptions.

These are not nice-to-haves. They are the mathematical invariants of a trustworthy
ledger. A violated invariant means the trial balance doesn't balance, which means the
balance sheet doesn't add up, which means the financial statements are wrong, which
means the owner is making decisions based on false numbers.

## Why "exactly once" is hard

Consider what can go wrong between a sale and its posting:

- The server process crashes after the sale is committed but before the JE is written
- The network times out in the middle of posting
- A user double-clicks "Complete Sale" before the first request finishes
- A deployment restarts the API mid-request
- The outbox poller starts processing the same event twice (two poller instances race)

Each of these scenarios could result in zero, one, or two postings for the same event.
Zero is silent missing data. Two is silent double-counting. Both are unacceptable.

## The three layers of the "exactly once" solution

### Layer A: The transactional outbox — guaranteeing at-least-once

The business document and its outbox row are written in a single database transaction.
If the transaction commits, the outbox row exists. If the process crashes after commit,
the outbox poller will eventually find the pending row and process it. At-least-once
delivery is guaranteed as long as the database is durable.

The outbox doesn't guarantee exactly-once — it guarantees the event will be processed
*at least* once, possibly more. That's where idempotency comes in.

### Layer B: The unique event ID — preventing duplicates

Every automated posting event carries a `eventId` (a UUID, generated once and embedded
in the domain event payload). The `journal_entries` table has a unique index on
`eventId` (for auto-entries). When the posting service tries to insert an entry with an
`eventId` that already exists:

- The database unique constraint fires
- The posting service catches the duplicate-key error
- It treats this as "already done" and silently skips the insert
- The outbox row is still marked `completed`

This makes the posting service **idempotent**: running the same event ten times produces
exactly one journal entry. The database constraint is the real guarantee; a pre-check
("does this eventId already exist?") is just an optimization to avoid the error path.

### Layer C: FOR UPDATE SKIP LOCKED — preventing concurrent double-processing

The outbox poller uses a SQL pattern that prevents two poller instances from claiming the
same row:

```sql
SELECT id FROM accounting_event_outbox
WHERE status IN ('pending', 'failed') AND next_retry_at <= now()
ORDER BY created_at
LIMIT 10
FOR UPDATE SKIP LOCKED
```

`FOR UPDATE` locks the selected rows. `SKIP LOCKED` means: if a row is already locked by
another poller instance, skip it (don't wait, don't take it). This means two concurrent
pollers will never claim the same batch of rows. Combined with the eventId unique index,
even if they somehow did process the same event, the second posting would be caught as a
duplicate and silently skipped.

## What happens on failure

The outbox row has a status machine:

```
pending → processing → completed
                    ↘ failed (retryable) → pending (retry later)
                    ↘ dead_letter (non-retryable) → manual review
```

**Retryable failure:** The posting service throws an unexpected error (database connection
blip, transient network issue). The outbox row transitions to `failed` with an incremented
attempt count and a `next_retry_at` computed from the backoff schedule:
`[immediate, 30s, 2min, 10min, 1h]`. After 5 attempts, it goes to `dead_letter`.

**Non-retryable failure:** The event has a structural problem — missing account mapping,
invalid payload schema, a business rule that fundamentally can't be satisfied. Retrying
won't fix it. These go directly to `dead_letter`. The error is logged with a clear
message. A human must investigate and either fix the mapping, fix the data, or manually
replay via the dead-letter API.

**Dead-letter queue:** Exposed at `GET /tenant/accounting/dead-letters`. A manual retry
is available at `POST /tenant/accounting/dead-letters/:id/retry`, which resets the row
to `pending` with 0 attempts. Before retrying, the underlying issue (wrong mapping, bad
data) must be fixed, or the retry will immediately dead-letter again.

## How we prove every posting balances

There are three levels of balance proof:

**Level 1: At payload construction time.** `buildJePayload()` sums all debit amounts and
all credit amounts using `Decimal.js` (exact arithmetic — never floats) and throws
immediately if they don't match. An unbalanced payload never enters the posting pipeline.

**Level 2: At the schema level.** The `journal_entry_lines` table stores individual debit
and credit amounts. The `journal_entries` header stores pre-computed totals. A DB-level
check could verify that header totals match sum of lines — but the real enforcement is at
Level 1: the payload builder is the chokepoint.

**Level 3: Trial balance.** The trial balance query sums DR and CR across all accounts.
If any journal entry slipped through unbalanced (which Level 1 prevents), the trial
balance total would not be zero, exposing the corruption immediately. Running a trial
balance is how you prove the ledger is correct — it's the same proof auditors run.

## The live path vs the outbox path

There is a subtlety in how the live (in-request) posting path interacts with reliability:

The live path:
1. Domain action commits (sale written + outbox row written, same tx)
2. In the same request, the domain module emits an in-memory NestJS event
3. The listener builds the JE payload
4. `accounting.post` is emitted
5. `JournalPostingService` writes the JE synchronously

The outbox path:
1. Domain action commits (sale written + outbox row written, same tx)
2. Eventually, the outbox poller picks up the row
3. Calls `JournalPostingService.postFromEvent` directly
4. JE is written
5. Outbox row marked completed

Both paths converge on `JournalPostingService`. If the live path succeeds, the JE is
posted and when the outbox poller later picks up the row, the `eventId` unique constraint
stops a duplicate. If the live path fails (crash, timeout), the outbox picks it up on
next poll.

The key insight: the outbox is not the main path, it is the **crash recovery** path. The
live path is fast (JE posted in the same request). The outbox path is the durability
guarantee that survives any failure between commit and posting.

## The mental model

> "Exactly once" is achieved by a combination of: outbox (at-least-once delivery),
> unique eventId constraint (deduplication), and FOR UPDATE SKIP LOCKED (no concurrent
> double-claim). "Always balanced" is achieved by: buildJePayload throwing on any DR≠CR
> before the payload reaches the posting service. Together they mean: no matter what
> goes wrong — crash, retry, double-click, deployment — each business event produces
> exactly one balanced journal entry, eventually, with no human intervention.

Next: `09-how-zerupt-implements-layer-2.md`.
