# Onboarding Questionnaire

## Overview

A 7-step multi-step wizard that collects the information needed to auto-configure a tenant. Designed to feel like a conversation, not a form. Target completion time: 10–15 minutes.

State is persisted in `tenant.onboardingState` (see `settings-admin/01-organisation-governance.md`) so the user can resume where they left off.

---

## Step 1: Business Info

| Question | Input Type | Validation | Maps To |
|----------|-----------|------------|---------|
| Legal company name | Text | Required | `tenant.name` |
| Trading / brand name | Text | Optional | `tenant.tradingName` |
| Country of registration | Dropdown | Required. KW, SA, AE, BH, OM, QA, IN, MY, + others | `tenant.countryCode` |
| Company registration number | Text | Country-regex validated | `tenant.registrationNumber` |
| Tax registration number | Text | Country-regex validated. Optional for non-VAT countries. | `tenant.taxRegistrationNumber` |
| Industry | Card select | Required. Fashion/Apparel, Electronics/Mobile, Grocery/Supermarket, General Trading, Furniture/Home, Other (free text) | `tenant.industry` |
| Inventory concept | Card select | Required. Simple SKU, Serialized (IMEI/serial tracking), Batch Tracked (expiry/lot), Weighted/Measured, Mixed | `tenant.inventoryConcept` |
| Preferred language | Dropdown | Launch: `ar` (Arabic), `en` (English). Phase 2: `hi` (Hindi), `ms` (Malay). See `settings-admin/14-internationalization.md`. | `tenant.languageDefault` |
| Years operating | Number | 0–99 | Metadata (sets import expectations) |

### Derived Defaults from Country

| Country | Currency | Timezone | Default Language | RTL | Phase 2+ Languages |
|---------|----------|----------|------------------|-----|-------------------|
| KW | KWD | Asia/Kuwait | `ar` | true | — |
| SA | SAR | Asia/Riyadh | `ar` | true | — |
| AE | AED | Asia/Dubai | `ar` | true | — |
| BH | BHD | Asia/Bahrain | `ar` | true | — |
| OM | OMR | Asia/Muscat | `ar` | true | — |
| QA | QAR | Asia/Qatar | `ar` | true | — |
| IN | INR | Asia/Kolkata | `en` | false | `hi` (Hindi) |
| MY | MYR | Asia/Kuala_Lumpur | `en` | false | `ms` (Malay) |
| ID | IDR | Asia/Jakarta | `en` | false | `id` (Indonesian) — Phase 3 |
| PH | PHP | Asia/Manila | `en` | false | `tl` (Filipino) — Phase 3 |
| VN | VND | Asia/Ho_Chi_Minh | `en` | false | `vi` (Vietnamese) — Phase 3 |
| SG | SGD | Asia/Singapore | `en` | false | — |

Users can override the default language in onboarding or later in profile settings. See `settings-admin/14-internationalization.md` for locale hierarchy.

## Step 2: Locations

| Question | Input Type | Validation | Maps To |
|----------|-----------|------------|---------|
| Number of stores/branches | Number stepper | 1–50 | Branch count |
| Per branch: Name, Country, City, Timezone | Repeatable card | Pre-filled from tenant country | `Branch` entities |
| Does each branch have a separate warehouse? | Yes/No | — | Warehouse topology (Store vs. Store+Warehouse) |
| Standalone warehouses? | Yes/No + repeater | Name, linked branch | `Warehouse` entities of type `Warehouse` |
| Transfer stock between locations? | Yes/No | — | Creates `Transit` warehouse if yes |

### Conditional Logic

- If `branches > 1`: enable multi-branch features
- If `interBranchTransfers = true`: create a Transit warehouse entity
- If standalone warehouses exist: create additional Warehouse entities linked to the specified branch

## Step 3: Accounting

| Question | Input Type | Validation | Maps To |
|----------|-----------|------------|---------|
| Main operating currency | Dropdown | Required | `currencyPolicy.functionalCurrency` |
| Transact in other currencies? | Yes/No + multi-select | Currency list | `currencyPolicy.transactionCurrencies` |
| Fiscal year start month | Month dropdown | January–December | `fiscalSettings.fiscalYearStartMonth` |
| Chart of accounts detail level | Card select | Standard (recommended), Detailed, Custom (manual setup) | COA template selection |
| Use post-dated cheques? | Yes/No | — | Enables cheque management accounts and workflows |

### Conditional Logic

- If `coaLevel = Custom`: skip COA seeding in configuration pipeline; user builds manually
- If `multiCurrency = true`: enable exchange rate management module
- If `cheques = true`: add cheque-related accounts to COA (PDC Receivable, PDC Payable)

## Step 4: Tax Setup

Conditionally rendered based on `tenant.countryCode`.

### GCC Countries

| Country | Display | Config Created |
|---------|---------|----------------|
| KW | "Kuwait currently has no VAT. We'll set up your accounts VAT-ready." | Tax profile with `ZeroRated` default |
| QA | "Qatar currently has no VAT. We'll configure VAT-ready." | Tax profile with `ZeroRated` default |
| OM | "Oman has 5% VAT. Are you VAT-registered?" | Tax profile with 5% standard rate |
| SA | ZATCA registration status + VAT number | Tax profile with 15% standard rate, ZATCA flags |
| AE | "UAE has 5% VAT. Are you VAT-registered?" | Tax profile with 5% standard rate |
| BH | "Bahrain has 10% VAT. Are you VAT-registered?" | Tax profile with 10% standard rate |

