# Mira-Powered Mid-Year Opening Conversion

> Status: APPROVED — building · Module: Accounting + Onboarding · Owner: Hussain
> Date: 2026-06-11
>
> **Founder decisions (locked 2026-06-11):**
> 1. Balancing residual → **Opening Balance Equity 3900** (reuse engine, reclass at year-end).
> 2. Mode A default date → **today**.
> 3. Cross-run D → **jsonb-derived** from `summary.asOfDate` (no migration for MVP).
> 4. Multi-currency snapshots → **out of scope**; block foreign-currency lines.
> 5. Year-end OBE reclass → **manual** accountant journal + Mira to-do.
> 6. Transaction-history files → **advise** the user (no auto-route) for MVP.
> 7. **No Linear tickets** — tracked in this spec only.

## Overview

Let a customer who onboards mid-year (e.g. June 2026) upload "what they have
today" and have Mira book a correct opening as of a chosen **conversion date**
D, instead of forcing every opening to be dated the day before fiscal-year
start. The unavoidable balancing figure plugs to **Opening Balance Equity
(3900)** — the account the existing engine already uses — and is folded
transparently, never silently. Mode B (year-start + bring-forward) stays exactly
as built. **MVP = Mode A.**

## Grounding (verified against current code)

- `assertOpeningDate()` (`opening-balance-import.service.ts:968`,
  `opening-party-import.service.ts:939`) re-derives
  `dayBefore(earliest fiscalYear.startDate)` and throws `BadRequestException` on
  any mismatch. **This is the single gate to relax.**
- `OpeningBalanceService.postGlOpeningBalances()` (`opening-balance.service.ts:90`)
  **already** plugs `totalDebit − totalCredit` to OBE (3900), validates the
  period via `validatePeriodForOpening`, and rejects Soft/HardLocked. AR posts
  DR 1131 per-customer / CR 3900; AP posts CR 2111 per-supplier / DR 3900. **The
  posting primitives need almost no change** — they take `asOfDate` as input and
  post into whatever period covers it.
- `validatePeriodForOpening()` (`opening-balance.service.ts:74`) tries the exact
  date, falling back to the next day only on `NotFoundException`. For a mid-year
  D **inside** an open period the exact-date lookup succeeds — so a
  conversion-date opening posts into the period containing D with **no fallback
  needed**.
- `FiscalPeriodService.validatePeriod()` (`fiscal-period.service.ts:1073`)
  returns `status` (Open/SoftLocked/HardLocked), `isFuturePeriod`,
  `isBackdatedPastLock`, and treats a closed FY as HardLocked. **Reused directly
  for the new date guard.**
- `materializeFiscal()` creates one FY + 12 **open** monthly periods from the
  configured start month. A mid-year D lands in an open period by default.
- Web `SetupStep` (`setup-step.tsx:43`) has
  `LOCKED_DATE_KINDS = {balances, party}`. **This is where the date becomes
  editable for conversion mode.**
- The AR/AP no-double-post advisory-lock gate
  (`opening-party-import.service.ts:797` `assertControlAccountUnseeded`) checks
  the control balance **as of `asOfDate`**. A mid-year D changes the cutoff but
  the mechanism is unchanged and still correct.

---

## 1. Accounting Model

### Why a balancing account is unavoidable, and which one

A "today-only" snapshot gives the **closing position** of each account at D. It
does **not** give the year-start balances or the Jan→D transaction history. You
therefore **cannot reconstruct** the year-to-date income statement from a
snapshot — any attempt to "split" it into opening + YTD-activity is fabrication.
The double-entry truth: a snapshot of assets, liabilities, and known equity
rarely sums to zero; the residual is the net worth accumulated up to D that we
have no detailed history for, and it must land somewhere.

**DECISION: plug the residual to Opening Balance Equity (3900), not Retained
Earnings.** Reasons:

1. The engine **already** does this → zero new accounting machinery, inherits
   the tested path.
2. OBE is a **clearing/suspense equity account**, semantically "balances brought
   in from a prior system not yet attributed." It is meant to be temporary and
   visible. Retained Earnings is a *result* account — writing a plug into it
   hides a migration artifact inside a reported figure.
3. **How it nets out:** at year-end close, P&L rolls into Retained Earnings. The
   accountant separately reclassifies the OBE balance to Retained
   Earnings / capital with one manual journal once satisfied the migration is
   correct. Mira surfaces this as a to-do.

> The YTD P&L is **folded into the OBE/equity residual**, never reconstructed.
> Mira states this explicitly: *"Profit you earned Jan–Jun is already baked into
> the cash/stock/receivables you're bringing in. Zerupt records it as one equity
> figure, not a reconstructed income statement."*

