# Al-Noor Mobiles Test Data — Quick Index

**Location:** `/Users/hus3ain/Development/Zerupt/agent-os/product/user-journeys/test-data/yousef/`  
**Generated:** 2026-06-04  
**Seed:** 42 (deterministic)  
**Total Size:** ~712 KB (9 CSV files + 4 docs + generator)

---

## 📊 CSV Data Files (9 Total)

### Master Data
| File | Rows | Size | Purpose | Key Test Coverage |
|------|------|------|---------|------------------|
| **01-categories.csv** | 25 | 1.5K | Product taxonomy with parent-child hierarchy | Category tree import, Arabic metadata |
| **02-products.csv** | 3,000 | 353K | Master product list (400 phones + 2,600 accessories) | **Duplicate SKUs, empty costs, currency prefixes, trailing spaces, empty rows** |
| **04-suppliers.csv** | 18 | 2.0K | Supplier ledger with payment terms | AP opening balance reconciliation |

### Ledger Data
| File | Rows | Size | Purpose | Key Test Coverage |
|------|------|------|---------|------------------|
| **03-customers.csv** | 800 | 52K | Customer ledger with AR opening balances | **Phone format variance, duplicates, Tally credit notation (xxx), thousands separators** |

### Inventory Data
| File | Rows | Size | Purpose | Key Test Coverage |
|------|------|------|---------|------------------|
| **05-opening-stock-hawally.csv** | 2,206 | 73K | Hawally Main store stock (2,200 SKU lines) | **Orphaned SKUs, zero-qty rows, duplicate pairs** |
| **06-opening-stock-salmiya.csv** | 1,406 | 40K | Salmiya store stock (1,400 SKU lines) | Per-store reconciliation, warehouse name exact-match |
| **07-imei-register.csv** | 900 | 99K | Serialized goods (15-digit IMEIs) | IMEI validation, serial-number import destination |

### GL & Charset
| File | Rows | Size | Purpose | Key Test Coverage |
|------|------|------|---------|------------------|
| **08-trial-balance.csv** | 12 | 456B | GL opening balance (perfectly balanced) | Debit/credit reconciliation, Arabic account names |
| **09-customers-windows1256.csv** | 50 | 3.2K | Customer subset in Windows-1256 | **Charset detection, mojibake recovery** |

---

## 📚 Documentation Files (4 Total)

| File | Size | Purpose |
|------|------|---------|
| **README.md** | 15K | Comprehensive usage guide, reconciliation checks, mess inventory, gotchas |
| **GENERATION_LOG.txt** | 6.6K | Detailed validation results, file manifest, validation audit |
| **SAMPLE_DATA_PREVIEW.txt** | 11K | Representative rows from each file, realistic characteristics |
| **INDEX.md** (this file) | — | Quick reference for navigation |

---

## 🔧 Generator

**File:** `generate.mjs` (31 KB)

**Usage:**
```bash
cd /Users/hus3ain/Development/Zerupt/agent-os/product/user-journeys/test-data/yousef
node generate.mjs
```

**Features:**
- Seeded PRNG (seed=42) for deterministic output
- No npm dependencies (pure Node.js)
- Configurable row counts, phone models, mess probability
- All CSV outputs UTF-8 BOM
- Trial balance auto-calculated and balanced
- Reconciliations verified at generation time

---

## ✅ Validation Checklist

**All reconciliations pass:**

```
Trial Balance:
  Debits:  KWD 2,106,630.529
  Credits: KWD 2,106,630.529
  Status:  ✓ BALANCED

Customer AR:
  Sum of opening balances: KWD 41,602.209
  GL Sundry Debtors:       KWD 41,602.209
  Status:  ✓ MATCH

Supplier AP:
  Sum of opening balances: KWD 81,525.000
  GL Sundry Creditors:     KWD 81,525.000
  Status:  ✓ MATCH

Inventory:
  Hawally value:   KWD 1,068,977.435
  Salmiya value:   KWD 666,050.885
  Total:           KWD 1,735,028.320
  GL Inventory:    KWD 1,735,028.320
  Status:  ✓ MATCH
```

---

## 🎯 Recommended Import Test Sequence

1. **01-categories.csv** → Validate category tree
2. **02-products.csv** → Test duplicate SKU handling, empty fields, currency stripping
3. **03-customers.csv** → Test AR ledger, phone normalization, credit balance detection
4. **04-suppliers.csv** → Test AP ledger, payment term validation
5. **05/06-opening-stock-*.csv** → Test stock import, warehouse creation, orphaned audit
6. **07-imei-register.csv** → Test IMEI import (destination TBD)
7. **08-trial-balance.csv** → Validate GL opening balance, reconciliation
8. **09-customers-windows1256.csv** → Test charset detection

---

## 🔍 Expected Audit Findings

| Finding | File | Root Cause | System Response |
|---------|------|-----------|-----------------|
| 10 duplicate SKUs | 02 | Intentional collision | Merge or skip? |
| 15 empty costs | 02 | Missing data | Use 60% default? |
| 5 "KD" prefixes | 02 | Legacy export | Strip currency |
| 8 missing barcodes | 02 | Optional field | Allow null |
| 6 orphaned SKUs | 05/06 | Incomplete product list | Log audit + skip |
| 5 duplicate names | 03 | Data quality | Flag merge candidates |
| Phone format variance | 03 | Manual entry | Normalize to E.164 |
| Tally credit notation | 03 | Legacy Tally | Detect () and negate |
| Windows-1256 file | 09 | Legacy charset | Auto-detect + convert |

---

## 💡 Quick Facts

**Products:**
- 400 phones: iPhone 15–17, Samsung S24–S25, Xiaomi, Huawei, Oppo, Realme, Nothing, Tecno, OnePlus
- 2,600 accessories: cases, chargers, cables, protectors, power banks, earbuds, memory cards, mounts
- All prices in KWD 3dp (0.250–499.000 range)
- ~70% have Arabic product names

**Customers:**
- 800 records (Kuwaiti + expat names)
- 20 with AR opening balance, ~5% with credit due
- 3 phone format variants (intentional inconsistency)
- ~60% Arabic names, ~40% email, ~50% Civil ID
- 5 exact duplicate names

**Suppliers:**
- 18 GCC distributors (realistic regional wholesalers)
- ~10 with AP opening balance
- Payment terms: 0/15/30/45 days

**Inventory:**
- 2 stores (Hawally Main = 2,206 lines, Salmiya = 1,406 lines)
- ~1.7M KWD total value
- Phones: 1–8 per location; accessories: 5–120 per location

**GL:**
- 12 accounts (perfectly balanced)
- Includes Arabic account names (realistic Tally export)
- All GL accounts derived from data, not guessed

---

## 📖 For More Details

- **Full usage guide:** See `README.md`
- **Validation details:** See `GENERATION_LOG.txt`
- **Sample data rows:** See `SAMPLE_DATA_PREVIEW.txt`
- **Generator logic:** See `generate.mjs` (well-commented)

---

**Status:** ✓ Complete and ready for import testing  
**Last updated:** 2026-06-04
