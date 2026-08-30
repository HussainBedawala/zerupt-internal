# Purchase Module — Accounting Correctness Review

**Tenant under test:** Gulf Auto Parts (Kuwait, KWD, 3dp), single legal entity, 4 branches, 6 warehouses.
**Date:** 2026-08-27 · **Mode:** paranoid guarding review (code + schema + live DB).
**Read first:** `study/purchase/_hardening-log.md`, `erp/docs/CODEMAPS/purchase.md`.

## Correction to the brief's data assumptions

The brief said "0 GRNs, 0 payments, 0 returns, 0 landed costs". That is **stale**. The live
Gulf DB actually contains a complete purchase cycle:

```
source_document_type | count      grns: 2 confirmed      purchase_returns:  1 confirmed
---------------------+------      purchase_invoices: 298 (296 opening, 2 real)
grn                  | 2          supplier_payments: 2
pinv                 | 2          landed_costs:      1 posted (1 component, by_value)
prn                  | 2
pay                  | 2
lc                   | 1
```

That live cycle is what produced **CRITICAL-1 below, which is a CONFIRMED, already-materialised
loss of KWD 11.000 in this tenant's books right now.**

---

# CRITICAL

## CRITICAL-1 — CONFIRMED (live data). A purchase return debits GR/IR 2121 instead of AP 2111 whenever the source GRN was received *without* a supplier invoice, even after that GRN has been fully billed and fully paid. AP is permanently overstated and GR/IR carries a phantom debit forever.

**Files**
- `erp/apps/api/src/purchase/returns/purchase-returns.service.ts:2243-2272` (`resolveMatchedByLineId`)
- `erp/apps/api/src/purchase/returns/purchase-returns-events.ts:140-196` (`buildReturnApSplit`)
- `erp/apps/api/src/accounting-events/listeners/purchase-accounting.listener.ts:1974-1995`
- Over-return guard that permits it: `purchase-returns.service.ts:2129-2175`

**The defect.** The AP-vs-accrual split is decided by `grns.has_supplier_invoice` — a *receipt-time*
boolean meaning "did the goods arrive with the supplier's invoice in the box". It is **orthogonal**
to whether the GRN line has since been billed:

```ts
// purchase-returns.service.ts:2264-2268
const [row] = await db.select({ hasSupplierInvoice: grns.hasSupplierInvoice }) ...
grnLineMatched.set(line.grnLineId, row?.hasSupplierInvoice ?? true);
```
```ts
// purchase-returns-events.ts:163-172
const matched = matchedByLineId.get(b.lineId) ?? true;
if (matched) { matchedPriceNet = matchedPriceNet.plus(priceNet); ... }
else         { accrualPriceNet = accrualPriceNet.plus(priceNet); }   // → DR 2121
```

The obligation moves from 2121 to 2111 the moment the bill is confirmed
(`purchase-accounting.listener.ts:886-891` DR 2121 / line 1010-1019 CR 2111). Nothing re-reads
`grn_lines.billed_qty` when the return is posted. The correct discriminator is
`billed_qty` per GRN LINE, not `has_supplier_invoice` per GRN HEADER.

**Compounding defect.** The over-return guard is `Σ returned ≤ received_qty`
(`purchase-returns.service.ts:2164-2172`); it does **not** consider `billed_qty`. So returning
already-billed, already-paid units is fully permitted. (Contrast: `applyGrnMatching`
`purchase-invoices.service.ts:2901-2906` uses `received − returned − billed`, so the *reverse*
order IS guarded. Asymmetric.)

**Live proof (Gulf DB, not a hypothetical).**

