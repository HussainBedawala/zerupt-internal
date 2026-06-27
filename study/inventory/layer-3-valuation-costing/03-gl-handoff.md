# 03 — Inventory → GL Handoff (DR COGS / CR Inventory, Outbox, Idempotency)

## Architecture: dual-path delivery

Every COGS or inventory JE uses TWO parallel delivery paths:

1. **Outbox row (durable, at-least-once):** `OutboxService.insert(...)` inside the SAME
   database transaction as the ledger write (`inventory-event.listener.ts:438-449`). The
   outbox poller picks up the row and emits `accounting.post` even if the process crashes
   after commit. Guaranteed delivery as long as the poller runs.

2. **In-process emit (fast path, optimistic):** `EventEmitter2.emit(ACCOUNTING_EVENTS.POST, ...)`
   post-commit (`inventory-event.listener.ts:505-515`). Fires immediately in the same process
   without waiting for the poller. Guarded in try/catch — a listener failure logs but does not
   bubble. The outbox row is the backstop.

Both paths carry the SAME `eventId` (deterministic uuid v5 of source doc + movement + item +
line). Journal posting deduplicates on `eventId` so the poller re-emit is a no-op.

## What goes inside the transaction vs outside

Inside (atomic with ledger write):
- Outbox row for the COGS JE
- Outbox row for the COGS reversal (sale_return)
- Outbox row for the negative-stock true-up JE (if applicable)
- `materialized_stock_levels` update

Outside (post-commit, optimistic fast path):
- In-process EventEmitter emit of the same payloads

This guarantees: if the tx commits, the outbox row exists. The JE WILL be posted, possibly
with delay if the process dies, but never silently lost.

## JE format

All JEs use `FUNCTIONAL_CURRENCY_SENTINEL` (`inventory-event.listener.ts:19`) for currency
(meaning: do not perform FX conversion, post in functional currency). `exchangeRate = "1"`.
The `occurredAt` field stamps the JE with the BUSINESS DATE of the originating document
(`payload.occurredAt ?? new Date()`), ensuring the COGS lands in the same fiscal period as the
sale/return/receipt.

## Soft-lock override threading

COGS JEs and COGS-reversal JEs carry a `softLockOverride` field (`withSoftLockOverride`,
`inventory-event.listener.ts:866-884`). This allows the accounting engine to post into a
soft-locked (month-end reviewing) period for the inventory COGS entries specifically, since
POS sales happen around fiscal period boundaries and cannot be delayed.

## Idempotency

- Outbox rows: unique on `eventId` (`accounting-outbox.ts`). Duplicate insert is a no-op.
- Journal posting (`accounting.post` listener): deduplicates on `eventId` via a unique index
  on `journal_entries.eventId` or equivalent in the accounting module.
- Ledger write (`StockLedgerService.record`): unique index `sle_event_id_key` on
  `stock_ledger_entries.event_id` (`inventory-costing.ts:209`). Duplicate returns null.
- The idempotency chain: ledger null-return → skip outbox insert → skip in-process emit.
  Re-running the same event is always safe.

## GAP — LandedCostListener does NOT use the outbox

`landed-cost.listener.ts:244-245`:
```typescript
this.eventEmitter.emit(ACCOUNTING_EVENTS.POST, { ... });
```
This is a DIRECT EventEmitter emit with NO outbox row. It fires post-commit only. If the
process crashes between the DB commit (step 7, ledger entry + WAC update) and the in-process
emit (step 9), the landed-cost JE is SILENTLY LOST. The landed-cost adjustment ledger entry
records cost movement in the stock ledger, but the GL (1141 and COGS adjustment) receives no
corresponding JE. This violates the at-least-once delivery guarantee that all other JE paths
achieve. CRITICAL delivery gap.

## GAP — no JE posted for GRN inbound to GL

When a GRN is received, the inventory-event.listener's `applyInbound` updates the stock ledger
and WAC. But the `DR Inventory / CR Accounts Payable` JE is NOT posted here — it is posted by
the Purchase module (`purchase.invoice.confirmed` listener). This is intentional module
separation. However it means the GL-subledger invariant momentarily breaks (ledger updated,
1141 not yet debited) until the Purchase listener fires. In the current in-process EventEmitter
model this is milliseconds; with a poller it would be a longer window. The outbox model in the
Purchase module makes this durable but not instantaneous. Study/audit should verify that the
Purchase module ALWAYS posts this JE and deduplicates correctly.
