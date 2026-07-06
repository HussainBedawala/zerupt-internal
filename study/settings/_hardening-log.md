# Settings & Admin — Hardening Program Log

> Resume file. If reading this to resume: jump to **Progress** and continue from the first unchecked layer. Do NOT restart.

## Founder mandate

Accounting, inventory, purchase, sales, and POS are all hardened (their programs complete). Repeat the SAME ledger-first methodology on the ENTIRE Settings & Admin module — the governance/control plane every other module trusts — so a shopkeeper can configure, delegate access, and run the business for 10 years without a config bug silently corrupting the ledger modules downstream.

**Execution mode:** AUTONOMOUS end-to-end. Report only at layer/program boundaries.
**Scope decision (2026-07-06):** ADMIN PLANE INCLUDED (registry/provisioning/signup); **BILLING SKIPPED** this pass (founder call).
**Subagent rule:** subagents I spawn must NOT spawn their own subagents. They write detail to `/tmp/settings-hardening/`, return terse summaries.

## Recon finding (2026-07-06) — reshapes the program

Four-track deep recon (BE/FE/DB/self-serve) ran 2026-07-06 → `/tmp/settings-hardening/recon-{backend,frontend,db,selfserve}.md`. Verdict: **Settings is MORE built than the ledger modules were pre-hardening.** CRUD surfaces largely complete; audit discipline AHEAD of average (every mutation route `@Audited` 1:1); doc-seq claim, PIN scrypt+lockout, API-key hashing, entity-hierarchy FKs, audit-immutability trigger, effective-dated tax/FX history all reference-quality. So this is NOT a build-the-module program. The work concentrates in three seams: (A) two real security holes, (B) self-serve lifecycle gaps that become support tickets post-launch, (C) consistency/ponytail drift from shared primitives.

### Founder decisions (2026-07-06, locked)
1. **security_settings** → WIRE UP FOR REAL (all: password policy, MFA, idle timeout, IP allowlist, concurrent-session cap) via Supabase Auth hooks + guards. Not stored-but-ignored.
2. **Owner-transfer (S1) + PIN-reset (S2)** → BUILD BOTH, FULL SPEC (owner-transfer per spec 01: confirm+PIN+preconditions+session-revoke+audit; PIN-reset: owner-resets-user + self-service forgot-PIN re-auth).
3. **Full tenant data export/portability** → DEFER (spec gap; design separately post-program).

### Key concrete findings mapped to layers
- **C1 (CRIT):** `tenant-settings.controller.ts:32-59` PATCH+logo have NO `@RequiresPermission` — any member can flip financial maker-checker gates. → L1, add `settings.tenant.update` (Owner/Admin).
- **C2 (CRIT):** `security-settings.service.ts:20-28` stored but zero consumers in `auth/`. → L1, wire up (decision 1).
- **S1/S2 BLOCKERS:** no owner-transfer, no PIN reset anywhere in code. → L1.
- **DB:** currency no ISO CHECK/FK to tenant_currencies; `roles.name` case-sensitive unique; `invitations.token` cleartext; `webhooks.signingSecret` plaintext-capable; `api_keys.keyPrefix` no unique; doc_sequences no trigger backstop. → L0/L1/L3/L4.
- **Self-serve (verify+harden):** legal-entities page reachable from nav? hard-lock period reopen PIN-wired? per-agent notification toggles in UI? role field-mask/constraintJson editable in UI? branch-level tax/currency overrides settable? send-test-webhook (missing). → dogfood each layer.
- **Ponytail/consistency (cross-cutting, every layer):** zero `SubmitButton` reuse (15 screens hand-roll spinner); `ErrorState` zero usages + `EmptyState` 3/10; tax rate raw number input not canonical percent; no debounce anywhere; webhook dual-eventing (EventEmitter→pg-boss) vs `runDurableGated`; em-dash `locations/branch-dialog.tsx:172`; stale TODOs (`webhooks.service.ts:334`, team-users DEV-36/37).

## What makes Settings different

Every prior program was a ledger or ledger-adjacent — invariant was three-way tie-out (record ↔ balanced GL ↔ stock/cash). Settings is NEITHER. Spec is explicit: *"policy + configuration only; no direct journal entries or stock movements."* It is the **control plane** the ledger modules trust. Its bugs don't mis-post money directly — they corrupt the *contracts* downstream modules depend on, which is worse (silent, cross-module).

### Reframed invariants (each layer must STATE and PROVE)

