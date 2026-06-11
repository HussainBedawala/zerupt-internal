---
title: Kuwait — Manual Testing Checklist (User-Journey Driven)
country: KW
currency: KWD (3 decimals — fils)
tax: none (no VAT in Kuwait as of 2026; 5% planned ≥2027, uncertain)
personas: [Yousef (electronics), Umm Faisal (baqala), Noura (perfume & cosmetics)]
created: 2026-06-09
updated: 2026-06-10
audited_against: stress-test-master-journeys.md (2026-06-09 green pass) + live codebase walk (2026-06-10)
engineering_reference: >
  Every onboarding step in Section 1A now carries a "📁 Build reference" block naming the
  exact frontend component, backend pipeline step, country-config source, API endpoint, and
  the unit/E2E tests that cover it — so a failing checkbox can be traced straight to the file
  and the test that should have caught it. File paths are relative to erp/.
purpose: >
  A human walk-through script. For each persona, follow the flow screen-by-screen
  from their very first login through their first day, then daily, month-end,
  quarter-end and year-end. Tick each row. Every row says exactly what to DO,
  what SHOULD happen, what the user should FEEL, and where Zerupt's AI / features
  are meant to carry them.
how_to_use: >
  Use the seeded test data where it exists (Yousef). Where a persona's data is
  missing, the "Test data needed" callout at the top of that persona lists exactly
  what to generate first. Dad's real receipts/invoices should be fed into Sami
  (Stage: Purchasing) and the migration importer (Stage: First Day) to validate
  extraction against reality.
legend: >
  ✅ built & expected to pass · ⚠️ known rough edge to watch · 🤖 AI moment ·
  💚 the emotional beat we are testing for · 🧾 use a real receipt/invoice here
---

# Kuwait Manual Testing Checklist

> **Money rule for every screen, every persona:** KWD shows **3 decimals** (1 KD = 1,000 fils).
> If you ever see `12.50` where it should be `12.500`, or a rounding to 2 places on a
> receipt / report / z-report — **stop and log it**. This is the single most trust-breaking
> bug for a Kuwaiti merchant.
>
> **Tax rule:** Kuwait has **no VAT**. No screen should say "VAT", "TAX INVOICE", or render a
> tax line/column. If it does — log it. A tax line on a Kuwaiti receipt makes the owner think
> the software is "for another country" and they walk.

---

## How the three personas map to the product

| Persona | Business | Why we test them | Feature surface they stress |
|---|---|---|---|
| **Yousef Al-Harbi** | Al-Noor Mobiles — phones & accessories, **2 outlets**, resellers on credit | The canonical Kuwait merchant; seeded test data exists | IMEI/serial tracking · stock transfer between stores · B2B credit/AR · multi-branch reports |
| **Umm Faisal** | Baqala / mini-market, **1 store**, cash + KNET, FMCG | The "live in 2 hours" proof; highest POS volume, simplest books | High-volume offline POS · batch/expiry (FEFO) · cash float & variance · reorder |
| **Noura Al-Sabah** | Perfume & cosmetics boutique, **1 store**, walk-in retail | Promotions, bundles, returns, repeat customers | Promotions at sale time · gift bundles · returns/exchanges · customer history |

---
---

# PERSONA 1 — YOUSEF (Al-Noor Mobiles, electronics, 2 outlets)

> **Test data:** ✅ Seeded under `test-data/yousef/` (3,000 SKUs w/ IMEI, 800 customers, 18 suppliers,
> IMEI register, trial balance, 2-warehouse opening stock). 🧾 Feed Dad's **real mobile-shop supplier
> invoices** into Sami in the Purchasing stage.
>
> **Generate before testing (gaps):** per-customer **opening balances** (reseller dues) import file;
> a Windows-1256-encoded customer CSV to test Arabic encoding.

---

## 1A · Engineering Reference — files, endpoints, tests (read before the walk-through)

> This is the map behind every checkbox in Section 1A. When a step fails, find it here, open
> the named file, and check whether the named test still passes. All paths are relative to `erp/`.

### Onboarding architecture at a glance

- **Frontend feature root:** `apps/web/src/features/onboarding/`
- **Route entry:** `apps/web/src/app/[locale]/(app)/onboarding/page.tsx`
- **Shell / orchestrator:** `components/onboarding-wizard.tsx` → `components/steps/step-renderer.tsx`
- **Screen order (state machine):** `welcome → roadmap → wizard (steps 1–7) → review → pipeline → meetTeam → import → goLive`
- **Navigation store (Zustand, no DB persist):** `store/wizard-store.ts` (`useWizardStore`); screens `pipeline/goLive/import/meetTeam` persisted to `sessionStorage` key `zerupt:onb:screen`; "met team" one-time flag in `localStorage` key `zerupt:onb:met-team`
- **Server draft state:** table `onboardingState` (`packages/db/src/schema/onboarding.ts`) — columns `currentStep`, `answers` (JSONB, per-step), `completedAt`, `wentLiveAt`, `onboardingFrozen`. Service `apps/api/src/onboarding/onboarding-state.service.ts`
- **TanStack Query keys:** `["tenant","onboarding","state"]` · `["tenant","onboarding","complete"]` · `["tenant","onboarding","go-live-readiness"]` · `["tenant","onboarding","first-login"]`
- **Test-id registry:** `apps/web/src/lib/testids/onboarding.ts` (`ONBOARDING_TID.*`)

### Endpoint cheat-sheet

| Action | Method + route | Backend |
|---|---|---|
| Sign up (create tenant) | `POST /api/tenant-signup` (`@AuthOnly`, 5/min/IP) | `tenant-signup/tenant-signup.service.ts` |
| Poll provisioning | `GET /api/tenant-signup/provisioning-status/:jobId` (~1.5s) | self-heals stale-queued after 15s |
| Clear stale tenant claim | `POST /api/tenant-signup/reset-stale` | clears Supabase `app_metadata.tenant_id` |
| Load wizard state | `GET /tenant/onboarding/state` | `onboarding-state.service.ts` |
| Save a step | `POST /tenant/onboarding/:step/answer` | Zod-validated per step |
| Run 11-step materialization | `POST /tenant/onboarding/complete` | `onboarding-complete.service.ts` (idempotent via checksum) |
| Go-live dry-run | `GET /tenant/onboarding/go-live-readiness` | `go-live-readiness.service.ts` |
| Go live (one-way) | `POST /tenant/onboarding/go-live` | `go-live.service.ts` |

### Per-step file + test map

| Step | Frontend component | Transform / schema | Backend | Unit tests |
|---|---|---|---|---|
| Welcome | `components/welcome-screen.tsx` | — | — | `lib/use-welcome-audio.test.ts` |
| Roadmap | `components/roadmap-screen.tsx` | `data/wizard-steps.ts` | — | `data/wizard-steps.test.ts` |
| 1 Business info | `components/steps/step1-business-info.tsx` | `step1-transform.ts`, `data/industry.ts`, `data/inventory-concept.ts`, `data/countries.ts` | country defaults: `common/country-currency.ts`, `common/country-locale.ts`, `common/country-defaults.ts` | `step1-transform.test.ts`, `data/countries.test.ts`, `data/inventory-concept.test.ts`, `common/country-defaults.spec.ts`, `common/country-currency.spec.ts` (KWD 3dp at line 50) |
| 2 Locations | `components/steps/step2-locations.tsx`, `step2-csv-import.tsx` | `step2-transform.ts` | pipeline `materialize-locations.ts` | `step2-transform.test.ts`, `materialize-locations.spec.ts` |
| 3 Accounting | `components/steps/step3-accounting.tsx`, `step3-coa-import.tsx` | `step3-transform.ts` | `materialize-coa.ts`, `materialize-currency.ts`, `materialize-fiscal.ts` | `step3-transform.test.ts`, `onboarding-step3.dto.spec.ts`, `materialize-{coa,currency,fiscal}.spec.ts` |
| 4 Tax | `components/steps/step4-tax.tsx` | `step4-transform.ts` (`taxUiKind()` → KW = `none`) | `materialize-tax.ts`; profile `tax-config/tax-config.seed.ts` (`NO-TAX-KW`, rate 0) | `step4-transform.test.ts`, `materialize-tax.spec.ts` |
| 5 Team | `components/steps/step5-team.tsx` | `step5-transform.ts` | seeded in `provisioning/steps/seed-config.step.ts` (Owner role) | `step5-transform.test.ts` |
| 6 POS | `components/steps/step6-pos.tsx` | `step6-transform.ts` (`step6FormSchema(country)`) | `materialize-pos.ts`; tenders `pos/tender-types/pos-tender-type-defaults.ts` (`COUNTRY_EXTRAS.KW = KNET`) | `step6-transform.test.ts`, `materialize-pos.spec.ts` |
| 7 Data sources | `components/steps/step7-data-sources.tsx` | `step7-transform.ts` | — | `step7-transform.test.ts`, `step7-data-sources.test.tsx` |
| Review | `components/review-screen.tsx` | `lib/review-summary.ts` | — | `lib/review-summary.test.ts` |
| Pipeline | `components/pipeline-progress.tsx` | `PIPELINE_STEP_KEYS` in `onboarding-pipeline.dto.ts` | `onboarding-complete.service.ts` + 11 `pipeline/materialize-*.ts` | `pipeline-progress.test.tsx`, `onboarding-complete.service.spec.ts` |
| Meet team | `components/meet-team-screen.tsx` | — | — | — |
| Import | `components/import-screen.tsx` + `features/import/` | see **§1A-11** | `apps/api/src/import/*` + `apps/ai/app/models/import_assist.py` | see **§1A-11** |
| Go-live | `components/go-live/go-live-screen.tsx` | `schemas/go-live.ts` | `go-live.service.ts`, `go-live-readiness.service.ts` | `go-live-screen.test.tsx`, `go-live.service.spec.ts` |

