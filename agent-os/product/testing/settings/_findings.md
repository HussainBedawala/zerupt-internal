# Settings & Admin Module — Findings Log

> Log every real defect found during a live testing pass. One row per finding. Fix by severity;
> re-run the affected checklist item after each fix and mark it FIXED with the commit.
> Mirrors the pos/sales packs. Persona for dogfooding = Al-Asala Auto Parts (Kuwait, KWD, non-VAT, non-KSA).

Severity rubric: CRITICAL / HIGH / MEDIUM / LOW.

## Open Items

| # | View | Sev | One-line | Tracker |
|---|------|-----|----------|---------|
| — | — | — | (none logged yet — live dogfooding pending, see below) | — |

## Testing status by view (Batch A)

- **VIEW 1 — Security (security_settings enforcement)** — shipped `52addb45` (mig 0157).
  Reviewed by security + nestjs + frontend + code panels (no CRITICAL/HIGH bypasses); 64 api
  unit tests green. **LIVE dogfooding NOT yet run** — blocked on applying migration 0157 to a
  real dev tenant DB (local `DATABASE_TENANT_URL` points at a non-existent `zerupt_tenant_dev`).
  When a dev/prod tenant DB is available, dogfood: set an IP allowlist and confirm an outside IP
  is 403'd; set idle timeout to 5 min and confirm auto-logout; set max concurrent sessions and
  confirm oldest device is evicted; change password against the tenant policy (too-short rejected,
  other devices signed out); flip MFA to "all" without aal2 and confirm the anti-lockout 422.
- VIEW 2 — Company — pending.
- VIEW 3 — Members — reviewer fix pass applied (defensive hardening: accept-route
  validation/throttle, cross-tenant IDOR tests, migration robustness, frontend
  defensive-UX/a11y/testid fixes). Two FOUNDER-DECISION-NEEDED architecture findings
  below (F1, F2) — not resolved in this pass.
