# P5 — Imran Trading LLC · 5-Store Dubai Baqala Chain
## Legacy Data Dump: 6-yr-old Windows POS + Tally ERP 9 + Transcribed Physical Stock Books

**Business:** 5 baqala mini-marts across Dubai (Al Quoz, Deira, Jumeirah, International City, Discovery Gardens). ~15,000 SKUs (food + FMCG). AED 450k–700k/month. ~12,000 txns/month. 5% UAE VAT with SKU-level zero-rated split.

---

## Files

| File | Contents | Rows |
|------|----------|------|
| `01-items-pos-export.csv` | ~185 SKUs from Windows POS | ~185 |
| `02-customers.csv` | Mostly cash walk-ins + 15 credit accounts | 30 |
| `03-suppliers.csv` | 20 FMCG distributors + cash/mandi vendors | 20 |
| `04-trial-balance-tally.csv` | Tally ERP 9 TB as of 20-May-2026 (stale) | ~70 lines |
| `05-location-wise-stock.csv` | 5-outlet stock split per SKU | ~135 |
| `06-physical-stock-book.csv` | Hand-transcribed partial count (AQ + Deira only) | ~95 |
| `07-customer-outstanding-aging.csv` | AR aging, credit customers only | ~55 |
| `08-supplier-outstanding-aging.csv` | AP aging, all active suppliers | ~65 |

---

## Mess Categories Injected → Zerupt Edge Cases Stressed

- **Duplicate item names + near-duplicate barcodes:** "ALMARAI MILK 1L FULL CREAM" and "almarai milk 1ltr" both exist as separate SKUs with same barcode `6291003030008`. Same-barcode-two-SKUs pattern repeated for Pepsi cans (355ml vs 330ml same code), Fairy dishwash, Dettol handwash, Ketchup, Nescafe, Colgate, etc. Tests deduplication UX and WAC merge logic.

- **Unit/UOM chaos (grocery-specific, worst category):** Loose/weight items tracked as `kg`/`Kg`/`gm`/`approx` vs each items as `pcs`/`Pcs`/`PCS`/`each`/`btl`/`loaves`/`bags`/`tray`/`packs`. Physical stock book uses `gm` for nuts, `kg` for loose items, `trays` for eggs — none match POS unit. Tests weighed-item UOM handling, unit normalization, and WAC-per-unit calculation.

- **Zero-rated vs 5% VAT miscategorization (compliance risk):** Chocolates (Kinder Bueno, KitKat, Snickers, Dairy Milk, Twix) deliberately marked `0%` in one row and `5%` in the duplicate row. Condensed milk (Rainbow) marked `5%` when it should arguably be `0%`. Sella rice marked `5%`. Almarai Yoghurt 170g marked `5%` while 400g is `0%`. Tests VAT category validation, FTA compliance flag, and importer warning logic.

- **Blank and supplier-code barcodes:** ~8 items have no barcode (loose dates, chickpeas, lentils, fresh cream). Two items use supplier internal codes (`SUPP-ALP-001`, `SUPP-NDC-001`) instead of EAN-13. Tests barcode ingestion fallback and manual-entry flows.

- **WAC = 0 / cost = 0:** Several items have cost `0` (Vegetable Oil 5L, Toast Bread, Maggi Carton, Imodium, Mixed Nuts Loose). Tests zero-cost WAC guard and import warning.

- **5-outlet stock split with negatives and blanks:** File 05 has blank cells (= zero) and negative stock for Potato in Al Quoz (-3), Tomato in Int'l City (-2), Chickpeas in Al Quoz (-2), Basmati Loose in Al Quoz (-5). Tests negative stock import handling, per-location inventory split, and stock transfer inference.

- **Physical stock book vs POS mismatch:** File 06 uses different item names vs file 01 (e.g., "almarai fresh milk 1ltr full cream" vs "ALMARAI MILK 1L FULL CREAM"), different units (btl vs pcs), "approx"/"~"/"?" quantities, only 2 of 5 stores counted, and items not in POS at all (fresh cream, cumin seeds, local pita). Tests stock-book reconciliation UX, fuzzy-match on import, unmatched-item handling.

- **Stale books / timing gap:** TB is as of 20-May-2026; physical count is 28-May (AQ) and 02-Jun (Deira); today is 07-Jun-2026. ~2–3 week gap in accounts. Explicitly noted in TB header. Tests "books are stale" warning on import and opening-balance date reconciliation.

- **Cash-heavy thin customer data:** 8 of 30 customer records are "Cash Sale"/"Walk In"/"CASH CUSTOMER" variants with no mobile, no email, no address. Tests cash-customer handling, duplicate cash-account merge, and thin-data import.

- **Credit accounts with embedded refs and no proper contact:** Labour camp accounts (Al Noor, Al Baraka, INTL CITY CAMP A) have partial mobile numbers (`056-xxxxxx`), no emails, informal addresses. Emirates Steel Camp is overdue with no escalation contact. Tests contact-data validation and AR collection workflow with incomplete data.

- **Supplier without TRN / no formal PO:** `LOCAL PURCHASE - CASH` (vegetable mandi) and `AL RAWDAH POULTRY (EGGS)` have no TRN, no formal invoices, COD only. Tests supplier TRN validation for VAT input credit and cash-purchase recording.

- **Legacy test/void accounts:** `MISC-003 TEST ACCOUNT DO NOT USE`, `MISC-002 VOID TRANSACTION`, `STAFF-002 Imran Personal` — should be filtered or flagged on import.

- **AP significantly larger than AR (AED 149k vs AED 20k):** Realistic for a cash retail business — most sales are cash, most purchases are on credit. Tests that Zerupt's opening balance import doesn't assume AR ≈ AP.
