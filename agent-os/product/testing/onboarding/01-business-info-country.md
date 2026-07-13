# Onboarding — Business Info & Country Testing Checklist

> Persona: **a UAE shop owner entering their business name and country.** This is the single most important step: the country they pick (AE) silently drives currency, locale, tax regime, TRN rules, and the emirate field on every downstream screen. Test that picking AE turns the whole product into a UAE product.

- **Route(s):** `/[locale]/(app)/onboarding` step 1
- **Feature dir:** `apps/web/src/features/onboarding/components/steps/step1-business-info.tsx`, `step1-transform.ts`
- **API:** `PATCH tenant/onboarding` (`step1AnswersSchema`), `GET tenant/onboarding` (resume)
- **Config:** `SUPPORTED_COUNTRIES` (`onboarding.dto.ts`), `country-currency.ts`, `country-locale.ts`, `tax-config.seed.ts`
- **Depends on:** 00 (signup & provisioning)

## 0. Preconditions

- [ ] Logged in as the Owner of a freshly provisioned tenant; wizard at step 1.
- [ ] Persona: **P1** for the clean single-entity case; **P2/P3** share the same step 1 shape.

## 1. Functional — actions & states

- [ ] **Enter legal/trade name** (EN and AR) and select country **United Arab Emirates**; save advances to step 2.
  - [ ] Loading state on save; button debounced.
  - [ ] Error state on save failure preserves entered name and country.
  - [ ] Re-entering the wizard restores the saved name, country, locale, and timezone.
- [ ] Country selector is a searchable picker (not free text) restricted to `SUPPORTED_COUNTRIES`; AE is present.
- [ ] Locale (ar/en) and timezone default sensibly for AE (Asia/Dubai) and are editable.

## 2. Domain invariants

- [ ] Choosing **AE** sets, deterministically and consistently: default functional currency **AED**; locale defaults ar + en with RTL; timezone Asia/Dubai; date format DD/MM/YYYY; default tax system **VAT**; TRN required with the AE format (`1` + 14 digits).
- [ ] The country persisted server-side is what later steps validate against (step 4 TRN, step 2 emirate, VAT201 gating all read this persisted country, not a client value).
- [ ] Changing the country before commit re-derives all downstream defaults (currency, locale, tax system) rather than leaving stale values from a previously selected country.
- [ ] Legal entity name (EN + AR) is stored language-agnostically; neither language is hardcoded and the AR name is captured for receipt headers.

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] Blank business name or no country selected is rejected client and server side with clear guidance.
- [ ] Selecting a non-AE country then switching to AE cleanly re-derives AE defaults (no leftover non-VAT tax system, no wrong currency).
- [ ] Very long / RTL / mixed-script business names render correctly on this step and later on receipt-header previews (bidi isolation).
- [ ] Rapid re-clicks of Save/Next do not create duplicate state or skip a step.
- [ ] Timezone/locale changes reflect immediately in date/number rendering on the same screen.

## 4. Cross-module / integration

- [ ] The country set here gates the emirate field in step 2, the TRN rules in step 4, the VAT profile in step 4, and VAT201 availability post-live. Verify each downstream gate reflects AE.
- [ ] The default legal entity (`MAIN`) from provisioning is the one this step configures; no second legal entity is silently created.

## 5. Known gaps (from recon — verify or track)

- No dedicated multi-legal-entity creation step in the wizard; additional legal entities are managed post-onboarding. Confirm a single-entity UAE business (all personas) is fully served by step 1 + step 3.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
</content>
