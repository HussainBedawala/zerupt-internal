---
title: KSA (Saudi Arabia) — Manual Testing Checklist (User-Journey Driven)
country: SA
currency: SAR (2 decimals — halalah)
tax: VAT 15% (ZATCA Fatoora mandatory — clearance for standard / reporting for simplified)
personas: [Abu Khalid (B2B/clearance), Umm Saud (B2C/reporting+QR), Al-Faisaliah (mixed/serial/credit-notes)]
created: 2026-06-11
updated: 2026-06-11
audited_against: KSA-PERSONAS-SPEC.md (2026-06-11) + ZATCA MORNING-BRIEF (built PR #151) + live codebase walk
engineering_reference: >
  Every onboarding step in Section 1A carries a "📁 Build reference" block naming the exact
  frontend component, backend pipeline step, country-config source, API endpoint, and
  unit/E2E tests — so a failing checkbox can be traced straight to the file and the test
  that should have caught it. ZATCA-specific sub-sections point at apps/api/src/zatca/ +
  apps/web/src/features/zatca/. All paths relative to erp/.
purpose: >
  A human walk-through script. For each persona, follow the flow screen-by-screen from
  their very first login through their first day, then daily, month-end. Tick each row.
  Every row says exactly what to DO, what SHOULD happen, what the user should FEEL, and
  where Zerupt's AI / ZATCA pipeline is meant to carry them.
how_to_use: >
  Use the seeded test data from test-data/<persona-slug>/ (generate if missing — see
  Test-Data Punch-List at the end). For ZATCA flows, run against a tenant with
  ZATCA_ENABLED=true + country=SA + seller VAT 300000000000003 + National Address filled.
  Sandbox OTP is the static value 123456 (no portal needed). Feed real KSA supplier
  invoices into Sami for extraction accuracy testing.
legend: >
  ✅ built & expected to pass · ⚠️ known rough edge to watch · 🤖 AI moment ·
  💚 the emotional beat we are testing for · 🧾 use a real receipt/invoice here
---

# KSA Manual Testing Checklist

> **Money rule for every screen, every persona:** SAR shows **2 decimals** (1 SAR = 100 halalah).
> If you ever see `12.5` where it should be `12.50`, or a rounding inconsistency on a
> receipt / report / z-report — **stop and log it**. Half-up rounding at 2dp is mandatory
> for ZATCA compliance; wrong rounding = rejected invoice.
>
> **VAT rule:** Saudi Arabia has **VAT at 15%**. Every TAX INVOICE must show:
> the VAT registration number of the seller (15 digits, first and last = 3), the VAT amount
> per line, a summary VAT block, and the total including VAT. If a receipt goes out without
> a VAT line or with a wrong rate — **stop and log it**. This is not just a UX bug, it is a
> ZATCA compliance violation.
>
> **ZATCA rule:** B2B standard invoices are **clearance-blocking** — the buyer's copy is not
> valid until ZATCA clears it. B2C simplified invoices use **reporting** (24h queue). Both
> must carry a TLV QR code. Any path that skips the queue or silently swallows a ZATCA error
> is a critical bug.
>
> **Mada rule:** mada is the SA-only card network (equivalent to Kuwait's KNET). It must
> appear in the payment list for SA tenants and must NOT appear for non-SA tenants.

---

## How the three personas map to the product

| Persona | Business | Why we test them | Feature surface they stress |
|---|---|---|---|
| **Abu Khalid Al-Rashidi** | Abu Khalid Auto Parts — Riyadh, Al-Olaya; wholesale + retail to garages | B2B-heavy; garages are VAT-registered → standard invoices → ZATCA clearance (blocking) | TRN validation · standard invoice clearance · buyer-TRN required · PDC lifecycle · import VAT/reverse-charge · Tally-style imbalanced TB |
| **Umm Saud** | Umm Saud Baqala — Jeddah neighbourhood supermarket; walk-in cash/mada | B2C-heavy; simplified invoices → ZATCA reporting + TLV QR on receipt; FMCG batch/expiry | Simplified invoice QR · TLV decode · high-volume reporting queue · batch/expiry FEFO · VAT category mix (S/Z/E + garbled fail-closed) |
| **Al-Faisaliah Mobiles** | Al-Faisaliah Mobiles — Dammam; walk-in B2C + corporate B2B | Mixed; IMEI/serial tracked; returns → ZATCA credit notes (381) with BillingReference | Serial/IMEI tracking · credit note 381 · USD rejection · B2C↔B2B threshold · partial returns |

---
---

# PERSONA 1 — ABU KHALID (Auto Parts, Riyadh, B2B-heavy, ZATCA clearance)

> **Test data:** generate from `test-data/abu-khalid/` (seed 44). Source data: `test-data/legacy-raw/p1-abu-khalid-ksa/`.
> Files needed before testing: 01-categories, 02-products (Brand/VAT Applicable/taxGroup), 03-customers
> (TRN/Credit Limit/VAT Registered), 03b-customer-outstanding-aging, 04-suppliers (TRN/Blacklist/Country),
> 04b-supplier-outstanding-aging, 05-opening-stock (negative qty + WAC=0 traps), 06-pdc-register,
> 07-trial-balance (intentionally imbalanced ~SAR 890 gap), 08-customers-windows1256.
> 🧾 Feed a real KSA auto-parts supplier invoice into Sami in the Purchasing stage.

---

## 1A · Engineering Reference — files, endpoints, tests (read before the walk-through)

### Onboarding architecture (same as Kuwait — differences highlighted)

- **Frontend feature root:** `apps/web/src/features/onboarding/`
- **Route entry:** `apps/web/src/app/[locale]/(app)/onboarding/page.tsx`
- **Shell / orchestrator:** `components/onboarding-wizard.tsx` → `components/steps/step-renderer.tsx`
- **Screen order:** `welcome → roadmap → wizard (steps 1–7) → review → pipeline → meetTeam → import → goLive`
- **Server draft state:** table `onboardingState` — `apps/api/src/onboarding/onboarding-state.service.ts`

### SA-specific country defaults (the most important backend row)

- **`common/onboarding-country-defaults.ts`** Saudi Arabia row: `SAR · Asia/Riyadh · ar · vat`
- **`common/country-currency.ts`** SA row: `SAR · 2 decimals` (contrast Kuwait: KWD · 3 decimals)
- **`common/country-defaults.spec.ts`** asserts "SAR, 2 decimals, Arabic/RTL, VAT 15%" for SA
- **`step4-transform.ts`** → `taxUiKind("SA")` returns `"vat"` — renders the full VAT registration form
- **`pos/tender-types/pos-tender-type-defaults.ts`** `COUNTRY_EXTRAS.SA = mada` (SA-only tender)
- **`step6-transform.ts`** country-fence: mada present for SA, absent for KW/AE/QA/BH/OM

### NA-ZATCA · ZATCA module reference (new for KSA checklist)

> All paths relative to `erp/`.

| Layer | Path | What it does |
|---|---|---|
| DB schema | `packages/db/src/schema/zatca.ts` | `zatca_credentials`, `zatca_invoice_documents`, `zatca_egs_units` tables |
| CSR service | `apps/api/src/zatca/zatca-csr.service.ts` | Generates secp256k1 PKCS#10 CSR |
| Onboarding | `apps/api/src/zatca/zatca-onboarding.service.ts` | OTP → CCSID → 3/6 compliance samples → PCSID |
| XML serializer | `apps/api/src/zatca/zatca-xml.service.ts` | UBL 2.1 standard + simplified + credit note |
| Signing | `apps/api/src/zatca/zatca-signing.service.ts` | C14N 1.1 → SHA-256 hash → XAdES-B-B → TLV QR tags 6-9 |
| API client | `apps/api/src/zatca/zatca-api-client.service.ts` | HTTP to ZATCA clearance/reporting endpoints |
| Clearance | `apps/api/src/zatca/zatca-clearance.service.ts` | Blocking standard-invoice clearance |
| Reporting | `apps/api/src/zatca/zatca-reporting.service.ts` | pg-boss 24h queue + sweeper for simplified |
| Counter | `apps/api/src/zatca/zatca-counter.service.ts` | Serialized ICV/PIH per EGS (advisory lock, no gaps) |
| Frontend QR | `apps/web/src/features/pos/print/qr.ts` → `buildZatcaTlv()` | QR rendering on receipts + A4 |
| Frontend onboarding | `apps/web/src/features/zatca/` | EGS wizard, compliance status panel |
| Country gate | `tenant_identity.countryCode === 'SA'` check | Everything above is dormant unless SA |

### Endpoint cheat-sheet (onboarding — same as Kuwait)

| Action | Method + route | Backend |
|---|---|---|
| Sign up | `POST /api/tenant-signup` | `tenant-signup/tenant-signup.service.ts` |
| Poll provisioning | `GET /api/tenant-signup/provisioning-status/:jobId` | self-heals stale-queued after 15s |
| Load wizard state | `GET /tenant/onboarding/state` | `onboarding-state.service.ts` |
| Save a step | `POST /tenant/onboarding/:step/answer` | Zod-validated per step |
| Materialization | `POST /tenant/onboarding/complete` | `onboarding-complete.service.ts` (11 steps) |
| Go-live dry-run | `GET /tenant/onboarding/go-live-readiness` | `go-live-readiness.service.ts` |
| Go live | `POST /tenant/onboarding/go-live` | `go-live.service.ts` |

### ZATCA-specific endpoints

| Action | Method + route | Backend |
|---|---|---|
| Create EGS unit | `POST /tenant/zatca/egs` | `zatca-onboarding.service.ts` |
| OTP → CCSID | `POST /tenant/zatca/egs/:id/onboard/ccsid` | OTP paste → ZATCA API → CCSID stored |
| Compliance check | `POST /tenant/zatca/egs/:id/onboard/compliance` | Sends 3 or 6 sample docs |
| PCSID | `POST /tenant/zatca/egs/:id/onboard/pcsid` | Gets production CSID |
| ZATCA doc status | `GET /tenant/zatca/documents/:id` | `zatca_invoice_documents` row |

---

## 1A · First Day — Signup → Live (Abu Khalid, B2B Auto Parts, Riyadh)

> **Sample data for this run (Abu Khalid Auto Parts, KSA):**
> - Legal name: `Abu Khalid Auto Parts Trading Est.`
> - Trading name: `Abu Khalid Auto Parts`
> - Country: Saudi Arabia
> - Registration number: `1010XXXXX` (CR number — 10 digits, common KSA format)
> - Seller VAT number: `300000000000003` (15 digits; first and last = 3; use this exact test value)
> - Saudi National Address: Building No `1234` · Street `King Fahd Road` · District `Al-Olaya` · City `Riyadh` · Postal `12211`
> - Years operating: `18`
> - Branches: Riyadh HQ (Al-Olaya) only

---

### 1A-0 · Welcome & roadmap screen

- [ ] **1.** A welcome greeting appears — your name or "Hi there".
- [ ] **2.** Text reads "Welcome to Zerupt" and "your smart business partner".
- [ ] **3.** Time estimate shown: "About 15 minutes, and we save as you go, so you can stop anytime."
- [ ] **4.** A "Let's begin" button is clearly visible. Click it.
- [ ] **5.** Roadmap shows the seven setup steps: Business info · Locations · Accounting · Tax · Team & roles · Point of sale · Data sources.
- [ ] **6.** Click "Start setup" to begin Step 1.

---

### 1A-1 · Step 1 — Business Info

> **📁 Build reference**
> - Component: `components/steps/step1-business-info.tsx` · transform: `step1-transform.ts`
> - **Country auto-sets for SA:** `data/countries.ts` SA row → `SAR · Asia/Riyadh · ar · vat`
> - **Backend tests:** `common/country-currency.spec.ts` (asserts SAR = **2 decimals**), `common/country-defaults.spec.ts` (asserts "SAR, 2 decimals, Arabic/RTL, VAT 15%")

**Field 1 — Legal company name**
- [ ] **7.** Type: `Abu Khalid Auto Parts Trading Est.`
- [ ] **8.** Field accepts Arabic characters — test Arabic input, then restore English.

**Field 2 — Trading / brand name**
- [ ] **9.** Type: `Abu Khalid Auto Parts`

**Field 3 — Country** ← the most important KSA-specific check
- [ ] **10.** Click the dropdown and select **Saudi Arabia**.
- [ ] **11.** After selecting Saudi Arabia, a preview box must show **all four** of:
  - **Currency:** SAR
  - **Time zone:** Asia/Riyadh
  - **Language:** Arabic
  - **Layout:** Right-to-left
  - **Tax:** VAT 15% (or "Value Added Tax — 15%") — ⚠️ must NOT say "No tax" or be blank
- [ ] **12.** ⚠️ **SAR decimal check:** Currency preview must show **2 decimal places** (e.g. `1,000.00`). If it shows 3 decimals (e.g. `1,000.000`) — stop and log this. KWD logic must not bleed into SA.
- [ ] **13.** ⚠️ **VAT preview check:** The preview must say "VAT 15%" or "Value Added Tax 15%". If it shows "No tax" or blank — stop and log this as critical.

**Field 4 — Company registration number**
- [ ] **14.** Type a 10-digit Saudi CR: `1010123456`

**Field 5 — Industry**
- [ ] **15.** Click "**Auto parts & accessories**". The card highlights.

**Field 6 — Inventory tracking** (auto-select test)
- [ ] **16.** Because you selected "Auto parts & accessories", the system should **auto-select "Serialized"** with a "Recommended" badge. Verify both the selection and badge.
- [ ] **17.** Manually click "Simple SKU" to override. Then switch back to "Auto parts & accessories" — "Serialized" should re-select as recommended.

**Field 7 — Preferred language**
- [ ] **18.** Should be **pre-set to "Arabic"** (SA defaults to Arabic). Verify it shows "Arabic" without you selecting it.

**Field 8 — Years operating**
- [ ] **19.** Type: `18`
- [ ] **20.** Click Continue — wizard advances to Step 2.

---

### 1A-2 · Step 2 — Locations

> **📁 Build reference:** `components/steps/step2-locations.tsx` · `step2-transform.ts` · `materialize-locations.ts`

- [ ] **21.** Set branch count to **1** (Abu Khalid has one Riyadh location).
- [ ] **22.** Branch name: `Riyadh HQ Al-Olaya` · City: `Riyadh`
- [ ] **23.** ⚠️ **Timezone pre-fill:** Time zone dropdown should show **Asia/Riyadh** — not blank. If blank → stop and log.
- [ ] **24.** "Does each branch keep its own stock?" → select **"Yes, each branch has its own stock"**.
- [ ] **25.** "Do you move stock between branches?" → select **"No, we don't"** (1 branch only).
- [ ] **26.** Click Continue → Step 3.

---

### 1A-3 · Step 3 — Accounting

> **📁 Build reference:** `components/steps/step3-accounting.tsx` · `step3-transform.ts`

- [ ] **27.** "Your main currency" dropdown: must be **pre-set to SAR** (from Step 1 SA selection).
- [ ] **28.** ⚠️ Verify the currency shows SAR — NOT KWD. Two different tests on the same code path.
- [ ] **29.** "Do you deal in more than one currency?" → Select **"Yes, we use other currencies too"**. A checkbox grid appears. Tick **USD** (Abu Khalid buys OEM parts from UAE/Jordan suppliers).
- [ ] **30.** "When does your financial year start?" → Select **January** (standard KSA fiscal).
- [ ] **31.** "Do you handle post-dated cheques?" → Select **"Yes, we do"** (Abu Khalid receives PDCs from garages). ⚠️ PDC lifecycle is critical for this persona — verify the module surfaces in month-end.
- [ ] **32.** "How should we set up your chart of accounts?" → Select **"Use our standard chart"**.
- [ ] **33.** Click Continue → Step 4.

---

### 1A-4 · Step 4 — Tax ("How are you set up for VAT?")

> This is the step that differs most from Kuwait. For Saudi Arabia, the full VAT registration form renders.
>
> **📁 Build reference**
> - Component: `components/steps/step4-tax.tsx` · routing: `taxUiKind("SA")` in `step4-transform.ts`
> - `taxUiKind("SA")` returns `"vat"` — renders the FULL VAT form (contrast: KW = `"none"` renders only an info panel).
> - **VAT registration fields (SA):** `vatRegistered` (Yes/No), `vatNumber` (15-digit, Zod pattern `^3\d{13}3$`), `nationalAddress` (building no 4-digit, street, district, city, postal 5-digit — completeness gate for ZATCA enablement).
> - **Backend seed:** `materialize-tax.ts` → SA → `taxSystem: "VAT"`, rate 15%, tax code `VAT-SA-15`, categories `Standard/ZeroRated/Exempt`.
> - **Tests:** `step4-transform.test.ts` (asserts `taxUiKind("SA") === "vat"`), `materialize-tax.spec.ts` (asserts SA gets the 15% VAT profile).

**VAT registration**
- [ ] **34.** The step heading is "**How are you set up for VAT?**" (NOT "No tax to set up").
- [ ] **35.** ⚠️ **Critical check:** You should see a form with at minimum these fields:
  - "Are you registered for VAT?" (Yes/No)
  - A VAT number field that appears when "Yes" is selected
  - Saudi National Address fields
- [ ] **36.** Select **"Yes, I am VAT registered"** (or "Yes" on the Yes/No card).
- [ ] **37.** A field labelled "**VAT registration number (TRN)**" appears. Below it: "Your 15-digit VAT number from ZATCA. First and last digits must be 3."

**Seller VAT number validation (Z4 — 3..3 rule)**
- [ ] **38.** Type: `123456789012345` (15 digits, does NOT start/end with 3). Click Continue. An error should appear: something like "VAT number must start and end with 3" or "Invalid format." **The wizard must NOT advance.**
- [ ] **39.** Type: `300000000000030` (15 digits, starts with 3, ends with 0). Click Continue. Error should appear.
- [ ] **40.** Type: `300000000000003` (the valid test value — starts with 3, ends with 3, 15 digits). The field should accept this.
- [ ] **41.** ⚠️ Type: `30000000000003` (only 14 digits). Error: "Must be exactly 15 digits."

**Saudi National Address (Z5 — completeness gate)**
- [ ] **42.** You see a section titled "**Saudi National Address**" (or "Business address for ZATCA"). Below it: "Required to enable ZATCA e-invoicing. All fields must be exact."
- [ ] **43.** Fields: Building No (4-digit) · Street name · District · City · Postal Code (5-digit).
- [ ] **44.** ⚠️ **Completeness gate test:** Try clicking Continue with Building No and Postal Code blank. An error should appear (or the ZATCA setup step is marked incomplete later). The wizard may advance but ZATCA onboarding under Settings → Compliance should show a "National address incomplete" warning that blocks EGS creation.
- [ ] **45.** Fill in: Building No `1234` · Street `King Fahd Road` · District `Al-Olaya` · City `Riyadh` · Postal `12211`.
- [ ] **46.** Click Continue → Step 5.

---

### 1A-5 · Step 5 — Team & Roles

- [ ] **47.** Heading: "**Who works with you?**"
- [ ] **48.** Set team count to **4** (Abu Khalid + 1 warehouse manager + 1 sales rep + 1 cashier).
- [ ] **49.** Click Continue → Step 6.

---

### 1A-6 · Step 6 — Point of Sale

> **📁 Build reference**
> - `step6-transform.ts` → `step6FormSchema("SA")` — country fence
> - `COUNTRY_EXTRAS.SA = mada` in `pos/tender-types/pos-tender-type-defaults.ts`
> - **Tests:** `step6-transform.test.ts` (asserts mada present for SA, absent for KW/AE)

**Field 1 — Will you sell at a counter?**
- [ ] **50.** Select **"Yes, we sell at a counter"**.
- [ ] **51.** Extra fields appear.

**Field 2 — How many registers?**
- [ ] **52.** Set to **1** (one Riyadh counter).

**Field 3 — Receipt printer**
- [ ] **53.** Select **"Thermal printer (80mm roll)"**.

**Field 4 — Bilingual receipts**
- [ ] **54.** Select **"Yes, both languages"** — Arabic + English for KSA.

**Field 5 — Payment methods** ← SA-specific mada check
- [ ] **55.** ⚠️ **Mada test (SA-only):** The payment method list must include **mada** for a Saudi Arabia tenant. Verify mada is in the list.
- [ ] **56.** The list for an SA tenant should include: Cash · Visa / Mastercard · mada · Store credit · Gift cards. (KNET must NOT appear — it is Kuwait-only.)
- [ ] **57.** Tick: **Cash**, **mada**, **Visa / Mastercard**.
- [ ] **58.** Click Continue → Step 7.

---

### 1A-7 · Step 7 — Data Sources

- [ ] **59.** Select **"Another ERP or software"** — Abu Khalid was on Tally.
- [ ] **60.** An extra field "**What's it called?**" appears. Type: `Tally`.
- [ ] **61.** Click Continue → Review screen.

---

### 1A-8 · Review Screen

- [ ] **62.** Heading: "**Quick review before we build**".
- [ ] **63.** Verify all entries are shown correctly — especially:
  - Country: Saudi Arabia (NOT Kuwait)
  - Currency: SAR (NOT KWD)
  - Tax: VAT 15% (NOT "Nothing to set up") ← ⚠️ critical
  - Payment methods: Cash · mada · Visa / Mastercard (NOT KNET)
  - Current system: Another ERP (Tally)
- [ ] **64.** ⚠️ Verify the VAT number shown is `300000000000003` (masked or truncated is fine — but should not show a different number).
- [ ] **65.** Click "**Set up my workspace**".

---

### 1A-9 · Provisioning Pipeline

- [ ] **66.** All 11 pipeline steps tick off without failure: Business settings · Branches & warehouses · Chart of accounts · Account mappings · Currencies · Fiscal year & periods · **Tax codes & groups** (⚠️ this step must create the SA VAT 15% profile — check it shows "Done") · Document numbering · Point of sale · Notification rules · Dashboard.
- [ ] **67.** ⚠️ Watch the "Tax codes & groups" step carefully. If it fails → the SA VAT seeding is broken. Log.
- [ ] **68.** After all steps: "**You're all set**" heading + "Continue" button. Click it.

---

### 1A-10 · ZATCA EGS Onboarding (Settings → Compliance → ZATCA)

> This section is NEW for KSA — no Kuwait equivalent.
> ZATCA EGS onboarding happens AFTER the wizard completes, inside Settings.
>
> **📁 Build reference**
> - Frontend: `apps/web/src/features/zatca/` (EGS wizard, compliance status)
> - Backend: `apps/api/src/zatca/zatca-onboarding.service.ts`
> - Route: Settings → Compliance → ZATCA (or a direct `/settings/zatca` route)

- [ ] **69.** After going live, navigate to **Settings → Compliance → ZATCA** (or find the ZATCA setup panel in the dashboard/onboarding post-wizard screen).
- [ ] **70.** You see the heading "**ZATCA E-Invoicing Setup**" (or "Fatoora Setup"). Below it: "Connect your business to ZATCA to issue compliant e-invoices."
- [ ] **71.** ⚠️ **Pre-condition check:** If the National Address fields in Step 4 were incomplete, this page should show a warning: "National address incomplete — cannot create EGS unit" with a link to fix in Settings → Business Info. Clicking it jumps to the address fields. Complete them if needed.
- [ ] **72.** Click "**Create EGS unit**" (or "Add device"). A form appears: EGS common name (human label), branch, environment dropdown (Sandbox / Simulation / Production).
- [ ] **73.** Fill in: Common name `Riyadh-HQ-EGS-1`, branch `Riyadh HQ Al-Olaya`, environment **Sandbox**.
- [ ] **74.** Click "**Generate CSR**" (or "Next"). The service generates an `secp256k1` PKCS#10 CSR. You should see a status message "CSR generated" or a spinner then a green tick.
- [ ] **75.** **OTP entry field** appears. Below it: "Enter the OTP from your ZATCA Fatoora portal. In sandbox, use 123456."
- [ ] **76.** Type: `123456` (static sandbox OTP). Click "**Submit OTP**" (or "Get CCSID").
- [ ] **77.** ⚠️ The wizard calls ZATCA's sandbox API. You should see: "Compliance CSID received" (or "CCSID issued — running compliance checks").
- [ ] **78.** **Compliance checks step:** The wizard sends 3 sample invoices (or 6 if required) to ZATCA's compliance API. Watch a progress list tick off: Standard invoice · Simplified invoice · Credit note (381). Each should go from "Sending…" → "Passed". If any says "Failed" → log the error code ZATCA returned.
- [ ] **79.** After all compliance checks pass: "**Getting production CSID…**" then "**ZATCA onboarding complete** — your device is now registered." A green badge with the CSID serial number appears.
- [ ] **80.** ⚠️ **Re-onboard test:** After completion, try clicking "Create EGS unit" again. The button should be disabled or show a warning "EGS already registered — re-onboard will reset the ICV chain. Are you sure?" (onboarding state guard from the code review).
- [ ] **81.** ⚠️ **Incomplete OTP test:** Try clicking "Submit OTP" with an empty field. An error should appear. The wizard must NOT advance.
- [ ] **82.** 💚 After successful onboarding: "**Your business is ZATCA-connected. All invoices will be automatically reported/cleared.**"

---

### 1A-11 · Import Screen ("Bring in your data")

> **📁 Build reference (same as Kuwait — see Kuwait checklist §1A-11 for full detail):**
> - `components/import-screen.tsx` · `features/import/` · `apps/api/src/import/`

- [ ] **83.** The 8 import rows appear in dependency order (categories → products → customers → customer AR aging → suppliers → supplier AP aging → opening stock → trial balance).
- [ ] **84.** ⚠️ **Lock logic test:** Opening Stock locked until Products imported. Customer Outstanding locked until Customers imported.

**Abu Khalid-specific import tests**

- [ ] **85.** Upload `02-products.csv` — includes `Brand`, `VAT Applicable` (Yes/No), `taxGroup` columns. Mira should map `taxGroup` → tax group field without manual help.
- [ ] **86.** ⚠️ **Tax group mismatch test (Z6):** One product has `taxGroup = "Standard Rate 15%"` (without parentheses) instead of the system's canonical label. This must NOT silently map to the wrong group — expect either a `UNKNOWN_TAX_GROUP` warning on the row, or Mira surfacing a "did you mean Standard (15%)?" suggestion.
- [ ] **87.** Upload `03-customers.csv` — includes `TRN`, `Credit Limit`, `Credit Days`, `VAT Registered`, `Balance Type Dr/Cr`.
  - **Z1/Z2 test:** Two customers have 14-digit TRNs; one has a TRN not ending in 3. These rows should produce validation errors: "TRN must be exactly 15 digits" / "TRN must start and end with 3". They should be importable only if TRN is cleared/left blank (non-blocking).
  - **Z3 test:** Three customers flagged `VAT Registered = Yes` but `TRN` is blank. These must produce a `VAT_REGISTERED_MISSING_TRN` warning (not a hard error at import time — ZATCA rule BR-KSA-42 will fire at invoice time, not import time). Log if no warning.
- [ ] **88.** Upload `03b-customer-outstanding-aging.csv` (DD/MM/YYYY dates, a running-total column to ignore). AR aging rows must land; per-invoice dues must show in AR aging. Reconciliation ties to GL AR control account.
- [ ] **89.** Upload `04-suppliers.csv` — includes `TRN`, `Blacklist` flag, `Country` (some UAE/Jordan = overseas → import VAT annotation expected). Check: the blacklisted supplier row should import but be flagged in the system as blacklisted, NOT silently ignored.
- [ ] **90.** Upload `04b-supplier-outstanding-aging.csv`. AP aging rows land; AP control account ties.
- [ ] **91.** Upload `05-opening-stock.csv` — intentional traps: one row has negative quantity; one has WAC = 0. Expect: negative-qty row → `NEGATIVE_QTY` warning (or error); WAC = 0 row → `WAC_ZERO` warning. Both are importable but flagged.
- [ ] **92.** ⚠️ **Windows-1256 Arabic CSV:** Upload `08-customers-windows1256.csv` (no BOM, Windows-1256 encoding). Arabic names must render correctly — no `???` or mojibake.

**Trial balance — imbalanced Tally TB (Z17)**
- [ ] **93.** Upload `07-trial-balance.csv` — intentionally off by ~SAR 890. The reconciliation gate must:
  1. Show "Trial balance does not balance — debit/credit difference: SAR 890.00"
  2. Offer "Park difference to Opening Balance Equity" option.
  3. This difference then appears as a `warn` item in Go-Live readiness and requires acknowledgement before going live.
- [ ] **94.** ⚠️ This is also the ZATCA compliance start: going live with an unbalanced TB and unacknowledged warnings should block `POST /tenant/onboarding/go-live`.

---

### 1A-12 · Go-Live Screen

- [ ] **95.** "**You're ready to go live**" heading.
- [ ] **96.** Go-live checks: the `opening_balances` warn from the imbalanced TB appears as a warn-level item requiring acknowledgement. Tick the acknowledgement checkbox.
- [ ] **97.** ⚠️ **SAR decimal check:** The variance amount must show **2 decimal places** (e.g. `SAR 890.00`). If it shows 3 dp → log it.
- [ ] **98.** Click "**Go live**" → confirmation dialog. Click "**Yes, go live**". System goes live.
- [ ] **99.** After go-live, attempt to re-access the wizard. Must redirect to dashboard: "Your business is already live."
- [ ] **100.** 💚 **Emotional test:** "My shop is live and ZATCA-connected." Dashboard should show SAR with 2dp everywhere, VAT 15% in reports, and the ZATCA status badge "Active" (or the setup banner if ZATCA onboarding hasn't been done yet).

---

### 1A-13 · Edge Cases & Cross-Cutting Checks (Abu Khalid)

- [ ] **101.** **SAR 2dp everywhere:** At any point — review screen, import preview, opening balance variance, trial balance — money must show exactly 2 decimals (`1,250.00 SAR`). If you see 3dp → log it.
- [ ] **102.** **No KNET anywhere:** Payment method list must never show KNET for an SA tenant. Check Step 6 and the POS tender list post go-live.
- [ ] **103.** **RTL layout test:** Set language to Arabic — wizard layout should mirror right-to-left. Switch back.
- [ ] **104.** **Persistence on refresh:** Fill Step 1, close tab, reopen. Step 1 fields should persist.

---

## 1B · Daily Operations (Abu Khalid — B2B, clearance-heavy)

| # | What Abu Khalid does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 1 | Opens shift, cash float | Shift opens, float recorded in SAR 2dp | Routine | — |
| 2 | Sells 20 oil filters to Al-Rashid Garage (VAT-registered B2B) | Standard tax invoice created; buyer TRN required; ZATCA **clearance called synchronously** before buyer copy is valid | 💚 "Invoice cleared before I hand it over." | ✅ Clearance (blocking) |
| 3 | Clearance succeeds → print invoice | Invoice shows VAT 15% line, seller TRN, buyer TRN, QR with all 9 tags, ZATCA stamp/reference | "Looks compliant." | ✅ ZATCA-cleared invoice |
| 4 | Clearance fails (ZATCA network down) | Informative error in Arabic + English; sale is blocked on the standard path; UI suggests retry | "Tells me what went wrong." | ✅ Bilingual ZATCA errors |
| 5 | B2B buyer has no TRN but is flagged `VAT Registered = Yes` (Z3) | System blocks/flags creating a standard invoice for this customer — BR-KSA-42 | "Protects me from non-compliant invoices." | ✅ Buyer-TRN gate |
| 6 | Takes mada payment, prints receipt | Receipt 2dp SAR; mada tender recorded; receipt header says "TAX INVOICE"; VAT line shows | "Mada, just like KNET for Saudis." | ✅ mada tender |
| 7 | Internet drops mid-sale | POS keeps working offline (IndexedDB); B2C sales queue for 24h reporting; B2B clears when reconnected | 💚 "Doesn't die on me." | ✅ Offline-first + reporting replay |
| 8 | Corporate bulk buy **on credit** | `on_account` tender → AR; customer credit limit checked; dues in AR aging | "His tab is real." | ✅ Credit-sale → AR |
| 9 | Customer returns wrong part | Return reverts stock; credit note issued; ⚠️ ZATCA credit note 381 with BillingReference to original | "Returns are clean." | ✅ Returns (see Al-Faisaliah for full 381 test) |
| 10 | Cashier closes shift | Z-report: cash vs mada vs on-account breakdown, 2dp SAR | "Day at a glance." | ✅ Z-report |
| 11 | Received a **PDC** from a garage customer | PDC lifecycle: received → presented → cleared/bounced → AP/AR update | "My PDCs are tracked." | ✅ PDC module |
| 12 | PDC **bounces** (Z18) | System flags the PDC as bounced; AR re-opens; PDC status updates | ⚠️ "Flag if PDC module gaps" | ⚠️ Flag maturity |

## 1C · Purchasing (Abu Khalid — overseas suppliers)

| # | What Abu Khalid does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 13 | 🧾 Snaps a real **KSA auto-parts supplier invoice** into Sami | Extract lines (Gemini 2.5); match via TRN → name → fuzzy; preview GL | 💚 "It read the invoice." | 🤖 Sami |
| 14 | Sami extraction: supplier has a TRN | TRN matched to supplier record; fills buyer field on AP bill | "Supplier matched right." | 🤖 Sami TRN match |
| 15 | Receives OEM parts from **UAE supplier** (import) | Reverse-charge / import VAT annotation on the AP bill; separate tax code if configured | "Import VAT handled." | ✅ Overseas supplier flag |
| 16 | Receives goods before invoice (GRN) | GRN accrues to clearing account; bill later clears it | "Stock is in." | ✅ GRN |
| 17 | Pays supplier with **PDC** | PDC lifecycle: issued → presented → cleared | "Cheque is tracked." | ✅ PDC module |

## 1D · Month-End (Abu Khalid)

| # | What Abu Khalid does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 18 | Opens **Trial Balance** | TB ties to 0; balances to 2dp SAR | "Books balance." | — |
| 19 | Opens **VAT Return summary** | VAT output (sales) − VAT input (purchases) = amount payable; 2dp SAR; lines tie | "My ZATCA filing number is ready." | ✅ VAT summary |
| 20 | Opens **AR aging** | Garage dues bucketed 0–30/31–60/60+; PDCs reflected | "I know who owes me." | ✅ AR aging |
| 21 | Opens **AP aging** | Supplier dues; PDCs reflected | "I know what I owe." | ✅ AP aging |
| 22 | Opens **Balance Sheet** | Assets = Liabilities + Equity | 💚 "Accountant-ready books." | ✅ Balance Sheet |
| 23 | **ZATCA reconciliation:** checks cleared vs rejected docs | `zatca_invoice_documents` status breakdown; any `rejected` docs visible + retryable | "Nothing is hiding." | ✅ ZATCA doc status |
| 24 | Period close | Locks period; closed-period transactions blocked | 💚 "Closed. Filed. Done." | ✅ Period close gate |

---
---

# PERSONA 2 — UMM SAUD (Baqala, Jeddah, B2C-heavy, ZATCA reporting + QR)

> **Test data:** generate from `test-data/umm-saud/` (seed 45).
> Files needed: 01-categories, 02-products (Brand/Track Batch/Shelf Life Days/VAT Applicable/taxGroup incl.
> Zero Rate/Exempt + 1 garbled), 03-customers (mostly cash/walk-in + few credit tabs), 04-suppliers,
> 05-opening-stock (Batch No/Expiry Date — 3 expired rows, 2 near-expiry), 06-sales-history (500+ simplified
> B2C rows), 07-trial-balance (balanced), 08-customers-windows1256.
> 🧾 Feed a real KSA grocery/FMCG distributor invoice into Sami.

---

## 2A · First Day — Signup → Live (the "2 hours" proof for KSA)

| # | What Umm Saud does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 1 | Signs up, picks **Saudi Arabia** | SAR 2dp + VAT 15% preview + Arabic/RTL | "It knows I'm in Saudi." | ✅ Country-aware |
| 2 | Onboarding: 1 location, "Baqala Umm Saud - Jeddah" | Single-store path; timezone Asia/Riyadh pre-filled | "Not complicated." | — |
| 3 | Tax step: enters VAT number `300000000000003` + full National Address | VAT form renders (not "no tax"); validation accepts 3..3 TRN; National Address completeness shows "ZATCA ready" | "All set for Fatoora." | ✅ VAT registration |
| 4 | POS step: Cash + mada, bilingual receipt | mada appears (SA-only); receipt bilingual; ⚠️ KNET must NOT appear | "Built for Jeddah." | — |
| 5 | Uploads product list with **batch/expiry + VAT categories** | Mira maps columns including Shelf Life Days, Batch No; flags missing barcodes, expired batches, garbled taxGroup (Z9) | "It caught the garbled exemption." | 🤖 Mira + Z9 fail-closed |
| 6 | ZATCA EGS onboard (sandbox OTP 123456) | CSR → CCSID → compliance checks pass → PCSID | "ZATCA connected." | ✅ EGS onboard |
| 7 | Go Live | Materializes + live | 💚 "My baqala is running today." | ✅ Go-live gate |

---

## 2B · Daily Operations (Umm Saud — highest POS volume, simplified invoices)

| # | What Umm Saud does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 8 | Opens shift | Float recorded; SAR 2dp | Routine | — |
| 9 | Scans groceries fast, back-to-back | POS keeps pace; each line 2dp SAR; barcode resolves instantly | "Fast enough for rush hour." | ✅ POS perf |
| 10 | Mixed-VAT basket: standard-rated yogurt (15%) + zero-rated medicine (0%) + exempt item | ZATCA simplified invoice must show **grouped VAT breakdown**: one block per category (S at 15%, Z at 0%, E at 0%); totals correct (Z14) | "Every item at the right rate." | ✅ Multi-line VAT |
| 11 | B2C simplified invoice issued → **TLV QR** on receipt (Z11) | QR encodes TLV tags 1-5 at minimum (Phase 1); Phase 2 sends tags 1-9 after EGS onboard | 💚 "ZATCA compliant receipt." | ✅ TLV QR |
| 12 | **Decode the QR** (manually, adversarial) | Use a TLV decoder to read back: Tag 1 = seller name (Arabic), Tag 2 = seller VAT (`300000000000003`), Tag 3 = invoice date/time (ISO), Tag 4 = total incl VAT, Tag 5 = VAT amount. Values must match the receipt. If any tag is wrong → stop and log. | "QR matches the receipt." | ✅ QR accuracy |
| 13 | Sells an item with **garbled/unknown exemption code** (Z9) | System must NOT generate a ZATCA doc with a wrong exemption code. Expect `ZatcaMissingExemptionError` — sale is blocked or the item's taxGroup is flagged. Fail-closed, not fail-open. | ⚠️ "Better to block than to file garbage." | ✅ Fail-closed exemption |
| 14 | Invoice with **discount + rounding midpoint** (Z15) | Line discount applied; VAT calculated on discounted amount; doc-level VAT rounded half-up at 2dp — **not** truncated. e.g. SAR 0.005 → SAR 0.01 | "Rounding is correct." | ✅ Half-up 2dp |
| 15 | Mixed cash + mada payment | Split tender both recorded; change in halalah (2dp) correct | "Handles real customers." | ✅ Split tender |
| 16 | Wi-Fi drops mid-shift | POS continues offline; simplified invoices queue for 24h reporting; replays cleanly when reconnected (Z16) | 💚 "Never stops the queue." | ✅ Offline + reporting replay |
| 17 | Tries to sell an **expired batch** item | System blocks or warns — FEFO picks earliest-expiry, expired batches flagged | "Protects me from selling expired." | ✅ Batch/expiry FEFO + block |
| 18 | Near-expiry alert | Dashboard surfaces items expiring soon | "Tells me before I lose money." | ✅ Expiry alerts |
| 19 | Cash pay-out to safe mid-shift | ⚠️ Pay-in/pay-out affects expectedCash on Z-report | "Drawer reconciles." | ⚠️ Watch known gap |
| 20 | Closes shift | Z-report: cash vs mada; 2dp SAR | "I see the day." | ✅ Z-report |

## 2C · ZATCA Reporting Queue Deep-Test (Umm Saud)

> Test the reporting pipeline, not just the UI.

| # | Test action | Expected behavior | Pass criteria |
|---|---|---|---|
| R1 | Complete a simplified B2C sale | `zatca_invoice_documents` row created with `status = pending` | Row exists immediately |
| R2 | Wait / force the reporting job (pg-boss queue) | Status transitions `pending → reported`; `submittedAt` populated | Within 24h SLA; sweeper catches laggards |
| R3 | ZATCA reporting endpoint returns 200 | `status = reported`; ZATCA response stored in `zatcaResponse` jsonb | No status left as `pending` indefinitely |
| R4 | ZATCA returns error (simulated) | Status = `rejected`; error visible in ZATCA doc status UI; retryable | Not silently swallowed |
| R5 | Reporting queue dead-letter | Repeated failure → dead-letter visible in admin/ops panel + alert | ✅ Dead-letter surfaced |

## 2D · Purchasing & Month-End (Umm Saud)

| # | What Umm Saud does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 21 | 🧾 Snaps **distributor's FMCG invoice** into Sami | Extract lines; batch info if present; reconcile; post AP bill | 💚 "I didn't type a single line." | 🤖 Sami |
| 22 | Dairy delivery: GRN with **new batches + expiry** | Batch + expiry captured; stock + WAC update | "Fresh stock dated." | ✅ Batch on GRN |
| 23 | Low-stock morning list | Items below reorder point flagged | "I know what to buy." | ✅ Low-stock reorder |
| 24 | Month-end: P&L + cash/mada split | Profit visible; VAT liability line on P&L | "Did I make money?" answered | ✅ P&L |
| 25 | Month-end: stock value + expiry write-offs | Expired stock posts to GL; stock value correct | "Shelves match books." | ✅ Stock + adjustments |
| 26 | Month-end: VAT return | Output VAT − input VAT; 2dp SAR | "Filing number ready." | ✅ VAT summary |
| 27 | Month-end: period close | Locks cleanly; closed-period txns blocked | 💚 "Done." | ✅ Period gate |
| 28 | Year-end: full-year P&L + Balance Sheet | Year ties; opening balances carried | 💚 "I have real books." | ✅ Reports |

---
---

# PERSONA 3 — AL-FAISALIAH MOBILES (Electronics, Dammam, mixed + serial + credit notes)

> **Test data:** generate from `test-data/al-faisaliah/` (seed 46).
> Files needed: 01-categories, 02-products (Track Serial=Yes/Brand/VAT Applicable/taxGroup), 03-customers
> (mix B2C + B2B with TRN; 2 fourteen-digit TRNs, 1 TRN not ending in 3, 3 VAT-registered-but-no-TRN),
> 04-suppliers, 05-opening-stock, 06-imei-register (IMEI 15-digit), 07-sales-history (mixed simplified+standard,
> some credit-note rows), 08-trial-balance, 09-customers-windows1256.

---

## 3A · First Day — Signup → Live

| # | What Al-Faisaliah does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 1 | Signs up, picks **Saudi Arabia** | SAR 2dp + VAT 15% + mada | "It speaks KSA." | ✅ Country-aware |
| 2 | Onboarding: 1 Dammam location | Single store; timezone Asia/Riyadh pre-filled | "Simple setup." | — |
| 3 | Industry: Electronics, mobile. Inventory: Serialized (auto-selected + Recommended badge) | ✅ Auto-select fires for Electronics | — | — |
| 4 | Tax step: VAT TRN + National Address | VAT form; 3..3 validation; address completeness | "ZATCA ready." | ✅ VAT registration |
| 5 | POS: mada + Cash + Visa/MC; bilingual | All 3 tenders accepted; KNET absent | "Correct tenders." | — |
| 6 | Imports IMEI register (06-imei-register.csv) after products | Serials land; tied to SKUs; IMEI 15-digit validation | "Every phone tracked." | 🤖 Mira serial mapping |
| 7 | Customer CSV: Z1/Z2/Z3 traps | 14-digit TRNs get validation errors; VAT-registered-no-TRN gets warning | "Bad TRNs caught before invoicing." | ✅ TRN gate |
| 8 | ZATCA EGS onboard (sandbox) | CSR → CCSID → compliance → PCSID | "ZATCA connected." | ✅ EGS onboard |
| 9 | Go Live | Clean go-live | 💚 "Al-Faisaliah Mobiles is live." | ✅ Go-live |

---

## 3B · Daily Operations (Al-Faisaliah — mixed B2C + B2B + credit notes)

| # | What Al-Faisaliah does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 10 | B2C walk-in: sells 1 iPhone, picks IMEI from serial dialog | Simplified invoice → ZATCA reporting queue; TLV QR tags 1-9 on receipt (Phase 2); IMEI attached to the sale | 💚 "Right phone, right serial, compliant receipt." | ✅ Serial picker + simplified |
| 11 | B2B corporate: sells 10 phones to Al-Rashid Corp (VAT-registered buyer) | Standard invoice → **clearance (blocking)**; buyer TRN required; VAT breakdown per line | "Cleared before I send." | ✅ Clearance + standard invoice |
| 12 | B2B buyer has no TRN (Z3 trap) | System blocks or forces acknowledgement before creating a standard invoice for this customer | "Can't accidentally issue a non-compliant B2B invoice." | ✅ Buyer-TRN gate |
| 13 | **USD-priced corporate quote** sent (Z10) | At the ZATCA boundary, invoice is **rejected** — non-SAR invoices explicitly refused. Error: "Invoice currency must be SAR for ZATCA submission." No silent submission with wrong amounts. | ⚠️ "USD rejected, not silently filed in wrong amounts." | ✅ Non-SAR rejection |
| 14 | Customer returns a phone (partial return, wrong model) — B2C | **Credit note 381** issued with `BillingReference` pointing to original invoice UUID; VAT reversal at same rate; subtype matches original (simplified) | 💚 "Returns are ZATCA-compliant." | ✅ Credit note 381 |
| 15 | Verify the **credit note 381** (Z13) | ZATCA reporting called for the credit note (not clearance — same subtype as original simplified); `zatca_invoice_documents` row with `invoiceType = 381`, `pih` chains correctly from the preceding invoice | "Chain is unbroken." | ✅ ICV/PIH chain |
| 16 | Corporate return (partial, B2B standard) | Credit note 381 with BillingReference; clearance called (standard subtype); VAT reversal | "Cleared, not just issued." | ✅ Clearance on B2B credit note |
| 17 | Warranty walk-in: customer gives IMEI | Search by IMEI returns original sale + warranty expiry | "I look professional." | ✅ IMEI lookup |
| 18 | Price override on a sale (Z15 — discount mid-point) | VAT calculated on discounted price; half-up 2dp rounding; doc-level VAT rounded once | "Rounding is right." | ✅ Half-up 2dp |
| 19 | Shift close | Z-report: cash/mada/on-account; 2dp SAR; ZATCA stats (cleared/reported/pending) | "See the day clearly." | ✅ Z-report |

## 3C · Purchasing & Month-End (Al-Faisaliah)

| # | What Al-Faisaliah does | What SHOULD happen | 💚 Emotion | 🤖 AI / features |
|---|---|---|---|---|
| 20 | 🧾 Snaps a **mobile-phone distributor invoice (KSA)** into Sami | Extract lines; IMEI/serial numbers extracted if present; TRN matched | 💚 "Read the invoice." | 🤖 Sami |
| 21 | GRN for new phones; adds IMEI register | Each unit's IMEI attached to the GRN line; WAC updated | "Stock is right." | ✅ Serial + GRN |
| 22 | Month-end: P&L | Margins visible; ZATCA doc count per period | "Do I make money?" | ✅ P&L |
| 23 | Month-end: VAT return | Output 15% sales − input 15% purchase; 2dp SAR | "Filing ready." | ✅ VAT return |
| 24 | Month-end: **ZATCA reconciliation** | Cleared+reported count matches issued invoice count; no orphaned `pending` docs | "ZATCA and books agree." | ✅ ZATCA reconciliation |
| 25 | Period close | Locks; no voids/edits allowed after close | 💚 "Closed." | ✅ Period gate |

---
---

# ZATCA Stress / Edge-Case Watch List (Z1–Z18)

> Work through **every row** across the three personas. Log the Z-code if behavior deviates.
> "Trigger" column = the exact test action. "Pass criteria" = what MUST happen (not what might).

| Z# | Edge case | Persona(s) | How to trigger | Expected behavior | Pass criteria |
|---|---|---|---|---|---|
| Z1 | 14-digit TRN in customer CSV | al-faisaliah | Import `03-customers.csv`; two rows have 14-digit TRNs | Validation error per row: "TRN must be 15 digits" | Row gets `INVALID_TRN_LENGTH` warning/error; non-fatal import; TRN field left blank or flagged |
| Z2 | TRN not starting/ending with 3 | al-faisaliah | Import `03-customers.csv`; one row has TRN `200000000000002` | Validation error: "TRN must start and end with 3" (BR-KSA-31 rule) | Row gets `INVALID_TRN_FORMAT` warning; non-fatal import |
| Z3 | VAT-registered buyer with blank TRN | abu-khalid + al-faisaliah | Attempt to create a **standard invoice** for a customer flagged `VAT Registered = Yes` but `TRN` is empty | System blocks invoice creation with BR-KSA-42/BR-KSA-81 message; cannot clear without TRN | Hard block at invoice creation; error message names BR-KSA-42 or equivalent |
| Z4 | Seller VAT not matching 3..3 | checklist onboarding (Step 4) | Type `123456789012345` (15 digits, doesn't start+end with 3) in seller TRN field | Validation error in Step 4; wizard does not advance | Field error shown; `POST /tenant/onboarding/4/answer` returns validation error |
| Z5 | National Address incomplete | checklist onboarding (Step 4) | Leave Building No and Postal Code blank; complete onboarding; try to create EGS unit | Settings → ZATCA shows "National address incomplete — cannot create EGS" | EGS creation blocked; warning with "fix" link to address fields |
| Z6 | taxGroup canonical name mismatch | umm-saud / abu-khalid | One product in `02-products.csv` has `taxGroup = "Standard Rate 15%"` (without canonical formatting) | Import does NOT silently assign wrong group; surfaces `UNKNOWN_TAX_GROUP` warning or "did you mean…" suggestion | Row receives `UNKNOWN_TAX_GROUP` warning; user must manually confirm mapping |
| Z7 | Zero-rated item (category Z) | umm-saud | Include a product with `taxGroup = "Zero Rate"` (medicine/export) in the basket | Invoice line has `taxCategory = Z`; `taxRate = 0%`; grouped VAT breakdown shows Z block | VAT breakdown shows zero-rated block; no 15% applied to that line |
| Z8 | Exempt item (category E) | umm-saud | Include a product with `taxGroup = "Exempt"` in the basket | Invoice line has `taxCategory = E`; exemption reason text populated; grouped VAT breakdown shows E block | E block present with reason; VAT = 0 on that line; total correct |
| Z9 | Garbled/unknown exemption code | umm-saud | One product in `02-products.csv` has `taxGroup = "ExemptXXX"` (garbled). Attempt to sell it. | System throws `ZatcaMissingExemptionError`; sale blocked or item flagged before ZATCA submission. Fail-closed, NOT fail-open. | Sale blocked with clear error; no ZATCA doc issued with a garbage exemption code |
| Z10 | Non-SAR invoice (USD) | al-faisaliah | Create a standard invoice for a corporate buyer, set invoice currency to USD | At the ZATCA submission boundary: explicit rejection "Invoice currency must be SAR." No silent conversion. | Hard error before/at ZATCA boundary; no ZATCA doc submitted with wrong-currency amounts |
| Z11 | B2C simplified invoice → TLV QR | umm-saud + al-faisaliah | Complete any B2C POS sale, print receipt | TLV QR present on receipt; Phase 1 = tags 1-5; Phase 2 (post EGS onboard) = tags 1-9 | QR decodes to correct tags; tag values match receipt values exactly |
| Z12 | B2B standard invoice → clearance (blocking) | abu-khalid + al-faisaliah | Confirm a sales invoice for a VAT-registered B2B customer | ZATCA clearance API called synchronously; buyer copy NOT printed until clearance succeeds | Status = `cleared`; `clearedAt` populated; invoice printable only post-clearance |
| Z13 | Credit note 381 with BillingReference | al-faisaliah | Process a return against a previous standard or simplified invoice | Credit note type 381 generated; `BillingReference` field populated with original invoice UUID; `pih` chains from preceding invoice; VAT reversed correctly | `zatca_invoice_documents` row: `invoiceType = 381`; `pih` correct; clearance/reporting follows same subtype as original |
| Z14 | Multi-line mixed S+Z basket, grouped VAT breakdown | umm-saud | Sell a basket with standard-rated, zero-rated, and exempt items | ZATCA invoice XML contains separate `cac:TaxSubtotal` per category; totals correct; no cross-contamination between categories | VAT breakdown verified in printed invoice AND in `zatca_invoice_documents.signedXml` (decode and inspect) |
| Z15 | Discount + rounding midpoints | all | Apply a line discount where the discounted VAT-exclusive price × 15% produces a rounding midpoint (e.g. SAR 33.33 × 15% = SAR 4.9995) | Document-level VAT rounded **half-up** to SAR 5.00; NOT truncated to SAR 4.99 | Printed total correct; VAT on invoice XML uses `xs:decimal` 2dp half-up |
| Z16 | Offline POS → reporting replay | umm-saud | Take the POS offline (disable network). Complete several simplified B2C sales. Re-enable network. | Queued simplified invoices replay to ZATCA reporting in order; ICV sequence unbroken; no duplicate documents | All queued docs transition to `reported`; ICV values sequential with no gaps |
| Z17 | Imbalanced Tally TB at import | abu-khalid | Import `07-trial-balance.csv` (intentionally off by ~SAR 890) | Reconciliation gate detects imbalance; shows variance SAR 890.00; "Park to OBE" option; blocked from go-live without acknowledgement | Go-live blocked at `opening_balances = fail`; acknowledgement checkbox unlocks it; variance in SAR 2dp |
| Z18 | PDC bounced | abu-khalid | Create a received PDC from a garage; simulate bounce via PDC lifecycle screen | PDC status → bounced; AR re-opens; bounce posted to GL; AP/AR aging reflects | PDC module surfaces bounce; GL entry visible; ⚠️ flag if PDC maturity gaps |

---

# Cross-Persona "Watch List" (log immediately if seen)

These are known rough edges or compliance landmines. Every persona should actively try to trip them.

| Watch item | How to trigger | Pass criteria |
|---|---|---|
| ⚠️ **SAR shown as 3 decimals** anywhere | Open any report, receipt, or import preview after going live | Must show **2dp** everywhere — `1,250.00` not `1,250.000` |
| ⚠️ **"No tax"** panel in Step 4 for SA tenant | Start onboarding with country = SA | Must render the VAT registration form, NOT the "No tax to set up" panel |
| ⚠️ **KNET in payment list** for SA tenant | Check Step 6 payment methods and POS tender list | KNET must NEVER appear for SA — mada only |
| ⚠️ **mada absent** for SA tenant | Same check | mada must appear for SA; its absence is a KSA-specific regression |
| ⚠️ **TAX INVOICE absent** from printed invoice | Print any B2B standard invoice | Header MUST say "TAX INVOICE" (and "فاتورة ضريبية" in Arabic) |
| ⚠️ **VAT line missing** from receipt | Print any B2C receipt | 15% VAT line must appear with amount; missing = compliance violation |
| ⚠️ **QR absent or undecodable** | Print a receipt; decode the QR | TLV must decode to ≥ tags 1-5; values match receipt |
| ⚠️ **Z-report expectedCash wrong** | Do a mid-shift cash pay-out then close shift | expectedCash = open + sales − refunds − payOuts + payIns |
| ⚠️ **Windows-1256 Arabic CSV garbles** | Import `08-customers-windows1256.csv` | Arabic names render correctly — no `???` or mojibake |
| ⚠️ **Poison row blocks whole import** | Import products CSV with a few junk rows | Bad rows lose only themselves; rest commit; real error per row |
| 🆕 **Currency-string in numeric column** | Import a price like `SR 11.50` or `ريال 5.00` | Imports as the number with `CURRENCY_STRIPPED` warning — never an error or 0 |
| 🆕 **"View original file" unavailable** | Click it on mapping step after upload | Opens exact upload; if always unavailable → `import-files` bucket missing |
| ⚠️ **ZATCA doc stuck as `pending`** | Wait > 24h after simplified invoice | pg-boss sweeper must move it; dead-letter surfaced if repeated failure |
| ⚠️ **Non-SAR invoice silently accepted** | Raise a standard invoice in USD | Must be hard-rejected at ZATCA boundary with a clear error |
| ⚠️ **ICV gap after rejected invoice** | Simulate a ZATCA rejection then issue a new invoice | Rejected invoice still consumed an ICV; next invoice ICV = rejected + 1; no gap |
| ⚠️ **Credit note 381 missing BillingReference** | Issue a return against a prior invoice | `zatca_invoice_documents.signedXml` for the 381 must contain BillingReference |
| ⚠️ **Garbled exemption fail-open** | Sell an item with a garbled taxGroup | Must NOT issue a ZATCA doc — `ZatcaMissingExemptionError` must block |
| ⚠️ **Half-up rounding wrong** | Sale with midpoint VAT (see Z15) | Rounding must be half-up, not truncate or round-half-even |

---

# Test-Data Generation Punch-List (do before the run)

| Persona | Dataset | Status | Notes |
|---|---|---|---|
| Abu Khalid | `test-data/abu-khalid/` — 01–08 CSVs (seed 44); source from `legacy-raw/p1-abu-khalid-ksa/` | ⚠️ Generate / migrate from legacy-raw | Run `node generate.mjs` from the folder once the generator is built; source CSVs exist in `legacy-raw/` |
| Abu Khalid | 07-trial-balance intentionally imbalanced ~SAR 890 | ⚠️ Verify imbalance in generated TB | Generator must seed an intentional ~SAR 890 debit-credit gap |
| Abu Khalid | 06-pdc-register (received + issued PDCs, one BOUNCED) | ⚠️ Generate | PDC lifecycle test (Z18) |
| Abu Khalid | 08-customers-windows1256.csv (no BOM, Windows-1256) | ⚠️ Generate | Arabic encoding trap |
| Umm Saud | `test-data/umm-saud/` — 01–08 CSVs (seed 45) | ⚠️ Generate | Includes 3 expired batches, 2 near-expiry, garbled taxGroup row (Z9), 500+ sales-history rows |
| Umm Saud | `02-products.csv` — taxGroup including Zero Rate, Exempt, **one garbled** | ⚠️ Verify garbled row exists | Z6/Z7/Z8/Z9 all need this file |
| Umm Saud | `05-opening-stock.csv` — Batch No + Expiry Date columns; 3 expired rows | ⚠️ Generate | Batch/expiry testing |
| Al-Faisaliah | `test-data/al-faisaliah/` — 01–09 CSVs (seed 46) | ⚠️ Generate | Serial/IMEI; 2 fourteen-digit TRNs; 1 bad-format TRN; 3 VAT-reg-no-TRN customers |
| Al-Faisaliah | `06-imei-register.csv` (15-digit IMEI per product) | ⚠️ Generate | Serial tracking; must tie to SKUs from `02-products.csv` |
| All | Real KSA supplier invoices (PDF / photo) → feed Sami | Have — use them | Extraction accuracy + TRN matching |
| All | Sandbox ZATCA credentials (EGS CSR, static OTP 123456) | ✅ Ready (sandbox, no portal needed) | Live HTTP round-trip against ZATCA sandbox awaits founder sandbox account |

---

## The emotional arc we are ultimately testing

Across all three KSA personas, the journey should feel like:

1. **"It knows I'm in Saudi"** (signup — SAR 2dp, VAT 15%, mada, not KNET) →
2. **"My ZATCA registration is done in the wizard, not a separate nightmare"** (Step 4 + EGS onboard) →
3. **"I'm live today, on my real data, and Fatoora-connected"** (go-live) →
4. **"Every invoice I send is cleared before my customer even gets it"** (clearance) →
5. **"The QR on my receipt is real — I decoded it and it matches"** (TLV QR decode test) →
6. **"It never files garbage — it blocked the wrong exemption code"** (Z9 fail-closed) →
7. **"My accountant sees a VAT return summary ready to file"** (month-end VAT) →
8. **"I run a compliant Saudi business now"** (year-end).

If any persona breaks this arc — a 3dp SAR number, a missing VAT line, a QR that doesn't decode, a
silently-filed wrong exemption, a clearance bypass — **that is the bug that matters most.** Log it with
the Z-code or row number above.
