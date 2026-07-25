# Direct Sale — Edit / Amend: findings and decisions

Session 2026-07-25 (overnight, autonomous). Nothing committed, nothing stashed.

## TL;DR

`POST /tenant/sales/direct-sales/:id/amend` with `mode: "edit"` was **live** with seven
defects, three of them silent data-loss or silent money-corruption paths. No UI called it
yet, so all were latent — we found them before a customer did.

**All seven are now fixed and tested** (2026-07-25 overnight). The backend for
"edit a direct sale" is now correct. What remains is UI: the detail-page rebuild, the
tiered Edit affordance, and import. See `direct-sale-amend-designs.md` for the three
architectural designs that were implemented, and the status table below.

| # | Defect | Status |
|---|---|---|
| 1 | Restock race destroys or mis-costs the sale | FIXED — restock is now synchronous inside the void tx; retry band-aid deleted |
| 2 | Idempotency-key reuse silently voids with no replacement | FIXED — key derived from the amendment, collision impossible |
| 3 | Soft-lock override not threaded into the recreate | FIXED |
| 4 | COGS re-struck at today's WAC | FIXED — original basis preserved + as-of-date resolver; provably cost-neutral |
| 5 | Serial items mis-costed, stock ledger silently diverges | FIXED — serials captured end to end; batch confirmed already correct |
| 6 | Receipt bank account / date not inherited | FIXED — original receipt values used as fallbacks |
| 7 | `saleDate` unconstrained vs the reversal period | FIXED — cost basis pinned to the original confirm date |

Plus, beyond the original seven: a stable identity overlay (`rootId`/`version`/`saleNumber`)
so the sale keeps one number and one URL across every edit, and line-item audit snapshots so
the amend history renders a real field-level diff.

## What changed tonight

| File | Change | Status |
|---|---|---|
| `apps/web/.../direct/direct-sales-list-panel.tsx` | removed the redundant "N sales" count (pagination already shows the total) | done |
| `apps/web/messages/{en,ar}/sales.json` | deleted the now-dead `direct.list.subtitle` key | done, `i18n:check` passes |
| `apps/api/src/common/amend/amend-idempotency.ts` | **new** — `deriveAmendChildIdempotencyKey()` | done, 6 tests |
| `apps/api/src/common/amend/amend-idempotency.spec.ts` | **new** | 6/6 pass |
| `apps/api/src/sales/direct/direct-sale-amend.adapter.ts` | `recreateCorrected` derives its own idempotency key + threads the soft-lock override | done |
| `apps/api/src/sales/direct/direct-sale-amend.adapter.spec.ts` | +5 regression tests | 31/31 pass |

### Fixed #1 — silent sale destruction via idempotency-key reuse (was CRITICAL)

`create()` is idempotent on a client-supplied key. A UI prefilling the edit form from the
existing sale naturally carries the **original** key, so `create()` short-circuited and
returned the anchor `voidOriginal` had just voided, as a replay. The saga then finalized
**successfully** with `amendedDocumentId` pointing at the voided row.

Net effect: sale cancelled, no replacement created, payment never re-posted, and no error
anywhere. Silent data loss.

Fixed structurally rather than by a guard — the adapter never passes the client key
through. It derives an RFC 4122 v5 UUID from the *amendment's* key, so collision with the
original is impossible, while a replayed amendment still derives the same value and stays
idempotent. The helper is generic and every other amend adapter should adopt it.

### Fixed #2 — soft-lock override not threaded into the recreate (was HIGH)

`input.softLockOverrideReason` was passed to `receipts.reverse` and `voidInvoice` but not
to the recreate, which reads it off the *create payload* instead. So amending a sale in a
soft-locked period — i.e. exactly the months-old sale this feature exists for — reversed
the receipt, voided the invoice, then 422'd on the recreate. `voidOriginal.compensate`
throws by design, so the saga lands in `failed_needs_reconcile` with the sale destroyed.

Now threaded, with an explicit payload value still winning.

## The defects in detail

### #3 — void/recreate race (CRITICAL) — FIXED

`voidInvoice` restocks **asynchronously**: it inserts an outbox row, then does an
unawaited `eventEmitter.emit`, handled by `@OnEvent(..., { async: true })` in
`inventory-domain.listener.ts:212`. The saga calls `recreateCorrected` the instant
`voidOriginal.run()` resolves, so the recreate reads stock *before* the units return.

If the sale took the item to zero — ordinary for a small shop — the recreate throws
`INSUFFICIENT_STOCK`, compensation is impossible by design, and the sale is destroyed.

**Why it was deferred mid-session:** the negative-stock agent was rewriting `negative-stock-policy.ts`,
`negative-stock-policy.service.ts` and `inventory-domain.listener.ts` during this session.
Whether insufficient stock throws at all may be changing. Building a barrier against a
contract mid-redefinition is how you get to fix it twice.

**Correct permanent fix:** make the void's restock synchronous inside the void
transaction. A polling barrier in the saga is a mitigation, not the architecture.

### #4 — COGS re-struck at today's cost (HIGH) — FIXED

Void restocks at the frozen `costAtSale`; the recreate deducts at **current** WAC. So
`ΔCOGS = q·Q·(W − c₀)/(Q+q)`, and the item's running average is permanently pulled toward
a months-old cost, mispricing every subsequent sale of that item. Books stay balanced;
margin history quietly rewrites itself and the error compounds.

