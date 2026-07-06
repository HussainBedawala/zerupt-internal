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
- VIEW 5 — Approval PINs — pending.

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