```
grns:            B1ALRAIMAINS-GRN-00001  has_supplier_invoice = f
grn_lines:       received_qty 10.000000  billed_qty 10.000000  unit_cost 5.500000
JRN-00023 (grn):   DR 1141 55.000  / CR 2121 55.000
JRN-00024 (pinv):  DR 2121 55.000  / CR 2111 55.000     <-- accrual fully cleared
JRN-00026 (pay):   DR 2111 55.000  / CR bank            <-- supplier fully PAID
purchase_return_lines: grn_line_id = 7f014cc7..., bill_line_id = NULL, qty 2 @ 5.500 = 11.000
JRN-00030 (prn):   DR 2121 11.000  / CR 1192 11.000     <-- WRONG ACCOUNT
```

Resulting live balances:

```
2121 GRN Accrual  = -8889.000  (= -8900.000 opening + 11.000 phantom DEBIT)
2111 Trade Payables still carries the full 55.000 that was billed and paid
purchase_returns.refundable_amount = 0.000   <-- no receivable from supplier recorded
```

**Failure scenario in one line.** Gulf receives 10 filters at 5.500 with no invoice, bills them,
pays 55.000 KWD, returns 2 filters to the supplier. The books record **zero** amount owed back by
the supplier, and 11.000 KWD sits as a debit in GR/IR 2121 that no future bill can ever clear.
The money is gone and no report can see it.

**Both paths are affected.** `DirectPurchaseService` hardcodes `hasSupplierInvoice: false`
(`erp/apps/api/src/purchase/direct/direct-purchase.service.ts:534`) and then immediately bills that
GRN. So **every** direct purchase — the dominant Kuwait retail path — creates a GRN that is
permanently mis-classified for return purposes. The only escape is a return raised from the BILL
line (`bill_line_id` set → forced `matched = true`, `purchase-returns.service.ts:2256-2260`).
So the bug bites exactly the GRN-sourced return UI, on both paths.

**Fix.** Replace the `has_supplier_invoice` lookup with a per-GRN-LINE split:
`accrualPortion = min(returnQty, received − billed)`, `payablePortion = returnQty − accrualPortion`,
resolved under the same `FOR UPDATE` lock `applyGrnMatching` takes; and extend the over-return guard
to reduce `billed_qty` (or refuse) when returning billed units. Note the split must be per LINE and
per QUANTITY, not per document — a partially-billed line straddles both accounts.

---

## CRITICAL-2 — CONFIRMED (by code; reachable through the ordinary UI). A purchase-bill journal entry whose Purchase Price Variance is smaller than half a fils is **rejected outright**, after the bill has already committed. The bill exists with no GL at all — invisible to AP, aging, and the trial balance.

**Files**
- `erp/apps/api/src/journal-entries/journal-posting.service.ts:1289-1325` (`normalizeAndValidateLine`)
- `erp/apps/api/src/journal-entries/journal-posting.service.ts:645-654` (`hasForeignLeg` gate)
- `erp/apps/api/src/journal-entries/journal-posting.service.ts:903-928` (residual absorption)
- `erp/apps/api/src/accounting-events/helpers/build-je-payload.ts:165-173` (balance checked at 6dp, unrounded)
- `erp/apps/api/src/accounting-events/listeners/purchase-accounting.listener.ts:894-910` (PV leg emitted at 6dp)

**The chain.**
1. Documents store money at `numeric(19,6)`; every purchase leg is emitted `toFixed(6)`.
2. `buildJePayload` validates Σdebit = Σcredit **at 6dp**, so a 6dp-balanced payload passes.
3. `postDirect` then rounds **every leg independently** to the functional currency's precision —
   KWD = **3dp** (`transaction-currencies.ts:55`), via
   `functionalDecimalPlaces: currencyDecimals(functionalCurrency)` (line 700-702).
4. A leg whose amount is `< 0.0005` KWD rounds to `0.000000`, and then:

```ts
// journal-posting.service.ts:1321-1325
if (!debitPos && !creditPos) {
  throw new BadRequestException(`Journal ${lineLabel}: a line must be either a debit or a credit ...`);
}
```
5. Even if the leg survived, the surviving residual has nowhere to go: the FX-rounding plug account
   is resolved **only when `hasForeignLeg` is true** (line 645-654), which is false for every
   KWD-on-KWD entry, so line 921-926 throws
   `"...functional rounding residual ... but no FX rounding account ... was provided to absorb it."`