1. **Config-contract integrity** — what Settings emits (tax codes, doc sequences, currencies, fiscal periods, entity/branch scoping) is EXACTLY what downstream modules consume. No drift, no mis-scope. (Replaces "tie-out".)
2. **Isolation boundary DEFINED here** — Tenant→Entity→Branch→Warehouse→Zone→Bin hierarchy every module's scoping trusts. A leak here leaks everywhere. Every query tenant-scoped; entity/branch scope enforced server-side.
3. **Auth/RBAC = privilege plane** — a permission bug here is privilege-escalation across ALL modules. Validate client AND server. 100% coverage. Paranoid.
4. **Audit immutability** — Settings is where security-critical changes happen (roles, PINs, security policy). Append-only; actor + reason + timestamp on every mutation.
5. **Doc-sequence integrity** — the one ledger-like invariant: monotonic, no dupes, no lost numbers under concurrency. Advisory-locked in-tx (no TOCTOU).

### Guiding principles

Think like an **owner delegating access** and a **sysadmin who fears a leak**. Always: config-contract integrity (not GL tie-out), backend AND frontend every layer, no tech debt, modular boundary points DOWN only (Settings depends on nothing above it; other modules depend on Settings). Fail-loud over silent-wrong. Money=Decimal (billing/FX). i18n from day one. No em dashes.

## Process gates

- **Reviewer roster flips** to security-first: always `code-reviewer`; auth/RBAC/PIN/keys/webhooks → `security-reviewer` (primary); any schema/migration/sequence/isolation → `database-reviewer` (primary); backend → `nestjs-reviewer` + `api-reviewer`; currency/fiscal/tax → `accounting-reviewer` (L2 only); web → `frontend-reviewer`. Independent cross-model `/review` (Codex) on every auth + webhook + billing path.
- **Boot gate:** real `node dist/main.js` boot per layer.
- **Coverage:** 100% on auth/RBAC/isolation/doc-sequence/audit paths; 80%+ general. Confirm literal "Test Suites: N" (N>0).
- **Next migrations:** tenant = **0157**, admin = **0017** (confirm from journal at layer time; NEVER hand-edit `_journal.json` `when`).

## Layer plan

Each layer = BE + FE + DB together. Consistency/ponytail track runs INSIDE every layer (bring each touched screen to the shared-primitive bar), not as a separate phase.

| # | Layer | Concrete scope (recon-grounded) | Lead reviewers |
|---|-------|--------------------------------|----------------|
| 0 | Isolation & schema integrity | Currency ISO CHECK+FK, role-name case-unique, api_keys keyPrefix unique, ipAllowlist CIDR validation, doc-seq trigger backstop · widen tenant-scope audit to every table · confirm entity/branch scope FKs · verify legal-entities page reachable | db, security, nestjs |
| 1 | Identity & Access — control plane (**heaviest**) | **C1** gate tenant/settings (`settings.tenant.update`) · **C2** wire security-settings for real · team-users → `@RequiresPermission` · **S1** owner-transfer (full spec) · **S2** PIN reset (owner + forgot-PIN) · **S3** owner recovery contact · invitation token hashing · role field-mask UI | **security**, api, nestjs |
| 2 | Financial config contracts | Currency add/remove self-serve · fiscal hard-lock reopen (PIN+reason) verify+harden · tax mid-year change PIN gate · branch-level tax/currency overrides · contract-integrity proof (settings emits == accounting/sales/purchase/POS consume) | **accounting**, db |
| 3 | Document numbering | Trigger backstop · documentType extensibility (no-migration-to-add) · format/prefix/reset self-serve verify | **db**, nestjs |
| 4 | Integrations & notifications | **S4** send-test-webhook · webhook SSRF guard + secret encryption + dual-eventing consolidation (→runDurableGated, ponytail) · api-key scope enforcement · per-agent notification toggles in UI · (billing skipped) | **security**, api |
| 5 | Audit, retention, import, i18n, close | Audit/retention verify · i18n parity + em-dash fix + user-level format overrides · import dogfood · cross-module contract verification · (data export DEFERRED) | code, frontend, db |

## Progress

### Batch A — per-view execution (Identity & Access control plane, the L1 heart)
- [x] VIEW 1 — security_settings wired for real — shipped `52addb45` (mig 0157)
- [x] VIEW 2 — company: C1 tenant/settings gate + owner transfer (S1) + recovery contact (S3) — shipped `1e8775bf` (mig 0158)
- [x] VIEW 3 — members: team-users → @RequiresPermission + branchScope + hash invitation.token — shipped `9a4a1104` (mig 0159)
- [ ] VIEW 4 — roles: lower(name) unique index + field-mask/constraintJson UI
- [ ] VIEW 5 — approval-pins: owner-reset another user's PIN + forgot-PIN self-service