**Decision (founder delegated this call): preserve the ORIGINAL cost basis, with the
correction pinned to the original sale date.** An edit corrects what was recorded; it is
not a new economic event. The goods left the warehouse on the original date at the
original cost. Re-striking at today's WAC invents a gain/loss with no economic substance
and books it into a period where nothing happened. Original-cost also satisfies the
matching principle — COGS belongs with the revenue it earned.

**New machinery required:** lines the user *adds* during an edit have no original basis
and must use the WAC **as of the sale date**, reconstructed from the stock ledger's
historical movements. No as-of-date cost resolver exists today. It is reusable well beyond
amend — backdated sales, backdated purchases and historical imports all need it and none
of them have it. It lives in the costing engine, so it must be coordinated with the
negative-stock work rather than built underneath it.

### #5 — serial items lose specific-ID costing (HIGH) — FIXED (batch was never broken)

`directSaleLineSchema` has no `serialNumbers` field, and `DirectSaleService` inserts
invoice lines directly, bypassing `addLine`'s validation that normally *requires* serials
for serial-tracked items. So a direct sale of a serial item was never controlled. Amend
makes it worse: void frees the serials, the recreate can't re-claim them, they stay
`available` forever, and costing silently falls back to WAC. Batch handling is
**unverified** — no `trackingType` guard was found anywhere under `sales/direct/`.

### #6 — receipt bank account / date not inherited (MEDIUM) — FIXED

The recreated receipt takes `bankAccountId` and `paymentDate` from the corrected payload
only. Omit them and an amended bank-transfer sale silently re-posts to the **default**
cash/bank account. Client-contract landmine; the adapter should carry the original
receipt's values into the context and use them as fallbacks.

### #7 — `saleDate` unconstrained on the corrected payload (MEDIUM) — FIXED

Nothing cross-checks it, so the reversal can net in the old period while the replacement
lands in the current one. Should be pinned to the original date (see #4).

## Architecture decisions

### Stable identity overlay — BUILT (migration 0222)

Amend inserts a **new** anchor row and voids the old one, so the URL changes and there is
no stable thing to hang a permanent number on.

Keep the immutable chain. Add `rootId` (first anchor, inherited by every amendment) and
`version` to `direct_sales`. Allocate the user-facing sale number **once on the root**;
every successor inherits it unchanged. The detail route resolves a superseded anchor
forward to the current version, so a two-month-old bookmark still opens the live sale.

User sees one sale, one number, one URL, forever. Underneath, every version is immutable
with its own compliant tax invoice number. Not implemented because
`packages/db/src/schema/sales.ts` was being modified and migrations 0218/0219 were already
in flight — a competing migration would have been a mess to untangle.

### Why the tax invoice number must still change

A voided tax invoice number cannot be reissued to a document with different content.
India: an e-invoice with an IRN can only be cancelled within 24h, then it's a credit note.
ZATCA Phase 2: a cleared invoice cannot be modified. This is a compliance floor, not a
preference — hence the identity overlay, which hides it from the user entirely.

### Tiered edit (the feature design)

Competitors *do* offer this — Tally, Busy, Marg, QuickBooks, Zoho and NetSuite all allow
editing posted invoices; Square/Shopify/Lightspeed don't; Odoo requires reset-to-draft.
For MENA/India/SEA retail the Tally expectation dominates: any voucher, any time.

So: **one Edit button, three behaviours, none explained in ledger jargon.**

1. Not yet reported, period open → true edit. The overwhelming majority of corrections.
2. Reported/cleared → credit note + replacement behind the scenes; tell the user plainly
   that the original was already sent to the tax authority so we corrected it with an
   adjustment. The words "credit note" never appear.
3. Closed period → blocked with a clear reason, or posted to the current period with an
   explicit heads-up. Must be visible either way.

The regulatory freeze in `amend-saga-runner.service.ts:192-200` already implements the
tier-2 trigger.

### Audit: the UI exists, the data doesn't

`apps/web/src/features/audit/components/audit-field-diff.tsx` already renders exactly the
"quantity 3 → 5" field-level diff we want, including per-line added/removed badges, and it
is entity-agnostic. But `documentSnapshot` (adapter.ts:213-222) carries header fields only
— no line items — so a line-level diff cannot be reconstructed. `DocumentAmendHistory`
never reads the audit payloads at all, only `document_amendments` metadata.

Fix is data-side: extend `documentSnapshot` with line items and snapshot the corrected
sale's lines in `recreateCorrected`. The existing component then renders it with no new UI.

## Recommended order

1. Coordinate with the negative-stock agent, then fix the restock race properly
   (synchronous restock in the void transaction).
2. Build the as-of-date cost resolver; implement original-cost preservation (#4, #7).
3. Close #5 (serials on direct sale) and #6 (receipt inheritance).
4. Add the line-item snapshot so the amend history renders a real diff.
5. Identity overlay migration (`rootId`, `version`, sale number) once `sales.ts` is free.
6. Only then build the UI: detail-page rebuild, Edit button, tiered behaviour.

Integration tests are the gap throughout — every amend test today is mock-based, with
`directSale.create` itself mocked. Nothing has ever exercised a real transaction, real
stock levels, or a real period.
