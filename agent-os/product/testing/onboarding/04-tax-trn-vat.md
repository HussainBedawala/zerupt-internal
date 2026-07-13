# Onboarding — Tax: TRN & VAT Profile Testing Checklist

> Persona: **a VAT-registered UAE retailer entering their TRN and confirming their tax setup.** This is the step that makes Zerupt a UAE tax product. The owner enters their 15-digit TRN and the product must provision the correct 5% VAT codes, groups, and accounts so that every downstream invoice, receipt, and the VAT201 return are correct. This is the whole point of the UAE pass: get tax wrong here and every number after it is wrong.

- **Route(s):** `/[locale]/(app)/onboarding` step 4
- **Feature dir:** `apps/web/src/features/onboarding/components/steps/step4-tax.tsx`, `schemas/`
- **API:** `PATCH tenant/onboarding` (step4); preview: `apps/api/src/onboarding/tax-preview.service.ts`; materialize: `apps/api/src/onboarding/pipeline/materialize-tax.ts`; runtime: `apps/api/src/tax-config/`
- **TRN validator:** `packages/shared/src/trn-validator.ts` (`validateTrn`, AE = `/^1\d{14}$/`)
- **Tax seed:** `apps/api/src/tax-config/tax-config.seed.ts` (`COUNTRY_TAX_PROFILES` AE entry)
- **Depends on:** 01 (country = AE), 03 (COA accounts exist for tax codes to bind to)

## 0. Preconditions

- [ ] Country AE; COA (step 3) committed so tax codes can bind to real accounts.
- [ ] Persona: **P1** (single standard-rated TRN, clean) is the primary; **P3** exercises reverse-charge/import treatment. Each persona README carries a valid seller TRN starting with `1`.

## 1. Functional — actions & states

- [ ] **Enter tenant TRN** and save; a preview of the VAT profile (codes + groups) is shown before commit.
  - [ ] Loading/error states on preview and save; error preserves the entered TRN.
  - [ ] Resume restores the TRN and tax selections.
- [ ] The tax profile preview lists the AE codes: **standard 5% (inclusive)**, **zero-rated**, **exempt**, **reverse-charge**, each in its correct group.

## 2. Domain invariants

- [ ] **TRN validation** enforces the AE format: exactly 15 digits starting with `1`. Reject 14/16 digits, leading digit ≠ 1, letters, spaces. Validation runs client AND server, and the server validates against the persisted country (`onboarding-state.service.ts`), not a client-supplied country.
- [ ] The materialized AE tax profile contains all four treatments with correct attributes: `VAT-AE-5` Standard/Inclusive/5%; `VAT-AE-0` ZeroRated/Inclusive; `VAT-AE-EX` Exempt/Exclusive; `VAT-AE-RC5` ReverseCharge/Exclusive/5%.
- [ ] Each code binds to the correct GL account: standard 5% output to the VAT output account; input recovery to the VAT input account; reverse-charge output to `2131.10` and reverse-charge input to `1162.10`. The reverse-charge code is **not** attached to a normal sales tax group.
- [ ] The default tax group ("UAE VAT 5%") is the one applied to standard-rated items; a blank/unspecified tax code on import defaults to standard 5% (matches P2's mess where blank codes should resolve to standard).
- [ ] **Tax-inclusive shelf pricing** is honored: the seller's listed consumer price is VAT-inclusive; the net + 5% breakdown is computed for the receipt/invoice, never re-charged on top. Verify the profile marks standard/zero as Inclusive.
- [ ] Full vs simplified tax invoice threshold is configured/available: above AED 10,000 a full tax invoice (buyer TRN required) is expected; below, simplified suffices. (Verify the rule is present for later invoice testing.)

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] Invalid TRN (wrong length, wrong leading digit, non-numeric) is rejected with a clear, specific message, not a generic error.
- [ ] Missing TRN on a tenant that selected AE (VAT-registered) is blocked or clearly flagged; the product should not go live claiming VAT compliance without a valid seller TRN.
- [ ] Re-running/reconfiguring tax does not duplicate codes or groups (idempotent materialization).
- [ ] Changing the standard rate away from 5% (if editable) warns loudly; the persona is a UAE business where 5% is legally fixed.
- [ ] RTL/LTR render; tax code and group names display in AR/EN.

## 4. Cross-module / integration

- [ ] TRN entered here appears as the **seller** TRN on POS receipts and invoices (`tax-label.ts`, print features). B2B **customer/supplier** TRNs are captured on their own records (customers/suppliers import), not here.
- [ ] The VAT output/input and reverse-charge accounts bound here are the accounts VAT201 reads for Box 1/3/9/10; if they are missing or mis-bound, VAT201 boxes cannot populate. Verify each bound account resolves in the COA.
- [ ] Reverse-charge code enables P3's import and DZ-to-mainland self-assessment; verify it is available before P3's import runs.

## 5. Known gaps (from recon — verify or track)

- VAT201 Box 2 (tourist refunds), Box 6 (customs imports), Box 7 (import adjustments) are permanently stubbed at 0 (no FTA/Customs feed). This is by design; verify the tax setup does not imply these are computed.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
</content>