### Provisioning runs in TWO phases (don't confuse them)

1. **At signup (infrastructure, 4 steps)** — `provisioning/provisioning-worker.service.ts`, order in `provisioning.constants.ts` (`PROVISIONING_STEP_ORDER`): `CreateDbStep` → `RunMigrationsStep` → `SeedConfigStep` (seeds identity, Owner role, legal entity, fiscal settings, **KWD @ 3 decimals**, default tenders incl. **KNET**) → `MarkReadyStep`. pg-boss queue, no polling (DEV-388), step-level resume on retry.
2. **At "Set up my workspace" (materialization, 11 steps)** — `POST /tenant/onboarding/complete`, keys in order: `settings · locations · coa · account-mappings · currency · fiscal · tax · doc-numbering · pos · notifications · dashboard`. This is the bar the user watches in §1A-9.

### E2E coverage (Playwright)

- `apps/web/e2e/onboarding/onboarding-journey.spec.ts` — full welcome→go-live, **EN and AR locales**
- `apps/web/e2e/onboarding/onboarding-import-variants.spec.ts` — import skip / entity / opening-seed / deep-link restore
- `apps/web/e2e/lifecycle/first-run-lifecycle.spec.ts` — onboarding → go-live → dashboard
- Page object: `apps/web/e2e/pages/onboarding-wizard.page.ts` · import helpers: `apps/web/e2e/onboarding/import-helpers.ts`

---

## 1A · First Day — Signup → Live

> **How to use this section:** Every sub-section below maps to one screen or step in the
> onboarding wizard. Work through them in order. Each checkbox = one thing to do and confirm.
> If something looks wrong, stop and write it down with the step number and what you saw.
>
> **Sample data for this run (Al-Noor Mobiles, Kuwait electronics):**
> - Legal name: `Al-Noor Mobiles Trading Co. W.L.L.`
> - Trading name: `Al-Noor Mobiles`
> - Registration number: `123456`
> - Years operating: `12`
> - Branches: Hawally HQ + Salmiya Branch
> - Currency: KWD · 3 decimal places (this is non-negotiable)

---

### 1A-0 · Welcome & roadmap screen

> This is the screen you see right after signing in for the first time.

- [ ] **1.** A welcome greeting appears — it should say your name (or "Hi there" if no name was captured at signup).
- [ ] **2.** Below the greeting you see the text "Welcome to Zerupt" and "your smart business partner".
- [ ] **3.** A time estimate is shown — something like "About 15 minutes, and we save as you go, so you can stop anytime."
- [ ] **4.** A "Let's begin" button (or "Tap anywhere to begin") is clearly visible.
- [ ] **5.** Click "Let's begin". You should be taken to a roadmap screen that lists the seven setup steps:
  - Step 1: Business info — "Your company, country, and what you sell"
  - Step 2: Locations — "Your branches and warehouses"
  - Step 3: Accounting — "Currency, fiscal year, and chart of accounts"
  - Step 4: Tax — "Sales tax setup, if it applies in your country"
  - Step 5: Team & roles — "Who works with you"
  - Step 6: Point of sale — "Terminals, receipts, and payments"
  - Step 7: Data sources — "What you'll bring over"
- [ ] **6.** A "Start setup" button is visible. Click it to begin Step 1.

---

### 1A-1 · Step 1 — Business Info ("Tell us about your business")

> This step has **8 fields**. Work through each one carefully.
>
> **📁 Build reference**
> - Component: `components/steps/step1-business-info.tsx` · transform/Zod: `step1-transform.ts`
> - Field keys (what lands in `answers["1"]`): `companyName`, `tradingName`, `countryCode`, `registrationNumber`, `industrySelection`, `industryOther` (only when industry = `other`), `inventoryConcept`, `languageDefault`, `yearsOperating`
> - Industry option keys: `hardware_building · auto_parts · general_merchandise · stationery_office · electronics_mobile · other` (`data/industry.ts`)
> - Inventory concept keys: `simple_sku · serialized · batch_tracked · weighted_measured · mixed` (`data/inventory-concept.ts`)
> - **Auto-select rule** (the recently-fixed one): `electronics_mobile` and `auto_parts` → recommend `serialized`; everything else → `simple_sku`. Lives in `step1-business-info.tsx` ~L160–180; round-trip covered by `data/inventory-concept.test.ts`.
> - **Country defaults** (currency/timezone/language/tax preview): `data/countries.ts` (frontend) backed by `common/country-defaults.ts` / `country-currency.ts` / `country-locale.ts` (backend). Kuwait row = `KWD · Asia/Kuwait · ar · tax none`.
> - **Tests to trust:** `step1-transform.test.ts`, `data/countries.test.ts`, `common/country-currency.spec.ts` (asserts KWD = **3 decimals** at line 50), `common/country-defaults.spec.ts` (asserts "KWD, 3 decimals, Arabic/RTL, no tax" at line 17).
> - Save: `POST /tenant/onboarding/1/answer` (optimistic cache update, rolled back on error).

**Field 1 — Legal company name** (required)
- [ ] **7.** You see a field labelled "**Legal company name**".
- [ ] **8.** Below the label is small text: "The official name on your business licence. This appears on your invoices."
- [ ] **9.** Type: `Al-Noor Mobiles Trading Co. W.L.L.`
- [ ] **10.** The field accepts Arabic characters — try typing a few Arabic letters, then delete and type the English name.

**Field 2 — Trading / brand name** (optional)
- [ ] **11.** You see a field labelled "**Trading / brand name**" with "(optional)" next to it.
- [ ] **12.** Below the label is small text: "The name customers know you by — like the sign above your shop."
- [ ] **13.** Type: `Al-Noor Mobiles`

**Field 3 — Country** (required — this is the most important field)
- [ ] **14.** You see a dropdown/selector labelled "**Country**".
- [ ] **15.** Below the label is small text: "Where your business is based. This sets your currency, language, and tax rules."
- [ ] **16.** Click the dropdown and select **Kuwait**.
- [ ] **17.** Immediately after selecting Kuwait, a preview box appears below the country selector. It should show **all four** of:
  - **Currency:** KWD
  - **Time zone:** Asia/Kuwait (or "Kuwait" — some form of Kuwait timezone)
  - **Language:** Arabic
  - **Layout:** Right-to-left
  - **Tax:** No tax (or blank / "Nothing to set up") — ⚠️ must NOT say "VAT" or any percentage
- [ ] **18.** ⚠️ **KWD decimal check:** The currency preview must show 3 decimal places somewhere (e.g. `1,000.000`). If it shows 2 decimals (e.g. `1,000.00`), stop and log this.
- [ ] **19.** ⚠️ **Tax check:** The preview must NOT say "VAT", "5%", or any tax value. Kuwait has no VAT. If you see a tax line with a rate, stop and log this.

**Field 4 — Company registration number** (optional)
- [ ] **20.** You see a field labelled "**Company registration number**" with "(optional)" next to it.
- [ ] **21.** Below the label is small text: "The number on your commercial licence. Skip it if you don't have it handy."
- [ ] **22.** Type: `123456`

**Field 5 — What's your industry?** (required — card selection)
- [ ] **23.** You see 6 large clickable cards labelled "**What's your industry?**". The 6 options are:
  1. Hardware, tools & building materials
  2. Auto parts & accessories
  3. General merchandise & homeware
  4. Stationery, books & office supplies
  5. **Electronics, mobile & appliances** ← click this one
  6. Other
- [ ] **24.** Click "**Electronics, mobile & appliances**".
- [ ] **25.** The card should highlight/select (usually a border or fill change).

**Field 6 — How do you track inventory?** (required — card selection, auto-updates)
- [ ] **26.** Below the industry cards is another card group labelled "**How do you track inventory?**".
- [ ] **27.** Below the label is small grey text: "We picked a sensible default from your industry. Change it if needed."
- [ ] **28.** There is a small info icon (ⓘ) next to the label — hover or tap it. A tooltip should appear explaining the tracking methods in plain language.
- [ ] **29.** The 5 options are:
  1. Simple SKU — "Each product is one item"
  2. **Serialized** — "Track every unit by serial number"
  3. Batch tracked — "Track by batch and expiry"
  4. Weighted / measured — "Sold by weight or volume"
  5. Mixed — "A combination of the above"
- [ ] **30.** ⚠️ **Auto-select test (recently fixed):** Because you selected "Electronics, mobile & appliances" in the previous field, the system should have **automatically selected "Serialized"** and shown a "**Recommended**" badge directly on that card. Verify both:
  - The "Serialized" card is pre-selected (highlighted/active)
  - The word "Recommended" (or similar badge) appears on the Serialized card
