# Abu Khalid Auto Parts — KSA Test Data
## Migration Dataset · Seed 44 · Riyadh Al-Olaya

**Generated:** 2026-06-11  
**Seed:** 44 (mulberry32 PRNG — deterministic, byte-identical on every run)  
**Persona:** Abu Khalid, owner of Abu Khalid Auto Parts — B2B-heavy auto-parts wholesaler + retail, Al-Olaya district, Riyadh, KSA  
**Currency:** SAR (Saudi Riyal) · 2 decimal places · VAT 15%  
**ZATCA profile:** Standard invoices → B2B garages/workshops → **clearance (blocking)**

---

## Onboarding Import Mapping

| File | Onboarding Question | Wizard Kind | Notes |
|------|---------------------|-------------|-------|
| `01-categories.csv` | "Import your product categories" | **categories** | 12 auto-parts categories with Arabic names |
| `02-products.csv` | "Import your products / items" | **items** | OEM cross-refs jammed in names; Z6 taxGroup mess; WAC=0 + blank-cost traps |
| `03-customers.csv` | "Import your customers" | **customers** | TRN column; Credit Limit/Days; Balance Type Dr/Cr. Opening Balance embedded — use `03b` for AR import. |
| `03b-customer-outstanding-aging.csv` | "Import customer outstanding balances (receivables)" | **receivables** | 30 rows; DD/MM/YYYY dates; running-total col to ignore; total SAR ~287,150 |
| `04-suppliers.csv` | "Import your suppliers" | **suppliers** | TRN; Blacklist flag; Country/Area; overseas = import VAT |
| `04b-supplier-outstanding-aging.csv` | "Import supplier outstanding balances (payables)" | **payables** | 16 rows; same DD/MM/YYYY + running-total trap as 03b |
| `05-opening-stock.csv` | "Import opening stock for AL-OLAYA" | **stock** | WAC col; negative qty row; duplicate item-code row; orphan SKU row |
| `06-pdc-register.csv` | "Import PDC register" | **pdc** | Received + Issued; 1 BOUNCED cheque (Z18) |
| `07-trial-balance.csv` | "Import opening GL balances" | **balances** | Tally 6-col; **DIRTY — off by SAR 890.00** (Z17) |
| `07-trial-balance-clean.csv` | "Import opening GL balances" | **balances** | Balanced — debits = credits = SAR 1,035,550.00 exactly |
| `08-customers-windows1256.csv` | "Import your customers" | **customers** | Windows-1256 encoding trap; first 30 rows; **no BOM** |

> **Key distinction:**
> - `03-customers.csv` / `04-suppliers.csv` → **Contact imports** (who the party is; TRN, credit terms, etc.)
> - `03b-customer-outstanding-aging.csv` / `04b-supplier-outstanding-aging.csv` → **Outstanding-balance imports** (what they owe / are owed). The `Total Balance (SAR)` column is a Tally running-total artifact — import pipeline must skip it.

---

## File Manifest

All files are UTF-8 with BOM (`﻿`) unless noted. Header row always present. `\n` line endings.

