# KSA Test Personas — Shared Spec (source of truth for all KSA journey/test-data/checklist work)

> Built 2026-06-11. KSA = Saudi Arabia · SAR (2 dp) · VAT **15%** · ZATCA Fatoora mandatory.
> **ZATCA is now BUILT** (PR #151, branch `phase-2/zatca-einvoicing`, gated `ZATCA_ENABLED`+KSA-only).
> All KSA assets must map to the REAL product surface AND adversarially stress the ZATCA pipeline:
> S/Z/E/O VAT category mapping (fail-closed on unknown exemption), non-SAR rejection, simplified(B2C→reporting)
> vs standard(B2B→clearance), buyer-TRN rules, seller VAT `^3\d{13}3$` (15 digits, first+last = 3),
> Saudi National Address completeness, PIH/ICV chain, half-up 2dp rounding, multi-line VAT breakdown.

## Conventions (mirror the Kuwait `yousef/` production persona exactly)
- Folder per persona under `test-data/<slug>/`. Files: `README.md`, `generate.mjs` (seeded mulberry32 PRNG, `node generate.mjs` reproduces byte-identical), numbered CSVs `01-..09-`.
- CSV: UTF-8 **with BOM**, `\n`, `,` delim, `"` quote (doubled escape), header row, numbers at SAR **2 dp**.
- README sections: header block · Onboarding Import Mapping table · File Manifest · **Deliberate Mess** (per file) · Trial Balance Validation (ASCII) · Data Characteristics · Generator Reproducibility · Usage in Import Testing (expected audit findings) · Gotchas for Developers.
- One Windows-1256-encoded customer CSV per persona (Arabic encoding trap), no BOM.

## The 3 KSA personas (mirror Kuwait's Yousef/Noura/Umm-Faisal coverage split)

### 1. `abu-khalid` — Abu Khalid Auto Parts (Riyadh, Al-Olaya) — seed 44 — **B2B-heavy → ZATCA CLEARANCE**
Auto-parts wholesaler+retail. Garages/workshops are VAT-registered B2B buyers → **standard tax invoices → ZATCA clearance (blocking)**. Source/upgrade the legacy `test-data/legacy-raw/p1-abu-khalid-ksa/` raw set into the production convention.
- Stresses: TRN validation, full tax invoice + buyer TRN, PDC cheques (received/issued, BOUNCED), OEM cross-ref part numbers jammed in names (ALL CAPS), Tally 6-column TB that does NOT balance (~SAR 890 gap), credit limits, blacklisted supplier, overseas (UAE/Jordan) suppliers = import VAT/reverse-charge.
- Files: 01-categories, 02-products (Brand, VAT Applicable, taxGroup), 03-customers (TRN, Credit Limit, Credit Days, Balance Type Dr/Cr, VAT Registered), 03b-customer-outstanding-aging (DD/MM/YYYY, running-total col to ignore), 04-suppliers (TRN, Blacklist, Area/Country), 04b-supplier-outstanding-aging, 05-opening-stock (WAC col, AL-OLAYA warehouse, negative qty, WAC=0 traps), 06-pdc-register, 07-trial-balance + 07-...-clean, 08-customers-windows1256.

### 2. `umm-saud` — Umm Saud Baqala (Jeddah) — seed 45 — **B2C-heavy → ZATCA REPORTING + TLV QR**
Neighborhood supermarket/baqala, very high SKU count, walk-in cash/**mada** → **simplified invoices → ZATCA reporting (24h) + TLV QR on every receipt**. FMCG batch/expiry.
- Stresses: simplified-invoice QR (tags 1-5), high-volume reporting queue, mada tender (SA-only), batch/expiry (expired + near-expiry batches), VAT **category mix** — standard-rated 15% groceries, **zero-rated** (e.g. exports/medicine if any), **exempt** edge items, plus an item tagged with an **unknown/garbled exemption** to trigger the fail-closed `ZatcaMissingExemptionError`. Missing barcodes (~10%).
- Files: 01-categories, 02-products (Brand, Track Batch, Shelf Life Days, VAT Applicable, taxGroup incl. Zero Rate/Exempt + 1 garbled), 03-customers (mostly cash/walk-in, few credit tabs), 04-suppliers, 05-opening-stock (Batch No, Expiry Date — 3 expired, 2 near-expiry), 06-sales-history (500+ rows simplified B2C, 2025-12..2026-06), 07-trial-balance, 08-customers-windows1256.

### 3. `al-faisaliah` — Al-Faisaliah Mobiles (Dammam) — seed 46 — **MIXED + serialized + CREDIT NOTES**
Electronics/mobile shop. Mixed: walk-in B2C (simplified) + corporate bulk B2B (standard → clearance). IMEI/serial tracked. **Returns/exchanges → ZATCA credit notes (381)** referencing originals.
- Stresses: serial/IMEI tracking, credit-note (381) with BillingReference to original, B2C↔B2B threshold + buyer-TRN-required-on-standard, **a USD-priced corporate quote** (non-SAR → must be ZATCA-rejected), warranty exchanges, partial returns, price overrides.
- Files: 01-categories, 02-products (Track Serial=Yes, Brand, VAT Applicable, taxGroup), 03-customers (mix B2C + B2B with TRN; 2 fourteen-digit TRNs, 1 TRN not ending in 3, 3 VAT-registered-but-no-TRN), 04-suppliers, 05-opening-stock, 06-imei-register (IMEI 15-digit), 07-sales-history (mix simplified+standard, some credit-note rows), 08-trial-balance, 09-customers-windows1256.

## ZATCA edge-case matrix (spread across the 3 personas — every row must appear in ≥1 dataset)
| # | Edge case | Where | Expected product behavior |
|---|-----------|-------|---------------------------|
| Z1 | TRN 14-digit | al-faisaliah customers | Validation error (need 15) |
| Z2 | TRN not starting/ending with 3 | al-faisaliah customers | Validation error |
| Z3 | VAT-registered B2B buyer with blank TRN | abu-khalid + al-faisaliah | Block/flag on standard invoice (BR-KSA-42/81) |
| Z4 | Seller VAT not 3..3 (in journey, not CSV) | checklist onboarding step | Settings validation rejects |
| Z5 | Saudi National Address missing building no / postal | checklist onboarding | Onboarding completeness gate blocks ZATCA enable |
| Z6 | taxGroup = "Standard Rate 15%" (no parens) — mismatch | umm-saud/abu-khalid products | Must NOT silently map; surface mismatch |
| Z7 | Zero-rated item | umm-saud | Category Z + valid VATEX code/text |
| Z8 | Exempt item | umm-saud | Category E + valid exemption reason |
| Z9 | Garbled/unknown exemption code | umm-saud | **Fail-closed** ZatcaMissingExemptionError (don't ship a wrong code) |
| Z10 | USD-priced sale/quote | al-faisaliah | Non-SAR **rejected** at ZATCA boundary |
| Z11 | B2C simplified sale | umm-saud | Reporting (24h) + TLV QR tags 1-5 (Phase1) / 1-9 (Phase2 signed) |
| Z12 | B2B standard sale > buyer-TRN present | abu-khalid | Clearance (blocking) before buyer copy valid |
| Z13 | Credit note 381 vs original | al-faisaliah | BillingReference + VAT reversal + same subtype as original |
| Z14 | Multi-line invoice, mixed S+Z categories | umm-saud | Correct grouped VAT breakdown, half-up 2dp |
| Z15 | Discount + rounding mid-points | all | Half-up 2dp, doc-level VAT rounded once |
| Z16 | Offline POS sale then reconnect | checklist | Queued reporting replays |
| Z17 | Tally TB doesn't balance | abu-khalid | Reconciliation gate blocks go-live |
| Z18 | PDC bounced | abu-khalid | PDC lifecycle (note: PDC module maturity — flag if gap) |

## Where ZATCA enters the journey (current built reality — PR #151)
1. Onboarding Step 4: country=SA → VAT UI; seller VAT (15-digit 3..3) + Saudi National Address now captured in Settings (tenant_identity); `zatcaEnabled` gate.
2. **Settings → Compliance → ZATCA**: EGS unit create + onboarding wizard (OTP→CCSID→3/6 compliance samples→PCSID). Sandbox OTP static `123456`.
3. POS B2C receipt: TLV QR (server-signed tags 1-9 preferred, else client tags 1-5), KSA-gated.
4. Sales standard (B2B) → clearance (durable queue); simplified (B2C/POS) → reporting (pg-boss 24h + sweeper).
5. Credit/debit notes (381/383) → same flow, BillingReference.
6. Settings: seller VAT validation 3..3; National Address fields (building no 4-digit, postal 5-digit, district, city).
