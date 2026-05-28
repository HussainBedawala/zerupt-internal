# POS Transaction Lifecycle — Concepts (DEV-275)

How a POS cart becomes a durable, accounting-correct sale. This is the *why*
behind the design, not a line-by-line of the code.

## 1. The cart state machine

A transaction moves through a small, deliberate set of states:

```
            ┌──── hold ────┐
            ▼              │
  (new) → Draft ──────── Held
            │  ▲ recall ───┘
            │  │
   pay ─────┤  └── (edits: addLine / updateLine / removeLine)
            ▼
        Completed                 Voided
            │                        ▲
            └─────── void ───────────┤
                                     │
       Draft ──────── void ──────────┘
```

- **Draft** is the only editable state. Adding/editing/removing lines is gated on
  `status = 'draft'`; anything else returns 409. Each edit re-runs `recompute`
  inside the same DB transaction, so header totals can never drift from the line set.
- **Held** parks a Draft so the cashier can serve the next customer (a customer
  walks off to grab a forgotten item). Hold sets `status = 'held'`; recall flips it
  back to `'draft'`. There's a cap (5 held per register) so the drawer doesn't
  accumulate stale carts.
- **Completed** and **Voided** are *terminal and immutable*. Once a sale is paid it
  represents money that changed hands and GL postings that exist downstream — editing
  it would silently desync the ledger. Corrections happen through a *new* document
  (a void reversal, or later, a Return), never by mutating history. This is the same
  immutable-audit principle the whole ERP follows.

**Why held carts don't reserve stock:** a held cart is an intention, not a
commitment. Reserving inventory on hold would let a forgotten/abandoned cart lock
real stock out of other sales indefinitely, and POS has no reliable "cart expired"
signal at the register. Stock only moves when the sale *completes* — that's the one
moment we know goods actually left the shelf. Until then the line is just a snapshot
of price/tax intent.

## 2. Why POS emits events instead of writing JEs or stock

POS owns the `pos_*` tables and nothing else. When a sale completes it **emits**
`pos.transaction.completed`; on void it emits `pos.void.completed`. It does *not*
write journal entries and does *not* decrement inventory.

- The **accounting listener** is the single source of truth for GL postings (DR cash/
  card receivable, CR revenue, CR output tax, plus COGS/inventory).
- The **inventory listener** owns stock movement and COGS — POS never consumes FIFO
  layers; it only *reads* the materialized WAC (`averageCost`) to snapshot `costAtSale`
  for the event payload.

This separation means each domain has one writer. POS can't post an unbalanced JE
because POS doesn't post JEs at all; it hands accounting a *contract* (below) and
accounting builds the entry. Emission is post-commit and failures are logged, never
thrown: the sale is already durable, and the outbox/poller owns retry.

## 3. Journal-entry balance as a contract

This was the deep lesson of the issue. The accounting listener builds a JE that
**must** satisfy:

```
Σ payments  ==  revenue  +  Σ tax
   (DR)            (CR)       (CR)
```

The listener has *no* discount line, *no* change line, and *no* rounding line — it
trusts the payload. So the emitter must shape the numbers to balance, or the JE is
rejected. Four rules, each with a reason:

**(a) Payments are emitted NET of change.** The customer hands over 50 KWD for a
47.250 KWD sale; the drawer gains 47.250, not 50. If we emitted the gross 50, DR
would exceed CR by the 2.750 change.

```
gross cash tendered   50.000
change given          -2.750
net payment           47.250   ← this is what's emitted (DR cash)
```

**(b) Revenue is emitted NET of discount.** `revenue = subtotal − discountTotal`.
Because the listener has no discount JE line, the discount must already be folded
into revenue. A 100 line with a 10 discount posts 90 of revenue, not 100 with a
separate 10 contra.

```
subtotal      100.000
discount      -10.000
revenue        90.000   ← emitted as CR revenue
```

**(c) Tax is emitted per tax COMPONENT, keyed by the real `taxCodeId`.** A single
"tax total" would collapse components that legally post to *different* accounts.
India GST splits one rate into CGST + SGST, each hitting a separate output-tax
account. So the payload carries one `taxLine` per component (zero-tax components
dropped), and the listener resolves each account by `taxCodeId`. Emitting a lumped
tax would land everything in one account and break statutory reporting.

```
line tax 18%  →  CGST 9% → taxCodeId A → its own account
                 SGST 9% → taxCodeId B → its own account
```

**(d) `grandTotal` stays EXACT; cash rounding is absorbed at the shift, not the line.**
`grandTotal = subtotal − discount + tax`, computed in full precision, and that exact
figure is what we validate payments against. Cash rounding (KWD to the nearest 5 fils,
AED to 25 fils) is **advisory only** — it tells the cashier UI the nearest payable
denomination but never alters stored money. The physical sub-denomination difference
naturally surfaces as drawer **cash over/short** at shift close, which *is* journaled
(via `pos.shift.closed`). If instead we rounded the stored total and added a
per-transaction rounding JE line, every sale would carry rounding noise and payments
would no longer tie to revenue + tax:

```
exact grandTotal    47.252
cash payable (5fil) 47.250   ← shown to cashier, NOT stored
                     0.002   ← would be a phantom imbalance per sale;
                              instead it rolls into shift over/short, posted once.
```

Net effect: the payload arrives pre-balanced and the listener's job is pure account
resolution.

## 4. Concurrency in a single-cashier-per-register world

Only one cashier owns an open shift on a register at a time, but the same cashier
(or a flaky network retrying) can still fire overlapping requests. Two guards:

- **Per-shift advisory lock for transaction numbers.** `transactionNumber` is
  sequential per shift (`REG-shift-seq`). The sequence is derived from a count of
  existing rows, which is racy under concurrency. We wrap create in a Postgres
  `pg_advisory_xact_lock(hashtext(shiftId))` so concurrent creates on the *same*
  shift serialize; the lock is transaction-scoped (auto-releases at commit/rollback).
  The unique constraint on the number is a backstop, with a single retry on collision.
  A per-shift lock (not a global one) keeps different registers fully parallel.

- **Exact-status guarded UPDATE for void (and pay/hold/recall).** Void runs
  `UPDATE ... WHERE status = <exact pre-read status>`. If two void requests race on a
  completed sale, only the first matches `status = 'completed'`; the second matches
  zero rows and is rejected. This prevents **double-reversal** — emitting two
  `pos.void.completed` events and reversing the sale's accounting twice. The same
  guarded-UPDATE pattern makes pay (only a Draft can complete), hold, and recall
  idempotent under races.

## 5. Money precision

All money is **decimal strings**, never IEEE floats — `0.1 + 0.2 !== 0.3` has no
place near a ledger. Storage is `numeric(19,6)`; arithmetic uses a `Decimal` library
configured with **`ROUND_HALF_EVEN`** (banker's rounding, which avoids the upward
bias of half-up across many transactions). Internal math carries 6 fractional places
(`MONEY_SCALE`); presentation/cash uses the currency's real minor units:

| Currency | Decimals | Cash rounding increment |
|----------|----------|-------------------------|
| KWD/BHD/OMR | 3 | 0.005 (5 fils) — OMR has none |
| AED/SAR/QAR/USD | 2 | AED 0.25, SAR 0.05, USD 0.01 — QAR none |

Tax-calc precision is driven by the currency's decimals, so a KWD sale computes to 3
places and an AED sale to 2 — the same engine, parameterized by currency rather than
hardcoded to one market.
