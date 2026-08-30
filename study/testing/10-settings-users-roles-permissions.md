# 10 — Settings: Users, Roles & Permissions

**Scope note (superseded, see Addendum below):** the section immediately below was written
under an over-applied resource constraint that mistakenly ruled out SQL and browser use
entirely. The coordinator corrected this. The **Addendum — live verification pass** section
after it contains the SQL, live browser session, and scoped grep results that close most of
the gaps this first section lists as unverified. Read both; the addendum supersedes any
conflicting statement above it (there are none — everything below held up).

## Findings

### F1 — MEDIUM — CONFIRMED (code) — Permission changes propagate to the backend
instantly, but the frontend's own permission cache can lag up to 5 minutes for the
AFFECTED user, with no in-app notice

- `apps/api/src/auth/permission.service.ts`: `hasPermission` / `evaluatePermissions` load
  active roles **fresh from the DB on every call**, explicitly documented as "No caching of
  any kind... nothing can leak across requests, users or tenants." So server-side enforcement
  (`@RequiresPermission`) reflects a role edit on the very next request. Backend propagation
  delay: effectively 0.
- `apps/web/src/features/auth/api/permissions-queries.ts`: `usePermissions()` uses
  `staleTime: 5 * 60 * 1000` (5 minutes) on `PERMISSIONS_QUERY_KEY`, "Permissions rarely
  change within a session, so this uses a long staleTime."
- The only places that invalidate `PERMISSIONS_QUERY_KEY` are
  `apps/web/src/features/roles/api/roles-queries.ts` and
  `apps/web/src/features/team/api/team-queries.ts` (grepped, no other references) — both fire
  on the **acting** user's own mutation (the owner who just edited the role), invalidating
  *their own* cache. There is no websocket/SSE/polling channel that tells a **second, already
  logged-in** browser session that its permissions changed.
- Net effect: if the owner revokes a permission from a role while another user with that role
  is active, the backend refuses the very next write from that user (correct, fail-closed),
  but that user's **UI** (nav items, buttons gated by `useHasPermission`) can keep showing the
  now-stale "you have access" state for up to 5 minutes, and nothing in the product tells them
  their access changed or that a re-login/refresh would sync it.
- **Not independently live-verified with two sessions** per the brief's instruction (blocked by
  the mid-task no-browser-session-fanout constraint); this is a full code-path read, not a
  timed observation. Recommend a follow-up session actually clock the real-world delay and
  confirm the failure mode in the browser (does the stale button click 403 cleanly, or does it
  hang?).
- **Fix direction (not applied — out of budget this pass):** either shorten staleTime for this
  one query, or add a lightweight signal (e.g. re-check permissions on 403, or a
  `refetchOnWindowFocus` override for this query) plus a toast when a 403 arrives for an action
  the cached permission set claims is allowed. This is exactly the shared primitive noted in F3
  — worth doing together.

### F2 — Settings' own Users/Roles create flows do **NOT** exhibit the PERM-004 pattern —
WITHDRAWN before filing

Investigated because the task named PERM-004 as "now your module's problem" and asked me to
close it here. On reading the actual components:

- `apps/web/src/features/roles/components/roles-panel.tsx` line 51:
  `const canCreate = useHasPermission("settings.role.create");` and the create trigger is
  rendered conditionally: `{canCreate && (<Button ...>)}` (line 254) — a user without
  `settings.role.create` never sees the create dialog trigger at all, so there is no
  fully-interactive-then-blocked-on-submit form here.
- `apps/web/src/features/team/components/team-panel.tsx` line 47:
  `const canInvite = useHasPermission("settings.user.invite");`, passed down to gate the
  invite trigger the same way.
- Backend (`apps/api/src/roles/roles.controller.ts`, `apps/api/src/team-users/team-users.controller.ts`)
  independently enforces `settings.role.create` / `settings.user.invite` via
  `@RequiresPermission`, so this is defense in depth, not client-only.

**Conclusion: Settings' Users and Roles create surfaces do not have a PERM-004 instance.**
I am not filing a fix here. The known open instances (XFER-001 in inventory transfer edit,
POS-011 in the POS void button) live in files outside my ownership (inventory/POS features,
not `settings-users`/`settings-roles`/the permission-gating primitive), so per the file-ownership
rule I did not touch them. I looked for an existing shared "permission-aware form wrapper" to
generalize (`PermissionGate`, `RequirePermission`, etc.) and found none — each screen currently
hand-rolls its own `useHasPermission` + conditional render, done correctly in Settings but
inconsistently elsewhere (per the prior study files: XFER-001, POS-011, and the fixed
PUR-025/PUR-026). **Recommendation for a follow-up pass with the right file ownership:** extract
one shared primitive (e.g. a `<Gated permission="...">` wrapper or a `useGatedForm` hook that
both hides the trigger AND disables/dims the fields as a fallback for screens that can't hide
the trigger cleanly, e.g. deep-linked edit routes like XFER-001) and migrate all three known
open instances onto it in one commit, rather than patching each screen a third time.

### F3 — Route-permission parity tests exist and pass; nav-item parity test does not need
to (and does not) cover Roles/Members — WITHDRAWN as a gap

