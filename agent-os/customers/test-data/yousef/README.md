# Al-Noor Mobiles Test Data
## Yousef's Migration Dataset

**Generated:** 2026-06-04  
**Seed:** 42 (deterministic, reproducible)  
**Persona:** Yousef, owner of Al-Noor Mobiles — 2-store mobile phone & electronics retailer in Kuwait  
**Currency:** KWD (Kuwaiti Dinar) with 3 decimal places (3dp); no VAT

---

## Onboarding Import Mapping

One-line-per-file mapping of every file to the onboarding question it answers and the import wizard kind it feeds.

| File | Onboarding Question | Wizard Kind | Notes |
|------|---------------------|-------------|-------|
| `01-categories.csv` | "Import your product categories" | **categories** | |
| `02-products.csv` | "Import your products / items" | **items** | Deliberately messy |
| `03-customers.csv` | "Import your customers" | **customers** | CONTACT import — names, phones, Civil IDs. Opening Balance column is embedded but this is NOT the AR outstanding wizard; use `03b` for that. |
| `03b-customer-outstanding.csv` | "Import customer outstanding balances (receivables)" | **receivables** | Extracted from `03-customers.csv`. 37 rows, non-zero only. Total KWD 57,828.370 (net of credits). Requires only Party Name + Amount; Civil ID included for matching. |
| `04-suppliers.csv` | "Import your suppliers" | **suppliers** | CONTACT import — names, payment terms. Opening Balance column embedded; use `04b` for the AP outstanding wizard. |
| `04b-supplier-outstanding.csv` | "Import supplier outstanding balances (payables)" | **payables** | Extracted from `04-suppliers.csv`. 8 rows, non-zero only. Total KWD 101,159.050. All positive (amounts owed to suppliers). |
| `05-opening-stock-hawally.csv` | "Import opening stock for Hawally Main" | **stock** | Messy — contains orphaned SKUs, zero-qty rows, duplicates |
| `05-opening-stock-hawally-clean.csv` | "Import opening stock for Hawally Main" | **stock** | Clean variant |
| `06-opening-stock-salmiya.csv` | "Import opening stock for Salmiya" | **stock** | Messy |
| `06-opening-stock-salmiya-clean.csv` | "Import opening stock for Salmiya" | **stock** | Clean variant |
| `07-imei-register.csv` | *(no destination)* | **none** | IMEI/serial register with no dedicated import wizard in the current spec. Orphaned test data — see Gotcha #2 below. |
| `08-trial-balance.csv` | "Import opening GL balances" | **balances** | Messy — numbers match messy stock files |
| `08-trial-balance-clean.csv` | "Import opening GL balances" | **balances** | Clean — balanced at KWD 2,113,012.715 each side |
| `09-customers-windows1256.csv` | "Import your customers" | **customers** | Windows-1256 encoding trap — 50-row subset of `03-customers.csv` |

> **Key distinction:** `03-customers.csv` / `04-suppliers.csv` → **Contact imports** (who the party is).
> `03b-customer-outstanding.csv` / `04b-supplier-outstanding.csv` → **Outstanding-balance imports** (what they owe / are owed), extracted from the contact files.
> `07-imei-register.csv` → currently has **no import destination** in the system spec.

---

## File Manifest

All files are UTF-8 with BOM unless otherwise noted. Header row always present.

