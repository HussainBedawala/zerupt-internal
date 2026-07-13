# Onboarding Module — Testing Index

> **Persona for the whole module: a first-time UAE retailer going from signup to live in under 2 hours.** Not an accountant, not technical. A shop owner (or the staff member they delegated to) who wants their stock, prices, VAT, and books set up correctly by following the wizard. They will abandon at the first confusing screen and they will trust whatever number the product shows them. The onboarding wizard is the product's first impression and the moment all downstream correctness (VAT, COGS, AR/AP) is seeded, so getting it wrong here poisons every other module.

Onboarding is the signup-to-live pipeline: create the tenant, provision a dedicated database, run the 7-step wizard (business info, locations, accounting, tax, team, POS, data sources), import the migrating business's messy data (the AI-first import is the wedge), reconcile opening balances, then flip go-live. It is tested here as the **UAE first-VAT-on pass** — Kuwait (no VAT) is already done, so tax correctness is the whole point.

## Which persona exercises what

| Area | Best persona | Why |
|------|--------------|-----|
| Clean happy-path signup, single branch, standard 5% VAT, tax-inclusive pricing | **P1 Nur Al Sharq Perfumes** | One Dubai shop, one tax group, clean files. The control path. |
| Multi-branch + emirate field, different-weekend branch, messy import, OBE plug | **P2 Meydan Mobiles** | 3 branches (Dubai/Sharjah/Ajman), Sharjah Fri-Sun weekend, dupe SKU, blank costs, mis-tagged VAT, TB unbalanced by exactly AED 950. |
| B2B scale import, Designated Zone, reverse charge, foreign suppliers, missing TRNs | **P3 Emirates Building Materials** | 8,500 items + 4,200 customers (xlsx), Jebel Ali DZ store, reverse-charge imports, 3 foreign suppliers with no TRN, ~8% customers missing TRN. |

## Submodule checklists (run in order — dependencies flow downward)

| # | Submodule | Route |
|---|-----------|-------|
| 00 | [Signup & Provisioning](00-signup-provisioning.md) | `/(auth)/signup` |
| 01 | [Business Info & Country](01-business-info-country.md) | `/onboarding` step 1 |
| 02 | [Locations & Emirate](02-locations-emirate.md) | `/onboarding` step 2 |
| 03 | [Accounting: Currency, Fiscal, COA](03-accounting-currency-coa.md) | `/onboarding` step 3 |
| 04 | [Tax: TRN & VAT Profile](04-tax-trn-vat.md) | `/onboarding` step 4 |
| 05 | [Team & Roles (RBAC)](05-team-rbac.md) | `/onboarding` step 5 |
| 06 | [POS & Tender Types](06-pos-tenders.md) | `/onboarding` step 6 |
| 07 | [Data Import (AI-first) & Mira](07-data-import.md) | `/onboarding` step 7, `/import` |
| 08 | [Opening Balances & Reconciliation](08-opening-balances.md) | `/opening-balance` |
| 09 | [Go-Live Readiness & Transition](09-go-live-readiness.md) | `/onboarding` go-live |

Findings: [`_findings.md`](_findings.md)

> Note: VAT201 correctness (the payoff of the tax setup seeded here) is verified in the **accounting** module's VAT201 checklist. This module verifies only that onboarding *provisions* the codes, groups, and reverse-charge accounts that let VAT201 populate. The final go-live check (09) confirms VAT201 is reachable and its boxes reference real accounts.

---

## Cross-cutting onboarding invariants (apply to EVERY submodule)

These must hold no matter which persona is loaded. If any fails, it is at least HIGH.

### Resumability & atomicity
- [ ] The wizard is **resumable**: closing the tab or logging out and back in restores the exact step and all entered answers (state is persisted server-side, not just in the browser).
- [ ] No step commits partial, irreversible state to the tenant. Config is previewed and only materialized at `/complete`; a failure mid-pipeline leaves a re-runnable state, not a half-provisioned tenant.
- [ ] Provisioning (per-tenant DB, migrations, seed config) either fully completes or fails loud with a re-tryable status. No tenant is left "ready" with a missing database or unseeded config.

### Country drives everything (UAE)
- [ ] The country chosen in step 1 (**AE**) deterministically drives currency default (AED), locale defaults (ar + en, RTL, Asia/Dubai, DD/MM/YYYY), tax system (VAT), TRN requirement and format, and the emirate field on branches. Changing country changes all of these consistently.
- [ ] Every UAE-gated feature (emirate field, VAT201, TRN validation) is present for an AE tenant and absent/inert for a non-AE tenant. No cross-country leakage of tax rules.

### Correctness of seeded financial config (non-negotiable)
- [ ] Currency precision is AED 2-decimal (fils) everywhere the wizard shows money. Never hardcoded USD/SAR/KWD; never 3-decimal.
- [ ] The tax profile seeded for AE contains the full set: standard 5% (inclusive), zero-rated, exempt, and reverse-charge codes, each in the correct tax group, each bound to the correct GL accounts (including the reverse-charge input/output sub-accounts).
- [ ] The COA seeded/reconciled is internally consistent: control accounts (AR, AP, inventory, VAT input/output) exist and are mapped before any import posts to them.
- [ ] Opening balances imported during onboarding produce a **balanced** trial balance; any imbalance is surfaced and plugged transparently to an Opening Balance Equity account, never silently absorbed.

### Defensive UX (this persona is not technical)
- [ ] Every step has clear loading / error / empty / success states. No blank screens, no raw stack traces, no lost input on error.
- [ ] Destructive or one-way actions (go-live, re-provision, discard import) require explicit confirmation and warn about data loss / irreversibility.
- [ ] Validation runs on **both** client and server; the server re-validates against the persisted country (a client that skips a rule cannot slip bad data through).
- [ ] Buttons debounce; rapid re-clicks and double-submits do not create duplicate branches, users, imports, or provisioning jobs.

### Localization
- [ ] Arabic (RTL) and English (LTR) both render correctly on every step; no hardcoded English or Arabic labels; secondary-language fields hidden for a monolingual tenant.
- [ ] CSS logical properties only (no physical left/right); numbers, dates, and currency are localized per the AE locale.
- [ ] No em dashes in any wizard copy.

### Tenant isolation (security)
- [ ] Onboarding endpoints are owner-only where the code gates them; a non-owner cannot start, configure, or complete onboarding.
- [ ] All data shown and provisioned belongs to the current tenant only; no cross-tenant leakage in previews, imports, or reconciliation.
</content>
</invoke>