Two separate parity tests exist:
- `apps/web/src/components/shell/__tests__/route-permissions-backend-parity.test.ts` — covers
  **top-level nav items** (audit is the only Settings item there: `PK.settings.auditRead` ↔
  `audit/audit-log.controller.ts`). 35/35 passing (`npx vitest run route-permissions-backend-parity`,
  confirmed "Test Files 1 passed (1)", "Tests 35 passed (35)").
- `apps/web/src/lib/__tests__/settings-sections-backend-parity.test.ts` — covers **Settings
  sub-sections**, including the ones this task cares about:
  `[PK.settings.roleRead]: "roles/roles.controller.ts"` and
  `[PK.settings.userList]: "team-users/team-users.controller.ts"`. 49/49 passing (confirmed
  "Test Files 1 passed (1)", "Tests 49 passed (49)").
- My first read of only the nav-item test made it look like Roles/Members were uncovered — they
  are not; they're covered by the sibling test, which is the correct design (Settings is a
  single nav entry with its own sub-navigation, so it needs its own parity file rather than
  bloating the top-level one). **Recording this as a withdrawn near-miss** per the brief's
  instruction to record items investigated and dropped, since it would have been a false
  finding if reported from the first grep alone.

### F4 — pos.session.close is NOT manager-only by design — the task's premise item 7(b)
is stale; WITHDRAWN, already resolved

`packages/shared/src/permission-bundles.ts` lines 53-73: `pos.sessionClose` is a member of the
**`pos.sell`** bundle (the baseline cashier bundle), not `pos.supervise` (the manager/approval
bundle). The code comment states the ruling explicitly: "the founder ruling is that the person
who runs the register can close the register — a one-person shop should never have to invent a
manager user just to close the till at end of day. The real controls at close are the blind
expected-cash count + recorded variance and the per-register approval-gate setting (default
OFF), not the permission key." So `cashier1` (or any role with the `pos.sell` bundle) already
holds `pos.session.close`; "only the owner can close a shift because there's no manager role"
does not describe the current code. **Recommendation: no action needed** — this decision has
already been made and shipped; the task brief's framing predates it. If a live session still
shows only the owner able to close a shift, that would mean cashier1's actual assigned role in
this tenant lacks the `pos.sell` bundle (a tenant data/config issue, not a permission-model
issue) — worth a live check in a follow-up pass, not re-litigating the bundle design.

### F5 — Payment Methods reachability (task item 7a) — RECOMMENDATION, not independently
live-verified

`pos.tenderTypeManage` / `pos.tenderTypeRead` live in the **`pos.configure`** bundle
(`packages/shared/src/permission-bundles.ts` "Back-office POS setup: registers and payment
methods"), which is separate from both `pos.sell` and `pos.supervise`. Whether Payment Methods
is reachable by anyone other than the owner in Gulf Auto Parts depends on which bundles are
attached to which roles in that tenant's `role_permissions` — I did not query this live (budget
constraint), so I cannot confirm "owner-only reachable" as a fact from this pass, only that the
bundle model supports delegating it.
**Recommendation:** Payment Methods configures where money is recorded to land (tender→GL
routing), which is exactly the kind of screen this programme has repeatedly found needs to stay
narrow. Do not fold `pos.configure` into `pos.sell` or `pos.supervise` by default. Instead:
(1) confirm via SQL whether any non-owner role in this tenant actually holds `pos.configure` —
if none does and the founder wants a manager role to be able to add a new tender type without
owner involvement, the fix is a **seeded "Store Manager" role template** that bundles
`pos.supervise` + `pos.configure` + `pos.session.close` (redundant with pos.sell but harmless),
offered at signup/onboarding, not a change to the bundle definitions themselves; (2) this pairs
naturally with F4 — the same seeded manager role would also resolve "no manager role exists in
this tenant" if that turns out to be true on live inspection.

## Founder's acceptance test

**Could an untrained Kuwaiti shop owner add a user and give them the right access, first try?**

From code reading (not a live click-through, so click counts below are estimated from the
component tree, not measured in-browser — flagged as SUSPECTED, not CONFIRMED):
- Team panel → Invite dialog (`invite-user-dialog.tsx`) is gated behind `canInvite`, which the
  owner always holds, so the trigger is visible.
- The invite flow requires: email, a role selection (mandatory — no default role, by design,
  since granting is a permission-ceiling-checked act per `permission-ceiling.ts`), and
  presumably a location/branch assignment given the multi-location product design (not directly
  read this pass).
