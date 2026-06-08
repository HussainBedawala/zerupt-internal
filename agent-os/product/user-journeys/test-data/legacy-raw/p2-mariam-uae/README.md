# P2 · Mariam — Legacy Raw Migration Data

**Who:** Mariam Boutique LLC — abaya & modest fashion chain, Dubai + Sharjah boutiques + tailoring workshop.  
**Volume:** ~3,000–5,000 SKUs (with variants), ~600 retail txns + 80 custom orders/month, AED 180k–350k/month revenue.  
**Source systems:** Zoho Books (items, customers, suppliers, AR, trial balance) + Google Sheets (custom orders tracker).

---

## Files

| File | What it is | Rows |
|------|-----------|------|
| `01-items-zoho-export.csv` | Zoho item master export — ready-made abayas, accessories, fabrics, services | ~145 |
| `02-customers-zoho.csv` | Zoho customer list — retail, VIP, wholesale B2B | ~45 |
| `03-suppliers-zoho.csv` | Zoho supplier list — fabric/abaya suppliers China, UAE, KSA | 15 |
| `04-trial-balance-zoho.csv` | Zoho trial balance — all accounts, closing Dr/Cr | ~55 |
| `05-opening-stock-dubai.csv` | Per-SKU opening stock for Dubai outlet | ~95 |
| `06-opening-stock-sharjah.csv` | Per-SKU opening stock for Sharjah outlet | ~65 |
| `07-custom-orders-googlesheet.csv` | Google Sheets custom orders tracker — the messy one | 30 |
| `08-customer-outstanding-aging.csv` | AR aging with running cumulative balance | ~35 |

---

## Mess Categories Injected & Zerupt Import Edge Cases Stressed

### 1. Variant Explosion (No Matrix/Grid)
- **Injected:** ~120 near-duplicate item rows differing only by colour+size suffix (e.g. `ABAYA-CLS-BLK-S`, `ABAYA-CLS-BLK-M`, `ABAYA-CLS-BLK-54`, `abaya classic black medium`).
- **Zerupt edge case:** Variant import must detect and collapse these into a product matrix (colour × size). No matrix = exploding SKU list.

### 2. Inconsistent Naming & Casing
- **Injected:** Same item appears as "Abaya Classic Black Medium", "ABAYA CLASSIC BLK M", "abaya classic black medium". Mixed Title Case / ALL CAPS / lowercase throughout items, customers, and suppliers.
- **Zerupt edge case:** Deduplication logic; fuzzy matching at import; user must confirm merges.

### 3. Mixed Sizing Systems
- **Injected:** Numeric sizes (52, 54, 56, 58) and letter sizes (S, M, L, XL) used for the same style — treated as separate SKUs.
- **Zerupt edge case:** Size attribute normalisation must not auto-merge 56 with L without user confirmation.

### 4. WAC = 0 (Zero-Cost Trap)
- **Injected:** 20+ items with `Purchase Rate = 0.00` and `Unit Cost = 0.00` in opening stock (flagged in Notes column). Clearance items also zero-cost.
- **Zerupt edge case:** WAC calculation will produce incorrect COGS and gross margin. Import validator must flag zero-cost inventory items.

### 5. Negative Stock
- **Injected:** `ABAYA-BFLY-NVY-56` has Qty = -1 in Dubai (bad stocktake), zero cost.
- **Zerupt edge case:** Opening stock import must reject or warn on negative quantities.

### 6. Duplicate SKUs / Rows
- **Injected:** `ABAYA-CLASSIC-BLK-M` appears twice in `01-items-zoho-export.csv` (Zoho export glitch). Same customer "Fatima Al Rashidi" appears twice in `02-customers-zoho.csv`.
- **Zerupt edge case:** Duplicate detection at SKU level; customer deduplication by mobile/name.

### 7. Mixed Date Formats
- **Injected:** `07-custom-orders-googlesheet.csv` uses `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD` inconsistently within the same column (rows 1, 5, 6 show the variation).
- **Zerupt edge case:** Date parser must handle all three formats and flag ambiguous cases (e.g. 01/03/2026 = Jan 3 or Mar 1?).

### 8. Customer Data Quality — Missing Contacts, Instagram Handles as Names
- **Injected:** Instagram handles embedded in customer names (`@fatima.abaya.love`, `@dana_modest_fashion`); blank emails (~60%); mixed phone formats (`+971 50`, `050-`, `0501234000`, blank); one-name-only customers ("Maitha", "Tasneem"); one customer with zero contact info ("Maha").
- **Zerupt edge case:** Customer import must parse/strip IG handles; phone normalisation to E.164; blank-email handling.

### 9. TRN Sparsity
- **Injected:** Only 3 of 45 customers have a TRN (B2B wholesale buyers). All others blank.
- **Zerupt edge case:** UAE VAT: retail sales can proceed without TRN; B2B tax invoices require TRN. Import must not reject blank TRN for retail customers.

### 10. Multi-Outlet Stock Split
- **Injected:** Same SKU appears in both `05-opening-stock-dubai.csv` and `06-opening-stock-sharjah.csv` with different quantities and sometimes different costs.
- **Zerupt edge case:** Inventory must be loaded per-location; combined totals must match Zoho TB inventory accounts (1200 + 1201).

### 11. Custom Order / Deposit Workflow Gap
- **Injected:** `07-custom-orders-googlesheet.csv` tracks 30 custom orders: deposits paid without formal invoices in Zoho, balances outstanding, some orders with no delivery date, one anonymous cash deposit, free-text measurements, mixed payment methods, "URGENT" flags scattered.
- **Zerupt edge case:** No 1:1 mapping between Sheet rows and Zoho invoices. Deposit liability (`Customer Deposits - Custom Orders = AED 18,200` in TB) does not reconcile cleanly to Sheet totals. Custom-order workflow (quote → deposit → production → delivery → balance) must be built, not assumed.

### 12. Supplier Messiness
- **Injected:** SAR-denominated supplier (Saudi Abaya Wholesale) with no email, USD-denominated Chinese supplier (Chiffon Palace), cash-on-delivery agent supplier (Al Riyadh Abayas), internal workshop as a supplier row.
- **Zerupt edge case:** Multi-currency AP; cash suppliers with no formal invoices; internal vs external supplier distinction.

### 13. AR Aging Ambiguity
- **Injected:** Running cumulative balance column, "-" / blank placeholders for paid rows, missing customer names on two rows (POS glitch), deposits in aging that should net against custom-order balances.
- **Zerupt edge case:** Aging import vs. open-invoice import; deposit netting; orphan invoice rows.

### 14. Discontinued / Display / Clearance Items
- **Injected:** `ABAYA-CLS-BLK-DISP` (display, not for sale, price=0, no tax), `ABAYA-OPN-NUD-*-CLR` (clearance, zero cost), `ABAYA-BFLY-BLK-L-V1` (old version sitting in Sharjah).
- **Zerupt edge case:** Item status must be preserved; clearance items should not affect reorder logic; display items should not appear in POS.
