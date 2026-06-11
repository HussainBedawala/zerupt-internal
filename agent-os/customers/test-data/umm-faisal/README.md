# Umm Faisal Baqala — Test Data Fixture

## Persona

**Store:** Baqala Umm Faisal
**Location:** Rumaithiya, Kuwait
**Currency:** KWD (3 decimal places) — no VAT
**Payment mix:** ~60% cash, ~40% KNET
**Sector:** FMCG / Neighbourhood grocery (baqala)

## File Inventory

| File | Rows (data) | Purpose |
|------|-------------|---------|
| 01-categories.csv | 15 | 15 grocery categories (EN + AR) |
| 02-products.csv | 805 | FMCG SKUs, realistic Kuwaiti brands |
| 03-customers.csv | 148 | Neighbourhood regulars, incl. tabs |
| 04-suppliers.csv | 12 | 12 FMCG distributors |
| 05-opening-stock.csv | 805 | Opening inventory, single warehouse |
| 06-trial-balance.csv | 7 | Chart of accounts opening balances |

## Deliberate Test Traps

1. **Missing barcodes (~10%):** Every 10th product in 02-products.csv has an empty Barcode field. Tests the importer's barcode-gap detection and graceful handling.

2. **Expired batches (3 items):** The first three perishable SKUs in 05-opening-stock.csv have Expiry Dates in December 2025 (before the Jan 1 2026 base date). These trigger the FEFO/expiry-blocking alert on stock movement.

3. **Near-expiry batches (2 items):** Items 4–5 in perishable sequence expire within 7 days of Jan 1 2026, testing the near-expiry warning threshold.

4. **Customer tabs (25 accounts):** 25 of the 150 customers carry a positive Opening Balance (KWD) representing an outstanding tab. Their sum equals Sundry Debtors in the trial balance.

5. **AP opening balances:** Several suppliers carry non-zero Opening Balance representing payables owed. Their sum equals Sundry Creditors in the trial balance.

## Trial Balance Summary

- Total Debits:  KWD 101170.397
- Total Credits: KWD 101170.397
- Balanced: YES ✓

## KWD / No-VAT Notes

- All monetary values are stored to **3 decimal places** (fils).
- Kuwait has no VAT. No tax fields anywhere in these fixtures.
- Barcodes are 13-digit EAN-format (not necessarily valid EAN check-digits — they are test data).
