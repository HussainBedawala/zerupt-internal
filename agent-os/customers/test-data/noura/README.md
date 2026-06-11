# Noura Perfumes & Cosmetics — Test Data Fixture

## Persona

**Business:** Noura Perfumes & Cosmetics  
**Owner:** Noura Al-Sabah  
**Location:** Single boutique, Kuwait  
**Currency:** KWD — 3 decimal places (fils), NO VAT  
**Payment split:** ~50% KNET / ~50% Cash  
**Character:** Walk-in retail, heavy on promotions, gift bundles, repeat customers. A portion of stock is imported from Dubai suppliers (foreign creditors).

---

## File Inventory

| File | Rows | Description |
|------|------|-------------|
| `01-categories.csv` | 12 | Bilingual category tree (Perfumes/عطور as parent, 3 subcategories; standalone Makeup/Skincare/Haircare/Body Care/Gift Sets/Nails/Accessories/Testers) |
| `02-products.csv` | 379 | ~359 non-bundle SKUs + 20 bundle SKUs. Columns: `Item Name,Arabic Name,SKU,Barcode,Category,Unit,Purchase Rate,Selling Price,Reorder Level,Track Serial,Status,Is Bundle` |
| `03-bundles.csv` | 61 | Component expansion for 20 gift bundles. 2–4 components each. All component SKUs reference non-bundle products in `02-products.csv` |
| `04-promotions.csv` | 15 | Ramadan/Eid/National Day/Mother's Day + clearance promos. Types: PERCENT_OFF, BUY_X_GET_Y, BUNDLE_PRICE, AMOUNT_OFF |
| `05-customers.csv` | 300 | Mix of Kuwaiti women (65%) and expat (35%). ~10 have negative balances (store credit from returns). Notes carry loyalty hints (VIP, prefers oud, etc.) |
| `06-sales-history.csv` | 500 | Historical sale lines, 2025-12-01 to 2026-06-08. All line totals are internally consistent (qty × unit_price = line_total, 3dp). Customers distributed for "lookup history" test coverage |
| `07-suppliers.csv` | 8 | 3 Kuwait-local, 3 Dubai importers (Emirates / International), 2 mixed. AP opening balances on Dubai importers |
| `08-opening-stock.csv` | 359 | Single warehouse "Noura Boutique". Non-bundle SKUs only (bundles are virtual). Unit cost ≈ purchase rate ±3% |
| `09-trial-balance.csv` | 7 | Cash, Bank, Inventory, Furniture, Prepaid vs. Sundry Creditors + Owner Capital. Debits = Credits = 358,862.456 KWD |
| `README.md` | — | This file |
| `generate.mjs` | — | Deterministic ESM generator (mulberry32 seed `0xDEADBEEF`). Run `node generate.mjs` to regenerate all files identically |

---

## Deliberate Test Focus

1. **Promotions engine** — 15 promos covering every promo type (percent-off category, buy-X-get-Y on specific SKU, fixed bundle price, amount-off). Includes seasonal (Ramadan, Eid Al-Fitr, Eid Al-Adha, National Day Feb) and always-on promos.

2. **Gift bundles** — 20 bundles with 2–4 components each. `03-bundles.csv` drives bundle explosion logic. Bundles are in `Gift Sets` category and NOT in opening stock (components are stocked instead).

3. **Customer purchase history** — 300 customers with 500 sale lines spread over 6 months. Sufficient for "show me this customer's last 5 purchases" and repurchase-rate analytics.

4. **Dubai-import suppliers** — 3 of 8 suppliers are Dubai-based with 45–60 day payment terms and AP opening balances. Tests foreign-supplier AP flow, currency-consistent (all KWD at the boutique level).

5. **No VAT** — Kuwait, no VAT column anywhere. All prices are final.

6. **KWD 3dp** — All monetary values use 3 decimal places (fils precision) throughout.

---

## Regeneration

```bash
cd agent-os/product/user-journeys/test-data/noura
node generate.mjs
```

Output is fully deterministic (fixed seed). Re-running overwrites all CSVs with identical content.
