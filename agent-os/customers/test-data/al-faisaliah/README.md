# Al-Faisaliah Mobiles Test Data
## Mixed B2C + B2B Electronics Retailer — Dammam, Saudi Arabia

**Generated:** 2026-06-11  
**Seed:** 46 (deterministic, reproducible)  
**Persona:** Al-Faisaliah Mobiles — walk-in retail (B2C, simplified invoices) + corporate bulk (B2B, standard invoices → ZATCA clearance)  
**Currency:** SAR · 2 decimal places · VAT 15% · ZATCA Fatoora mandatory

---

## Onboarding Import Mapping

| File | Onboarding Question | Wizard Kind | Notes |
|------|---------------------|-------------|-------|
| `01-categories.csv` | "Import your product categories" | **categories** | 18 categories, parent-child hierarchy |
| `02-products.csv` | "Import your products / items" | **items** | Deliberately messy; Track Serial=Yes on phones, Brand + taxGroup columns |
| `03-customers.csv` | "Import your customers" | **customers** | Mix B2C + B2B with TRN; contains Z1/Z2/Z3 edge cases |
| `04-suppliers.csv` | "Import your suppliers" | **suppliers** | All have valid TRN (KSA domestic) |
| `05-opening-stock.csv` | "Import opening stock" | **stock** | Single warehouse: Dammam Main |
| `06-imei-register.csv` | *(serial register — no dedicated wizard)* | **none** | 15-digit IMEIs + deliberate mess (14-digit, duplicate, warranty-exchange notes) |
| `07-sales-history.csv` | "Import historical sales" | **sales** | Mix simplified B2C + standard B2B + 6 credit notes (381) + 1 USD row |
| `08-trial-balance.csv` | "Import opening GL balances" | **balances** | Balanced at SAR 1,983,015.81 each side |
| `09-customers-windows1256.csv` | "Import your customers" | **customers** | Windows-1256 encoding trap (46-row subset) |

---

## File Manifest

All files are UTF-8 with BOM (`﻿` EF BB BF) unless noted. Header row always present.

| File | Rows | Purpose | ZATCA / Mess Coverage |
|------|------|---------|----------------------|
| `01-categories.csv` | 18 | Product taxonomy: 18 categories, parent-child | — |
| `02-products.csv` | 500 | ~120 phones (ALL-CAPS model names, Track Serial=Yes) + ~380 accessories. `Brand`, `VAT Applicable`, `taxGroup` columns present | Dup SKUs, blank Purchase Rate, SAR-prefix mess, trailing whitespace, 1 blank row |
| `03-customers.csv` | 46 | 35 retail B2C + 10 corporate B2B (with TRN) + 1 duplicate walk-in | Z1: 2 customers with 14-digit TRN; Z2: 1 customer TRN not starting/ending with 3; Z3: 3 VAT-Registered=Yes customers with blank TRN |
| `04-suppliers.csv` | 12 | KSA distributors, all with valid 15-digit TRN | — |
| `05-opening-stock.csv` | 284 | Dammam Main warehouse. ~3 zero-qty rows, ~4 invalid SKUs | Non-existent SKU audit; zero-quantity policy |
| `06-imei-register.csv` | 200 | IMEI/serial register. 15-digit valid IMEIs + mess | ~4% 14-digit IMEI (invalid); ~3% duplicate IMEI; ~8% warranty-exchange note rows |
| `07-sales-history.csv` | 139 | Mixed B2C/B2B sales + credit notes + USD row | Z10: 1 USD row (INV-01139); Z12: 36 B2B standard rows with valid buyer TRN; Z13: 6 credit-note rows (Document Type=381) referencing original invoices; ~5% price-override rows |
| `08-trial-balance.csv` | 12 | SAR trial balance. Arabic account names. Balanced | Balanced ✓ at SAR 1,983,015.81 each side |
| `09-customers-windows1256.csv` | 46 | Windows-1256 encoding trap — no BOM | Charset detection; mojibake on UTF-8 parse |

---

## Deliberate Mess (Import Audit Testing)

