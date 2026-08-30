# Residual purchase money-domain items — 2026-08-30

Scope: PUR-018, PUR-017, PUR-019, PUR-020, PUR-021, PUR-001b, PUR-003, PUR-014.
Method: SQL against the live Gulf Auto Parts tenant first, then the code end to end. Every
claim is marked CONFIRMED (evidence I personally ran or read end to end) or SUSPECTED.

## Ledger identity (status-aware, per `_LEDGER-GATE.md`)

```
-- BEFORE first write
0.000000
-- AFTER last write
0.000000
```
All 24 fiscal periods OPEN at start and at end (`select status,count(*) from fiscal_periods` →
`open | 24`). **No document was created, voided, edited or deleted this session** — every change
is source code, tests, or message files. `_documents-created.md` unchanged.

---

## PUR-018 (HIGH) — landed cost credited to Trade Payables. CONFIRMED. ROOT CAUSE FIXED.

### The facts, established by SQL before anything else

```
select id,number,status,total_amount from landed_costs;
 99718bde… | B1ALRAIMAINS-LC-00001 | posted | 10.005000

select description,amount,credit_account_type,credit_entity_id from landed_cost_components;
 ZZTEST Freight | 10.005000 | payable | 9151cc3f-785c-47d5-85fb-7736cf91f97c

-- the JE it produced, still standing today, never reversed:
 B1ALRAIMAINS-JRN-00025 | posted | lc | 1141 Merchandise Inventory | DR 10.005000
 B1ALRAIMAINS-JRN-00025 | posted | lc | 2111 Trade Payables       | CR 10.005000
                                        party_type=supplier  party_id=9151cc3f…  due_date=2026-08-27
 supplier 9151cc3f… = SUP-0001 "ZZTEST Auto Parts Supplier", status active
```

Independently re-derived today, without the aging report:

```
WITH unbilled_payable AS (
  SELECT COALESCE(SUM(l.credit - l.debit),0) FROM journal_entry_lines l
  JOIN journal_entries je ON je.id=l.journal_entry_id JOIN accounts a ON a.id=l.account_id
  WHERE l.party_type='supplier' AND l.party_id='9151cc3f…'
    AND a.is_control_account AND a.type='liability' AND je.status='posted'
    AND je.source_document_type NOT IN ('pinv','pay','prn','srr'))
→ 10.005000
```
**CONFIRMED: the KWD 10.005 still stands in this tenant's live books today.**

(Note: the original review's headline arithmetic — "Σ bill balances vs GL 2111 differ by exactly
10.005" — is now STALE. The aggregate today is `bills 1,346,380.088` vs `GL 1,346,139.843`, and the
per-supplier decomposition shows the difference is dominated by unrelated in-flight test documents
from other sessions. A fired tie-out tells you two numbers disagree, never which to trust: the
landed-cost credit was re-derived directly from the GL above, not from that tie-out.)

### Why it is unsettleable — three independent walls, all CONFIRMED by reading the code

1. **Payments only allocate to bills.** `allocationSchema` in `supplier-payments.dto.ts` keys every
   allocation on an `invoiceId`/`purchaseInvoiceId`; `createStandard` looks each one up in
   `purchase_invoices`. A landed cost has no such row.
2. **An advance does not touch 2111.** An advance posts `DR 1161 Supplier Prepayments / CR cash`;
   it only reaches 2111 when it is later *applied to a bill*.
3. **A manual journal entry is refused on 2111.** `JournalEntryDraftService.validateAccounts`
   throws `"Manual journal entries cannot post to control accounts…"`. Live schema confirms
   `2111 Trade Payables → is_control_account = t`.

So the product creates a supplier obligation that the product can never discharge.

### The accounting reasoning, and the decision

A freight forwarder's charge is a genuine liability, and the credit is genuine double entry. The
defect is not the amount — it is the **account**. 2111 is a party-subledger CONTROL account, and in
this product the AP subledger IS the party-tagged GL (per `project_ap_subledger_source_of_truth`).
Anything sitting in 2111 with a party tag therefore *is* the subledger, which is exactly why an
entry no settlement engine can see is a defect rather than a cosmetic one.

