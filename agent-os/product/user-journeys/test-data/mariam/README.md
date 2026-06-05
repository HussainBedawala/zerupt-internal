# Mariam's Abaya Boutique Test Data
## UAE Migration Dataset

**Generated:** 2026-06-05  
**Seed:** 43 (deterministic, reproducible)  
**Persona:** Mariam, owner of an abaya & modest-fashion boutique — Dubai Jumeirah + Sharjah Al Majaz  
**Currency:** AED (UAE Dirham) with 2 decimal places; VAT-registered at 5%  
**System:** Migrating from Zoho Books + standalone POS + Google Sheets (custom orders)

---

## File Manifest

All files are UTF-8 with BOM unless noted. Header row always present.

| File | Rows | Purpose | Import Test Coverage |
|------|------|---------|----------------------|
| `01-categories.csv` | 15 | Fashion taxonomy: 8 top-level (Abayas, Kaftans, Jalabiyas, Modest Tops, Hijabs, Underscarves, Accessories, Fabrics) + 7 sub-categories (Classic/Embroidered/Butterfly Abayas, Occasion/Casual Kaftans, Brooches, Belts) | Category parent-child hierarchy, Arabic names |
| `02-products.csv` | 3,423 | SKUs: ~120 abaya/kaftan styles × 4-6 colors × 6 sizes (e.g. "Classic Crepe Abaya - Black / 54", SKU `ABY-CCR-BLK-54`) + ~230 accessory variants (shaylas, hijabs, underscarves, brooches, belts, fabrics). 3,411 unique SKUs. DELIBERATELY MESSY. Includes `taxGroup` column. | Duplicate SKU handling; empty Purchase Rate; "AED " currency prefix; 2 empty rows; trailing whitespace; **10 rows with taxGroup="Standard Rate 5%" (no parens) to trigger finding 2.3**; Zero Rate items |
| `03-customers.csv` | 600 | Customer ledger: Emirati + expat names (Arabic + English); 25 B2B with TRN (15-digit); 2 with wrong-length 14-digit TRN; ~20 with AR opening balances; inconsistent UAE phone formats | TRN validation (finding 1.3); phone format normalization; B2B flag; AR reconciliation |
| `04-suppliers.csv` | 15 | Supplier ledger: 8 UAE distributors (with TRN) + Turkey, India, Morocco, KSA overseas suppliers (no TRN — RCM relevance); ~8 with AP opening balances | AP reconciliation vs trial balance; TRN presence by country; payment terms |
| `05-opening-stock-dubai.csv` | 2,408 | Dubai Jumeirah store inventory: 2,393 unique valid SKU rows + 2 deliberate dup (SKU,warehouse) rows + 6 orphan rows + 4 zero-qty rows. Warehouse: `Dubai - Jumeirah` | One-row-per-(SKU,warehouse) rule; orphan SKU handling; zero-qty rows; deliberate dup pairs; warehouse name match |
| `06-opening-stock-sharjah.csv` | 1,607 | Sharjah Al Majaz store inventory: 1,599 unique valid SKU rows + 2 deliberate dup rows + 6 orphan rows + 4 zero-qty rows. Warehouse: `Sharjah - Al Majaz` | Per-emirate stock; reconciliation split by location |
| `07-custom-orders.csv` | 40 | Made-to-order records: customer, style description, measurements note, fabric/color, deposit paid, balance due, delivery date, status. **NO import destination in current system.** | Triggers finding 6.3 (no MTO/deposit workflow); tests orphaned-data handling |
| `08-trial-balance.csv` | 12 | Zoho-style GL opening trial balance: Cash, Emirates NBD, ADIB, AR, Inventory-Dubai, Inventory-Sharjah, Furniture, Prepaid Rent; credits: AP, **VAT Payable AED 12,345.67** (journey doc L5), Loan, Owner Capital. **BALANCED exactly.** | Opening balance GL import; VAT Payable continuity (finding 2.4/2.5); per-emirate inventory split |
| `09-customers-windows1256.csv` | 50 | First 50 customer rows encoded in **Windows-1256** (legacy Zoho/accounting export standard) — no BOM | Charset detection; mojibake recovery |