### Layers (the original L0-L5 frame; Batch A covers the L1 core)
- [ ] L0 Foundation: multi-entity + isolation (+admin registry/provisioning)
- [~] L1 Identity & Access (control plane) — VIEW 1 done; VIEWS 2-5 remain
- [ ] L2 Financial config contracts
- [ ] L3 Document numbering
- [ ] L4 Integrations & notifications (+billing/Stripe)
- [ ] L5 Audit, retention, import, i18n, contracts

## Layer log

### VIEW 1 — security_settings wired for real — `52addb45` (mig 0157) — 2026-07-07

**Problem (C2):** every control on the Security panel (idle timeout, max concurrent sessions,
MFA policy, password policy, IP allowlist) was stored in `security_settings` but had ZERO
consumers in `auth/` — a no-op admin panel giving false assurance.

**Shipped (all server-side enforceable):**
- **App-side session ledger** `auth_sessions` (mig 0157, tenant DB). Keyed on the Supabase
  JWT `session_id` claim (verified via context7 against Supabase docs — claim exists, maps to
  `auth.sessions` PK). Needed because GoTrue has NO per-tenant idle/concurrent cap and NO
  granular per-session revoke (admin sign-out is global-only).
- **`SessionPolicyGuard`** (global APP_GUARD in SecuritySettingsModule, resolves after
  JwtAuthGuard + TenantResolverGuard): IP allowlist (node:net BlockList CIDR, fail-closed) +
  MFA `aal` gate (all/admins) + delegates idle/concurrent to the ledger.
- **`SessionLedgerService`**: idle-timeout eviction, concurrent-cap oldest-first eviction,
  activity tracking, revokeOwn/revokeOthers/listActive. All revokes audited (`@AuthSession`).
- **Sessions & Devices** surface (BE + FE): list own sessions, revoke one, sign out others.
- **API-mediated change-password chokepoint** (founder decision — the permanent, industry
  pattern): re-auth with current password (Supabase) → validate tenant policy → set via admin
  API → revoke other sessions. Per-account (tenantId,userId) brute-force lockout, IP-independent.
- **MFA anti-lockout**: tightening mfaPolicy to all/admins requires the caller to already hold
  an aal2 session (prevents self-lockout footgun).
- **IP allowlist validation** hardened (node:net; the old regex accepted 999.999.999.999).
- **FE**: central 401/403 handling (SESSION_REVOKED/IDLE → sign out; IP_NOT_ALLOWED/MFA_REQUIRED
  → explain, no loop), enforcement warnings, testid registry.

**Perf (founder flagged as critical):** steady-state adds ZERO extra DB round-trips per request
— 30s in-memory policy cache + 30s session-validity cache + 60s throttled last_seen write.
Cold path = one indexed PK read. Cross-instance revoke propagation bounded by 30s (single-
instance today; documented).

**Reviewer panel:** security-reviewer + nestjs-reviewer + frontend-reviewer + code-reviewer.
No CRITICAL/HIGH bypasses. Fixed: IP-only throttle → per-account lockout; per-request MFA-admin
DB lookup → cached; tenantId defense-in-depth on ledger queries; non-fatal last_seen write;
guard-order regression test; password.service 100% coverage; FE (unhandled 429, hardcoded "on"
joiner, missing session invalidation, missing testids). Codex independent cross-model review
NOT yet run — recommend before go-live per program gate.

**Gates:** full monorepo turbo typecheck (10 pkgs) green; 64 api tests green (6 suites);
i18n:check parity green; console.log check green.

**Deferrals:**
- Password expiry (`passwordExpiryDays`): NOT surfaced/enforced. NIST SP 800-63B advises against
  periodic expiry; enforcing needs a per-user password_changed_at + force-reset flow. Field kept
  in schema/DTO (round-trips) but removed from the editable UI so it is not "stored but ignored".
- MFA enrolment UX: enforcement (aal gate) is real; a guided "enrol your authenticator" flow when
  a tenant flips MFA on is a separate FE feature (enrolment is client-side Supabase, not blocked
  by our guard). mfaPolicy defaults to optional so not a day-1 blocker.
