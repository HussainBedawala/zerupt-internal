# Onboarding — Go-Live Readiness & Transition Testing Checklist

> Persona: **a UAE retailer about to flip the switch and start trading live.** This is the one-way door: after go-live, the tenant is a real, operating business and the setup decisions harden. The persona wants confidence that everything is ready; the product must block go-live if anything critical is missing and make the irreversibility unmistakable. This step also confirms the UAE tax setup actually works end to end (VAT201 reachable, boxes reference real accounts).

- **Route(s):** `/[locale]/(app)/onboarding` go-live
- **Feature dir:** `apps/web/src/features/onboarding/components/go-live/`
- **API:** `GoLiveReadinessService` (`go-live-readiness.ts`), `GoLiveService` (`GoLiveBlockedError`, `GoLiveUnacknowledgedError`), `/complete`; VAT201: `GET tenant/reports/vat201` (`UaeCountryGuard`)
- **Depends on:** 00-08 (the whole wizard + imports + opening balances)

## 0. Preconditions

- [ ] All prior steps completed for the chosen persona; opening balances tie out (or OBE-plugged).
- [ ] Persona: run go-live once per persona (P1 clean, P2 multi-branch/messy, P3 scale + DZ/reverse-charge).

## 1. Functional — actions & states

- [ ] **Readiness check** lists every prerequisite (country/currency set, TRN valid, tax profile provisioned, COA + control accounts present, at least one branch with emirate, tender types mapped, opening balances balanced) with pass/fail per item.
  - [ ] Loading/error/empty states; a failed readiness item is specific and links to the step that fixes it.
- [ ] **Go-live transition** requires explicit acknowledgement of irreversibility; `GoLiveUnacknowledgedError` blocks it until acknowledged.
- [ ] A blocked go-live (`GoLiveBlockedError`) names exactly what is missing; the user can go back, fix, and re-run.

## 2. Domain invariants

- [ ] Go-live is **blocked** if any critical setup is missing: no valid seller TRN, tax profile not provisioned, control accounts missing, unbalanced opening TB not plugged, no branch/emirate, or a tender type with no mapped account.
- [ ] Go-live is a **one-way** transition; the product warns clearly and does not allow silent rollback.
- [ ] `/complete` materializes the full pipeline atomically; a failure does not leave a half-live tenant.
- [ ] After go-live, the seeded config (tax codes, COA, opening balances) is present and correct in the live tenant; the trial balance still balances.

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] Attempting go-live with a failing readiness item is blocked with a specific reason, not a generic failure.
- [ ] Double-clicking go-live does not run the transition twice (debounced, idempotent).
- [ ] Acknowledgement cannot be bypassed by hitting the API directly (`GoLiveUnacknowledgedError` enforced server-side).
- [ ] Going live, then discovering a wrong setting: verify the supported correction path (`/reconfigure`) exists and is safe, and that it does not silently discard live data.
- [ ] RTL/LTR render; readiness copy in AR/EN; no em dashes.

## 4. Cross-module / integration

- [ ] After go-live, **VAT201 is reachable** at `/reports/vat201` for the AE tenant (and forbidden/inert for a non-AE tenant via `UaeCountryGuard`).
- [ ] VAT201 boxes reference the real accounts provisioned in step 4: Box 1 by emirate (7 rows, FTA order), Box 3/10 reverse-charge to `2131.10`/`1162.10`, Box 9 input recovery. Box 2/6/7 honestly show 0 with the documented "not computed" note, not a fake number.
- [ ] A test sale/receipt after go-live posts to the GL with correct 5% VAT (inclusive), the seller TRN prints on the receipt, and the emirate attributes the supply in VAT201. (Deep VAT201 tie-out lives in the accounting module checklist; here confirm the plumbing is live.)
- [ ] POS, inventory, and reports all reflect the imported data and are usable by the scoped roles from step 5.

## 5. Known gaps (from recon — verify or track)

- VAT201 Box 2/6/7 are permanently stubbed at 0 (no FTA/Customs feed) with warnings; verify the warnings render and the numbers are not mistaken for computed values.
- Confirm whether `/reconfigure` post-go-live is safe for a live tenant or should be restricted; flag if it can corrupt live books.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
- [ ] Tenant is live and hands off cleanly to the accounting, inventory, POS, sales, and purchase module testing passes.
</content>