### Non-GCC Countries

| Country | Display | Config Created |
|---------|---------|----------------|
| IN | GST registration number, state, composition scheme | Tax profile with GST components (CGST, SGST, IGST) |
| MY | SST registration status, SST number | Tax profile with SST components (Sales Tax 10%, Service Tax 8%) |

### VAT-Registered Follow-Up (all VAT countries)

| Question | Input Type | Maps To |
|----------|-----------|---------|
| Deal with zero-rated supplies? | Yes/No | Adds `ZeroRated` tax component |
| Deal with exempt supplies? | Yes/No | Adds `Exempt` tax component |
| Reverse-charge transactions? | Yes/No | Adds `ReverseCharge` tax component |

## Step 5: Team & Roles

| Question | Input Type | Maps To |
|----------|-----------|---------|
| How many people will use the system? | Number (1–500) | License estimation metadata |

That is the entire onboarding step. The Owner role is already seeded at tenant
provisioning, so the owner can test the product solo immediately after onboarding.

### Deliberately NOT in onboarding (de-scoped 2026-05-30, DEV-292)

- **Inviting team members** — adds friction during a self-serve free trial; owners
  overwhelmingly want to test the product themselves before bringing in staff. Users
  are added later from **Settings → Users** (existing Supabase invite + `userRoles` flow).
- **Role selection / role templates / AI permission suggestions** — role definition
  (name, permission keys, branch scope, member assignment) is inherently a Settings/RBAC
  concern and is fully dynamic there via the existing `roles` module. Building static
  onboarding "role templates" would duplicate that and quickly drift. The owner customises
  roles in **Settings → Roles & Permissions** post-onboarding.

## Step 6: POS Setup

| Question | Input Type | Maps To |
|----------|-----------|---------|
| Will you use Point of Sale? | Yes/No | POS module activation |
| POS terminals per branch | Number per branch | Register count |
| Receipt printer type | Dropdown | Thermal 80mm, Thermal 58mm, A4, None (email only) | Receipt template config |
| Bilingual receipts (Arabic + English)? | Yes/No | Receipt `isRtl` + bilingual template |
| Payment methods accepted | Checkbox | Cash, K-Net, Visa/MC, Store Credit, Gift Cards | Payment method configuration |

### Conditional Logic

- If `usePOS = false`: skip entire step, no POS configuration created
- If `bilingualReceipts = true`: set receipt template to bilingual layout

## Step 7: Data Sources

| Question | Input Type | Purpose |
|----------|-----------|---------|
| Existing product/item data to import? | Yes/No | Triggers product import in data import phase |
| Existing customer data? | Yes/No | Triggers customer import |
| Existing supplier data? | Yes/No | Triggers supplier import |
| Opening balances? | Yes/No | Triggers opening balance import |
| Current system | Card select | Excel/Google Sheets, Another ERP (which?), Paper-based, Nothing | Sets import expectations and AI mapping hints |

---

## Decision Tree (Appendix A from new-approach.md)

```
Start
  |
  v
Step 1: Business Info
  -> Sets: country, industry, inventoryConcept, language defaults
  |
  v
Step 2: Locations
  -> If branches > 1: enable multi-branch
  -> If inter-branch transfers: create transit warehouse
  |
  v
Step 3: Accounting
  -> If "Custom COA": skip COA seeding, user builds manually
  -> If multi-currency: enable exchange rate management
  -> If cheques: enable cheque accounts in COA
  |
  v
Step 4: Tax (conditional on country)
  -> KW/QA/OM: minimal, VAT-ready defaults
  -> SA: ZATCA flow
  -> AE: UAE VAT flow
  -> BH: Bahrain VAT flow
  -> IN: GST flow
  -> MY: SST flow
  |
  v
Step 5: Team
  -> Creates role entities
  -> Queues invitations (sent after go-live)
  |
  v
Step 6: POS
  -> If no POS: skip POS config
  -> If POS: create registers, receipt templates
  |
  v
Step 7: Data
  -> Determines which import steps to show in data import phase
  |
  v
Configuration Pipeline (02-configuration-pipeline.md)
```

## State Persistence

| Field | Description |
|-------|-------------|
| `currentStep` | 1–7. The step the user is currently on or last completed. |
| `completedSteps` | Array of step numbers that are fully answered. |
| `answers` | JSON object keyed by step number, containing all answers for that step. |
| `startedAt` | When the user first entered the questionnaire. |
| `lastUpdatedAt` | Last time any answer was saved. |

Answers are saved on every step transition (Next / Back) so progress is never lost. The user can close the browser and resume from `currentStep` with all `answers` pre-filled.

## UX Principles

- One question group per screen. No scrolling walls of form fields.
- Smart defaults based on previous answers (e.g., KW → KWD, Arabic, AST).
- "Not sure? Skip for now" on every non-critical question. The system can be reconfigured later.
- Progress bar showing completion percentage.
- Estimated time remaining.
- Save and resume at any point.

## Permissions

| Action | Required Key |
|--------|--------------|
| Start onboarding questionnaire | `tenant.onboarding.start` (owner-only by default) |
| Resume onboarding questionnaire | `tenant.onboarding.start` |

## Cross-Module Contracts

| Contract | Target |
|----------|--------|
| Questionnaire answers → Configuration Pipeline | `02-configuration-pipeline.md` consumes the `answers` JSON |
| Step 7 answers → Data Import phase | `03-ai-import-assistant.md` uses data source selections |
| Step 5 invitations → Go-Live | `04-go-live.md` sends queued invitations |