**Arithmetic that proves it (all values UI-legal in KWD).**

```
PO line:   qty 3, unit price 10.000, line discount 1.000 (amount)
netUnitCost = 10.000 − 1.000/3           = 9.666667   (discount-allocation.ts:60-62, 6dp)
GRN line:  received 3 @ 9.666667
Partial bill of 1 unit; supplier's invoice states the 3dp price 9.667

accrualCleared = round6(9.666667 × 1) − round6(9.666667 × 0) = 9.666667   (grn-accrual-clearing.ts:92-94)
billedNet      = 9.667000
priceVariance  = 9.667000 − 9.666667 = 0.000333        (purchase-invoices.service.ts:2929)

Legs emitted (6dp, balanced):     DR 2121 9.666667 · DR 5210 0.000333 · CR 2111 9.667000
Legs after 3dp rounding:          DR 2121 9.667    · DR 5210 0.000    · CR 2111 9.667
                                                      ^^^^^^^^^^^^^ zero leg → BadRequestException
```

**Consequence.** `PurchaseInvoicesService.confirm` has already committed the bill row and the
`grn_lines.billed_qty` increment inside its own transaction; the JE is posted by the async
outbox listener. The listener throws a non-retryable `BadRequestException` → dead-letter. The
result is a **confirmed bill with zero GL**: not in AP 2111, not in the aging report (which is
GL-derived, `supplier-ap-balance.service.ts:1-8`), not in the trial balance — while
`grn_lines.billed_qty` has already been consumed so the receipt can never be re-billed.

**Reachability rating.** The web `MoneyInput` clamps typed amounts to the currency's decimals
(`erp/apps/web/src/components/money-input.tsx:90,107`), so a user cannot *type* a sub-fils figure.
But `netUnitCost` **manufactures** one from a perfectly ordinary discount, and `moneySchema`
(`erp/apps/api/src/common/money.schema.ts:33`) accepts 6dp on every API/import path. Any purchase
discount that does not divide evenly by quantity, plus a supplier invoice priced at 3dp, reaches it.

**No second implementation escapes it** — `postDirect` is the single chokepoint for every purchase
posting (grn, pinv, prn, pay, lc, srr), so the same failure class exists on **every** purchase
document type, not just bills.

**Fix (two parts, both needed).**
- Resolve the FX-rounding plug account unconditionally (or whenever any leg is not already at
  functional precision), not only on `hasForeignLeg`. There is nothing FX-specific about a
  per-leg currency-rounding residual.
- Drop legs that round to zero *before* the XOR check, and roll their value into the residual
  so the plug absorbs it — a zero-amount leg is not a data error, it is a rounding outcome.

---

# HIGH

## HIGH-1 — CONFIRMED. Document money is stored at 6dp with no currency-precision rounding, so `purchase_invoices.total` / `.balance` can hold amounts the GL can never carry. The aging view and the balance-of-record diverge by construction.

`purchase_invoices.total`, `.balance`, `grn_lines.line_total`, `purchase_return_lines.line_total`
are all `numeric(19,6)` with **no** round-to-currency-decimals step anywhere between the totals
recompute and persistence (`grns-totals.ts`, `purchase-invoices.service.ts`). The GL rounds to 3dp
(CRITICAL-2, step 3). Continuing the CRITICAL-2 example, a bill total of `29.000001` posts
`29.000` to 2111 and stores `29.000001` on the bill. A payment of the GL-correct `29.000` then
leaves `balance = 0.000001` — a bill that is fully settled in the ledger but **never leaves the
aging view**, because `SupplierApBalanceService` explicitly keeps "an aging-view balance derived
from confirmed bill balances" alongside the GL balance of record
(`erp/apps/api/src/suppliers/supplier-ap-balance.service.ts:69-71`).