- The **hard part for an untrained owner is not the invite form, it's the ROLE**: to "give them
  the right access" the owner must either pick an existing role (Cashier/Accountant/Viewer seen
  in the DB baseline) or build a custom one via the permission matrix
  (`permission-matrix.tsx`), which is a fine-grained, technical, per-key checkbox UI. There is
  no evidence (in the files read this pass) of a role **template picker** ("I run a shop, give
  my cashier the usual cashier things") beyond the pre-seeded system roles. If the pre-seeded
  roles cover the shop owner's actual staff (cashier, accountant, storekeeper — which this
  tenant's seed data already has), the first-try answer is **yes**: pick the matching seeded
  role name, invite, done, under 60 seconds, no dialog stacking observed in the component tree.
  If the owner needs a role that doesn't already exist (e.g. "a manager who can close shifts and
  approve discounts"), they are dropped into the raw permission matrix, which an untrained owner
  will not complete correctly on the first try — this is precisely the gap F5's recommended
  seeded "Store Manager" role would close.
- **Verdict: yes for the common case (assign an existing seeded role), no for anything requiring
  a new role** — and the fix is not a UX form fix, it's the missing seeded role template from
  F4/F5. Not independently confirmed by clicking through the flow this pass.

## Orphaned permissions

Not completed to the standard the brief asked for (a two-way diff of the full registry against
every `@RequiresPermission` call site) — this needs a repo-wide grep the resource constraint
message explicitly asked me to avoid doing broadly, and I ran out of budget before scoping it
narrowly per-directory. **Not verified this pass** — flagging rather than guessing. Per the
brief's own warning, a "third orphaned permission" claimed by a prior session turned out false
on investigation, so I am not going to assert one without checking.

## Could not verify (explicit gaps against the task brief)

- Live two-session permission-propagation timing (F1 is code-only; no browser session opened).
- Any SQL — no queries run against the tenant DB this pass (zero writes, so the orchestrator's
  baseline role_permissions counts are unchanged; nothing to restore).
- Keyset pagination past page 1 on Users/Roles lists, live filters, exports (open-and-check),
  ar/en + RTL visual pass, responsive breakpoints — none of section D/E/F of the per-screen
  checklist was run live.
- Audit-log row verification for user/role mutations (item 3 in briefing's checklist C).
- Full orphaned-permission diff (see above).
- Live confirmation of F4 (does cashier1 in Gulf Auto Parts actually hold `pos.sell` and
  therefore `pos.session.close`) and F5 (does any non-owner role hold `pos.configure`).
- `z.coerce.boolean()` grep specifically within settings DTOs — not run this pass.
- "Guard rendered inert by uniform data" check on any Settings screen — not run this pass.

## Permission-restore verification

No writes were made to any role, permission, or user record during this pass. The orchestrator's
recorded baseline (`role_permissions`: Accountant 114, Cashier 20, Viewer 72, "ZZTEST Manager"
148, "ZZTEST Audit Probe 1788061862" 1) should be unchanged; I have no counter-evidence and made
no changes that could have touched it. No ledger-identity query was run (no writes to restore
against), consistent with the "zero writes" scope of this pass.

## Addendum — live verification pass (SQL + browser + scoped grep)

Corrected scope: SQL against the tenant is cheap and expected, a short browser session is
expected, and scoped ripgreps (not whole-tree scans) are fine. This addendum does that work.

### A1 — F4 upgraded from code-only to CONFIRMED (live SQL)

Connection: `$G` from `study/testing` scratchpad, tenant `zerupt_tenant_gulf_auto_parts_mt5kya1i`.

```
select r.id, r.name from roles order by name;
-- Cashier role_id = d1a81760-e09d-4354-b56b-56cc3c97082f

select permission_key from role_permissions
  where role_id='d1a81760-e09d-4354-b56b-56cc3c97082f' order by 1;
```
Result includes `pos.session.close` (confirmed: `select count(*) from role_permissions where
role_id='d1a81760-e09d-4354-b56b-56cc3c97082f' and permission_key='pos.session.close';` → `1`).

**F4 is now CONFIRMED, not just code-read**: the Cashier role in Gulf Auto Parts actually has
`pos.session.close` MATERIALISED into `role_permissions`, matching the `pos.sell` bundle
definition. The task's premise ("pos.session.close sits in the MANAGER bundle... only the
owner can close a shift") does not hold in this tenant's live data. No fix needed; the
guard-rendered-inert-by-data risk the coordinator flagged was checked and does NOT apply here —
the materialised data agrees with the code.

### A2 — F5 upgraded to CONFIRMED (live SQL): Payment Methods IS owner-only reachable here

```
select r.name, rp.permission_key from role_permissions rp join roles r on r.id=rp.role_id
  where rp.permission_key in ('pos.tenderType.manage','pos.tenderType.read') and r.name<>'Owner';
```
0 rows. No non-owner role (Cashier, Accountant, Viewer, ZZTEST Manager) holds either
tender-type permission in this tenant. **Confirms the task's premise (a): Payment Methods is
owner-only reachable in Gulf Auto Parts, materialised, not just by omission in a demo role.**
Recommendation unchanged from the withdrawn-code-only section above: keep it narrow by default
(financial routing config), offer a seeded "Store Manager" role bundling `pos.configure` for
tenants that want to delegate it, rather than folding it into `pos.sell`/`pos.supervise`.

### A3 — Orphaned-permission two-way diff: COMPLETE, zero true orphans found

Two scoped commands, run from `erp/`:
```
rg -o "@RequiresPermission\(\s*[\"'][^\"']+" apps/api/src --no-filename \
  | sed -E "s/.*[\"']//" | sort -u   # 242 unique first-argument keys
grep -oE ':\s*"[a-zA-Z0-9.\-]+"' packages/shared/src/permissions.ts \
  | sed -E 's/^:\s*"//; s/"$//' | sort -u   # 252 registry keys
```
First pass (`comm`) showed 16 registry keys with no `@RequiresPermission` hit and a handful of
kebab/camelCase mismatches. **Every one of the 16 was a false positive from my own
extraction**: my `rg -o` pattern only captures the FIRST quoted argument of
`@RequiresPermission(a, b)` — an OR-permission decorator's second argument (e.g.
`@RequiresPermission("settings.webhook.read", "settings.webhook.list")`) was invisible to the
grep, not actually unused. Verified each of the 16 individually with a direct `rg -n` for the
literal string:
- `settings.export.read`, `settings.retention.read`, `settings.webhook.list` — each IS used, as
  the second OR-argument on a real controller route (`data-export.controller.ts`,
  `retention.controller.ts`, `webhooks.controller.ts`).
- `settings.owner.read` — a synthetic sentinel key (`ownerBypass`), never meant to gate a route;
  used in `OWNER_ONLY_KEYS` and covered by `permissions.test.ts` and `roles.service.spec.ts`.
  By design, not an orphan.
- The remaining 12 (`accounting.close`, `pos.cash.approve`, `pos.discount.approve`,
  `pos.return.approve`, `pos.transaction.amend`, `purchase.bill.amend`, `sales.invoice.amend`,
  `sales.invoice.credit-limit-override`, `cash.approve`, `discount.approve`, `return.approve`,
  `accounting.period.override-config`) are all used elsewhere (bundle definitions,
  permission-ceiling assertions, service-level `hasPermission` checks mid-flow rather than a
  route-gating decorator) — 9-20 file hits each on a direct grep, not zero.
- The reverse direction (`@RequiresPermission` string used but absent from the registry) had
  zero real hits — the only lines shown were template-literal artifacts
  (`${route.permission}`, `...`) from dynamic permission checks in test helpers, not real
  permission strings.

**Conclusion: no orphaned permissions exist in the Users/Roles/Settings surface or anywhere
else in the API, after correcting for the OR-argument extraction gap.** This matches the
programme's stated pattern — the "third orphaned permission" from an earlier session also
turned out not to be one.

### A4 — z.coerce.boolean(): confirmed clean, codebase-wide guard exists

```
rg -n "z.coerce.boolean" apps/api/src
```
Every hit is a comment, a spec file, or the guard test's own scan logic
(`apps/api/src/common/query-boolean.schema.spec.ts`) — zero live occurrences in application
code. Ran the guard test directly:
```
npx jest query-boolean.schema.spec --no-coverage
# Test Suites: 1 passed, 1 total
# Tests:       10 passed, 10 total
```
This test scans ALL of `apps/api/src` (not just settings) and fails the build the moment any
file reintroduces `z.coerce.boolean(`. Also checked `team-users`, `roles`, `security-settings`,
`approval-pin` for the softer variant (`Boolean(query.x)`, `=== "true"` string comparisons) —
zero hits. **No boolean-coercion trap found in Settings.** This CRITICAL-class defect is fully
guarded here.

### A5 — F1 live verification: BLOCKED by the environment's own write/session-switch classifier

Attempted the live two-session test as directed: toggle a permission on the Cashier role via
the actual app (owner UI in a second browser tab), observe an already-logged-in cashier1 tab
for the propagation delay, then revert.
- Logging in as `cashier1` succeeded (after retrying twice past another concurrent agent's
  navigation on the shared browser daemon — confirms briefing rule 2, "agents share one
  browser," is a live condition right now, not a hypothetical).
- Both the raw-SQL route (`INSERT INTO role_permissions ...` to grant `settings.audit.read` to
  Cashier, intending to restore after) and the browser route (`newtab` to open a second, owner
  session) were **refused by this environment's auto-mode safety classifier** ("Permission for
  this action was denied by the Claude Code auto mode classifier"), independent of my
  write-safety plan (I had the exact restore SQL ready before attempting the insert). Per the
  session's own instruction to stop rather than route around a genuine block, I did not retry
  with a different mechanism to force the write or the tab switch.
- **F1's propagation-delay claim is therefore still code-level, not live-timed.** It has NOT
  been downgraded, because the underlying evidence remains solid (see below), but the specific
  "measure the actual observed delay" ask in the brief could not be completed this session. A
  session with either broader Bash-write permission or a personal (non-shared) browser profile
  could finish this in under 10 minutes: grant a permission through the owner's Roles UI, watch
  an already-open second-user tab for up to 5 minutes without reloading, then hard-reload and
  confirm it updates immediately (proving the 5-minute number is `staleTime`, not a hard cap).

**One live finding did come out of the cashier1 session while investigating this (see A6).**

### A6 — NEW, MEDIUM, CONFIRMED (live) — permission-denied and plan/country-denied Settings
sections show IDENTICAL, misleading copy

While on the live cashier1 session: navigating to `/settings/audit` and `/settings/roles` (both
correctly denied — cashier1 holds neither `settings.audit.read` nor `settings.role.read`, per
A1's role dump) rendered:

> **Not available for your configuration** — This setting is not available for your current
> plan or country configuration.

Read `apps/web/src/components/settings/section-gate.tsx`: `SectionGate` renders this exact
`t("unavailable.title")` / `t("unavailable.description")` empty state whenever
`isSectionVisible(...)` returns false, for ANY of five unrelated gate reasons collapsed into
one boolean (`config?.countries || config?.requiresConsumptionTax || config?.requiresModule ||
config?.requiresBilling || config?.requiresPermission`). The copy in
`apps/web/messages/en/settings.json` ("not available for your current plan or country
configuration") is written for the plan/country case only, but a plain permission denial
(a Cashier with no role/audit permission) hits the exact same branch and the exact same string.

This directly violates the founder's standard: "Plain language... Error copy says what to DO,
not what broke internally." A shop owner's cashier who can't see Roles & Permissions is told
their PLAN or COUNTRY is the problem (implying they need to pay for an upgrade or that Kuwait
doesn't support the feature) when the real, fixable-by-the-owner reason is "you don't have
permission — ask your owner to grant `settings.role.read`." This is worse than a generic
"access denied": it's actively wrong about the cause and offers no path to a fix.

**Severity: MEDIUM.** Not a security or data issue (the correct role list is enforced
server-side either way, and the frontend correctly hides the content) — this is a founder's
standard violation on copy/UX, live-confirmed on two Settings sections in one session, and the
underlying `SectionGate` component is used across all `settings-sections.ts` entries, so it
likely affects every permission-gated Settings section a lower-privilege user might deep-link
to (not just Roles/Audit).

**Fix direction (not applied — this is `apps/web/src/components/settings/section-gate.tsx`,
inside my file-ownership area, but I stopped short of editing given the session's tab/write
contention and the coordinator's ask to report before continuing):** branch the copy on WHICH
condition of the `isGated` boolean actually tripped — `config?.requiresPermission` should render
a distinct "You don't have access to this / ask an owner or admin to grant it" message,
separate from the plan/country/module/billing branches. This is a one-file, well-scoped fix
Settings should own; flagging rather than shipping it mid-session given the classifier blocks
above made me cautious about further live writes in this pass.

### A7 — Audit capture: role mutations write correctly; one pre-existing gap is ALREADY TRACKED,
not new

```
select user_email, action, entity_type, entity_id, created_at from audit_log
  where entity_type in ('Role','User','TeamUser','UserRole')
  order by created_at desc limit 15;
```
Result: three clean `Role` create/update/delete rows, each with the correct actor
(`anonymator8@gmail.com`, the owner) and a real `entity_id` (role UUID). One older row
(2026-08-26 08:11:05, `create` / `Role` / entity_id **`unknown`**) predates the three clean
ones — investigated rather than assumed stale: checked
`apps/api/src/audit/audited-void-response-completeness.spec.ts` (AUDIT-005/Phase F), which is
an existing, tracked, and TESTED class of this exact defect (`@Audited` handler with a void
response and no `:id` route param falls back to the literal string `"unknown"`, by design for
specific documented cases like approval-pin's `resetPin`). Also found live: three
`UserApprovalPin update` rows with `entity_id = 'unknown'` (cashier1, ZZTEST Manager's user, and
the owner), which match this exact documented case
(`apps/api/src/audit/audit-entity-registry.ts` line ~544: "Manager PIN→token exchange... No
stored row... entityId resolves to 'unknown' (see the controller's comment)").
**Conclusion: the `UserApprovalPin` "unknown" rows are an already-known, already-tested,
deliberate gap (not new). The one historical `Role` "unknown" row looks like a one-off from
before or during this class's fix, since every subsequent Role mutation captured a proper id —
not re-filing it as a live defect.** No new audit-capture bug found in Users/Roles.

### A8 — Ledger + role_permissions integrity: unchanged, verified before and after this addendum

Before addendum work: `role_permissions` counts (Accountant 114 / Cashier 20 / Viewer 72 /
ZZTEST Manager 148 / ZZTEST Audit Probe 1) matched the coordinator's stated baseline exactly.
The one write attempt (`INSERT` granting Cashier `settings.audit.read`) was refused by the
environment before it reached the database — confirmed by re-running the same count query
after the refusal:
```
select r.name, count(*) from role_permissions rp join roles r on r.id=rp.role_id
  group by r.name order by 1;
--  Accountant | 114
--  Cashier    | 20
--  Viewer     | 72
--  ZZTEST Audit Probe 1788061862 | 1
--  ZZTEST Manager | 148
```
Identical to baseline — **no restore was necessary because no write landed.** Ledger identity
also re-checked and unchanged:
```
select round(sum(l.debit-l.credit),6) from journal_entry_lines l
  join journal_entries je on je.id=l.journal_entry_id
  where je.status in ('posted','reversed');
-- 0.000000
```

## Updated summary of what changed in this addendum

- F4: code-only → **CONFIRMED live**. No action needed.
- F5: code-only → **CONFIRMED live**. Recommendation unchanged (seed a manager role for
  delegation, do not widen existing bundles).
- Orphaned permissions: **complete, zero true orphans**, with the false-positive mechanism
  explained (single-argument regex missing OR-permission second arguments).
- z.coerce.boolean(): **confirmed clean** across all of `apps/api/src`, codebase-wide guard test
  passing.
- F1: still code-level only. The live two-session timing test was **blocked by this
  environment's own safety classifier** on both the SQL-write and new-browser-tab routes I
  tried; not something I could route around within this session's constraints. Recommend a
  follow-up session with either a personal browser profile or direct write permission finish
  the timed observation.
- New finding A6 (MEDIUM, CONFIRMED live): permission-denied and plan/country-denied Settings
  sections render identical, misleading "not available for your plan or country" copy via the
  shared `SectionGate` component — a founder's-standard violation, not filed before this pass.
- Audit capture (A7): role mutations audit correctly; the one "unknown" entity_id class found is
  pre-existing, tracked, and tested (AUDIT-005/Phase F), not a new defect.
- Write safety: zero permission/role changes landed in the database this entire session (both
  attempts were refused before reaching Postgres); `role_permissions` counts and ledger identity
  verified unchanged before and after.

## Still not done (explicit, after the addendum)

- F1's actual timed propagation delay and the "is the user told" question — blocked as
  described in A5.
- Section D/E/F per-screen checklist items: pagination past page 1, filters, export
  (open-and-check), ar/RTL visual parity on Users/Roles screens — not reached this session; the
  addendum's single successful browser session was spent on the login + two denied-section
  visits that produced A6, before further session/tab attempts were blocked.
- The founder's acceptance test click-count is still based on code reading, not a live
  stopwatch run of the invite flow.

## Addendum 2026-08-30 — Store Manager role-template gap closure (F5 fix shipped)

**THE GAP (recap, already CONFIRMED live by SQL before this pass):** in Gulf Auto Parts, zero
non-owner role held `pos.tenderType.manage` / `pos.tenderType.read` (the `pos.configure`
bundle), so the POS Payment Methods screen was reachable ONLY by the tenant Owner. `pos.session.close`-in-`pos.sell` is unrelated and already resolved (not re-litigated here).

### Design: composed from bundles, dynamically, matching the existing pattern

`packages/shared/src/role-templates.ts` is the existing single source of truth: every shipped
template (Cashier, Manager, Viewer, Accountant, Refund approver) is composed by calling
`posBundleKeys(...)`, `inventoryBundleKeys(...)`, etc. against
`packages/shared/src/permission-bundles.ts` — never a hand-typed permission-string list. Added
a sixth template, `storeManager`, following the exact same pattern:

```ts
const storeManager: RoleTemplate = {
  id: "store-manager",
  name: "Store Manager",
  defaultPriority: 30,
  permissions: [
    ...posBundleKeys(["pos.sell", "pos.supervise", "pos.view", "pos.configure"]),
    ...inventoryBundleKeys(["inventory.view"]),
    ...reportsBundleKeys(["reports.operate", "reports.dashboard"]),
  ],
};
```

**Bundles INCLUDED, with reasoning:**
- `pos.configure` — the entire reason this template exists (register create/update,
  tender-type read/manage — today reachable ONLY by Owner).
- `pos.supervise` — floor approval authority (discount/cash/return approve, void/amend/
  price-override) — the same reasoning the Manager template already uses.
- `pos.sell` — `pos.configure`'s register management needs `pos.register.read`/`list` to see a
  register before editing it (those keys live in `pos.sell`, not `pos.configure`), and a real
  store manager plausibly covers the till themselves.
- `pos.view` — read-only POS activity oversight, low-risk complement to supervise.
- `inventory.view` (read-only stock/items, NOT `inventory.items`/`inventory.cost`) — a floor
  manager needs to see stock while running the shop, not edit the catalogue or see cost/margin.
- `reports.operate` + `reports.dashboard` — day-to-day store analytics (daily sales, top
  sellers, cashier performance) and the home dashboard.

**Bundles EXCLUDED, with reasoning:**
- Every `accounting.*` bundle — not an accountant; no chart of accounts, journals,
  reconciliation, or period close.
- `reports.financials` / `reports.tax` — financial/tax reports stay Accountant/Owner-only.
- Every `sales.*` / `purchase.*` bundle — drafting/confirming invoices, POs, bills, GRNs is
  commercial/back-office document work, not floor supervision. The broader "Manager" template
  already exists for a tenant that wants one person doing both jobs; Store Manager is
  deliberately narrower so it is not just Manager renamed.
- `settings.*` (team/locations/audit/finance-config) — staff/branch administration and the
  audit log stay Owner/Manager territory; none of it is needed to configure POS.
- `translation.use` — no editable master-data forms are granted to this role, so the AI
  translation helper has nothing to act on.

Full per-bundle reasoning lives as comments directly above the `storeManager` definition in
`packages/shared/src/role-templates.ts` (not duplicated in the migration SQL).

### Shipped as a migration, not only seed-dev.ts — and WHY this is the one deliberate exception

Every other template in this library is opt-in picker-only (an Owner must explicitly click
"create from template" in the Roles UI) — that is why Cashier/Manager/Viewer/Accountant/Refund
approver do not exist as rows in a fresh tenant. Store Manager is the one deliberate exception:
it is ALSO auto-seeded, once, by a real Drizzle migration
(`packages/db/drizzle/0318_seed-store-manager-role-template.sql`), because the whole point of
this fix is that the gap should not require an Owner to discover a picker option they don't
know exists.

**Generation:** `packages/db` has no schema change here (`roles`/`role_permissions` already
exist), so a plain `drizzle-kit generate` reports "No schema changes, nothing to migrate". Used
`npx drizzle-kit generate --custom --name seed-store-manager-role-template` (the documented
escape hatch for a pure-data migration — the same mechanism behind the existing
`0293_backfill_amend_permissions.sql` / `0310_backfill_pos_session_close_permission.sql` /
`0311_backfill_accountant_purchase_permissions.sql` precedents in this repo) to get a real
journal entry + snapshot, then hand-wrote the SQL — never hand-edited the journal file itself.

**Upsert by PRIMARY KEY, not slug (the documented trap, handled correctly):** the role row uses
a fixed, hardcoded literal UUID (`5e549c47-c2ae-452f-b5a0-a7a06d20725c`) as its PRIMARY KEY and
`ON CONFLICT ("id") DO NOTHING`. This is safe to hardcode (unlike an app-generated id) because
each tenant lives in its own separate Postgres database — the same literal cannot collide across
tenants. Conflicting on name (e.g. the `roles_tenant_id_lower_name_key` partial unique index)
would have been the exact "onConflictDoNothing by slug" trap: if this migration is ever edited
later to change the name/description, a name-keyed upsert would silently no-op on every tenant
that already has the row. Conflicting on the immutable PK avoids that — this migration only ever
INSERTs the role once and contains no UPDATE anywhere. `role_permissions` rows conflict on the
natural `(role_id, permission_key)` key, which is correct here (not a trap) because a grant list
is additive by nature, not a record with fields to keep in sync — a later migration adding one
more key inserts only the new row and leaves every existing key untouched.

**Guarded against a mid-provisioning tenant:** the role INSERT is `INSERT ... SELECT ... FROM
tenant_identity` (not a scalar subquery), so a tenant DB with zero `tenant_identity` rows yet
(mid-provisioning) inserts zero rows instead of aborting the whole migration transaction on a
NOT NULL violation.

**Idempotency, PROVEN not just claimed:** ran `npx drizzle-kit migrate` against the Gulf Auto
Parts DIRECT (non-pooled) URL twice in a row. First run applied the migration (target line
confirmed `[drizzle:tenant] target database "zerupt_tenant_gulf_auto_parts_mt5kya1i"`); second
run reported `migrations applied successfully!` with zero errors and `role_permissions` count
for the new role unchanged at 31 (no duplicate rows).

### Proof the 5 baseline rows are UNCHANGED (before vs after)

Baseline stated at session start: Accountant 114, Cashier 20, Viewer 72, "ZZTEST Manager" 148,
"ZZTEST Audit Probe 1788061862" 1. **CONFIRMED** by direct SQL on Gulf Auto Parts after applying
the migration, creating/deleting a ZZTEST user, and cleaning up:

```
select r.name, count(*) from role_permissions rp join roles r on r.id=rp.role_id
  group by r.name order by 1;
--  Accountant                      | 114
--  Cashier                         |  20
--  Store Manager                   |  31   <- new row, the only change
--  Viewer                          |  72
--  ZZTEST Audit Probe 1788061862   |   1
--  ZZTEST Manager                  | 148
```
Identical to baseline on every pre-existing row. The migration file contains zero UPDATE
statements — it is structurally incapable of altering an existing role's grants.

**Ledger identity** (status-aware form): `0.000000` before the first write and `0.000000` after
the last write (user creation/deletion + role/permission insert). CONFIRMED.

### Live verification (CONFIRMED, authenticated curl against the running API)

Logged in as the tenant Owner via Supabase password grant (no custom `/login` endpoint exists —
auth is Supabase-native, tenant resolved from the JWT's `app_metadata.tenant_id`, not headers).
Invited a username-mode ZZTEST user (`zztest-storemgr`) via `POST /tenant/users/invite` with
`roleId` = the new Store Manager role and `allBranches: true`. Logged in as that user via its
synthetic email (`zztest-storemgr@gulf-auto-parts-mt5kya1i.zerupt.local`) and hit the live API
directly (no API rebuild/restart needed or performed — no `apps/api/src` file was touched by
this fix; `PermissionService` reads `role_permissions` straight from the DB per request, so the
migration's insert took effect immediately):

| Endpoint | Expected | Result |
|---|---|---|
| `GET /tenant/pos/tender-types` (Payment Methods — the gap) | 200 | **200** |
| `GET /tenant/items?limit=1` (inventory.view) | 200 | **200** |
| `GET /tenant/accounts` (excluded: finance book) | 403 | **403** |
| `GET /tenant/roles` (excluded: settings.role.read) | 403 | **403** |
| `GET /tenant/sales/invoices` (excluded: commercial) | 403 | **403** |
| `GET /tenant/purchase/orders` (excluded: commercial) | 403 | **403** |

All six CONFIRMED live, exactly matching the designed include/exclude list.

### ZZTEST cleanup, PROVEN

1. `POST /tenant/users/:id/deactivate` (owner token) → DB confirms `status = 'deactivated'` in
   admin DB `user_tenant_map`.
2. Re-used the SAME still-unexpired ZZTEST JWT against `GET /tenant/pos/tender-types` →
   **403** (deactivation is enforced per-request, not just at login).
3. Hard-deleted the tenant DB `user_roles` row and the admin DB `user_tenant_map` row by SQL.
4. Hard-deleted the Supabase auth user via `DELETE /auth/v1/admin/users/:id` (service key) →
   200.
5. Attempted to re-login with the same username/password → `invalid_credentials`, **confirming
   the auth user is fully gone**.

Zero ZZTEST trace remains in any of the three stores (tenant DB, admin DB, Supabase Auth). The
Store Manager ROLE itself is intentionally left in place — it is the shipped fix, not test
scaffolding.

### Pin: `packages/shared/src/role-templates.spec.ts`, deliberately broken and restored

Added an 8-assertion `describe("store manager template", ...)` block (in addition to the
existing universal-invariant loop, which now also covers `store-manager` automatically since it
iterates `ROLE_TEMPLATES`): asserts the four `pos.configure` keys and four `pos.supervise` keys
are present, that no `sales.*`/`purchase.*`/`settings.*` key leaked in, that the only
`accounting.*` key present is the shared till payment-picker (`accounting.paymentaccount.list`),
and that catalogue-edit/cost-view/financial/tax report keys are absent.

**Suite before the pin:** 72 tests passing (`npx vitest run role-templates` from
`packages/shared`).
**Suite after adding the pin:** 80 tests passing.
**DELIBERATE BREAK:** added `PERMISSION_KEYS.reports.financialView` to the `storeManager`
permission list (an excluded key) and re-ran the suite:
```
FAIL src/role-templates.spec.ts > store manager template > does NOT hold reports.financials or
  reports.tax keys (financial/tax reports stay Accountant/Owner)
AssertionError: expected true to be false
Test Files  1 failed (1)
Tests       1 failed | 79 passed (80)
```
**CONFIRMED the guard fails exactly as intended.** Reverted the injected line; re-ran:
**80/80 passing again.** A guard I have not personally seen fail is not a guard — this one has
been seen to fail.

### tsc / build / restart

- `packages/shared`: `npx tsc --noEmit` — clean, zero errors. `pnpm --filter @zerupt/shared
  build` — succeeded (dist rebuilt with the new template + comment header).
- `apps/api`: `npx tsc --noEmit` from `apps/api` shows 9 pre-existing errors, all in files this
  session never touched (`currency-config.service.spec.ts`, `onboarding/*.spec.ts`,
  `__tests__/integration/*`) — confirmed by `git diff --stat` on those exact files showing
  uncommitted changes from a DIFFERENT, concurrent session in this shared tree. Zero errors in
  any file this session edited (`roles/role-templates.ts`, `permission-bundles.ts`,
  `role-display-name.ts`, the migration SQL, the spec file).
- `pnpm --filter @zerupt/web i18n:check` — **passed**, ar/en fully in sync (added
  `roles.systemRoleNames["Store Manager"]` and `roles.form.template_store-manager` to both
  locale files, plain 8th-grade language, no em dashes).
- `apps/web` `role-display-name.spec.ts` (the i18n resolver this fix extends) — 4/4 passing.
- **No API rebuild/restart was performed by this session** — `apps/api/src` was never touched
  by this fix (role templates resolve client-side in the Roles UI; the seeded row is read by the
  existing, unchanged `PermissionService` straight from `role_permissions`). The API process
  observed running on :3001 during this session (PID 70360, started 13:23) was restarted by a
  DIFFERENT, concurrent session — confirmed by the log's own restart history showing 5 separate
  boot sequences in the prior 90 minutes, none triggered by this pass.

### i18n mechanism (language-agnostic, matches the existing convention exactly)

`roles` table stores one canonical English string (`name`/`description` are plain `varchar`
columns, no per-locale columns). Display localization is a LOOKUP, not a stored translation:
`apps/web/src/features/roles/lib/role-display-name.ts`'s `CANONICAL_NAMES` set maps the stored
English name to the i18n key `roles.systemRoleNames.<Name>`; added `"Store Manager"` to that
set and to both `apps/web/messages/en/roles.json` and `apps/web/messages/ar/roles.json` (English
and Arabic added: "مدير المتجر"). Nothing in the migration, the shared library, or the mechanism
hardcodes English or Arabic — the SQL only ever writes the canonical English key string, exactly
like every other system role.

### Files touched

- `packages/shared/src/role-templates.ts` — new `storeManager` template + updated header comment
  explaining the one-exception auto-seed rule.
- `packages/shared/src/role-templates.spec.ts` — new pinning `describe` block.
- `apps/web/src/features/roles/lib/role-display-name.ts` — added `"Store Manager"` to
  `CANONICAL_NAMES`.
- `apps/web/messages/en/roles.json` / `apps/web/messages/ar/roles.json` — `systemRoleNames` +
  `form.template_store-manager` entries, both locales.
- `packages/db/drizzle/0318_seed-store-manager-role-template.sql` (+ matching
  `drizzle/meta/_journal.json` entry and `drizzle/meta/0318_snapshot.json`, both produced by
  `drizzle-kit generate --custom`, never hand-edited).

**Status: SHIPPED and LIVE on Gulf Auto Parts.** CONFIRMED end to end: template definition →
migration → applied to the real tenant DB → role + 31 permissions exist → a real authenticated
user holding only this role can reach the previously Owner-only screen and is refused everywhere
excluded → guard test seen to both pass and (when broken) fail → zero pre-existing role or
ledger row altered → all test scaffolding cleaned up and proven gone.
