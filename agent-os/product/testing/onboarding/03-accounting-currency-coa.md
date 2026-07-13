# Onboarding — Accounting: Currency, Fiscal, COA Testing Checklist

> Persona: **a UAE retailer who is not an accountant**, setting the money foundation without understanding it. They pick AED, a fiscal year, and accept a chart-of-accounts template. Everything downstream (VAT, COGS, AR/AP) posts into what is seeded here, so the accounts and control mappings must be correct and complete before any import runs.

- **Route(s):** `/[locale]/(app)/onboarding` step 3
- **Feature dir:** `apps/web/src/features/onboarding/components/steps/step3-accounting.tsx`
- **API:** `PATCH tenant/onboarding` (`step3AnswersSchema`); COA: `apps/api/src/accounts/coa-template.ts`, `coa-template-builder.ts`, `coa-country-overlays.ts`; preview/reconcile: `onboarding/coa-reconciliation/` (`CoaPreviewService`, `CoaReconciliationService`)
- **Config:** `SUPPORTED_CURRENCIES` (incl. AED), `country-currency.ts` (`getDefaultCurrency`)
- **Depends on:** 01 (country = AE)

## 0. Preconditions

- [ ] Country AE set; functional currency should default to AED.
- [ ] Persona: **P1/P2** = AED-only; **P3** also has foreign-currency import invoices (China/India/Turkey) so transaction currencies beyond AED may apply.

## 1. Functional — actions & states

- [ ] **Functional currency** defaults to AED and is shown at 2-decimal (fils) precision.
- [ ] **Transaction currencies** can be added (P3: foreign suppliers) and must not overlap the functional currency.
- [ ] **Fiscal year start** is selectable (personas use 1 January); saved and reflected in later period logic.
- [ ] **COA template** choice previews the accounts that will be created before commit.
  - [ ] Loading/error/empty states on the preview; error preserves selections.
  - [ ] Resume restores currency, fiscal, and COA selections.

## 2. Domain invariants

- [ ] Functional currency AED is 2-decimal everywhere; never hardcoded to USD/SAR and never 3-decimal (KWD carryover bug).
- [ ] The COA seeded includes all control accounts the rest of onboarding needs **before** import runs: AR control, AP control, inventory control, VAT **output** and VAT **input** accounts, and the reverse-charge input/output sub-accounts (`1162.10` input, `2131.10` output) referenced by the AE tax profile and VAT201.
- [ ] The country overlay (`coa-country-overlays.ts`) applies AE-specific accounts (import/reverse-charge VAT sub-accounts) on top of the base template; verify they exist post-commit.
- [ ] COA reconciliation (when importing the migrating business's own accounts) maps imported accounts to the template's canonical accounts without duplicating control accounts, and caps/limits AI suggestions sensibly.
- [ ] Transaction currencies plus functional currency are non-overlapping; foreign-currency amounts will later store both transaction and base (AED) amounts.

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] Selecting a transaction currency equal to the functional currency is rejected with a clear message.
- [ ] Changing fiscal year start after selecting it does not silently corrupt period boundaries; consequences are clear.
- [ ] Choosing a COA template then switching does not leave orphaned accounts from the first choice.
- [ ] Very large COA (P3) previews and commits without timeout or truncation; row counts shown.
- [ ] RTL/LTR render; account names in AR/EN both display.

## 4. Cross-module / integration

- [ ] Accounts seeded here are the ones the tax profile (step 4) binds VAT codes to; verify the tax codes' target accounts all resolve.
- [ ] Control accounts here are what AR/AP aging and inventory valuation later tie to (subledger = control account balance).
- [ ] Foreign transaction currencies here enable FX handling on P3's import invoices.

## 5. Known gaps (from recon — verify or track)

- Full COA is provisioned in the wizard pipeline (`/complete`), not at signup. Verify no earlier step attempts to post to an account before this step commits.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
</content>
