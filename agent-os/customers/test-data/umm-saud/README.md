# Umm Saud Baqala — Test Data Fixture

## Persona

| Field | Value |
|-------|-------|
| **Store** | Baqala Umm Saud |
| **Location** | Jeddah, Saudi Arabia |
| **Currency** | SAR (2 decimal places) |
| **VAT** | 15% (ZATCA mandatory) |
| **Payment mix** | ~70% Cash, ~30% Mada |
| **Sector** | FMCG / Neighbourhood supermarket (baqala) — B2C-heavy |
| **PRNG seed** | 45 (mulberry32) |

## Onboarding Import Mapping

| CSV file | Import destination | Notes |
|----------|-------------------|-------|
| 01-categories.csv | Settings → Categories | 16 categories incl. Medicine |
| 02-products.csv | Inventory → Products | 708 SKUs, taxGroup column required for ZATCA |
| 03-customers.csv | Sales → Customers | 102 records (2 walk-in + 100 named) |
| 04-suppliers.csv | Purchase → Suppliers | 12 suppliers |
| 05-opening-stock.csv | Inventory → Opening Stock | Batch No + Expiry Date required |
| 06-sales-history.csv | Sales → Import History | Simplified B2C rows, ZATCA Invoice Type = Simplified |
| 07-trial-balance.csv | Accounting → Opening Balances | SAR 2dp |
| 08-customers-windows1256.csv | (encoding-trap file) | Windows-1256, no BOM — importer must detect encoding |

## File Manifest

| File | Data rows | Purpose |
|------|-----------|---------|
| 01-categories.csv | 16 | Grocery categories including Medicine (Z7) |
| 02-products.csv | 708 | FMCG SKUs — Saudi/Gulf brands, ZATCA VAT groups |
| 03-customers.csv | 102 | 2 generic walk-in + 100 named; 8 with credit tabs |
| 04-suppliers.csv | 12 | FMCG distributors with AP balances |
| 05-opening-stock.csv | 708 | Opening inventory; 240 batch-tracked rows |
| 06-sales-history.csv | 550 | B2C simplified invoices Dec 2025–Jun 2026 |
| 07-trial-balance.csv | 8 | Chart of accounts opening balances — balanced ✓ |
| 08-customers-windows1256.csv | 30 | Arabic customer names in Windows-1256 encoding |

## Deliberate Mess (ZATCA + FMCG edge cases)

### Z6 — taxGroup "Standard Rate 15%" (missing parens)
- Every 3rd standard-rated SKU uses `Standard Rate 15%` instead of the canonical `Standard Rate (15%)`.
- 229 SKUs affected.
- **Expected product behaviour:** mapper must surface a mismatch warning; must NOT silently treat it as correct.

### Z7 — Zero-rated items
- 16 SKUs in the Medicine category and qualifying-export Dairy/Snacks use `taxGroup = "Zero Rate"`.
- Examples: Panadol, Strepsils, Oral Rehydration Salts, Almarai UHT Milk Export 1L, Saudi Dates Export Pack 1kg.
- **Expected:** ZATCA category Z, VATEX code applied, 0% VAT on invoice lines.

### Z8 — Exempt items
- 2 SKUs: Al Ahsa Fresh Camel Milk 1L and Fresh Unpasteurized Goat Milk 1L — `taxGroup = "Exempt"`.
- **Expected:** ZATCA category E, exemption reason required.

### Z9 — Garbled/unknown exemption taxGroup (fail-closed trigger)
- **Exactly 5 SKUs** carry a free-text taxGroup that does NOT match any seeded enum:

| SKU | Item Name | taxGroup |
|-----|-----------|---------|
| PRD-1019 | Almarai Mozzarella 200g | `EXEMPT-??` |
| PRD-1042 | Sunbulah Dates 500g | `Zero rated supply` |
| PRD-1067 | Fresh Pita Bread 10pcs | `EXEMPT-??` |
| PRD-1091 | Lentils Red 500g | `Zero rated supply` |
| PRD-1115 | Nivea Body Lotion 400ml | `EXEMPT-??` |

- **Expected:** `ZatcaMissingExemptionError` — fail-closed; do NOT ship a wrong exemption code.

### Z11 — Simplified B2C invoices
- All 550 rows in `06-sales-history.csv` carry `Invoice Type = Simplified`.
- No buyer TRN on any row (walk-in cash/mada customers).
- **Expected:** reporting queue (24h pg-boss sweeper), TLV QR tags 1-5 (Phase 1) or 1-9 (Phase 2 signed).

### Z14 — Mixed S + Z line items in one ticket
- ~40 receipts include at least one standard-rated line and one zero-rated (Medicine) line.
- Both receipt rows share the same `Receipt No`.
- **Expected:** correct grouped VAT breakdown, half-up 2dp rounding, doc-level VAT once.