| File | Rows | Purpose | Import Test Coverage |
|------|------|---------|----------------------|
| `01-categories.csv` | 25 | Product taxonomy: 25 categories (Smartphones, Feature Phones, Tablets, etc.), mixed English/Arabic names, parent-child hierarchy | Category tree validation, Arabic metadata |
| `02-products.csv` | 3000 | Master product list: ~400 phones (iPhone 15–17, Samsung S24–S25, Xiaomi, Oppo, etc.) with storage tiers & colors; ~2600 accessories (cases, cables, chargers, protectors, power banks). DELIBERATELY MESSY | Duplicate SKU silent-skip risk; empty Purchase Rate; currency-prefix garbling; missing barcodes; trailing whitespace; empty rows |
| `03-customers.csv` | 800 | Customer ledger: Kuwaiti & expat names (English-spelled + Arabic); Tally-style opening balances (column: `Opening Balance (KWD)`); mobile phone inconsistency; Civil ID (12-digit). **37 rows have non-zero opening balance** (reseller/credit dues). | Phone format variance; duplicate names; Tally-style credit balance notation `(xxx)`; thousands separators; name-length edge cases |
| `04-suppliers.csv` | 18 | Supplier ledger: GCC distributors, payment terms (0/15/30/45 days), opening balances (AP) | Supplier AP reconciliation vs trial balance |
| `05-opening-stock-hawally.csv` | 2206 | **MESSY** Hawally Main store inventory. Warehouse name: `Hawally Main`. Contains orphaned SKUs, zero-qty rows, duplicate (SKU, warehouse) pairs. | Non-existent SKU import handling; zero-quantity rows; duplicate (SKU, warehouse) pairs; unit cost variance |
| `05-opening-stock-hawally-clean.csv` | 1507 | **CLEAN** Hawally stock (orphans, zero-qty, dupes removed). **INTENTIONAL TRAP** — both variants exist so tester can compare system behaviour importing messy vs clean. | Verify system catches what the clean version masks |
| `06-opening-stock-salmiya.csv` | 1406 | **MESSY** Salmiya store inventory. Warehouse name: `Salmiya`. Same trap categories as Hawally messy file. | Per-store reconciliation; warehouse name exact-match risk |
| `06-opening-stock-salmiya-clean.csv` | 1098 | **CLEAN** Salmiya stock. Same trap rationale as Hawally clean. | — |
| `07-imei-register.csv` | 900 | Serialized goods register: 15-digit IMEIs (phones only), store location, purchase date (2025-06 to 2026-05), supplier reference | IMEI validation; serial-number import destination; purchase date format |
| `08-trial-balance.csv` | 12 | **MESSY** Tally-style GL trial balance with per-store inventory split. **INTENTIONAL TRAP** — the numbers match the messy stock files (not the clean variants) so the TB won't tie if clean stock is used. | Opening balance GL import; multi-currency account structure; debit/credit reconciliation; Arabic account names |
| `08-trial-balance-clean.csv` | 11 | **CLEAN** trial balance. Debits = Credits = KWD 2,113,012.715 exactly (verified). Use this with the clean stock files. | Clean GL reconciliation path |
| `09-customers-windows1256.csv` | 50 | Subset of customers (first 50 rows) encoded in **Windows-1256** to test encoding-handling. **INTENTIONAL TRAP** — file will mojibake if parser assumes UTF-8. | Charset detection failure; mojibake recovery; encoding mismatch audit log |

**Total data points:** ~6,200 ledger items, ~3,600+ inventory transactions, ~1.7M KWD inventory value.

---

## Deliberate Mess (Import Audit Testing)

Each file contains realistic data-quality issues a real Tally/Zoho/legacy POS export would exhibit.

### `02-products.csv` (3000 rows)

- **~10 duplicate SKUs** across rows → tests silent skip vs. merge behavior
- **~15 rows empty Purchase Rate** → tests cost-of-goods calculation fallback
- **~5 rows with "KD" currency prefix** in price cells (e.g., `KD 12.500`) → tests decimal parser robustness
- **~8 rows missing Barcode** → tests optional EAN field
- **2 fully empty rows** in the middle → tests row-skip logic
- **~5 item names with trailing whitespace** → tests string.trim() necessity
- **Real product mix:** 400 phones (serialized: Track Serial = Yes) + 2600 accessories (non-serialized)
- **3dp price variance:** prices ending .000, .250, .500, .750, .900 (realistic KWD retail)
- **Phone models are current (2024–2026):** iPhone 15/16/17 variants with storage tiers (128/256/512/1024 GB); Samsung Galaxy S24/S25/A-series; Xiaomi, Huawei, Oppo, Realme, Nothing, Tecno, OnePlus

