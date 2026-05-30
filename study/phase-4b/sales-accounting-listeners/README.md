# Sales accounting event listeners (DEV-330)

How a confirmed sales document turns into double-entry bookkeeping — the concepts, not the code.

## The event seam

Sales documents (invoice, credit note, receipt) don't write to the ledger directly. They **emit a domain event** (`sales.invoice.confirmed`, etc.). An accounting **listener** translates that event into a balanced journal entry (JE) and re-emits `accounting.post`, which the posting service writes to the GL. This keeps the Sales module ignorant of accounting rules, and lets one event feed several consumers.

Two consumers listen to the *same* `sales.invoice.confirmed`:
- the **inventory costing engine** → fans each line into a stock movement and posts the COGS/Inventory JE (it alone knows WAC/FIFO cost — the single source of cost truth);
- the **sales accounting listener** (this work) → posts the AR / Revenue / Output-Tax JE.

So a sale produces **two** journal entries from two owners, linked by `sourceDocumentId`. Revenue and COGS are deliberately *not* in the same JE.

## The three entries

- **Invoice:** DR Trade Receivables (gross, incl. tax) · CR Revenue (net) · CR Output Tax (per rate). The customer owes the gross; you earned the net; the tax is a liability you collected on the state's behalf.
- **Credit note:** the mirror — DR Sales Returns · DR Output Tax (reverse) · CR Trade Receivables. Identical whether it's a goods return or a pure price adjustment; the *stock* side differs (only goods returns restock), but that's the inventory engine's concern.
- **Receipt (customer payment):** DR Cash/Bank · CR Trade Receivables. Variations: early-payment discount the seller absorbs (DR Sales Discount), an advance with no invoice (CR Customer Deposits), an overpayment (excess → Customer Deposits), and realized FX.

## Why "balanced" is the invariant

Double-entry's one law: **Σ debits = Σ credits**. Every handler builds its lines so this holds *by construction*, and a central helper throws if it ever doesn't. The dangerous failure isn't an unbalanced entry (that's caught loudly) — it's a *balanced but wrong-signed* entry. That's why money fields are validated non-negative at the boundary: a stray negative still balances but silently corrupts the books.

## Multi-rate tax

A single invoice can carry several tax components (India splits GST into CGST + SGST; a mixed basket can hit several VAT rates). Each component becomes its **own** output-tax line keyed by its tax code — never summed into one — so tax returns can be filed per rate. The listener only *sums* already-rounded component amounts; it never re-rates, so no double-rounding.

## Realized FX on receipts

When a customer pays a foreign-currency invoice at a rate different from when it was booked, the difference is a **realized** gain or loss (vs. an *unrealized* one from period-end revaluation). The right design trusts the emitter's per-allocation FX figure rather than re-deriving it from "cash vs. AR relieved" — because that difference is more often an over/under-payment than an FX move, and conflating them mis-states both. Any genuine residual after settlement + discount + FX is an overpayment and parks in Customer Deposits. (MVP is single-currency, so this path is dormant but correct for when multi-currency lands.)

## Account mapping resolution

Listeners emit abstract **line types** (`receivable`, `revenue`, `output_tax`, `fx_gain`…), not account numbers. A resolver maps `(eventType, lineType) → accountId` with an override hierarchy (item > category > warehouse > tenant > system). It is **strict**: a missing mapping throws. So every line type a listener can emit must be seeded — and seeds apply at tenant provisioning, meaning **existing tenants drift** until re-seeded. That operational gap is as real as any code bug.

## The dead-letter gap (tracked, not fixed here)

These listeners run **in-process** off fire-and-forget events. If a handler throws on a malformed payload, the rejection is unhandled — it is *not* dead-lettered, and the business document has already committed. The `accounting.post` half of the pipeline is outbox-backed and safe; the listener's own validate/derive step is not. Cross-cutting across POS/Purchase/Sales — tracked in DEV-339.