**Fix.** Round document totals to `getCurrencyDecimals(currency)` at persistence, so the document
layer and the ledger layer can never disagree. (Do NOT round the *line* figures — round the
totals and settle the remainder onto the largest line, the same discipline
`largestRemainder` already applies to landed cost.)

## HIGH-2 — CONFIRMED (live). AP balance-of-record (GL 2111) and the sum of stored bill balances differ by the landed-cost payable, which has no bill behind it.

```
Σ purchase_invoices.balance (confirmed)  = 1,346,117.088
GL 2111 party-tagged balance             = 1,346,127.093
difference                               =        10.005   = landed cost LC-00001, credit_account_type='payable'
```

Per the AP-subledger rule, **the GL is authoritative and the aging is the incomplete view** — so
this is not a wrong number, it is a *missing* one. But a `landed_costs` component with
`creditAccountType = 'payable'` creates a real, supplier-tagged AP obligation
(`purchase-accounting.listener.ts` landed-cost handler → live JRN-00025: `DR 1141 10.005 /
CR 2111 10.005`) that will **never** appear in any aging bucket, because every bucketing query
walks `purchase_invoices`. A freight forwarder's 10.005 KWD sits in the payables balance with no
due date, no aging bucket, and nothing for a payment to allocate against.

**Fix.** Either bucket the landed-cost payable directly off the party-tagged 2111 lines
(they already carry `sourceDocumentDate`/`dueDate` support), or forbid `payable` landed-cost
components without a backing bill.

## HIGH-3 — SUSPECTED. `landed_cost_allocations_allocated_amount_positive_check` is `> 0` while the allocator legitimately produces `0.000000`. The service's zero-skip is correct today but is load-bearing and undocumented as such.

`erp/packages/db/src/schema/purchase.ts:1767-1771` enforces `allocated_amount > 0`.
`allocateByValue` (`landed-costs-allocation.math.ts:145-151`) will hand back `0.000000` for a
zero-cost / tiny line. `LandedCostsService` skips those inserts
(`landed-costs.service.ts:530-533`) **after** summing them into `allocatedSum`
(line 505-507), so the Σ-equals-component invariant still holds and the pooled inventory payloads
still total the component amount. **I verified this is currently correct.** Flagged because a
future refactor that moves the sum after the filter (the obvious "simplification") silently
under-applies inventory against a full 1141 debit — precisely the break the file's own header
comment warns about. It deserves a pinned test, not just a comment.

---

# MEDIUM

## MEDIUM-1 — CONFIRMED (live), design-deliberate but materially distorting. Purchase returns relieve inventory at company-wide pool WAC, dumping the whole cost difference into Purchase Price Variance 5210.

Live JRN-00031: returning 2 units received at 5.500 relieved 1141 by **30.777** (pool WAC
15.388528) and booked **19.777 to 5210** — a variance of 180% of the 11.000 return value, on a
return of goods received days earlier at a known cost.

```
item_cost_pools: on_hand 34.000000  total_value 523.209944  average_cost 15.388528  last_cost 5.500000
```

The pool is company-wide per (item, legal entity) — correct per spec, not a branch leak — and is
blended with higher-cost opening-balance stock. But relieving a *supplier return* at blended WAC
rather than at the receipt cost makes 5210 a dumping ground: after Gulf's opening import, the
first return of any imported SKU will book a large fictitious "price variance". The behaviour is
pinned by `erp/apps/api/src/inventory/purchase-return-wac.regression.spec.ts`, so it is a
deliberate choice, not an accident — but it was chosen before an opening-balance-heavy tenant
existed. Worth a founder decision: relieve at the source GRN line's capitalised cost when the
return is GRN-sourced (which it always is on the UI path), falling back to WAC only for
bill-sourced returns.

