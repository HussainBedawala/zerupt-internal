# 09 — Foreign-currency Direct Purchase (quick purchase)

Date: 2026-08-30. Tenant: `gulf-auto-parts` (Kuwait, KWD 3dp functional, multi-currency ON, AED exposure).
Status: **shipped and verified live.** Ledger identity `0.000000` before and after.

---

## 1. What H1 was, and how it is handled

**H1 was a currency/rate pairing defect, not a rate-validation defect.**

Direct purchase pinned the document currency to the branch legal entity's functional
currency and had no way to state anything else. `purchase_invoices.total_fn` /
`balance_fn` are the functional-currency freeze of the bill, computed as
`total x exchange_rate`. So if a client-supplied `exchangeRate` of, say, `3.6` had been
honoured while the currency stayed KWD, the engine would have written
`total_fn = 250 KWD x 3.6 = 900` over an amount that was **already in the functional
currency**. Every reader that sums the AP sub-ledger in functional terms —
`SupplierApBalanceService`, the AP aging report, `purchase-invoices.service.ts`
`balanceFnExpr` — would have been inflated 3.6x, **behind a perfectly balanced GL and
with no error anywhere.** That is why the old DTO refused to even parse the field and
the service hard-wired `FUNCTIONAL_EXCHANGE_RATE = "1"` into the PO, the GRN, the bill
and the payment.

**How it is handled now: the pairing is ENFORCED rather than avoided.** The rate no
longer travels alone. `resolveStatedDocumentRate()` (already the purchase-order
contract, in `purchase-fx-guard.ts`) is the single arbiter:

- document currency **==** functional currency -> returns `null` (stored rate 1), and
  **rejects** any stated rate other than 1. This is the exact H1 shape, and it is now a
  loud 422 rather than a silently-stripped field.
- document currency **!=** functional currency -> requires multi-currency ENABLED and a
  **strictly positive** rate. Never defaults to parity.

The invariant that closes H1: **`exchange_rate != 1` is reachable if and only if
`currency != functionalCurrency`** — which is exactly the condition under which
`total x rate` is the correct functional amount. The rate is no longer a free-floating
multiplier over a functional-currency figure.

Verified live in both directions (section 5): the H1-shaped request is refused, and the
genuinely foreign one produces `total_fn = 21.750000` against `total = 250.000000 AED`
at rate `0.087` — arithmetic that is only meaningful because the currencies differ.

Secondary H1 guard kept: the DTO's rate schema still bounds the value at
`> 0`, `<= 10^8`, `<= 10dp` (matching `numeric(18,10)`), so a nonsense rate never reaches
the money path at all.

---

## 2. Backend changes

| File | Change |
|---|---|
| `apps/api/src/purchase/stated-exchange-rate.schema.ts` | **NEW.** `statedExchangeRateSchema` + `statedCurrencySchema`. ONE definition of the stated-currency wire contract, now shared by the PO DTO and the direct-purchase DTO. Previously the PO owned a private copy; a second copy in DP is how two money paths drift on their bounds. |
| `orders/purchase-orders.dto.ts` | Rewired to import the shared schemas. No behaviour change (byte-identical rules). |
| `direct/direct-purchase.dto.ts` | Added `currency` + `exchangeRate`. Replaced the stale "NOTE: no exchangeRate here / functional-currency-only" comment (an out-of-date comment that contradicts the code is its own defect) with the CURRENCY contract and a full statement of what H1 was and why the pairing rule closes it. Added `exchangeRate` to `DirectPurchaseDetailBase`. |
| `direct/direct-purchase.service.ts` | `resolveContext()` now takes the requested currency/rate and returns `{ currency (document), functionalCurrency, exchangeRate, ... }`. It calls `resolveStatedDocumentRate(...)` and gates `assertSupplierCurrencyMatches(...)` behind `!isExplicitForeignCurrency(...)` — mirroring `PurchaseOrdersService.create()` line for line. The four `exchangeRate: FUNCTIONAL_EXCHANGE_RATE` posting legs (hidden PO, GRN, `bills.fromGrn`, `payments.create`) now carry `ctx.exchangeRate`; the PO/GRN carry `ctx.currency`. `FUNCTIONAL_EXCHANGE_RATE` survives as the functional-path constant with the H1 history documented on it. |
| `direct/direct-purchase.service.ts` (payment leg) | `payments.create` now also passes `currency: ctx.currency`. **Without this a foreign quick purchase would have been unsettleable**: `SupplierPaymentsService.post()` refuses an allocation whose bill currency differs from the payment currency, so the "Paid now" branch would have 422'd mid-compose. |
| `direct/direct-purchase-detail.query.ts` | Selects and returns `purchase_invoices.exchange_rate`. |
| `direct/direct-purchase-noop.ts` | Added a currency + rate arm. A mis-keyed bank rate on a foreign purchase changes nothing else on the document, so without this the only remedy would have been reported as a no-op and **refused**, leaving the AP sub-ledger wrong permanently. Rate compared numerically (`"1"` == `"1.0000000000"`); an omitted currency/rate still reads as "the branch's own at 1". |
| `direct/direct-purchase-amend.adapter.ts` | **Real gap found and fixed.** The cancel-compensation restores the original payment and hard-coded `exchangeRate: "1"` with a comment asserting the path was functional-only. Against a foreign bill, `post()` would have refused the allocation and the compensation could not have put the cash back. Now restores at `ctx.original.currency` / `ctx.original.exchangeRate` (zero realized FX, which is right — it restores a payment that already happened). |

