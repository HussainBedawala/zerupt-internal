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

- [ ] L0 Foundation: multi-entity + isolation (+admin registry/provisioning)
- [ ] L1 Identity & Access (control plane) (+signup/entitlement)
- [ ] L2 Financial config contracts
- [ ] L3 Document numbering
- [ ] L4 Integrations & notifications (+billing/Stripe)
- [ ] L5 Audit, retention, import, i18n, contracts

## Layer log

(entries appended per layer)

## Deferred

(scope/features vs founder-TODOs — appended as they arise)