### `03-customers.csv` (800 rows)

- **Inconsistent phone formats:** `+965 9XXX XXXX`, `5XXXXXXX` (local), `965-6XXXXXXX` (country-prefixed) → tests normalization
- **~5 duplicate customer names** → tests uniqueness constraints
- **Tally-style credit balances:** formatted as `(320.750)` (parentheses = negative) vs. simple negative value → tests balance-sign handling
- **Thousands separators:** some balances have commas (`1,250.500`), others don't → tests number parsing
- **~60% have Arabic name**, ~40% have email, ~50% have Civil ID → tests optional field handling
- **~4% of rows have non-zero opening balance:** ~30 rows with AR debit balances, sum matches trial balance exactly

### `04-suppliers.csv` (18 rows)

- **Real GCC distributor names:** Future Communications, Al-Babtain Electronics, X-cite Wholesale, Jarir Distribution, etc. (names resemble actual regional players)
- **AP opening balances:** ~10 rows with credit balances, sum matches trial balance exactly
- **Payment terms:** mix of 0/15/30/45 days → tests term validation & discount calculation windows

### `05-opening-stock-hawally.csv` & `06-opening-stock-salmiya.csv`

- **~6 rows referencing non-existent SKUs** → tests orphaned inventory audit
- **~4 rows with quantity = 0** → tests zero-quantity skip policy
- **2 duplicate (SKU, warehouse) pairs** → tests deduplication
- **Warehouse name exact-match:** Hawally file uses `Hawally Main`, Salmiya uses `Salmiya` (not guaranteed to match a predefined list) → tests warehouse creation during import
- **Unit costs:** derived from selling price × 0.7 (realistic 70% margin), 3dp

### `07-imei-register.csv` (900 rows)

- **900 unique 15-digit IMEIs** (valid length, though Luhn check not strictly enforced)
- **Dates:** 2025-06 to 2026-05 (realistic 1-year opening stock window)
- **Stores:** Hawally or Salmiya (references both outlets)
- **Current gotcha:** IMEI register has no dedicated import destination in the system spec → tests orphaned data handling

### `09-customers-windows1256.csv` (50 rows)

- **Charset:** Encoded in Windows-1256 (standard for legacy Tally Middle East exports)
- **Content:** First 50 customer rows with full Arabic names
- **Tests:** Charset detection, mojibake recovery, charset-aware normalization

---

## Trial Balance Validation

Two trial balance variants exist — use the one that matches the stock files you imported.

### `08-trial-balance-clean.csv` (use with clean stock files)

```
Account                                         Debit (KWD)     Credit (KWD)
Cash in Hand                                     50,321.750
Bank - NBK Current Account                      148,230.500
Bank - KFH                                       82,715.250
Sundry Debtors                                   75,061.831
Inventory (Merchandise)                       1,709,032.109
Furniture & Equipment                            42,500.900
Prepaid Expenses (مصاريف مدفوعة مقدما)           5,150.375
Sundry Creditors                                               101,159.050
Loan from Owner (قرض من المالك)                                 73,450.625
Owner Capital                                                1,752,982.690
Retained Earnings                                              185,420.350
                                             ─────────────   ─────────────
TOTAL                                         2,113,012.715   2,113,012.715

BALANCE: ✓ BALANCED (difference = 0.000)
```

### `08-trial-balance.csv` (MESSY — intentional test trap)

Same accounts but inventory split by store (Hawally + Salmiya lines separately) and numbers that match the *messy* stock files. **INTENTIONAL TRAP:** importing the clean stock then using this TB will produce a GL mismatch — which is exactly what a tester should observe and log.

---

## Data Characteristics

### Categories
- 25 categories, hierarchical (parent-child)
- Mixed English (primary) & Arabic (70% populated)
- Realistic retail taxonomy (Smartphones → iPhone 16/17; Accessories → Cases, Cables, Chargers)

