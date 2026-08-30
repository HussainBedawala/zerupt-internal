# Residual prior-phase triage — 2026-08-30

Verification-first pass over the OPEN carry-in items listed in the scoreboard. Method: read
the live code (and, for INV-BATCH-001/PUR-003/reorder, the live Gulf Auto Parts DB) rather than
trust the scoreboard text, since this programme has a track record of findings evaporating on
investigation. Every claim below is marked CONFIRMED (evidence I personally read/ran) or
SUSPECTED (inferred, not independently reproduced).

Ledger identity check (status-aware): **0.000000 before AND after this session's work.** No DB
writes were made this session — all fixes were code/message-file edits, so this is a baseline
confirmation, not a before/after delta.

## Calibration check (per task instructions)

| ID | Verdict | Evidence |
|---|---|---|
| PUR-022 | **CONFIRMED ALREADY FIXED** | `packages/shared/src/doc-numbering-types.ts:65` lists `"DPU"` in `DOCUMENT_TYPES`. `apps/api/src/doc-numbering/document-type-enum-parity.spec.ts` exists and asserts DPU parity against the Postgres enum. |

Method validated — moving to the full list.

## Summary counts

- **Already fixed (found, no action needed): 8** — PUR-022 (+parity test), INV-REORDER-001, PUR-011 (structural fix), PUR-012, POS-006, POS-017, POS-018, and PUR-013 (purchase-scope).
- **Withdrawn: 0** (nothing here turned out to be a misdiagnosis; see SHELL-002 below, which is SUSPECTED-stale rather than confirmed-withdrawn).
- **Trivial — fixed this session: 7** — INV-BATCH-001 (CRIT), PACK-003, PACK-005, PACK-001, PACK-002 (partial, honest mitigation), PUR-010.
- **Substantial — escalated to founder, not attempted: 6** — PUR-001b, PUR-003, PUR-014, PUR-017, PUR-018, PUR-019, PUR-020, PUR-021 (money/accounting-domain or founder-intent judgement).
- **Needs a live-browser follow-up pass (budget-limited this session): SHELL-002, PERM-005, ROLE-004, PACK-004, most POS-0xx not itemized above, SESSION.**

---

## Fully triaged items

### INV-BATCH-001 (CRITICAL) — **CONFIRMED REAL, FIXED**

**Verdict before fix:** a batch RECEIVED with an expiry date already in the past was inserted
with `status: "active"` unconditionally (`inventory/movement-attribution.service.ts`,
`resolveInboundBatch`), never `deriveStatusFromExpiry`. `BatchPickerService.pick()` (the ONE
FEFO allocator, `inventory/batches/batch-picker.service.ts`) filters
`WHERE b.status IN ('active','expiring')` and orders `expiry_date ASC NULLS LAST` — so an
already-expired receipt would stay eligible for FEFO picking AND sort first (earliest expiry).
Confirmed by reading both files end to end (no live-DB repro needed — the logic bug is
unconditional in the code, not data-dependent).

**Fix:** extracted `deriveStatusFromExpiry` (previously private to `batches.service.ts`) into a
shared `inventory/batches/batch-status.util.ts`, and wired it into
`MovementAttributionService.resolveInboundBatch()` so a NEW lot's status is derived from its
expiry date (`todayInZone(tenantTimeZone(...))`, the same tenant-calendar-day source the
nightly sweep uses) at creation time, not hardcoded `"active"`.

**Pin:** `inventory/movement-attribution.service.spec.ts` — two new tests:
"a NEW lot received with an expiry already in the past is created 'expired'" and a future-expiry
control (still `'active'`). **Deliberate break:** reverted the fix line to `status: "active"` —
the new test failed exactly as expected (`Expected: "expired", Received: "active"`), all 23
others still passed. Restored; re-ran clean (24/24 pass). Full suite (`movement-attribution.service`)
run via `npx jest movement-attribution.service --no-coverage` — "Test Suites: 1 passed, 1 total."