### Mode A — Conversion-date opening (MVP)

User uploads a TB / AR / AP / stock snapshot as of conversion date D (any date
in an open period, ≤ today). System books each line as of D; residual → OBE 3900.

**A1. Partial trial balance:**

```
Date D (e.g. 2026-06-30), JE source = ob
  DR  1110 Cash                      2,000.000
  DR  1120 Bank                     18,000.000
  DR  1210 Inventory                40,000.000
  CR  2210 Bank Loan                          15,000.000
  CR  3900 Opening Balance Equity             45,000.000
                                    ─────────  ─────────
                                    60,000.000 60,000.000
```

Balances by construction: OBE absorbs `totalDebit − totalCredit`. This is exactly
current behaviour, only the date changed from `FY-start−1` to `D`.

**A2. AR opening** (control + sub-ledger per customer) — `postArOpeningBalances`
unchanged, dated D:

```
  DR 1131 Trade Receivables / customer A   3,000.000   (party-tagged, sourceDocumentDate = invoice date)
  DR 1131 Trade Receivables / customer B   1,500.000
  CR 3900 Opening Balance Equity                       4,500.000
```

Aging derives from each line's original `invoiceDate`/`dueDate`. Invoice dates
may pre-date D and even FY-start — fine; the *posting date* is D, only the aging
reference is the invoice date.

**A3. AP opening** — mirror of A2: CR 2111 per supplier, DR 3900.

**A4. Inventory opening** — DR 1210 with WAC/specific-ID cost layers dated D, CR
3900 (or folded into the TB residual if inventory is a TB line). Quantities + cost
layers seed as-of D so COGS from D-onward is correct.

**Cross-run consistency (critical):** all of GL + AR + AP + stock for one
conversion run must share the same D. If the TB carries the 1131/2111 control
rows, the per-party detail is rejected (existing `assertControlAccountUnseeded`
gate at D). User picks ONE of {control-in-TB} or {per-party detail} per control
account, exactly as today.

### Mode B — Year-start + bring-forward (unchanged)

