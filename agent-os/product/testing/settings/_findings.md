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
- VIEW 3 — Members — pending.
- VIEW 4 — Roles — pending.
- VIEW 5 — Approval PINs — pending.
