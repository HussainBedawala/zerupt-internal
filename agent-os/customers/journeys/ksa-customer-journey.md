# KSA Customer Journeys — 3-Persona Full-Flow Audit

**Audited:** 2026-06-11, ZATCA status reflects PR #151 (`phase-2/zatca-einvoicing`) · **Companion docs:** `stress-test-master-journeys.md` (adversarial matrix), `ksa-manual-testing-checklist.md` (step-by-step), `uae-customer-journey.md` (UAE overlaps).
**Test data:** `test-data/abu-khalid/`, `test-data/umm-saud/`, `test-data/al-faisaliah/` — see `test-data/KSA-PERSONAS-SPEC.md` (source of truth for persona detail + Z1-Z18 matrix).
**Purpose:** map 100% of each Saudi persona's flow, fears, gaps; track ZATCA build reality. Grading: 🟢 works · 🟡 works-but-risky · 🔴 missing/wrong · ⚫ trust-killer.

**The one-line difference from other countries:** Kuwait/UAE fear *data loss* or *the taxman looking*. Saudi personas fear *the taxman has already enforced*. ZATCA Phase 2 (FATOORA) is mandatory at the SAR 375k+ revenue tier (Wave 24+), with SAR 50k fines per violation. They buy **compliance certainty first**. Every gap is weighted by "does this invoice pass ZATCA clearance/reporting?"

**ZATCA build status (as of 2026-06-11):** ✅ BUILT on PR #151 (`phase-2/zatca-einvoicing`). Gated dormant (`ZATCA_ENABLED=false` + KSA-only) until env flag is flipped and per-tenant onboarding completes. Earlier drafts of this doc saying "0% built" or "ZATCA is missing" are OUTDATED — that verdict is reversed. The remaining gaps are narrow and documented below.

---

## Part 1 — The Three KSA Personas

### 1.1 Abu Khalid — Auto Parts Trader, Riyadh (Al-Olaya)

| Attribute | Detail |
|---|---|
| Business | Single-outlet auto-parts retailer (Japanese/Korean parts + oils) |
| Size | 1 outlet · 4 staff (owner + 2 Pakistani counter staff + driver) · 8,000–12,000 SKUs · ~400 txns/month · SAR 180k–300k/month |
| Currency | SAR (2 dp) |
| Tax reality | **15% VAT · ZATCA Phase 2 FATOORA mandatory** (above his revenue threshold) — clearance-path (B2B standard invoices dominant) |
| Source stack | Tally Prime + legacy FoxPro-era POS + Excel POs + WhatsApp + physical stock cards |
| Sales mix | Walk-in **cash B2C** (simplified invoices) + **B2B credit to garages** (standard tax invoices, PDCs) |
| Test data | `test-data/abu-khalid/` — seed 44; Tally-flavored 8-file set; TB does NOT balance (~SAR 890 gap, deliberate) |

**Psychology.** ZATCA enforcement wave hit his tier; accountant quoted SAR 12,000 to retrofit. He googled "نظام محاسبة متوافق مع الزكاة." He buys compliance, not features.

**Fears, ranked:**
1. "Will my invoices pass ZATCA clearance?"
2. "Will the audit find a gap?"
3. "Can my Pakistani staff ring up a sale fast?"
4. "Will my garage PDCs be tracked?"
5. "Will migration lose my Tally history?"

**ZATCA focus: clearance (B2B standard).** Most invoices are standard (garage clients, VAT-registered). Wrong TRN or missing National Address = clearance rejection = illegal invoice = fine.

---

### 1.2 Umm Saud — Neighborhood Baqala, Jeddah

| Attribute | Detail |
|---|---|
| Business | High-SKU neighborhood supermarket / baqala |
| Size | 1 outlet · 3 staff · 1,500–2,500 SKUs · very high daily transaction volume · SAR 80k–150k/month |
| Currency | SAR (2 dp) |
| Tax reality | **15% VAT · ZATCA Phase 2 mandatory** — simplified-invoice (B2C) path dominant; reporting within 24h |
| Source stack | Cash register + Excel stock list |
| Sales mix | Walk-in cash + **mada** (SA debit card, dominant) · no B2B credit |
| Test data | `test-data/umm-saud/` — seed 45; 8-file set; VAT category mix (S/Z/E/garbled) + batch/expiry traps |

