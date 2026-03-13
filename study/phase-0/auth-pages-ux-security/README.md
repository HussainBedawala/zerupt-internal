# Auth Pages — UX, Security & SSR Patterns

Study topics from DEV-203: Build login and signup pages.

---

## 1. Server Actions for Auth (Not Client-Side Supabase Calls)

**What:** Next.js Server Actions that call `supabase.auth.signInWithPassword()` on the server, setting cookies server-side before redirecting.

**Why it matters:** The alternative — calling Supabase Auth directly from the browser — works but creates a gap: the server-side cookie jar isn't updated until the next middleware run. With server actions, cookies are set in the same response as the redirect, so the user is immediately authenticated on the next page load.

**How it works:**
```
User submits form → Server Action runs on the server
  → createClient() from server.ts (has access to response cookies)
  → supabase.auth.signInWithPassword({ email, password })
  → Supabase sets auth cookies on the response
  → redirect("/dashboard") — user lands authenticated
```

**Resources:**
- [Supabase SSR Auth Guide](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Next.js Server Actions docs](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)

---

## 2. PKCE OAuth Flow (Proof Key for Code Exchange)

**What:** A secure OAuth flow where the client generates a random code verifier, sends a hash (code challenge) to the auth provider, and later exchanges the authorization code + original verifier for tokens.

**Why it matters:** Without PKCE, an intercepted authorization code can be used by an attacker to obtain tokens. PKCE prevents this because the attacker doesn't have the original code verifier. Supabase uses PKCE by default for OAuth flows.

**How it works:**
```
Browser → Supabase Auth → Google OAuth → callback URL with ?code=xxx
  → /api/auth/callback/route.ts receives the code
  → supabase.auth.exchangeCodeForSession(code)
  → Supabase validates code against the stored code verifier
  → Session created, cookies set → redirect to dashboard
```

**Resources:**
- [RFC 7636 — PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
- [Supabase OAuth with PKCE](https://supabase.com/docs/guides/auth/social-login)

---

## 3. Email Enumeration Prevention

**What:** A security pattern where authentication endpoints return the same response regardless of whether an email exists in the system.

**Why it matters:** If login returns "invalid credentials" but signup returns "email already taken," an attacker can determine which emails are registered. This enables targeted phishing, credential stuffing, and violates privacy (especially under GDPR/MENA regulations).

**Key concepts:**
- Login: return one opaque error ("invalid email or password") for ALL failure cases — wrong password, non-existent email, unconfirmed email
- Signup: always return "check your email" — Supabase handles sending a "someone tried to sign up with your email" notification to existing users
- Forgot password: always return success — don't reveal whether the email exists

---

## 4. Open Redirect Prevention in Server Actions

**What:** Validating user-controlled parameters (like `locale`) before using them in redirect URLs.

**Why it matters:** Next.js Server Actions are public POST endpoints. Any client can call them with arbitrary parameters. If `locale` is interpolated into `redirect(`/${locale}/dashboard`)` without validation, a crafted value like `../../evil.com` could redirect users to an attacker's site.

**How it works:**
```typescript
function safeLocale(locale: string): string {
  return KNOWN_LOCALES.includes(locale) ? locale : "en";
}
// Now redirect(`/${safeLocale(locale)}/dashboard`) is safe
```

---

## 5. Route Groups for Auth Layout Isolation

**What:** Next.js route groups (parenthesized folders like `(auth)`) that share a layout without affecting the URL structure.

**Why it matters:** Auth pages (login, signup) need a completely different layout from the main app (no sidebar, no nav). Route groups let you have `(auth)/layout.tsx` (split-screen with characters) and `(app)/layout.tsx` (sidebar shell) under the same `[locale]/` segment.

**How it works:**
```
[locale]/
  (auth)/           ← layout: split-screen + characters
    login/page.tsx   → /en/login
    signup/page.tsx  → /en/signup
  (app)/            ← layout: sidebar shell
    dashboard/       → /en/dashboard
    settings/        → /en/settings
```

The `(auth)` and `(app)` folders are invisible in the URL — they're purely organizational.

---

## 6. useSyncExternalStore for Timer-Based State

**What:** A React hook for subscribing to external mutable stores, used here to avoid the "setState in useEffect" lint warning for timer-based animations.

**Why it matters:** React's strict mode and lint rules flag `setState` calls inside `useEffect` bodies as potential infinite loops. For animation timers (blinking, peeking), we need periodic boolean toggles. `useSyncExternalStore` lets us manage this state outside React's render cycle while still triggering re-renders.

**How it works:**
```typescript
const peekingRef = useRef(false);
// Timer toggles peekingRef.current
// useSyncExternalStore reads the ref and re-renders when notified
return useSyncExternalStore(subscribe, () => peekingRef.current);
```

**Resources:**
- [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