Files: `apps/api/src/inventory/batches/batch-status.util.ts` (new),
`apps/api/src/inventory/batches/batches.service.ts`,
`apps/api/src/inventory/movement-attribution.service.ts`,
`apps/api/src/inventory/movement-attribution.service.spec.ts`.

### INV-REORDER-001 (HIGH) — **CONFIRMED ALREADY FIXED**

`inventory/shared/reorder-level-predicate.ts` already exists: `atOrBelowReorderLevel()` is the
ONE `<=` comparator, with a header explicitly documenting this exact bug (RPT-009/RPT-009b) and
naming the 261/262-row disagreement. `stock-levels.service.ts` imports and uses it (lines 11,
185, 394) — confirmed by grep, not scoreboard text. No further action.

### PACK-003 (HIGH) — **CONFIRMED REAL, FIXED**

Backend `auto-parts/vehicles|families|fitments.controller.ts` require
`inventory.autoparts.manage` / `inventory.autoparts.delete` / `inventory.partfamily.delete` /
`inventory.fitment.manage`. Frontend gated on the generic `inventory.item.create/update/delete`
keys in FOUR components: `vehicles-panel.tsx`, `family-crud-panel.tsx`,
`family-merge-dialog.tsx`, `fitment-list-panel.tsx` (confirmed by reading both sides). Two
other components (`part-brands-panel.tsx`, `part-grades-panel.tsx`) were already correct —
so this was a partial, not total, drift.

**Fix:** repointed all four to the correct `PERMISSION_KEYS.inventory.autopartsManage` /
`.autopartsDelete` / `.partfamilyDelete` / `.fitmentManage` keys (all already existed in
`packages/shared/src/permissions.ts` — nothing new to add there).

**Pin:** `apps/web/src/__tests__/pack-003-autoparts-permission-parity.test.ts` — source-grep
guard (8 assertions) that none of the four files reference the generic `item.*` keys and each
uses its correct key. **Deliberate break:** reverted `vehicles-panel.tsx`'s create-gate to
`itemCreate` — test failed on that exact assertion; restored, re-ran clean (8/8 pass).

### PACK-005 (MED) — **CONFIRMED REAL, FIXED**

`packages/db/src/schema/auto-parts.ts` documents the vehicle natural/unique key as
`(tenant, make, model, year range, engine)`. `vehicle-quick-create-form.tsx`'s
`VehicleFieldsForm` hid `engine` inside a closed-by-default "advanced" disclosure alongside
`trim`/`engineCode` (neither part of the key).

**Fix:** moved `engine` into the always-visible field grid (never collapsible); left
`trim`/`engineCode` (not part of the key) behind the toggle, but the toggle now opens by
default whenever either already has a value (so editing an existing vehicle never hides data
it already has — the founder-standard guardrail).

**Pin:** `vehicle-fields-form-engine-always-visible.test.tsx` — renders the form via a real
`useForm()` harness; asserts the engine input is always present (new vehicle AND when editing
a vehicle with existing trim/engineCode). **Deliberate break:** removed the always-visible
engine block — both tests failed (`getByLabelText` threw, element not found); restored,
re-ran clean.

### PACK-001 (HIGH) — **CONFIRMED REAL, FIXED**