The DP amend/edit path re-parses the corrected payload through
`createDirectPurchaseSchema`, so currency and rate flow through it with no adapter change.

---

## 3. Downstream surfaces traced — one verdict each

| Surface | Verdict |
|---|---|
| **Inventory receipt / cost pools** | **ALREADY CORRECT, verified live.** `grns-events.ts` `toFunctional()` multiplies `grn.subtotal` and every line value by the GRN's frozen rate before the movement/valuation event. Live: cost pool `currency = KWD`, `last_cost = 2.175000` = `25.00 AED x 0.087` exactly. Valuation landed in FUNCTIONAL currency. |
| **COGS / average cost** | **ALREADY CORRECT (same mechanism).** WAC is fed from the functional-converted receipt value, so a foreign receipt raises average cost in KWD. Live: `average_cost 1.993529 = 33.889998 / 17`, arithmetically consistent with the +21.750000 KWD this purchase added. |
| **2121 GRN accrual raise/clear** | **ALREADY CORRECT.** The bill inherits the receipt's currency AND frozen rate through `resolveGrnBillCurrency()`, which refuses a rate that disagrees with the receipts — so 2121 is raised and cleared at one and the same rate and nets to exactly zero. Live: JRN-00109 CR 2121 21.750, JRN-00110 DR 2121 21.750. |
| **AP leg on party-tagged 2111 + due_date** | **ALREADY CORRECT, verified live.** `CR 2111 21.750000 KWD`, `party_type = supplier`, `party_id = ed3b67c5-...`. `due_date = 2026-09-29` = purchase date + the supplier's 30-day terms. `total_fn` / `balance_fn` = `21.750000`. |
| **Supplier payment (Paid now settlement)** | **FIXED (see table above).** Was a latent blocker; the voucher now carries the bill's currency and rate. |
| **Landed costs** | **FAILS LOUD, unchanged and correct.** `landed-costs.service.ts:938` calls `assertSupplierCurrencyMatches` on its derived-currency path. A landed cost against a foreign DP is refused rather than mis-valued. Identical to the existing behaviour against a foreign standalone bill — I did not widen this, deliberately (see section 7). |
| **Purchase returns** | **FAILS LOUD, unchanged and correct.** `purchase-returns.service.ts` calls `assertLinkedBillCurrencyMatches(bill.currency, returnCurrency, ...)`; a functional-currency return against a foreign bill is refused, because the AP decrement multiplies by the BILL's rate and would otherwise diverge the GL from the AP sub-ledger. |
| **Supplier refund receipts** | **FAILS LOUD, unchanged and correct.** `assertStoredCurrencyStillFunctional(returnDoc.currency, ctx.currency, ...)`. Reachable only via a return, which is already refused above. |
| **Printed document + money formatting** | **CORRECT, no change needed.** Every DP presentation surface already formats against `purchase.currency` (the DOCUMENT currency), not the tenant/UI currency — `direct-purchase-detail-panel.tsx`, `direct-purchase-cancel-dialog.tsx`, `direct-purchase-edit-panel.tsx` all pass `purchase.currency` into `formatMoneyWithSymbol`. Decimal count is derived from the currency, never hardcoded, so an AED (2dp) document prints 2dp inside a KWD (3dp) tenant. |
| **Approval threshold (M2)** | **DELIBERATELY UNCHANGED.** The gate fires on the confirmed bill total in the DOCUMENT's transaction currency — exactly what the PO path does with the order total. Converting only here would make the same purchase gate differently depending on which of the two routes recorded it. Comment updated to say so honestly instead of claiming "in functional currency". |
| **Tax engine** | `estimateDirectPurchaseBillTotal` now receives the DOCUMENT currency, so tax rounding follows the document's own precision. Kuwait is no-tax so this is inert for the launch customer, but it is the correct scale for a GST/VAT market. |