**Total data points:** ~4,015 inventory lines (2,408 Dubai + 1,607 Sharjah), ~600 customer + 15 supplier ledgers, AED 23.3M inventory value (3,411 unique product SKUs).

---

## Deliberate Mess (Import Audit Testing)

### `02-products.csv` (3,423 rows — 3,411 unique SKUs)

- **~10 duplicate SKUs** across rows → silent-skip or merge risk
- **~15 rows empty Purchase Rate** → cost fallback
- **~5 rows with "AED " currency prefix** (e.g. `AED 185.00`) → decimal parser test
- **2 fully empty rows** in middle → row-skip logic
- **~5 item names with trailing whitespace** → string.trim() necessity
- **EXACTLY 10 rows with `taxGroup="Standard Rate 5%"` (no parentheses)** → these don't string-match the seeded group name `"Standard Rate (5%)"`, triggering finding 2.3 (silent null = item sells VAT-exempt)
- **Zero Rate items:** Fabrics and Underscarves categories

### `03-customers.csv` (600 rows)

- **Rows 1–25: B2B companies** with 15-digit TRN (valid)
- **Row 9 ("Arabesque Fashion LLC") and Row 21 ("Bur Dubai Fashion House"):** TRN is 14 digits — intentionally wrong to test finding 1.3 (TRN validation)
- **Inconsistent phone formats:** `+971 5X XXX XXXX`, `05XXXXXXXXX`, `971-5XXXXXXXXX`
- **~20 customers with non-zero AR opening balance;** some with Zoho parenthesis credit notation `(xxx.xx)`
- **Thousands separators** in some balance fields

### `04-suppliers.csv` (15 rows)

- **UAE suppliers (rows 1–7, 15):** have TRN — AP reconciliation + reverse-charge context
- **Overseas suppliers (Turkey ×2, India ×3, Morocco ×1, KSA ×1):** no TRN — RCM purchase flow relevance (finding 8.2)
- **~8 rows with AP opening balances** (sum matches trial balance exactly)

### `05-opening-stock-dubai.csv` & `06-opening-stock-sharjah.csv`

- **ONE row per (SKU, warehouse)** — except exactly 2 deliberate duplicate pairs per file (see E2E Reference below)
- **6 orphan SKUs per file** (ORPHAN-XXXXXX) → non-existent product reference
- **4 rows with quantity = 0** → zero-qty skip policy
- **2 deliberate duplicate (SKU, warehouse) rows per file** → deduplication / sum-quantities policy
- Warehouse names: `Dubai - Jumeirah` and `Sharjah - Al Majaz` (exact text, may not auto-match predefined list)

### `07-custom-orders.csv` (40 rows)

- **No import destination in system** — this file tests orphaned data handling (finding 6.3)
- Contains deposits, balances, measurement notes, delivery dates
- Represents 15% of Mariam's revenue that currently lives in Google Sheets

### `09-customers-windows1256.csv` (50 rows)

- Windows-1256 encoding (Zoho Middle East legacy export)
- Contains Arabic names — tests charset auto-detection and mojibake recovery

---

## Trial Balance Validation

All account balances derived from generated data. Total debits = total credits exactly at 2dp.

```
                                          Debit (AED)      Credit (AED)
Cash in Hand                                28,450.00
Bank - Emirates NBD Current Account        215,340.75
Bank - ADIB Islamic Account                 94,780.50
Accounts Receivable (Trade Debtors)         58,442.50
Inventory - Dubai Jumeirah Store        13,856,477.00
Inventory - Sharjah Al Majaz Store       9,485,526.75
Furniture & Fixtures                        38,200.00
Prepaid Rent                                12,500.00
                                        ─────────────
Subtotal (Debit Side)                   23,789,717.50

Accounts Payable (Trade Creditors)                         173,944.00
VAT Payable                                                 12,345.67
Loan - Business Finance                                     85,000.00
Owner Capital                                           23,518,427.83
                                                        ─────────────
Subtotal (Credit Side)                                  23,789,717.50

BALANCE: ✓ YES (difference = 0.00)
```

