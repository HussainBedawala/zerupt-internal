# E2E Auth Testing with Playwright

## 1. Playwright StorageState Pattern

**What:** A mechanism to save and reuse browser authentication state (cookies + localStorage) across tests.

**Why it matters:** Without storageState, every test would need to log in via the UI — slow and fragile. The setup project pattern authenticates once, saves the state to a JSON file, and all dependent tests reuse it. This is the standard Playwright approach for auth-gated apps.

**How it works:**
- A `setup` project runs first, performs UI login, saves `page.context().storageState({ path })` to a JSON file
- Other projects declare `dependencies: ["setup"]` and `use: { storageState: authFile }` in the config
- Each test starts with a pre-authenticated browser context — no login required
- Unauthenticated tests explicitly use `storageState: { cookies: [], origins: [] }` to ensure clean state

**Key gotcha:** If any test calls `signOut()` on Supabase, the server-side session is revoked globally — other tests reusing the saved storageState will find their tokens invalid. Solution: logout tests must authenticate independently and use fresh contexts.

**Resources:**
- [Playwright Auth docs](https://playwright.dev/docs/auth)
- [Playwright Setup Projects](https://playwright.dev/docs/test-projects#setup-project)

## 2. Supabase Auth Session Model

**What:** Supabase Auth uses JWTs with short-lived access tokens and long-lived refresh tokens, stored in browser cookies via `@supabase/ssr`.

**Why it matters:** The middleware (`proxy.ts`) calls `getUser()` on every request to refresh the session and validate the token. If cookies aren't properly forwarded between middleware response and browser, users get silently logged out.

**How it works:**
- `createServerClient` in middleware reads cookies from the request and writes refreshed tokens back to the response
- The `setAll` callback must update both `request.cookies` (for in-flight use) and `response.cookies` (for the browser)
- `getUser()` triggers token refresh if the access token is expired — this is why it must be called in middleware, not just in pages
- Signing out revokes the refresh token server-side — the stored access token becomes useless after expiry

**Resources:**
- [Supabase SSR Auth Guide](https://supabase.com/docs/guides/auth/server-side/nextjs)

## 3. Bilingual E2E Testing (RTL/LTR)

**What:** Running the same E2E test suite across multiple locales to verify i18n correctness.

**Why it matters:** Arabic (RTL) rendering bugs are invisible if you only test in English. CSS logical properties (`start`/`end` vs `left`/`right`), `dir="rtl"` on `<html>`, and translated strings all need validation.

**How it works:**
- Define a `LocaleConfig` array with locale code, dir, and expected translated strings
- Loop over locales in `test.describe` blocks — Playwright creates separate test entries per locale
- Assert `dir` and `lang` attributes on `<html>` for each locale
- Use locale-specific text expectations (e.g. Arabic login title "مرحبًا بعودتك")

**Key gotcha:** Hardcoded locale strings in test helpers must be kept in sync with translation JSON files (`messages/en/*.json`, `messages/ar/*.json`). Consider importing from the message files directly for a single source of truth.

## 4. Default-Deny Route Protection

**What:** All routes are protected by default; only explicitly listed routes are public. This is the opposite of an allowlist.

**Why it matters:** Default-deny means new routes are automatically protected — you can't accidentally ship an unprotected admin page. New developers don't need to remember to add auth checks.

**How it works:**
- `PUBLIC_ROUTES` explicitly lists unauthenticated paths (`/login`, `/signup`, etc.)
- `AUTH_ONLY_ROUTES` lists pages that redirect authenticated users away (prevents logged-in users seeing the login form)
- Middleware checks `isPublicRoute(path)` — if false AND no user, redirect to login with `returnTo` param
- `returnTo` is stored without locale prefix so it works across locale switches
- `sanitizeReturnTo` validates the value: must start with `/`, must not start with `//` (open redirect), and must not be an auth-only route (prevents redirect loops)

**Resources:**
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