---

## 4. Frontend changes

| File | Change |
|---|---|
| `features/purchase/api/purchase-api.ts` | `CreateDirectPurchasePayload` gains `currency?`. (`exchangeRate?` already existed as a vestigial field the server stripped; it is now live and documented.) |
| `features/purchase/types.ts` | `DirectPurchaseDetail` gains `exchangeRate`. |
| `components/direct/direct-purchase-form-types.ts` | `DirectPurchaseFormSeed` gains `currency?` / `exchangeRate?`; `toDirectPurchaseFormSeed()` populates them. **Without this an EDIT of a foreign purchase would have derived the branch's functional currency at rate 1 and silently re-booked an AED delivery as domestic KWD.** |
| `components/direct/direct-purchase-form-fields.tsx` | Currency + rate row, rendered **only** when `useCurrencyPolicyQuery().isMultiCurrencyEnabled`. Reuses the existing `CurrencyPicker` and the existing `ExchangeRateInput` (which already looks up the stored reference rate for base/quote/date and offers it as an editable prefill) — no second rate input was built. Money precision throughout the form now follows `documentCurrency`, not the branch functional currency, so switching the picker re-scales the on-screen unit costs (KWD 3dp -> AED 2dp). Client-side validity gate refuses a foreign purchase with a missing or non-positive rate, so the clerk is not allowed to fill a whole purchase and only then learn the rate was missing. |
| same | **Defaults over questions:** the currency pre-selects the supplier's `defaultCurrency` when they have one, falling back to the branch's own. The picker stays editable. |
| same | The old "this supplier usually trades in a different currency" warning now shows **only** to a single-currency tenant, where the combination genuinely cannot be saved. With multi-currency ON the picker has already solved it, so warning would be noise about a problem the form just fixed. Its copy was rewritten to say what to DO ("Turn on multi-currency in Currency settings ..."). |
| `messages/en/purchases.json`, `messages/ar/purchases.json` | `currency`, `currencyHint`, `exchangeRateHint`, `errors.exchangeRateRequired`, `errors.exchangeRateInvalid`, plus the reworded supplier hint. Plain language, no jargon, no raw IDs, no em dashes. `i18n:check` passes. |

---

## 5. Live verification — hand-derived first, then compared

Tenant `gulf-auto-parts`, branch Al Rai Main Showroom (KWD functional), multi-currency ON.