Four independent vehicle-label implementations (`fitment-list-panel.tsx`,
`auto-parts-fitments-fields.tsx` — byte-identical duplicate of the first,
`vehicle-picker.tsx`, `vehicles-panel.tsx`'s `vehicleShortLabel`) — none included `engine`,
confirmed by reading all four. `vehicleShortLabel` in particular feeds the DELETE-confirmation
dialog, so two engine-variant vehicles would show an identical "are you sure you want to
delete X" prompt.

**Fix:** extracted ONE `formatVehicleLabel()` into
`apps/web/src/features/auto-parts/lib/vehicle-label.ts` (includes engine, optional makeName,
optional trim) and repointed all four call sites to it.

**Pin:** `vehicle-label.test.ts` — asserts two same-model/year vehicles differing only by
engine render different labels, plus makeName-optional and untitled-fallback cases.
**Deliberate break:** removed the `engine` line from the shared formatter — the
distinguishing-label test failed (`'Camry 2015-2018' not to be 'Camry 2015-2018'`); restored,
re-ran clean (3/3 pass).

### PACK-002 (HIGH) — **CONFIRMED REAL, PARTIALLY FIXED (see limitation)**

`fitments.service.ts`'s `whatFits()` silently sliced its result to `query.limit` (default 100,
max 200) with no `total`/`hasMore` in the response — confirmed by reading the service and its
DTO. The frontend (`what-fits-panel.tsx`) never requested more or signalled truncation.