### FMCG mess
| Issue | Count | Location |
|-------|-------|----------|
| Missing barcodes (~10%) | 70 SKUs | 02-products.csv — every 10th item |
| Expired batches | 3 | 05-opening-stock.csv rows 1-3: expiry 2025-12-05, 2025-12-18, 2025-12-28 |
| Near-expiry batches | 2 | 05-opening-stock.csv rows 4-5: expiry 2026-01-04, 2026-01-06 |
| Duplicate product names | 3 | "Almarai Halloumi 200g" appears twice (deliberate), "Band-Aid Assorted 20pcs" in two categories, "Gillette Fusion Blades 4pcs – (dup)" |
| Trailing whitespace | scattered | Several rows in 02-products.csv (walk-in customer note has trailing space) |
| Windows-1256 encoding | all rows | 08-customers-windows1256.csv — no BOM, Arabic block Win-1256 |

## Trial Balance Validation

```
Account                          Debit (SAR)     Credit (SAR)
Cash in Hand                     18,500.00
Bank - Al Rajhi Current Account  45,200.00
Inventory (Merchandise)         ~430,000+
Sundry Debtors (Tabs)               ~1,000+
Furniture & Fixtures             22,000.00
Prepaid Expenses                  3,500.00
Sundry Creditors (Suppliers)                    139,750.00
Owner Capital                                   ~(balance)
─────────────────────────────────────────────────────────────
TOTAL                            SAR 493,576.50  SAR 493,576.50  ✓
```

- Supplier AP = SAR 139,750.00 (sum of 12 supplier opening balances).
- 8 customers carry credit tabs totalling the Sundry Debtors balance.

## Data Characteristics

- **VAT mix:** 64.4% Standard Rate (15%), 32.3% Standard Rate 15% (Z6 variant), 2.3% Zero Rate, 0.3% Exempt, 0.7% Garbled (Z9).
- **Batch tracking:** 240 of 708 SKUs are perishable (Dairy, Bakery, Frozen, Baby, Canned Goods, Medicine).
- **Sales date range:** 2025-12-01 to 2026-06-08 — spans Ramadan + Eid season.
- **Payment tender:** Mada is ~30% of B2C sales (SA-only tender, Z11 stress).
- **Customers:** ~80% Saudi national names, ~20% expat; 2 generic walk-in buckets for POS.

## Generator Reproducibility

```bash
cd agent-os/product/user-journeys/test-data/umm-saud
node generate.mjs
```

- PRNG: mulberry32, seed `45` — byte-identical output every run.
- All CSV files: UTF-8 with BOM (`EF BB BF`), `\n` line endings, `,` delimiter, `"` quoting.
- Exception: `08-customers-windows1256.csv` — Windows-1256 encoded, no BOM.

## Usage in Import Testing (Expected Audit Findings)

| Finding | Source | Severity |
|---------|--------|----------|
| 70 SKUs with blank Barcode | 02-products.csv | Warning |
| 229 SKUs taxGroup "Standard Rate 15%" mismatch | 02-products.csv | Warning / flag |
| 5 SKUs garbled exemption code (Z9) | 02-products.csv | Error — ZatcaMissingExemptionError |
| 3 stock batches past expiry (Dec 2025) | 05-opening-stock.csv | Error — block movement |
| 2 stock batches near-expiry (≤ Jan 6 2026) | 05-opening-stock.csv | Warning |
| Duplicate product name "Almarai Halloumi 200g" | 02-products.csv | Warning |
| Windows-1256 encoding | 08-customers-windows1256.csv | Error if importer assumes UTF-8 |

## Gotchas for Developers

1. **Z9 items are non-standard-rated**: `VAT Applicable = No` is set for all 5 garbled SKUs. If your ZATCA mapper checks this flag first it may silently skip VAT mapping — but the garbled exemption code must still surface an error on any sale of these items.

2. **Mixed-VAT receipts (Z14)**: The sales CSV contains single `Receipt No` values with both `VAT Rate (%) = 15` and `VAT Rate (%) = 0` rows. Grouping logic must aggregate these correctly before building the ZATCA XML.

3. **Mada tender**: `Payment Method = Mada` is a Saudi-specific tender. It should only appear in KSA-gated flows.

4. **Medicine category is Zero Rate**: All SKUs in `Medicine` category carry `taxGroup = "Zero Rate"`. Importing without the taxGroup column will silently default them to standard-rated — verify the column is mapped.

5. **BOM check**: `08-customers-windows1256.csv` has NO BOM and is NOT UTF-8. An importer that reads it as UTF-8 will produce mojibake for all Arabic names.

6. **Near-expiry date is 2026-01-04/06**: The "base date" for this dataset is 2026-01-01. Near-expiry threshold is typically 7 days → both batches fall inside the warning window.