- VIEW 4 — Roles — pending.
- VIEW 5 — Approval PINs — reviewer fix pass applied: durable resetPin audit row
  (actor + target + reason, mirroring VIEW 2 owner-transfer), role-hierarchy guard
  (non-Owner cannot reset the Owner's PIN), `approvalpin.reset` event wiring, PIN_REGEX
  consolidated to `packages/shared/src/constants.ts`, i18n countdown fix (ar/en), reset
  reason inline hint, stable countdown interval.

## VIEW 5 — Approval PINs: Notes

- **F5 (MEDIUM, systemic audit gap):** the `@Audited` interceptor derives entityId only
  from response/param/body `id`; body-only DELETE-style routes that use a different key
  (e.g. resetPin's `targetUserId`) get entityId "unknown" + null after. VIEW 5 fixed the
  PIN-reset route with an explicit `AuditLogService.append` call. OTHER such routes may
  silently under-audit. Follow-up: give the interceptor a configurable/`*Id`-suffix
  body-param fallback so target ids are captured systemically. (For the L5 audit pass.)
- Note: "notify the target when their PIN is reset" (email/in-app) is a follow-up — the
  `approvalpin.reset` event is emitted; a consumer is pending
  (`// ponytail:` marker in `pin-verification.service.ts`).

## Batch C — money-adjacent config (currency/fiscal, tax, numbering, posting)

All four views shipped 2026-07-07 (C1 `43fcfb2c`, C3 `c7d5e0cd`, C2 `06313ea3`, C4 `3096fd5a`), no
migrations. Full detail in `study/settings/_hardening-log.md` Batch C block. Founder decisions + open
follow-ups from this batch:

- **F-C2a (RESOLVED, founder call):** a document dated before all versioned `TaxRate` rows used to silently
  use today's `TaxCode.rate`. Ruling: **fail loud** — throw `TAX_RATE_NOT_CONFIGURED_FOR_DATE` (clean 400,
  actionable self-serve message) when versioned rates exist but none covers the date; keep the `TaxCode.rate`
  epoch fallback only when zero versioned rates exist. Rationale: long-run-correct + country-agnostic;
  silently assuming a historical rate risks mis-reporting to a tax authority. Shipped in C2.
- **F-C2b (RESOLVED):** `isNoTax` now derived from tax category `{exempt, out_of_scope}`, not summed rates
  (a 0%-rate `standard` code was misreported as no-tax). Shipped in C2.
- **F-C2c (RESOLVED):** legacy zero-rated turnover warning is the PERMANENT guard (no pre-launch legacy data
  to backfill; base stored post-DEV-340). No backfill built. Shipped in C2.
- **F-C1 (RESOLVED, founder call):** fiscal hard-lock reopen stays RBAC + reason + audit — NO mandatory
  approval-PIN (consistent with the settings-optional PIN philosophy). Currency deactivation now fails loud
  when the currency is a legal-entity OR branch base currency.
- **Open follow-ups (non-blocking, in hardening-log Deferred):** C1 create-side TOCTOU (add isActive currency
  check on entity/branch create); C2 pre-existing N+1 in `resolveEffectiveRates`; C3 data-driven document
  types deferred (YAGNI until user-defined custom documents is a real bet, ponytail-marked in code).

## VIEW 3 — Members: Founder Decisions Needed

- **F1 (HIGH, architecture) — FOUNDER DECISION NEEDED:** The `invitations`
  create/resend/accept trio is dead/broken. `acceptInvitation` (invitations.service.ts)
  only flips status to Accepted + stamps acceptedAt — it never creates
  userTenantMap / userRoles / userBranches / Supabase link, so a successful "accept"
  yields ZERO tenant access. The accept route is also unreachable by a not-yet-member
  (guard chain needs a tenant-scoped JWT). Meanwhile team-users.inviteUser is a SECOND,
  real invite path (provisions everything via Supabase invite email). DECISION: pick
  the canonical invite flow — either build real acceptance (an @AuthOnly pre-tenant-JWT
  path like tenant-signup + membership provisioning mirroring inviteUser) OR remove the
  invitations module. VIEW 3 only hardened the token at rest (cleartext → sha256) +
  added accept validation/throttle defensively; it did NOT change provisioning behavior.
- **F2 (HIGH, trust model / privilege escalation) — FOUNDER DECISION NEEDED:** An
  `settings.user.invite` holder can assign a custom `roleId` (tenant-DB role) that
  carries sensitive permission keys to a brand-new Member, bypassing the Owner-only
  `changeRole` guard via the invite door (team-users.service.ts inviteUser roleId
  assignment is validated only for existence/active/tenant, not against the actor's
  permission ceiling). DECISION: restrict roleId grants to Owner / settings.role.assign
  holders, or enforce that the actor holds every permission key the assigned role
  grants (permission-ceiling). Ponytail-marked in code pending the decision.

## VIEW 4 — Roles: Founder Decisions Needed

- **F3 (HIGH, enforcement epic) — FOUNDER DECISION NEEDED:** role `fieldMask` +
  `scopeType` are configurable, stored, and now server-side validated (scopeType
  parity added this pass), but NOTHING enforces them at READ time — a grep shows
  fieldMask/scopeType are consumed only in the roles module, never in inventory
  (cost/margin), reports (accountBalances/taxLines), or settings (secretValue)
  response paths. So a role configured to "hide cost from cashiers" currently does
  NOT hide it. VIEW 4 shipped the editor + storage + validation groundwork and
  labeled the UI as "rolling out / not yet enforced" (SensitiveFieldsPanel rollout
  notice) to avoid false assurance. DECISION/EPIC: build a cross-module
  FieldMaskInterceptor (or serializer) that strips masked fields from responses
  per the caller's resolved role, and enforces scopeType (Tenant/Branch/Own) —
  likely its own batch. Until then the control is inert.
- **F4 (HIGH, RBAC escalation model — groups with F2) — FOUNDER DECISION NEEDED:**
  no permission-ceiling on role editing/assignment. A holder of
  `settings.role.update` can edit its own (or another non-owner) role to add
  permissions / broaden scopeType / clear masks — privilege self-escalation
  (settings.role.update is not owner-only or ceiling-checked). Same root gap as F2
  (invite-time roleId can exceed the inviter's holdings). Note: the scope/mask half
  of this is currently moot because those controls are unenforced at read time (see
  F3), but the permission-key-adding half is live. DECISION: pick the RBAC
  no-escalation model — permission-ceiling ("cannot grant beyond your own
  holdings"), role-priority/rank, or make settings.role.update owner-only — and
  apply it to BOTH role editing and invite-time roleId assignment.