| File | Rows | Purpose | Import Test Coverage |
|------|------|---------|----------------------|
| `01-categories.csv` | 12 | Auto-parts taxonomy (Suspension, Engine, Brakes, Filters, etc.) with Arabic names | Category import; Arabic metadata |
| `02-products.csv` | 99+blank | Master parts list: ALL-CAPS OEM names with cross-ref codes jammed in, brand, taxGroup variants | Duplicate item codes; blank cost; WAC=0; Z6 taxGroup no-parens; unit case mismatch (Pcs/pcs/Set) |
| `03-customers.csv` | 40 | Customer ledger: garages/workshops (B2B, VAT-registered + TRN) + walk-in cash; Credit Limit/Days; Dr/Cr balance type | TRN validation; blank TRN on VAT-registered (Z3); credit-balance (Cr) customers; mixed phone formats |
| `03b-customer-outstanding-aging.csv` | 30 | AR aging: invoice-level outstanding per customer; DD/MM/YYYY dates; running-total col | Date-format detection; running-total col must NOT be imported as balance |
| `04-suppliers.csv` | 15 | Supplier ledger: local KSA + 1 blacklisted + 3 overseas (Jordan, UAE) | Blacklist flag; overseas = import VAT / reverse-charge; blank TRN on overseas |
| `04b-supplier-outstanding-aging.csv` | 16 | AP aging: invoice-level outstanding per supplier | Same date/running-total traps as 03b |
| `05-opening-stock.csv` | 101 | Opening inventory at AL-OLAYA warehouse; WAC column; realistic auto-parts quantities | WAC=0 traps; negative qty; duplicate (item-code, location) pair; orphan/invalid SKU |
| `06-pdc-register.csv` | 11 | PDC cheques received + issued; one BOUNCED (Z18) | PDC lifecycle states; BOUNCED handling; post-dated cheques |
| `07-trial-balance.csv` | 13 | **DIRTY** Tally 6-column TB — **off by SAR 890.00** (Z17) | Reconciliation gate must block go-live; suspense row inflated |
| `07-trial-balance-clean.csv` | 13 | **CLEAN** — debits = credits = SAR 1,035,550.00 | Clean GL import path |
| `08-customers-windows1256.csv` | 30 | First 30 customer rows, **Windows-1256 encoded, no BOM** | Encoding-detection failure; mojibake recovery |

---

## Deliberate Mess (Import Audit Testing)

### `02-products.csv`

- **ALL-CAPS OEM cross-ref codes jammed in item names** (e.g., `SHOCK ABSORBER-FR-CAMRY-02-06/MONROE`, `BRAKE PAD-FR-CAMRY-10-16/OEM-48510`) — tests name-length limits and parser stripping
- **~4 duplicate item codes** across rows — tests silent-skip vs. merge behavior
- **~3 rows with blank `Cost Price (SAR)`** — tests cost fallback / WAC calculation
- **~1 row with `Cost Price = 0.00`** — WAC=0 trap; stock value will be wrong if imported blindly
- **Z6: ~3 SKUs with `taxGroup = "Standard Rate 15%"`** (no parentheses) — must NOT silently map to `Standard Rate (15%)`; system should surface mismatch
- **1 blank row** injected mid-file — tests row-skip logic
- **Unit case inconsistency**: `Pcs` vs `pcs` vs `Set` vs `Piece` — tests normalization

### `03-customers.csv`

- **Z3: Customer C012 `KHALED WORKSHOP / 170`** — `VAT Registered = Yes` but `TRN` is blank — system must block/flag when creating a standard (B2B) ZATCA invoice for this party (BR-KSA-42/81)
- **Z12: All B2B garage/workshop customers** — VAT-registered with valid TRNs → standard invoices → ZATCA clearance (blocking)
- **1 customer with `Balance Type = Cr`** (C026 `NASSER GARAGE / 245`) — overpayment credit balance; must NOT be imported as a debit
- **Embedded references in customer names** (e.g., `GARAGE AL-WATAN / 101`, `RASHID BROTHERS / 113`) — Tally ledger naming convention; system should store full name
- **Missing TRN on overseas/non-VAT customers** — not an error; only B2B VAT-registered must have TRN
- **Credit Limit and Credit Days populated only for credit-term customers** — blank = cash

### `03b-customer-outstanding-aging.csv` and `04b-supplier-outstanding-aging.csv`

- **Dates in DD/MM/YYYY format** — will parse incorrectly if system assumes YYYY-MM-DD or MM/DD/YYYY
- **`Total Balance (SAR)` column** is a Tally running-total artifact per customer/supplier — it is NOT the per-invoice balance. Import pipeline must use `Balance (SAR)` column only and discard this column.
- **Partially-paid rows** (`paid > 0` and `paid < bill`) alongside fully-paid rows (balance = 0) — import should only create outstanding entries for rows where `Balance > 0`

### `04-suppliers.csv`

- **S011 `ABD HUSSAIN TRDG (Sulabiya) / 314`** — `Blacklist = Yes`; system must surface warning before allowing PO creation
- **S012 / S013 / S014** (Jordan + UAE) — `Country ≠ KSA`, blank TRN — flags import VAT / reverse-charge obligation; system should prompt for import VAT treatment
- **Blank TRN on overseas suppliers** — not a ZATCA error; TRN is a Saudi-only concept