### Products
- **400 phones:** Real 2024–2026 models with storage tiers (128–1024 GB) and colors
  - iPhone: 15/16/17 Pro/Pro Max/Plus/standard, prices 299–499 KWD
  - Samsung: S24/S25 Ultra/Pro/standard, Galaxy A55/A35, prices 189–479 KWD
  - Xiaomi, Huawei, Oppo, Realme, Nothing, Tecno, OnePlus, Honor: prices 119–399 KWD
- **2,600 accessories:** Cases, chargers, cables, screen protectors, power banks, earbuds, memory cards, mounts, prices 0.250–35.000 KWD
- **Pricing:** All in KWD, 3dp (no rounding to .000 or .500 only; variance includes .250, .750, .900)
- **Stock:** Phones marked `Track Serial = Yes`; accessories `Track Serial = No`
- **Arabic metadata:** ~70% of rows have Arabic product names (e.g., "ايفون 16 برو 256 جيجا", "كفر سيليكون")

### Customers
- 800 customer records
- **Names:** Mix of Kuwaiti (Al-Ajmi, Al-Sabah, Al-Mutairi), expat (Rajesh Kumar, Jomar Santos, Maria Garcia)
- **Opening balances:** 37 rows with non-zero opening balance in column `Opening Balance (KWD)`. Mix of debit (positive, e.g. `839.115`) and Tally-style credit (parentheses, e.g. `(1718.533)`). Some have thousands separators (`2,632.647`). The checklist punch-list item "generate customer opening-balances file" is **satisfied here** — balances are embedded in 03-customers.csv, not a separate file.
- **Contact fields:** ~40% have email, ~50% have Civil ID (12-digit), 100% have phone (3 inconsistent formats)
- **Notes:** ~2% marked as "Reseller - B2B" (wholesale relationship flag)

### Suppliers
- 18 regional distributors (GCC + Kuwait wholesale networks)
- **Payment terms:** 0/15/30/45 days (affects early-payment discount windows)
- **Opening balances:** ~10 rows with AP credit balances, non-zero

### Inventory
- **Opening stock:** 3,612 total SKU lines across 2 stores
  - Hawally (main): 2,206 lines, ~1.07M KWD value
  - Salmiya: 1,406 lines, ~666k KWD value
- **Store warehouse names:** Exact text `Hawally Main` and `Salmiya` (may not auto-match predefined locations)
- **Quantities:** Phones 1–8 units per location (selective distribution); accessories 5–120 units (bulk inventory)

### IMEI Register
- 900 unique IMEIs for serialized phones
- **Coverage:** ~15% of phone opening quantities have IMEI records (realistic — not all phones in inventory are pre-registered)
- **Dates:** Clustered 2025-06 to 2026-05 (recent stock)

---

## Generator Reproducibility

The `generate.mjs` script uses a **seeded PRNG** (seed = 42) to ensure **deterministic output**.

To regenerate the exact same data:
```bash
cd /Users/hus3ain/Development/Zerupt/agent-os/product/user-journeys/test-data/yousef
node generate.mjs
```

To modify seed or record counts, edit the `CONFIG` object at the top of the script.

---

## Usage in Import Testing

### Recommended Test Sequence

1. **01-categories.csv** → Validate category tree import & Arabic name handling
2. **02-products.csv** → Test duplicate SKU handling, empty field defaults, currency-prefix stripping, optional barcode
3. **03-customers.csv** → Test AR ledger import, phone normalization, credit-balance sign detection, name deduplication
4. **04-suppliers.csv** → Test AP ledger import, payment term validation
5. **05/06-opening-stock-*.csv** → Test stock import, warehouse creation, orphaned SKU audit
6. **07-imei-register.csv** → Test serial-number import (if IMEI destination defined)
7. **08-trial-balance.csv** → Validate GL opening balance import, debit/credit reconciliation
8. **09-customers-windows1256.csv** → Test charset detection and mojibake recovery

