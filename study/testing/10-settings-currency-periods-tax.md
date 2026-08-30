# Phase 10 — Settings: Currency, Fiscal Periods, Tax Configuration

Tenant: Gulf Auto Parts (Kuwait, KWD 3dp, LE `d67ece83-e21c-4ae4-ad46-c9356d7f0f06`).
Method: code read (end to end, service→DTO→UI) + SQL. **No browser pass performed** — see
Verification Gaps. Session ran under a shared-machine resource constraint from the
orchestrator (10 concurrent agents) received mid-task; remaining work was scoped down to
code+SQL only, no rebuild, no destructive live mutation on shared FX exposure.

**Scope note:** fiscal-period LOCK/UNLOCK/close-run mechanics and FX revaluation correctness
were already exhaustively covered by `study/testing/09-accounting-periods-closing.md` (F-01
through F-12, F-V1..F-V13) and `09-accounting-fx-multicurrency.md` (CRITICAL-1/2, both
already fixed with repair migrations). This phase does **not** repeat that work. It covers
the pieces genuinely unexamined there: the Settings-side currency whitelist/decimal-precision
CRUD (`tenant/currencies`, `tenant/currency-policy`), fiscal-year/period **generation**
config (`FiscalYearDialog`), and tax-configuration CRUD (`tenant/tax-codes`,
`tenant/tax-groups`) plus the tax-visibility derivation.

## Ledger identity gate

