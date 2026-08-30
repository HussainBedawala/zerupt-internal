# Phase F — Accounting: FX revaluation & multi-currency correctness

Agent area: FX revaluation + the whole multi-currency path where it touches the ledger.
Primary screen: `/:locale/accounting/fx-revaluation`. Tenant: Gulf Auto Parts (KWD, 3dp).

## Ledger identity gate

| When | `SELECT round(sum(debit-credit),6) FROM journal_entry_lines;` |
|---|---|
| Before first write | `0.000000` |
| After last write | `0.000000` |

Every JE I caused is internally balanced. No imbalance introduced.

## Hand-derived vs system-produced (the core number)

Live FC exposure before my run (derived from the GL, not from any screen):

```sql
SELECT jel.currency, a.code, a.name, a.is_monetary, jel.party_type,
       sum(jel.debit_tc-jel.credit_tc) tc, sum(jel.debit-jel.credit) fc
FROM journal_entry_lines jel
JOIN accounts a ON a.id=jel.account_id
JOIN journal_entries je ON je.id=jel.journal_entry_id
WHERE jel.currency<>'KWD' AND je.status IN ('posted','reversed')
GROUP BY 1,2,3,4,5;
```
```
 AED | 1131 | Trade Receivables | t | customer |  1000.000000 |  83.500000
 AED | 4110 | Product Sales     | t |          | -1000.000000 | -83.500000
```

I created a closing rate AED/KWD = 0.0900 for 2026-08-31 through the product API.

**My hand derivation (IAS 21 correct):** only the monetary AR balance is retranslated.
- 1131: 1000 AED x 0.0900 = **90.000** KWD vs book 83.500 -> **gain 6.500**
- Expected JE: DR 1131 6.500 (customer party) / CR 4830 Unrealized FX Gain 6.500
- Expected totals: gain **6.500**, loss **0.000**

**What the system produced:** gain **6.500**, loss **6.500** - it additionally revalued
revenue account 4110. My AR figure matched to the fils; the second line is entirely spurious.

Posted JE `B1ALRAIMAINS-JRN-00087` (2026-08-31):
```
 1131 Trade Receivables  DR 6.500000  party=customer 7fdc347c...  <- correct
 4830 Unrealized FX Gain CR 6.500000                              <- correct
 4110 Product Sales      CR 6.500000                              <- SPURIOUS
 7220 Unrealized FX Loss DR 6.500000                              <- SPURIOUS
```
Correct on the AR side: account 4830/7220 mapping resolves, party tag present on the
control leg, branch + legal entity correct, amounts exact at 3dp, TC amounts preserved.

---

# Findings (ranked)

## CRITICAL-1 (CONFIRMED) - The auto-reversal can never post. Unrealized FX is posted and never reversed.

`FxRevaluationService.revalue` always dates the auto-reversal to the first day of the NEXT
fiscal period. `JournalPostingService` (apps/api/src/journal-entries/journal-posting.service.ts:510)
rejects any posting date in a future period:

```
if (periodResult.isFuturePeriod) throw new BadRequestException(
  `Transaction date ${postingDate} falls in a future period. Future-dating is not allowed.`);
```

A revaluation is by definition run at or before period end, so the reversal date is always
in the future -> the reversal **always** fails. Observed live:

```sql
SELECT event_type,status,attempts,last_error FROM accounting_event_outbox WHERE event_type LIKE 'fx%';
```
```
 fx.unrealized_revaluation          | completed | 0 |
 fx.unrealized_revaluation.reversal | failed    | 3 | Transaction date 2026-09-01 falls in a future period. Future-dating is not allowed.
```
It retries a deterministic error as if transient and will exhaust `max_attempts=5` into
`dead_letter`. The revaluation JE stays posted forever with no reversal.

