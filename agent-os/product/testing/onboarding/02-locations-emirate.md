# Onboarding — Locations & Emirate Testing Checklist

> Persona: **a UAE retailer setting up their branches.** A single-shop owner (P1) adds one location; a multi-branch owner (P2/P3) adds several across different emirates, one of which keeps a different weekend, and one of which (P3) is inside a free zone. The emirate they tag each branch with later drives the VAT201 place-of-supply split, so a wrong or missing emirate is a downstream tax error.

- **Route(s):** `/[locale]/(app)/onboarding` step 2
- **Feature dir:** `apps/web/src/features/onboarding/components/steps/step2-locations.tsx`, `step2-csv-import.tsx`; `apps/web/src/features/locations/components/branch-dialog.tsx`
- **API:** `PATCH tenant/onboarding` (locations), `LocationsCsvService`; branches: `apps/api/src/branches/` (`emirateSchema`, `assertEmirateAllowedForCountry`)
- **Emirate list:** `packages/shared/src/uae/emirates.ts` (`UAE_EMIRATES`, FTA order)
- **Depends on:** 01 (country = AE)

## 0. Preconditions

- [ ] Country is AE (set in step 1) so the emirate field is available.
- [ ] Persona: **P1** = 1 branch (Dubai); **P2** = 3 branches (Dubai/Sharjah/Ajman, Sharjah Fri-Sun weekend); **P3** = 5 stores + warehouse incl. Jebel Ali Free Zone (Designated Zone).

## 1. Functional — actions & states

- [ ] **Add a branch** with name, address, and **emirate**; it appears in the list and carries the emirate.
  - [ ] Loading state on save; button debounced (no duplicate branch on double-click).
  - [ ] Error state preserves entered branch data.
  - [ ] Empty state (no branches yet) is clear and prompts adding the first.
- [ ] Emirate is a **picker** limited to the 7 emirates (Abu Dhabi, Dubai, Sharjah, Ajman, Umm Al Quwain, Ras Al Khaimah, Fujairah), shown in FTA order.
- [ ] **Bulk CSV import of locations** (P2/P3) maps columns to branch fields including emirate; preview before commit; row-level errors surfaced.
- [ ] Per-branch receipt header and per-branch weekend/working-days are configurable (P2 Sharjah = Fri-Sun differs from Dubai/Ajman Sat-Sun).

## 2. Domain invariants

- [ ] The emirate field is present only for AE tenants; `assertEmirateAllowedForCountry` rejects setting an emirate on a branch whose legal entity is not AE (client and server).
- [ ] Emirate value is one of the 7 canonical `UAE_EMIRATES` codes; free text is not accepted.
- [ ] Each branch's emirate is persisted and is the value VAT201 Box 1 later attributes standard-rated supplies to. A branch with no emirate set will make its supplies land in VAT201 "unassigned" (Box 1 incomplete) — this must be knowable now, not a silent surprise later.
- [ ] A Designated Zone branch (P3 Jebel Ali) can be flagged/identified as such so its DZ-to-mainland transfers are later treated as reverse-charge imports, distinct from ordinary inter-branch transfers.
- [ ] Per-branch weekend calendars are independent (P2 Sharjah Fri-Sun does not force the other branches off their Sat-Sun weekend).

## 3. Edge cases & defensive UX — "the dumbest thing a user could do"

- [ ] Adding a branch with no emirate on an AE tenant is either blocked or clearly flagged as "will not be attributed in VAT201" (no silent gap).
- [ ] Duplicate branch names / rapid re-submit do not create duplicates.
- [ ] CSV import with missing emirate column, wrong emirate spellings, blank rows, or Arabic-Indic digits is handled: bad rows surfaced, good rows importable, nothing silently dropped.
- [ ] Deleting a branch that has already been referenced (e.g. by an import mapping) is guarded or warns about consequences.
- [ ] RTL/LTR render; branch names with mixed AR/EN script use bidi isolation.

## 4. Cross-module / integration

- [ ] Branches created here appear in inventory (stock-by-branch), POS (cashier scope), and reports (per-branch filters).
- [ ] The emirate set here flows to VAT201 Box 1; the DZ flag flows to reverse-charge handling on transfers.
- [ ] Per-branch receipt headers set here appear on POS/invoice prints (with the tenant TRN from step 4).

## 5. Known gaps (from recon — verify or track)

- Confirm whether the DZ designation is a first-class branch attribute or inferred elsewhere; if inferred, verify P3's Jebel Ali transfers still trigger reverse charge.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
</content>