Opening dated `FY-start − 1` (today's behaviour) **plus** the Jan→D transactions
entered/imported as normal documents. Fully reconstructs the period; the "correct
but expensive" option. **No code change** — we only stop *forcing* it.

---

## 2. Mira's Intelligence Layer

**Deterministic-first.** Mode detection and the balancing entry are pure rules;
the LLM is invoked **only** for ambiguous account/column classification (the
existing `AccountMappingService.resolve` → `usedLlm` is the sole LLM touchpoint;
we add none).

### Mode detection heuristics (deterministic)

Mira proposes a mode; user can override. Signals:

1. **Chosen date.** `D = FY-start − 1` → Mode B candidate. D strictly inside the
   FY and ≤ today → Mode A candidate.
2. **Snapshot vs history shape.** One row per account/party with a single
   balance column = snapshot → Mode A. Many rows per account with debit+credit
   movements + a date column spanning Jan→D = transaction history → Mode B (Mira
   routes to the normal document importers, not the opening importer).
3. **Date columns.** An `invoiceDate` that pre-dates D on AR/AP rows is expected
   in both modes (aging reference) — not a mode signal on its own.
4. **Residual magnitude** is a sanity flag, not a mode flag. A large OBE residual
   is normal for Mode A; Mira explains rather than blocks.

Default recommendation: **Mode A** for snapshot-shaped files (the wedge case).
Mira shows *why*.

### Balancing computation (deterministic)

Reuse `mapAndValidate`'s `residual = totalDebit − totalCredit` and the engine's
OBE plug. Mira's only new job is to **classify the residual** for the summary:
assets − liabilities − explicit-equity = net OBE, labelled "accumulated
equity & year-to-date profit brought forward."

### Pre-commit summary card

Extends `MiraOpeningImbalanceCallout` into a conversion summary shown before
apply:

- Conversion date D and the period it lands in (Open ✓).
- Per-section totals: assets DR, liabilities CR, AR, AP, inventory.
- The OBE figure, named in plain language, with the explicit statement that YTD
  P&L is folded in, not reconstructed.
- The year-end reclassification to-do.
- Approve / Edit-date / Switch-to-Mode-B actions. Approval required (mirrors the
  existing control-account confirm gate — OBE 3900 is already a
  `controlCodesTouched` entry whenever residual ≠ 0).

Plain Arabic/English headline, no jargon; journal detail behind a "show the
bookkeeping" disclosure.

---

## 3. Backend Changes

### 3.1 Relax the date gate (core change)

Replace the equality check in **both** `assertOpeningDate()` methods with
`assertConversionDate()` accepting either:

- **Mode B:** `D === dayBefore(earliest.startDate)` (unchanged path), OR
- **Mode A:** a conversion date validated by:
  1. `D` parses as `YYYY-MM-DD` and `D ≤ today` (no future dating).
  2. `validatePeriod(tenantId, legalEntityId, D)` resolves a period **and**
     status is `Open` (reject Soft/HardLocked; never silently unlock).
  3. `D` is not before the earliest open period (`isBackdatedPastLock === false`).
  4. **Cross-run consistency:** GL/AR/AP/stock runs of one conversion carry the
     **same D**. Enforce by persisting the first committed conversion D per
     `(tenant, entity)` and rejecting a divergent D until all runs agree.

Files: `opening-balance-import.service.ts`, `opening-party-import.service.ts`,
`opening-stock-import.service.ts`.

### 3.2 Balancing-account mechanism

**No change.** Already plugs OBE 3900; we only pass `asOfDate = D`. Confirm the
OBE confirm gate (`controlCodesTouched` includes 3900 when residual ≠ 0) fires
for Mode A — it does.

### 3.3 Period awareness

`validatePeriodForOpening` already posts into the period containing D (exact-date
hit). No change beyond the new pre-check that the period is Open. Add one
defensive re-run of `validatePeriod(D)` at apply time inside the advisory-locked
transaction (TOCTOU: period locked between upload and apply).

### 3.4 Schema / migration

Add typed `mode: "year-start" | "conversion"` and `conversionDate` to the run
summary (already `jsonb`) — **no DDL for the run**. MVP derives cross-run D from
existing committed runs' `summary.asOfDate`, so **MVP requires no migration**.
(DECISION: dedicated queryable column vs jsonb-derived.)

### 3.5 Idempotency & audit

Unchanged and inherited: content-fingerprint idempotency, CAS claim,
advisory-lock no-double-post, doc-number reservation, `OPENING_BALANCE_POSTED`
event, immutable JE. Conversion date captured in JE `postingDate` and run
`summary`, both audited.

### 3.6 File list

- `apps/api/src/opening-import/opening-balance-import.service.ts` — replace
  `assertOpeningDate` → `assertConversionDate`; thread `mode`.
- `apps/api/src/opening-import/opening-party-import.service.ts` — same.
- `apps/api/src/opening-import/opening-stock-import.service.ts` — align validator.
- NEW `apps/api/src/opening-import/conversion-date.validator.ts` — pure
  `assertConversionDate(deps)` shared by all three.
- `fiscal-period.service.ts` — no change (reuse `validatePeriod`).
- `opening-balance.service.ts` — no change.
- DTOs: add `mode`/`conversionDate` to `opening-balance-import.dto.ts`,
  `opening-party-import.dto.ts`.
- Tests: NEW `conversion-date.validator.spec.ts` (100% — financial), extend the
  three service specs.

---

## 4. Web Changes

### 4.1 Setup UX (`setup-step.tsx`)

- Remove `balances`/`party` from hard `LOCKED_DATE_KINDS`; replace with a **mode
  toggle**: "Convert as of a date" (Mode A, editable date, default = today) vs
  "Start of fiscal year" (Mode B, date locked, current behaviour).
- Mode A date input: `type=date`, `max={todayIso()}`, client mirror of the server
  period guard (warn if the date falls in a locked/closed period) — server is
  authoritative.
- When a file is already uploaded (party hand-off), pre-select Mode A with
  D = today and let the user adjust.

### 4.2 Mira summary card

- Extend `mira-opening-imbalance.tsx` into a `MiraConversionSummary` (or a
  `conversion` variant) rendering the OBE residual with the plain-language
  explanation, landing period, and year-end reclass to-do. Shown before apply.
- OBE confirmation reuses the existing control-confirm checkbox flow
  (`derive-confirm-set.ts`).

### 4.3 Wizard flow

- `opening-balances-wizard.tsx`, `opening-party-wizard.tsx`,
  `opening-stock-wizard.tsx`: thread `mode` + `conversionDate` setup → upload →
  validate → apply.
- `opening-import-api.ts` / `opening-import-types.ts`: add to upload payloads.
- Testid registry + page objects; i18n keys in `messages/{en,ar}/import.json`;
  run `i18n:check`.

---

## 5. Risks & Guardrails

| Risk | Prevention | Test |
|------|-----------|------|
| Double-posting a control account (TB + per-party at D) | Existing advisory-lock gate now evaluated at cutoff D | Race spec; AR-then-TB rejected |
| Imbalance (JE doesn't balance) | OBE plug makes ΣDR=ΣCR by construction; assert in posting | 100% unit: partial TB, asset-only, liability-only |
| Wrong / future conversion date | D ≤ today, period Open, `isBackdatedPastLock=false`; server re-validates at apply (TOCTOU) | Future D rejected; locked D rejected; period locked between upload+apply rejected |
| Locked-period collision | Reuse `validatePeriod` status; never auto-unlock | D in HardLocked → 409 with unlock guidance |
| Cross-run D divergence | Persist/derive conversion D per entity; reject divergent D | GL at D1 then AR at D2 rejected |
| Multi-currency | Out of scope MVP — base-currency only; Mira blocks foreign-currency snapshot lines | Non-functional currency line blocked |
| Reconciliation | Post-conversion GL TB + AR/AP aging + stock value tie to source snapshot totals | Reconciliation E2E |
| YTD P&L mis-expectation | Mira summary states P&L is folded into OBE; year-end reclass to-do | Snapshot/UX test of copy |

**Coverage:** new validator + posting branches = 100% (financial). Web
summary/wizard = 80%+. New E2E: mid-year conversion happy path + reconciliation
tie-out.

---

## 6. Phased Delivery + Linear Issues

### Epic: Mira-powered mid-year opening conversion

**Phase 1 — Mode A GL conversion (MVP, shippable alone)**
- Title: `relax opening-balance date gate to accept a valid mid-year conversion date`
- Module: Accounting · Labels: Backend, Database
- Scope: new `assertConversionDate` validator (date ≤ today, period Open, not
  backdated past lock, TOCTOU re-check); thread `mode`/`conversionDate`; wire into
  GL opening import. OBE plug reused.
- Acceptance: a TB snapshot at any in-year open date posts a balanced JE at D
  with residual → OBE 3900; future/locked/backdated dates rejected with clear
  messages; Mode B unchanged.
- Tests: `conversion-date.validator.spec.ts` 100%; GL import spec extended.

**Phase 2 — Web conversion setup + Mira summary (depends on P1)**
- Title: `add conversion-date mode toggle and Mira conversion summary to opening wizard`
- Module: Onboarding · Labels: Frontend, Design/UX
- Scope: mode toggle in `setup-step.tsx`; editable Mode-A date with client period
  warning; `MiraConversionSummary` with OBE plain-language explanation + year-end
  reclass to-do; thread mode through GL wizard; testids + i18n.
- Acceptance: user picks "convert as of today," sees Mira's summary, approves,
  posts; locked-period date warned client-side and rejected server-side.
- Tests: wizard hook + summary component specs; i18n parity.

**Phase 3 — AR/AP + inventory at conversion date (depends on P1)**
- Title: `support conversion-date opening for AR, AP, and inventory with cross-run consistency`
- Module: Accounting (AR/AP) + Inventory (stock) · Labels: Backend
- Scope: align party + stock importers to `assertConversionDate`; enforce single
  shared D across GL/AR/AP/stock per entity; control-account no-double-post at D.
- Acceptance: per-party AR/AP and stock seed at the same D as GL; divergent-D and
  double-post rejected; aging derives from original invoice dates.
- Tests: party/stock service specs 100%; race + cross-run divergence specs.

**Phase 4 — Reconciliation tie-out + E2E (depends on P2, P3)**
- Title: `mid-year conversion reconciliation gate and end-to-end journey`
- Module: Onboarding · Labels: Testing, Backend
- Scope: extend `sourceControlTotals` tie-out to assert imported snapshot totals
  == GL/AR/AP/stock balances at D; full Playwright mid-year onboarding journey.
- Acceptance: post-conversion trial balance and agings tie to the source
  snapshot; Pacific-Co-style reconciliation passes.
- Tests: reconciliation unit + E2E journey.

**Order:** P1 → (P2 ∥ P3) → P4. P1 alone delivers the wedge and is independently
mergeable.

---

## DECISIONS NEEDED (founder)

1. **OBE vs Retained Earnings for the plug** — spec recommends OBE 3900 (reuses
   tested engine, auditable, reclass at year-end). Confirm, or require an
   automatic RE split (more complex, not reconstructable).
2. **Default conversion date** — spec defaults Mode A to today. Some think in
   "end of last month." Confirm default.
3. **Dedicated `conversionDate` column vs jsonb-derived** — MVP derives from
   existing runs' `summary.asOfDate` (no migration). Confirm whether a queryable
   column is wanted now.
4. **Multi-currency snapshots** — spec keeps MVP base-currency only and blocks
   foreign-currency lines. Confirm acceptable for June 15.
5. **Year-end OBE reclass** — manual accountant journal + Mira to-do (spec) vs an
   automated reclass at first year-end close. Confirm manual for MVP.
6. **Mode B routing of transaction-history files** — when Mira detects Jan→D
   history rather than a snapshot, auto-route to the normal document importers or
   just advise? Spec assumes advise for MVP.