**Hand-derived, before any request was sent:**
- 10 units @ 25.00 AED = **250.000000 AED** subtotal. Kuwait is no-tax -> total 250.000000 AED.
- Rate 0.0870000000 KWD per AED (the tenant's own 2026-08-30 closing rate).
- `total_fn` = 250 x 0.087 = **21.750000 KWD**.
- Inventory 1141 debit = **21.750000 KWD**; GRN accrual 2121 credit = 21.750000; then 2121 debit / AP 2111 credit = 21.750000, party-tagged.
- Per-unit functional cost = 25.00 x 0.087 = **2.175000 KWD**.
- Supplier terms 30 days -> due date **2026-09-29**.

**Actual (`B1ALRAIMAINS-DPU-00004`, bill `PINV-00009`, receipt `GRN-00007`):**

| Check | Expected | Actual | |
|---|---|---|---|
| Bill currency / rate | AED / 0.0870000000 | AED / 0.0870000000 | match |
| Hidden PO currency / rate | AED / 0.087 | AED / 0.0870000000 | match |
| GRN currency / rate | AED / 0.087 | AED / 0.0870000000 | match |
| `total` (TC) | 250.000000 | 250.000000 | match |
| `total_fn` (FN) | 21.750000 | 21.750000 | match |
| `balance_fn` | 21.750000 | 21.750000 | match |
| `due_date` | 2026-09-29 | 2026-09-29 | match |
| JRN-00109 | DR 1141 21.750 / CR 2121 21.750 | same, balanced | match |
| JRN-00110 | DR 2121 21.750 / CR 2111 21.750, party-tagged supplier | same, `party_type=supplier`, `party_id=ed3b67c5-...` | match |
| Cost pool currency | KWD | KWD | match |
| Cost pool `last_cost` | 2.175000 | 2.175000 | match |
| Cost pool `average_cost` | 33.889998 / 17 | 1.993529 | match |

**Negative controls, all live:**

| Request | Result |
|---|---|
| `currency: AED`, no rate | 422 `FX_CURRENCY_MISMATCH` — "A AED quick purchase requires a positive exchange rate (KWD per AED). None was supplied." |
| `exchangeRate: "3.6"`, no currency (**the H1 shape**) | 422 `FX_CURRENCY_MISMATCH` — "A quick purchase in the branch's own KWD must be booked at exchange rate 1..." |
| `exchangeRate: "0"` / `"-1"` | 400 validation — "Must be > 0 and <= 100000000" |
| KWD-configured supplier + `currency: AED` | 422 `FX_CURRENCY_MISMATCH` from the shared supplier-currency guard (a supplier configured as KWD cannot be billed in AED — same rule the PO path applies) |
| Functional regression control (no currency, no rate) | Posted KWD at rate 1, `total_fn == total == 6.250000`, KWD 3dp intact |

**Ledger identity (status-aware, `posted` + `reversed`): `0.000000` before the first write and `0.000000` after the last.**

---

## 6. Tests

**Added**
- `direct/direct-purchase.dto.spec.ts` (**NEW**, 7 cases + parameterised): accepts neither field; accepts foreign + positive rate; normalises a numeric rate to a string; refuses `0`/`-1`/`-0.5`/`0.0`; refuses `> 10^8`; refuses `> 10dp`; refuses malformed currency codes.
- `direct-purchase.service.spec.ts` (6 new): H1 refusal of a rate against the branch's own currency (nothing posted); explicit restatement of the functional currency still books at 1; **functional-currency regression control** (no currency, no rate — PO/GRN/bill/payment all KWD at 1); foreign currency + rate frozen onto PO, GRN, bill AND payment; foreign supplier with NO stated currency still refused (the derived case); foreign currency with no rate refused; foreign currency on a single-currency tenant refused.
- `direct-purchase-noop.spec.ts` (4 new): changed currency is a correction; changed rate is a correction; `"1"` vs `"1.0000000000"` is unchanged; an omitted currency/rate is unchanged on a functional purchase.
- `__tests__/direct-purchase-form-fields-currency.test.tsx` (**NEW**, 5 cases): single-currency tenant sees no picker and no rate field at all; multi-currency tenant sees the picker defaulted to the branch currency with no rate field (domestic); currency defaults to the supplier's own; a seeded foreign purchase round-trips at its own currency and rate; a seeded functional purchase stays at 1 with no rate field.

**Changed existing assertions — classified, not blanket-updated**

| Assertion | Class | Why |
|---|---|---|
| `direct-purchase.service.spec.ts` — "H1: forces exchangeRate=1 and NEVER trusts a client-supplied rate" | **(b) asserted the old buggy-adjacent behaviour, rewritten** | It asserted the request was *silently accepted with the rate stripped*. Silently accepting a self-contradictory money instruction is the weaker posture. Rewritten to assert a **loud 422 with nothing posted**, and split so the "rate 1 everywhere" half survives as an explicit regression control. |
| `direct-purchase-noop.spec.ts` / `direct-purchase-amend.adapter.spec.ts` detail fixtures | **(a) stale in shape only** | `DirectPurchaseDetailBase` gained a required `exchangeRate`. Added `exchangeRate: "1"`, which is what those fixtures already meant. No assertion changed. |
| `direct-purchase-form-fields-seed.test.tsx` mock preamble | **(a) stale in shape only** | The suite renders without a `QueryClientProvider`, so the new `useCurrencyPolicyQuery` had to be stubbed. Stubbed as **single-currency**, keeping every existing assertion about seeded hydration untouched and the currency row invisible for them. |
| None | **(c) now meaningless** | No assertion was deleted. |

No snapshot was regenerated; none was involved.

**Results (narrow runs only, serial):**
- `npx jest direct-purchase --no-coverage` -> 14 suites, all pass.
- `npx jest "purchase-orders|purchase-fx-guard|purchase-import"` -> 21 suites / 386 tests pass (the PO path is unaffected by the shared-schema extraction).
- `npx vitest run direct-purchase` -> 14 files / 128 tests pass; `direct-purchase-form-fields-currency` -> 5 pass.
- `pnpm --filter @zerupt/web typecheck` clean; `pnpm --filter @zerupt/web i18n:check` clean.
- `pnpm --filter @zerupt/api typecheck` was **clean at 10:08** with every file of this change in it. A later run failed on `src/audit/audit-log.service.ts` and `src/audit/audit-durable-worker.service.spec.ts`, both modified at 10:19 by a concurrent session (my purchase files are stamped 10:00). Not mine, not touched.
- Pre-existing failures in `supplier-payments.service.spec.ts` and `debit-notes.service.spec.ts` **confirmed unrelated**: `git diff --stat` shows both service files carry another session's in-flight edits; I changed neither.

---

## 7. Deliberately NOT done

1. **Foreign-currency purchase returns / landed costs / supplier refunds against a foreign DP.** These remain refused by `assertLinkedBillCurrencyMatches` / `assertSupplierCurrencyMatches`. This is **not a regression I introduced** — it is exactly the state a foreign *standalone supplier bill* has been in all along, and those guards are load-bearing (a functional-currency return scales the AP decrement by the bill's rate and diverges the GL from the AP sub-ledger). Widening them is its own scoped money-path project with its own hand-derived FX cases; bolting it onto this change would have been the reckless half of the work.
2. **Converting the M2 approval threshold to functional currency.** It gates on the document total in TC, identically to the PO path. Diverging here would make the same purchase gate differently by route. Flagged, not changed.
3. **Splitting `direct-purchase-form-fields.tsx`.** It is now 942 lines, over the 800 ceiling — but it was already 835 before this change. Refactoring a form on the money path in the same pass as an FX change is how you get two bugs instead of one. **Follow-up: extract the settlement + header blocks.**
4. **Fixing the shared guard's message wording.** `assertSupplierCurrencyMatches` renders "a goods received note can only be booked in the branch's AED" when the document currency is foreign — AED is not the branch's currency. This is a **pre-existing copy defect reachable from the PO path too** (the guard does not receive the functional currency, only the document one). LOW severity, user-facing, on a string shared with the tested PO path. **Follow-up: pass the functional currency in and reword.**

## 8. Findings raised in passing

| Sev | Status | Finding |
|---|---|---|
| LOW | CONFIRMED | `assertSupplierCurrencyMatches` message calls the DOCUMENT currency "the branch's" when the document is foreign. Pre-existing, also reachable from the PO path. See 7.4. |
| OBSERVATION | CONFIRMED | The functional-currency control bill (`PINV-00010`) got `due_date = 2026-08-30` (same day) against supplier SUP-0001, whose `payment_term_days` is NULL. The AED bill against a supplier with `payment_term_days = 30` correctly got +30 days. Whether NULL terms should mean "due today" or the documented 30-day fallback is a separate question I did not chase; not caused by this change. |
