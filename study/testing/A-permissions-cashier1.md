# Phase A — permission testing: `cashier1` (Cashier, 19 perms, Fahaheel ONLY)

Logged in via the staff subdomain `http://gulf-auto-parts.localhost:3000` using the USERNAME route.

---

## PERM-001 — HIGH — Staff land on a page they are not allowed to see
After a successful login, `cashier1` is redirected to `/en/dashboard`, which their role cannot
access. Their **first ever screen in the product** is:

> ⛔ You don't have access to this page
> Your role doesn't include the permission needed here. Contact your administrator...
> [ Back to dashboard ]

Three compounding problems:
1. The post-login landing route ignores what the user can actually reach. `Dashboard` is not
   even in this user's nav (verified: nav renders only `/en/pos`, `/en/sales`, `/en/inventory`,
   `/en/settings`), yet login sends them there.
2. **"Back to dashboard" links to `/en/dashboard`** — the exact page that just refused them.
   Verified via the anchor href. It is a dead-end loop.
3. For a rush-hour cashier this is the worst possible first impression, and they cannot fix it
   themselves.

**Fix:** redirect after login to the first route the user's permissions actually allow (for a
cashier that is `/pos`). The denial page's escape button must point at an allowed route too,
not unconditionally at the dashboard.

**Evidence:** `/tmp/zerupt-shots/61-cashier.png`
**Status:** FIX DISPATCHED

---

## PERM-002 — MEDIUM — A normal permission state is reported as a system error
Alongside the calm inline message, a **red error toast** appears:
> ⛔ Something went wrong: Access denied

"Something went wrong" tells a non-technical shop worker the software is broken. Nothing went
wrong; they simply lack a permission. The inline copy below it already says this correctly and
kindly, so the toast both duplicates and contradicts it.

**Fix:** suppress the error toast for 403/permission responses on a route the user navigated to.
The page-level message is sufficient and better worded.
**Status:** FIX DISPATCHED

---

## POS-001 — HIGH (money) — "Opening float" shows 2 decimals in a 3-decimal currency
POS > Open Shift > **Opening float** placeholder renders `0.00`.
This tenant is Kuwait / **KWD, which has 3 decimals**. Every other money field in the product
correctly shows 3 (`KWD 0.000`, `KWD 1,765,263.922`).

This is the opening cash count in the till. Wrong precision here feeds directly into shift
cash-variance calculations, so it is a money bug, not a cosmetic one.

Must use the canonical money input/formatter driven by the tenant's currency, never a hardcoded
`0.00`.

**Evidence:** `/tmp/zerupt-shots/62-pos-cashier.png`
**Status:** FIX DISPATCHED

---

## OPEN — intermittent session loss (NOT reproducible on demand, do not over-trust)
Several times today the session dropped without user action, as owner AND as cashier1. Once,
after a burst of navigations to forbidden routes at ~2s intervals, the auth cookie was gone
entirely.

**I could NOT reproduce it deterministically.** Attempts that all held the session:
- 3 allowed-route navigations at 1s, 3s and 5s gaps → still logged in
- 4 repeated forbidden-route hits at 2s gaps → still logged in
- a single forbidden route with a 7s gap → still logged in

Recorded as a real observation with an unproven cause. Suspicion (UNVERIFIED) is a Supabase
refresh-token rotation race: concurrent requests each attempt a refresh, one rotates the token,
the others present a consumed token and the session is invalidated. That would fit "bursts hurt,
spacing helps" and would be severe for a cashier clicking quickly.
**Status:** INVESTIGATION DISPATCHED (do not fix blind)

---

## Confirmed GOOD (verified, not assumed)
- **Nav is correctly reduced by permission.** cashier1's sidebar renders only POS, Sales,
  Inventory, Settings. No Accounting, Purchase, Reports or Dashboard.
- **Branch scoping is correctly enforced in the POS register picker.** cashier1 is restricted to
  Fahaheel and the register dropdown offers exactly `Register 1 (B2FAHAHEELREG1)` and
  `Register 2 (B2FAHAHEELREG2)`. The tenant has 8 registers across 4 branches; the other 6 are
  correctly absent.
- Forbidden routes render a proper permission page rather than a crash, a blank screen or a 404.
- The staff login page is tenant-branded ("Sign in to Gulf Auto Parts") on the subdomain.
- POS opened cleanly to the Open Shift screen with register + opening float.

## Minor, for the Settings phase
- The staff login page offers "Continue with Google" and "Don't have an account? Sign up" to
  staff who were issued a username and have no email. Both are dead ends for them.
  "Forgot password?" likewise cannot work for a username-only user with no email on file.
