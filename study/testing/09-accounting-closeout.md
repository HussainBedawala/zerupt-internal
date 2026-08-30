# Phase F closeout — accounting, print, period close

Date 2026-08-30. Tenant Gulf Auto Parts (Kuwait, KWD 3dp). Every claim below was
verified against source, the live API, or the tenant database by me.

Ledger gate (status-aware), before first write and after last:
`0.000000` both times. The ZZTEST unbalanced draft is untouched.

---

## ITEM 1 — bank reconciliation permissions

### 1(a) "Orphaned permission" — **WITHDRAWN, with evidence**

`accounting.reconciliation.approve` is **not orphaned in the source of truth.**
The **Manager** role template holds it, via the `accounting.approve` bundle:

- `packages/shared/src/permission-bundles.ts` — bundle `accounting.approve` =
  `{ reconciliationApprove, closeApprove }`.
- `packages/shared/src/role-templates.ts` — the Manager template spreads
  `accountingBundleKeys(["accounting.view", "accounting.approve"])`, with a
  written rationale naming this exact key.

The reported SQL is correct but measures a different thing: it lists the roles
**provisioned in this tenant**, and this tenant has never created a Manager role
(templates are opt-in; nothing is auto-created at provisioning). Accountant,
Cashier and Viewer legitimately do not hold `.approve`, because
`reconciliationCreate <-> reconciliationApprove` is an entry in
`SOD_RESTRICTED_PAIRS`. The only holder in the tenant is `ZZTEST Manager`,
which is this programme's throwaway role and correctly reflects the template.

So this is **not** a third instance of the `reports.sales.read` / PRINT-001
class. No role-template change was made, and therefore **no migration was
needed** — a good outcome, since a fleet migration to re-materialise grants was
the risky part of the work.

The real tenant-level fact worth recording: **Gulf Auto Parts cannot finalise a
reconciliation with any non-owner login, because it has no Manager role.** That
is tenant setup, not a code defect. Creating the Manager role from the template
fixes it with no code change.

Evidence for the whole class, not just this key: I swept **every**
`@RequiresPermission` declaration in `apps/api/src` (232 distinct keys) against
the bundle + role-template source. **Four** keys are held by no bundle and no
template, and all four are in `OWNER_ONLY_KEYS` on purpose:
`settings.billing.manage`, `settings.onboarding.start`,
`settings.onboarding.configure`, `settings.onboarding.live`. There are zero
genuine orphans today.

### 1(b) The semantic error — **CONFIRMED and FIXED**

Ruling, and the reasoning:

> Matching a statement line **is** the reconciliation work. It is the maker's
> action, not the checker's. Gating it on `.approve` collapsed maker and checker
> into one role, which is the inverse of a maker-checker control.

Worse than "wrong name": because create and approve are an SoD-restricted pair,
no single role could legally hold both, so the workflow was **structurally
impossible** for anybody but the Owner bypass:

| Who | import statement (`.create`) | match lines (was `.approve`) | finalise (`.reconcile`) |
|---|---|---|---|
| Accountant | yes | **no (403)** | no |
| Manager | **no** | yes | yes |

The Accountant who imports the statement could not touch a single line of it;
the Manager who could match it could not import one. Nobody could run a
reconciliation end to end.

**Change made** (`apps/api/src/bank-reconciliation/bank-reconciliation.controller.ts`):

