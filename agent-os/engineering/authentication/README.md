# Authentication System

Zerupt uses Supabase Auth with SSR cookie-based sessions. No localStorage tokens.

Product rules for users/roles/invitations (what to build) live in
`agent-os/product/settings-admin/02-team-user-lifecycle.md` and `03-roles-permissions-policy.md`.
This directory holds the as-built auth specs plus auth-specific security, compliance, ops, and ADR docs.

## Files

### As-built auth

1. `setup-checklist.md` — Env vars, Supabase dashboard config, production requirements
2. `auth-flows.md` — Every auth flow end-to-end (signup, login, OAuth, logout, token refresh, 401 retry)
3. `architecture.md` — Security chain, token storage, file map

### Security, compliance & operations

4. `secure-invitations.md` — Invite-token security model, anti-abuse, audit events
5. `security-controls.md` — Detection rules, security test expectations
6. `compliance-and-regionalization.md` — GDPR, retention, regional rollout, SCIM path
7. `operations-runbook.md` — Incident playbooks, break-glass, key rotation
8. `provider-decision.md` — ADR: Supabase Auth vs NextAuth vs Clerk (+ migration strategy)

## Key Decisions

- **Cookie-based sessions** (not localStorage) — `@supabase/ssr` handles this
- **Default-deny routing** — `proxy.ts` blocks all routes unless whitelisted
- **Opaque errors** — never reveal if email exists (prevents enumeration)
- **AuthProvider owns navigation** — api-client throws errors, never redirects
- **Single retry on 401** — revalidate session once, then fail