- [ ] **31.** Now click "**Auto parts & accessories**" in the industry field above. Come back down to the inventory cards. The "Serialized" option should still be selected and badged "Recommended" (auto-parts also recommends serialized).
- [ ] **32.** Now click "**General merchandise & homeware**" in the industry field. Come back down — this time "**Simple SKU**" should be auto-selected and badged "Recommended".
- [ ] **33.** Switch back to "**Electronics, mobile & appliances**" — "Serialized" should be selected again.
- [ ] **34.** Manually click "**Simple SKU**" to override. The selection changes. This should be allowed — the user can override the recommendation.

**Field 7 — Preferred language** (required — dropdown)
- [ ] **35.** You see a dropdown labelled "**Preferred language**" showing two options:
  - Arabic
  - English
- [ ] **36.** Below the label is small text: "The language you and your team will see the app in. You can switch anytime."
- [ ] **37.** The language should be **pre-set to "Arabic"** because you picked Kuwait in the country field (Kuwait defaults to Arabic). Verify it shows "Arabic" without you having to pick it.
- [ ] **38.** ⚠️ **Language switch dialog test:** Change the language dropdown to "English". A dialog/popup should appear asking "Switch interface language?" with two buttons: "Switch language" and "Keep current". Click "Keep current" — the interface stays as-is, but the field value should still show "English".
- [ ] **39.** ⚠️ **Persistence on refresh test:** Set the language to "Arabic". Click "Continue" to save this step (or trigger a save another way). Then **reload the browser tab** (press F5 or Cmd+R). Come back to Step 1. The "Preferred language" field should still show "Arabic" — it must NOT revert to "English" or blank.

**Field 8 — Years operating** (optional)
- [ ] **40.** You see a field labelled "**Years operating**" with "(optional)" next to it.
- [ ] **41.** Below the label is small text: "Roughly how long you've been in business. A guess is fine."
- [ ] **42.** Type: `12`

**Validation tests for Step 1**
- [ ] **43.** Click the "Continue" button **without** filling in "Legal company name" — an error should appear under the company name field (something like "This field is required"). The wizard should NOT advance.
- [ ] **44.** Fill in the company name and click Continue. The wizard should save and advance to Step 2.

---

### 1A-2 · Step 2 — Locations ("Where do you operate?")

> This step sets up your branches (shops) and optional storage warehouses.
> Yousef has 2 shops: Hawally HQ and Salmiya Branch.

**Branch count stepper**
- [ ] **45.** At the top of the step you see the heading "**Your branches**" with a number stepper (− and + buttons). A "branch is any shop or site where you sell or operate."
- [ ] **46.** The stepper starts at 1 (one branch card is shown below). Click **+** once to set it to 2.
- [ ] **47.** Two branch cards should appear.

**Branch 1 — Hawally HQ**

Each branch card has 3 fields: Branch name · City · Time zone.

- [ ] **48.** In the first branch card, click the "**Branch name**" field and type: `Hawally HQ`
- [ ] **49.** In the "**City**" field type: `Hawally`
- [ ] **50.** ⚠️ **Timezone pre-fill test (recently fixed):** The "**Time zone**" dropdown should already show **Asia/Kuwait** (or similar Kuwait timezone) — it should NOT be blank or show a placeholder like "Select time zone". This is pre-filled from the country you chose in Step 1.
  - If it shows a placeholder and is empty → **stop and log this as a bug**.
  - If it already shows Asia/Kuwait → tick this and continue.

**Branch 2 — Salmiya**
- [ ] **51.** In the second branch card, type `Salmiya Branch` in "Branch name".
- [ ] **52.** In "City" type: `Salmiya`
- [ ] **53.** The Time zone should again be pre-filled as Asia/Kuwait. Verify this.

**Remove branch test**
- [ ] **54.** Notice there is a small trash/delete icon on each branch card. Try clicking the delete icon on Branch 2. The branch card disappears and the count drops to 1. Click **+** to add it back and re-enter the Salmiya details.
- [ ] **55.** Try clicking the delete icon on Branch 1 when it is the only branch. The icon should be **greyed out / disabled** — you must always have at least one branch.

**Separate stock question** (Yes/No cards)
- [ ] **56.** Below the branch cards you see the question: "**Does each branch keep its own stock?**"
- [ ] **57.** Below the question is small text: "Choose Yes if every shop keeps and sells its own stock. Choose No if all shops sell from one shared pool of stock."
- [ ] **58.** There is also an ⓘ info icon — tap it to see an example explanation.
- [ ] **59.** The two options are:
  - "Yes, each branch has its own stock"
  - "No, stock is shared"