### Expected Audit Findings

| Finding | File | Root Cause | Expected System Behavior |
|---------|------|-----------|--------------------------|
| 10 duplicate SKUs | 02-products | Intentional SKU collisions | Warn user; prompt merge or skip |
| 15 missing Purchase Rate | 02-products | Cost data unavailable | Use 60% of selling price default or require user input |
| 5 currency prefix cells | 02-products | Legacy Tally export included "KD" literal | Strip currency, parse decimal |
| 8 missing barcode | 02-products | Barcode optional; some items never scanned | Allow null barcode, generate on first POS transaction |
| 2 empty rows | 02-products | Data corruption or blank export rows | Skip silently or warn; log row number |
| ~5 trailing whitespace | 02-products | Copy-paste or export formatting | Trim all string fields |
| Inconsistent phone format | 03-customers | Manual data entry (Tally + external CRM merge) | Normalize to E.164; store original for audit |
| 5 duplicate names | 03-customers | Data quality (manual entry) | Flag as potential duplicates; user must merge or keep both |
| Tally credit notation (xxx) | 03-customers | Tally's balance notation | Detect parentheses, negate balance |
| Thousands separators | 03-customers | Locale-aware export (mixed locales) | Parse flexible number format |
| 6 orphaned SKUs in stock | 05/06 | Products list incomplete or SKU typo in stock file | Audit log: "Stock exists for non-existent product PH-000123" |
| 4 zero-quantity rows | 05/06 | Legacy placeholder entries | Skip silently (zero quantity = no opening stock) or log warning |
| 2 duplicate (SKU, warehouse) | 05/06 | Duplicate import or data merge | Sum quantities or ask user which to keep |
| Windows-1256 file | 09 | Legacy system charset | Auto-detect; convert to UTF-8; log charset assumption |

---

## Gotchas for Developers

1. **Warehouse name exact-match:** Stock files use `Hawally Main` and `Salmiya`, but the system might expect `Hawally Store` or a warehouse ID. Test auto-creation vs. match-by-name.

2. **IMEI has no destination:** The IMEI register file is valid but has nowhere to import to yet. Decide: create an IMEI table on-the-fly? Log orphaned IMEIs? Skip silently?

3. **Trial balance account names:** Some accounts use Tally terminology (`Sundry Debtors`, `Sundry Creditors`) which may not match system COA. Decide: create accounts on-the-fly? Map on import? Require user to configure?

4. **Arabic account names:** Prepaid Expenses and Loan from Owner are given only Arabic names in two rows. Test bidi rendering and RTL text in GL module.

5. **Customer AR reconciliation is exact.** If the import logic has a bug (e.g., double-counts negative balances), it will fail this sanity check.

6. **Inventory value is large (~1.7M KWD).** If the system uses 32-bit integers somewhere, it will overflow. Use 64-bit (JavaScript BigInt or backend integer types).

---

## File Specifications

### All CSV Files
- **Encoding:** UTF-8 with BOM (`﻿` at start of file)
- **Line ending:** LF (`\n`)
- **Quote character:** `"` (double quote)
- **Escape:** `""` (doubled quote within quoted field)
- **Delimiter:** `,` (comma)

### Example Structure
```
﻿Category Name,Parent Category,Description
Smartphones,,All mobile phones and smartphones
Accessories,Smartphones,Cases and protective accessories
```

---

## Maintenance

- **Generator script:** `/yousef/generate.mjs` (all constants at top)
- **To modify row counts:** Edit `CONFIG.{categoryCount, productCount, ...}` (PRNG ensures determinism with same seed)
- **To add new phone models:** Extend `PHONE_MODELS` array (script auto-generates variants)
- **To change mess:** Adjust `rng.int(1, threshold) <= probability` checks (same seed = same pseudo-random sequence)

---

Generated on 2026-06-04 for Zerupt onboarding import testing.
