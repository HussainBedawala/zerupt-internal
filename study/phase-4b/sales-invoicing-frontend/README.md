# Sales Invoicing — Frontend Concepts (DEV-284)

How the invoice UI is shaped by the accounting domain it sits on top of. Not a build log —
the *why* behind the patterns.

## 1. The draft → confirm lifecycle drives the UI shape

A sales invoice has exactly two states: **Draft** (mutable, no document number, no
accounting impact) and **Confirmed** (immutable, gapless `INV-NNNN`, posts inventory +
ledger effects). This is not a UI convenience — it mirrors how a paper invoice book works:
you scribble freely until you tear off the numbered copy, after which corrections happen
only via a **credit note**, never by editing.

Consequences for the frontend:
- The "create" page only opens a draft *header* (customer + branch). Lines are added on the
  detail page while the invoice is still a draft.
- Once confirmed, the same detail page flips to read-only and exposes *actions* (record
  payment, issue credit note) instead of *edits*.
- There is no "edit invoice" — a confirmed invoice is a legal record.

## 2. Why lines are added one API call at a time (not batched on save)

The backend exposes `POST /invoices/:id/lines` per line rather than accepting a full line
array on create. The reason is **tax + totals are computed server-side per line** (multi-rate
GST, per-line discount, currency from the branch's legal entity). Every line add/edit/remove
returns the recomputed invoice, so the client never has to reproduce tax math.

This is the core principle: **the server is the source of truth for money.** The client
computes nothing authoritative — it only *displays* the server's numbers and does *fail-fast
validation* (is this a positive decimal? ≤ balance?) to avoid obviously-doomed round-trips.
Reproducing rounding/tax logic on the client is how two "totals" drift apart and customers
lose trust in the books.

## 3. Document numbering: gapless sequences and "reserve → commit"

Confirmed invoices get a gapless `INV-0001` from a per-tenant sequence. Gapless matters for
tax authorities (a missing invoice number invites audit questions). The number is assigned
at *confirm*, not create — drafts carry a throwaway `DRAFT-<uuid>`. The sequence uses
reserve→commit so a failed confirm releases the number instead of burning it. The UI never
generates or guesses a number; it shows whatever the server returns.

## 4. Two-step money operations: create then post/confirm

Both "record payment" and "issue credit note" are **two API calls**: create a draft document,
then post/confirm it. This exists so the document can be reviewed before it moves balances,
and so the heavy transactional work (locking invoices `FOR UPDATE`, updating
`paidAmount`/`balance`) happens in one atomic step.

The frontend chains create→post but must handle **partial failure**: if create succeeds and
post fails (e.g. the period is soft-locked), a draft now exists. The UX surfaces this honestly
("a draft receipt was created but not posted") instead of pretending nothing happened — the
alternative is silent duplicate drafts the user can't see.

## 5. Period control intrudes on the happy path

Accounting periods can be **soft-locked** (post allowed with a recorded reason) or
**hard-locked** (blocked). A confirm/post can fail purely because of *when* it is, not *what*
it is. So the confirm dialog carries an optional "soft-lock override reason" that is normally
hidden and revealed when the server rejects with a lock error. The money paths are correct
first; the calendar is a second gate the UI has to translate for a non-accountant user.

## 6. Credit notes: the client can't know "remaining"

A credit note credits ≤ (invoiced qty − prior confirmed credits). The client only knows the
invoiced qty, not prior credits (no per-line credit-history endpoint yet). So the client caps
at invoiced qty and lets the **server enforce the true remaining**, mapping the rejection back
to a clear message. This is a deliberate MVP seam: better to ship with the server as the
backstop than to block on building credit-history aggregation the UI rarely needs.

## 7. Defensive UX is a domain requirement, not polish

The target users are MENA/India/SEA retail staff, not accountants. Every irreversible action
(confirm, post payment, issue credit note) gets a confirmation gate; every mutation button
disables while in flight (a double-click must not create two invoices or post a payment
twice); destructive line removal confirms; amounts are capped to the balance client-side.
In a system of record, the "dumbest thing a user could do" is usually a double-submit — so
that's designed against first.

## 8. Reuse as a correctness strategy

The slice was ported from the existing **purchase bill** frontend (near-identical
draft→confirm→pay lifecycle) and the **customers** frontend (list/detail patterns). Porting a
proven, reviewed pattern beats re-deriving one: the RTL logical-property discipline, the
query-invalidation rules for balance-changing mutations, and the partial-failure handling were
already solved. Sales-specific additions were the credit-note flow and selling-price (vs
cost-price) prefill.