- [ ] **60.** Select **"Yes, each branch has its own stock"** (Yousef's two shops each hold their own inventory).

**Standalone warehouses toggle**
- [ ] **61.** Below the stock question is a checkbox labelled "**I also have storage-only warehouses**" with an ⓘ icon.
- [ ] **62.** Below it is small text: "A place that only stores goods — nothing is sold there. Like a back store room or godown."
- [ ] **63.** For Yousef's base setup, leave this **unchecked** (he has no separate warehouse — stock is at each branch).
- [ ] **64.** **Optional test:** Tick the checkbox. A warehouse card appears with "Warehouse name" and "Linked to branch" fields. Add a warehouse named `Central Store` linked to `Hawally HQ`. Then uncheck the checkbox — the warehouse card should disappear. Check the box again — it comes back (the data is preserved while toggled, or resets cleanly — either is acceptable; note which).

**Inter-branch transfers question** (Yes/No cards)
- [ ] **65.** At the bottom you see the question: "**Do you move stock between branches?**"
- [ ] **66.** Below it: "Do you ever send goods from one shop or warehouse to another?"
- [ ] **67.** A hint says: "We'll add a transit location so in-between stock is always accounted for."
- [ ] **68.** The two options are:
  - "Yes, we transfer between branches"
  - "No, we don't"
- [ ] **69.** Select **"Yes, we transfer between branches"** (Yousef will need to move phones between Hawally and Salmiya).

**CSV import shortcut**
- [ ] **70.** Near the top of the step is a small ghost button labelled "**Import from a file**". Click it — a file dropzone panel should appear. Click "Cancel" or close it. The branch fields you entered should still be there (the import didn't wipe them).

**Continue**
- [ ] **71.** Click Continue. The wizard saves and advances to Step 3.

---

### 1A-3 · Step 3 — Accounting ("How do you keep the books?")

> This step sets up your main currency, fiscal year, and chart of accounts.

**Field 1 — Your main currency** (required — dropdown)
- [ ] **72.** You see a dropdown labelled "**Your main currency**".
- [ ] **73.** Below it: "The currency you report and close your books in."
- [ ] **74.** The dropdown should be **pre-set to KWD** (because you picked Kuwait in Step 1). Verify it shows KWD without you having to pick it.
- [ ] **75.** ⚠️ Do NOT change this. KWD with 3 decimals is the entire point for Kuwait.

**Field 2 — Do you deal in more than one currency?** (Yes/No cards)
- [ ] **76.** You see the question: "**Do you deal in more than one currency?**"
- [ ] **77.** Below it: "Choose Yes if you ever buy or sell in a foreign currency — like paying a supplier in US dollars."
- [ ] **78.** Options:
  - "Yes, we use other currencies too"
  - "No, just our main one"
- [ ] **79.** Select **"No, just our main one"** for the base Yousef test.
- [ ] **80.** **Optional test:** Select "Yes". A new checkbox grid appears titled "**Other currencies you use**" with currencies like USD, EUR, SAR, AED, etc. (everything except KWD). Tick USD. Then switch back to "No" — the currency grid disappears and the tick is cleared.

**Field 3 — When does your financial year start?** (required — dropdown)
- [ ] **81.** You see a dropdown labelled "**When does your financial year start?**".
- [ ] **82.** Below it: "Most businesses start in January, but pick what matches your books."
- [ ] **83.** Select **January** (month 1). Most Kuwait retailers start in January.

**Field 4 — Do you handle post-dated cheques?** (Yes/No cards)
- [ ] **84.** You see the question: "**Do you handle post-dated cheques?**"
- [ ] **85.** Below it: "A cheque with a future date on it — you receive it today, but the bank pays it later."
- [ ] **86.** A hint: "We'll track cheques that clear on a future date so your cash position stays accurate."
- [ ] **87.** An ⓘ info icon is present — tap it to read the explanation.
- [ ] **88.** Options:
  - "Yes, we do"
  - "No, we don't"
- [ ] **89.** Select **"Yes, we do"** (Yousef's reseller customers often pay by post-dated cheque).

**Field 5 — How should we set up your chart of accounts?** (card selection)
- [ ] **90.** You see two cards labelled "**How should we set up your chart of accounts?**":
  - "**Use our standard chart**" — "A ready-made set of accounts tuned for retail in your country."
  - "**Import my own**" — "Bring your existing accounts from a file so nothing is lost."
- [ ] **91.** An ⓘ info icon is present — tap it for an explanation ("Think of it as labelled folders for your money…").
- [ ] **92.** Select **"Use our standard chart"** for this run.
- [ ] **93.** **Optional test:** Select "Import my own". A file upload area appears (plus an "Import from a file" button). Close/cancel it. Switch back to "Use our standard chart" — the import panel disappears.
- [ ] **94.** Click Continue. Wizard advances to Step 4.

---

### 1A-4 · Step 4 — Tax ("How are you set up for tax?")

> Kuwait has NO sales tax. This step should be very short — just one info panel.
>
> **📁 Build reference**
> - Component: `components/steps/step4-tax.tsx` · routing: `taxUiKind(country)` in `step4-transform.ts`.
> - **Why KW shows only a panel:** `taxUiKind("KW")` returns `"none"` (same as Qatar). When `kind === "none"` the entire form is replaced by the `step4.noTax.*` info panel and the step is immediately valid — there are literally **no fields rendered**. (Contrast: SA/AE/BH/OM = `vat`, IN = `gst`, MY = `sst` — those render TRN/registration fields. If you ever see those on a KW tenant, the country didn't propagate from Step 1.)
> - **Backend seed:** `materialize-tax.ts` reads `COUNTRY_TAX_PROFILES` in `tax-config/tax-config.seed.ts`. Kuwait → `taxSystem: "None"`, single tax code `NO-TAX-KW` (rate 0, category `ZeroRated`), default group "No Tax".
> - **Tests to trust:** `step4-transform.test.ts` (asserts `taxUiKind` mapping), `materialize-tax.spec.ts` (asserts KW gets the no-tax profile).

- [ ] **95.** The step heading is "**How are you set up for tax?**"
- [ ] **96.** ⚠️ **Critical check:** You should see a single info panel/box — NO form fields, NO dropdowns, NO "Are you registered?" question. The panel should contain:
  - A small heading: "**No tax to set up**"
  - Body text along the lines of: "Your country doesn't apply a sales tax right now, so there's nothing to configure here."
- [ ] **97.** ⚠️ The panel must NOT say "VAT", "5%", "register for tax", or show any tax rate fields. If it does, stop and log this as a critical bug.
- [ ] **98.** ⚠️ The "Continue" button should be **enabled** immediately — you don't need to fill anything in on this step.
- [ ] **99.** Click Continue. Wizard advances to Step 5.

---

### 1A-5 · Step 5 — Team & Roles ("Who works with you?")

> This step has one simple field: how many people will use the system.

- [ ] **100.** The step heading is "**Who works with you?**"
- [ ] **101.** Below the heading: "Tell us how many people will use Zerupt so we can size things right. You can add or remove people later."
- [ ] **102.** You see a question "**How many people will use the system?**" with a number stepper (− and + buttons).
- [ ] **103.** Below the stepper is hint text: "Count everyone who'll sign in: owners, cashiers, and staff. A rough number is fine."
- [ ] **104.** Click **+** several times to set it to **5** (Yousef + 2 cashiers + 1 manager + 1 salesperson).
- [ ] **105.** Click **−** to reduce. The number should not go below 1 (the − button should disable at 1).
- [ ] **106.** Set the value to **5** and click Continue.

---

### 1A-6 · Step 6 — Point of Sale ("Do you sell at a counter?")

> This step configures the checkout screen. Yousef has 2 shops, both with counters.
>
> **📁 Build reference**
> - Component: `components/steps/step6-pos.tsx` · schema: `step6-transform.ts` → `step6FormSchema(country)`.
> - Field keys: `usePOS`, `terminalsCount`, `receiptPrinterType`, `bilingualReceipts`, `paymentMethods`. All sub-fields render **only when `usePOS === true`** (state preserved when toggled off).
> - Receipt printer option keys: `thermal_80mm · thermal_58mm · dot_matrix · a4 · none_email` (**5 options**, `RECEIPT_PRINTER_OPTIONS`).
> - **Country-restricted payment methods** (`COUNTRY_ONLY_METHODS`): `knet` → KW only · `mada` → SA · `benefit` → BH · `naps` → QA · `omannet` → OM. Universal: `cash · visa_mc · store_credit · gift_cards`. The schema also rejects a wrong-country method server-side (belt-and-braces).
> - **Backend:** `materialize-pos.ts` builds registers + receipt templates; KNET tender itself is seeded earlier at signup in `pos/tender-types/pos-tender-type-defaults.ts` (`COUNTRY_EXTRAS.KW`).
> - **Tests to trust:** `step6-transform.test.ts` (asserts country-filtered payment methods — KNET present for KW, absent otherwise), `materialize-pos.spec.ts`.

**Field 1 — Will you sell at a counter?** (Yes/No)
- [ ] **107.** You see the question: "**Will you sell at a counter or point of sale?**"
- [ ] **108.** "Choose Yes if customers pay you in person at your shop. Choose No if you only send invoices or sell online."
- [ ] **109.** Options:
  - "Yes, we sell at a counter"
  - "No, we don't"
- [ ] **110.** Select **"Yes, we sell at a counter"**.
- [ ] **111.** After selecting Yes, additional fields appear below. If you select "No", those fields disappear. Test toggling: click "No" — extra fields vanish. Click "Yes" again — they reappear.

**Field 2 — How many registers or terminals?** (number stepper, visible only when POS = Yes)
- [ ] **112.** You see "**How many registers or terminals?**" with a stepper.
- [ ] **113.** Hint: "The number of checkout points where staff ring up sales."
- [ ] **114.** Set to **2** (one per branch).

**Field 3 — How do you print receipts?** (card selection)
- [ ] **115.** You see **5** cards labelled "**How do you print receipts?**":
  1. "Thermal printer (80mm roll)" (`thermal_80mm`)
  2. "Thermal printer (58mm roll)" (`thermal_58mm`)
  3. "Dot-matrix printer" (`dot_matrix`)
  4. "Regular A4 printer" (`a4`)
  5. "No printer, email receipts" (`none_email`)
- [ ] **116.** An ⓘ info icon explains: "Thermal printers use heat on shiny roll paper — no ink needed. 80mm is the wide roll (most common)…"
- [ ] **117.** Select **"Thermal printer (80mm roll)"** — the most common in GCC retail.

**Field 4 — Print receipts in both Arabic and English?** (Yes/No)
- [ ] **118.** You see the question: "**Print receipts in both Arabic and English?**"
- [ ] **119.** Hint: "Helpful when your customers read different languages."
- [ ] **120.** Options:
  - "Yes, both languages"
  - "No, one language is fine"
- [ ] **121.** Select **"Yes, both languages"** — Yousef's customers include Arabic and English speakers.

**Field 5 — Which payments do you accept?** (checkbox list)
- [ ] **122.** You see a list of checkboxes labelled "**Which payments do you accept?**"
- [ ] **123.** Hint: "Pick everything you take at the counter."
- [ ] **124.** ⚠️ **Kuwait-only KNET test:** Because you chose Kuwait in Step 1, the list should include a **KNET** checkbox. KNET is a payment method that ONLY appears for Kuwait tenants — it should not appear for Saudi Arabia or UAE. Verify KNET is in the list.
- [ ] **125.** The options visible for a Kuwait tenant are:
  - Cash
  - Visa / Mastercard
  - Store credit
  - Gift cards
  - KNET ← Kuwait only
  - (mada / Benefit / NAPS / OmanNet should NOT appear for Kuwait)
- [ ] **126.** Tick: **Cash**, **KNET**, and **Visa / Mastercard**. Leave "Store credit" and "Gift cards" unticked for now.
- [ ] **127.** Click Continue. Wizard advances to Step 7.

---

### 1A-7 · Step 7 — Data Sources ("What are you moving from?")

> This step asks what software Yousef was using before Zerupt.

**Field 1 — What are you using today?** (card selection)
- [ ] **128.** You see the question "**What are you using today?**" with 5 options as large cards:
  1. "Excel or spreadsheets"
  2. "Another ERP or software"
  3. "Paper and notebooks"
  4. "Offline or legacy POS system"
  5. "Nothing yet"
- [ ] **129.** Below the label: "Where your records live today. This helps us guide your import."
- [ ] **130.** Select **"Offline or legacy POS system"** — Yousef was on an old Windows POS.
- [ ] **131.** After selecting "Offline or legacy POS system", check whether an extra text field appears asking for the system name. It should NOT appear for this option (the name field only appears for "Another ERP or software"). Verify no extra field appeared.
- [ ] **132.** **Optional test:** Click "Another ERP or software". An extra field should appear below: "**What's it called?**" with a placeholder "e.g. Tally, QuickBooks, Zoho" and "(optional)" marker. Type `QuickBooks`, then switch back to "Offline or legacy POS system" — the field should disappear.
- [ ] **133.** With "Offline or legacy POS system" selected, click **Continue** (or "Review & finish" if that is the button label now).

---

### 1A-8 · Review Screen ("Quick review before we build")

> After Step 7 you land on a summary/review screen before the wizard builds your workspace.

- [ ] **134.** The heading reads "**Quick review before we build**" (or similar).
- [ ] **135.** Below the heading: "Here's everything you told us. Edit anything that's not right, then we'll set up your workspace."
- [ ] **136.** Verify every field you entered is shown correctly:
  - Company name: `Al-Noor Mobiles Trading Co. W.L.L.`
  - Trading name: `Al-Noor Mobiles`
  - Country: Kuwait
  - Registration number: `123456`
  - Industry: Electronics, mobile & appliances
  - Inventory tracking: Serialized (or Simple SKU if you left the override)
  - Language: Arabic
  - Years operating: `12`
  - Branches: 2 (Hawally HQ, Salmiya Branch)
  - Stock per branch: Yes
  - Inter-branch transfers: Yes
  - Main currency: KWD
  - Other currencies: No / none
  - Financial year starts: January
  - Post-dated cheques: Yes
  - Chart of accounts: Standard chart
  - Tax: Nothing to set up ← ⚠️ must NOT say "VAT"
  - People using Zerupt: 5
  - Point of sale: Yes
  - Terminals: 2
  - Receipt printer: Thermal (80mm)
  - Bilingual receipts: Yes
  - Payments accepted: Cash, KNET, Visa / Mastercard
  - Current system: Offline or legacy POS system
- [ ] **137.** Click "**Edit**" next to the Branches row. It should jump you back to Step 2 and let you edit. Come back and verify the review still shows correctly.
- [ ] **138.** Click "**Set up my workspace**" (or similar CTA). The wizard begins provisioning.

---

### 1A-9 · Provisioning Pipeline ("Setting up your workspace")

> The wizard now builds your Zerupt workspace in the background. This takes about 1–2 minutes.

- [ ] **139.** The heading reads "**Setting up your workspace**".
- [ ] **140.** Below the heading: "This takes a few moments. Please keep this window open."
- [ ] **141.** A list of pipeline steps is shown, each with a status indicator. The steps you should see ticking off are:
  - Business settings
  - Branches & warehouses
  - Chart of accounts
  - Account mappings
  - Currencies
  - Fiscal year & periods
  - Tax codes & groups
  - Document numbering
  - Point of sale
  - Notification rules
  - Dashboard
- [ ] **142.** ⚠️ Watch the steps complete one by one. No step should stay in "Failed" status. Each should go from "Waiting" → "Setting up…" → "Done".
- [ ] **143.** After all steps show "Done", the heading changes to "**You're all set**" and a "**Go to dashboard**" or "**Continue**" button appears.
- [ ] **144.** ⚠️ If any step fails, a "Retry setup" button appears. Click it and see if it completes. Log which step failed.

---

### 1A-10 · Meet Your AI Team screen

> Before the import screen you may see an introduction to Zerupt's AI agents.

- [ ] **145.** If shown, the screen says "**Meet your team**" with introductions to Zee, Mira, and Sami.
- [ ] **146.** Zee is described as female: "She watches your numbers…" — ⚠️ check it does NOT say "he".
- [ ] **147.** Click "**Start importing data**" to proceed.

---

### 1A-11 · Import Screen ("Bring in your data")

> This is where Yousef imports his existing data. **Mira** (the AI) assists with column mapping.
> This is the most code-heavy screen in onboarding and had the most June 2026 changes — test it hard.
>
> **📁 Build reference**
> - Screen: `components/import-screen.tsx` · row config `components/import/import-options.ts` · row `import-option-row.tsx` · done/lock state `import/use-import-progress.ts`
> - Entity import dialog (stacked): `features/import/components/import-dialog.tsx` — 5 stacked-card steps under `features/import/components/dialog/`: `dialog-upload-step` → `dialog-mapping-step` → `dialog-check-step` → `dialog-preview-step` → `dialog-apply-step`. Dialog state mirrored to URL `?import=<type>&job=<jobId>` for refresh-restore.
> - Opening seeds (stock / balances / AR / AP) use a separate wizard: `components/import/opening-wizard-dialog.tsx` + `features/import/opening/`
> - Mira health badge: `components/import/ai-health-badge.tsx` (`useAiStatusQuery`); live SSE progress `components/import/mira-narration-panel.tsx` (`useJobProgress(sessionId)` — real server messages, no fake animation)
> - Backend: `apps/api/src/import/*` (orchestration, resolver, validation, apply) + AI service `apps/ai/app/models/import_assist.py`

**The 8 import rows — order, keys, and prerequisite locks**

- [ ] **148.** The heading reads "**Bring in your data**". Below it: "Choose what to import now. You can always finish the rest later from your dashboard."
- [ ] **149.** The rows appear in this dependency order (key · prerequisite):
  1. **Categories** (`category` · none)
  2. **Products** (`product` · needs **category**)
  3. **Customers** (`customer` · none)
  4. **Customer Outstanding / AR Aging** (`openingReceivables` · needs **customer**)
  5. **Suppliers** (`supplier` · none)
  6. **Supplier Outstanding / AP Aging** (`openingPayables` · needs **supplier**)
  7. **Opening Stock** (`openingStock` · needs **product**)
  8. **Trial Balance / Opening Balances** (`openingBalances` · none)
- [ ] **150.** ⚠️ **Lock logic test:** A row is **locked** until its prerequisite is done *or* you've explicitly answered "No" to the prerequisite. Confirm: before importing Products, the **Opening Stock** row is locked. Import (or say No to) Products → Opening Stock unlocks. Saying "No" to a prerequisite satisfies downstream rows (non-blocking flow — by design).

**Mira / AI status**

- [ ] **151.** The Mira badge near the top should read "**Mira is on the job**" (online) or "**Mira is offline — manual mode**" (degraded). Source: `GET` AI status. If offline, mapping still works — it just falls back to the deterministic resolver (rungs 1–4) with no AI rung.

**The 5-step stacked import dialog (entity types: category / product / customer / supplier)**

- [ ] **152.** Click "**Yes, bring them in**" on **Categories** → the stacked dialog opens on **Step 1 Upload**. Drop `01-categories.csv` (or `.xlsx`). Client guard rejects files > 25 MB. Upload posts `POST /tenant/imports` (multipart).
- [ ] **153.** **Step 2 Mapping** — Mira's suggested column→field mapping appears, each column with a **confidence badge**: ≥0.90 auto-applied (green) · 0.75–0.89 review (amber) · <0.75 suggest (grey). Verify the obvious columns mapped themselves.
- [ ] **154.** 🤖 **AI auto-mapping test (the whole point — recently hardened):** Upload a file whose headers are *not* exact matches — e.g. a Products file with `"Item Description"`, `"Sale Price (KD)"`, `"Payment Terms (Days)"`. Mira should still map them correctly **without any hand-written alias**:
  - The deterministic resolver runs 5 rungs (`apps/api/src/import/resolver/`): (1) exact header → (2) alias + **token-containment** (all tokens of a ≥2-word field name found in a longer header maps at 0.90 — handles `(KD)`, `(Days)`, casing, word-order) → (3) content heuristics → (4) learned-mapping cache (remembers your past mappings) → (5) **AI**: sends headers + sample rows + the **rich target-field schema** (`{key,label,description,dataType,required}` from `resolver/data/entity-fields.ts`) to the AI service.
  - ⚠️ Because the AI now receives every field's label + description, **adding a column the importer has never seen should still map** — if Mira says "couldn't map" for a column that clearly corresponds to a known field, log it (this is the regression the June fix targeted).
- [ ] **155.** 🆕 **"View original file" test (PR #150, 2026-06-10):** On the Mapping step there is a **"View original file"** button (`view-original-file-button.tsx`, testid `import-view-original-file`). Click it → it fetches a short-lived signed URL (`GET /tenant/imports/:jobId/file-download-url?expiresIn=300`) and opens **your exact uploaded file** in a new tab. Confirm: button shows a spinner then opens the file; double-clicking does not fire twice; if the file is unavailable the button is hidden/disabled with tooltip "Original file not available".
  - Behind it: the raw upload is retained to the Supabase **private bucket `import-files`** at path `{tenantId}/{jobId}/{filename}` (`import-file-retention.service.ts` → `supabase-storage.service.ts`), and the path is stored on `import_jobs.file_ref`. Retention default 90 days (`IMPORT_FILE_RETENTION_DAYS`). ⚠️ Retention is **best-effort/non-fatal** — if the bucket upload fails the import still succeeds, but then "View original file" is correctly hidden. (Prereq: the `import-files` bucket must exist in Supabase — if every file shows "unavailable", check the bucket.)
- [ ] **156.** **Step 3 Check** — `POST /tenant/imports/:jobId/validate`. Per-row status (valid/warning/error) with tally chips. Validation codes to expect: `REQUIRED_MISSING`, `DUPLICATE_SKU`, `DUPLICATE_BARCODE`, `DUPLICATE_NAME`, `NON_NUMERIC`, `CURRENCY_STRIPPED`, `UNKNOWN_TAX_GROUP`, `PRICE_ANOMALY`, `NEW_CATEGORY`, `NEW_SUPPLIER`, `INVALID_EMAIL`.
- [ ] **157.** 🆕 **Currency-string test (PR #149):** Put values like `"KD 11.172"`, `"1,250.500 KWD"`, `"د.ك 5.000"` in a price column. They must import as **11.172 / 1250.500 / 5.000** — the importer strips ISO codes, the Arabic `د.ك`, symbols, and thousands separators (`stripCurrencyTokens` in `import-validation.ts`, applied again at apply-time in `import-apply.service.ts`). The row gets a **`CURRENCY_STRIPPED` warning (not an error)** and stays importable. ⚠️ If a currency-prefixed number becomes an error or imports as `0`, log it.
- [ ] **158.** **Step 4 Preview** — first 20 mapped rows shown read-only.
- [ ] **159.** **Step 5 Apply** — confirm dialog + a "I've reviewed this" checkbox gate, then `POST /tenant/imports/:jobId/apply` (5-min AbortController; a 409 on re-apply is an idempotent success, not an error).
- [ ] **160.** ⚠️ **Bad-row / poison-row resilience test (PR #149) — use the 3,000-SKU products file with deliberate junk rows:** apply runs in **500-row chunks, one DB transaction each**. If a product chunk fails, it **falls back to row-by-row** in fresh per-row transactions — a single bad row only loses itself, the other 499 commit, and the **real DB error** is reported per-row (not an opaque "failed chunk"). Confirm: one poison row does not discard the whole import, and the error message names the actual problem. `NEW_CATEGORY` / `NEW_SUPPLIER` rows auto-create their parent records.

**Encoding & serials (Kuwait specifics)**

- [ ] **161.** ⚠️ **Windows-1256 Arabic CSV** — import `09-customers-windows1256.csv`. The parser tries UTF-8 (strict) then falls back to **windows-1256** (`import-file-parser.ts` `decodeCsvBuffer`), the dominant legacy GCC Arabic encoding. Arabic names must render correctly — **no `???` or mojibake**.
- [ ] **162.** ⚠️ After Products, upload the **IMEI register** (900 serials) via the opening-stock / serial path. Serials must land and tie to their SKUs (serial-tracked items, per the specific-identification costing spec).

**Trial balance reconciliation**

- [ ] **163.** Import Yousef's **messy Trial Balance**. The reconciliation gate (`opening-import/reconciliation.service.ts`) checks total debit == total credit, TB ties to source within materiality, and AR/AP subledger totals tie to GL control accounts. If it doesn't balance, you can **park the residual to Opening Balance Equity** (`POST /tenant/import/opening-balances/:runId/park`) with an audit trail — this surfaces again as a go-live warning (§1A-12, item 168).

**Finish**

- [ ] **164.** After completing or skipping imports, click "**Continue to go-live**" (or "**Skip for now**" — both go to the Go-Live screen).

> **🧪 Tests that cover this screen:** API — `import-apply.service.spec.ts` (chunk recovery + currency strip), `import-validation.spec.ts` (`stripCurrencyTokens` + rule suite), `import-orchestration.service.spec.ts` (`getFileDownloadUrl` signed-URL + 404), `import-file-retention.service.spec.ts` (bucket upload, `file_ref`, non-fatal failure), `import-file-parser.spec.ts` (windows-1256), `resolver/column-resolver.spec.ts` (token-containment), `ai-import.client.spec.ts` (`targetFields` sent), `resolver/data/entity-fields.spec.ts`. AI — `apps/ai/tests/test_suggest_mappings.py` (rich-schema prompt + fallback), `test_task_routing.py` (`column-mapper` → `gemini-2.5-flash-lite`, fallback fireworks deepseek-v3p1 — PR #148 fixed the retired model ids). Frontend — `features/import/components/view-original-file-button.test.tsx` (all 4 states), `mapping-step.test.tsx`, `apply-step.test.tsx`, `upload-step.test.tsx`, `confidence-badge.test.tsx`, `api/import-api.test.ts` (`getImportFileUrl` null-on-404).

---

### 1A-12 · Go-Live Screen ("You're ready to go live")

> The final screen before the business goes live. This is a one-way action.
>
> **📁 Build reference**
> - Component: `components/go-live/go-live-screen.tsx` · checklist `readiness-checklist.tsx` · reconciliation `reconciliation-summary-panel.tsx` · confirm `go-live-confirm-dialog.tsx` · schema `schemas/go-live.ts`
> - Readiness check keys (`READINESS_CHECK_KEYS`): `pipeline_complete · branch · accounts · tax_profile · fiscal_period · role · data_imports · opening_balances`. Each has status `pass/warn/fail` + a "Fix this" route (e.g. `branch`→Step 2, `accounts`/`fiscal_period`→Step 3, `tax_profile`→Step 4, `role`→Step 5, `data_imports`/`opening_balances`→Step 7).
> - Dry-run: `GET /tenant/onboarding/go-live-readiness` (`go-live-readiness.service.ts`). Server **re-evaluates** at go-live — it never trusts the client.
> - **The one-way gate:** `POST /tenant/onboarding/go-live` (`go-live.service.ts`) → `markWentLive()` sets `wentLiveAt` + `onboardingFrozen = true` atomically. Blocks on any `fail`; throws `GoLiveUnacknowledgedError` unless `opening_balances` warn is passed in `acknowledgedWarnings`. Second call returns `alreadyLive: true` (idempotent). Best-effort flips Supabase onboarding-complete flag.
> - **Tests to trust:** `go-live.service.spec.ts` (blocker gate, idempotency, opening-balance ack), `go-live-readiness.service.spec.ts`, `go-live-readiness.spec.ts` (pure `evaluateReadiness`), `first-login.spec.ts`; frontend `go-live-screen.test.tsx`, `go-live-confirm-dialog.test.tsx`, `readiness-checklist.test.tsx`, `reconciliation-summary-panel.test.tsx`.

- [ ] **165.** The heading reads "**You're ready to go live**".
- [ ] **166.** Below the heading: "One last check, then your business is open. Your team gets access and you can start working with real data."
- [ ] **167.** A "**Go-live checks**" section shows checklist items. Each item is marked "Required" or "Recommended". All "Required" items must be green/passed before you can go live.
- [ ] **168.** If you imported a trial balance that doesn't fully tie, a "**Opening balances**" reconciliation section appears showing the variance. ⚠️ Yousef's messy import will have a variance — the system should show him the difference in KWD (3 decimal places) and ask him to acknowledge it before going live.
- [ ] **169.** An acknowledgement checkbox appears: "I understand my opening balances are incomplete and I choose to go live anyway." — Yousef must tick this to unlock the Go Live button.
- [ ] **170.** Click "**Go live**". A confirmation dialog appears: "Go live now?" with body text mentioning invitations (if any team invites were set) and the warning "You can't undo this."
- [ ] **171.** Click "**Yes, go live**". The system goes live.
- [ ] **172.** ⚠️ After going live, attempt to access the onboarding wizard again. It should NOT be accessible — you should be redirected to the dashboard. "Your business is already live. Taking you to your dashboard…"
- [ ] **173.** 💚 **The emotional test:** At this point Yousef should feel "My shop is live." The dashboard should load with real data, currency showing KWD with 3 decimal places everywhere, and no tax lines anywhere.

---

### 1A-13 · Edge Cases & Cross-Cutting Checks

> Work through these before moving to Section 1B.

**Persistence / resume test**
- [ ] **174.** Start a fresh onboarding session. Fill in Step 1 (business name, Kuwait, industry). Do NOT click Continue. **Close the browser tab entirely.** Re-open the app and navigate back to onboarding. Step 1 should still show your entries — the wizard auto-saves.
- [ ] **175.** Go back to Step 1 from Step 3 using the "Back" button. The Step 1 fields should all still be filled in.

**RTL / Arabic layout test**
- [ ] **176.** In Step 1, set the preferred language to "Arabic" and confirm the interface-switch dialog. The entire wizard should reload in Arabic, with the layout mirrored right-to-left (text flows right, inputs are right-aligned, the "Back" button moves to the right side).
- [ ] **177.** Switch back to English and verify the layout mirrors back to left-to-right.

**Validation red-path tests**
- [ ] **178.** In Step 2, try clicking Continue with a branch card whose name is blank. An error message should appear under the branch name field.
- [ ] **179.** In Step 2, try clicking Continue with a branch card whose name is a duplicate of another branch. An error like "This name is already used" should appear.
- [ ] **180.** In Step 1, try typing letters in the "Years operating" field. The field should either reject non-numeric input or show a validation error.

**Step locking test**
- [ ] **181.** Try clicking on a later step (e.g. Step 5 — Team) in the sidebar/progress bar before completing Step 1. It should be locked ("Complete previous steps to unlock") and not navigable.

**KWD decimal watch — everywhere in onboarding**
- [ ] **182.** At any point during the wizard, if you see a money amount displayed (e.g. in the review screen, in an import preview, in an opening balance variance) — it must show **3 decimal places** (e.g. `1,250.750 KWD`). If you ever see 2 decimals (`1,250.75`) — stop and log it.

---

### Summary table — Onboarding (Phase 1a) at a glance

| Step | What to verify | Kuwait-specific gotcha |
|---|---|---|
| Welcome | Greeting + 7-step roadmap shows | — |
| Step 1 | 8 fields; country auto-sets KWD + Arabic + no-tax preview | ⚠️ Preview must show 3dp KWD, no VAT |
| Step 1 | Industry → inventory auto-select + "Recommended" badge | ⚠️ Electronics → Serialized must be pre-selected |
| Step 1 | Language = Arabic pre-filled for Kuwait | ⚠️ Must persist after page refresh |
| Step 2 | 2 branches (Hawally + Salmiya); timezone pre-filled | ⚠️ Timezone must show Asia/Kuwait, not blank |
| Step 2 | Separate stock = Yes; inter-branch transfers = Yes | — |
| Step 3 | Currency = KWD (pre-filled); fiscal year = Jan; PDC = Yes | ⚠️ Must not let you change decimals |
| Step 4 | ONLY shows "No tax to set up" panel — no VAT fields | ⚠️ Critical: any VAT field here is a bug |
| Step 5 | Team count = 5; stepper min = 1 | — |
| Step 6 | POS = Yes; KNET checkbox visible; bilingual = Yes | ⚠️ KNET must only appear for Kuwait |
| Step 7 | Source = Offline POS; no system-name field for this option | — |
| Review | All 20+ fields shown correctly | ⚠️ Tax row must say "Nothing to set up" |
| Pipeline | All 11 steps complete without failure | — |
| Import | 8 rows w/ prerequisite locks; 5-step stacked dialog; AI auto-mapping (5-rung); confidence badges | ⚠️ Currency strings (`KD 11.172`/`د.ك`) → number; poison-row recovery; windows-1256 Arabic OK |
| Import 🆕 | "View original file" opens your upload from the `import-files` bucket | ⚠️ If always "unavailable" → bucket missing |
| Go Live | One-way; balance-imbalance acknowledgement gate | ⚠️ Post go-live: wizard inaccessible |

## 1B · Daily Operations

| # | What Yousef does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 15 | Cashier opens shift with cash float | Shift opens, float recorded | Routine, fast | — |
| 16 | Scans a phone barcode at POS, picks the **IMEI** from serial dialog | Line added with serial; price in KWD 3dp | "Right phone, right serial." | ✅ Serial picker at sale |
| 17 | Takes **KNET** payment, prints receipt | Receipt 3dp KWD, bilingual, ⚠️ header must NOT say "TAX INVOICE", no tax line | "Looks professional, looks Kuwaiti." | — |
| 18 | Internet drops mid-sale | POS keeps working offline (IndexedDB); sale queues | 💚 **Relief** — "It didn't die on me." | ✅ Offline-first replay |
| 19 | Internet returns | Queued sales replay idempotently; no duplicates, gapless receipt numbers | "Nothing double-charged." | ✅ Idempotent replay |
| 20 | Reseller buys 20 phones **on credit** | `on_account` tender books **AR**; shows in customer's dues + AR aging | "His tab is real now, not a notebook." | ✅ Credit-sale → AR |
| 21 | Salmiya runs low → requests 5 units from Hawally | **Stock transfer**: send (snapshots WAC) → receive (validates discrepancy) → delivery note | "I can move stock between shops." | ✅ Stock transfer |
| 22 | Customer returns a phone next day (wrong model) | Return reverts stock + IMEI, posts GL, prints credit/exchange receipt | "Easy, clean, honest." | ✅ Returns/exchanges |
| 23 | Cashier closes shift (Z-report) | Z-report shows cash vs KNET vs credit breakdown; ⚠️ watch expectedCash if no pay-in/out | "I can see the day at a glance." | ✅ Z-report |
| 24 | Warranty walk-in: customer gives IMEI | Search by IMEI returns the original sale + warranty expiry | "I look like I have my act together." | ✅ IMEI lookup |

## 1C · Purchasing (ongoing)

| # | What Yousef does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 25 | 🧾 Snaps a **real supplier invoice** photo into Sami | Sami extracts lines (Gemini 2.5), matches items via TRN→name→fuzzy ladder, previews the GL | 💚 **Astonishment** — "It read the invoice for me." | 🤖 **Sami** invoice scanner |
| 26 | Reviews Sami's extraction, fixes one mismatch, approves | Reconciliation gate blocks if totals don't balance; on approve, posts AP bill | "It won't post garbage." | 🤖 Sami reconciliation gate |
| 27 | Receives goods before invoice arrives (GRN) | Advance-GRN accrues to a clearing account; bill later clears it | "Stock's in even if paper's late." | ✅ GRN / advanced-GRN |
| 28 | Pays a supplier by **post-dated cheque (PDC)** | PDC lifecycle: issued → presented → cleared/bounced; AP updates each step | "My cheques are tracked." | ✅ PDC module |

## 1D · Month-End

| # | What Yousef does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 29 | Opens **Trial Balance** | TB ties to 0; balances to the fil (3dp) — ⚠️ watch reports don't drop to 2dp | "The books balance." | — |
| 30 | Opens **P&L, per branch** | Separate P&L for Hawally vs Salmiya | "I see which shop makes money." | ✅ Per-branch P&L |
| 31 | Opens **AR aging** | Reseller dues bucketed 0–30 / 31–60 / 60+ | "I know who owes me and how late." | ✅ AR aging |
| 32 | Opens **AP aging** | Supplier dues bucketed; PDCs reflected | "I know what I owe and when." | ✅ AP aging |
| 33 | Opens **Balance Sheet** | Assets = Liabilities + Equity; net worth visible | 💚 **"My accountant can't say the books are half-real."** | ✅ Balance Sheet |
| 34 | Checks **dead-letter / failed postings** | Any failed GL post is visible + retryable, not silently lost | "Nothing's hiding from me." | ✅ Dead-letter UI |
| 35 | Period close checklist → lock month | No VAT return needed (Kuwait); locks period; closed-period txns blocked | 💚 **Calm** — "No tax filing. Done." | ✅ Period close gate |

## 1E · Quarter-End & Year-End

| # | What Yousef does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 36 | Quarter: reviews 3-month P&L trend per branch | Reports aggregate across closed months correctly | "I can see the trend." | (Maya margin-watch — `[SPEC-ONLY]`, roadmap) |
| 37 | Year-end: runs full-year P&L + Balance Sheet | Full-year figures tie; opening balances carried correctly | 💚 **Confidence at the accountant's desk** | — |
| 38 | Year-end: dead-stock review (phones not sold in 90+ days) | Stock-levels report surfaces slow movers (Noor finder is `[SPEC-ONLY]`) | "I know what to clear out." | (Noor dead-stock — roadmap) |

---
---

# PERSONA 2 — UMM FAISAL (Baqala / mini-market, 1 store, cash + KNET)

> **Test data needed (generate first):** ~800 FMCG SKUs (groceries, dairy, snacks, household) with
> **barcodes + batch/expiry** dates; ~150 walk-in/credit neighbourhood customers; ~12 suppliers
> (distributors, bakery, dairy) with delivery terms; opening stock for **1 warehouse**; a simple
> trial balance. High **cash %** (≈60%), KNET rest. 🧾 Use Dad's real grocery delivery notes / supplier
> invoices for Sami.

## 2A · First Day — Signup → Live (the "2 hours" proof)

| # | What Umm Faisal does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 1 | Signs up, picks **Kuwait** | KWD 3dp + no-tax + Kuwait wait-screen | "It knows my country." | ✅ Country-aware |
| 2 | Onboarding: 1 location, names it "Baqala Umm Faisal" | Single-store path is simple, no multi-branch noise | "Not too complicated for me." | — |
| 3 | Tax step | Clearly "no sales tax" — ⚠️ no VAT wording | "No tax stuff. Good." | — |
| 4 | POS step: Cash + KNET, bilingual receipt | KNET + Cash defaulted; receipt bilingual | "Built for here." | — |
| 5 | Uploads product list (with **expiry dates**) | Mira maps columns incl. batch/expiry; flags missing barcodes / bad dates | "It caught the gaps." | 🤖 Mira mapping |
| 6 | Go-Live readiness → Go Live | Materializes; live in well under 2 hours | 💚 **Triumph** — "I'm running my shop on this, today." | ✅ Go-live gate |

## 2B · Daily Operations (highest POS volume)

| # | What Umm Faisal does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 7 | Opens shift with cash float | Float recorded | Routine | — |
| 8 | Scans groceries fast, one after another | POS keeps pace; each line 3dp KWD; barcode resolves instantly | "It's fast enough for my rush." | ✅ POS perf |
| 9 | Mixed payment: part cash, part KNET | Split tender records both; change in fils correct | "Handles real customers." | ⚠️ Split-tender UI — confirm present |
| 10 | Power/Wi-Fi flickers (common in baqala) | POS runs offline, queues sales, replays cleanly | 💚 **Relief** — "Never stops the queue." | ✅ Offline-first |
| 11 | Mid-shift: drops cash to the safe (pay-out) | ⚠️ **GAP to watch:** pay-in/pay-out — expectedCash on Z-report depends on it | "My drawer should reconcile." | ⚠️ Known gap |
| 12 | Tries to sell an **expired** item | System blocks/flags expired batch (FEFO picks earliest-expiry first) | "It protects me from selling bad stock." | ✅ Batch/expiry FEFO + block |
| 13 | Near-expiry dashboard alert | Items nearing expiry surface so she can discount them | "Tells me before I lose money." | ✅ Expiry alerts |
| 14 | Neighbour buys on tab (credit) | `on_account` → AR; dues tracked | "His tab is in the system, not my head." | ✅ Credit → AR |
| 15 | Closes shift, counts drawer | Z-report cash vs KNET; over/short visible | "I know if the till is short." | ✅ Z-report |

## 2C · Restocking & Suppliers (daily/weekly)

| # | What Umm Faisal does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 16 | Low-stock list each morning | Items below reorder point flagged with a reorder action | "I know what to buy today." | ✅ Low-stock reorder |
| 17 | Dairy/bakery delivery arrives → GRN with **new expiry batches** | GRN captures batch + expiry; stock + WAC update | "Fresh stock dated correctly." | ✅ Batch on GRN |
| 18 | 🧾 Snaps the **distributor's invoice** into Sami | Extract → match → reconcile → post AP bill | 💚 "I didn't type a single line." | 🤖 Sami |

## 2D · Month-End / Quarter-End / Year-End

| # | What Umm Faisal does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 19 | Month-end: P&L + cash summary | Sees profit; cash sales vs KNET split clear | "Did I make money this month?" answered | ✅ P&L |
| 20 | Month-end: stock value + expiry write-offs | Expired/written-off stock posts to GL; stock value correct | "My shelves match my books." | ✅ Stock + adjustments |
| 21 | Month-end: period close (no VAT) | Locks cleanly, no tax filing | 💚 **Calm** | ✅ Period gate |
| 22 | Quarter-end: which categories sell, which rot | Top-seller + dead-stock view | "Stock smarter next quarter." | (Noor/Maya — roadmap) |
| 23 | Year-end: full-year P&L + Balance Sheet | Year ties; carries opening balances | 💚 **"I actually have books now."** | ✅ Reports |

---
---

# PERSONA 3 — NOURA (Perfume & cosmetics boutique, 1 store, walk-in retail)

> **Test data needed (generate first):** ~400 SKUs (perfumes, oud, cosmetics, **gift sets/bundles**)
> with KWD prices; a set of **promotions** (Eid/Ramadan %-off, buy-2-get-1, bundle price); ~300 repeat
> retail customers with purchase history; ~8 suppliers (some Dubai imports). 🧾 Use Dad's real cosmetics
> supplier invoices for Sami.

## 3A · First Day — Signup → Live

| # | What Noura does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 1 | Signs up, picks **Kuwait** | KWD 3dp, no-tax, Kuwait wait-screen | "It speaks my market." | ✅ Country-aware |
| 2 | Onboarding: 1 boutique location | Simple single-store setup | "Made for a small boutique." | — |
| 3 | Imports products + **promotions** | Mira maps products; promotions configured (or set in POS settings) | "My offers are ready for day one." | 🤖 Mira |
| 4 | POS step: KNET + Cash, bilingual receipt | Defaults right; receipt bilingual, no tax line | "Looks elegant, looks local." | — |
| 5 | Go Live | Materializes cleanly | 💚 **Pride** — "My boutique is online." | ✅ Go-live |

## 3B · Daily Operations (retail + promotions)

| # | What Noura does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 6 | Sells a perfume during an **Eid %-off promo** | Promotion applies **at sale time**, discount shown on the line + receipt | 💚 **Delight** — "My offer just works." | ✅ Promotions at sale time |
| 7 | Sells a **gift bundle** (3 items, one price) | Bundle priced as a set; components still deduct from stock | "Bundles are easy." | ✅ Bundle / composite |
| 8 | "Buy 2 get 1" lipstick offer | Free item auto-applied; margin still tracked | "It does the math, not me." | ✅ Promotions |
| 9 | Customer returns an unopened perfume | Return reverts stock, posts GL, prints credit/exchange | "Clean returns keep customers happy." | ✅ Returns/exchanges |
| 10 | Repeat customer — looks up her history | Customer profile shows past purchases | "I can treat my regulars well." | ✅ Customer history |
| 11 | KNET / cash / split payment | Tenders record; 3dp KWD change correct | "Smooth checkout." | ✅ POS tenders |
| 12 | Wi-Fi drops during a busy evening | Offline POS keeps selling, replays later | 💚 **Relief** | ✅ Offline-first |
| 13 | Closes shift | Z-report by tender; promo discounts summarized | "I see the night's takings." | ✅ Z-report |

## 3C · Buying & Restocking

| # | What Noura does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 14 | 🧾 Snaps a **Dubai cosmetics-importer invoice** into Sami | Extract → match → (FX if foreign currency) → reconcile → post | 💚 "It handled the import invoice." | 🤖 Sami |
| 15 | Receives stock (GRN), updates WAC | Stock + cost update; landed cost/freight allocatable | "My cost is accurate." | ✅ GRN + landed costs |

## 3D · Month-End / Quarter-End / Year-End

| # | What Noura does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 16 | Month-end: P&L incl. **promo impact** | Discounts visible; margin after promos clear | "Did my Eid offer actually pay off?" answered | ✅ P&L |
| 17 | Month-end: best-sellers vs slow movers | Top-seller + slow-mover view | "I reorder what sells." | (Maya/Noor — roadmap) |
| 18 | Month-end: period close (no VAT) | Locks cleanly | 💚 **Calm** | ✅ Period gate |
| 19 | Quarter-end: seasonal trend (Eid/Ramadan/National Day) | Reports compare periods | "I can plan my seasons." | ✅ Reports |
| 20 | Year-end: full-year P&L + Balance Sheet | Year ties; net worth visible | 💚 **"I run a real business."** | ✅ Reports |

---
---

# Cross-Persona "Watch List" (log immediately if seen)

These are the known rough edges from the 2026-06-09 audit. Every persona should actively try to trip them:

| Watch item | How to trigger | Pass criteria |
|---|---|---|
| ⚠️ **KWD shown as 2 decimals** anywhere (reports / inventory / purchase) | Open any report after sales | Must show **3dp** everywhere, DB and screen |
| ⚠️ **"TAX INVOICE" / "VAT" wording** | Print any receipt; open tax step | No tax wording for Kuwait; no tax line |
| ⚠️ **Z-report expectedCash wrong** | Do a mid-shift cash pay-out, then close shift | expectedCash = open + sales − refunds − payOuts + payIns |
| ✅ **Customer/Supplier opening balances** (now built — verify, don't expect missing) | Import via the **Customer Outstanding (AR Aging)** / **Supplier Outstanding (AP Aging)** rows on the import screen | Per-invoice dues land on the party + AR/AP aging; reconciliation ties to GL control accounts |
| 🆕 **Currency-string in numeric column** | Import a price like `KD 11.172` or `د.ك 5.000` | Imports as the number with a `CURRENCY_STRIPPED` warning — never an error or `0` |
| 🆕 **Poison row blocks whole import** | Import 3k products with a few junk rows | Bad row loses only itself (row-by-row recovery); real DB error reported; rest commit |
| 🆕 **"View original file" unavailable** | Click it on the mapping step after upload | Opens your exact upload; if always unavailable → `import-files` bucket missing/misconfigured |
| ⚠️ **Windows-1256 Arabic CSV garbles** | Import the cp1256 customer file | Arabic names render correctly |
| ⚠️ **Split-tender (cash + KNET) UI** | Pay part cash, part KNET | Both tenders recorded, change correct |

---

# Test-Data Generation Punch-List (do before the run)

| Persona | Need | Status |
|---|---|---|
| Yousef | Full set seeded (`test-data/yousef/`) — 3k SKUs, 800 customers, 18 suppliers, IMEI register, 2-warehouse stock (messy+clean), trial balance (messy+clean) | ✅ Ready |
| Yousef | Customer **opening-balances** (reseller dues) | ✅ Embedded in `03-customers.csv` (37 non-zero rows) |
| Yousef | Windows-1256 customer CSV | ✅ exists (`09-customers-windows1256.csv`) |
| Umm Faisal | ~800 FMCG SKUs w/ barcodes + batch/expiry; ~150 customers; 12 suppliers; 1-warehouse opening stock; simple TB | ✅ Generated (`test-data/umm-faisal/`) — TB balances 101,170.397 KWD; traps: 81 missing barcodes, 3 expired + 2 near-expiry batches, 25 tabs |
| Noura | ~400 perfume/cosmetic SKUs + bundles; promotions set (Eid %-off, B2G1, bundle price); 300 repeat customers w/ history; 8 suppliers (incl. Dubai import) | ✅ Generated (`test-data/noura/`) — TB balances 358,862.456 KWD; 20 bundles, 15 promos, 500 sale-history lines |
| All | 🧾 Dad's **real receipts & supplier invoices** → feed Sami (extraction accuracy) + migration importer | Have — use them |

---

## The emotional arc we are ultimately testing

Across all three personas, the journey should feel like:

1. **"It knows my country"** (signup) →
2. **"It read my mess and understood it"** (Mira migration) →
3. **"I'm live today, on my real data"** (go-live) →
4. **"It never stops the queue"** (offline POS) →
5. **"It read the invoice for me"** (Sami) →
6. **"My accountant can't say the books are half-real"** (month-end reports) →
7. **"I run a real business now"** (year-end).

If any persona drops out of that arc — a 2dp number, a tax line, a lost balance, a frozen POS —
**that is the bug that matters most.** Log it with the row number above.