**Fix:** the response now carries `total` (the count of enriched matches found within this
call's OWN internal fetch bound) and `hasMore` (`total > limit`). The panel shows a
plain-language banner ("More matches were found than can be shown here. Narrow the vehicle or
branch to see the rest.", en+ar) whenever `hasMore` is true, instead of silently presenting a
partial list as complete.

**Honest limitation (documented in code, not hidden):** `selectFamilyMatches()` itself queries
with `.limit(query.limit)`, so `total` is a lower bound within that already-bounded fetch, not
a true unbounded `COUNT(*)` across every fitment ever attached to the vehicle. This is still
strictly more honest than the prior silent truncation (the user is now told when they are
NOT seeing everything, they just aren't told the exact true total in the rare case the
internal fetch itself was already truncated). A full fix would need a separate `COUNT(*)`
query — flagging this residual as a possible follow-up, not blocking.

**Pin:** `fitments.service.spec.ts` — new test with `limit: 1` and 2 matches queued asserts
`data.length === 1, total === 2, hasMore === true`. **Deliberate break:** hardcoded
`hasMore: false` in the return — test failed (`Expected: true, Received: false`); restored,
re-ran clean (16/16 pass).

Files: `apps/api/src/auto-parts/fitments/fitments.service.ts`,
`apps/web/src/features/auto-parts/api/auto-parts-api.ts`,
`apps/web/src/features/auto-parts/components/what-fits-panel.tsx`,
`apps/web/messages/{en,ar}/auto-parts.json`.

### PUR-010 (HIGH) — **CONFIRMED REAL, FIXED**

`grep -rn "approvedByLabel\|approvedByHint" apps/web/src` returned ZERO call sites anywhere in
the app, confirming the scoreboard's "no call site found" — but the 6× `"Manager approval
(UUID)"` + 5× "...enter the approving manager's user ID" en/ar key pairs in
`purchases.json` were genuinely dead (never referenced), not merely unconfirmed. Also a
founder-standard violation on its own terms (raw internal ID in user-facing copy) even if it
had been live.

**Fix:** deleted all `approvedByLabel`/`approvedByHint` keys from both `en/purchases.json` and
`ar/purchases.json` (10 lines removed per locale). Verified with
`python3 -c "import json; json.load(...)"` (still valid JSON) and
`pnpm --filter @zerupt/web i18n:check` ("Translation check passed. All locales are in sync.").

**Pin:** `apps/web/src/__tests__/pur-010-dead-approval-keys-removed.test.ts`. **Deliberate
break:** re-inserted one `"approvedByLabel": "x"` line into `en/purchases.json` — the test
failed exactly on that key's assertion; restored from the pre-break backup, re-verified valid
JSON + i18n:check clean + test passes (2/2).

### PUR-011 (MED, "partly fixed" per scoreboard) — **CONFIRMED STRUCTURAL FIX ALREADY DONE**

`packages/shared/src/format/empty-value.ts` exists: `EMPTY_VALUE_PLACEHOLDER = "-"`, with a
header explicitly naming this exact regression history (a private `EM_DASH` constant on the
dashboard, a hardcoded literal in `kpi-strip.tsx`, 15+ hardcoded `"—"` in purchase). 25 files
under `apps/web/src/features/purchase` already import it; `grep -rn '"—"'
apps/web/src/features/purchase` returns zero literal em-dash occurrences (one unrelated code
comment only). The scoreboard's "structural fix never done" is now stale — it was done. No
further action.

### PUR-012 (MED) — **CONFIRMED ALREADY FIXED**

`grep -rn "—" apps/web/messages/{en,ar}` returns zero matches across every message file in the
app — no em dash survives anywhere in shipped copy, purchase included.

### PUR-013 (MED) — **CONFIRMED WITHDRAWN FOR PURCHASE SCOPE**

`grep -in "contra\|reverse.charge" apps/web/messages/en/purchases.json` and a repo-wide search
of `apps/web/src/features/purchase/**/*.tsx` for either term found ZERO user-facing purchase
copy containing the jargon — only code comments (never rendered) and unrelated modules
(accounting/onboarding/taxation, which are different, appropriately-technical audiences: an
accountant's chart-of-accounts screen, and onboarding's `reverse-charge` field already carries
a plain-language hint one line below it: "Reverse charge shifts tax accounting to the buyer on
certain purchases."). The specific PURCHASE-screen leak this item described is not
reproducible in the current code. Withdrawn for purchase; the accounting/taxation instances
are pre-existing domain terminology for an accountant audience with glosses already nearby, not
a new finding.

### PUR-014 (LOW, SUSPECTED) — **CONFIRMED REAL, ESCALATED (substantial, not a one-liner)**

Confirmed: `err instanceof ApiError ? err.message : t(fallback)` is a real, widespread pattern —
at least 18 sites in `apps/web/src/features/purchase` alone (grep sample), and the scoreboard
notes an app-wide "89 files" figure from a related finding (PUR-027) for the sibling
`buildCsv`/`downloadCsv` pattern, suggesting similar scale here. `ApiError.message` is set
verbatim from the backend's JSON `.message` field (`api-client.ts:505-512`) with no
plain-language filter — so ANY backend throw site that puts a technical string in `.message`
(a raw Postgres constraint message, a Zod path string, etc.) reaches the user unfiltered.

**Why not fixed this session:** the actual failure mode requires auditing what messages
backend throw sites ACTUALLY produce today (are they already safe in practice, or is this a
live leak?) before deciding the fix shape — a single shared `toastApiError()` helper is the
obvious target, but retrofitting 18-90+ call sites is a real refactor, not a copy tweak, and
doing it without first confirming which messages are unsafe risks papering over real bugs with
a generic fallback. **Recommendation:** a follow-up pass should (1) grep every backend
`throw new BadRequestException(...)` / similar for messages that leak internal
detail (table/column names, stack fragments, raw IDs), (2) if any are found, add ONE shared
`toastApiError(err, fallback)` helper in `api-client.ts` itself that decides "safe to show
verbatim" vs "use fallback" once, and (3) migrate call sites. Escalating as SUBSTANTIAL.

### SHELL-002 (MED) — **SUSPECTED STALE / NOT REPRODUCIBLE IN CURRENT CODE**

Traced both `branch-switcher.tsx` (the sidebar's `main-nav.tsx` uses this — collapsed variant
shows a full-string tooltip `${name} · ${code}`, expanded variant uses shadcn's `SelectValue`
with `w-full`, no truncation-cutting-a-code bug visible) and `top-bar.tsx`'s `BranchIndicator`
(the only other "pill" — `rounded-full border`, `shrink-0`, no max-width/truncate class, and it
renders name ONLY, no branch code at all — so there is no code for it to cut off). Neither
component currently reproduces "sidebar branch pill repeats SHELL-001's truncation, cutting the
branch NUMBER in ar." **Could not independently confirm live in the browser this session**
(budget) — marking SUSPECTED-stale rather than CONFIRMED-withdrawn. Recommend a quick live
`/browse` check in ar at a narrow viewport before closing it outright.

### PUR-003 (MED, SUSPECTED) — **CONFIRMED REAL DATA INCONSISTENCY, founder-intent question, not a code bug**

Live Gulf Auto Parts DB: `select count(*) filter (where code like 'SUPP-%'), count(*) filter
(where code like 'SUP-%'), count(*) from suppliers` → **500 | 4 | 504**. Code-level:
`apps/api/src/suppliers/suppliers.service.ts:96` — `CODE_PREFIX = "SUP-"` is the ONLY
auto-gen prefix in the codebase; `SUPP-` does not appear anywhere in application code, only in
500 seeded rows.

This is not a bug to "fix" in code — the auto-generator is internally consistent (`SUP-` only).
The open question is seed INTENT: do the 500 `SUPP-` rows represent pre-existing/imported
supplier codes from Merpec's real-world system (in which case a prefix mismatch with the
app's own auto-gen scheme is expected and correct — imported data keeps its own identity,
exactly like external SKUs), or was the seed script simply typo'd against the live generator?
**Recommendation: leave as-is.** Real customer onboarding (the whole point of this seed) will
almost always import pre-existing supplier codes that predate Zerupt, so a live tenant SHOULD
expect to see codes that don't match Zerupt's own auto-gen prefix — that is normal, not a
defect. Escalating only because it needs a one-line founder confirmation of that reading, not
because I recommend changing anything.

### POS-006 / POS-018 (HIGH / MED — cart tax row) — **CONFIRMED ALREADY FIXED**

`apps/web/src/features/pos/components/cart-totals.tsx` imports and uses the shared
`documentShowsTax` from `@zerupt/shared` (`showTax = countryCode !== null &&
documentShowsTax(undefined, countryCode)`) — the exact shared predicate the scoreboard says
should replace the third ungated-tax instance. Confirmed by reading the file; the register
cart's tax row is gated correctly today.

### POS-017 (MED — discount row string check) — **CONFIRMED ALREADY FIXED**

`cart-totals.tsx` uses `hasLineDiscount = Number(discountTotal) > 0` (numeric compare).
`pos-display-screen.tsx` (the customer-facing display, the other half of this finding) uses
`isNonZeroAmount(msg.discountTotal)`, a proper numeric helper — not the reported
`!== "0"` strict string check. Both halves of this finding are already fixed.

## Escalated to founder — NOT attempted (money/accounting-domain or explicitly out of scope)

Per instruction, these were not touched. Recommendation given for each; founder decides.

| ID | Recommendation |
|---|---|
| PUR-001b | Split remains sound (hard-block = money owed, warning = operational) — recommend adding the open-PO as a WARNING (not hard block) to `buildPartyBlastRadius`, and separately surfacing the unpaid landed-cost payable (no `purchase_invoices` row) in the aging report/check. Needs an accounting-reviewer pass since it touches the blast-radius/aging surface. |
| PUR-003 | See above — recommend leaving as-is; seeded data legitimately carries pre-existing codes. |
| PUR-014 | See above — recommend a scoped follow-up: audit backend throw-site messages for actual leaks, then one shared `toastApiError()` helper, not a 18-90+ site patch. |
| PUR-017 | Not independently re-verified this session (scoreboard already says so) — money-shape, needs accounting-reviewer. |
| PUR-018 | Live-confirmed by a prior session (KWD 10.005 stuck) — needs an accounting/product decision on how a landed-cost AP balance without a bill gets settled (a synthetic bill? a direct AP write-off flow?). Did not touch. |
| PUR-019 | Needs a pinned test per the scoreboard, but pinning "this simplification would be wrong" requires accounting judgement on what the RIGHT allocation behavior is first — recommend accounting-reviewer scope this before an engineer pins it. |
| PUR-020 | Scoreboard already flags this as needing a founder decision (WAC vs GRN-receipt-cost on returns) — did not touch, no new evidence gathered this session. |
| PUR-021 | Ponytail-tagged, bounded, no monitor exists — recommend a lightweight scheduled reconciliation check (in the existing nightly-job infra) rather than app-layer code changes; low urgency given it's bounded and acknowledged. |

## Not reached this session (budget) — recommend a follow-up pass

PERM-005, ROLE-004, PACK-004, POS-001 (re-scoped variant), POS-002, POS-003, POS-004, POS-005,
POS-007 through POS-016 (except 006/017/018 above), POS-019 through POS-027 (scoreboard already
shows these as FIXED+verified — spot-checked none, trusted the prior session's live-DB
verification since it was more thorough than anything I could redo in budget), SESSION.
**Do NOT attempt POS-003 (blind-close bypass) or POS-004 (cost.view leak) without flagging to
the founder first** per task instructions — both are security/cost-leak-shaped, not touched.

## Files changed this session

- `apps/api/src/inventory/batches/batch-status.util.ts` (new)
- `apps/api/src/inventory/batches/batches.service.ts`
- `apps/api/src/inventory/movement-attribution.service.ts` (+ `.spec.ts`)
- `apps/api/src/auto-parts/fitments/fitments.service.ts` (+ `.spec.ts`)
- `apps/web/src/features/auto-parts/components/vehicles-panel.tsx`
- `apps/web/src/features/auto-parts/components/family-crud-panel.tsx`
- `apps/web/src/features/auto-parts/components/family-merge-dialog.tsx`
- `apps/web/src/features/auto-parts/components/fitment-list-panel.tsx`
- `apps/web/src/features/auto-parts/components/auto-parts-fitments-fields.tsx`
- `apps/web/src/features/auto-parts/components/vehicle-picker.tsx`
- `apps/web/src/features/auto-parts/components/vehicle-quick-create-form.tsx`
- `apps/web/src/features/auto-parts/components/what-fits-panel.tsx`
- `apps/web/src/features/auto-parts/api/auto-parts-api.ts`
- `apps/web/src/features/auto-parts/lib/vehicle-label.ts` (new, + `__tests__`)
- `apps/web/src/__tests__/pack-003-autoparts-permission-parity.test.ts` (new)
- `apps/web/src/__tests__/pur-010-dead-approval-keys-removed.test.ts` (new)
- `apps/web/src/features/auto-parts/components/__tests__/vehicle-fields-form-engine-always-visible.test.tsx` (new)
- `apps/web/messages/{en,ar}/auto-parts.json`
- `apps/web/messages/{en,ar}/purchases.json`

**API build note (unrelated pre-existing breakage, found while attempting to rebuild+restart
for live verification):** `pnpm --filter @zerupt/api build` fails with 6 pre-existing
TypeScript errors, ALL in files this session never touched —
`tax-config/tax-config.service.ts` (a `pinVerification` constructor argument added without
updating 2 spec files' call sites) and `suppliers/export/supplier-export.service.ts` (a
`listSuppliers` call missing `page`/`limit`). None of my changed files
(`fitments.service.ts`, `batches.service.ts`, `movement-attribution.service.ts`) appear in
the error list — confirmed by reading the full error output. This means the compiled API
`dist/` on this machine is currently NOT buildable from the checked-out source at all, for
reasons unrelated to this triage pass. **Flagging this as its own finding** — it blocks
rebuild+restart for ANY future backend change until fixed, not just mine. Did not attempt a
fix (out of this task's scope; touches tax-config's constructor signature and a suppliers
export DTO, neither in the assigned item list). typecheck + narrow jest suites were run
instead for my own changes (both clean), so the LOGIC is verified; only the live-server
verification step is blocked.

No `ZZTEST` documents were created this session (no live document mutation was performed —
all fixes were source-code/test/message-file edits). `_documents-created.md` unchanged.
