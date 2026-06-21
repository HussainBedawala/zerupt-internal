# 09 — How Zerupt Implements Layer 2

## Reading the code

This chapter maps the concepts from chapters 01–08 to the actual files in the codebase.
Reading this chapter while having the files open will make the code readable at a glance.

All paths are relative to `erp/apps/api/src/`.

---

## The event constants — the vocabulary

**File:** `accounting-events/accounting-events.constants.ts`

This file is the complete vocabulary of accounting events. It defines:

- `POS_EVENTS` — 4 events: `pos.transaction.completed`, `pos.return.completed`,
  `pos.shift.closed`, `pos.void.completed`
- `SALES_EVENTS` — 3 events: `sales.invoice.confirmed`, `sales.creditNote.confirmed`,
  `sales.receipt.posted`
- `PURCHASE_EVENTS` — 7 events covering bill, GRN, landed cost, return, payment, advance
- `INVENTORY_ACCOUNTING_EVENTS` — 6 events for adjustments, transfers, consumption,
  assembly
- `CHEQUE_EVENTS` — 8 events for the full cheque status machine
- `ACCOUNTING_EVENTS.POST` — the one internal event (`accounting.post`) that all
  listeners emit to route into the posting service
- `DEAD_LETTER_EVENTS.CREATED` — emitted when a row is dead-lettered
- Outbox configuration constants: `OUTBOX_BACKOFF_SECONDS`, `OUTBOX_MAX_ATTEMPTS`,
  adaptive poller timings, circuit breaker thresholds

The constants file is also the index of everything the posting pipeline handles. Any
new business event that needs GL entries requires a new constant here first.

---

## The payload builder — the balance enforcer

**File:** `accounting-events/helpers/build-je-payload.ts`

The `buildJePayload(params)` function is the single point where all JE payloads are
constructed. It:

1. Accepts a `JePayloadParams` with `eventId`, `eventType`, `tenantId`, `branchId`,
   `currency`, optional `exchangeRate`, `sourceDocument*` fields, and an array of
   `JeLineInput`.
2. Sums all `debitTC` and `creditTC` amounts using `Decimal.js`.
3. Throws `Error('Unbalanced JE for ...')` if they don't match.
4. Returns a `PostEventPayload` ready for the posting service.

Every listener calls this function. There is no other way to construct a posting payload.
This is the architectural chokepoint that enforces the Layer 0 balance rule.

**File:** `accounting-events/helpers/build-pos-transaction-post.ts`

The POS transaction posting is complex enough (change calculation, applied-vs-tendered
amounts, multi-tender) that it has its own helper. This helper is used by both:
- The live POS listener (in-request path)
- The dead-letter replay CLI (crash recovery)

Having a single function for both ensures that replayed entries are byte-for-byte
identical to what the live path would have produced.

---

## The outbox — the durability guarantee

**File:** `accounting-events/outbox.service.ts` — `OutboxService`

Manages all CRUD operations on `accounting_event_outbox`:

- `insert(tenantId, eventType, payload, tx?)` — insert a row within the caller's DB
  transaction (the `tx` parameter). If `tx` is provided, the insert is part of that
  transaction (transactional outbox pattern). If not, it inserts directly.
- `claimBatch(batchSize)` — atomic `UPDATE ... SET status='processing' WHERE id IN
  (SELECT ... FOR UPDATE SKIP LOCKED)`. Returns claimed rows.
- `markCompleted(id)`, `markFailed(id, attempts, error)`, `markDeadLetter(id, error)` —
  the status machine transitions.
