# Onboarding — POS & Tender Types Testing Checklist

> Persona: **a UAE retailer configuring how they take payment.** They expect the payment methods they actually use at the counter: cash, card, Apple/Google Pay, and the UAE BNPL stack (Tabby/Tamara). Cash in the UAE rounds to the nearest 25 fils. The tender types configured here are what the cashier will tap on the POS, so the list must match reality.

- **Route(s):** `/[locale]/(app)/onboarding` step 6
- **Feature dir:** `apps/web/src/features/onboarding/components/steps/step6-pos.tsx`
- **API:** `PATCH tenant/onboarding` (POS config); default tender types seeded at provisioning (`seed-config.step.ts`)
- **Depends on:** 00 (default tender types seeded), 02 (branches for per-branch POS), 03 (AED precision)

## 0. Preconditions

- [ ] Default tender types were seeded at provisioning; this step lets the owner adjust them.
- [ ] Persona: **P1** = cash, card, Apple Pay; **P2/P3** add Tabby/Tamara BNPL. All AED 2-decimal, cash rounds to nearest 25 fils.

## 1. Functional — actions & states

- [ ] **View and edit tender types**: the seeded defaults show; the owner can add/enable Cash, Card, Apple Pay, Google Pay, Tabby, Tamara.
  - [ ] Loading/error states on save; error preserves changes.
  - [ ] Empty/default state shows sensible AE defaults, not an empty list.
- [ ] Enable/disable a tender type; disabling one already used later is guarded.
- [ ] Per-branch POS settings (P2/P3) can differ where the product supports it.

## 2. Domain invariants

- [ ] Tender amounts are AED 2-decimal (fils); no 3-decimal carryover.
- [ ] **Cash rounding to nearest 25 fils** is applied at settlement for cash tenders, and the rounding difference posts to a rounding account (verify the account exists / is mapped so POS can post it).
- [ ] Each tender type maps to a settlement/clearing account so POS sales post correctly to the GL; BNPL (Tabby/Tamara) settles to its own receivable/clearing account, not treated as immediate cash.
- [ ] Tax-inclusive pricing means the tendered total already includes 5% VAT; the VAT breakdown is computed for the receipt, not added on top of the tendered amount.

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] Disabling all tender types (leaving none) is prevented; the POS must always have at least one way to take payment.
- [ ] A tender type with no mapped GL account is flagged before go-live (POS would fail to post otherwise).
- [ ] Rapid re-save / double-submit does not duplicate tender types.
- [ ] Rounding logic is correct at boundary amounts (e.g. values ending in 12 fils and 13 fils round to the correct 25-fils step).
- [ ] RTL/LTR render; tender names display in AR/EN.

## 4. Cross-module / integration

- [ ] Tender types configured here are exactly what the cashier sees on the POS payment screen (no mismatch with the seeded set from provisioning).
- [ ] Each tender's mapped account is a real COA account from step 3; BNPL and card clearing accounts resolve.
- [ ] Cash rounding account is the one accounting later reconciles.

## 5. Known gaps (from recon — verify or track)

- Verify whether Tabby/Tamara are real integrations or manual tender types at this stage; if manual, confirm they still post to a distinct BNPL clearing account rather than cash.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
</content>
