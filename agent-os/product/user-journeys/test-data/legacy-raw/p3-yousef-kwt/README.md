# P3 · Yousef — Legacy ERP Raw Data Dump
**Persona:** 12-year-old Kuwaiti mobile phone & electronics retailer (Salmiya, Avenues Kiosk, Farwaniya). KWD throughout. No VAT. ~6,000 SKUs, ~1,200 IMEI-serialized. Incumbent: 8-year-old legacy desktop ERP (Merpec-like) + separate IMEI Excel + WhatsApp transfers.

---

## Files

| File | Rows | Contents |
|------|------|----------|
| `01-items.csv` | ~130 | SKU master |
| `02-customers.csv` | 50 | Customer master |
| `03-suppliers.csv` | 18 | Supplier master |
| `04-trial-balance.csv` | ~80 | TB with account hierarchy |
| `05-location-wise-stock.csv` | ~115 | Multi-branch stock |
| `06-imei-register-excel.csv` | 200 | IMEI handset ledger |
| `07-customer-outstanding-aging.csv` | ~31 | AR aging |
| `08-supplier-outstanding-aging.csv` | ~18 | AP aging |

---

## Mess Categories Injected → Zerupt Import Edge Cases

- **ALL-CAPS abbreviated item names** (`IPHONE 13 PRO 256GB GRAPHITE-USED-A`, `SAMSUNG A54 8/256 BLK`) → name normalization, search-index quality
- **Duplicate items differing by trailing punctuation/case** (`IP13P-256-GR` vs `IP13P-256-GR.`) → dedup detection before import; must not create ghost SKUs
- **Junk/test rows** (`999-TESTITEM`, `ADJ-WROFF-2023`, `BNDL-STARTKIT-IP15`) → filter-before-import logic; non-zero junk cost = WAC corruption risk
- **Blank barcodes** (many rows) and barcode = item code inconsistency → barcode generation / manual assignment flow
- **"With Attribute" / "Without Attribute" / serialized inconsistency** — serialized phones sometimes tagged Without Attribute; Zerupt must reconcile with IMEI register
- **KWD 3-decimal cost prices**, some `0.000` → WAC=0 on stock items; weighted average recalculation on first GRN
- **"In Active" (two words)** status → string parsing, not boolean; must map to Zerupt `inactive` flag
- **Customer names with embedded codes and areas** (`ABDUL HUSSAIN(Sulabiya)/314`, `Cash Customer/MAHMMUD SURI/553`) → name parsing / dedup / area extraction
- **Multiple generic "Cash Customer" rows** → merge-or-separate decision; POS walk-in flow needs a single default
- **Missing mobiles, blank addresses** on ~40% of customers/suppliers → optional field enforcement, no hard import block
- **Blacklisted supplier flag** (S009 Huawei, S015 Al-Saif) → Zerupt purchase order block on blacklisted
- **Trial balance: cryptic multi-prefix codes** (`X000000001`, `GM10000025`, `AM...`, `SA...`, `EX...`) → COA code remapping; Zerupt uses its own chart structure
- **6-level dash-indented hierarchy** in TB → hierarchy depth limit, parent-child reconstruction
- **Bank accounts with full numbers + holder names in title** (`Burgan Bank A/C No.06720134028 / YOUSEF TRADING CO`) → PII in account names; masking / renaming on import
- **VAT Payable = 0 / VAT Recoverable = 0** accounts present but empty → Kuwait no-VAT flag; accounts exist but must not trigger VAT filing
- **Suspense/Unallocated balance** (`344.730`) → must surface as import warning, not silently absorb
- **Multi-branch stock with blank = zero** and a `zTOTAL` column → blank-to-zero coercion; zTOTAL is a legacy computed column, not a Zerupt location
- **Negative stock row** (last row `05-location-wise-stock.csv`, `zTOTAL = -2`) → negative inventory flag; WAC undefined; must warn
- **Items only in one branch** → branch-specific reorder rules
- **IMEI register is a SEPARATE EXCEL with no import target in legacy ERP** → entire file has "nowhere to land"; Zerupt serialized-inventory module is the new home but requires IMEI-per-GRN linkage
- **Duplicate IMEIs** (rows 23, 181) → hard block on duplicate IMEI import; must surface both offending rows
- **14-digit IMEI** (row 117) and blank IMEIs (rows 71, 72, 140, 195) → IMEI format validation (must be 15 digits); blank = unregistered unit warning
- **RMA rows with no customer** (rows 36, 37, 130) → warranty/return flow; RMA must link to original sale IMEI
- **Status values inconsistent** (`in stock`, `SOLD`, `Rma`, `blank`) → enum normalization
- **Transfer duplicate** (row 181 = same IMEI as row 180, different branch) → legacy transfer records not deleted; dedup by IMEI + "in stock" rule
- **Aging in calendar days, running cumulative TotalBalance, `-` placeholders** → aging bucket recalculation (Zerupt uses 30/60/90/120+); `-` must parse as continuation of previous customer block
- **Dates DD/MM/YYYY throughout** → date parsing locale; must not flip to MM/DD/YYYY
- **KNET > 60% of payments** (inferred from TB KNET clearing account) → payment method split in sales import
- **Opening balances on customers/suppliers** (3-decimal KWD) → opening balance journal auto-generation on migration date