The correct treatment for *"a charge I have incurred but have not been billed for"* is an
**accrual**, not a payable. Live schema: `2122 Accrued Expenses → is_control_account = f`, so it is
clearable the normal way — a manual journal entry when the forwarder's real invoice arrives, or
that invoice's own bill. `bank` (paid at source) is settled by construction. Both are reachable
today; `payable` is the only one that is not.

**Decision: forbid `payable` on landed-cost components.** Not a band-aid — it removes the system's
ability to mint an obligation it cannot discharge, permanently.

Two alternatives were reasoned through and rejected:
- *Synthesise a `purchase_invoices` row.* `purchase_invoices` is structurally a **goods** bill —
  lines bound to GRN lines, `billed_qty` accounting, GR/IR clearing. A bill with no goods lines
  would corrupt that machinery and needs a second bill "kind". A large new document type for a case
  an accrual already models correctly.
- *Extend payment allocation to target GL open items.* Architecturally the right long-term answer
  and the one consistent with "AP derives from the GL", but it is a major feature (new allocation
  target, new aging bucketing source, amend/void sagas) and would still leave the landed cost with
  no terms or due date. **Recorded as the strategic follow-up, not attempted.**

### What changed

- **New** `apps/api/src/purchase/landed-costs/landed-cost-credit-type.ts` — one place holding
  `SETTLEABLE_CREDIT_ACCOUNT_TYPES = ["bank","accrual"]`, the plain-language rejection message, and
  `assertSettleableCreditAccountTypes()`, with the full reasoning in the header.
- `landed-costs.dto.ts` — the input enum is now the settleable set. Because `payable` is no longer
  in the type, `AddComponentInput`/`UpdateComponentInput` cannot even *name* it: **the type system
  is now the first guard.** The two obsolete "a payable must carry its vendor" refines were deleted.
- `landed-costs.service.ts` `post()` — `assertSettleableCreditAccountTypes(components)` runs against
  the **STORED** components, so a legacy draft saved before this rule cannot be posted into a
  stranded credit. Placed after `assertPayableVendorCurrencies` so a legacy FX-mismatched payable
  still gets the sharper FX message first.
- **The stored enum deliberately still allows `payable`** so LC-00001 and its reversal (which
  re-reads the stored type to post the exact contra) still unwind correctly. Only the input boundary
  and the posting gate reject.
- Frontend: `LANDED_COST_SELECTABLE_CREDIT_TYPES` added to `features/purchase/types.ts` and used by
  **both** landed-cost pickers — they previously each carried their own copy-pasted
  `CREDIT_TYPES = ["payable","bank","accrual"]` (one name, two bodies; both repointed). Defaults
  changed `payable → accrual` in both. The freight-vendor picker is retained on an accrual as
  *information* (never required — 2122 is not a party subledger) and stays required for `bank`.
- Copy: `form.tooltips.creditAccountType` rewritten en + ar to drop the payable option.
  `i18n:check` → "Translation check passed. All locales are in sync." No em dashes.

### Pin + deliberate break

`landed-costs.service.spec.ts`: new `post — PUR-019/PUR-018` blocks, plus the DTO-boundary block
rewritten. **Break:** commented out `assertSettleableCreditAccountTypes(components)` →
**5 failed / 75 passed**, the PUR-018 gate test failing on exactly that assertion. Restored →
**82 passed / 82**.

**Changed-assertion classification (explicit).** The removed assertions — "addComponentSchema
rejects payable without a vendor", "accepts payable with a valid vendor", "a PATCH may set payable
alone", four `post` "allows post" FX cases, and the default `makeComponent` fixture — were
**tests pinning deliberate behaviour that this change deliberately removes**. They are *not* stale
tests and *not* tests passing for the wrong reason; they correctly pinned the old rule. They are
superseded, and each is annotated in place with that classification. The four FX cases kept their
original intent (prove the FX guard does not over-block) by asserting the post now fails on the
PUR-018 gate and explicitly **not** on `FX_CURRENCY_MISMATCH`.

### Status of the stuck KWD 10.005 — READ THIS

**It is still stuck. I did not move it, and I wrote no correcting journal entry.**

