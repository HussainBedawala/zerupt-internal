# Auth / session — findings

---

## AUTH-001 — HIGH (availability + lockout) — A malformed auth cookie 500s the ENTIRE app and locks the user out
**Reproduced deterministically.**

```bash
C='sb-<project>-auth-token.0=base64-eyJhY2Nlc3NfdG9rZW4iOiJib2d1cyJ9; sb-<project>-auth-token.1=xxxx'
curl -o /dev/null -w "%{http_code}" -H "Cookie: $C" http://localhost:3000/en/dashboard   # -> 500
curl -o /dev/null -w "%{http_code}" -H "Cookie: $C" http://localhost:3000/en/settings/company # -> 500
curl -o /dev/null -w "%{http_code}" -H "Cookie: $C" http://localhost:3000/en/inventory/items  # -> 500
```

Server log:
```
⨯ Error: Invalid UTF-8 sequence
⨯ unhandledRejection: Error: Invalid UTF-8 sequence
```

### Why this is serious
1. **The user is locked out with no self-service recovery.** Every route 500s, including the
   path to `/login`. A MENA/SEA retail shop owner cannot "clear cookies for this site". They
   are simply dead in the water until someone technical intervenes. This directly violates the
   defensive-UX rule (assume the user cannot fix anything themselves).
2. **It is an `unhandledRejection`, not a caught error.** Node 15+ terminates the process on an
   unhandled rejection by default. In production this is an availability problem, not just an
   ugly page: a client with one corrupt cookie can crash-loop the server by refreshing.
3. **The trigger is realistic, not exotic.** Cookie truncation by a proxy, a partially-cleared
   cookie jar, a chunked cookie where `.1` is dropped, an auth-library format change, or a
   browser writing the pair non-atomically all produce exactly this state.

### Correct behaviour
A cookie that cannot be decoded is, by definition, not a valid session. It must be treated as
**logged out**: clear/expire the bad cookie and 307 to `/login?returnTo=...`, exactly as a
missing cookie already does correctly today (verified: 307 with returnTo on every route).
It must never surface as a 500, and never as an unhandled rejection.

### Where to look
The decode happens in the Supabase SSR cookie handling reached from `apps/web/src/proxy.ts`
(Next 16 names the middleware `proxy.ts`, not `middleware.ts`) and/or the server Supabase client
factory. Wrap the decode, and handle BOTH the sync throw and the promise rejection.

**Status:** FIXED & VERIFIED 2026-08-26

Root cause: `apps/web/src/proxy.ts` awaited `supabase.auth.getClaims()` with no try/catch.
`@supabase/ssr`'s base64url decoder throws `Invalid UTF-8 sequence` on an undecodable chunk;
`getClaims()` only catches `AuthApiError`, so the throw escaped as an uncaught rejection.

Fix: narrow catch matching ONLY the two decoder error signatures (anything else re-throws
unchanged, so real errors still surface), then expire EVERY `sb-*-auth-token[.N]` chunk found
on the request and fall through to the existing unauthenticated redirect. It cannot produce a
false authenticated state because the catch only ever sets claims to null.

Verified by curl:
| Request | Before | After |
|---|---|---|
| malformed cookie -> /en/dashboard | 500 | 307 -> /en/login?returnTo=%2Fdashboard |
| malformed cookie -> /en/inventory/items | 500 | 307 -> /en/login?returnTo=... |
| malformed cookie -> /en/login | 500 | **200** (user can actually recover) |
| no cookie -> /en/dashboard | 307 | 307 (no regression) |

20/20 proxy tests pass, incl. 4 new ones.

### RESIDUAL (open, upstream) — AUTH-001b, LOW/MEDIUM
The same request still logs two `unhandledRejection: Invalid UTF-8 sequence` from
`@supabase/ssr`'s internal `onAuthStateChange` listener, scheduled on its own microtask outside
any awaitable promise. Not closable from the call site. Contained in production because
`sentry.server.config.ts` sets Sentry's default `onUnhandledRejection: "warn"` (logs, does not
exit). Dev server stayed up across dozens of repro requests. Worth an upstream ticket, not a
launch blocker.

---

## Confirmed GOOD
- **No cookie at all** is handled correctly: every protected route 307s to
  `/en/login?returnTo=<path>` and the returnTo round-trips. Verified on dashboard, settings,
  inventory, sales and accounting.
- Auth cookies are chunked (`.0` / `.1`) and long-lived (~400 days), so ordinary users will not
  be logged out by cookie expiry.

## Investigated, NOT a bug (do not re-chase)
- Repeating `ERR_CONNECTION_REFUSED` to `localhost:8097` in the browser console is React
  DevTools, correctly gated behind `NODE_ENV === "development"`
  (`apps/web/src/app/[locale]/layout.tsx:177`).
- Transient `ReferenceError: BranchFilter is not defined` in the dev log on 2026-08-25 was a
  concurrent in-flight edit by a fix agent, not a product defect.