## MEDIUM-2 — CONFIRMED. Stacked GRN cost corrections leave a bounded micro-residue in GR/IR 2121, acknowledged in-code but not surfaced anywhere.

`erp/apps/api/src/purchase/grn/grn-accrual-clearing.ts:57-64` documents that with stacked
corrections or returned units the accrual holds `net + Σ round6(Δᵢ × qtyᵢ)` while full billing
clears `round6(finalUnit × billedQty)`, and `Σ round6(·) ≠ round6(Σ ·)` — up to 1e-6 per extra
correction stranded in 2121. It is marked `// ponytail:` with an upgrade trigger. Correct
engineering, but there is **no monitor**: a tenant that stacks corrections accumulates 2121
residue that nothing reports. Add it to the existing sub-ledger reconciliation surface.

---

# LOW

## LOW-1 — CONFIRMED. `DPU` is passed to `reserveOrSeedNumber` but is absent from shared `DOCUMENT_TYPES`.

`erp/apps/api/src/purchase/direct/direct-purchase.service.ts:135`. Already recorded in the codemap
as a known latent sibling of the `srr` enum incident; it works only because the pg enum happens to
contain `dpu` (verified live: `dpu` IS present in `document_type`). The
`document-type-enum-parity.spec.ts` guard checks source→enum, not source→`DOCUMENT_TYPES`, so this
one slips through. Add the reverse assertion.

---

# What I verified as CORRECT (with proof)