A product path DOES exist: `LandedCostsService.reverse()` posts a true contra
(`DR 2111 10.005 / CR 1141 10.005`) and is reachable from the landed-cost detail screen. The full
recovery is therefore **reverse LC-00001, then re-raise the same charge with `creditAccountType:
'accrual'`** — the money leaves 2111 through the product, the inventory capitalisation is restored
identically, and the resulting 2122 balance is clearable by the accountant when the forwarder bills.

I stopped short of executing it because the briefing's hard prohibition is unambiguous
("NEVER void/delete/edit any pre-existing document") and LC-00001 pre-dates this session. Reversal
also requires a manager PIN with SoD (approver ≠ actor), which is a founder-level action, not an
agent one. **Recommend the founder run reverse + re-raise-as-accrual from the UI.** Until then the
new blast-radius warning below makes the balance visible instead of silent.

---

## PUR-017 (HIGH) — 6dp document totals vs 3dp GL. PARTLY WITHDRAWN, remaining hole FIXED.

### What I found, and where the original diagnosis is now stale

The originating claim was "no round-to-currency-decimals step anywhere between the totals recompute
and persistence". **That is CONFIRMED FALSE for every computed total today.** The tax engine IS the
currency-precision boundary and it already applies:

`packages/shared/src/pos-money/tax-engine.ts` bankers-rounds **every** figure it returns to `dp`:
`grandTotal: roundedGrandTotal.toFixed(dp)`, `netBeforeDiscount`, `netDiscount`, `totalTax`,
`taxableBase`. And `dp` is the currency's decimals, passed by **all six** purchase totals paths
(verified individually): `purchase-invoices-totals.ts:144`, `grns-totals.ts:117`,
`purchase-returns-totals.ts:128`, `purchase-orders-totals.ts:114`,
`purchase-orders.service.ts:751`, `direct-purchase-preflight-total.ts:47`. Header totals are
`sumDocumentTotals(engineLines)` = Σ of already-quantised line figures, so header == Σ lines exactly
and both are at currency precision.

Corroborated live:
```
select count(*) total_rows,
       count(*) filter (where total   <> round(total,3))   tot_unrounded,
       count(*) filter (where balance <> round(balance,3)) bal_unrounded,
       count(*) filter (where subtotal<> round(subtotal,3))sub_unrounded
from purchase_invoices;
 306 | 0 | 0 | 0
select count(*) filter (where line_total <> round(line_total,3)), count(*) from grn_lines;  → 0 | 8
```
**CONFIRMED: zero unquantised money on any purchase document in this tenant.** The "by construction"
divergence does not exist on the computed-totals path. `LEDGER_SCALE` (6) and `roundToCurrency`
were read and are unchanged — the ledger stores at scale 6 *after* quantising to currency dp, which
is correct and I did not touch it.

### The real remaining hole — CONFIRMED, and it is live-reachable

The engine only governs **computed** totals. Amounts a caller **states** bypass it entirely, and
`moneySchema` (`apps/api/src/common/money.schema.ts:33`) accepts **6 decimals**:

- `supplier-payments.service.ts` — allocation amounts, settlement discount and advance amount are
  taken straight through `new Decimal(...).toFixed(MONEY_SCALE)`. **No currency quantisation
  anywhere in the file** (grepped `currencyDecimals|bankersRound|toDecimalPlaces` → zero hits).
- `landed-costs.service.ts` — component amount and each manual allocation line, same.

So `POST /purchase/payments` with `allocatedAmount: "5.000001"` (legal at 6dp, KWD has 3) stores
`paid_amount = 5.000001` and drives `balance = payableTotal − paidAmount` off currency precision,
while the GL posts `5.000`. The bill is settled in the ledger and never leaves the aging view.
**That is exactly PUR-017's described failure, reachable through the API today.** The web
`MoneyInput` clamps, so only API and import callers reach it — which is precisely who should be told.

### Decision on where rounding must happen

- **Computed totals → round.** Already done, once, in the tax engine. Nothing to add.
- **Stated amounts → REJECT, never silently round.** Quietly changing the amount a user said they
  paid is both a money-correctness and a defensive-UX violation. Fail loud, in plain language.