### `02-products.csv` (500 rows)
- **~5 duplicate SKUs** across phone rows → silent-skip vs merge risk
- **~2 rows with blank Purchase Rate** → cost fallback behavior
- **~3 rows with "SAR " prefix** in price cells (e.g. `SAR 72.50`) → decimal parser robustness
- **~3 item names with trailing whitespace** → tests string.trim()
- **1 blank row** in the middle → row-skip logic
- **ALL-CAPS model names** (e.g. `IPHONE 16 PRO MAX`) — realistic from Samsung/Apple GCC exports
- All phone products have `Track Serial = Yes`, `taxGroup = Standard Rate (15%)`

### `03-customers.csv` (46 rows)
- **Z1 – 2 customers with 14-digit TRN** (need 15 for ZATCA):
  - `Dammam Tech Solutions Co.` TRN = `05909138557790` (14 digits)
  - `Eastern Province IT Ltd` TRN = `19019205049866` (14 digits)
- **Z2 – 1 customer with TRN not starting or ending with 3**:
  - `Al-Khobar Trading & Telecom` TRN = `411032674781805` (starts=4, ends=5)
- **Z3 – 3 customers VAT Registered=Yes but blank TRN**:
  - `Qatif Business Solutions`, `Jubail Industrial Supplies`, `Aramco Contractor Services`
- Tally-style credit balances: `(1250.00)` parentheses notation on a few retail customers
- Inconsistent Saudi phone formats: `05XXXXXXXX`, `+966 5X XXX XXXX`, `966-5XXXXXXXX`
- 1 duplicate Walk-In Customer row (intentional)

### `04-suppliers.csv` (12 rows)
- All have valid 15-digit TRN (clean — contrast with customer Z1/Z2/Z3 cases)
- Payment terms: 0/30/45/60 days

### `05-opening-stock.csv` (284 rows)
- **~3 zero-quantity rows** → zero-qty skip policy
- **~4 invalid SKU rows** (e.g. `INVALID-45821`) → orphaned inventory audit
- Warehouse name: exactly `Dammam Main` (must match or auto-create)

### `06-imei-register.csv` (200 rows)
- **~8 rows with 14-digit IMEI** (invalid, should fail IMEI validation)
- **~6 rows with duplicate IMEI** (already-registered serial number)
- **~16 rows with warranty-exchange notes** (text: `WARRANTY EXCHANGE — replaced <old IMEI>`)
- No dedicated import destination in current spec → orphaned serial data

### `07-sales-history.csv` (139 rows)
- **Z10 row — `INV-01139`** (`Currency=USD`, Standard Tax Invoice, qty=10, unit price USD 1349.99):
  - Notes: `Z10 — USD corporate quote; ZATCA must reject non-SAR invoice`
  - Expected: ZATCA pipeline rejects at currency boundary
- **Z12 — 36 B2B standard rows** with valid 15-digit buyer TRN starting+ending with 3:
  - `Document Type = 380`, `Invoice Type = Standard Tax Invoice`
  - Expected: ZATCA clearance path (blocking; buyer copy only valid post-clearance)
- **Z13 — 6 credit-note rows** (`Document Type = 381`):
  - Invoice numbers `CN-01133` through `CN-01138`
  - `Original Invoice No` column references the source `INV-XXXXX`
  - `Qty` is negative; `Taxable Amt`, `VAT`, `Total` are negative
  - Expected: ZATCA BillingReference to original + VAT reversal, same subtype as original
- **~5% price-override rows** flagged `Notes = PRICE OVERRIDE — manager approved`
- Mix of `Simplified Tax Invoice` (B2C) and `Standard Tax Invoice` (B2B)

### `08-trial-balance.csv` (12 rows)
- Balanced at SAR 1,983,015.81 each side
- Arabic account names: `مدينون متنوعون`, `دائنون متنوعون`, `ضريبة القيمة المضافة`, `إيجار مدفوع مقدماً`
- Includes VAT Payable account (KSA-specific)

### `09-customers-windows1256.csv` (46 rows)
- **No BOM** (Windows-1256 does not use UTF-8 BOM)
- All 46 customer rows re-encoded from UTF-8 → WINDOWS-1256 via `iconv`
- Arabic names will mojibake if parser assumes UTF-8