| # | Claim | Proof |
|---|---|---|
| 1 | **Every journal entry in the live tenant balances**, and every header total matches its lines. | `SELECT ... GROUP BY je.id HAVING je.total_debit <> sum(l.debit) OR je.total_credit <> sum(l.credit) OR sum(l.debit) <> sum(l.credit)` → **0 rows** across all 777 lines. |
| 2 | **No float/integer money columns anywhere.** | `information_schema.columns WHERE data_type IN ('double precision','real','integer','bigint') AND column_name ~ 'amount\|total\|cost\|price\|balance\|value\|paid\|tax'` → only `import_jobs.total_rows` and Postgres catalog views. All money is `numeric(19,6)`. |
| 3 | **The inventory sub-ledger ties to GL 1141 to well inside a fils.** | `Σ item_cost_pools.total_value = 9,490,034.015944` vs `Σ(debit−credit) on 1141 = 9,490,034.016000`. Δ = **0.000056**, i.e. 0.0000006 KWD per pool across 5,003 pools; both round to the same 3dp figure. |
| 4 | **Landed-cost allocation sums exactly to the component amount** and the invariant is enforced twice (allocator + service). | `largestRemainder` (`landed-costs-allocation.math.ts:70-131`) with a genuinely **signed** remainder: adds units to the largest fractional parts when positive, and removes from the smallest *positive-valued* parts when negative (line 106-128) — the zero-weight-line guard is real, not decorative. Independently re-checked in the service at `landed-costs.service.ts:518-529` with a fail-loud 422. `allocateManual` (line 250-280) pushes caller amounts through the *same* helper rather than merely tolerating a ±1 micro-unit, so it cannot under-apply. Live: LC-00001, component 10.005 → allocation 10.005, exact at 3dp. |
| 5 | **GR/IR clearing telescopes and cannot strand a micro-unit under partial billing.** | `accrualClearedForSlice` (`grn-accrual-clearing.ts:92-94`) computes each slice as the difference of two cumulative rounded totals, so Σ slices = `round6(unit × receivedQty)` unconditionally. The same helper is used by both `applyGrnMatching` and `reverseGrnMatching` — **I checked for the second implementation and there is exactly one.** Live: 2121 from purchase activity is 0 for both GRNs' billing (`55.000` credited then `55.000` debited; `7.515` then `7.515`); the only non-zero purchase residue is the 11.000 of CRITICAL-1, which is a wrong-account defect, not a rounding one. |
| 6 | **The tax-recoverability predicate is unified across GRN / bill / return emitters** and is the conservative half. | `isRecoverableTaxCategory()` in `erp/apps/api/src/purchase/ex-tax.ts` is a single positive test for `"standard"`; a new/unknown category capitalises into inventory rather than over-claiming input tax. Kuwait has no VAT so every purchase leg here is byte-identical to the ex-tax basis (`nonRecoverableTaxAmount = 0` on all live rows). |
| 7 | **Period control is enforced on every purchase posting path**, in the app *and* in the database. | `validatePeriod` + hard-lock rejection + soft-lock override authorisation at: GRN confirm/void (`grns.confirm.ts:131,330`, `grns.void-posting.ts:65`), bill confirm/void/amend (`purchase-invoices.service.ts:1538,1845,2018`), returns confirm/createAndConfirm/void (`purchase-returns.service.ts:951,1214`), payments ×5 (`supplier-payments.service.ts:659,1033,1276,1536,1775`), landed cost post/reverse (`landed-costs.service.ts:349,723`), refunds (`supplier-refund-receipts.service.ts:643`), direct purchase + amend (`direct-purchase.service.ts:979`, `direct-purchase-amend.adapter.ts:246,369`). Backstopped by the DB trigger `trg_prevent_hard_locked_period` on `journal_entries`. Backdating past the earliest open period is rejected at `journal-posting.service.ts:445-450`. |
| 8 | **The ledger is immutable-append at the database level.** | Live triggers on `journal_entries` / `journal_entry_lines`: `trg_journal_entries_immutable`, `trg_journal_entry_lines_immutable`, `trg_jel_totals_match_deferred` (deferred header/line total consistency), `jel_party_on_subledger_control_trg` (party-tag contract on control accounts), plus `trg_sync_jel_{insert,update,delete}`. Reversals are new JEs (`reversalOfEntryId` column), never mutations. |
| 9 | **AP is derived from the party-tagged GL control account, not from denormalized bill balances.** | `supplier-ap-balance.service.ts:1-8` header states it explicitly and the query filters `journalEntryLines.partyId` on the 2111 control account (line 158-165). Live: all 301 lines on 2111 carry `party_type = 'supplier'` — **zero untagged control lines**, which is the invariant the `jel_party_on_subledger_control_trg` trigger exists to guarantee. HIGH-2 is about a *gap in the aging view*, not about the balance of record. |
| 10 | **Balance validation exists at both layers and neither can be bypassed.** | `buildJePayload` (`build-je-payload.ts:165-173`) rejects an unbalanced payload at 6dp before emission; `postDirect` (`journal-posting.service.ts:889-953`) re-validates in **both** transaction and functional currency, over the final legs, inside the transaction, and also enforces ≥2 lines, debit-XOR-credit, non-negative amounts, and account existence/active/leaf/same-legal-entity. |
| 11 | **Reversals are true net-zero contras and idempotent.** | Confirm/void pairs share one split computation (`buildReturnApSplit` feeds both `handleReturnConfirmed` and `handleReturnVoided`), and the bill void re-derives its 2121 basis through the *same* `accrualClearedForSlice` with `billedQty − billQty`, so a confirm/void pair nets to exactly zero. Idempotency is keyed on `eventId` (JE) and the stock-ledger `eventId` (inventory), with the transactional outbox re-fanning on crash (`landed-costs.service.ts:600-618`). |
| 12 | **KWD 3dp survives the storage and allocation layers intact.** | All purchase money columns are `numeric(19,6)` (3 more digits than KWD needs); `MONEY_SCALE = 6` throughout the allocator and the WAC engine; `round6` uses `ROUND_HALF_EVEN` (`cost-pool.ts`, `wac-engine.service.ts:29`). Live 3dp values (`10.005`, `7.515`, `2.505`) are stored and posted exactly. **The 3dp loss risk is not in storage — it is in the *GL leg rounding* described in CRITICAL-2 / HIGH-1.** |
| 13 | **Cost pools are company-wide per (item, legal entity), as specified** — and `nextPoolState` handles all three on-hand regimes deliberately. | `cost-pool.ts:160-215`: `postOnHand > 0` re-derives the average; `== 0` zeroes value and records the discard with a `flatten` origin (preserving the average, except the P2-M1 stale-average case); `< 0` preserves the average rather than dividing by a negative quantity. Value is **additive from GL figures** and the average is **re-derived, never the driver** — which is why finding #3's tie-out holds. Discards are recorded durably in `cost_pool_value_discards`, never silent. |

