# Authentication System

Zerupt uses Supabase Auth with SSR cookie-based sessions. No localStorage tokens.

## Files

1. `setup-checklist.md` — Env vars, Supabase dashboard config, production requirements
2. `auth-flows.md` — Every auth flow end-to-end (signup, login, OAuth, logout, token refresh, 401 retry)
3. `architecture.md` — Security chain, token storage, file map

## Key Decisions

- **Cookie-based sessions** (not localStorage) — `@supabase/ssr` handles this
- **Default-deny routing** — `proxy.ts` blocks all routes unless whitelisted
- **Opaque errors** — never reveal if email exists (prevents enumeration)
- **AuthProvider owns navigation** — api-client throws errors, never redirects
- **Single retry on 401** — revalidate session once, then fail