---

## Trial Balance Validation

```
Account                                       Debit (SAR)     Credit (SAR)
Cash in Hand                                   28,450.00
Bank - Al Rajhi Current                       185,300.00
Bank - SNB                                     94,750.00
Sundry Debtors (مدينون متنوعون)               377,779.00
Inventory - Dammam Main                     1,276,286.81
Furniture & Fixtures                           18,500.00
Prepaid Rent (إيجار مدفوع مقدماً)             12,000.00       (credit side)
Sundry Creditors (دائنون متنوعون)                              <AP sum>
VAT Payable (ضريبة القيمة المضافة)                              8,350.00
Loan from Owner (قرض من الشريك)                               45,000.00
Owner Capital                                                 <plug>
Retained Earnings                                             95,420.00
                                            ─────────────   ─────────────
TOTAL                                       1,983,015.81    1,983,015.81

BALANCE: ✓ BALANCED (difference = 0.00)
```

---

## ZATCA Edge-Case Summary

| ID | Edge Case | Exact Location |
|----|-----------|----------------|
| Z1 | 14-digit TRN (invalid — need 15) | `03-customers.csv` rows: `Dammam Tech Solutions Co.` (TRN=`05909138557790`) and `Eastern Province IT Ltd` (TRN=`19019205049866`) |
| Z2 | TRN not starting or ending with 3 | `03-customers.csv` row: `Al-Khobar Trading & Telecom` (TRN=`411032674781805`, starts=`4`, ends=`5`) |
| Z3 | VAT Registered=Yes, blank TRN | `03-customers.csv` rows: `Qatif Business Solutions`, `Jubail Industrial Supplies`, `Aramco Contractor Services` |
| Z10 | Non-SAR (USD) sale | `07-sales-history.csv` row `INV-01139` (`Currency=USD`) |
| Z12 | B2B standard sale with valid buyer TRN | `07-sales-history.csv` 36 rows (`Document Type=380`, 15-digit TRN starting+ending 3) |
| Z13 | Credit note (381) with BillingReference | `07-sales-history.csv` rows `CN-01133`–`CN-01138` (`Document Type=381`, `Original Invoice No` populated) |

---

## Data Characteristics

### Products (500 rows)
- ~120 phones (iPhone 15/16 Pro/Pro Max, Samsung S25 Ultra/+/standard, Galaxy A55/A35, Xiaomi Redmi, Huawei Mate 60, Oppo Find X8, OnePlus 13) with storage variants (128/256/512 GB) and 5 colors
- ALL-CAPS model names (real GCC export convention)
- ~380 accessories (cases, cables, chargers, power banks, earbuds, screen protectors, car mounts, wireless chargers)
- Pricing SAR 2dp; phones SAR 1,099–5,499 depending on model/storage

### Customers (46 rows)
- 35 retail B2C (Saudi nationals + expats + walk-in/cash)
- 10 corporate B2B (with TRN — of which 2 have 14-digit Z1, 1 has Z2, 3 have Z3 blank TRN)
- 1 duplicate walk-in row (mess)
- 7 B2B customers have valid 15-digit TRN (clearance path, Z12)

### Suppliers (12 rows)
- All major KSA distributors (Jarir, Extra, Axiom, Samsung, Apple, Huawei)
- All have valid 15-digit TRN
- Payment terms 0/30/45/60 days

### IMEI Register (200 rows)
- 15-digit valid IMEIs (majority)
- ~8 rows with 14-digit IMEI (invalid length)
- ~6 rows with duplicate IMEI (already used)
- ~16 rows with warranty-exchange notes

### Sales History (139 rows)
- Date range: ~2025-12 to 2026-05
- 36 B2B standard (clearance → Z12), ~97 B2C simplified, 6 credit notes (Z13), 1 USD row (Z10)

---

## Generator Reproducibility

The `generate.mjs` script uses a seeded PRNG (seed=46) for deterministic output.

```bash
cd /Users/hus3ain/Development/Zerupt/agent-os/product/user-journeys/test-data/al-faisaliah
node generate.mjs
```

