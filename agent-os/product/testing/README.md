# Zerupt — Live Testing Checklists

This directory holds **manual / live testing checklists** for every module of Zerupt. They are the human-driven counterpart to the automated test suite: where unit/integration/E2E tests catch regressions in CI, these docs let a human (or an agent dogfooding the product) systematically walk every screen and action **as a real user would**, and catch the things automated tests miss — confusing UX, broken states, wrong numbers, accounting that doesn't tie out.

## Design principles

- **Persona-driven.** Each module is tested *as the target user*. Accounting is tested **as an accountant** — someone who expects double-entry to be correct, reports to tie out, and periods to lock. Inventory as a storekeeper, POS as a cashier, etc.
- **Reusable across customers and datasets.** Checklists are **purely generic** — steps + invariants, never hardcoded customer numbers. You bring your own dataset (e.g. a persona) and verify the *invariants* hold for it. Expected-value sheets, if ever needed, live separately per customer and are never committed into these generic docs.
- **Invariant-first.** Every doc states the *properties that must hold* (e.g. "debits = credits", "GL ties to TB", "BS balances"), not just "click the button". A checklist item passes only if the invariant holds for whatever data is loaded.
- **Defensive-UX aware.** Every interactive item checks the four states — loading / error / empty / success — and asks "what's the dumbest thing a user could do here?" (per the project's defensive-UX mandate).
- **Live and maintained.** When a screen changes, update its checklist in the same session. When a checklist finds a real bug, log it in the module's `_findings.md`.

## Structure

```
testing/
  README.md              ← this file
  _TEMPLATE.md           ← copy this to author a new submodule checklist
  accounting/
    README.md            ← module index + cross-cutting accounting invariants
    NN-<submodule>.md    ← one checklist per submodule
    _findings.md         ← running findings log for this module
  <other-modules>/       ← same shape, added as they are tested
```

## How to run a testing pass

1. Open the module's `README.md` — read the **cross-cutting invariants** first; they apply to every submodule.
2. Work submodule-by-submodule in numeric order (dependencies flow downward — COA before journals before reports).
3. For each item: perform the action with your loaded dataset, then verify the stated invariant.
4. Log anything that fails in `_findings.md` with severity (CRITICAL / HIGH / MEDIUM / LOW), repro steps, and expected vs actual.
5. Fix by severity; re-run the affected item after each fix.

## Cross-cutting systemic findings (check these on EVERY module)

These recurred across nearly every accounting screen during live testing (2026-06-28/29). Check for them proactively on every module before deep-testing each screen — they are the house's most common defects:

1. **Hardcoded currency defaults** (saw "USD", "SAR") instead of the tenant's functional currency. Fix: `useTenantCurrency()` (`apps/web/src/features/dashboard/lib/use-tenant-currency.ts`). Never hardcode.
2. **2-decimal formatting** instead of dynamic currency precision (KWD = 3dp). Fix: reuse `apps/web/src/lib/currency-precision.ts` (`getCurrencyDecimals` / `formatToDecimals`). Never hardcode 2 or 3. Also normalize typed int → float on blur.
3. **Redundant module layout header** on sub-pages (e.g. wrong/duplicate header above a sub-page title). Pattern fix: the section resolver returns `""` for non-section sub-paths (see `apps/web/src/lib/accounting-sections.ts`).
4. **Free-text inputs that should be searchable pickers** (accounts, locations, items). Reuse existing picker components + endpoints (e.g. `GET /tenant/accounts/cash-bank`); don't rebuild.
5. **Secondary-language label/placeholder** hardcoded to Arabic or to the default language. Use `useBilingualLabels()`, `dir="auto"`, and hide the field for monolingual tenants.
6. **Toolbar polish**: filter dropdown chevron misalignment; date-picker calendar icon overlapping/truncating text; missing CSV export on list/report screens.
7. **Defensive UX gaps**: every action needs loading / error / empty / success states; destructive actions need confirmation + data-loss warnings; debounce buttons; validate client + server.

## Severity rubric

| Severity | Meaning |
|----------|---------|
| **CRITICAL** | Wrong financial numbers, data loss/corruption, broken double-entry, cross-tenant leak, cannot complete a core flow. |
| **HIGH** | Core action fails or is blocked, missing guard on destructive action, report doesn't tie out under a common scenario. |
| **MEDIUM** | Confusing/missing state (no empty/error state), missing export, edge case mishandled, non-blocking incorrectness. |
| **LOW** | Cosmetic, copy, minor UX polish, nice-to-have. |