Why the existing guard misses it: `resolveNextPeriodStartDate` checks `nextPeriod.status !== "Open"`
- the *wrong* condition. Sep 2026 **is** Open; it is merely FUTURE. The code comment there
claims it prevents exactly this ("the revaluation posted with no reversal - a silent
unrealized-FX overstatement"); that is precisely what occurred.

Also note the atomicity comment on the outbox insert claims "no gap ... to leave one posted
and the other lost". The atomicity covers only the *outbox insert*, not the *posting*. One
posted, one dead-lettered - the gap the comment says is closed.

This is the "a reversal that does not reverse" class named in the addendum.

## CRITICAL-2 (CONFIRMED) - `is_monetary` is TRUE for every account in this tenant; the IAS 21 guard is inert, and revenue is being revalued.

```sql
SELECT count(*) total, count(*) FILTER (WHERE is_monetary) mon FROM accounts;  -- 99 | 99
```
Every account - income, expense, equity, inventory (1141), PP&E, headers - is flagged
monetary. The reval filters `accounts.isMonetary = true`, so the filter excludes nothing.

Consequence, demonstrated live above: revenue account 4110 was retranslated, crediting
**KWD 6.500 straight into Product Sales** and debiting a fake Unrealized FX Loss. August
revenue is now overstated by 6.500. Because CRITICAL-1 stops the reversal, that revenue
overstatement is permanent. (Had the reversal worked, revenue would instead be wrong in
two consecutive months, +6.500 in Aug and -6.500 in Sep.)

Note the shape: totalGain 6.500 == totalLoss 6.500, so a summary card nets to zero and the
bug is invisible from the totals. Only the per-account lines expose it.

**Root cause - path divergence (the predicted pattern).** The derivation
`deriveIsMonetary()` (apps/api/src/accounts/coa-monetary-classification.ts) is correct, and
migration `0104_layer4_account_is_monetary.sql` backfills correctly. But three of the five
account INSERT paths never write the column, so it falls to its DB default `true`:

| Path | sets `isCashEquivalent` | sets `isMonetary` |
|---|---|---|
| `coa-seed.service.ts:188` (template seed - built this tenant) | yes | **NO** |
| `accounts-crud.service.ts:488` (single create) | yes | **NO** |
| `accounts-crud.service.ts:656` (bulk create) | yes | **NO** |
| `coa-seed.service.ts:304` | yes | yes |
| `coa-template-builder.ts:122` computes `a.isMonetary` | - | value computed then **dropped** by the seed's values map |

Confirmed by `sed -n '160,190p' coa-seed.service.ts | grep -c isMonetary` -> `0`, same for
the two crud blocks. The sister flag `isCashEquivalent` is threaded correctly in every one
of them; only `isMonetary` was dropped. The migration ran (310 rows in
`drizzle.__drizzle_migrations`) but this tenant's accounts were created 2026-08-23, i.e.
AFTER the backfill - so the backfill can never help a tenant provisioned later. Every new
tenant is born with the guard disabled.

Fix at the primitive: thread `isMonetary: deriveIsMonetary(...)` into all three inserts
(the value is already computed in the template builder), then re-run the 0104 backfill as a
repair migration. A follow-up guard test asserting no `income|expense|equity|is_header` row
is monetary would make the bug unrepresentable.

## HIGH-1 (CONFIRMED) - FX revaluation posting writes NO audit row.

The controller carries `@Audited("FxRevaluation")` and the type is registered
(`audit-entity-registry.ts:491`), but the response envelope has no `id` field, so
`extractEntityId` returns `"unknown"` and the interceptor logs a warning and writes nothing:

```
[AuditLogInterceptor] Could not resolve entityId for audit log
  { method: 'POST', path: '/api/v1/tenant/fx-revaluations', entityType: 'FxRevaluation' }
```
```sql
SELECT count(*) FROM audit_log WHERE entity_type='FxRevaluation';  -- 0
```
A posting that moves the P&L leaves no actor trail. Same failure mode observed in the log
for `DirectSale`, `UserApprovalPin` and `CloseRun`, so this is a class, not a one-off.
Related to the open AUDIT-002. (Exchange-rate creation IS audited - see withdrawn below.)

## HIGH-2 (CONFIRMED) - Re-posting inside the async window returns a raw 500 with a leaked DB constraint.

The idempotency pre-check reads `journal_entries.event_id`, but that row is written
*asynchronously* by the outbox/event listener. A second POST issued before the JE lands
skips the intended 409 and instead hits the outbox unique key, surfacing:

```
{"statusCode":500,"message":"Internal server error"}
```
with `duplicate key value violates unique constraint "outbox_tenant_event_type_event_id_key"`
in the log. Reproduced by posting twice ~15s apart; once the JE existed, the same call
correctly returned `409 Revaluation ... already exists`.

**No double-post occurs** - the outbox unique constraint is the real idempotency guarantee,
so this is not CRITICAL. But an accountant double-clicking during the posting window is told
"Internal server error" about a revaluation that in fact succeeded: a false-failure report on
a committed financial write (defect pattern 4). The 409 should be derived from the outbox
insert conflict, not from a downstream artifact.

## LOW-1 (CONFIRMED) - Em dash in a user-facing API error string.

`fx-revaluation.service.ts` `resolveExactClosingRate`:
> "...A period-end closing rate is required for FX revaluation **—** a prior-date rate is not used..."

Surfaced verbatim in the UI error state. Violates the no-em-dash rule. (The `fxRevaluation`
message catalogues and the panel/page components are clean; em dashes there appear only in
code comments.)

## LOW-2 (CONFIRMED) - Dead second implementation of realized FX.

`FxGainLossService.computeRealizedFxLines` / `computeRealizedFxDifference`
(apps/api/src/journal-entries/fx-gain-loss.service.ts) has **zero callers** outside its own
file and spec. The live path uses the shared `buildRealizedFxLeg`. Not an active bug, but it
is a second body under a near-identical name - exactly the seed of defect pattern 1. Delete it.

---

# Verified correct (hunted, found sound)

- **Fail-loud on a missing closing rate.** With `exchange_rates` empty, `POST` returned
  `404` with an explicit message; it did **not** default to 1 or to a prior rate. Preview
  reported `missingRateCurrencies: ["AED"]` and no lines. Genuinely fails loud.
- **Idempotency (steady state).** Re-running after the JE existed returned `409`; only one
  JE `...00087` exists. No double-post.
- **Party tagging / control=>party guard.** The AR offset leg carries
  `party_type=customer, party_id=7fdc347c...`; the non-party legs carry none.
- **Branch / legal entity scoping.** JE and all four lines carry the correct
  `branch_id 43df4c2e...` and `legal_entity_id d67ece83...`.
- **Precision.** Amounts exact at 3dp (`6.500000` in the 6dp ledger). Rates are
  `numeric(18,10)` - ample for a 0.0835-class rate at KWD 3dp. The reval deliberately derives
  the inverse as `1/forward` at full Decimal precision rather than reading the lossy stored
  `inverse_rate`.
- **Rate direction.** Consistent and documented. `receipt-fx.ts` uses
  `allocated x (receiptRate - invoiceRate)` for sales and notes the deliberately inverted
  purchase form `(invoiceRate - paymentRate)`. Reval uses `netTC x closingRate`
  (multiply, base->quote) throughout. No inversion found.
- **Realized FX is ONE shared helper.** `buildRealizedFxLeg`
  (accounting-events/helpers/build-je-payload.ts:137) is imported by `sales.listener.ts`,
  `purchase-accounting.listener.ts` and `build-cheque-je-payload.ts`. Purchase and sales
  genuinely mirror each other rather than being hand-copies. Not a divergence.
- **AR nets to zero in transaction currency.** By construction in `receipt-fx.ts`: the cash
  leg and the AR relief leg carry the SAME allocated TC amount at different rates; the
  functional gap is booked as a zero-TC FX leg.
- **Functional-currency invoices forced to rate 1** and fail loud otherwise
  (`sales-invoices.service.ts:390`: "A functional-currency (KWD) invoice must have
  exchangeRate 1; got ...").
- **Fiscal-period gating of the closing period** is present and asserts `Open`.
- **Permissions.** `storekeeper1` receives `403` on BOTH `GET /preview` and `POST`. The
  route is gated server-side (`@RequiresPermission("accounting.revaluation.post")`) and
  client-side (`useHasPermission`, with an explicit no-permission state for a pasted URL).
- **i18n.** `messages/en/fxRevaluation.json` and `ar/fxRevaluation.json`: 57 keys each, zero
  missing, zero extra, zero untranslated-identical values.
- **Money formatting** uses the canonical `formatMoneyWithSymbol` - no hand-rolled `toFixed`.
- **No tax UI** on the screen (correct for Kuwait).
- **Rounding safety (by construction, not live-tested).** Both reval legs are emitted from
  the same `absDiff` string, so a JE can never be left unbalanced by asymmetric rounding, and
  a difference rounding to zero is skipped by an explicit `if (difference.isZero()) continue`.
  The Purchase "leg rounds to zero after commit" defect shape is structurally absent here.

# Withdrawn after investigation

- **"Exchange-rate creation is unaudited."** My first query showed no `ExchangeRate` rows,
  but the audit write is asynchronous; on recheck `SELECT count(*) FROM audit_log WHERE
  entity_type='ExchangeRate'` returned `1`. Correctly audited. Withdrawn.
- **"The `is_monetary` flag is set but never consulted."** It IS consulted at query time
  (`eq(accounts.isMonetary, true)` in the balance query). The defect is the *data*, not the
  query. Reframed as CRITICAL-2.
- **"Purchase and sales realized FX have drifted into two copies."** They share
  `buildRealizedFxLeg`. Withdrawn.
- **"`netTC.isZero() -> continue` strands FC residue."** Correct behaviour: a zero TC balance
  means no open exposure, so unrealized reval is genuinely zero. Any FC residue there is
  realized FX, which is the settlement path's job. Not a defect.

# Verification gaps (honest)

- I did **not** live-test a sub-fils rounding case with a ZZTEST document; I closed item 5 by
  reading the code path (both legs share one `absDiff`, zero-difference is skipped). The
  conclusion is structural, not empirical.
- I did **not** confirm the reversal reaches `dead_letter` - it was at `attempts=3` of
  `max_attempts=5` when I finished. The failure is deterministic, so exhaustion is certain,
  but I observed only 3 of 5 attempts.
- I did **not** verify whether a revaluation dated in the PAST (a genuinely closed month
  whose next period has already started) posts its reversal successfully. That is the one
  configuration in which CRITICAL-1 would not fire, and it would narrow the blast radius.
- I did **not** exercise a multi-party or multi-currency reval (only one FC customer balance
  and one currency exist in this tenant), so per-party grouping is verified for N=1 only.
- Browser pass was **not** performed: filters/pagination/empty/loading/error states and
  export-file-open on the FX screen are unverified. The screen has no list/pagination surface,
  so the pagination risk is low, but this is untested.
- Maker-checker: `accounting.revaluation.post` is a single permission with no approver step,
  so one accountant can post a P&L-affecting revaluation unilaterally. I did not determine
  whether that is intended for this control shape, so I have not filed it as a finding.

# Documents created

See `study/testing/_documents-created.md`. Summary: one exchange rate (AED/KWD closing
0.0900 @ 2026-08-31) and one revaluation JE `B1ALRAIMAINS-JRN-00087` with a dead-lettering
reversal.

**Note for later agents doing tie-outs:** JE `...00087` leaves Product Sales 4110 credited
KWD 6.500 and Unrealized FX Loss 7220 debited KWD 6.500 that do NOT belong to any sales
document. This is the CRITICAL-2 artifact, deliberately left in place as evidence. Exclude
`event_id = '7b4316b6-eab9-547a-b0cc-eaaddb8be4ed'` when reconciling revenue.

---

# Fixes applied (2026-08-30, follow-up agent)

Both CRITICALs are fixed at the primitive, with a repair migration for existing tenants.
Nothing pre-existing was voided or edited; the 4 OB journals were not touched.

## Ledger identity gate (status-aware form)

```sql
SELECT round(sum(l.debit - l.credit), 6) FROM journal_entry_lines l
JOIN journal_entries je ON je.id = l.journal_entry_id
WHERE je.status IN ('posted','reversed');
```

| When | Result |
|---|---|
| Before first write | `0.000000` |
| After last write | `0.000000` (see below) |

---

## CRITICAL-2 — `is_monetary` true for every account

### Root cause confirmed
`coa-template-builder.ts:122` computed the correct value via `deriveIsMonetary()`, and the
seed's `values` map at `coa-seed.service.ts:163` then DROPPED it. Same omission in
`accounts-crud.service.ts` single-create and bulk-create. All three threaded the sister flag
`isCashEquivalent` correctly. The column's DB default `true` absorbed every omission
silently, so the IAS 21 guard was disabled for every tenant provisioned after migration
0104's backfill.

### 1. The DB default was the trap — removed

`packages/db/src/schema/chart-of-accounts.ts`:

```
- isMonetary: boolean("is_monetary").notNull().default(true),
+ isMonetary: boolean("is_monetary").notNull(),
```

**Decision and reasoning.** A default that silently produces the WRONG answer is worse than
no default: it converted an omitted column into a disabled accounting standard rather than
an error. With `notNull()` and no default, Drizzle makes `isMonetary` a REQUIRED insert
field, so any future insert path that omits it fails at COMPILE time. This is what makes the
bug impossible rather than merely absent, and it is how the three omissions were mechanically
located — `tsc` named them. The migration cost is one metadata-only
`ALTER COLUMN ... DROP DEFAULT` (no table rewrite, no lock escalation beyond the brief
ACCESS EXCLUSIVE the ALTER already takes), which is cheap enough that fail-loud wins.

### 2. All three insert paths now derive the flag

| Path | Before | After |
|---|---|---|
| `coa-seed.service.ts:163` (template seed — built this tenant) | omitted | `isMonetary: a.isMonetary` (the value the template builder already computed) |
| `accounts-crud.service.ts` `createAccount` | omitted | `deriveIsMonetary({code,type,isHeader,parentCode,subType}, ancestry)` |
| `accounts-crud.service.ts` `bulkCreateAccounts` | omitted | same, from the in-memory batch ancestry maps (no per-row query) |

The other two paths (`ensureSystemRoleAccounts`, `coa-reconciliation`) were already correct
and were not touched. ONE derivation function, five callers — no second body.

### 3. Repair migration `0314_fix_account_is_monetary_default.sql`

Generated with `npx drizzle-kit generate` (the journal was regenerated, never hand-edited),
then the backfill CTE was appended to the generated SQL. `--> statement-breakpoint` between
statements; no `CONCURRENTLY`; idempotent.

Same lesson as `0313_fix_arabic_coa_em_dash`: a constant materialised into per-tenant rows at
provisioning time cannot be fixed by editing the constant. It recomputes `is_monetary` from
type / sub-type / ancestry and updates ONLY rows that disagree with the derived value
(`IS DISTINCT FROM`), so a re-run matches zero rows. There is no customised value to clobber —
`is_monetary` is server-derived only and absent from every account DTO.

It extends 0104's backfill with the two rungs added to `deriveIsMonetary` AFTER 0104 shipped,
verified by reading the current derivation rather than trusting 0104:
* the semantic rung `type='asset' AND sub_type='non_current_asset'` (IAS 21.16 — so an
  imported chart's fixed-asset leaf coded 1750, with no 1200 in its ancestry, still classifies
  correctly), and
* the `1192` (Purchase Return Clearing) explicit carve-out.

Applied to **both** the Gulf Auto Parts tenant DB and the dev tenant DB (`DIRECT_URL_TENANT`,
NOT `DATABASE_TENANT_URL` — the pooled URL points at a different database). The dev tenant DB
has zero `accounts` rows, so only the ALTER landed there.

### Before / after on Gulf Auto Parts

```
BEFORE                       AFTER
 is_monetary | count          is_monetary | count
-------------+-------        -------------+-------
 t           |   100          f           |    71
                              t           |    29
```
`UPDATE 71`.

```
 code |         name          |  type   | before | after
------+-----------------------+---------+--------+-------
 1131 | Trade Receivables     | asset   | t      | t     <- monetary, correct
 1141 | Merchandise Inventory | asset   | t      | f     <- was wrong
 1161 | Supplier Prepayments  | asset   | t      | f     <- was wrong
 1162 | Input Tax Recoverable | asset   | t      | t     <- monetary (recoverable cash), correct
 3100 | Share Capital         | equity  | t      | f     <- was wrong
 4110 | Product Sales         | income  | t      | f     <- the leg that was retranslated live
 7220 | Unrealized FX Loss    | expense | t      | f     <- was wrong
```

1162 staying monetary while 1161 flips is the exact carve-out the derivation documents (both
sit under the 1160 prepayments group, which is why 1160 is a leaf carve-out and not a subtree
anchor) — a useful check that the backfill really mirrors `deriveIsMonetary` and is not a
blanket subtree sweep.

---

## CRITICAL-1 — the auto-reversal could never post

### The decision
Reversing an unrealized revaluation into the first day of the following period is standard,
correct accounting and the whole point of the mechanism, so the fix is neither to stop
reversing nor to back-date the reversal into the current period. The fix is a narrow
exemption.

### Was there an existing sanctioned mechanism to reuse?
Checked first, per the path-divergence rule. `grep isFuturePeriod` across `apps/api/src`
returns nine call sites (POS, sales, purchase, stock adjustments/transfers, opening import,
draft JEs, reversal eligibility) and every one of them REJECTS a future period. There is no
`allowFutureDating` / `futureDating` / `skipFuture` anywhere in the codebase. Year-end
closing and accruals date their entries INSIDE the period they close, so they never needed
one. There was nothing to reuse; this is the first such mechanism, and it is built as ONE
shared implementation with two callers rather than two guards.

### What was built — `journal-entries/period-end-reversal-event-types.ts`

* **Structural, not a parameter.** The exemption is carried by the event TYPE, not a boolean
  a caller can pass. `isPeriodEndReversalEventType(eventType)` consults a closed
  `ReadonlySet` containing exactly one entry today,
  `FX_UNREALIZED_REVALUATION_REVERSAL_EVENT_TYPE`. No user-facing path can construct such an
  event: manual journal entries go through `JournalEntryDraftService`, which keeps its own
  independent future-date rejection (`journal-entry-draft.service.ts:422`, untouched). Same
  shape as the SAL-PRINT-001 fix — the bad state is unrepresentable rather than guarded
  against.
* **Bounded.** `assertPeriodEndReversalDateAllowed()` resolves the period containing TODAY on
  the tenant's own calendar (the same resolution `isFuturePeriod` itself uses, so the two can
  never disagree), asks for that period's successor, and requires the posting's period to BE
  that successor. Anything two or more periods out is rejected.
* **Loud.** No next period at all, or a target further out, throws a specific actionable
  message. It never silently skips a reversal, because a skipped reversal is a permanent
  unrealized-FX overstatement — the exact failure the mechanism exists to prevent.
* **Never bypasses a lock.** The exemption sits AFTER the HardLocked / SoftLocked branches in
  `postFromEvent`, so a hard-locked next period still throws `ConflictException`. Pinned by a
  test.

`journal-posting.service.ts:510` now reads: reject as before unless the event type is a
period-end reversal, in which case enforce the bound.

### The wrong guard condition in the FX service
`resolveNextPeriodStartDate` checked `nextPeriod.status !== "Open"`. Openness IS a real
constraint and that check is correct and retained — but it was not the constraint that was
firing. September 2026 was Open and the reversal still dead-lettered, because the period was
FUTURE. The service now also pre-flights the SAME shared bound, so an accountant gets a clean
400 at request time instead of an outbox row failing out of sight. One implementation, two
callers.

### Incidental fixes made while in the file
* `LOW-1` — the em dash in `resolveExactClosingRate`'s user-facing error string is gone.
* `${FX_REVALUATION_EVENT_TYPE}.reversal` was spelled by template literal in three places;
  it is now the single constant `FX_REVALUATION_REVERSAL_EVENT_TYPE`, re-exported from the
  accounting core that owns the allowlist, so the emitter and the allowlist cannot drift apart.

---

## Tests

Every existing assertion I could have changed was classified first. **Nothing was rewritten.**
In particular `journal-posting.service.spec.ts` "should reject future-dated transactions" uses
`pos.transaction.completed` — an ORDINARY event — so it encoded CORRECT behaviour and is
untouched and still passing. No snapshot was regenerated.

New tests:

| File | Tests | What they pin |
|---|---|---|
| `accounts/coa-monetary-crud.spec.ts` (new) | 11 | `createAccount` derives monetary for cash/bank and receivables, NON-monetary for inventory (1140 anchor), PP&E (1200 anchor), an imported-chart fixed asset with no 1200 in ancestry (semantic sub-type rung), revenue, expense, equity and headers. `bulkCreateAccounts` derives per row including a parent+child created in the SAME batch, and a bank leaf. |
| `accounts/accounts.service.spec.ts` (+1) | 1 | The template seed — the path that builds every new tenant — SUPPLIES `isMonetary` on every row, the chart contains at least one non-monetary account (the bug's exact signature was that it contained none), 1131/2111 monetary, 1141/3100/4110 non-monetary, and EVERY header and every income/expense/equity row non-monetary. |
| `journal-entries/journal-posting.service.spec.ts` (+5) | 5 | A period-end reversal into the immediately-following period POSTS; an ordinary event into the same period is still REJECTED; a reversal more than one period out is rejected ("not the period immediately following"); no next period fails loud ("there is no fiscal period after"); a hard-locked next period still throws ConflictException. |

Narrow runs, "Test Suites: N" confirmed in each:
```
npx jest coa-monetary-crud --no-coverage                       -> Suites 1 passed, Tests 11 passed
npx jest src/journal-entries/journal-posting.service.spec.ts   -> Suites 1 passed, Tests 118 passed
npx jest src/fx-revaluation/fx-revaluation.service.spec.ts     -> Suites 1 passed, Tests  18 passed
npx jest src/accounts/accounts.service.spec.ts                 -> Tests 68 passed, 7 failed
```
The 7 failures in `accounts.service.spec.ts` are ALL in `bulkCreateAccounts` and are
**pre-existing and not mine**: another session's in-flight AUDIT-002 work added
`getTenantContext()` to `bulkCreateAccounts` without wrapping those tests in a tenant ALS
context ("TenantContext not available"). My own bulk tests wrap themselves in one and pass.
I deliberately did not fix another agent's in-flight tests.

`pnpm --filter @zerupt/db typecheck` clean. `pnpm --filter @zerupt/api typecheck` was clean
on my changes; the shared tree intermittently carries another session's type errors in
`sales/credit-notes/credit-notes.events.ts`, `sales/receipts/receipt-vouchers.events.ts` and
`purchase/returns/purchase-returns-events.spec.ts` — none of those files are mine.


## Fixes applied (reversal account mapping)

The IAS 21 auto-reversal could be DATED correctly (the period-end-reversal exemption
landed) but still could not RESOLVE its accounts: `fx.unrealized_revaluation.reversal`
had no mappings at all and dead-lettered with
`No account mapping found for event="fx.unrealized_revaluation.reversal", lineType="fx_gain"`.
That is now closed.

### The mapping, and why it is NOT crossed

`FxRevaluationService` builds the reversal by copying the revaluation lines and
swapping `debitTC`/`creditTC` only (`fx-revaluation.service.ts`, step 5) - the
lineType is carried through unchanged. Verified against the live dead-lettered
payload, not assumed: it contained `lineType: "fx_gain"` with `debitTC: "6.500000"`
(the revaluation had credited it). So on the reversal `fx_gain` still means "the leg
that faces the gain account", now debited to undo the credit. A straight, same-account
mapping is therefore correct, and crossing gain to loss would be a real money bug:
it would reverse a gain out of 7220 and leave 4830 permanently overstated while the
journal entry still balanced. Pinned by a new assertion in
`fx-revaluation.service.spec.ts` that the reversal preserves the lineType, flips the
side, and emits no loss leg for a reversed gain.

### How it resolves: inheritance, not new seeded rows

The event is registered in `GL_EVENT_REGISTRY` (`packages/shared/src/accounting/gl-event-registry.ts`)
with `inheritsFrom: "fx.unrealized_revaluation"` and lineTypes `["fx_gain", "fx_loss"]`.
`AccountMappingService.resolveAccountsBatch` walks `glMappingEventLookupChain`, so the
reversal resolves through the revaluation's existing rows: 4830 Unrealized FX Gain /
7220 Unrealized FX Loss (deliberately separate from realized 4820/7210).

**No migration was written, and none is needed** - this is a deliberate departure from
the migration-0313/0314 pattern, for a reason that makes the fix strictly better:

- Inheritance resolves at query time from rows every provisioned tenant ALREADY has.
  There is nothing to backfill. The Gulf tenant was fixed by the code change alone,
  proven live below with no DDL.
- Seeding separate reversal rows would have been actively wrong. A tenant that
  repoints `fx_gain` at its own account on the revaluation would keep hitting the
  override on the revaluation while the reversal fell back to the seeded default
  4830 - both entries balancing, the unrealized FX never clearing, invisible to a
  trial balance. That is exactly the class the de-inheritance guard in
  `account-mapping-defaults-completeness.spec.ts` was built to prevent.
- The codebase already forbids the alternative: the existing spec
  "never seeds a row against a contra event" would have failed on seeded rows.

`account-mapping-defaults.ts` now carries an explicit comment recording why there are
deliberately no rows for the reversal. No i18n key was added: contra events are
excluded from `GL_MAPPABLE_EVENT_TYPES`, so the reversal never appears in the mapping
picker - the same treatment `pos.shift.reclosed` already has.

### Why the completeness spec did not catch it

The spec is not a test that cannot fail - it is a real, strong guard. It was BLIND.
Both of its directions are driven off `GL_EVENT_REGISTRY`, so the registry is the
ceiling on what it can see:

- `emitted ⊆ seeded` iterates the registry, which never contained the reversal.
- `seeded ⊆ emitted` only fires on a seeded row, which the reversal did not have.

An event type emitted by code but never ADDED to the hand-maintained registry falls
into neither set. Nothing checked that the registry covers what the code actually
emits. The documentation's claim that adding a mapping "needs no manual step" was
true only downstream of a manual step nobody was guarding.

### How it was strengthened

Two new guards in `account-mapping-defaults-completeness.spec.ts`, closing the two
directions an event type can reach the posting engine:

1. **Privileged event types.** `PERIOD_END_REVERSAL_EVENT_TYPES` is now exported from
   `period-end-reversal-event-types.ts`, and every type in it must be registered AND
   have every line type resolve to a seeded mapping through the chain. This is the
   exact class that shipped broken: a system-generated posting whose constant lives
   in the accounting core, granted a posting-engine privilege, never registered.
2. **Literal emitters.** A scan of `apps/api/src/**/*.ts` (spec files excluded) for
   `eventType: "..."` literals asserts every one is a registered GL event, with a
   documented allowlist for the two events whose every line carries an explicit
   `accountId` and so never consult account_mappings (`inventory.delivery_return`,
   `sales.deliveryBill.cogsReclass` - verified line by line, not assumed). It carries
   a `found.length > 20` sanity assertion so the scan itself cannot silently match
   nothing and pass vacuously.

The registry inheritance pin was updated with the new edge, so removing the
`inheritsFrom` later cannot merge silently either.

### Proof the guards fail

Three separate falsifications, each run and each observed red, then restored green:

| Falsification | Result |
|---|---|
| Deleted the reversal from `GL_EVENT_REGISTRY` (the ORIGINAL bug state) | 2 failed: the privileged-type guard and the inheritance pin |
| Kept it registered, deleted the parent's `fx_gain` default so it cannot resolve | 3 failed, including the privileged-type guard |
| Added an unregistered `eventType: "zztest.unregistered.event"` literal to production source | 1 failed: the literal-scan guard, naming the offender |

Restored: 479 passed, 479 total.

### Live end-to-end verification (Gulf tenant)

Hand-derived FIRST from the FC balances and rates, then compared:

- Exposure: 1131 Trade Receivables, 1000 AED, party-tagged customer
  7fdc347c, booked at 0.0835 = **83.500000 KWD**.
- New ZZTEST closing rate 0.0870 at 2026-08-30 -> 1000 x 0.0870 = **87.000000 KWD**.
- Expected unrealized **gain 3.500000 KWD**; expected legs DR 1131 3.50 (party-tagged)
  / CR 4830 3.50, and a reversal dated **2026-09-01** (first day of the next period)
  that is the exact mirror.
- 4110 Product Sales expected to be EXCLUDED (non-monetary since migration 0314).

Result - matched exactly:

| JE | Event | Posting date | Lines |
|---|---|---|---|
| JRN-00106 | `fx.unrealized_revaluation` | 2026-08-30 | DR 1131 3.500000 (customer 7fdc347c) / CR 4830 3.500000 |
| JRN-00107 | `fx.unrealized_revaluation.reversal` | 2026-09-01 | CR 1131 3.500000 (party tag preserved) / DR 4830 3.500000 |

Both outbox rows `completed` (previously `dead_letter`, attempts 4). Only 1131 was
revalued; 4110 correctly excluded. The reversal hits the SAME 4830, uncrossed, as
reasoned above. A backdated-rate attempt at 2026-08-29 was refused with an actionable
message rather than silently defaulting - FX still fails loud.

### Dead letters

`f701928d-07ce-470d-840e-1206730d4e11` (`fx.unrealized_revaluation.reversal`) was
retried THROUGH THE PRODUCT (`POST /tenant/accounting/dead-letters/:id/retry`) once
the fix made it resolvable. No hand-written correcting journal. It went
`dead_letter -> pending -> processing -> completed` and posted **JRN-00105** dated
2026-09-01: CR 1131 6.500000 (party-tagged), DR 4830 6.500000, DR 4110 6.500000,
CR 7220 6.500000 - the exact mirror of the stranded revaluation JRN-00087, which had
been posted before migration 0314 repaired `is_monetary` and so had wrongly revalued
revenue 4110. Retrying it therefore also unwound that stale overstatement.

The remaining 4 dead letters were left alone (1 `document.amended`, 3
`accounting.post` party-tagging failures - the known Purchase-side
producer/consumer contract mismatch, out of scope).

**Ledger identity: 0.000000 before and 0.000000 after** every write and the API
restart. The 4 opening-balance journals were not touched.