Output is byte-identical on re-runs. Modify `CONFIG` at the top to change counts; same seed = same pseudo-random sequence.

---

## Usage in Import Testing

### Recommended Test Sequence

1. `01-categories.csv` → Category tree + Arabic name handling
2. `02-products.csv` → Duplicate SKU, blank cost, SAR-prefix strip, Track Serial=Yes, taxGroup mapping
3. `03-customers.csv` → TRN validation (Z1/Z2/Z3), VAT-registered flag, credit balance notation
4. `04-suppliers.csv` → Supplier TRN, payment terms
5. `05-opening-stock.csv` → Invalid SKU audit, zero-qty skip, warehouse creation
6. `06-imei-register.csv` → IMEI length validation, duplicate detection, warranty rows
7. `07-sales-history.csv` → Invoice type routing, credit-note 381, USD rejection (Z10), buyer TRN validation
8. `08-trial-balance.csv` → GL import, Arabic account names, VAT Payable account
9. `09-customers-windows1256.csv` → Charset detection, mojibake recovery

### Expected Audit Findings

| Finding | File | Root Cause | Expected System Behavior |
|---------|------|-----------|--------------------------|
| 2 customers with 14-digit TRN | 03-customers | Z1 — invalid TRN length | Validation error: TRN must be exactly 15 digits |
| 1 customer TRN not 3..3 | 03-customers | Z2 — ZATCA format violation | Validation error: TRN must start and end with 3 |
| 3 VAT-Registered=Yes with blank TRN | 03-customers | Z3 — missing TRN | Block / flag on any standard invoice for these customers (BR-KSA-42/81) |
| 1 USD-currency invoice | 07-sales-history | Z10 — non-SAR currency | ZATCA pipeline rejects; flag currency mismatch |
| 6 credit-note rows (381) | 07-sales-history | Z13 — returns | ZATCA BillingReference + VAT reversal; Qty/Totals negative |
| ~5 duplicate SKUs | 02-products | Legacy export overlap | Warn user; prompt merge or skip |
| ~3 "SAR" prefix price cells | 02-products | Legacy export formatting | Strip prefix; parse decimal |
| ~4 invalid SKUs in stock | 05-opening-stock | Orphaned inventory | Audit log: "Stock for non-existent product" |
| ~8 rows with 14-digit IMEI | 06-imei-register | Truncated IMEI | Reject or flag; IMEI must be 15 digits |
| ~6 duplicate IMEIs | 06-imei-register | Serial re-use (mess) | Flag duplicate serial number |
| Windows-1256 file | 09 | Legacy charset | Auto-detect; convert; log assumption |

---

## Gotchas for Developers

1. **TRN validation is 3-level:** length (15), format (all digits), and 3..3 start/end rule. Z1 fails level 1, Z2 fails level 3 — separate code paths.
2. **Z3 creates a hard ZATCA block** — any attempt to raise a Standard Tax Invoice for `Qatif Business Solutions`, `Jubail Industrial Supplies`, or `Aramco Contractor Services` must be prevented (BR-KSA-42: buyer TRN required on B2B > SAR 1,000).
3. **Credit notes (Z13) must carry `Original Invoice No`** → `BillingReference/ID` in the UBL XML. If this reference is missing, ZATCA clearance/reporting will fail.
4. **USD row (Z10)** looks like a valid invoice in every other field. The `Currency` column is the only signal — test that the currency gate fires before any ZATCA submission attempt.
5. **ALL-CAPS model names** will cause mis-match if the import tries to do case-sensitive SKU lookup — ensure case-insensitive matching or normalize on import.
6. **Warehouse name exact-match:** stock file uses `Dammam Main` — may or may not match a predefined warehouse name in the tenant.
7. **IMEI register is currently orphaned** (no dedicated import destination in spec) — decide: create serial entries on-the-fly, or log as unimported orphans?
8. **VAT Payable in trial balance** — some GL import systems don't know what to do with a VAT-specific account; verify it maps to the VAT control ledger, not a generic payable.

---

Generated 2026-06-11 for Zerupt KSA onboarding import + ZATCA pipeline testing.