**New** `apps/api/src/common/currency-precision.guard.ts` — `assertCurrencyPrecision(amount,
currency, label)` + `assertCurrencyPrecisionAll`. Message: *"Allocation amount (5.000001) has more
decimal places than KWD uses. KWD amounts can have at most 3 decimal places. Round the amount and
try again."* — says what to DO, names no internals.

Wired in at:
- `supplier-payments.service.ts` — ONE private `assertStatedAmountsPrecision()` called from **both**
  `createStandard` and the amend rebuild (`createStandardComposed`). Those two are near-identical
  bodies and a guard in only one of them is this programme's most common defect shape, so there is
  deliberately one body. Plus `assertCurrencyPrecision` on the advance amount.
- `landed-costs.service.ts` — `addComponent` and `updateComponent`, on the component amount and
  every manual allocation line.

### Pin + deliberate break

**New** `apps/api/src/common/currency-precision.guard.spec.ts`, 8 narrow cases including the exact
`5.000001` KWD residue shape, a trailing-zero case (`10.005000` is 3dp, not 6), and a
currency-sensitivity control (`1.005` legal in KWD, rejected in AED — proves it reads the currency,
not a constant). **Break:** replaced `const dp = currencyDecimals(currency)` with a hardcoded `6` →
**5 failed / 3 passed**. Restored → **8 passed / 8**.

---

## PUR-019 (HIGH, was SUSPECTED) — zero-skip is load-bearing. CONFIRMED, PINNED.

I re-derived the mechanism rather than trusting the description, and the original wording is
slightly off: "moving the sum after the filter" is numerically a no-op (adding zeros changes
nothing). There are in fact **two distinct load-bearing zero-skips**, and both are real:

1. **Validation loop** (`landed-costs.service.ts:516`, `if (amount.isZero()) continue;`) — skips the
   *received-units* check for a zero allocation. `allocateByValue` legitimately returns `0.000000`
   for a zero-value line, and such a line may well have received nothing. Remove the skip and a
   perfectly ordinary post is refused outright with "that line received no units".
2. **Insert loop** (`landed-costs.service.ts:537`) — skips the row entirely. Live schema:
   `landed_cost_allocations_allocated_amount_positive_check` is `> 0`, so removing the skip kills
   the post on the DB CHECK mid-transaction.

The invariant both protect: `allocatedSum` is accumulated over **all** results (zeros included),
**before** either skip, so it still equals the full component amount that stream 1 debits to 1141.

**Pin** (`landed-costs.service.spec.ts`, new `PUR-019 — zero-amount allocation handling`): two GRN
lines, one received and one zero-value/zero-received, with a manual component allocating
`500.000000 / 0.000000`. Asserts (a) the post succeeds, (b) no `insert().values()` ever carries a
zero `allocatedAmount`, (c) the zero line never reaches the table, (d) Σ of what WAS inserted is
exactly `500.000000`.

**Deliberate break — run twice, independently, as instructed:**
- Removed skip #1 → **2 failed / 80 passed** (both PUR-019 tests).
- Restored; removed skip #2 → **1 failed / 81 passed** (the insert test, precisely).
- Restored both → **82 passed / 82.**

---

## PUR-020 (MED) — return at WAC vs GRN receipt cost. REASONED, DECIDED, DELIBERATELY NOT CHANGED.

### The reasoning

Two defensible positions, and the tie-break matters:

*For WAC:* under perpetual weighted average, every outflow relieves at WAC by definition. WAC has
no layers — the receipt's identity was destroyed the moment it was averaged in — so relieving one
outflow at a specific cost while every sale relieves at WAC makes the pool internally inconsistent
and lets repeated buy-high/return-low cycles drain value out of it. PUR-023's already-shipped fix
pushed deliberately *toward* pool consistency.