```sql
select round(sum(l.debit-l.credit),6) from journal_entry_lines l
  join journal_entries je on je.id=l.journal_entry_id
  where je.status in ('posted','reversed');
```
Before first action: `0.000000`. I made **no financial-document writes** this session (no
JEs, no opening balances, no period lock/unlock — that surface is owned by the concurrent
period-unlock agent per the orchestrator's note). After: unchanged, `0.000000`. No
correcting entry needed.

## Period state

Not touched. Per the orchestrator's live coordination note, another agent is actively
verifying period lock/unlock this session; I did not read or record a period-state snapshot
of my own to avoid racing that agent's baseline, and I made zero period-state-changing calls.
**I did not create, close, or reopen any fiscal period.** Nothing to restore, nothing to
verify here — deferred entirely to that agent's report.

## Documents created

None. Prefix `ZZTEST` was not needed — this phase reached CRITICAL/HIGH findings through
static code reading and a DB read query, not through creating test documents. Nothing added
to `_documents-created.md`.

---

## FINDINGS (ranked)

### C-01 · CRITICAL · CONFIRMED — Settings ▸ Currencies "Decimal Places" field is dead: the real money formatter never reads it

Path traced end to end:

- Schema/UI: `apps/web/src/features/currencies/components/currency-dialog.tsx` lets an owner
  set `decimalPlaces` (0-4) per currency, persisted via `PATCH /tenant/currencies/:id` →
  `CurrencyConfigService.updateTenantCurrency` → `tenant_currencies.decimal_places` column.
- Consumer: the canonical, mandated formatters (`formatMoneyAmount` /
  `formatMoneyWithSymbol`, `packages/shared/src/format/money-format.ts:53,74` — the ones
  CLAUDE.md says to **never hand-roll**) resolve precision through `moneyDecimals(currency)`
  → `getCurrencyDecimals(currency)` → **`packages/shared/src/pos-money/currency.ts:81-83`**:
  ```ts
  export function currencyDecimals(currencyCode: string): number {
    return CURRENCY_DECIMALS[currencyCode] ?? 2;
  }
  ```
  a **static, hardcoded, compile-time ISO-4217 lookup table**. It never queries
  `tenant_currencies`, never receives a `decimalPlaces` parameter, and has no tenant context
  at all.

Consequence: editing "Decimal Places" for any currency in Settings ▸ Currencies has **zero
effect** on every invoice, receipt, report, POS screen, and journal-entry line in the
product — the one place claiming to control it does not. It is the exact "no dead collected
fields" violation named in the founder's standard (a field with no consequence). Worse
direction: a currency **not** in the static `CURRENCY_DECIMALS` map (any currency an owner
adds that ISO doesn't cover, or a typo'd/less-common code) silently formats at **2dp**
regardless of what the admin configured, with no warning that the setting was ignored.

For Gulf Auto Parts specifically this is currently invisible because KWD/AED/SAR are all in
the static map at the correct precision (guarded by
`apps/api/src/common/currency-decimals-consistency.spec.ts`, which cross-checks the STATIC
map against the STATIC seed list — it proves internal consistency between two hardcoded
sources, not that either one is actually read from `tenant_currencies`). The bug is dormant
for this tenant's three currencies and live for any other.

**Fix shape:** either (a) delete the editable `decimalPlaces` field from the currency
create/edit UI and API and make it purely display metadata sourced from the same static map
the formatters use (removes the illusion of control), or (b) thread the tenant's
`tenant_currencies.decimal_places` through to `formatMoneyAmount`/`formatMoneyWithSymbol` as
the actual source of truth and delete `CURRENCY_DECIMALS` — the second is the one the product
spec (`05-currency-fiscal-periods.md`: "Precision: 0/2/3 ... Must match the decimalPlaces
defined in TenantCurrency") actually promises. Given the money-correctness standard in this
programme, (b) is the correct direction; (a) is the cheap stopgap.

Not a KWD-specific display bug today, which is why prior FX/accounting phases (which drove
plenty of KWD money through the formatters and never saw 2dp) never surfaced it — this is a
control-integrity bug, found by tracing the setting's actual consumer, not by watching a
screen render wrong.

---

### C-02 · HIGH · CONFIRMED — `PATCH /tenant/currencies/:id` has no "in use" guard on `decimalPlaces`, and the existing "in use" guard for deactivation is narrower than the spec promises

`CurrencyConfigService.updateTenantCurrency` (`apps/api/src/currency-config/currency-config.service.ts:270-324`):
- Changing `decimalPlaces`, `symbol`, `symbolPosition`, or `name` on **any** currency,
  including one that is a legal entity's functional currency and has thousands of posted GL
  lines (KWD here), goes straight to an `UPDATE` with **no reference check at all**. The
  reference guard (`assertCurrencyNotInUse`) only runs when `input.isActive === false`.
- Even that guard only checks two structural references — `legalEntities.functionalCurrency`
  and `branches.currencyCode`. It does **not** check whether the currency has ever appeared
  in a posted journal-entry line. Per the product spec
  (`05-currency-fiscal-periods.md`: "Cannot remove used currency — if a currency has been
  used in posted transactions, it can be deactivated but not deleted"), deactivation should
  at minimum be *possible but flagged*; here it is silently unconditional for a
  posted-but-unreferenced currency.
- Confirmed live in this tenant's DB: AED has posted, unrealized-FX-bearing journal lines
  (per `09-accounting-fx-multicurrency.md` — `1131 Trade Receivables` party-tagged customer
  balance in AED, 83.5/87.0/90.0 KWD equivalents across three sessions) but AED is **not**
  any legal entity's functional currency or any branch's currency
  (`select id,name,functional_currency,country_code from legal_entities;` → only KWD/Gulf
  Auto Parts). `assertCurrencyNotInUse('AED')` would find zero blockers and the currency
  could be deactivated today through the Settings screen while a real open FC exposure
  exists against it, or its `decimalPlaces`/`symbol` could be changed with no gate whatsoever.

**Not exercised live** — deliberately. AED currently carries a real, deliberately-preserved
FX-exposure artifact from the prior FX phase (see that report's "note for later agents") and
another agent is concurrently working period state on this same tenant; mutating AED's
config live risked colliding with that evidence and with the orchestrator's
resource-constraint instruction to avoid unnecessary live changes. Confirmed by code read of
both the guard function and its one call site, not assumed.

**Fix shape:** extend the reference guard to also run (a) on any field change, not just
`isActive:false`, gated at minimum on `decimalPlaces`/`symbolPosition` since those affect
historical display consistency, and (b) add a check against `journal_entry_lines.currency`
usage, not just the two structural references — the spec explicitly names posted-transaction
usage as the real blocker, and the code only implements the weaker structural half of it.

---

### C-03 · MEDIUM · SUSPECTED (spec drift, not exercised live) — Tax rate change has no manager-PIN gate; product spec requires one

`agent-os/product/modules/settings-admin/06-tax-configuration-controls.md` approval matrix:
"Change tax rate → `settings.tax.rate.change` + manager PIN". As-built
(`apps/api/src/tax-config/tax-config.controller.ts:141-143`, rate update route) requires only
`@RequiresPermission("settings.tax.update")` — a single permission, no PIN check, and no
`settings.tax.rate.change` permission exists at all
(`grep -n "rate.change" tax-config.controller.ts tax-config.service.ts` → 0 hits). No
manager-PIN service (`ApprovalPinService`) is imported or called anywhere in `tax-config/`.

Marked SUSPECTED rather than CONFIRMED-as-a-bug because it may be a deliberate as-built
simplification the same way `approvalRequiredForManualRate` was deliberately left dormant in
the currency policy (see V-03 below, which documents that exact pattern with a code comment
explaining the decision) — but there is no equivalent comment here, and unlike the currency
case, the spec is unambiguous and the permission key it names does not exist at all. Given
Kuwait has no tax exposure this is low real-world impact for the launch tenant, but the
control gap would matter the moment a taxed-jurisdiction tenant goes live. Recommend either
implementing the PIN gate or updating the spec to match, so the next reader doesn't assume a
control exists that doesn't.

---

## VERIFIED SOUND (evidence, so it does not get re-tested)

- **V-01 · Tax-visibility "row-count proxy" trap does NOT recur in Settings.** The Purchase
  phase's defect (`hasTaxGroups = tax_groups.length > 0`, always true because every no-tax
  tenant is seeded exactly one "No Tax" group) was checked for a fourth occurrence here. The
  Settings taxation screens (`taxation-panel.tsx`, `tax-codes-table.tsx`,
  `tax-groups-table.tsx`) are **configuration** CRUD screens with no such derived
  visibility flag at all — they are meant to show whatever tax codes/groups exist, taxed or
  not, since that's the point of a config screen. Live DB confirms the seeded row is exactly
  the trap-shape (`select * from tax_codes` → 1 row `NO-TAX-KW` category `out_of_scope`;
  `tax_groups` → 1 row `No Tax`, `is_default=true`), but nothing in Settings gates *visibility
  of other UI* off a `tax_groups.length` check the way Purchase's `order-create-panel.tsx`
  once did (that surface already uses `anyTaxGroupHasTaxableRate`, not a count, confirmed by
  reading `apps/web/src/features/purchase/components/orders/order-create-panel.tsx:297` —
  correctly rate-aware, not a fourth instance of the bug).
- **V-02 · Repo-wide `documentShowsTax`/`showsPurchaseTax` audit found one shared print-layer
  predicate and one shared purchase-layer predicate, each used consistently at every call
  site** (`grep -rn "documentShowsTax\|showsPurchaseTax"` across `packages/shared/src/print`
  and `apps/web/src/features/{pos,purchase,print-settings,sales-import}` — 30 hits, all
  through the two named functions, zero hand-rolled duplicates found in this pass). Settings
  itself has no third/fourth tax-visibility mechanism to consolidate.
- **V-03 · `list Tenant Currencies` query param `isActive` avoids the `z.coerce.boolean()`
  truthiness trap named in the brief.** `currency-config.dto.ts:93-96` uses
  `z.enum(["true","false"]).transform(v => v === "true")`, not `z.coerce.boolean()` — the
  string `"false"` correctly resolves to `false`. Checked specifically because this exact
  class of bug was CRITICAL elsewhere in the programme; not present here.
- **V-04 · Currency policy's dormant `approvalRequiredForManualRate` flag is a documented,
  deliberate no-op, not a silent guard-rendered-inert defect.** The DTO comment
  (`currency-config.dto.ts:23-28`) explicitly records it was disconnected 2026-07-25 ("only
  ever drove a static warning banner, never a real approval workflow") and is kept
  writable only so existing rows/API callers don't break. This is the opposite of the
  `is_monetary`-always-true class (an *undocumented* inert guard) — here the inertness is
  reasoned in the source. Not filed as a finding.
- **V-05 · Currency/tax controllers are fully permission-gated and audited**, no ungated
  mutation found: every `POST`/`PATCH`/`DELETE` on `tenant/currencies`, `tenant/currency-policy`,
  `tenant/tax-codes`, `tenant/tax-groups` carries both `@RequiresPermission` and `@Audited`
  (verified by reading every route in both controllers end to end, not by grep count alone).
- **V-06 · `assertCurrencyNotInUse` is honest about its own gap.** Its own code comment
  (`currency-config.service.ts:69-84`) documents the TOCTOU window and the missing
  create-side check, tagged `ponytail`, with a stated upgrade trigger. This is the class of
  deliberate, disclosed shortcut the programme has been told to distinguish from an
  undisclosed bug — C-02 above is scoped to what the comment does **not** cover (the missing
  posted-transaction check), not to the disclosed TOCTOU gap.
- **V-07 · `FiscalYearDialog` (period-generation UI) has sane defaults for the common case.**
  Default form state is `calendarYear: current year, isClosed: false` — a first-time owner
  creating this year's fiscal calendar sees one required field (the year, pre-filled) and one
  button. The `isClosed` / `initialPeriodStatus` jargon (for historical-import backfill) is
  hidden behind a toggle that defaults off, so it never reaches a first-time user. No em
  dashes in the dialog's visible strings.
- **V-08 · `CurrencyDialog`'s seed picker removes the jargon burden for the acceptance test.**
  Selecting a currency from the ISO seed list (`useCurrencySeedListQuery`) auto-fills name,
  symbol, decimalPlaces, and symbolPosition in one action (`handleSeedSelect`,
  `currency-dialog.tsx:110-118`) — an owner adding a foreign currency never has to know what
  "decimal places" or "symbol position" mean if they pick from the list, which every real
  ISO currency will be. The four raw fields exist only for a currency outside the seed list.

---

## FOUNDER'S ACCEPTANCE TEST

**Add a foreign currency, first try:** Settings ▸ Currencies ▸ "Add Currency" ▸ pick from the
seed dropdown (e.g. "AED, UAE Dirham") ▸ every field auto-fills correctly ▸ Save. **One
dialog, one meaningful choice (which currency), under 60 seconds.** Yes, an untrained owner
can do this. The only failure mode is C-01: if they later go back and "correct" the decimal
places for some reason, that edit silently does nothing everywhere else in the product — a
trap for someone who *does* try to customize rather than accept the default, not a trap for
the default happy path itself.

**Set up a financial year, first try:** Fiscal Years ▸ "New Fiscal Year" ▸ the year is
pre-filled to the current calendar year ▸ Create. **One dialog, zero required decisions**
beyond confirming the default. Yes. (Whether the resulting periods are then usable to
actually close a month is a different question, answered exhaustively and negatively by
`09-accounting-periods-closing.md` F-12 — not re-litigated here.)

Net: the *configuration* screens in this phase's narrow scope pass the acceptance test on the
happy path. The money-correctness defect (C-01) is invisible on the happy path and only bites
someone who exercises the control the screen advertises.

---

## WITHDRAWN AFTER INVESTIGATION

- **"The taxation Settings screen needs a country/tax-system-derived visibility gate like
  `documentShowsTax`."** Investigated and withdrawn: the Settings taxation screens are
  configuration CRUD, not a document-rendering surface. Gating them off `countryHasConsumptionTax`
  would make it impossible for a Kuwait tenant to ever configure a tax code for a foreign
  branch/import scenario. `documentShowsTax`/`showsPurchaseTax` exist specifically to gate tax
  line ITEMS on rendered documents and totals, a different problem from whether the config
  screen itself exists. No fourth mechanism needed here; none was missing.

---

## VERIFICATION GAPS (honest)

- **No browser pass at all in this phase.** RTL rendering, ar/en parity (message-bundle level,
  not just component-level), responsive breakpoints, loading/empty/error states, and the
  currency/tax-codes list pagination and export were not exercised. Given the resource
  constraint that arrived mid-task (10 concurrent agents, avoid heavy browser sessions) and
  that the two CRITICAL/HIGH findings were reachable and conclusively provable by code trace
  alone, I prioritized depth on the money-correctness question over breadth across every
  screen state. This is a real gap, not a shortcut I'd defend as sufficient on its own.
- **C-02 was not exercised live** (see reasoning inline) — confirmed by reading the guard
  function and its single call site end to end, not by a live 200/403 probe.
- **Tax-rate-change PIN gate (C-03) was not probed live** — confirmed by grep/read of the
  controller and service; did not attempt a rate-change call to see whether a PIN prompt
  exists client-side only (the frontend could theoretically enforce it even if the backend
  doesn't — did not check `tax-rate-dialog.tsx` for a client-side PIN step, which would at
  least partially mitigate this if present).
- **Permission-matrix cross-check (cashier/storekeeper actually getting 403 on these routes)**
  was not performed live — inferred from `@RequiresPermission` decorators being present, not
  from an authenticated curl per role. Given every route in scope carries the decorator
  (V-05), the residual risk is a role-grant misconfiguration, not a missing gate — lower
  priority than the two content findings above, but unverified.
- **Deep keyset pagination past page 1** on `tenant/tax-codes` / `tenant/currencies` was not
  exercised — this tenant only has 1 tax code, 1 tax group, and 3 currencies, so there isn't
  enough real data to walk a keyset past page one, matching the same gap the FX/periods phase
  recorded (G-8) for the same reason.
- **Export** was not checked on any screen in scope for existence/content.
- **Fiscal period NAMING/labelling** (the `label` field format, e.g. "Jul 2026") was not
  independently re-audited — `09-accounting-periods-closing.md` already exercises period
  labels extensively via F-07/F-09/F-V9 and I deferred to that coverage rather than
  duplicating it.

---

## ADDENDUM (coordinator-directed follow-up, same session)

The coordinator independently verified C-01, confirmed the root defect, but reversed the
severity and the fix direction I originally proposed. This section supersedes the C-01/C-02/
C-03 write-ups above where they conflict; the original text is left in place as the record of
what was found first, not deleted.

### C-01 — DOWNGRADED to MEDIUM, and FIXED (not "recommend wiring through" — the opposite)

Coordinator's correction, verified by re-reading `packages/shared/src/pos-money/currency.ts:31-58`:
`CURRENCY_DECIMALS` is **not** a stale/duplicate hardcode — it is *built from* the canonical
`TRANSACTION_CURRENCIES` registry (`Object.fromEntries(TRANSACTION_CURRENCIES.map(c =>
[c.code, c.decimals]))`), with an explicit "no second list to keep in step" comment, plus a
short, deliberate extension list for non-tradeable/legacy currencies (IQD, LYD, and the
0-decimal app-convention set). So my stated blast radius — "a currency outside the map
silently formats at 2dp" — only reaches a currency that is neither tradeable in Zerupt nor on
that legacy list. Narrow, not a live money risk. **Downgraded CRITICAL → MEDIUM.**

The confirmed part of the original finding stands: the Settings ▸ Currencies "Decimal Places"
field was stored and editable but never consumed by any formatter. That is still a real "no
dead collected fields" violation.

**The fix is the opposite of what I first proposed.** Minor-unit precision is a FACT about a
currency, not a tenant preference — wiring the editable Settings field through to the
formatters (my original recommendation) would have let a tenant set KWD to 2dp and corrupt
every GL tie-out in a 3-decimal country. That would have been a genuine new CRITICAL. The
correct fix, per this programme's own "no dead collected fields" and "make the bug impossible,
not absent" principles: make the field **read-only, derived and displayed from the registry**,
and stop accepting it from the client at all.

**Implemented** (small, clearly-correct change, done this session):

- `apps/api/src/currency-config/currency-config.dto.ts` — removed `decimalPlaces` from both
  `createTenantCurrencySchema` and `updateTenantCurrencySchema`. It is no longer a client
  input, documented inline as a derived fact.
- `apps/api/src/currency-config/currency-config.service.ts` — `createTenantCurrency` now sets
  `decimalPlaces: currencyDecimals(input.currencyCode)` from `@zerupt/shared`, ignoring
  anything the client sends; `updateTenantCurrency` no longer has a `decimalPlaces` branch at
  all (removed, not just ignored).
- `apps/web/src/features/currencies/components/currency-dialog.tsx` — the decimal-places input
  is now `disabled`/`readOnly`, displays `currencyDecimals(watchedCode)` live while creating (or
  the stored value while editing), is no longer part of the submitted zod schema/payload, and
  carries a plain-language hint ("Set automatically for this currency and cannot be changed
  here.", en+ar, both added to `messages/{en,ar}/currencies.json`).
- `apps/web/src/features/currencies/types.ts` — `decimalPlaces` removed from
  `CreateTenantCurrencyPayload`/`UpdateTenantCurrencyPayload`.
- Fixed the one real consumer this broke: `apps/api/src/onboarding/pipeline/materialize-currency.ts`
  (tenant provisioning) was passing `decimalPlaces: seed.decimalPlaces` into the now-narrower
  create call — removed, with a comment explaining precision is derived downstream.
- **No column removal, no migration.** The `tenant_currencies.decimal_places` column stays —
  it's still the read path for `TenantCurrencyResponse`/the table view — it is simply never
  again *written* from client input. Per the coordinator's instruction, I did not write a
  migration; if the column is ever judged worth dropping, that's a separate, deliberate
  decision, not part of this fix.

**Verification, not just written:**
- New regression test `currency-config.service.spec.ts` — "derives decimalPlaces from the
  currency registry, ignoring any client-supplied value" — simulates a legacy/malicious client
  still sending `decimalPlaces` on the wire (bypassing the DTO type) and asserts the inserted
  row uses the registry value (KWD → 3), not the sent value (2).
- `apps/api/src/currency-config/currency-config.service.spec.ts` (28 tests, all passing,
  `npx jest currency-config.service --no-coverage` → "Test Suites: 1 passed").
- `apps/api/src/onboarding/pipeline/materialize-currency.spec.ts` (12 tests, all passing) — the
  one test that asserted the old contract was updated to assert the new one (no `decimalPlaces`
  in the call), not deleted or weakened.
- `pnpm --filter @zerupt/api typecheck` and `pnpm --filter @zerupt/web typecheck` — my files are
  clean. The API typecheck still shows 4 pre-existing errors in `apps/api/src/reports/*`
  (`customer-statement.service.ts`, `supplier-statement.service.ts`, `pos-cash-variance.service.ts`,
  `sales-register.service.ts`) — none of these are mine or touched by me; they are another
  session's in-flight keyset/report work.
- `npx vitest run currency` (web) — 12 files / 60 tests passing.
- **Could not verify live via the compiled API.** `pnpm --filter @zerupt/api build` currently
  fails on the same 4 pre-existing `reports/` errors above (missing `assertCurrorTimestamp`
  export, missing `createdAtCursor` field) — unrelated to this fix, but it means `nest build`
  aborts before emitting `dist/`, so I could not produce a fresh compiled build to restart the
  API against. **I did not restart the API** — the currently-running process still has the OLD
  (dead-field) behavior; my fix is verified by narrow jest/vitest unit tests and typecheck only,
  not by a live curl against the new code. I did confirm live via the browser (owner session,
  English, `/settings/currencies`) that the page still renders correctly post-edit under Next's
  hot reload (web doesn't need a rebuild) — table shows AED 2 / KWD 3 / SAR 2 decimals
  correctly, no visual regression. **Recommend:** whoever resolves the `reports/` build breakage
  should rebuild+restart the API and re-run a live create/update probe against
  `tenant/currencies` to close this last gap.

### C-02 — rescoped per coordinator's direction, verified live and derived from the GL

The `decimalPlaces`-editing half of this finding **dissolves**, exactly as the coordinator
said: since the field is now (and was already, practically, given C-01's downgrade) inert for
real ISO currencies, changing it was never a live money risk for KWD/AED/SAR.

**What survives, verified live and derived from the GL first:**

```sql
-- AED structural references (functional/branch currency) — ZERO
select currency_code from legal_entities;                -- only KWD (Gulf Auto Parts)
select name, currency_code from branches;                 -- all 4 branches: KWD

-- AED posted GL usage — REAL, confirmed from the ledger itself
select jel.currency, a.code, a.name, count(*) n, sum(jel.debit-jel.credit) net_fc
from journal_entry_lines jel
join accounts a on a.id = jel.account_id
join journal_entries je on je.id = jel.journal_entry_id
where jel.currency = 'AED' and je.status in ('posted','reversed')
group by 1,2,3;
```
```
 AED | 1131 | Trade Receivables | 1 |  83.500000   <- open, unsettled FC exposure
 AED | 2111 | Trade Payables    | 1 | -21.750000
 AED | 2121 | GRN Accrual       | 1 |  21.750000
 AED | 4110 | Product Sales     | 1 | -83.500000
```
`tenant_currencies` for AED: `is_active = t`, confirmed unchanged before and after this
session (not mutated — see write-safety note below).

This confirms the surviving claim exactly: AED has real, currently-open posted GL exposure
(an unsettled AED customer receivable), is **not** referenced by any legal entity or branch, so
`assertCurrencyNotInUse('AED')` finds zero structural blockers. **AED could be deactivated
today via `PATCH /tenant/currencies/:id {isActive:false}` with no gate at all**, despite the
live exposure.

**What actually breaks downstream — derived from code, not guessed:**
```
grep -rl "tenantCurrencies" apps/api/src   # excluding spec files and currency-config itself
  → provisioning/steps/seed-config.step.ts
  → audit/audit-entity-registry.ts
  → exchange-rates/exchange-rate-auto-fetch.scheduler.ts
  → onboarding/pipeline/materialize-currency.ts
```
Only `exchange-rate-auto-fetch.scheduler.ts:210-212` reads `tenant_currencies.isActive` for a
real decision:
```ts
.select({ code: tenantCurrencies.currencyCode })
.from(tenantCurrencies)
.where(and(eq(tenantCurrencies.tenantId, tenantId), eq(tenantCurrencies.isActive, true)));
```
Deactivating AED would silently drop it from the auto-fetch scheduler's currency list, so its
exchange rate would stop refreshing. Because FX revaluation already **fails loud** on a
missing/stale closing rate (verified live in `09-accounting-fx-multicurrency.md`'s "Fail-loud
on a missing closing rate" item — not re-tested here, cited as prior evidence), the practical
failure mode is **not a silent wrong number** — it is a correctly-refused revaluation with an
actionable error, that stays blocked until someone notices and reactivates AED. Real
operational harm (a legitimate month-end close blocked on a config mistake nobody would think
to check), but not a silent money bug.

**Additional small finding surfaced by this trace (new, not in my original write-up):** grepping
`apps/api/src/{sales,purchase,journal-entries}` for `tenantCurrencies`/`TenantCurrenc` returns
**zero hits**. The transaction currency on a sales invoice, purchase bill, or manual JE is
**never validated against the `tenant_currencies` whitelist at all**, active or not — despite
the product spec's explicit rule ("Transaction currency must be in TenantCurrency whitelist").
So deactivating a currency doesn't even block *new* postings in it; the whitelist's only live
teeth today are (a) the currency picker UI filtering to `isActive` currencies (client-side
convenience, not a server gate) and (b) the exchange-rate scheduler above. **MEDIUM,
CONFIRMED** — filed separately from C-02 since it's a distinct gap (whitelist non-enforcement
at posting) rather than the "in use" guard gap C-02 already covers.

**Not exercised destructively.** I did not actually deactivate AED — it carries a
deliberately-preserved, real FX-exposure artifact from the prior FX phase, and mutating it
risked colliding with the concurrently-running period-verification agent's baseline on the
same tenant. The claim is proven by the GL query above plus the two code reads (the guard
function and the scheduler), not by reproducing the break live. Confirmed by
`select currency_code,is_active,decimal_places from tenant_currencies where currency_code='AED';`
run both before and after this session: `AED | t | 2` both times — untouched.

**Revised severity: C-02 stays HIGH**, rescoped to exactly the "in use" guard gap (missing
posted-GL check on deactivation) plus the new MEDIUM whitelist-non-enforcement finding, both
CONFIRMED rather than SUSPECTED now that the GL derivation and code trace are complete.

### C-03 — live-probed, CONFIRMED both ways (not orphaned-permission — never implemented)

Checked the "does `settings.tax.rate.change` exist" claim from both directions, per the
coordinator's specific instruction (this program has had one false orphaned-permission claim
before):

1. **Static permission catalog** — `packages/shared/src/permissions.ts:204-207` declares
   exactly four tax permissions: `taxCreate/taxRead/taxUpdate/taxDelete` →
   `settings.tax.{create,read,update,delete}`. `settings.tax.rate.change` is not among them,
   and `grep -rn "rate.change"` across `packages/shared/src` and `apps/api/src` returns zero
   hits anywhere in the codebase — not in a controller, not in a spec, not in a comment.
2. **Live-granted permissions (materialised `role_permissions`)**:
   ```sql
   select r.name, rp.permission_key from roles r join role_permissions rp on rp.role_id = r.id
   where rp.permission_key like 'settings.tax%' order by 1,2;
   ```
   ```
    Accountant | settings.tax.read
    Viewer     | settings.tax.read
   ```
   Only `read` is granted to anyone below Owner. Nobody in this tenant currently holds
   `settings.tax.create/update/delete` as a granted role permission.
3. **Owner bypass, confirmed structurally, not assumed**: `roles` has no superuser column;
   `select count(*) from roles r join role_permissions rp on rp.role_id=r.id where r.name='Owner'`
   → `0` rows — Owner holds **zero** explicit permission grants. `apps/api/src/auth/permission.service.ts`
   documents why: `"Step 1: Owner bypass — if user holds the Owner system role, allow
   immediately"` (`isOwner` check, `OWNER_BYPASS` result). So today, only the Owner (via
   structural bypass) can change a tax rate — not because of a manager-PIN control, but because
   nobody has been granted the write permissions at all.
4. **Live-probed with a fresh accountant1 session** (re-authenticated via Supabase password
   grant after the cached token had been revoked by another concurrent session):
   ```
   PATCH /tenant/tax-codes/bcb261ae-…   {"name":"ZZTEST No Tax renamed"}
   → 403 {"message":"Access denied","error":"Forbidden","statusCode":403}
   POST /tenant/tax-codes/bcb261ae-…/rates   {"rate":5,"effectiveFrom":"2026-09-01"}
   → 403 {"message":"Access denied","error":"Forbidden","statusCode":403}
   ```
   Both refused cleanly, with a plain 403 and **no PIN challenge or approval-step response** —
   confirming the gate really is a single permission check, not a hidden two-step control.
5. Also checked `apps/web/src/features/taxation/components/tax-rate-dialog.tsx` for a
   client-side PIN step that might partially compensate — `grep -n "pin\|Pin\|approval"` →
   zero hits. No client-side mitigation either.

**Upgraded from SUSPECTED to CONFIRMED.** `settings.tax.rate.change` + manager-PIN, as named in
`agent-os/product/modules/settings-admin/06-tax-configuration-controls.md`'s approval matrix,
was never implemented — the as-built control is a plain permission check
(`settings.tax.update`), currently held by nobody but the Owner (via bypass), in this tenant.
Given Kuwait has no live tax exposure this is dormant risk for the launch tenant, but the gap
is real and would matter the moment a taxed-jurisdiction tenant goes live with more than one
privileged user.

### Permission matrix cross-check (live SQL against materialised `role_permissions`)

Full scope for this phase (currency / tax / fiscal-period-adjacent), as requested:

```sql
select r.name, rp.permission_key from roles r join role_permissions rp on rp.role_id = r.id
where rp.permission_key like 'settings.currency%' or rp.permission_key like 'settings.tax%'
   or rp.permission_key like 'settings.fiscal%' or rp.permission_key like 'accounting.period%'
order by 1,2;
```
```
 Accountant | accounting.period.lock
 Accountant | accounting.period.unlock
 Accountant | settings.currency.read
 Accountant | settings.fiscal.list
 Accountant | settings.fiscal.read
 Accountant | settings.tax.read
 Viewer     | settings.currency.read
 Viewer     | settings.fiscal.list
 Viewer     | settings.fiscal.read
 Viewer     | settings.tax.read
```
Cashier and Storekeeper hold **none** of these keys (zero rows for either), consistent with
their job scope. Accountant/Viewer are read-only across currency/tax/fiscal-year config; only
Accountant additionally holds the period lock/unlock pair (already the subject of F-01 in
`09-accounting-periods-closing.md` — the asymmetric-control finding, not repeated here). No
role besides Owner (bypass) can create/update/delete a currency or a tax code/rate in this
tenant today. This is a live, current-state confirmation of what V-05 already established
structurally (every route decorated) — the grants match the code's gate, no drift found.

### Browser / RTL / i18n pass — attempted, partially completed, environmental blocker recorded honestly

Per the coordinator's correction, the earlier resource-constraint message was about **how** to
run shell commands, not license to skip the browser. I ran a live session as **Owner
(Hussain Bedawala, anonymator8@gmail.com — confirmed via the user-menu footer before drawing
any conclusion, per method rule 2)**, all-branches scope:

- **Completed:** `/en/settings/currencies` loaded cleanly — table renders `AED 2 / KWD 3 /
  SAR 2` correctly (matches the registry, confirms no visual regression from the C-01 fix,
  which is live under Next's hot reload without a rebuild), Currency Policy card shows
  "Multi-currency enabled" / "Allow backdated rates" toggles, tab strip is Currencies /
  Exchange Rates / Currency Policy. No tax jargon, no em dashes observed in the visible copy.
  Dashboard (same session) confirmed KWD renders at 3dp everywhere I saw it
  (`KWD 589,021.541`, `KWD 30.000`, `KWD 9,484,258.152`) — consistent with C-01's finding that
  the static registry path works correctly for real ISO currencies.
- **Not completed:** the Arabic/RTL pass, the Add-Currency dialog visual check of the new
  read-only decimal field, and the taxation/fiscal-years screens. The shared `browse` daemon
  is under heavy concurrent load this session — repeated symptoms observed and NOT worked
  around by retrying in a loop (per the "don't retry failing commands in a sleep loop" rule; I
  made one clean re-attempt per failure class, then stopped): my active tab was hijacked
  mid-sequence by other agents' concurrent navigation at least three times (URL changed under
  me between two of my own consecutive commands, once even switching locale); `newtab`-created
  "isolated" tabs were not actually isolated — tab IDs collided with other agents' concurrent
  `tab`/`newtab`/`closetab` calls, observed by a tab I had just created and confirmed on
  `/ar/settings/currencies` showing `/ar/purchase/suppliers` content two commands later; and
  the daemon itself cycled through "Another instance is starting the server, waiting..." twice.
  This is the environment, not a shortcut — `study/testing/_agent-briefing.md`'s own rule 2
  ("agents share one browser") predicts exactly this failure mode under the orchestrator's
  10-concurrent-agent load, and I do not have a way to reserve exclusive access to the shared
  daemon. **Recorded as a genuine, unresolved verification gap**, not glossed over: ar/RTL
  parity and the taxation/fiscal-years screens in this phase's scope are unverified visually.

### Write safety re-verification (unchanged from original submission, reconfirmed after this addendum's work)

```sql
select round(sum(l.debit-l.credit),6) from journal_entry_lines l
  join journal_entries je on je.id = l.journal_entry_id
  where je.status in ('posted','reversed');
```
Before this addendum's work: `0.000000`. After (including the live accountant1 re-auth, the
two 403 probes, the GL-derivation queries, and the browser session): `0.000000`, unchanged.
No period was touched, no document was created, no currency row was mutated — `AED` and `KWD`
rows in `tenant_currencies` confirmed byte-identical (`is_active`, `decimal_places`) before and
after. Nothing added to `_documents-created.md` — this addendum made zero data writes, only
source-code changes plus read-only SQL/API probes.
  duplicating it.

---

## IMPLEMENTATION PASS 2026-08-30 — three confirmed fixes shipped (implementation agent)

Fixes C-02 (posted-GL currency-deactivation guard), the whitelist-not-enforced-at-posting
finding, and C-03 (tax-rate manager-PIN gate) from the addendum above. Each is CONFIRMED live
against the running API, not just green tests. Ledger identity read 0.000000 before the first
write and 0.000000 after the last (see Write Safety at the end). API was rebuilt and restarted
once.

### FIX 1 — posted-GL check added to `assertCurrencyNotInUse`

**File:** `apps/api/src/currency-config/currency-config.service.ts`

`assertCurrencyNotInUse` (the ONE shared guard both `updateTenantCurrency({isActive:false})`
and `deleteTenantCurrency` call through) now runs a third check in parallel with the two
existing structural ones: a `journal_entry_lines ⨝ journal_entries` count of posted/reversed
lines carrying that currency code. HARD-BLOCK (`ConflictException`, 409) when any exist —
same split as `location-deactivation-guard.ts` (money-in-flight blocks, never just warns). The
message names what is in the way (`"N posted journal lines in your accounting ledger"`) and
what to do (`"Settle or reverse the ... transactions first, then deactivate this currency."`),
combined with the pre-existing structural blockers when both apply.

**Entry-point audit (every caller of `assertCurrencyNotInUse`):**
```
grep -rn "assertCurrencyNotInUse" apps/api/src → 3 hits, all in currency-config.service.ts:
  the function definition, updateTenantCurrency (line ~335), deleteTenantCurrency (line ~378)
```
Controller-side: `grep -rn "updateTenantCurrency\|deleteTenantCurrency"` → exactly one PATCH
route (`PATCH /tenant/currencies/:id`) and one DELETE route
(`DELETE /tenant/currencies/:id`) in `currency-config.controller.ts`. **No bulk route exists
for currencies at all** — confirmed by grepping the controller for a second `@Patch`/`@Delete`
on the currencies resource; there is none. No other service imports or bypasses
`assertCurrencyNotInUse`. One name, one body, both entry points patched.

**Pinning test:** `currency-config.service.spec.ts` — two new tests: "blocks deactivation
when the currency has posted GL usage but ZERO structural references (the live AED shape)"
and the DELETE-path equivalent, plus the three existing tests (`deactivates successfully`,
`blocks... legal entity`, `blocks... branch`) updated with a `glExposureSelectMock(0)` so the
new parallel query doesn't break them.

**Deliberate break, CONFIRMED:** reverted the `if` condition to drop `&& glLineCount === 0`.
Both new tests failed with the exact wrong-behaviour symptom (one threw `TypeError` because the
now-absent guard body never ran `update`/`delete`, proving the test genuinely exercises the
code path, not a tautology). Restored; all 30 tests in the suite pass again.

**Live proof:**
```
PATCH /tenant/currencies/d16cbd0b-66e2-44f5-977a-d603704aa248 {"isActive":false}  (as Owner)
→ 409 {"message":"Currency AED cannot be deactivated or removed. It is in use by 4 posted
   journal lines in your accounting ledger. Settle or reverse the AED transactions first,
   then deactivate this currency.","error":"Conflict","statusCode":409}
```
DB before AND after: `select currency_code,is_active,decimal_places from tenant_currencies
where currency_code='AED';` → `AED|t|2` both times — CONFIRMED unchanged.

### FIX 2 — `tenant_currencies` whitelist enforced at every document-currency entry point

**New shared guard:** `apps/api/src/common/currency-support-guard.ts` — extracted the
"is this currency actually enabled?" check that already existed as a private function inside
`branches.service.ts` (`assertCurrencySupported`, added earlier the same day for branch
currency overrides) into `assertCurrencyEnabled(db, tenantId, currencyCode, remedy)`. Same
shape as `location-deactivation-guard.ts`: one exported function, callers pass a
caller-specific remedy string. `branches.service.ts` was rewritten to call the shared function
instead of duplicating the query (and its now-unused `tenantCurrencies` import removed).

**Every entry point wired in, confirmed by grepping every controller/service that accepts a
`currency` field from the client (not just the ones already known):**

| Path | File | Choke point |
|------|------|-------------|
| Sales invoice create (both `create()` and the second create path) + direct sale | `sales/invoices/sales-invoices.service.ts` | `resolveInvoiceCurrency` (private, called by both) |
| Quotation → invoice conversion | `sales/quotations/quotation-convert-invoice.ts` | inline, mirroring the invoice gate (own re-resolution, not a shared call, but same rule) |
| Purchase bill (standalone, GRN-backed, direct-purchase-derived) | `purchase/invoices/purchase-invoices.service.ts` | `assertBillCurrencyAndRate` (private, 3 call sites) |
| Direct/quick purchase | `purchase/direct/direct-purchase.service.ts` | `resolveContext` (private, one body for quick + full direct purchase) |
| Purchase order create + the amend saga's dry-run `assertCreatable` | `purchase/orders/purchase-orders.service.ts` | both call sites patched so the dry-run "would this succeed?" check can never say yes to a currency `create()` would refuse |
| Manual JE create (`createDraft`) + edit (`updateDraft`, only when currency changes) | `journal-entries/journal-entry-draft.service.ts` | inline, both call sites |

**Not touched, deliberately:** sales orders and purchase returns derive their currency from the
branch's functional currency only (never accept a client-stated currency), so there is no
whitelist gap there — confirmed by reading both services end to end (no `input.currency` field
consumed as a document currency on those paths). Supplier payments/refunds settle in the
currency of an existing (already-validated) bill, not a freely-chosen new currency — out of
scope for the same reason.

**Pinning tests, one per choke point** (all narrow, no full suite run):
- `sales-invoices.service.spec.ts` — "422s a foreign currency the tenant has NOT enabled..."
- `purchase-invoices.service.spec.ts` — "create rejects a foreign currency the tenant has NOT
  enabled..." (exercises the ONE shared `assertBillCurrencyAndRate`, which covers all 3 bill
  paths)
- `journal-entry-draft.service.spec.ts` — "422s a currency the tenant has NOT enabled"
- Existing specs for `quotations-money.service.spec.ts`, `purchase-orders.service.spec.ts`,
  `direct-purchase.service.spec.ts` all needed a default `tenantCurrencies.findFirst` mock
  added to their `makeDb()` helpers (a foreign-currency test that didn't previously need to
  care about the whitelist now does) — classified as **mock gap**, not a behaviour change; all
  pre-existing assertions in those files are unchanged and still pass.

**Deliberate break, CONFIRMED (two independent choke points tested):**
1. Sales invoice: removed the `assertCurrencyEnabled` call from `resolveInvoiceCurrency` →
   the new test failed, resolving successfully with a USD invoice instead of throwing —
   confirmed via the actual promise resolving to a full invoice object.
2. Manual JE: removed the same call from `createDraft` → the new test failed, but surfaced a
   DIFFERENT exception (`CodedUnprocessableEntityException` "No exchange rate found for ZZZ to
   AED") from the FX-rate lookup that runs next — proving the whitelist gate really is the
   thing stopping it in the passing case, not some other check taking credit.
Both restored; full suites pass again (179 and 50 tests respectively).

**Live proof:**
```
POST /tenant/journal-entries  currency=USD (not enabled)  (as Owner)
→ 400 {"message":"USD is not one of your active currencies. Enable it under Settings >
   Currencies & Rates first, or post this entry in an already-enabled currency."}

POST /tenant/journal-entries  currency=KWD (enabled, functional)  (as Owner)
→ 201 {"data":{"id":"ab6fb704-8ff3-448a-a3c9-ec4b1106f29c","status":"draft"}}
   (ZZTEST-prefixed description; deleted immediately after via DELETE, confirmed 200
   {"deleted":true} and 0 rows in journal_entries for that id afterward — logged in
   _documents-created.md)
```
An AED (enabled, foreign) probe was also run and correctly passed the whitelist gate, then hit
the NEXT gate (`FX_RATE_MISSING` — this tenant's only stored AED→KWD rates are `rate_type =
'closing'`, not `'spot'`, a pre-existing test-data gap unrelated to this fix) — proving the
whitelist check does not over-block an enabled currency, it simply lets the request proceed to
whatever check comes next.

### FIX 3 — `settings.tax.rate.change` permission + manager-PIN gate implemented (chose option a)

**Chose (a): implement the spec**, not (b) remove the claim. Reasoning: tax rates are
money-affecting config (the moment a rate changes, every taxable document going forward uses
it), the exact class of thing this programme's "never lazy about money" rule protects, and the
existing `PinVerificationService` mechanism was directly reusable with zero new plumbing — a
`FiscalPeriodService`-adjacent maker-checker for a control this cheap to add was a better
trade than downgrading the spec.

**Files:**
- `packages/shared/src/permissions.ts` — added `taxRateChange: "settings.tax.rate.change"`.
- `packages/shared/src/permission-bundles.ts` — added it to the `settings.finance-config`
  bundle alongside the other tax permissions (so it flows through the same
  bundle-completeness machinery as everything else — `permission-bundles.spec.ts` /
  `role-templates.spec.ts`, 142 tests, still pass).
- `apps/api/src/tax-config/tax-config.dto.ts` — `createTaxRateSchema` /
  `updateTaxRateSchema` gained optional `approvedBy` (uuid) / `approvalPin` (string) fields.
- `apps/api/src/tax-config/tax-config.service.ts` — new private `assertRateChangeApproved`,
  called unconditionally (no settings toggle — this control is not settings-optional the way
  POS/invoice maker-checker is, per the spec's wording) at the top of both `createTaxRate` and
  `updateTaxRate`. Missing `approvedBy`/`approvalPin` → 400 with a plain-language message
  before ever reaching the PIN service. Present → delegates to
  `PinVerificationService.verifyApproval(tenantId, {actingUserId: getTenantContext().userId,
  approvedBy, pin: approvalPin, requiredPermission: "settings.tax.rate.change"})` — the SAME
  mechanism every other maker-checker path in the codebase uses (sales invoice void,
  purchase bill void, etc.), not a new one.
- `apps/api/src/tax-config/tax-config.controller.ts` — both rate routes
  (`POST /tenant/tax-codes/:id/rates`, `PATCH /tenant/tax-codes/:id/rates/:rateId`) now carry
  `@RequiresPermission("settings.tax.rate.change")` instead of
  `settings.tax.create`/`settings.tax.update` (the decorator is OR-only across multiple keys,
  so replacing rather than adding was the correct way to require this one specifically, per
  the spec's exact wording).
- `apps/api/src/tax-config/tax-config.module.ts` — imports `ApprovalPinModule` for
  `PinVerificationService`.
- 5 call sites elsewhere in the codebase construct `new TaxConfigService(...)` directly in
  tests/fixtures (not through Nest DI) and needed a third stub arg added: `seed-tenant.ts`,
  `onboarding-first-sale.integration.spec.ts`, `onboarding-complete.service.spec.ts`,
  `onboarding-state.service.spec.ts`, `tax-preview.service.spec.ts` — mechanical, `{} as never}`
  for the unused PIN service (these paths never call `createTaxRate`/`updateTaxRate`).

**Pinning tests:** `tax-config.service.spec.ts` — two new tests ("rejects a rate change with no
approvedBy/approvalPin at all... never reaches the PIN service" and "calls
PinVerificationService.verifyApproval with settings.tax.rate.change and propagates its
rejection verbatim"), plus every pre-existing `createTaxRate`/`updateTaxRate` test updated to
supply a passing `RATE_CHANGE_APPROVAL` object (mock gap, not a behaviour change — all
pre-existing assertions unchanged). 88 tests total, all passing.

**Deliberate break, CONFIRMED:** replaced `assertRateChangeApproved`'s body with a no-op
`return`. Both new gate tests failed — one expecting `BadRequestException` got `NotFoundException`
instead (the real business logic ran straight through to "tax code not found" because the mock
tax-code lookup wasn't primed, proving the gate really was the FIRST thing to run before my
change), the other's expected PIN-rejection message never appeared for the same reason.
Restored; all 88 tests pass again.

**Live proof (three-part, confirming the FULL chain — permission, PIN gate, and anti-oracle):**
```
1. accountant1 (member, holds only settings.tax.read):
   POST /tenant/tax-codes/bcb261ae-1728-4a41-8327-b45632aa2fe2/rates {"rate":5,...}
   → 403 {"message":"Access denied","error":"Forbidden","statusCode":403}
   (permission gate stops them before the PIN check is ever reached — matches the live
    role_permissions grant: only settings.tax.read on Accountant/Viewer, confirmed unchanged
    by SQL before and after this session)

2. Owner (bypass — holds every permission structurally) WITHOUT approvedBy/approvalPin:
   → 400 {"message":"Changing a tax rate requires a manager's approval: their approvedBy and
      approvalPin."}
   (proves even the Owner cannot skip the PIN step by omission — the permission decorator
    alone is not the whole gate)

3. Owner WITH approvedBy=accountant1's user id + a wrong PIN:
   → 422 {"code":"PIN_INVALID","message":"invalid approval credentials"}
   (the SAME generic anti-oracle response verifyApproval always returns — does not reveal
    whether accountant1 has a PIN set, holds the required permission, or just typed the wrong
    PIN; preserved unchanged, as required)
```
`select * from tax_rates;` → 0 rows, both before and after all three probes — confirmed no
rate was ever written by any of these attempts.

**Known gap, disclosed rather than hidden:** the web `tax-rate-dialog.tsx` was NOT updated to
collect `approvedBy`/`approvalPin` in this pass — this was a backend-correctness fix per the
task's framing ("gate the tax-rate route... and wire the manager-PIN check"), and the frontend
form will need a PIN-approval step added (mirroring the existing invoice/purchase void dialogs)
before an Owner can actually change a tax rate through the UI. Filed here rather than silently
left for the next reader to discover.

### tsc / build / restart

`npx tsc --noEmit` from `apps/api` — clean (0 errors) after patching the 5 direct
`new TaxConfigService(...)` construction sites. `pnpm --filter @zerupt/api build` — succeeded
(the `reports/*` build errors blocking a previous session's build were fixed upstream by
another concurrent session; unrelated to this work). Verified the FRESH `dist/` (not a stale
one) by grepping for new symbols: `assertCurrencyEnabled`, `assertRateChangeApproved`,
`settings.tax.rate.change` all present in the compiled output (15 files). Restarted
`dist/main` — confirmed via `/health` (`status: error` with ONLY `email_config` down, matching
the documented normal-on-dev shape) and via the live probes above, which could only have
produced those exact response shapes from the new code.

**Note:** mid-session another concurrent agent restarted the same shared API process (visible
in `/tmp/zerupt-logs/api.log` — a fresh Nest boot sequence appeared while this pass was
running). The dist/ directory still contained this pass's changes afterward (grep-confirmed,
15 hits), since nothing was committed and the working tree is shared — but it means the final
live-proof curls above ran against whichever process was up at that moment, both before and
after that external restart; re-verified the FIX 3 live probes after noticing the restart to
be certain.

### Write safety — final verification

```sql
select round(sum(l.debit-l.credit),6) from journal_entry_lines l
  join journal_entries je on je.id=l.journal_entry_id
  where je.status in ('posted','reversed');
```
Before this pass's first write: `0.000000`. After the last: `0.000000`. Unchanged.

```sql
select currency_code,is_active,decimal_places from tenant_currencies where currency_code='AED';
```
Before: `AED|t|2`. After: `AED|t|2`. Unchanged — AED was never actually deactivated, only
refused as designed.

```sql
select r.name, rp.permission_key from roles r join role_permissions rp on rp.role_id=r.id
  where rp.permission_key like 'settings.tax%' order by 1,2;
```
Before and after: `Accountant|settings.tax.read`, `Viewer|settings.tax.read` — unchanged. The
new `settings.tax.rate.change` permission was added to the bundle definitions but never
granted to any role's live `role_permissions` in this tenant; only the Owner's structural
bypass can exercise it today, matching the pre-existing least-privilege posture.

One test document created and destroyed (draft manual JE `ab6fb704-8ff3-448a-a3c9-ec4b1106f29c`,
`ZZTEST`-prefixed, logged in `_documents-created.md`, confirmed deleted from `journal_entries`
by id-count SQL). No fiscal period was touched. No opening-balance journal was touched. No
tax_rates row exists in this tenant, before or after (0 rows both times).

**Every claim above is CONFIRMED** (live curl + SQL evidence, or a test that was watched to
fail on a deliberate break and pass on restore) except the note about the concurrent restart's
timing, which is SUSPECTED only in the sense that I cannot prove which exact process instance
served which exact curl — the dist-content grep and the post-restart re-verification close that
gap for the load-bearing claims (FIX 1/2/3 all re-confirmed live after the restart was noticed).

---

## FIX 3 follow-up — web UI regression closed (tax-rate manager-PIN gate)

The backend gate from FIX 3 (`settings.tax.rate.change` + `PinVerificationService.verifyApproval`
on `POST/PATCH /tenant/tax-codes/:id/rates`) was correct but the web dialog never collected the
approval, so any rate change 400'd unconditionally — a correct gate that made the screen
unusable. Fixed web-only, no backend/API changes, no rebuild/restart of the API.

**Component reused (not rebuilt):** `features/approval-pin/components/approval-pin-fields.tsx`
— the SAME `ApprovalPinFields` / `EMPTY_APPROVAL` / `isApprovalComplete` used by
`void-invoice-dialog.tsx`, `void-bill-dialog.tsx`, `edit-price-dialog.tsx`, POS overrides, etc.
No new PIN UI was written; this closes the "one name, two bodies" risk the task called out.

**Files changed:**
- `apps/web/src/features/taxation/types.ts` — `CreateTaxRatePayload`/`UpdateTaxRatePayload` gained
  optional `approvedBy?: string` / `approvalPin?: string`.
- `apps/web/src/features/taxation/components/tax-rate-dialog.tsx` — added `ApprovalPinFields`
  (permission `PERMISSION_KEYS.settings.taxRateChange`), unconditionally (per
  `TaxConfigService.assertRateChangeApproved`'s doc comment: "unconditional, unlike the
  settings-optional POS/invoice approval toggles: there is no tenant setting to turn it off" —
  so, unlike `VoidInvoiceDialog`, there is no `requireApproval` branch here). Submit stays
  disabled until `isApprovalComplete(approval)` is true AND `!isPending` (debounces
  double-submit). Added an `errorMessage` prop rendered inline; `resetForm()` (called only on
  dialog CLOSE, never on a failed submit) clears nothing on error, so a rejected PIN leaves the
  typed rate, dates, approver, and PIN exactly as entered.
- `apps/web/src/features/taxation/components/tax-rates-section.tsx` — added `rateError` state,
  a `mapRateError` classifier (mirrors `invoice-detail-panel.tsx`'s `err.status === 422` ->
  generic message pattern) and `canChangeRate = usePermissionGate(PERMISSION_KEYS.settings.
  taxRateChange).allowed` gating the "Add Rate" button and the pencil/edit button per row
  (delete is UNAFFECTED — the backend gates rate delete on `settings.tax.delete`, not
  `taxRateChange`, confirmed by reading `tax-config.controller.ts`'s route decorators). The
  outer mutation-error banner now fires only for delete failures, since create/update failures
  now render inside the still-open dialog next to the field, not as a duplicate second banner.
- `apps/web/messages/{en,ar}/taxation.json` — three new keys under `taxRates`:
  `approvalFailed` ("That PIN was not accepted. Check the approver and the PIN, then try
  again." / Arabic equivalent), `noRateChangePermission`, `approvalRequired`. No em dashes.

**Payload contract (read from the service, not guessed):**
`TaxConfigService.assertRateChangeApproved` (`tax-config.service.ts:184`) requires
`{ approvedBy: string, approvalPin: string }` on the create/update rate body; missing either
throws a 400 BEFORE the PIN service is ever called; present, it calls
`PinVerificationService.verifyApproval(tenantId, { actingUserId, approvedBy, pin: approvalPin,
requiredPermission: "settings.tax.rate.change" })`. The dialog now sends exactly
`{ rate, effectiveFrom, effectiveTo?, approvedBy, approvalPin }` — field names match verbatim.

**Anti-oracle preserved:** the dialog maps ANY 422 from this route to the single fixed string
`taxation.taxRates.approvalFailed` ("That PIN was not accepted..."), never branching on the
response body or distinguishing "no such approver" from "wrong PIN" from "approver lacks the
permission" — mirrors `invoice-detail-panel.tsx`'s `err.status === 422 -> t("...approvalFailed")`
pattern exactly, which is the same pattern already reviewed and shipped for invoice void.

**Defensive-UX states covered:** loading (`isPending` disables all fields + shows "Saving…"),
error (inline, non-revealing, next to the still-visible fields — not a toast that could be
missed), success (existing `onSuccess` closes the dialog and the rates list refetches), no
double-submit (`canSubmit = isApprovalComplete && !isPending` gates the submit button), no data
loss (rate/dates/approver/PIN never cleared on error — `resetForm()` only runs on dialog close).
Permission-side: `usePermissionGate` (the `!isSuccess`-keyed shared primitive, not a hand-rolled
check) hides Add/Edit for a user without `settings.tax.rate.change` instead of serving a control
that only fails on submit.

**Pinned by:** `apps/web/src/features/taxation/components/__tests__/tax-rate-dialog.test.tsx`
(new file) — asserts (a) `onCreateTaxRate` is called with `approvedBy`/`approvalPin` in the
payload once both fields are filled, and (b) a rerender simulating a rejected-PIN error
(`errorMessage` set by the parent, as `tax-rates-section.tsx` does on a 422) leaves the typed
rate and effective-from date unchanged. `npx vitest run tax-rate-dialog` -> 3/3 passed.

**Deliberate break, CONFIRMED:** removed `...approvalFields` from the create-payload spread in
`tax-rate-dialog.tsx`. The "sends approvedBy and approvalPin" test failed exactly as expected
(`onCreateTaxRate` called without `approvedBy`/`approvalPin`); the other two tests were
unaffected (correctly, since they don't assert the payload shape). Restored the line; re-ran ->
3/3 passed again.

**Typecheck / i18n:**
- `pnpm --filter @zerupt/web i18n:check` -> "Translation check passed. All locales are in
  sync."
- `pnpm --filter @zerupt/web typecheck` -> one pre-existing error in
  `apps/web/src/features/purchase/api/orders-queries.ts:41` (`Cannot find name
  'keepPreviousData'`) — this file was NOT touched by this pass (confirmed via `git status`,
  it was already modified by a concurrent session) and is unrelated to taxation; not fixed,
  per the "another session's in-flight edit" rule. No errors in any file this pass touched.

**Live verification — BLOCKED, marked SUSPECTED, not fabricated:** logged in as the owner
(`anonymator8@gmail.com`) at `http://gulf-auto-parts.localhost:3000/en/login` — confirmed via
`/settings/team` rendering the full settings nav (only reachable when authenticated) and the
tenant's real branch list (Al Rai Main Showroom, Fahaheel, Jahra, Salmiya Service Center)
matching the known Gulf Auto Parts branch set. Navigating to `/en/settings/taxation` (the
correct route — confirmed from `settings/[section]/page.tsx`'s `taxation: TaxationPanel` map)
renders **"Not available for your configuration"**, produced by `SectionGate`
(`components/settings/section-gate.tsx`) reading `config.requiresConsumptionTax` against this
tenant's country capabilities. This is EXISTING, correct, and unrelated to this fix: Gulf Auto
Parts is Kuwait, a no-VAT country, and the product deliberately hides the entire Taxation
settings section for no-tax tenants (`feedback_hide_tax_in_no_tax_countries.md`). The practical
result is that **the tax-rate dialog is structurally unreachable through the UI on the only
live tenant available in this environment** — there is no VAT-market tenant to log into here.
I did not attempt to force this open (e.g. patching tenant capability data) because that risks
altering tenant configuration beyond the "restore what you touch" write-safety rule and was
not part of the assigned fix. So: the payload contract, the anti-oracle mapping, the
defensive-UX states, and the permission gating are CONFIRMED by direct code reading end-to-end
plus the pinned test (which drives the real component, not a stub of it, and failed/passed
exactly as designed on the break/restore). Only the "does a human actually see this dialog and
successfully change a rate in a live VAT-market browser session" claim is SUSPECTED — it could
not be exercised in this environment, and I am flagging that gap explicitly rather than
inferring success from the code.

**Write safety — final verification (unchanged, confirms nothing was touched by this pass):**
```
ledger identity BEFORE: 0.000000
ledger identity AFTER:  0.000000
tax_rates row count AFTER: 0 (unchanged — no rate was ever created, live UI was unreachable)
tax_codes.rate for NO-TAX-KW AFTER: 0.0000 (unchanged)
```
No document was created this pass (no `_documents-created.md` entry needed).
