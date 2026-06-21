# 01 — From Business Event to Journal Entry

## The general pattern

Every automated posting in Zerupt follows the same journey. Understanding it once lets
you understand every module's accounting without re-learning from scratch each time.

```
  Domain module                   Accounting pipeline
  ─────────────                   ──────────────────
  [Business action]
       │
       ▼
  [Commit document]  ─── same DB tx ───►  [Insert outbox row]
                                                 │
                                          (background poller)
                                                 │
                                          [Claim outbox row]
                                                 │
                                    [Emit accounting.post event]
                                                 │
                                    [Listener builds JE payload]
                                                 │
                                    [Validate balance (DR = CR)]
                                                 │
                                    [JournalPostingService.postFromEvent]
                                                 │
                                    [Resolve accounts by line type]
                                                 │
                                    [Write journal_entries + lines]
                                                 │
                                    [Mark outbox row completed]
```

Let's walk through each step.

## Step 1: The domain module commits its document

A cashier completes a sale. The POS service writes the `pos_transactions` row to the
database inside a database transaction. The sale is now committed and permanent.

But we also need the accounting. So, **inside the same database transaction**, the module
inserts a row into the `accounting_event_outbox` table. This row says: "there is a
pending accounting event of type `pos.transaction.completed` with this payload — please
process it."

Because both the sale record and the outbox row are committed in the same transaction,
they are inseparable. If the transaction commits, both exist. If it rolls back, neither
exists. The document and its "please post my entry" ticket are atomic. This is the
**transactional outbox pattern** from Layer 0.

## Step 2: The outbox poller picks it up

A background service (`OutboxPollerService`) wakes up periodically — every 1 second when
busy, backing off up to 20 minutes when idle. It scans the `accounting_event_outbox` table
for rows with `status = 'pending'`. It claims a batch using `FOR UPDATE SKIP LOCKED`
(so multiple poller instances don't step on each other), transitions them to `processing`,
and hands each row to the posting service.

## Step 3: The listener builds the JE payload

The outbox row carries a payload (JSON), and the posting service calls
`JournalPostingService.postFromEvent(payload)`. The payload already contains the structured
JE instruction (event ID, type, lines array, source document reference). The listener
built this payload before inserting the outbox row, validating the balance at that point.

Wait — where is the "listener" in this picture?

There are two posting paths:

**Path A (live):** When a business event happens, the domain module emits a NestJS
in-memory event (e.g. `pos.transaction.completed`). An `@OnEvent` listener in
`accounting-events/listeners/` immediately catches it, builds the JE payload, and
emits `accounting.post`. The posting service (`JournalPostingService`) listens on
`accounting.post` and writes the entry synchronously. This is the fast path — the JE
is posted in the same request cycle.

**Path B (outbox recovery):** The same payload is also written to the outbox within
the business transaction. If Path A fails (crash, network timeout), the outbox poller
retries: it reads the stored payload, calls `JournalPostingService.postFromEvent`
directly (no event emission needed), and posts the entry.

Both paths converge on the same posting service with the same payload. The outbox is the
safety net, not the primary route.

## Step 4: buildJePayload validates balance

Every listener uses `buildJePayload()` (in `helpers/build-je-payload.ts`) to construct
the payload. This function:

1. Accepts a list of line inputs, each with a `lineType`, and either a `debitTC` or a
   `creditTC` (transaction-currency amount, never both).
2. Sums all debits and all credits using `Decimal.js` (exact arithmetic, never floats).
3. **Throws if debits ≠ credits.** An unbalanced entry never reaches the posting service.

This is the Layer 0 rule enforced at Layer 2: the posting pipeline can only accept
balanced payloads. The error is loud and immediate, not a silent corruption.

## Step 5: Accounts are resolved by line type

The JE payload does not contain account IDs — it contains **line types** (semantic names
like `"cash"`, `"revenue"`, `"output_tax"`). The posting service looks up the actual
account ID for each line type using `AccountMappingService`. This service queries the
`account_mappings` table, which maps `(eventType, lineType) → accountId` with an override
hierarchy (system → tenant → warehouse → category → item). The line type is the
accounting intention; the account ID is the specific bucket for this tenant's COA.

This design means: the listener code never hardcodes account numbers. Change the COA,
update the mapping, and the same listener code posts to the new account. This is why
Layer 1's system roles and account mapping table matter to Layer 2.

## Step 6: The entry is written and the outbox row completed

The posting service writes the `journal_entries` header row and all `journal_entry_lines`
in a single transaction, with the `eventId` stored in the header and protected by a
unique index. A retry with the same `eventId` hits the unique constraint and is treated as
"already done" — the idempotency guarantee from Layer 0. Then the outbox row is marked
`completed`.

## The fire-and-forget anti-pattern

The most dangerous mistake is **fire-and-forget**: commit the document, then emit the
in-memory event outside the database transaction. If the process dies after the commit
but before the event fires, the event is gone with no retry. The outbox pattern exists
to make this gap impossible. Every posting path in Zerupt should be backed by an outbox
row inserted within the business transaction. The in-memory path is a speed optimization;
the outbox is the durability guarantee.

## Summary

| Step | What happens | Key guarantee |
|------|-------------|---------------|
| Document commit | Domain record + outbox row written in one tx | Document and its "post me" ticket are atomic |
| Listener (live path) | Builds JE payload, validates balance, emits `accounting.post` | Fast, in-request-cycle posting |
| Outbox poller | Recovers unposted entries after crash or retry | At-least-once delivery |
| `buildJePayload` | Sums DR and CR, throws if unequal | Entry can never be unbalanced |
| Account mapping | Resolves line type → accountId via mapping table | No hardcoded account numbers |
| Posting service | Writes entry + lines in one tx, checks unique eventId | Atomic write + idempotency |

Next: `02-account-mapping-and-roles.md`.
