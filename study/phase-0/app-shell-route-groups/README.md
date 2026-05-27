# App Shell Route Groups & Fail-Open Auth Gating

> Concepts behind extending the Next.js app shell for MVP modules (DEV-272).

## 1. Route groups isolate divergent chrome, not URLs

Next.js App Router **route groups** — folders wrapped in parentheses like `(app)`,
`(auth)`, `(pos)` — organize files **without affecting the URL**. `/pos` resolves the
same whether the file lives at `pos/page.tsx` or `(pos)/pos/page.tsx`.

Why this matters: different parts of an app need fundamentally different layouts.
- `(app)` wraps everything in the `AppShell` (sidebar rail + entity switcher).
- `(auth)` is bare (login/signup) — no shell.
- `(pos)` is **fullscreen** — a cashier needs the whole viewport, no rail.

The naive alternative — one layout with conditional `if (isPos) hideSidebar` — couples
unrelated surfaces and forces every layout concern through one branchy component. A
separate route group gives each surface its own `layout.tsx`, so the POS terminal simply
*is not inside* the shell. The "quick-switch" between POS and back-office becomes plain
navigation across group boundaries (`/pos` ⇄ `/dashboard`), each entering the other's
layout cleanly.

**Rule of thumb:** when a section needs a structurally different layout (not just a
visual tweak), give it its own route group rather than conditionalizing a shared layout.

## 2. Fail-open vs fail-closed gating

A redirect gate decides whether to trap a user on a route. The direction of the default
when information is missing is a security/UX trade-off:

- **Fail-closed** (deny by default): if we can't confirm a user is allowed, block them.
  Correct for *authentication* — an absent/invalid session must not grant access.
- **Fail-open** (allow by default): if we can't confirm a gate applies, let the user
  through. Correct for *secondary nudges* like an onboarding wizard.

The onboarding redirect fires **only** when `app_metadata.onboarding_completed === false`
— an explicit, present, false flag. An absent flag or `true` means "don't gate." Why
fail-open here: the flag's writer (the go-live step) may not exist yet, or a token may
predate the flag. Fail-closed would **lock every existing tenant out of their own ERP**
behind a wizard the moment the gate ships. The cost of a missed nudge (user skips
onboarding) is trivial; the cost of a false lockout is catastrophic. Match the default to
the cost of being wrong.

## 3. Redirect-loop safety

Any gate that redirects to a route must exempt that route, or it redirects forever.
The onboarding gate excludes `isOnboardingRoute`, plus `isPublicRoute` and
`isAuthOnlyRoute` so it never fights the other gates in the same middleware pass. A
redirect chain is ordered: each rule must leave the request in a state the *next* rule
won't bounce.

## 4. One locale-stripping implementation

`resolveActiveNavId` originally re-implemented locale stripping with
`pathname.replace('/' + locale, '')` — unanchored, so a locale token appearing mid-path
could corrupt the match. Consolidating onto the single anchored `stripLocalePrefix`
helper (exact-prefix + segment-boundary) removes the divergence. Duplicated parsing logic
drifts; one tested helper used everywhere does not.

## See also

- [[middleware-route-protection]] — the auth gate chain this extends
- [[i18n-layout-foundation]] — locale routing + RTL the shell sits on