- `retryDeadLetter(id)` — resets a dead-letter row to pending with 0 attempts.
- `insertDeadLetter(...)` — used by `runListenerHandler` to park @OnEvent failures
  directly into dead-letter (since there's no outbox row to update in the live path).

**File:** `accounting-events/outbox-poller.service.ts` — `OutboxPollerService`

The background service that drives crash-recovery posting:

- Enabled by `OUTBOX_POLLER_ENABLED=true` environment variable (off by default in dev).
- Adaptive polling: 1s when events are found, exponential backoff up to 20 minutes when
  idle. The comment in the constants file explains why 20 minutes is fine: the live path
  posts synchronously, so the poller only matters after crashes or deploys.
- Per-tenant isolation: iterates all active tenants, runs each in its own `tenantStore`
  async-local-storage context.
- Circuit breaker: after 5 consecutive failures for a tenant, opens the circuit for that
  tenant (escalating cooldown up to 5 minutes). Other tenants are unaffected.
- Bounded concurrency: processes tenants in batches of 5 (configurable).
- Calls `JournalPostingService.postFromEvent(payload)` directly — no event emission.

---

## The listeners — where events become JE payloads

All listeners live in `accounting-events/listeners/`.

**`pos.listener.ts` — `PosAccountingListener`**

Handles 4 POS events:
- `pos.transaction.completed` → calls `buildPosTransactionPost()` which handles the
  applied-vs-tendered logic and multi-tender debit lines.
- `pos.return.completed` → DR sales_return + DR output_tax / CR refund method.
- `pos.shift.closed` → cash over/short entries and drawer transfer entries.
- `pos.void.completed` → full DR/CR swap of the original transaction.

Note: every handler comments "COGS/inventory lines are NOT posted here" — the inventory
engine is the single source of COGS truth.

**`sales.listener.ts` — `SalesAccountingListener`**

Handles 3 sales events:
- `sales.invoice.confirmed` → DR receivable / CR revenue + CR output_tax (per tax line).
- `sales.creditNote.confirmed` → DR returns + DR output_tax / CR receivable.
- `sales.receipt.posted` → DR cash/bank / CR receivable + optional CR customer_deposit
  (overpayment) + optional DR discount + optional CR/DR fx_gain/fx_loss. The advance
  case (no allocations) parks funds in customer_deposit.

Note the `bankAccountId` override on bank transfers (ISSUE-72): the debit `accountId` is
set explicitly on the line when the user chose a specific GL account.

**`purchase-accounting.listener.ts` — `PurchaseAccountingListener`**

Handles 6 purchase events:
- `purchase.invoice.confirmed` → splits between `grn_accrual` (matched portion) and
  `inventory` (remainder), handles recoverable/non-recoverable/reverse-charge tax,
  credits `payable`.
- `purchase.grn.confirmed` → DR inventory + optional tax / CR payable or accrual
  (depending on `hasSupplierInvoice`).
- `purchase.landedCost.allocated` → one JE per component; DR inventory / CR per
  `creditAccountType`; deterministic sub-eventId via `deterministicUuidV5`.
- `purchase.return.confirmed` → DR payable + DR accrual / CR inventory + CR tax reversal
  + optional purchase price variance.
- `purchase.payment.posted` → standard (DR payable / CR cash/bank + discount + FX) or
  advance (DR supplier_advance / CR cash/bank).
- `purchase.payment.advanceApplied` → DR payable / CR supplier_advance + optional FX.

**`inventory-accounting.listener.ts` — `InventoryAccountingListener`**

Handles 2 events (others — consumption, assembly, disassembly, count — are defined in
constants but their handlers may be in the inventory module directly):
- `inventory.adjustment.posted` → decrease = DR inventory_writedown / CR inventory;
  increase = DR inventory / CR inventory_gain.
- `inventory.transfer.completed` → same-branch transfers produce no JE; cross-branch
  send = DR inventory_transit / CR inventory; receive = DR inventory / CR inventory_transit;
  missing items = DR writedown / CR transit.

**`cheque-accounting.listener.ts` — `ChequeAccountingListener`**

Handles 8 cheque events through a shared `post()` method that calls `buildLines()` per
event. Each status transition is a 2-line or 4-line (bounce with fee) JE following the
lifecycle described in Chapter 7.

---

## The account mapping service — the directory lookup

**File:** `journal-entries/account-mapping.service.ts` — `AccountMappingService`

`resolveAccount(tenantId, legalEntityId, eventType, lineType, context?)` fetches all
`account_mappings` rows for the `(eventType, lineType)` pair and picks the highest-scope
active row. The scope priority: `system(0) < tenant(1) < warehouse(2) < category(3) <
item(4)`. Throws `NotFoundException` on no match (→ dead-letter, not a crash).

The `context` parameter carries optional `itemId`, `categoryId`, `warehouseId` for
override resolution at fine granularity.

---

## The run-listener-handler helper

**File:** `accounting-events/helpers/run-listener-handler.ts`

Every `@OnEvent` handler wraps its business logic in `runListenerHandler(logger, eventType, fn, dlqContext)`. This helper:
- Calls `fn()`
- On throw, calls `dlqContext` to persist the raw payload to dead-letter
- Logs the error

This is what separates the "live path failed → dead-letter the raw event" behavior from
a bare uncaught exception that would simply log and silently drop the event.

---

## Where modules emit events (the entry points)

Layer 2 doesn't tell you *when* events are emitted — that's the domain modules' job.
But here are the key emit points:

| Module | Location | Event |
|--------|----------|-------|
| POS | `pos/pos-transactions.service.ts` | `pos.transaction.completed` |
| Sales | `sales/invoices/sales-invoices.service.ts` | `sales.invoice.confirmed` |
| Sales | `sales/receipts/sales-receipts.service.ts` | `sales.receipt.posted` |
| Purchase | `purchase/bills/purchase-bills.service.ts` | `purchase.invoice.confirmed` |
| Purchase | `purchase/grns/purchase-grns.service.ts` | `purchase.grn.confirmed` |
| Inventory | `inventory/inventory-movements.service.ts` | `inventory.adjustment.posted` |
| Cheques | `cheques/cheques.service.ts` | `cheque.status.*` |

Each emit point is also the location where the outbox row should be inserted (within the
business transaction). This is the most likely area for Layer 2 hardening: verifying that
every emit point pairs its event emission with a transactional outbox insert, and that
there are no fire-and-forget patterns where the in-memory event is emitted *after* the
transaction commits (with no outbox safety net).

---

## What Layer 2 hardening would target

The audit from Layer 0 (chapter 08) identified the fire-and-forget anti-pattern as a
risk: emitting an in-memory event outside the database transaction, with no outbox row as
a fallback. The areas to verify:

1. **Every emit point** inserts an outbox row in the same DB transaction as the document.
   Any emit that runs after `await tx.commit()` is a fire-and-forget risk.
2. **The live path and the outbox path** must produce identical JE payloads. The
   `build-pos-transaction-post.ts` pattern (shared builder used by both paths) is the
   model — verify all other listeners have equivalent replay fidelity.
3. **Dead-letter surfacing** — ensure operational dashboards and alerts fire when rows
   accumulate in `dead_letter`, so no silent posting failures go unnoticed.
4. **Account mapping coverage** — every `lineType` emitted by every listener must have a
   `system`-scope seed row in `account_mappings`. A missing mapping dead-letters silently;
   a mapping audit that runs at startup or in CI would catch gaps before they hit
   production.

---

## The mental model

> The constants file is the vocabulary. The helpers (`buildJePayload`, `buildPosTransactionPost`,
> `runListenerHandler`) are the shared utilities. The listeners are the per-event
> interpreters. The outbox service is the durability layer. The poller is the crash
> recovery driver. The account mapping service is the directory. The posting service
> writes the final, immutable entry. Every piece is a single-responsibility component;
> together they make business events become correct, durable, balanced journal entries.