### `05-opening-stock.csv`

- **1 row with `Opening Qty = -3`** — negative stock from Tally adjustment; importer must handle gracefully (reject or warn, never silently create negative stock)
- **WAC=0 rows (~3)** — zero weighted-average cost; will silently create zero-value inventory if not flagged
- **1 duplicate `(Item Code, Location)` pair** (same code, same AL-OLAYA warehouse, different trailing-space name variant) — tests deduplication / merge logic
- **1 orphan SKU** (`XXX-INVALID-9999`) — item code with no master record; should be rejected with audit finding

### `06-pdc-register.csv`

- **Z18: `PDC-IN-007`** — `Status = BOUNCED` — `MARZOUQ MOTORS / 145`, SAR 4,750; system must handle bounce lifecycle (reverse receipt, re-open AR, notify) and not treat it as collected cash
- **Post-dated cheques up to 3 months out** — `PDC-IN-008` due 15/07/2026 — system must not credit until cheque date
- **Multi-invoice linkage**: `PDC-IN-002` linked to `INV-2404-0033 + prior` — free-text reference, not a parseable FK

### `07-trial-balance.csv` (dirty — Z17)

- **Off by SAR 890.00** — `Owner Capital / Suspense` row is inflated; total debits ≠ total credits — reconciliation gate must block go-live and surface the gap
- **Tally 6-column format** (Opening Debit, Opening Credit, Period Debit, Period Credit, Closing Balance, Dr/Cr) — system must map to Opening Debit/Credit only; Period columns must be ignored or mapped explicitly
- **Arabic account name in `Prepaid Rent`** (`مدفوع مقدما`) — encoding test in TB context

---

## Trial Balance Validation (ASCII)

### Dirty (07-trial-balance.csv)

```
Account                              Op Debit      Op Credit
------------------------------------  -----------  -----------
ABU KHALID - CAPITAL ACCOUNT                       450,000.00
ABU KHALID - DRAWINGS                  12,000.00
RETAINED EARNINGS                                  125,000.00
AL RAJHI BANK LOAN                                  80,000.00
Sundry Creditors (AP)                              144,600.00  ← sum of 15 suppliers
Cash in Hand                           42,000.00
Bank - AL RAJHI                       198,500.00
Bank - RIYAD BANK                      87,350.00
Sundry Debtors (AR)                   246,050.00  ← sum of Dr-balance customers
Inventory - AL-OLAYA                  312,450.00
Prepaid Rent                           15,000.00
Furniture & Fixtures                   28,500.00
Owner Capital / Suspense (inflated)     ??,??0.00  ← SAR 890 too high
------------------------------------  -----------  -----------
                                    1,035,550.00  1,036,440.00  ← GAP = 890.00
```

### Clean (07-trial-balance-clean.csv)

```
Both sides: SAR 1,035,550.00  ✓ BALANCED
```

---

## Data Characteristics

- **B2B-heavy:** 33 of 40 customers are VAT-registered garages/workshops with TRNs — all generate standard tax invoices → ZATCA clearance
- **Auto-parts domain:** OEM cross-reference numbers (Monroe, KYB, Denso part codes) embedded in ALL-CAPS item names — realistic Tally export artifact
- **SAR 2dp throughout** — unlike Kuwait persona (KWD 3dp)
- **PDC culture:** 11 PDC entries including received, issued, and 1 bounced — reflects reality of KSA B2B auto-parts trade
- **Overseas suppliers:** Jordan + 2 UAE-based suppliers carry import VAT / reverse-charge obligation — tests KSA import-tax workflow
- **Credit-balance customer:** 1 of 40 has `Balance Type = Cr` (overpayment) — tests sign handling

---

## Generator Reproducibility

```bash
cd agent-os/product/user-journeys/test-data/abu-khalid
node generate.mjs
```

- PRNG: mulberry32 initialized with seed `44`
- All CSVs are byte-identical across runs on the same Node.js version
- Windows-1256 file requires `iconv` (standard on macOS/Linux; install `libiconv` on minimal systems)
- Requires Node.js ≥ 18 (ES module `import.meta.url`)

---

## Usage in Import Testing

