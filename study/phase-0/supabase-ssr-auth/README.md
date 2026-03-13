# Supabase SSR Authentication

Study topics from DEV-201 (Supabase browser client) and DEV-205 (seed dev user).

---

## 1. Server-Side Auth in Next.js App Router

**What:** Managing authentication sessions in a framework where rendering happens on the server, not just the browser.

**Why it matters:** Next.js App Router renders pages on the server by default. The traditional SPA pattern (store token in localStorage, attach to fetch) doesn't work because server components don't have access to `localStorage` or `document.cookie`. You need a cookie-based session that both server and browser can read.

**How it works:**
- Browser client: uses `document.cookie` automatically (SPA-like)
- Server client: receives a read-only cookie store from `next/headers`
- Middleware client: has full read/write cookie access — this is where token refresh happens

```
Browser Request → Middleware (refresh token) → Server Component (read session) → Client Component (interact)
```

The key insight: `getUser()` in middleware triggers an API call to Supabase that refreshes the access token if expired. The refreshed token is written back as a cookie via `setAll()`. Server Components can only read cookies, not write them — so they rely on the middleware having already refreshed.

**Resources:**
- [Supabase SSR docs](https://supabase.com/docs/guides/auth/server-side)
- [@supabase/ssr package](https://github.com/supabase/ssr)

---

## 2. Cookie Security in Middleware Chains

**What:** When composing multiple middleware functions (e.g., auth + i18n), cookies set by one middleware must be correctly forwarded to the final response — including security attributes.

**Why it matters:** A cookie without `HttpOnly` is readable by JavaScript (XSS attack vector). A cookie without `Secure` can be sent over HTTP (MITM attack vector). When you create a new `NextResponse` in the i18n middleware, the auth cookies from the Supabase middleware are lost unless you explicitly copy them.

**How it works:**
```ts
// WRONG — drops HttpOnly, Secure, SameSite, Path, Max-Age
response.cookies.getAll().forEach((cookie) => {
  intlResponse.cookies.set(cookie.name, cookie.value);
});

// CORRECT — preserves all cookie options
response.cookies.getAll().forEach(({ name, value, ...options }) => {
  intlResponse.cookies.set(name, value, options);
});
```

The `...options` spread captures everything beyond `name` and `value` — `httpOnly`, `secure`, `sameSite`, `path`, `maxAge`, `domain`. Dropping these silently downgrades security.

**Resources:**
- [MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

---

## 3. getUser() vs getSession() — Why It Matters

**What:** Supabase provides two ways to check auth state: `getUser()` makes an API call to verify the JWT, while `getSession()` just reads the unverified cookie.

**Why it matters:** `getSession()` reads the JWT from the cookie without verifying it with Supabase's servers. A tampered or expired token would still return a "valid" session. `getUser()` makes a network call to Supabase, which verifies the token signature, checks expiry, and returns the canonical user object.

**Key concepts:**
- Use `getUser()` for any security-sensitive operation (middleware auth checks, API calls)
- Use `getSession()` only for UI hints (show/hide login button) where accuracy isn't critical
- `getUser()` in middleware also triggers token refresh — this is the canonical refresh mechanism

---

## 4. Environment Variable Safety in Next.js

**What:** Next.js exposes `NEXT_PUBLIC_*` env vars to the browser bundle at build time. All other env vars are server-only.

**Why it matters:** If you accidentally prefix a secret key with `NEXT_PUBLIC_`, it gets compiled into the JavaScript bundle that every browser downloads. For Supabase, the publishable key is safe to expose (it only allows operations the user's JWT authorizes). The secret key allows admin operations (create users, bypass RLS) and must never be public.

**How it works:**
```
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx  → server only (API)
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...     → browser + server (web app)
SUPABASE_SECRET_KEY=sb_secret_xxx            → server only, NEVER NEXT_PUBLIC_
```

Add startup validation to catch missing vars early instead of getting cryptic Supabase client errors at runtime.

---

## 5. Idempotent Database Seeding

**What:** A seed script that produces the same result whether you run it once or ten times, without creating duplicates or erroring on existing data.

**Why it matters:** In a team (or solo with multiple machines), `db:seed` runs at different times on different databases. If the script uses `create` instead of `upsert`, the second run fails with a unique constraint violation. Idempotent seeds let developers run them freely without worrying about state.

**How it works:**
```ts
// Idempotent: upsert by unique key
await prisma.plan.upsert({
  where: { id: PLAN_STARTER_ID },  // stable, deterministic ID
  update: { modules: plan.modules }, // update what might change
  create: plan,                      // create if missing
});
```

Key patterns:
- Use stable, deterministic IDs (not `cuid()` or `uuid()` at runtime)
- Upsert by the natural unique key
- Only update fields that might legitimately change between runs
- Add a production guard: `if (NODE_ENV === 'production') throw`
