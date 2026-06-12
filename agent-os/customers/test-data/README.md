# Kuwait Test Data

Test fixtures for the two Kuwait personas. Data was generated from **general retail knowledge**, NOT
from the app's import schema — the point is to test whether the import engine can absorb data shaped the
way real customers actually hand it over.

| Folder | Persona | Purpose |
|---|---|---|
| `layla-boutique/` | [Persona A — Clean](../personas/persona-a-layla-boutique-clean.md) | Golden path. Everything clean, ties out, TB balances to zero. |
| `mishari-mobiles/` | [Persona B — Messy](../personas/persona-b-mishari-mobiles-messy.md) | Torture test. Encoding garbage, dups, mixed units, negatives, unbalanced TB. |

Both folders carry the **same 8 files**, one per import-screen category (in screen order):

1. `01-categories.csv`
2. `02-products.csv` (requires categories)
3. `03-customers.csv`
4. `04-customer-outstanding.csv` (AR aging; requires customers)
5. `05-suppliers.csv`
6. `06-supplier-outstanding.csv` (AP aging; requires suppliers)
7. `07-opening-stock.csv` (requires products)
8. `08-opening-balance-trial-balance.csv` (opening balances)

## Built-in checks

**Layla (clean):**
- Trial balance: Debits = Credits = **29,160.000 KWD** (balances to zero ✅)
- AR file total **850.000** ties to TB Accounts Receivable.
- AP file total **3,250.000** ties to TB Accounts Payable.
- Opening-stock value **8,610.000** ties to TB Inventory.
- Single location, valid +965 phones, no duplicates. Expect **zero decision cards**.

**Mishari (messy) — intentional landmines:**
- Trial balance is **unbalanced** (Debits 29,100 vs Credits 25,750; off 3,350) → reconciliation/suspense test.
- AR file sums to **4,800** but TB shows AR **3,600** → **exactly 1,200 KWD gap** → anomaly flag test.
- Windows-1256 mojibake (`ÌáßÓí`, `ÇÈæ Úáí`, `ÔÑßÉ ÇáÎáíÌ`) → encoding-detection test.
- Duplicate items across 4 spellings (Samsung A54 / samsung a 54 / جالكسي A54 / Galaxy A 54) → dedup/merge test.
- Mixed price units (`45.500`, `45500`, `45 KD`, `45.500 د.ك`) → unit-normalization test.
- Negative (`-1`, `-3`) and text (`خلصت`, blank) quantities → "never drop a row" test.
- IMEIs buried in a free-text notes column, some spaced/missing → extraction test.
- Two branches (Hawally + Salmiya, plus typos حولي/salmeya/salmiya) in one stock file → location-split test.
- Duplicate customers (ابو فهد / Abu Fahad / بو فهد) with different balances → identity-resolution test.
- Mixed-currency stray values (`1200 USD`) despite single-currency setup → currency-anomaly test.