- **Migration 0157 NOT applied to local dev DB** — the machine's `DATABASE_TENANT_URL` points at
  `zerupt_tenant_dev` which does not exist here. SQL is committed and applies via Railway
  pre-deploy `migrate-tenants.cli` on deploy. FOUNDER TODO: apply to the real dev tenant DB and
  verify from the actual DB before dogfooding.

**Concurrent work folded in:** another engineer's Settings-view FE polish (i18n-ing hardcoded
aria-labels in settings-sidebar/mobile-settings-tabs/settings layout; shared security-merged-panel
integration) was reviewed by the same panel and shipped in this commit. Unrelated concurrent work
(website pricing, tenant-signup, db-admin plans) was deliberately excluded from the commit.

### VIEW 2 — company: C1 gate + owner transfer + recovery contact — `1e8775bf` (mig 0158) — 2026-07-07

**Shipped:**
- **C1 (CRIT fixed):** `tenant/settings` PATCH + POST logo now gated by `@RequiresPermission(
  "settings.tenant.update")` (were unguarded — any member could rename the company / swap the
  logo). GET left ungated (read is not the hole). Controller metadata spec added.
- **S1 owner transfer (full spec):** `POST /tenant/users/transfer-ownership` (OwnerGuard +
  throttle + `@Audited("OwnerTransfer")`). New `OwnerTransferService`: (1) self-PIN confirm via new
  `verifySelfPin` (reuses scrypt + sliding-window lockout, NO SoD — the owner confirms with their
  own PIN); (2) extensible `assertTransferPreconditions` (ponytail no-op — no pending-approvals /
  security-alert subsystem exists yet); (3) up-front fail-loud if the Owner system role is missing;
  (4) atomic admin-DB role swap with the current-owner row locked `FOR UPDATE` (explicit
  serialization point) + post-swap single-owner `count()==1` invariant; (5) atomic tenant-DB tx
  syncing the Owner system role for both parties + `tenant_identity.ownerUserId`, with a greppable
  `OWNER_TRANSFER_PARTIAL_FAILURE` log if it throws after the admin commit; (6) forced session
  revocation of the outgoing owner (fail loud); (7) immutable audit (actor + reason + before/after
  roles) written BEFORE the event + revocation. Outgoing owner demoted to **Member** (admin-DB has
  only owner/member — no "admin" coarse role; corrected from the design's "Admin"). Stable error
  codes on every throw for FE i18n.
- **S3 recovery contact:** nullable `recoveryContactEmail`(320) + `recoveryContactName`(200) on
  `tenant_identity` (mig 0158); surfaced in tenant-settings GET/PATCH (email validated), gated by
  the same `settings.tenant.update` key, audited.
- **Reuse/ponytail:** extracted the duplicated `syncOwnerSystemRole` into
  `team-users/owner-role-sync.util.ts` (one source for `changeRole` + transfer, executor-agnostic
  so it joins the caller's tx); deduped PIN_REGEX to the canonical `approval-pin.dto.ts`.
- **FE:** owner-transfer danger-zone dialog (target picker, reason Textarea + counter, PIN, AlertDialog
  confirm, code-mapped localized errors, Cancel disabled while pending, candidate-list error state)
  + recovery-contact section (inline email validation); testid registry `organisation.ts` created +
  registered; en/ar parity, no em dashes.

**Reviewer panel (paranoid, no lazy framing):** security-reviewer (PRIMARY) + nestjs + database +
frontend + code. Consolidated + fixed in one pass: strikeMap keyspace collision between
verifyApproval/verifySelfPin → purpose-scoped lockout key; cross-DB partial-failure → single tenant
tx + tagged error log; duplicated sync → shared util; event-before-audit → reordered; FOR UPDATE
serialization made explicit; FE raw-error-string i18n leak → error codes; Cancel-during-pending
race → guarded; em dash in `noCandidates` copy → fixed; candidate-fetch error vs empty conflation →
distinct ErrorState. No open CRITICAL/HIGH.

**Gates:** api + web typecheck green; `owner-transfer pin-verification tenant-settings team-users`
= Test Suites 6 passed, 136 tests; owner-transfer.service.ts 100% coverage; i18n:check parity green;
full monorepo turbo typecheck + test (pre-commit) green; console.log check green.

**Deferrals / founder TODOs:**
- **Mig 0158 NOT applied to local dev tenant DB** (`zerupt_tenant_dev` absent locally) — applies via
  Railway pre-deploy `migrate-tenants.cli`. FOUNDER TODO: apply to real dev/prod tenant DBs + verify.
- In-memory PIN lockout is per-instance / non-durable across deploy (pre-existing to verifyApproval;
  and verifySelfPin is only reachable behind an owner session so it is a confirmation factor, not
  primary auth). Same single-instance posture VIEW 1 documented. Upgrade → shared store when the API
  scales horizontally.
- Recovery-contact hardening (email-verify the new address + optional owner-PIN re-auth on change) —
  ponytail-marked on the schema; do before go-live (it is a lockout-recovery lever).
- Global ThrottlerGuard is IP-keyed (cross-tenant DoS on shared NAT) and audit-viewer output-encoding
  of free-text `reason` — both cross-cutting, out of VIEW-2 scope; verify in L5.
- Codex independent cross-model review of the auth path NOT yet run — program gate; recommend before
  go-live (same as VIEW 1).

### VIEW 3 — members: RBAC gates + branch scope + invite token hashing — `9a4a1104` (mig 0159) — 2026-07-07

**Shipped:**
- **RBAC migration:** team-users mutation routes (role/invite/activate/suspend/restore/deactivate/
  branches) migrated from `@UseGuards(OwnerGuard)` to `@RequiresPermission(...)` keys (added
  `settings.user.role.update`); stale DEV-36/37 TODOs stripped. `changeRole` KEEPS its Owner-only
  service enforcement (safe fallback — no role-hierarchy/rank model exists to distinguish a
  non-escalating transition from a privilege grab; ponytail-marked with the upgrade trigger:
  role-hierarchy model ships → allow non-owner transitions for permission holders, keep the Owner
  hard-check for owner promote/demote). OwnerGuard retained only on transfer-ownership.
- **DEV-190 (was fail-open):** `branchIds` was `.optional()` and the invite dialog had NO branch
  picker — every non-owner invite silently landed with zero branch access. Fixed BOTH server (zod
  superRefine requires ≥1 branch; Owner refined out) and client (required branch multi-select with
  loading / load-error+retry / empty states so a branch-fetch failure can't strand the inviter).
- **Invite token hashing:** `invitations.token` was CLEARTEXT → `tokenHash` sha256(64) unique +
  `tokenPrefix`(12) (mirrors api_keys), raw token returned once, accept looks up by hash (mig 0159:
  data step expires pending cleartext invites, backfills terminal rows with an unrecoverable
  id-derived hash, `DROP CONSTRAINT IF EXISTS` for deploy-safety across differently-named tenant
  constraints). Accept route: added Zod validation (was unvalidated → hashToken(undefined) 500 +
  large-body DoS) + throttle; cross-tenant IDOR tests for resend/revoke.

**Reviewer panel:** security (PRIMARY) + nestjs + database + frontend + code. The 3 headline risks
(guard→permission escalation, fail-open branchScope, token hashing) all verified CORRECT. Fixed:
accept-route validation/throttle, branch-fetch stranding, TEAM_TID barrel registration, checkbox
a11y, stale-branchId pruning, IDOR tests, DROP CONSTRAINT IF EXISTS. No open CRITICAL/HIGH.

**Gates:** api + web typecheck green; `invitations team-users` = Test Suites 4 passed, 107 tests;
i18n:check parity green; full monorepo turbo typecheck + test (pre-commit) green.

**FOUNDER DECISIONS logged (agent-os/product/testing/settings/_findings.md — F1, F2):**
- **F1 (architecture):** the `invitations` create/resend/accept trio is dead/broken —
  `acceptInvitation` never provisions membership (no userTenantMap/userRoles/userBranches/Supabase
  link) and the route is unreachable by a not-yet-member; `team-users.inviteUser` is a SEPARATE real
  path that provisions via Supabase. Pick the canonical invite flow: build real acceptance (AuthOnly
  pre-tenant path + provisioning) OR remove the invitations module. This pass only hardened the token
  at rest + accept validation; provisioning behavior UNCHANGED.
- **F2 (trust model / escalation):** an `settings.user.invite` holder can assign a custom `roleId`
  carrying sensitive keys to a new Member, bypassing the Owner-only `changeRole` guard via the invite
  door. Decide: restrict roleId grants to Owner/settings.role.assign, or enforce a permission-ceiling
  check in inviteUser. Ponytail-marked in code pending the decision.

**Founder TODO:** apply mig 0159 to real dev/prod tenant DBs + verify.

## Deferred

(scope/features vs founder-TODOs — appended as they arise)
