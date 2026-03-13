# Auth Architecture

## Token Storage

| Token | Storage | Lifetime | Set by |
|-------|---------|----------|--------|
| Access token (JWT) | Cookie: `sb-<ref>-auth-token` | ~1 hour | `@supabase/ssr` |
| Refresh token | Same cookie (chunked) | ~7 days | `@supabase/ssr` |

Cookies: `HttpOnly`, `Secure` (production), `SameSite=Lax`. No localStorage.

## Security Chain

```
proxy.ts (middleware)     →  Default-deny route protection, getUser() on every request
AuthProvider              →  Client-side auth state, signOut, onAuthStateChange
api-client.ts             →  Bearer token injection, 401 retry with revalidateSession
actions.ts (server)       →  Opaque errors (no email enumeration), locale validation
route-config.ts           →  sanitizeReturnTo (no open redirect), PUBLIC_ROUTES whitelist
```

## File Map

| File | Layer | Purpose |
|------|-------|---------|
| `proxy.ts` | Middleware | Route protection, session refresh, locale routing |
| `lib/supabase/browser.ts` | Client | Singleton Supabase client (uses `document.cookie`) |
| `lib/supabase/server.ts` | Server | Per-request Supabase client (uses `cookies()`) |
| `lib/supabase/middleware.ts` | Middleware | Supabase client for `proxy.ts` (refreshes tokens) |
| `lib/supabase/env.ts` | Shared | Validated env vars (fail-fast if missing) |
| `lib/api-client.ts` | Client | Fetch wrapper: auth headers, 401 retry, error parsing |
| `lib/auth/actions.ts` | Server | Server actions: login, signup, forgotPassword, loginWithGoogle |
| `lib/auth/validation.ts` | Shared | Zod schemas: loginSchema, signupSchema, forgotPasswordSchema |
| `lib/auth/route-config.ts` | Shared | PUBLIC_ROUTES, isPublicRoute, isAuthOnlyRoute, sanitizeReturnTo |
| `components/providers/auth-provider.tsx` | Client | AuthProvider context + useAuth() hook |
| `components/shell/user-menu.tsx` | Client | User avatar menu with signOut (uses useAuth) |
| `app/api/auth/callback/route.ts` | Server | OAuth callback: exchanges code for session |

## Route Protection Rules

| Route pattern | Auth required | Behavior |
|---------------|--------------|----------|
| `/login`, `/signup`, `/forgot-password`, `/confirm` | No (public) | Authenticated users redirect to `/dashboard` |
| `/` (root) | No (public) | Landing page |
| Everything else | Yes (default-deny) | Unauthenticated users redirect to `/login?returnTo=...` |

## AuthProvider State Machine

```
Mount → isLoading: true
  │
  ├─ INITIAL_SESSION (with session) → { user, session, isLoading: false }
  ├─ INITIAL_SESSION (no session)   → { null, null, isLoading: false }
  │
  ├─ SIGNED_IN       → { user, session, isLoading: false }
  ├─ TOKEN_REFRESHED  → update session silently, isLoading: false
  ├─ SIGNED_OUT       → { null, null, isLoading: false }, queryClient.clear()
  │
Unmount → subscription.unsubscribe()
```

## API Client 401 Flow

```
fetch → 401?
  ├─ No  → parse response (success or other error)
  ├─ Yes → revalidateSession()
              ├─ Got fresh token → retry once
              │     ├─ Success → return data
              │     └─ Still 401 → throw ApiError
              └─ No token (session dead) → throw ApiError
                    └─ AuthProvider SIGNED_OUT event handles redirect
```