### Expected audit findings per file

| File | Finding | Severity | Z-id |
|------|---------|----------|------|
| `02-products.csv` | `taxGroup = "Standard Rate 15%"` on ~3 rows — does not match known VAT codes | ERROR | Z6 |
| `02-products.csv` | ~4 duplicate item codes | WARNING | — |
| `02-products.csv` | ~3 blank `Cost Price` rows | WARNING | — |
| `02-products.csv` | ~1 `Cost Price = 0.00` rows | WARNING | — |
| `03-customers.csv` | C012 `KHALED WORKSHOP / 170`: VAT Registered=Yes but TRN is blank | ERROR | Z3 |
| `03-customers.csv` | C026 `NASSER GARAGE / 245`: Credit balance (Cr) — verify sign before import | WARNING | — |
| `04-suppliers.csv` | S011 `ABD HUSSAIN TRDG`: Blacklist=Yes — blocked from PO creation | ERROR | — |
| `04-suppliers.csv` | S012/S013/S014: Overseas suppliers (Jordan/UAE) — import VAT treatment required | WARNING | — |
| `03b` / `04b` aging | `Total Balance (SAR)` column is running-total artifact — must not be imported as per-invoice balance | WARNING | — |
| `03b` / `04b` aging | Dates in DD/MM/YYYY — auto-detect or reject non-ISO dates | WARNING | — |
| `05-opening-stock.csv` | `Opening Qty = -3` on `SUS-012` — negative opening stock | ERROR | — |
| `05-opening-stock.csv` | `XXX-INVALID-9999` has no matching master record | ERROR | — |
| `05-opening-stock.csv` | Duplicate `(Item Code, Location)` pair | WARNING | — |
| `05-opening-stock.csv` | ~3 rows `WAC Cost = 0.00` — zero-cost inventory | WARNING | — |
| `06-pdc-register.csv` | PDC-IN-007 `Status = BOUNCED` — must trigger bounce lifecycle, not collect as cash | ERROR | Z18 |
| `07-trial-balance.csv` | Total debits ≠ total credits — gap SAR 890.00 | ERROR | Z17 |
| `08-customers-windows1256.csv` | File is Windows-1256, no BOM — Arabic columns will mojibake if parser assumes UTF-8 | ERROR | — |

---

## Gotchas for Developers

1. **`Total Balance (SAR)` in aging files** is a Tally ledger running-total, not the per-invoice balance. The correct import column is `Balance (SAR)`. Importing the running-total column will double/triple-count the outstanding.

2. **DD/MM/YYYY dates** in aging files — do not assume ISO 8601. The date parser must handle this format or raise a clear error. A row like `15/01/2026` means 15 January, not 1st of the 15th month.

3. **Z3 trap is subtle** — `KHALED WORKSHOP / 170` has `VAT Registered = Yes` and a credit limit (looks like a normal B2B account) but the TRN is blank. The error only surfaces when a standard invoice is raised — not on customer import. Checklist must include a "create a standard invoice for this customer and expect block" step.

4. **`Standard Rate 15%` vs `Standard Rate (15%)`** (Z6) — the difference is the parentheses. These are different strings. The import mapper must NOT silently coerce one to the other; it must surface the mismatch and ask the user to confirm the correct tax group.

5. **BOUNCED PDC (Z18)** — the PDC register import may succeed, but the product's PDC lifecycle module must be tested separately: bounce a deposited cheque → AR must re-open, cash must debit back, audit log must record bounce event.

6. **Overseas supplier TRN is blank by design** — Jordan/UAE suppliers don't have Saudi TRNs. This is NOT a data error; the import pipeline must not reject them for missing TRN (only Saudi-registered suppliers carry TRNs).

7. **Tally 6-column TB format** — columns `Period Debit (SAR)` and `Period Credit (SAR)` are blank in this dataset (opening-balance only). The import must map `Opening Debit / Opening Credit` to the GL opening-balance fields and discard period columns.

8. **WAC=0 and blank cost coexist** — a blank `Cost Price` means "cost never recorded" (will use system default or block); `0.00` means cost was explicitly set to zero (WAC=0 trap — stock value silently = 0). The system should warn on both but for different reasons.
