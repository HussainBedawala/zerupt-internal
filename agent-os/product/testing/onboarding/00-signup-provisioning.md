# Onboarding — Signup & Provisioning Testing Checklist

> Persona: **a UAE shop owner creating their account for the first time.** They expect signup to be as simple as any consumer app, and they have no idea a dedicated database is being provisioned behind the scenes. Test as that person: the async provisioning must be invisible when it works and honest when it fails.

- **Route(s):** `/[locale]/(auth)/signup`, `/(auth)/setup`, `/(auth)/confirm`, `/(auth)/login`
- **Feature dir:** `apps/web/src/app/[locale]/(auth)/`
- **API:** `POST tenant-signup`, `GET tenant-signup/provisioning-status/:jobId`, `POST tenant-signup/reset-stale`
- **Provisioning steps:** `apps/api/src/provisioning/steps/` (create-db → run-migrations → seed-config → mark-ready)
- **Depends on:** nothing (entry point)

## 0. Preconditions

- [ ] A throwaway email you control (provisioning may send a confirmation).
- [ ] Know that seed-config seeds: tenant identity, Owner role assigned to the creator, default legal entity (code `MAIN`), fiscal settings, default currency, locale defaults, default tax system, default POS tender types, document sequences. Full COA is NOT seeded here (deferred to the wizard).

## 1. Functional — actions & states

- [ ] **Sign up** with a valid email/password creates the tenant and kicks off the async provisioning job; success routes to a clear "setting up your account" state, not a frozen screen.
  - [ ] Loading/progress state shown while provisioning runs; the status endpoint is polled and progress is visible (no indefinite spinner with no feedback).
  - [ ] Error state on a failed provisioning step is user-friendly (not a raw error), tells the user what to do next, and does not lose the account.
  - [ ] Empty/first-run state after provisioning completes lands the user at the onboarding wizard, not a broken dashboard.
- [ ] Email confirmation flow (if enabled) works; an unconfirmed user cannot reach the app.
- [ ] Login after signup resolves the correct tenant DB (JWT carries tenant_id; tenant context middleware routes to the per-tenant database).

## 2. Domain invariants

- [ ] Provisioning creates a **dedicated** Neon Postgres DB for the tenant; the tenant's data never lands in the admin DB or another tenant's DB.
- [ ] Migrations are fully applied to the new tenant DB before the tenant is marked ready (no missing tables when the wizard opens).
- [ ] seed-config seeds exactly one Owner role and assigns it to the creating user; the creator can reach owner-only onboarding endpoints.
- [ ] A default legal entity (`MAIN`) with fiscal settings exists after provisioning; currency/locale/tax-system defaults match the (later-chosen) country intent or a sane default until step 1 sets country.
- [ ] `mark-ready` flips the tenant to ready only after all prior steps succeed; a tenant is never "ready" with an unmigrated or unseeded DB.

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] **Double signup / rapid re-submit** does not create two tenants or two provisioning jobs (button debounced, idempotent).
- [ ] Signup with an already-registered email is rejected with a clear message, not a duplicate tenant.
- [ ] A provisioning job that stalls or fails partway can be recovered via `reset-stale` (or equivalent), leaving no half-provisioned tenant; verify a re-run completes cleanly.
- [ ] Weak/invalid password, malformed email, and missing fields are rejected client and server side.
- [ ] Closing the tab mid-provisioning and returning resumes at the correct state (job status re-fetched), not a dead end.
- [ ] RTL (Arabic) and LTR render correctly on all auth screens.

## 4. Cross-module / integration

- [ ] After provisioning, the Owner can open the onboarding wizard and it starts at step 1 (business info) with no prior state.
- [ ] Document sequences and default tender types seeded here are the ones later surfaced in POS setup (step 6) — no duplication or mismatch.

## 5. Known gaps (from recon — verify or track)

- Full COA templates and system accounts are intentionally deferred to the wizard pipeline (`/complete`), not seeded at signup. Verify the wizard cannot post to accounts that do not yet exist before COA provisioning runs.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
</content>