---

# Path-divergence check (the signature defect class)

| Invariant | Order path (PO→GRN→bill→pay) | Direct path (direct purchase / direct bill) | Verdict |
|---|---|---|---|
| Period gate on post | ✅ `grns.confirm.ts:131`, `purchase-invoices.service.ts:1538` | ✅ `direct-purchase.service.ts:979` | Parity |
| Period gate on void/amend | ✅ `grns.void-posting.ts:65`, `purchase-invoices.service.ts:2018` | ✅ `direct-purchase-amend.adapter.ts:246,369` | Parity |
| GR/IR telescoping clearing | ✅ shared helper | ✅ same helper (direct purchase creates a real GRN + bill) | Parity |
| Ex-tax / capitalised cost basis | ✅ `ex-tax.ts` | ✅ same module | Parity |
| Return AP-vs-accrual split | ❌ broken (CRITICAL-1) | ❌ **broken and worse** — `hasSupplierInvoice: false` is hardcoded at `direct-purchase.service.ts:534`, so *every* direct purchase is permanently mis-classified | **Divergent in severity, not in presence** |
| Sub-fils leg rejection | ❌ (CRITICAL-2) | ❌ same chokepoint | Parity (both broken) |
| Over-return guard ignores `billed_qty` | ❌ | ❌ | Parity (both broken) |

The one genuine *divergence* is that the direct path can never produce a correctly-classified
GRN for return purposes, because it never sets `hasSupplierInvoice = true` even though it creates
the bill in the same call.

---

# What I could NOT verify

- **Refund receipts (`srr`)** — zero live rows. Migrations 0269-0272 have never been exercised
  against this database by a human (the hardening log flags this too). Code-reviewed only.
- **Multi-component / multi-GRN landed cost** — the single live landed cost has one component and
  one allocation, so the largest-remainder path was verified by reading and by its own spec, not
  against live rows.
- **Purchase returns with tax** — Kuwait has no VAT; every live `tax_amount` and
  `non_recoverable_tax_amount` is `0.000000`. The RC / non-recoverable / disclosure-offset legs in
  `handleReturnConfirmed` are code-reviewed only.
- **Stacked GRN cost corrections** (MEDIUM-2) — no live `grn_cost_corrections` rows.
- **Multi-currency** — out of scope by founder ruling; nothing here depends on it, and the two
  CRITICALs are **KWD-only, rate = 1** failures.

---

# Verdict

**BLOCK.** Two CRITICALs, one of which has already destroyed KWD 11.000 of real value in the
tenant under test, and the other of which can leave a confirmed bill with no ledger entry at all.

| Severity | # | Status |
|---|---|---|
| CRITICAL | 2 | both CONFIRMED (1 against live data, 1 against code with UI-reachable arithmetic) |
| HIGH | 3 | 2 CONFIRMED, 1 SUSPECTED (latent-regression risk) |
| MEDIUM | 2 | both CONFIRMED |
| LOW | 1 | CONFIRMED |
| Verified correct | 13 | each with SQL or file:line proof |

**Fix order:** CRITICAL-1 (data loss, live) → CRITICAL-2 (silent document/GL divergence) →
HIGH-1 (its root cause) → HIGH-2 → the rest.