**Psychology.** She doesn't understand "clearance vs reporting" — she just wants a receipt that satisfies the inspector and a QR that scans. Mada is her primary tender; cash is secondary. Batch/expiry risk is real (FMCG).

**ZATCA focus: TLV QR on every receipt + 24h reporting queue.** Wrong or missing QR on a high-volume B2C outlet = thousands of non-compliant receipts per day.

---

### 1.3 Al-Faisaliah Mobiles — Electronics/Mobile Shop, Dammam

| Attribute | Detail |
|---|---|
| Business | Mobile phones + accessories, IMEI-tracked |
| Size | 1 outlet · 5 staff · 600–1,200 SKUs · mix walk-in + corporate bulk orders · SAR 250k–500k/month |
| Currency | SAR (2 dp) — but some corporate quotes priced in USD (intentional trap) |
| Tax reality | **15% VAT · ZATCA Phase 2 mandatory** — mixed: simplified (walk-in) + standard (corporate B2B) |
| Source stack | Mix of simple POS + Excel + a small ERP |
| Sales mix | Walk-in B2C (simplified) + corporate B2B (standard → clearance) + returns/warranties (credit notes 381) |
| Test data | `test-data/al-faisaliah/` — seed 46; 9-file set; IMEI register, mixed TRN quality, USD quote trap |

**Psychology.** He does high-value transactions (phones SAR 2k–8k each). Returns and exchanges are frequent; warranty exchanges create credit notes. Corporate clients expect formal ZATCA-cleared invoices. A USD-denominated quote sneaks in because a UAE client asked for pricing in USD — it must NOT reach ZATCA as-is.

**ZATCA focus: clearance (B2B), credit notes (381), USD rejection, serial/IMEI tracking on every sale.**

---

## Part 2 — The End-to-End KSA Journey (All Personas)

> Shared findings (returns, cash mgmt, credit AR, import mechanics) live in the master stress-test doc and apply equally here. Below: KSA-specific stages only.

### Stage 0 — Discovery → Signup

**Previous claim (outdated):** Website ZATCA over-claim was ⚫ because ZATCA wasn't built. **Current reality:** ZATCA Phase 1+2 is built (PR #151). The website claim "ZATCA e-invoicing built in" is now accurate. Grading upgraded to 🟢 (pending env flag + sandbox OTP validation steps documented in MORNING-BRIEF.md).

Remaining UX note: 🟡 The website should clarify that ZATCA activation requires the tenant to complete a per-tenant EGS onboarding step (OTP from Fatoora portal) — passive buyers may expect zero-setup compliance.

### Stage 1 — Onboarding Wizard

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 1.1 | 🟢 | SA config correct: SAR, 2dp, vat; `VAT-SA-15` 15% + zero-rated/exempt/import-RC seeded | `countries.ts:51-57`, `tax-config.seed.ts:68-113` |
| 1.2 | 🟢 | **ZATCA toggle is now wired.** `zatcaEnabled` in wizard Step 4 (SA-only) now maps to `tenant_identity` and is read by the ZATCA module gate. ~~Dead toggle (was ⚫)~~ | PR #151 `zatca-settings.service.ts` |
| 1.3 | 🟢 | **Seller VAT validated 3..3**: 15-digit, first+last = `3`; format hint shown; server-side `validateTrn` enforced | PR #151 + commit `e51fa7a` |
| 1.4 | 🟢 | **Saudi National Address** captured: building no (4-digit), postal (5-digit), district, city — required for ZATCA onboarding completeness gate | PR #151 `ksa-settings` fields |
| 1.5 | 🟡 | Onboarding completeness gate (Z5): if seller VAT or National Address is incomplete, ZATCA enable should block. Gate exists in Settings; needs E2E test to confirm it surfaces clearly in the wizard review screen | manual check needed |

### Stage 2 — Data Migration

Mechanics shared with other personas. KSA-specific notes:

| # | Grade | Finding |
|---|---|---|
| 2.1 | 🟢 | OEM/part-number field now exists (`part_number` item attribute, `Gap #25` shipped); Abu Khalid's part numbers from Tally have a landing column |
| 2.2 | 🟢 | PDC register (`abu-khalid/06-pdc-register.csv`) has a destination: PDC module is built (Gap #21 shipped) |
| 2.3 | 🟡 | Abu Khalid's TB deliberately does NOT balance (SAR ~890 gap). Go-live readiness gate surfaces imbalance and requires explicit acknowledgement — correct behavior, but test this flow with the actual dataset |
| 2.4 | 🟡 | `umm-saud/02-products.csv` contains a row with garbled/unknown taxGroup (Z9 edge case). The importer must surface a validation error, not silently default to 15% or 0% — verify behavior |
| 2.5 | 🟡 | `al-faisaliah/03-customers.csv` has TRN anomalies (14-digit, not-ending-3, VAT-registered-but-blank-TRN). Import should flag these, not silently accept (Z1-Z3 edge cases) |

### Stage 3 — ZATCA EGS Onboarding (KSA-only, new stage)

> This stage has no equivalent in Kuwait/UAE. Every KSA tenant must complete it before ZATCA documents are issued.

| # | Grade | Finding |
|---|---|---|
| 3.1 | 🟢 | **Settings → Compliance → ZATCA** flow is built: EGS unit create → OTP paste → CCSID issuance → 3 or 6 compliance sample invoices → PCSID | PR #151 |
| 3.2 | 🟢 | Sandbox OTP `123456` is static — no Fatoora portal login needed in sandbox. Full sandbox E2E testable without ERAD credentials | MORNING-BRIEF.md |
| 3.3 | 🟢 | Credentials stored encrypted (AES-256-GCM via `packages/shared/src/crypto.ts`) — private key never leaves server | PR #151 |
| 3.4 | 🟡 | EGS-per-register wiring: schema + onboarding supports per-register; but **POS register CSID selection UI** is a deferred follow-up — until then, one EGS/CSID per branch applies to all registers on that branch | MORNING-BRIEF.md |
| 3.5 | 🟡 | Production go-live requires the tenant to generate an OTP in the Fatoora portal with their ERAD credentials. UX must make this hand-off crystal clear (not buried in a settings page); Abu Khalid won't know what ERAD is | onboarding UX gap |
| 3.6 | 🔴 | Live HTTP round-trip (CCSID issuance + clearance/reporting against ZATCA's actual servers) is untested — code is built to spec; sandbox validation step (MORNING-BRIEF §2) is outstanding | honest unknown |

### Stage 4 — Daily POS: the ZATCA till (Umm Saud + Al-Faisaliah walk-in)

| # | Grade | Finding |
|---|---|---|
| 4.1 | 🟢 | **TLV QR on B2C receipts is built** (tags 1-5 Phase 1; tags 1-9 Phase 2 server-signed preferred). ~~Was ⚫ placeholder~~ | PR #151 `qr.ts` + `receipt-document.tsx` |
| 4.2 | 🟢 | **Simplified vs standard invoice distinction exists**: B2C → simplified → reporting; B2B with buyer TRN → standard → clearance. ~~Was 🔴 missing~~ | PR #151 |
| 4.3 | 🟢 | **Reporting queue (24h)** via pg-boss: simplified invoices posted asynchronously, sweeper catches stragglers, dead-letter + alert if queue backs up | PR #151 |
| 4.4 | 🟢 | **Offline POS** (Dexie/IndexedDB catalog + sale queue + idempotent sync) is real — Z16 offline-then-reconnect path is handled; queued reporting replays on reconnect | PR #151 + existing offline tests |
| 4.5 | 🟢 | **Mada tender** — configurable tender types include mada; Umm Saud's primary payment method is covered | Gap #22 shipped |
| 4.6 | 🟡 | No service worker/PWA shell cache — tab close while offline (power cut) still needs network to reload app shell | (absent) |
| 4.7 | 🟡 | Dot-matrix ESC/P printer can't render Arabic; many auto-parts shops (Abu Khalid) use impact printers | `escp.ts:7-9` |
| 4.8 | 🔴 | **Z9 garbled exemption: fail-closed behavior** — an item tagged with an unknown/garbled exemption code must throw `ZatcaMissingExemptionError` rather than emitting a wrong code. Must be tested against Umm Saud's dataset | PR #151 spec; test needed |

### Stage 5 — B2B Standard Invoices + Clearance (Abu Khalid + Al-Faisaliah corporate)

| # | Grade | Finding |
|---|---|---|
| 5.1 | 🟢 | **Clearance path built**: standard invoice confirm → ZATCA clearance API call (durable queue, blocking before buyer copy is valid) | PR #151 |
| 5.2 | 🟢 | **VAT category mapping** S/Z/E/O wired; fail-closed on unknown — wrong category = `ZatcaMissingExemptionError`, invoice blocked | PR #151 |
| 5.3 | 🟢 | **Non-SAR invoices rejected at ZATCA boundary** — USD-priced invoices (Al-Faisaliah Z10 edge case) are explicitly rejected, not silently converted | MORNING-BRIEF.md |
| 5.4 | 🟢 | **Credit notes (381)** carry `BillingReference` to original invoice, VAT reversal, same subtype as original | PR #151 |
| 5.5 | 🟡 | **Buyer Saudi National Address** on B2B standard invoices: buyer carries name + VAT/TRN; full buyer National Address (building no etc.) needs a customer-address schema field — deferred follow-up | MORNING-BRIEF.md |
| 5.6 | 🔴 | **Z3 — VAT-registered B2B buyer with blank TRN**: should block or hard-flag on standard invoice (BR-KSA-42/81). Verify this is enforced, not just advisory | Z-matrix row 3 |
| 5.7 | 🔴 | **Z12 — clearance rejection handling**: if ZATCA rejects a clearance (invalid TRN, bad cert, rate mismatch), the system must surface a clear actionable error to the owner — not a silent dead-letter | needs E2E test |

### Stage 6 — B2B Credit & PDCs (Abu Khalid + Al-Faisaliah)

| # | Grade | Finding |
|---|---|---|
| 6.1 | 🟢 | Credit sales: `sales_invoices` has `dueDate`, `balance`, `paymentTermsDays`; AR allocation flow built | |
| 6.2 | 🟢 | **PDC module built**: full cheque lifecycle, accounting listener, bounce workflow. ~~Was ⚫ 0%~~ | Gap #21 shipped |
| 6.3 | 🟢 | Customer credit limit: `credit_limit` column + enforcement at sale | implied by gap register |
| 6.4 | 🟡 | Abu Khalid's PDC dataset includes BOUNCED cheques (Z18). Verify bounce workflow (protest/reversal JE + alert) is exercised | `abu-khalid/06-pdc-register.csv` |

### Stage 7 — Inventory: OEM Part-Number Search (Abu Khalid)

| # | Grade | Finding |
|---|---|---|
| 7.1 | 🟢 | **`part_number` field exists** on items; Abu Khalid's Tally OEM codes (ALL CAPS, jammed into names) have a landing column | Gap #25 shipped |
| 7.2 | 🟡 | POS search must include `part_number` AND `nameAlt` (Arabic) in the filter — verify these are in the offline catalog IndexedDB query; a cashier finding "Camry oil filter" by 90915-YZZD4 is the test | check needed |

### Stage 8 — Month-End VAT & ZATCA Archival

| # | Grade | Finding |
|---|---|---|
| 8.1 | 🟢 | **15% VAT plumbing real** (codes, COA overlay, per-line rounding, tax summary) | `tax-config.seed.ts` |
| 8.2 | 🟢 | **Signed XML archived per-invoice** in `zatca_invoice_documents`; producible on ZATCA audit demand | PR #151 schema |
| 8.3 | 🟢 | **5-year archival**: `zatca_invoice_documents` table holds `signedXmlEnc` with encryption, no deletion pathway | PR #151 |
| 8.4 | 🟡 | **Audit trail surface**: can an owner actually download their archived signed XML on demand (audit-export UI)? Not confirmed from PR read | needs UI check |
| 8.5 | 🔴 | **No basic-food zero-rating** for Saudi — correct by design (every baqala SKU is 15%); Umm Saud's "zero-rated" items (if any) are for exports/medicine, not food. Make sure onboarding copy doesn't imply food zero-rating exists in KSA | copy/UX |

---

## Part 3 — Gap Analysis: KSA-Specific (Post-PR #151)

> **Previously 6 ⚫/🔴 gaps are now closed.** Remaining open items are narrow.

| Gap | Previous grade | Current grade | Status |
|---|---|---|---|
| ZATCA Phase 2 (full pipeline: XML, sign, QR-TLV, clearance/reporting, PIH, archive) | ⚫ 0% | 🟡 BUILT, gated | Code complete PR #151; sandbox HTTP round-trip outstanding |
| Dead `zatcaEnabled` toggle | ⚫ | 🟢 | Wired to real behavior |
| TLV QR on B2C receipts (live flow) | 🔴 | 🟢 | Built and passed to live receipt flow |
| Full vs simplified invoice type | 🔴 | 🟢 | Distinction exists; reporting vs clearance routing wired |
| Seller VAT validation (3..3) | 🔴 | 🟢 | `^3\d{13}3$` enforced |
| Saudi National Address in settings | 🔴 | 🟢 | Building no, postal, district, city captured |
| OEM/part-number search field | 🔴 | 🟢 | `part_number` attribute shipped |
| PDC module | ⚫ | 🟢 | Full cheque lifecycle built |
| Website ZATCA over-claim | ⚫ | 🟢 | Claim is now accurate |
| **Non-SAR rejection** | (new) | 🟢 | USD invoices rejected at ZATCA boundary |
| **Buyer National Address on B2B** | (new) | 🔴 | Customer address schema field deferred follow-up |
| **EGS-per-register POS UI** | (new) | 🟡 | Schema + onboarding ready; register-CSID picker in POS UI deferred |
| **Z9 garbled exemption fail-closed** | (new) | 🔴 (needs test) | Code claims fail-closed; unverified against umm-saud dataset |
| **Z3 VAT-registered blank-TRN block** | (new) | 🔴 (needs test) | Must enforce on standard invoice; not confirmed |
| **Live sandbox HTTP validation** | (new) | 🔴 | MORNING-BRIEF §2 outstanding |

---

## Part 4 — Verdict & Fix Plan

### Can all three personas go live today?

**Conditionally yes — ZATCA feature is built but not yet sandbox-validated.**

| Persona | Deal-breaker status | Can go live? |
|---|---|---|
| **Abu Khalid** | ZATCA built; PDC built; OEM field built; clearance path built. Gaps: buyer National Address deferred, per-register CSID UI deferred, Z3/Z9 tests pending, sandbox HTTP validation needed | 🟡 After sandbox validation + Z3/Z9 test pass |
| **Umm Saud** | ZATCA built; TLV QR on receipts built; mada tender built; batch/expiry built. Gaps: Z9 fail-closed test, reporting queue stress test | 🟡 After Z9 test pass + reporting stress |
| **Al-Faisaliah** | ZATCA built; credit notes 381 built; USD rejection built; serial/IMEI built. Gaps: Z1-Z3 TRN import validation, live clearance test | 🟡 After TRN import fix + clearance sandbox test |

### Remaining action items (ordered by risk)

**Tier 0 (before any KSA tenant onboards):**
1. Run MORNING-BRIEF §2: sandbox E2E (seller VAT `300000000000003` + National Address → EGS create → OTP `123456` → compliance samples → sale → confirm QR + clearance/reporting logged).
2. Test Z9 (garbled exemption) against `umm-saud/02-products.csv` — must throw `ZatcaMissingExemptionError`.
3. Test Z3 (VAT-registered + blank TRN on standard invoice) — must block, not warn.
4. Test Z12 (clearance rejection handling) — must surface bilingual actionable error.

**Tier 1 (before general KSA availability):**
5. Buyer National Address schema field (customer-address follow-up).
6. EGS-per-register POS UI (register CSID picker).
7. Audit-export UI (download archived signed XML on demand).
8. Clarify Fatoora portal ERAD OTP handoff in onboarding UX for non-technical owners.

**Tier 2 (after go-live, ongoing):**
9. PCSID renewal automation (cert max 5-year, CRL 7-day).
10. Label 20–50 real KSA GCC invoices for Sami eval harness accuracy baseline.

### What must be 100% before any KSA tenant's go-live

- Sandbox clearance and reporting round-trips succeed against `fatoora.zatca.gov.sa` sandbox
- Z9 garbled-exemption fail-closed confirmed by test
- Z3 blank-TRN-on-standard block confirmed by test
- Every B2C receipt carries a valid ZATCA TLV QR that scans with ZATCA's own validator app
- Every B2B standard invoice clears before buyer copy is handed over
- Signed XML is archived and the owner can retrieve it on audit demand
- Counter staff can find any part by OEM number (Abu Khalid) or by mada tender (Umm Saud)

---

## Part 5 — Live Test Plan: KSA Sub-Flows (All 3 Personas)

Same harness/conventions as `kuwait-customer-journey.md` §5.0 — Playwright + Supabase + Neon, fresh tenant per persona, country **SA**, data from `test-data/{persona}/`.

| Layer | Abu Khalid delta | Umm Saud delta | Al-Faisaliah delta |
|---|---|---|---|
| L1 Signup | country=SA, `ZATCA_ENABLED=true` | same | same |
| L2 Onboarding | Enter seller VAT `300000000000003` → accepted. Enter 14-digit VAT → rejected. Enter National Address with missing postal → ZATCA gate blocks. ZATCA toggle → verify written to `tenant_identity.zatcaEnabled=true`. | same | same |
| L3 EGS onboard | Settings→Compliance→ZATCA → create EGS → enter OTP `123456` (sandbox) → expect CCSID issued → run 3 compliance samples → expect PCSID issued | same | same |
| L4 Products | Import `02-products.csv` with garbled taxGroup row (Umm Saud) → expect validation error, not silent accept. Check `part_number` column lands for Abu Khalid. | garbled taxGroup (Z6/Z9) must surface error | track serial IMEI field |
| L5 Customers | Import `03-customers.csv`. Al-Faisaliah: 14-digit TRN → import flag (Z1). TRN not ending 3 → flag (Z2). VAT-registered + blank TRN → flag (Z3). | walk-in cash customers import clean | Z1/Z2/Z3 flagged |
| L6 Opening balances | Abu Khalid TB imbalance ~SAR 890 → go-live readiness gate surfaces imbalance + requires explicit acknowledgement. PDC rows → verify PDC table populated. | TB clean import | TB import + IMEI register |
| L7 First B2C sale | Umm Saud: POS cash/mada sale → inspect receipt for TLV QR (tags 1-9 preferred or 1-5 fallback). Scan QR with ZATCA validator app → expect valid. | TLV QR on every receipt (Z11) | B2C walk-in → QR on receipt |
| L8 First B2B sale | Abu Khalid: B2B SAR 5,000 credit sale to garage with TRN → standard invoice → clearance submitted → `zatca_invoice_documents.status=cleared`. Al-Faisaliah: same for corporate client. | n/a | corporate B2B → clearance (Z12) |
| L9 Credit note | Al-Faisaliah: partial return of phone → credit note 381 → `BillingReference` to original → same subtype. | n/a | credit note chain (Z13) |
| L10 USD rejection | Al-Faisaliah: create invoice with line priced in USD → expect ZATCA boundary rejects, not SAR-converts silently. | n/a | Z10 non-SAR rejection |
| L11 Offline replay | Umm Saud: make 5 B2C sales offline → reconnect → expect reporting queue picks up within 24h. | offline reporting queue (Z16) | offline QR on receipt |
| L12 PDC bounce | Abu Khalid: PDC from `06-pdc-register.csv` with BOUNCE row → verify bounce workflow (reversal JE + alert) (Z18). | n/a | n/a |
| L13 Books | Tax summary 15% split correct across all personas; `zatca_invoice_documents` all have `signedXmlEnc` populated; no orphaned pending documents. | VAT category S/Z/E breakdown correct (Z14) | credit-note VAT reversed correctly |

---

*Sources: KSA-PERSONAS-SPEC.md (2026-06-11), IMPLEMENTATION-PLAN.md + MORNING-BRIEF.md (PR #151, 2026-06-11). Supersedes the 2026-06-08 single-persona audit. ZATCA 0%-built verdicts in earlier versions of this doc are reversed.*