*For GRN cost, and this is the decisive point:* **a return to a vendor is not a consumption, it is
the reversal of an acquisition.** WAC governs issues (sales/COGS). It does not govern un-doing a
purchase. Mainstream treatment (and IAS 2's cost-of-purchase framing) is that a vendor return
reduces *purchases* at the price actually paid and the average is then recomputed from the remaining
balance. Relieving it at WAC systematically corrupts the average for every subsequent unit, and it
mislabels the difference: live `JRN-00031` booked **19.777 to PPV 5210** on an 11.000 return.
5210 means "we were billed a different price than we accrued" — nothing about the price varied here.
The company did not incur a 19.777 expense.

**Decision: returning at the source GRN line's capitalised receipt cost is correct for this
product**, with WAC as the fallback only where no source receipt is identifiable.

### Why I stopped short of implementing it — deliberate

Making that change safely requires, in one coherent move: (a) the return confirm path, (b) the
return **void** contra, or the confirm/void pair stops netting to zero, (c) the `item_cost_pools`
recomputation, and (d) reconciling with PUR-023's shipped fix, which made void re-receive and the
GL agree *at average cost*. I could establish the correct treatment; I could **not** establish the
full blast radius of the implementation within this pass on a live book. Per the task's own
instruction, that is a stop-and-report, not a guess.

**I did NOT touch `inventory/purchase-return-wac.regression.spec.ts`.** A spec pinning the current
behaviour is correct *while that behaviour stands*; editing it before the behaviour changes would
leave the codebase pinning nothing. Classification, stated explicitly as required: that spec is
**currently correct and deliberate, and becomes stale only at the moment the treatment changes** —
it is not one of this programme's 12+ stale specs and it is not passing for the wrong reason.

---

## PUR-021 (MED) — unmonitored GR/IR 2121 micro-residue. NOT FIXED. Reported precisely.

CONFIRMED the residue and its bound by reading `grn/grn-accrual-clearing.ts:40-70` end to end: with
stacked corrections or returned units the accrual holds `net + Σ round6(Δᵢ × qtyᵢ)` while full
billing clears `round6(finalUnit × billedQty)`, and `Σ round6(·) ≠ round6(Σ ·)` — up to 1e-6 per
extra correction stranded in 2121. Marked `// ponytail:` with an upgrade trigger. No monitor exists.

**I did not ship one, and I deliberately did not ship a fake one.** The task's standard is that
bounded-and-known is acceptable only if something *detects* when it stops being bounded — a pure
function plus a unit test is not that; it is the comment again, in TypeScript.

What a real monitor needs, stated concretely so the next pass does not re-derive it:
- The residue is computable with **no GL read**: for each fully-billed GRN line,
  `residue = (net + Σᵢ round6(Δᵢ × accruedQtyᵢ)) − round6(finalUnit × billedQty)`, sourced from
  `grn_lines` plus the cost-correction history (`grn-cost-corrections.service.ts`).
- The established pattern to reuse is **already in this codebase**: `reports/ap-aging.service.ts`
  emits a *reconciling line + warning* when the GL and the subledger disagree
  (see its `REGRESSION: an UNTAGGED accrual surfaces as delta + reconciling line + warning` spec).
  A GR/IR surface of the same shape, with a threshold well above `n × 1e-6` and far below anything
  material, is a check that can actually fail.
- Estimated size: one query builder + one service + one DTO + spec. Real work, not a one-liner.

---

## PUR-001b (MED) — open PO and bill-less payable invisible to blast radius. CONFIRMED, FIXED.

CONFIRMED by reading `graph/queries/blast-radius.query.ts` end to end: `partyBlastRadius` looked
only at `sales_invoices`, `purchase_invoices` (both `status='confirmed' AND balance > 0`) and
sole-supplier edges. Neither an open PO nor the PUR-018 landed-cost payable was in scope at all.

Following the split the shared `common/location-deactivation-guard.ts` (shipped earlier today)
codifies — **HARD-BLOCK = money stranded / in flight, WARNING = operational** — both new cases are
WARNINGS:
- **Open PO** is operational. Hard-blocking would dead-end a user who cannot close the PO until the
  goods arrive.
- **Bill-less payable** *is* money owed, which would normally hard-block — but it is
  **unsettleable**, so hard-blocking would dead-end that supplier forever. It warns, loudly, and its
  message says what to DO: *"…is owed to this supplier from a charge with no bill behind it, so it
  does not appear in the aging report. Reverse the landed cost it came from and re-enter the charge
  as an accrual before continuing."*

The payable is derived from the **party-tagged GL** (`is_control_account AND type='liability'`,
`source_document_type NOT IN ('pinv','pay','prn','srr')`), never from denormalized bill balances —
consistent with the AP-subledger rule.

**The raw SQL was executed against real Postgres**, not just typechecked (this codebase has been
bitten by `alias()`-in-raw-`sql` and `= ANY(array)` traps that pass every mock):
```
open_pos | unbilled
       2 | 10.005000
```
for SUP-0001 — i.e. the new warning would have surfaced the exact stranded KWD 10.005 **and** two
open POs that the old blast radius reported as "Safe to remove."

**Pin + break:** `graph.service.spec.ts`, two new cases (warning-not-block for the PO; currency-
formatted `KWD 10.005` never raw 6dp, actionable copy, and `hardBlocks` empty for the payable).
Break — replaced both new conditions with `if (false)` → **2 failed / 20 passed**. Restored →
**22 passed / 22.**

---

## PUR-003 (MED, was SUSPECTED) — supplier code prefix. **WITHDRAWN.**

```
select count(*) filter (where code like 'SUPP-%'), count(*) filter (where code ~ '^SUP-'), count(*)
from suppliers;   →  500 | 4 | 504
```
`grep -rn "SUPP-" apps/api/src packages/db/src` → **zero hits**. The string exists nowhere in
application source; it came from an external seed/import fixture. The generator is internally
consistent: `CODE_PREFIX = "SUP-"` (`suppliers.service.ts:96`) and the next-number regex is
`^SUP-([0-9]+)$` (line 250) — which does **not** match `SUPP-0001` (a `P` where a digit must be), so
the 500 imported rows cannot interfere with auto-numbering either. CONFIRMED, checked deliberately.

**Decision: withdraw, no change.** Imported customer data legitimately keeps its own pre-existing
identity — that is a first-class product requirement for the migration wedge, not a defect. Real
onboarding will almost always bring supplier codes that predate Zerupt.

## PUR-014 (LOW) — raw `ApiError.message` reaching the user. Structural half ALREADY DONE.

The prior triage recommended building "ONE shared `toastApiError()` helper". **It already exists**:
`apps/web/src/lib/api-error-message.ts` → `apiErrorMessage(error, t, fallback)`, with `apiErrorCode`
/ `apiErrorValues`, a `t.has(code)` presence lookup (so a new translated code is a messages-file
change, no code change) and its own test file. So the boundary is built; the residual is migration —
in `features/purchase`: **44** raw `instanceof ApiError ? …message` sites vs **11** already using
the helper.

I did not do a 44-site mechanical migration blind, but I did answer the part that needed a decision:

**The verbatim `error.message` fallback is CORRECT and should stay.** Backend 4xx messages in this
codebase are deliberately written as user-facing sentences (e.g. *"Bill X is not confirmed; only
confirmed bills can be paid"*, and the new ones added today). Replacing them with a generic fallback
would destroy real, actionable information — that is the "papering over real bugs" risk the prior
triage correctly flagged. The right last-line defence is not to suppress the message but to ensure
**no backend throw site emits internals**, which is enforceable by a source-grep guard over
`BadRequestException`/`UnprocessableEntityException` messages (table/column names, stack fragments,
raw UUIDs) — a test, not a UI refactor. Scoped, not built here.

---

## Files changed

```
apps/api/src/purchase/landed-costs/landed-cost-credit-type.ts        (new)
apps/api/src/purchase/landed-costs/landed-costs.dto.ts
apps/api/src/purchase/landed-costs/landed-costs.service.ts
apps/api/src/purchase/landed-costs/landed-costs.service.spec.ts
apps/api/src/common/currency-precision.guard.ts                      (new)
apps/api/src/common/currency-precision.guard.spec.ts                 (new)
apps/api/src/purchase/payments/supplier-payments.service.ts
apps/api/src/graph/queries/blast-radius.query.ts
apps/api/src/graph/graph.service.ts
apps/api/src/graph/graph.service.spec.ts
apps/web/src/features/purchase/types.ts
apps/web/src/features/purchase/components/landed-costs/landed-cost-create-panel.tsx
apps/web/src/features/purchase/components/landed-costs/landed-cost-component-form-dialog.tsx
apps/web/messages/{en,ar}/purchases.json
```

## Verification

- `pnpm --filter @zerupt/api typecheck` — clean. `pnpm --filter @zerupt/web typecheck` — clean.
- `pnpm --filter @zerupt/api build` — clean (`nest build`, no errors). The 6 pre-existing
  `tax-config` / `supplier-export` build errors reported by the previous session are **gone** —
  the tree builds today.
- Freshness verified by grepping compiled `dist/` for NEW symbols (not mtime):
  `dist/purchase/landed-costs/landed-cost-credit-type.js` exists;
  `unbilled_payable` ×3 in `dist/graph/queries/blast-radius.query.js`;
  `assertCurrencyPrecision` ×5 in `dist/common/currency-precision.guard.js`.
- API restarted; `/api/v1/health` → 503 with `email_config` as the **only** failing check
  (`database: up`, `migration_drift: up, behindCount 0`, `queue: up`) — normal on dev.
- Narrow suites only, "Test Suites: N" confirmed non-zero each time:
  `landed-costs.service` 82/82 · `currency-precision.guard` 8/8 · `graph.service` 22/22.

## Pre-existing breakage found, NOT mine, NOT touched

`npx jest supplier-payments.service` → **1 failed / 128 passed**: *"realizes an FX GAIN when the USD
rate fell between booking and payment"* fails on an **extra `dueDate: null` key** in the emitted
allocation payload. `git diff` on that file shows ~105 insertions of in-flight `dueDate` work from a
**concurrent session** in this shared tree; my own edits there are ~15 lines and contain no
`dueDate`. Reported, not fixed — it is another agent's live work.

## Stopped short of, and exactly why

| Item | Stopped at | Why |
|---|---|---|
| PUR-018 — the stuck KWD 10.005 | Did not reverse LC-00001 | Briefing forbids voiding a pre-existing document; reversal needs a manager PIN with SoD. Product path documented; founder action. |
| PUR-018 — GL-open-item allocation | Not attempted | Architecturally right, but a major feature (new allocation target + aging source + sagas), not a defect fix. |
| PUR-020 | Reasoning + decision only | Correct treatment established; safe implementation blast radius (void contra, cost pools, PUR-023 interaction) not establishable in this pass. Regression spec deliberately left untouched. |
| PUR-021 | Precise spec for a real monitor | A pure function + unit test is not a monitor. Refused to ship a fake one. |
| PUR-014 | Policy decision only | Shared boundary already exists; residual is a 44-site migration plus a backend-message grep guard. |

## supplier-payments.service FX-gain dueDate test failure (2026-08-30)

**CLASSIFICATION: (a) GENUINELY OUTDATED TEST.** CONFIRMED.

**Symptom (CONFIRMED, reproduced):** `npx jest supplier-payments.service --no-coverage`
failed exactly one test — "realizes an FX GAIN when the USD rate fell between booking and
payment" — with the actual emitted `allocations[0]` carrying an extra `dueDate: null` versus
the test's exact-match expectation of `{ allocatedAmount, discountAmount, invoiceRate }` only.
All other fields (`fxGainLoss: "7.000000"`, `totalAmount`, `currency`, `functionalCurrency`)
were byte-identical between expected and received.

**Hand-derived FX gain vs code (CONFIRMED):** Bill booked at 3.67 AED/USD, paid at 3.60.
AP relieved = 100 USD × 3.67 = 367.00 AED. Cash paid = 100 USD × 3.60 = 360.00 AED.
Gain (AP relief exceeds cash paid) = 367.00 − 360.00 = **7.00 AED**, credit to 4820 realized
FX gain. Code emits `fxGainLoss: "7.000000"`. Match — the money is untouched by this change.

**Why (a) and not (b)/(c) — evidence:**
1. Read `apps/api/src/reports/ap-aging.service.ts` (CONFIRMED): the AP aging query groups GL
   rows by `(party, currency, journal_entry_lines.dueDate)` (line ~244,
   `GROUP BY ... journalEntryLines.dueDate`). The docblock's aging rationale in
   `supplier-payments-events.ts` is literally true of this codebase, not invented cover for a bug.
2. Traced the real payload sink, `apps/api/src/accounting-events/listeners/purchase-accounting.listener.ts`
   (CONFIRMED, read end to end lines 2360-2412): `groupPayableByRateAndDueDate` groups
   `payload.allocations` by `(invoiceRate, dueDate)` and stamps `dueDate` ONLY on the
   party-tagged AP control leg (`partyControlLeg(..., group.dueDate, ...)`, lineType `"payable"`).
   The realized-FX leg (`buildRealizedFxLeg`, 4820/7210) is built completely separately at
   line 2410 and never receives `dueDate` — an FX-gain/loss leg is not a party AP obligation,
   so it correctly carries none. This confirms edge case (3) in the task: `dueDate` does NOT
   leak onto the FX-realization leg itself; it only rides on the AP relief leg, which is where
   aging semantics apply.
3. Zod schema for the event (`purchase-accounting.listener.ts` line 267) declares
   `dueDate: z.string().regex(...).nullish()` — null and undefined are treated identically
   downstream, and `groupPayableByRateAndDueDate` itself does `a.dueDate ?? null` (line 657).
   So the emitter's choice to emit an explicit `dueDate: null` vs. omitting the key makes
   **zero behavioral difference** downstream — this rules out (c): there is no incorrect edge
   value here, `null` genuinely means "this bill has no due date," which is exactly this test
   fixture's bill (no `dueDate` field set in `makeBill()`).
4. The actual amounts (`fxGainLoss`, `totalAmount`, `allocatedAmount`, `invoiceRate`) are
   unchanged before/after — only a new field appeared. No regression in the FX math or in
   which GL accounts move.

**What I changed:** `apps/api/src/purchase/payments/supplier-payments.service.spec.ts` —
updated the FX-GAIN test's expected `allocations` array to include `dueDate: null`
(the settled bill in this fixture has no due date), with a comment explaining why this is a
wire-shape assertion, not a behavior change. Left the source (`supplier-payments.service.ts`,
`supplier-payments-events.ts`, the listener) untouched — no regression to fix.

**What pins it:** Added a new test, "threads the settled bill's own due date onto the
settlement allocation" (same describe block, `supplier-payments.service.spec.ts`), using a
bill fixture with `dueDate: "2026-04-15"` and asserting the emitted allocation carries that
exact due date. This is a positive-value pin — it would not have caught the original bug
report (an extra `null`), but it does catch loss of the actual threading (a bill's real due
date failing to propagate), which is the behavior the docblock and the AP-aging code
genuinely depend on.

**Deliberate-break result (CONFIRMED, reproduced twice):** First attempt broke the wrong
call site (`supplier-payments.service.ts` line 1509, the advance-unapply path — not exercised
by `post()`; all 130 tests still passed, correctly showing that edit was inert for this flow).
Traced the real code path for `post()` (non-composed) to line 925:
`settlementAllocations = lockedBills.map(...)`. Changed `dueDate: b.dueDate ?? null` to a
hardcoded `dueDate: null`. Re-ran the suite: the new pinning test failed exactly as expected —
expected `dueDate: "2026-04-15"`, received `dueDate: null` — with the FX-GAIN test unaffected
(bill in that fixture has no due date, so null was still "correct" there). Restored the
original line (`dueDate: b.dueDate ?? null`) and reconfirmed clean.

**Final suite state (CONFIRMED):**
```
Test Suites: 1 passed, 1 total
Tests:       130 passed, 130 total
```
(128 pre-existing + 1 fixed assertion + 1 new pinning test = 130.)

**tsc:** CONFIRMED clean — `npx tsc --noEmit` from `apps/api` produced no output (exit 0).

**Rebuild:** NOT performed. No production source line ended up changed (the one experimental
edit to `supplier-payments.service.ts` line 925 was reverted to its original text before
finishing); only the spec file changed. `git diff` on `supplier-payments.service.ts` after
restoration shows no `DELIBERATE-BREAK` marker and matches the pre-task diff.

**Ledger identity check:** CONFIRMED `0.000000` before and after (status-aware query, posted+reversed only). No DB writes were made — this was a source/test-only task.

**Files touched:**
- `/Users/hus3ain/Development/Zerupt/erp/apps/api/src/purchase/payments/supplier-payments.service.spec.ts`
  (assertion fix + new pinning test, in the `foreign-currency settlement` describe block)
