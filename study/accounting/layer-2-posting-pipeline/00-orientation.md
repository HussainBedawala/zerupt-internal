# 00 — Orientation: What Layer 2 Is

## Where we are in the building

```
        ┌─────────────────────────────────┐
        │ Layer 5: Reports (P&L, Balance   │
        │          Sheet, Cash Flow)       │
        ├─────────────────────────────────┤
        │ Layer 4: Periods, Opening        │
        │          Balances, Close, FX     │
        ├─────────────────────────────────┤
        │ Layer 3: Sub-ledgers (AR/AP),    │
        │          Inventory valuation     │
        ├─────────────────────────────────┤
        │ Layer 2: The Posting Pipeline    │   ← YOU ARE HERE
        ├─────────────────────────────────┤
        │ Layer 1: Chart of Accounts       │
        ├─────────────────────────────────┤
        │ Layer 0: The Ledger Foundation   │
        └─────────────────────────────────┘
```

Layer 0 told you the rule: every economic event must produce a balanced, immutable,
atomic, idempotent journal entry. Layer 1 told you where those entries land: accounts
have types, roles, and a system of semantic names so the engine can find the right bucket
without being hardcoded.

Layer 2 is the bridge. It answers: **how does a real business event — a sale at the POS,
a supplier invoice, a customer cheque — actually become a journal entry in the ledger?**

## The gap this layer fills

A cashier presses "Complete Sale." Something needs to happen in the books. But the POS
module doesn't know accounting. It doesn't know whether to debit cash or AR, whether to
use account 1112 or 1121, or how VAT affects the balancing. The POS module just knows: a
sale happened for SAR 230 including 5% VAT, paid in cash.

Layer 2 is the machinery that converts that business fact into a precise accounting
instruction. It:

1. Receives the business event (a structured payload from the domain module)
2. Validates it
3. Decides which accounts are involved and which side (DR/CR) each leg goes on
4. Emits a balanced JE payload
5. Gets that payload durably queued (outbox) and then posted to the ledger

If Layer 2 does its job correctly, "the books reflect reality" is won. Every sale, every
purchase, every payment, every stock movement — all of it lands in the ledger as a
balanced, correct, retrievable record. If Layer 2 has a bug — wrong accounts, missing
legs, unguarded failures — the books diverge from reality in ways that compound silently
until an auditor runs a reconciliation.

## The one-door rule

One of the most important architectural decisions in Zerupt accounting is:

> **Every automated posting goes through exactly one code path.**

No module writes journal entries directly. There is no "the POS posts its own entry" or
"the purchase module calls the ledger directly." Every module emits a business event. A
listener picks it up, builds the JE payload, and sends it to the `accounting.post` event.
A posting service receives `accounting.post` and writes the entry. One door.

This means: to audit whether any automated entry is correct, you audit one posting service
and a handful of event-specific listeners — not twenty modules scattered across the
codebase. It is the reason Layer 2 is a separate layer: by forcing all traffic through it,
we can reason about correctness in one place.

## What you'll be able to do after this layer

After these chapters you will be able to:

- Read any business event in the system and trace it through the full pipeline: event →
  listener → JE payload → outbox → poller → posting service → ledger.
- Look at a sale, a purchase, a return, a cheque, or an FX settlement and write out the
  correct double-entry by hand.
- Understand why the pipeline is designed for reliability — what happens on crash, retry,
  double-click, or dead-letter, and why the accounting outcome is still correct.
- Read the listener code in `apps/api/src/accounting-events/listeners/` and understand
  exactly what every line is doing.

## The mental model for Layer 2

> A business event carries the financial facts (amounts, tax, tender). A listener
> interprets those facts into accounting language (which accounts, DR or CR, amounts).
> A payload builder validates the balance. The outbox makes delivery durable. The posting
> service writes the entry to the ledger. The unique event ID prevents duplicates.
> Together they make "the sale happened → the books recorded it" an unbreakable guarantee.

Next: `01-from-business-event-to-journal-entry.md`.
