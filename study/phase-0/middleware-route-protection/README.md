## 1. Next.js Middleware as an Auth Gateway

**What:** Next.js middleware (proxy.ts in v16) runs on the edge before every matched request, making it the ideal place to enforce auth checks and session refresh.

**Why it matters:** Without middleware-level protection, every page/layout would need its own auth check — duplicated, error-prone, and easy to forget. A single middleware guarantees no protected route is ever served without auth.

**How it works:**
- Middleware intercepts requests before they reach route handlers
- `getUser()` verifies the JWT server-side (not client-trusted `getSession()`)
- Redirects happen before any page rendering — the protected content is never sent to the client
- The matcher config controls which routes trigger the middleware (exclude static files, API routes)

**Resources:**
- [Supabase SSR Auth with Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Next.js Middleware docs](https://nextjs.org/docs/app/building-your-application/routing/middleware)

---

## 2. Default-Deny Route Classification

**What:** A security pattern where all routes are protected by default, and only explicitly listed routes are public. The opposite (default-allow) requires listing every protected route — one miss and you have an auth bypass.

**Why it matters:** As Zerupt grows from 5 routes to 50+, default-deny means new routes are automatically protected. You'd have to deliberately make a route public, which is the safer failure mode.

**Key concepts:**
```ts
// Default-deny: only these are public
const PUBLIC_ROUTES = ["/login", "/signup", "/forgot-password", "/confirm"];

// Everything else requires auth — no explicit "protected" list needed
if (!isPublicRoute(path)) → redirect to login
```

**Gotcha — segment-boundary matching:** Using `startsWith("/login")` would match `/login-help` as public. Fix: match exact path OR path + `/` prefix (`pathname === route || pathname.startsWith(route + "/")`).

---

## 3. Open Redirect Prevention

**What:** An open redirect vulnerability occurs when a web app redirects users to a URL controlled by an attacker. Common vector: `?returnTo=https://evil.com` after login.

**Why it matters:** Attackers craft login links with malicious `returnTo` values. After the user authenticates (on your trusted domain), they're redirected to a phishing site that steals credentials or tokens.

**How to prevent:**
```ts
function sanitizeReturnTo(value: string | null): string {
  if (!value) return "/settings";
  // Must start with "/" (relative path)
  if (!value.startsWith("/")) return "/settings";
  // Must NOT start with "//" (protocol-relative URL)
  if (value.startsWith("//")) return "/settings";
  return value;
}
```

**Defense layers:**
1. Only store relative paths in `returnTo` (middleware does this)
2. Validate before consumption (login page must call `sanitizeReturnTo`)
3. Never use `returnTo` in server-side redirects without validation

**Resources:**
- [OWASP Unvalidated Redirects](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)

---

## 4. Composing Middleware with next-intl

**What:** When using next-intl's `createMiddleware` alongside custom auth logic, you need to compose them — run auth checks first, then locale routing, then merge cookies.

**Why it matters:** next-intl's middleware handles locale detection, redirects (`/` → `/en/`), and `hreflang` headers. Auth middleware needs to work alongside this without breaking locale routing.

**How it works:**
```
1. Create Supabase client + refresh session (getUser)
2. Check auth state → redirect if needed (BEFORE intl middleware)
3. Run intl middleware (locale routing)
4. Copy Supabase cookies onto intl response (CRITICAL)
5. Return composed response
```

**Why cookies must be copied:** Supabase SSR writes refreshed tokens to `response.cookies`. The intl middleware creates a new response. If you return the intl response without copying Supabase cookies, session refresh tokens are lost and users get randomly logged out.

---

## 5. getUser() vs getSession() — Why It Matters

**What:** Supabase provides two methods: `getSession()` reads the JWT from cookies (client-trusted), while `getUser()` sends the JWT to Supabase Auth server for verification (server-verified).

**Why it matters:** `getSession()` only decodes the JWT locally — a tampered or expired token would still "work" until the client refreshes. `getUser()` verifies the token server-side, ensuring the user actually exists and the session is valid.

**Rule:** Always use `getUser()` in middleware and server components. Use `getSession()` only for non-security-critical client-side reads (e.g., displaying the user's name).

**Resources:**
- [Supabase Auth: getUser vs getSession](https://supabase.com/docs/reference/javascript/auth-getuser)