| Route | Before | After | Why |
|---|---|---|---|
| `POST :id/auto-match` | `.approve` | **`.create`** | maker |
| `POST :id/match-line` | `.approve` | **`.create`** | maker |
| `POST :id/unmatch-line` | `.approve` | **`.create`** | maker |
| `POST :id/no-match` | `.approve` | **`.create`** | maker (a judgement about a line, still the doer's) |
| `POST :id/reconcile` | `.approve` | `.approve` (unchanged) | the checker's single action; keeps the SoD pair meaningful |
| `DELETE :id` | `.void` | `.void` (unchanged) | already correct |
| `GET` routes | `.read` | `.read` (unchanged) | already correct |

Nothing was widened to fix a render bug: `.create` is a key the Accountant
already holds, and the approval step still refuses everyone who lacks
`.approve`. The set is now coherent: **create/import and match = doer, reconcile
= checker, delete = void, read = read.**

Frontend follow-through
(`apps/web/src/features/bank-reconciliation/components/reconciliation-workspace.tsx`):
the matching controls were **ungated in the UI**, so a read-only viewer saw
buttons that 403'd. Added `canMatchPerm` (`reconciliation.create`) and a derived
`matchingDisabled = isReconciled || !canMatchPerm`; the `BankLineRow` prop was
renamed from `isReconciled` to `matchingDisabled` so it no longer lies about
what it means. The reconcile button keeps its separate `.approve` gate.

### Live verification (Gulf Auto Parts, user `accountant1`)

Statement `6c065fd6-04b1-4afa-a2e0-41a2e5c90ee4`, line
`a061226a-2ee7-406a-a31f-d9958fabe1df`.

**BEFORE** (old build still running, captured before the restart):

```
POST :id/auto-match   -> 403
POST :id/reconcile    -> 403
```

**AFTER** (rebuilt once, restarted once):

```
POST :id/auto-match   -> 200  {"totalLines":1,"matchedCount":0,"unmatchedCount":1}
POST :id/no-match     -> 200  {"success":true}
POST :id/unmatch-line -> 200  {"success":true}
POST :id/reconcile    -> 403  {"message":"Access denied","error":"Forbidden"}
```

The maker can now do the work; the approval step still refuses the wrong role.
The line was returned to exactly the state I found it in
(`match_status = unmatched`, `no_match_reason` NULL). No journal was written.
Ledger `0.000000` after.

### The guard against recurrence — **added and PROVEN failable**

New sibling to the PRINT-001 parity test:
`apps/web/src/lib/__tests__/requires-permission-grantable.test.ts` (234 cases).

It walks every non-spec `.ts` under `apps/api/src`, extracts every string
literal inside every `@RequiresPermission(...)`, and asserts each key is
reachable by somebody other than the owner: present in a permission **bundle**,
in a **role template**, or explicitly listed in **`OWNER_ONLY_KEYS`**.

It takes the lesson recorded in the sibling test seriously: **it imports nothing
from `@zerupt/shared`.** `apps/web` resolves that package to
`packages/shared/dist`, so an assertion against the compiled constants would
stay green against a stale build, which is precisely the unfailable-guard
failure this class of test exists to prevent. Every input (the key list, the
accessor map, `OWNER_ONLY_KEYS`, the bundles, the templates) is read from `.ts`
source on disk on every run.

**Proof it fails.** Orphaned one key by deleting `accounting.reconciliationVoid`
from the `accounting.bank` bundle:

```
AssertionError: orphaned permission key "accounting.reconciliation.void"
(declared by bank-reconciliation/bank-reconciliation.controller.ts): no bundle,
no role template, and not OWNER_ONLY_KEYS. Every user except the owner gets a
403 on that route.
 Test Files  1 failed (1)
      Tests  1 failed | 233 passed (234)
```

Restored the line; back to `Tests 234 passed (234)`. Red then green, on a real
edit, not a mock.

Two structural guards are also included so the scan cannot silently go empty:
it asserts more than 150 gated routes were found and that `OWNER_ONLY_KEYS`
resolved to a non-trivial set.

---

## ITEM 2 — ACC-INFRA-002, the migrator silently targeting the wrong database — **CONFIRMED and FIXED**

Root cause, confirmed: `DATABASE_TENANT_URL` and `DIRECT_URL_TENANT` are **two
different real variables**, both in `.env.example`. `DATABASE_*_URL` is the
**pooled** runtime URL; `DIRECT_URL_*` is the **direct, non-pooled** URL, and it
is the one drizzle-kit reads. Setting the documented-but-wrong name therefore
does not override anything: dotenv loads `.env`, the variable is present, the
`if (!url) throw` cannot fire, and the migrator applies a full pending set to
whatever `.env` points at while printing success and exiting 0.

Two fixes, both applied:

1. **The config now names its target before applying anything.** Both
   `packages/db/drizzle.config.ts` and `packages/db-admin/drizzle.config.ts`
   parse the URL with the WHATWG `URL` parser (never string surgery) and print:

   ```
   [drizzle:tenant] target database "zerupt_tenant_dev" on host "ep-xxx.aws.neon.tech"
   ```

   Verified live: `DIRECT_URL_TENANT=...@ep-x.aws.neon.tech/zerupt_tenant_dev
   npx drizzle-kit check` printed exactly that line, ahead of the drizzle output,
   and proved the inline override does win over `.env` when the **right** name is
   used. The throw message was also rewritten to say which URL is wanted and to
   name `DATABASE_*_URL` as the one that is **not** read here.

2. **Reconciled the naming by fixing the docs, not the code.** The code was
   right; `CLAUDE.md` was wrong. I did **not** make the config accept both names:
   accepting the pooled URL as a migration target would be a real hazard (Neon
   pooled connections are the wrong endpoint for DDL), and a second accepted name
   makes "which one won?" a new silent question. `CLAUDE.md` line 125 now states
   the migrator env is `DIRECT_URL_TENANT` / `DIRECT_URL_ADMIN`, that
   `DATABASE_*_URL` are pooled runtime URLs that drizzle-kit does not read, that
   setting one leaves the config falling through to `.env` and still exiting 0,
   and that the target line must be read every time.

---

## ITEM 3 — ACC-FX-003, a committed write reported as a failure — **CONFIRMED and FIXED**

Confirmed by reading the path end to end
(`apps/api/src/fx-revaluation/fx-revaluation.service.ts`):

- The idempotency pre-check reads `journal_entries` by the deterministic
  `eventId` (`reval:<entity>:<date>`).
- The revaluation is posted through the **transactional outbox**, so the journal
  row only exists once the poller or the in-process listener has delivered it.
- Inside that window the pre-check finds nothing, both outbox inserts run, and
  the second submission violates the unique functional index
  `outbox_tenant_event_type_event_id_key`.
- Nothing caught it. A raw 23505 escaped the `db.transaction` call as a
  `DrizzleQueryError`, surfacing as a **500 carrying the constraint name** for a
  write that had already committed correctly.

Fix: the outbox transaction is wrapped, and a unique violation is translated to
a `ConflictException` (409). The detector walks the `.cause` chain (up to 5
levels) because the driver error is wrapped by Drizzle, not top-level; the
existing `close-run.service.ts` helper only checks the top level, which would
have missed this one. Any non-unique error still propagates untouched, so a real
failure is still reported as a real failure.

Copy, plain language, says what to DO, no ids, no dates in machine format, no
internal names:

> "This revaluation has already been submitted and is still being posted. Wait a
> few seconds, then refresh the page to see it. Do not run it again."

The neighbouring already-posted 409 was leaking a raw legal-entity UUID and the
ISO date into its own message; that was the same defect class one step later, so
it was rewritten too:

> "This revaluation has already been posted for that date. Open the period close
> screen to see it, or pick a different date."

Tests: `apps/api/src/fx-revaluation/fx-revaluation.service.spec.ts` gained three
cases — the unique violation becomes a 409 and the message does **not** contain
the constraint name; a non-unique outbox error is **not** a 409; and the
already-posted message leaks no id. `npx jest fx-revaluation --no-coverage`:
**Test Suites: 1 passed, Tests: 21 passed** (was 18). Compiled service verified
fresh by grepping `dist/fx-revaluation/fx-revaluation.service.js`.

I did not attempt a live race reproduction: forcing it means firing two
concurrent revaluation posts at the live tenant, which writes real journals to
chase a defect the requester had already confirmed. The code-path reading is
end to end and the translation is unit-pinned.

---

## ITEM 4 — print items

### PRINT-008 — pack template layer with no producer — **WITHDRAWN**

It is not a dead declaration. It is a **documented reserved position**, marked as
unimplemented in the data itself:

`packages/shared/src/print/resolve-effective-template.ts`
```
{ level: "pack", rank: 3, source: "NOT IMPLEMENTED — declared position only, see module doc" },
```

`packages/shared/src/print/label/label-overrides.ts` carries an explicit
"LIVE vs SEAM (be honest — do not fabricate data for the rest)" block that names
`pack` as a SEAM alongside `country`, `brand` and `branch`, three layers the same
audit did not flag. Its position is pinned by
`__tests__/resolve-effective-template-layers.spec.ts` and
`label/label-overrides.spec.ts`.

Reasons to keep it, not wire it and not delete it:

- **Wiring it fails rung 1 of the ladder.** No pack ships a template default
  today; building the producer would be speculative.
- **Deleting it is churn with a cost.** `rank` is the precedence order; removing
  rank 3 renumbers every layer above it, touching the two pinning specs and the
  resolution assumptions, to save one row in a constant that changes no
  behaviour (no producer means no diff means no effect on any resolution).
- The pack framework is a live architectural commitment, and this tenant runs
  the auto-parts pack. The seam will be used.

The honest-seam pattern here is a strength of the module, not a defect. Nothing
changed.

### PRINT-009 — X-report's undocumented exemption — **PARTLY CONFIRMED, documented**

Investigated rather than assumed, and the shape is narrower than reported:

- `x-report-dialog.tsx` calls `useTranslations`, but it has **no print path at
  all**: no `@media print`, no `window.print()`. Everything it translates is
  screen chrome (dialog title, subtitle, load error, retry, Close button). Chrome
  is supposed to follow the viewer's locale, so this file needs no exemption.
- The part that is actually printed is `ZReportDocument`, which the X-report
  dialog embeds. **That** is the exempt component, and its file header already
  carries the sanctioned justification.

The genuine gap is that the header justified the exemption **only for the
Z-report** and never said the same component is also the X-report's body, so a
reader auditing the X-report found an exemption with no written reason behind it.
An undocumented exemption to a hard rule is how the rule erodes, so I documented
it to the same standard rather than removing it.

Added to the `z-report-document.tsx` header: a "SCOPE OF THIS EXEMPTION
(PRINT-009)" paragraph stating that the exemption also covers the X-report and
**why it holds identically** (the same internal shift figures, read by the same
cashier, mid-shift instead of at close, with no customer on the other end whose
configured language could differ), that nothing else may borrow it, and that
`x-report-dialog.tsx` and `z-report-print-view.tsx` are print/screen chrome
already covered.

---

## ITEM 5 — ACC-PER-009, close management inert — **CONFIRMED; copy improved; template reported not built**

### What is actually true

A sane default close template **already exists in code**:
`apps/api/src/close-management/close-defaults.ts`, `DEFAULT_MONTHLY_CLOSE_TASKS`.
The gap is not that the content is missing; it is that **nothing seeds a template
at provisioning**, so a brand-new tenant has zero templates and close management
is inert until a human clicks "create". The Gulf tenant now has 4 templates named
"Monthly Close" (28 template tasks between them), all created today by this
programme, which is itself a symptom: the create path is easy to run twice and
there is no uniqueness on name.

The pending migration in the tree is `0316_add-close-template-active-unique-idx`,
which addresses exactly that duplication.

### Reported, not built: what a sane default close template contains

The existing constant, in execution order, and it is a good list:

| # | Task | Key | Second review |
|---|---|---|---|
| 10 | Reconcile bank accounts | `reconcile_bank` | no |
| 20 | Review suspense accounts | `review_suspense` | no |
| 30 | Run FX revaluation | `fx_revaluation` | no |
| 50 | Review accruals and prepayments | `review_accruals` | no |
| 55 | Reconcile AR/AP sub-ledger | `reconcile_ar_ap_subledger` | **yes** |
| 58 | Drain the accounting queue | `drain_accounting_outbox` | **yes** |
| 60 | Lock period | `lock_period` | **yes** |

Two properties worth preserving in any future seeding work:

- "Post depreciation" was deliberately **removed** because no fixed-assets module
  exists. A checklist item the system cannot evidence trains the reviewer that
  ticking without evidence is normal, on the one screen whose job is to demand
  evidence. Do not re-add it before depreciation posting ships.
- For a **Kuwait, single-currency, no-tax** tenant like this one, "Run FX
  revaluation" is inert too. A seeded default should derive its task list from
  the tenant's own facts (multi-currency on/off, tax on/off) rather than seeding
  all seven blindly, or it reproduces the same lie in a smaller way.

Recommendation (not built, per scope): seed one default template at provisioning
from this constant, filtered by tenant facts, and rely on migration 0316's
uniqueness index to stop the duplicates. That is a provisioning change with a
fleet migration behind it, which is more than "cheap and safe".

### What I did change: reversibility is now explicit

The lock **confirm dialogs** already said it
(`lockConfirm.softLockConfirmDescription`, `lockConfirm.hardLockConfirmDescription`),
but the two places a user actually reads after the fact did not: the status
meaning shown against a locked period, and the success toast. Both now say it, in
en and ar:

| Key | After |
|---|---|
| `periods.statusMeanings.SoftLocked` | "... You can reopen it later if you need to." |
| `periods.statusMeanings.HardLocked` | "... You can still reopen it later if you need to, and the reason you give is saved." |
| `toasts.periodLocked` | "This month is now closed. You can reopen it later if you need to." |
| `toasts.periodsLocked` | "Periods closed. You can reopen them later if you need to." |

Plain language, no jargon, no em dashes, ar and en both edited, parity verified.
The flow itself was not redesigned.

---

## Gates

| Gate | Result |
|---|---|
| `pnpm --filter @zerupt/api typecheck` | clean |
| `pnpm --filter @zerupt/web typecheck` | clean |
| `pnpm --filter @zerupt/web i18n:check` | "All locales are in sync" |
| `npx jest fx-revaluation --no-coverage` | Test Suites: 1 passed, Tests: 21 passed |
| `npx jest bank-reconciliation --no-coverage` | Test Suites: 9 passed, Tests: 112 passed |
| `npx vitest run reconciliation route-permissions settings-sections requires-permission` | Test Files 10 passed, Tests 371 passed |
| Ledger gate (status-aware), before and after | `0.000000` |

API was rebuilt **once** and restarted **once**. Freshness confirmed by grepping
the compiled service files, not `dist/main.js`. No destructive git. No subagents
spawned. No migration written, because none was needed.

## Assertions changed

Only additions. Three new `fx-revaluation` cases (new behaviour, previously
unasserted) and one new test file. No existing assertion was rewritten or
deleted, so nothing fell into the "asserting the old buggy behaviour" or "now
meaningless" categories. No snapshot was touched.

## Withdrawn

- **ITEM 1(a)**, orphaned `accounting.reconciliation.approve`: the Manager
  template holds it. The tenant simply has no Manager role.
- **PRINT-008**, dead pack template layer: a documented, tested, deliberately
  unimplemented seam.
- **PRINT-009** narrowed: the X-report dialog needs no exemption at all (it never
  prints); the real gap was the scope of `ZReportDocument`'s header, now closed.
