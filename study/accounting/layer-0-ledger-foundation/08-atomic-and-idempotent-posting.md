# 08 — Atomic and Idempotent Posting

Two software guarantees separate a toy ledger from a trustworthy one. They have nothing to do with
accounting theory and everything to do with the messy reality of computers: processes crash,
networks retry, users double-click.

## Guarantee 1: Atomicity — "all or nothing"

A single journal entry is multiple database writes: one header row + two-or-more line rows
(+ updating the entry number, + the header totals). **Either all of them happen, or none of them
do.** There is no in-between.

Why it matters: imagine the header is written, then the process crashes before the lines. Now the
ledger contains an entry with no lines — a balance of zero where there should be 500, or a header
total that doesn't match its (missing) lines. The trial balance breaks. Layer 0 is violated.

The fix is a **database transaction**. You wrap all the writes in `BEGIN … COMMIT`. If anything
fails before `COMMIT`, the database `ROLLBACK`s every write as if none happened. Our posting engine
does exactly this: header insert + line inserts + number commit all live inside one transaction.

### Atomicity has a second, harder scope: the source document and its entry

It's not enough for the *journal entry* to be atomic by itself. Consider a sale: we (a) write the
sales invoice and (b) write its accounting entry. If (a) commits but (b) is lost, you have stock
that moved and revenue that vanished from the books — invisible corruption.

There are two ways to make the document and its entry inseparable:

1. **Same transaction** — write both in one `BEGIN…COMMIT`. Simple, but couples the modules.
2. **Transactional outbox** (what Zerupt uses for most modules) — inside the document's
   transaction, also write a small "please post this entry" row into an **outbox** table. Because
   it's in the *same* transaction, the outbox row exists if and only if the document exists. A
   background poller then reads the outbox and posts the entry, retrying until it succeeds. This
   guarantees **at-least-once** posting even across crashes, and decouples the modules.

The danger to avoid (the audit found instances of this): **fire-and-forget** — committing the
document, then emitting an in-memory "post this" event *after* the commit. If the process dies in
that gap, the event is gone and the entry is never posted, with no retry. That's a silent
correctness hole. Every automated posting path should be outbox-backed, not fire-and-forget.

## Guarantee 2: Idempotency — "exactly once, even if asked twice"

The outbox retries until success. Networks retry. A user double-clicks "Post". So the *same*
business event may try to post **more than once**. Idempotency means: **no matter how many times an
event is processed, it produces at most ONE journal entry.**

Without it, a retried sale posts revenue twice and the books are overstated. With it, the second
attempt is recognized as a duplicate and silently skipped.

How it's done in our system:

- Every automated event carries a unique **event id**.
- The journal header stores that `event_id`, with a **unique index** on it (partial: only for
  auto-entries; manual entries have no event id).
- Before posting, the engine checks "does an entry with this event_id already exist?" — if yes,
  skip.
- The check-then-insert has a race (two retries at once), so the **database unique constraint** is
  the real guarantee: the second insert fails with a duplicate-key error, which the engine catches
  and treats as "already done." The pre-check is just an optimization; the constraint is the law.

The outbox has its own idempotency too (a unique key on tenant + event type + event id) so the
same event can't even be *queued* twice.

## Why both are non-negotiable

- **Atomic but not idempotent** → a retry creates a second complete entry → double-counted books.
- **Idempotent but not atomic** → a crash leaves a half-written entry → unbalanced books.

You need *both* for the trial balance to be correct under real-world failure. Together they make
the ledger behave as if the world were perfect even though it isn't.

## The mental model

> **Atomic:** an entry (and its source document) is written completely or not at all.
> **Idempotent:** the same event, processed once or a hundred times, yields exactly one entry.
> The database transaction guarantees the first; a unique constraint on the event id guarantees
> the second.

Next: `09-how-zerupt-implements-layer-0.md` — our actual schema and engine, mapped from the code.
