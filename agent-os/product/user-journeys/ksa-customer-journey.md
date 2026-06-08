# KSA Customer Journey — Abu Khalid, 100% Flow Audit

**Audited:** 2026-06-08, on `main` (post PR #138) · **Companion docs:** `me-customer-journeys.md` (P1), `kuwait-customer-journey.md` (Yousef) + `uae-customer-journey.md` (Mariam) — country-independent findings inherited, not repeated. **Test data:** `test-data/legacy-raw/p1-abu-khalid-ksa/` (Tally-flavored: items, customers, suppliers, TB, opening stock, AR/AP aging, PDC register).
**Purpose:** map 100% of a Saudi auto-parts trader's flow, fears, gaps; feed the fix plan. Grading: 🟢 works · 🟡 works-but-risky · 🔴 missing/wrong · ⚫ trust-killer.

**The one-line difference:** Yousef fears *data loss*, Mariam fears *the taxman looking*. Abu Khalid fears *the taxman has already enforced* — ZATCA Phase 2 (FATOORA) is mandatory at his revenue tier, with SAR 50k fines per violation. He is **buying compliance certainty**. Every gap is weighted by "does this invoice pass ZATCA clearance?"

---

## Part 1 — Who Abu Khalid Is (Deep Profile)

| Attribute | Detail |
|---|---|
| Business | Single-outlet auto-parts retailer (Japanese/Korean parts + oils), Al-Olaya industrial district, Riyadh |
| Size | 1 outlet · 4 staff (owner + 2 Pakistani counter staff + driver) · 8,000–12,000 SKUs · ~400 txns/month · SAR 180k–300k/month |
| Money | SAR = 2dp (hardcoded formatters coincidentally safe) |
| Tax reality | **15% VAT · ZATCA Phase 2 FATOORA e-invoicing MANDATORY** (above his revenue threshold) — signed XML, cryptographic stamp, TLV QR, clearance (B2B) / reporting (B2C) to fatoora.zatca.gov.sa, 5-yr archival |
| Stack | Tally Prime + legacy FoxPro-era POS + Excel POs + WhatsApp + physical stock cards |
| Sales mix | Walk-in **cash B2C (simplified invoices)** + **B2B credit to garages (full tax invoices, PDCs)** |
| Language | Fully Arabic owner; Urdu-speaking counter staff; Arabic invoices legally required |

### His Psychology
**Trigger:** ZATCA enforcement wave hit his tier; accountant quoted SAR 12,000 to retrofit his old system; a prior audit scared him. He googled "نظام محاسبة متوافق مع الزكاة" — he now buys compliance, not features.
**Why switch:** SaaS at ~SAR 400/month that does FATOORA out of the box beats a SAR 12k retrofit.

**Fears, ranked:**
1. **"Will my invoices pass ZATCA?"** — every B2C receipt needs a valid TLV QR; every B2B invoice needs clearance. A non-compliant invoice = fine.
2. **"Will the audit find a gap?"** — he's been audited; he wants the cryptographic trail.
3. **"Can my Pakistani staff ring up a sale fast?"** — OEM part-number lookup, Arabic/English POS.
4. **"Will my garage PDCs be tracked?"** — B2B credit + post-dated cheques are his cash-flow lifeblood.
5. **"Will migration lose my Tally history?"**

**Deal-breakers (P1):** no Arabic UI · no offline POS (industrial-area internet drops) · no OEM part-number search · multi-week migration · no Arabic/Urdu phone support · **no ZATCA compliance**.
**Trust factors:** ZATCA certification badge, demo with a real KSA tax invoice (Arabic header + QR), Riyadh auto-parts reference, trial with his own imported data.

---

## Part 2 — The 100% Flow, Stage by Stage

> Shared findings (returns 🔴, transfers 🔴, balance sheet/AP aging 🔴, guidance gaps G1–G7, import undo/encoding, placeholder copy) = identical to Kuwait/UAE docs. UAE-specific VAT findings (TRN validation, full vs simplified invoice, tax-group import silent-exempt) also apply to him — see `uae-customer-journey.md`. Below: KSA-specific.

### Stage 0 — Discovery → Signup
Website claims "ZATCA e-invoicing … built in" (`apps/website/messages/en/home.json:101`). For Abu Khalid this is the headline promise — and per Stage 9 it is **materially false**. ⚫ This over-claim is the single biggest trust/legal risk: he buys *because* of it.

### Stage 1 — Onboarding Wizard

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 1.1 | 🟢 | SA config correct: SAR, 2dp, vat; `VAT-SA-15` 15% + zero-rated/exempt/import-RC seeded | `countries.ts:51-57`, `tax-config.seed.ts:68-113` |
| 1.2 | ⚫ | **ZATCA toggle is a DEAD TOGGLE.** Step 4 shows a SA-only `zatcaEnabled` switch; value saved to wizard state + review summary, then **never read by any materializer** — never stored in `tenantIdentity`, never queried at runtime. Enabling it does literally nothing | `step4-tax.tsx:295-316`, `step4-transform.ts:168`; zero materializer hits |
| 1.3 | 🔴 | Saudi VAT number not validated (must be 15 digits starting 3); `taxNumber` is `min(1).max(50)`, any charset | `customers.dto.ts:23` |

### Stage 2 — Data Migration
Mechanics shared. KSA note: PDC register (`08-pdc-register.csv`) has **no import destination** — there is no PDC table (see 8.x). His Tally part numbers / OEM cross-references (see 7.x) have no field to land in. 🔴

### Stage 6 — Inventory: OEM Part-Number Search

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 6.1 | 🔴 | **No OEM/part-number search.** Schema has multi-barcode (`item_barcodes`) but **no `part_number`/`oem_code`/`cross_reference`/`alternate_sku` column**. POS search filters `name` substring + `sku` prefix only — `nameAlt` (Arabic) isn't even in the filter. Cashier cannot find "Camry oil filter" by 90915-YZZD4 | `inventory-items.ts:228-272`, `catalog-repo.ts:131-144` |
| 6.2 | 🟡 | Arabic POS search blind: offline catalog filter omits `nameAlt` — Arabic-typing staff can't find items by Arabic name | `catalog-repo.ts:143` |

### Stage 7 — Selling: the ZATCA till

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 7.1 | 🟢 | **Offline POS is genuinely built** (Dexie/IndexedDB catalog, sale/shift queue, idempotent sync, e2e). His industrial-area dropout fear is largely answered | `pos/offline/db.ts`, `pos-sync.service.ts` |
| 7.2 | 🟡 | No service worker/PWA shell cache — tab close while offline (power cut) needs network to reload the app shell | (absent) |
| 7.3 | ⚫ | **QR on receipts is a placeholder, not ZATCA TLV.** POS `qrDataUrl` carries the digital-receipt URL, not TLV (seller, VAT#, timestamp, total, VAT). And `qrDataUrl` is **never passed from the live sale flow** — only in tests/preview. Tax-invoice A4 renders a dashed "qr.placeholder" box | `qr.ts:12`, `receipt-document.tsx:55,572`, `tax-document.tsx:316-319`, `local-sale-receipt.tsx:89` |
| 7.4 | 🔴 | **No full vs simplified invoice distinction** — no `invoiceType` on `pos_transactions`/`sales_invoices`; no SAR 1,000 threshold branch. ZATCA needs B2C simplified vs B2B full separation | schema |
| 7.5 | 🟡 | Dot-matrix ESC/P printer can't render Arabic (passes through as-is, garbled) — many auto-parts shops use impact printers | `escp.ts:7-9` |
| 7.6 | 🔴 | Shared: returns, cash pay-in/out, void PIN | Kuwait doc |

### Stage 8 — B2B Credit & PDCs

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 8.1 | 🟢 | Credit sales exist: `sales_invoices` has `dueDate`, `balance`, `paymentTermsDays`; receipt/allocation flow built | `sales.ts:92-94` |
| 8.2 | 🔴 | **No credit limit** on customers — garages overspend silently | no `credit_limit` column |
| 8.3 | 🔴 | **PDC is COA-scaffolded only.** Accounts `1134 PDC Receivable`/`2145 PDC Payable` + cheque-event JE mappings exist, but **no `post_dated_cheques` table, no cheque API, no UI, no maturity/bounce workflow**; `salesReceiptPaymentMethod` defers cheque entirely | `coa-pdc-accounts.ts`, `account-mapping-defaults.ts:234-236`, `enums.ts:413` |

### Stage 9 — Money Truth & the ZATCA reality

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 9.1 | ⚫ | **Zero ZATCA Phase 2 implementation.** Missing entirely: cryptographic stamp (ECDSA secp256k1/RSA-PSS), CSID onboarding, UBL 2.1 KSA XML, PIH hash chain, per-invoice UUID, TLV QR, clearance/reporting API to fatoora.zatca.gov.sa, 5-yr signed-XML archive. The product cannot make him compliant — which is the only reason he bought | codebase-wide search |
| 9.2 | 🟢 | VAT plumbing real (15% codes, COA overlay, per-line rounding, tax-summary) — same engine as UAE | `tax-config.seed.ts:68-113` |
| 9.3 | 🔴 | Shared: no balance sheet, AP aging, per-branch P&L (single outlet so less acute), expense entry | Kuwait doc Stage 9 |

### Stage 10 — The Audit
What ZATCA expects: cleared B2B invoices, reported B2C with valid TLV QR, signed XML on demand. What exists: none of it. **He cannot operate compliantly for a single day.** This is the most severe verdict of the five personas — for the others the gaps degrade the experience; for him the core promise is absent.

---

## Part 3 — Gap Analysis: KSA-Specific

| Gap | Severity | Shape of fix |
|---|---|---|
| ZATCA Phase 2 FATOORA (XML, stamp, QR-TLV, clearance/reporting, PIH, archive) | ⚫ | Largest single build in the GCC roadmap — dedicated e-invoicing module + ZATCA portal integration; until then **do not sell to SA on a compliance promise** |
| Dead `zatcaEnabled` toggle | ⚫ | Either wire it to real behavior or remove it (selling a toggle that does nothing is the trust killer in miniature) |
| TLV QR on simplified invoices | 🔴 | Generate ZATCA TLV (5 tags) → base64 → QR; pass through to live receipt flow |
| Full vs simplified invoice type | 🔴 | `invoiceType` + SAR 1,000 threshold branch |
| OEM/part-number search | 🔴 | `partNumber`/`oemCode` field + barcode-alternate; include in POS + offline search; add `nameAlt` to search filter |
| PDC module | 🔴 | `post_dated_cheques` table, register UI, maturity tracking, bounce workflow (shared with Bahrain) |
| Customer credit limit | 🔴 | `credit_limit` + enforcement at sale |
| Saudi VAT-number validation | 🔴 | `^3\d{14}$` per-country regex |
| Dot-matrix Arabic | 🟡 | Arabic glyph handling for ESC/P, or steer to thermal |
| Website ZATCA over-claim | ⚫ | Scope the claim to reality immediately |

---

## Part 4 — Verdict & Fix Plan

### Can Abu Khalid go live today?
**No — and he is the least servable of the five.** His sole purchase reason (ZATCA compliance) is 0% built, and a SA-only toggle implies it exists.

| Deal-breaker | Status |
|---|---|
| ZATCA compliance | ⚫ 0% — and falsely implied present |
| Arabic UI | 🟡 app RTL works; POS Arabic search + dot-matrix Arabic broken |
| Offline POS | 🟢 built (minus service-worker shell) |
| OEM part-number search | 🔴 0% |
| PDC / B2B credit | 🟡 credit yes; PDC + credit limit no |
| Fast migration | 🟡 importer strong; PDC/part-number have nowhere to land |

### Tier 0 (days)
1. Fix/remove the dead ZATCA toggle; correct the website claim. **Stop implying SA compliance until it ships.**
2. SA VAT-number regex; add `nameAlt` to POS search.

### Tier 1 — KSA go-live blockers
3. ZATCA Phase 2 module (the big one — own roadmap track)
4. TLV QR + full/simplified invoice type, wired to the live flow
5. OEM/part-number field + search
6. PDC module + credit limit (shared with Bahrain)
7. Shared Tier 1: returns, cash mgmt, void PIN

### What must be 100% before HIS go-live
- Every B2C receipt carries a valid ZATCA TLV QR; every B2B invoice clears
- Signed XML archived and producible on audit
- Counter staff find any part by OEM number in Arabic or English
- Garage PDCs tracked to maturity with bounce handling

---

## Part 5 — Live Test Plan: KSA Sub-Flows
Same harness/conventions as `kuwait-customer-journey.md` §5.0/§5.3 — headed Playwright + Supabase + Neon, fresh tenant `abukhalid.test+<n>@zerupt-e2e.com`, country **SA**, data from `test-data/legacy-raw/p1-abu-khalid-ksa/`.

| Layer | KSA delta |
|---|---|
| L2 Onboarding | Enable the ZATCA toggle → verify in DB it changes **nothing** (confirm dead toggle). Enter a 10-digit VAT number → expect wrongly accepted. |
| L3 Products | Import `01-items.csv` with OEM/part-number column → verify it has nowhere to land; search a part number at POS → expect no result. |
| L5 Opening balances | `08-pdc-register.csv` → verify no PDC destination; `04-trial-balance.csv` PDC accounts present but empty. |
| L7 First sale | B2C cash sale → inspect receipt for QR: expect placeholder/none, not TLV. B2B SAR 5,000 credit sale → no full-invoice/UUID/stamp. Screenshot both. |
| L8 Books | Tax summary 15% split OK; confirm zero ZATCA artifacts anywhere (no XML, no clearance log). |

---

*Sources: parallel audit (2026-06-08) on `main` — ZATCA/KSA invoicing, OEM search, PDC/credit, Arabic/offline. Shared findings inherited from Kuwait (6-agent) + UAE (3-agent) audits. File:line inline.*
