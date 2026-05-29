# Sales Invoice Lifecycle — Concepts (DEV-281)

How a sales invoice goes from an editable draft to a posted financial document, and
why the design splits work across modules instead of doing everything in one place.

## Draft vs. confirmed: a state machine, not an edit flag

An invoice is `draft` (freely editable: add/update/remove lines) or `confirmed`
(immutable). Confirmation is a one-way transition. Corrections after that happen via a
**credit note**, never by editing — this preserves an audit trail and keeps posted
accounting numbers stable. The same idea recurs across the ERP (POS sales, journal
entries): financial records are append-only; you reverse, you don't mutate.

## Why the document number is assigned at confirm, not create

Invoice numbers (`INV-0001`) must be **gapless and sequential** (a tax/audit
requirement in most jurisdictions). If a number were assigned at draft creation, every
abandoned draft would burn a number and create a gap. So drafts carry a throwaway
placeholder, and the real number is drawn from a sequence **only at confirmation**, via
a reserve→commit handshake: reserve the next number, do the work, commit it to the
document — or release it (which reclaims the number) if the confirm fails. This is the
classic "don't consume a scarce sequential resource until you're sure you'll use it."

## Event-driven posting: one event, many consumers

Confirming an invoice does **not** write journal entries or deduct stock directly.
Instead it emits one domain event (`sales.invoice.confirmed`). Separate listeners react:
- the **inventory engine** turns each line into a stock movement and — because it alone
  knows WAC/FIFO cost — posts the COGS/Inventory journal entry;
- a future **accounting listener** posts the AR / Revenue / Output-Tax journal entry.

Why split it? **Single source of truth.** COGS depends on costing math the sales module
shouldn't duplicate; tax/AR mapping belongs to accounting. The emitter's job is to state
*what happened* (a sale was confirmed) and carry enough facts for each consumer to do its
own job. The producer doesn't need its consumers to exist yet — the event is a
forward-compatible contract.

## costAtSale: a snapshot vs. the authoritative number

Each line stores `costAtSale` — a snapshot of weighted-average cost at confirmation, for
margin reporting. It is deliberately **not** the number the COGS journal entry uses; the
inventory engine recomputes authoritative COGS when it consumes the stock. Two different
purposes: a frozen reporting figure vs. the live ledger truth. Conflating them (e.g.
consuming FIFO layers during the sales confirm) would double-count.

## Period control gates posting

Before posting, the confirmation checks the **fiscal period** for the posting date:
- *Open* → post freely.
- *SoftLocked* → allowed only with an explicit override reason (captured for audit) —
  the month is "closing" but corrections are still tolerated.
- *HardLocked / closed year* → blocked entirely.

This is how an ERP stops someone from quietly booking revenue into a month that's already
been reported to management or the tax authority.

## Anchoring tax to the document date

Tax rates change over time. The tax calculation is anchored to the **confirmation date**,
not the wall-clock moment of the API call, and the totals stored on the invoice are
re-frozen from that same single calculation that feeds the event. If the stored tax and
the emitted tax came from two separate calculations (or two different dates), a later
journal entry built from the event could fail to balance against the invoice — a subtle
bug that only surfaces during reconciliation. One calculation, one date, one truth.

## Defensive checks before an irreversible action

Confirmation validates: the customer is active, at least one line has positive quantity,
and stock is sufficient. The stock pre-check is best-effort UX — the inventory engine
remains the authoritative guard against overselling — but failing fast at confirm time is
kinder than letting a confirmed invoice strand an unfulfillable stock movement in a retry
queue. The guiding question throughout: *what's the dumbest thing that could happen here,
and does the system refuse it clearly?*