### Reconciliation Checks (All Pass)

| Check | Value | Status |
|-------|-------|--------|
| Trial Balance (Dr = Cr) | AED 23,789,717.50 | ✓ |
| Customer AR sum (03-customers.csv) | AED 58,442.50 | ✓ |
| Supplier AP sum (04-suppliers.csv) | AED 173,944.00 | ✓ |
| Dubai inventory value (05-*, first-occurrence dedup) | AED 13,856,477.00 | ✓ |
| Sharjah inventory value (06-*, first-occurrence dedup) | AED 9,485,526.75 | ✓ |
| VAT Payable (journey doc L5 test) | AED 12,345.67 | ✓ |

---

## E2E Assertion Reference

### Exact 10 Mismatched taxGroup SKUs (finding 2.3)

These SKUs have `taxGroup = "Standard Rate 5%"` (no parens) — will not match the seeded group name `"Standard Rate (5%)"`:

| # | SKU |
|---|-----|
| 1 | ABY-CCR-CAM-60 |
| 2 | ABY-CCR-GRY-52 |
| 3 | ABY-CCR2-OLV-58 |
| 4 | ABY-CCR2-PLM-52 |
| 5 | ABY-CCR3-CAM-60 |
| 6 | ABY-CCR4-BLK-54 |
| 7 | ABY-CCR4-BLK-56 |
| 8 | ABY-CCR4-BRG-58 |
| 9 | ABY-CCR6-GRY-56 |
| 10 | ABY-CCR7-BLK-58 |

### Exact 2 Bad-TRN Customers (finding 1.3)

These customers have 14-digit TRNs (UAE TRN must be exactly 15 digits):

| CSV Row | Company Name | TRN (14 digits) |
|---------|-------------|-----------------|
| 9 | Arabesque Fashion LLC | 94127711509046 |
| 21 | Bur Dubai Fashion House | 05439315089995 |

### Deliberate Duplicate (SKU, warehouse) Pairs

These pairs appear twice in their respective stock files to test deduplication logic:

| File | SKU 1 | SKU 2 |
|------|-------|-------|
| 05-opening-stock-dubai.csv | ABY-CCR-NVY-62 | ABY-CCR-PLM-58 |
| 06-opening-stock-sharjah.csv | ABY-CCR-CAM-56 | ABY-CCR-GRY-60 |

---

## UAE-Specific Notes

### VAT Context
- Most items: `Standard Rate (5%)` — standard VAT
- Fabrics and Underscarves: `Zero Rate` — applicable for basic textile inputs
- VAT Payable `12,345.67` in trial balance matches journey doc L5 test scenario
- Test: does the system warn/block the 10 mismatched taxGroup items? (finding 2.3)

### TRN Context
- 25 B2B customers have 15-digit TRNs (2 intentionally 14-digit to trigger validation)
- UAE suppliers have TRN; overseas suppliers don't (Turkey/India = RCM / reverse-charge context)

### Custom Orders (07)
- No import destination currently exists in Zerupt
- Tests finding 6.3 (no made-to-order / deposit workflow)
- 40 records; deposit typically 30–50% of total

### Warehouse Names
- `Dubai - Jumeirah` and `Sharjah - Al Majaz` — exact text used in stock files
- Test: does system auto-create warehouses on import or require pre-creation?

---

## Generator Reproducibility

```bash
cd /Users/hus3ain/Development/Zerupt/agent-os/product/user-journeys/test-data/mariam
node generate.mjs
```

Seed 43 + same PRNG class as Yousef dataset (seed 42). Output is fully deterministic.

---

Generated 2026-06-05 for Zerupt UAE import testing (companion to Yousef Kuwait dataset).
