# P1 — Abu Khalid Legacy Migration Dataset

**Persona:** Abu Khalid, single-outlet auto parts trader, Al-Olaya industrial district, Riyadh, KSA.
**Revenue:** ~SAR 180k–300k/month. **VAT:** 15% KSA (ZATCA Phase 2). **Currency:** SAR.
**Incumbent systems:** Tally Prime (accounting/invoicing) + legacy FoxPro-era POS + Excel POs + WhatsApp + physical stock cards.
**Migration to:** Zerupt ERP (single outlet, full Phase 1–4 stack).

---

## Files

| File | Contents | Rows |
|------|----------|------|
| `01-items.csv` | ~120 SKUs — parts, oils, filters, batteries, kits | 120 |
| `02-customers.csv` | ~50 garages + walk-ins | 50 |
| `03-suppliers.csv` | ~20 suppliers incl. Jordan/UAE importers | 20 |
| `04-trial-balance.csv` | Tally-style group-indented TB, Dr/Cr columns | ~80 lines |
| `05-opening-stock.csv` | AL-OLAYA location, qty + WAC cost | ~115 rows |
| `06-customer-outstanding-aging.csv` | AR aging with PDC rows | ~58 rows |
| `07-supplier-outstanding-aging.csv` | AP aging with PDC rows | ~45 rows |
| `08-pdc-register.csv` | Post-dated cheque register (in + out) | 23 rows |

---

## Intentional Mess — What We Injected and Why

### 1. Item Name Mess (01-items)
- **ALL CAPS + heavy abbreviations + vehicle model/year embedded** (e.g. `SHOCK ABSORBER-FR-CAMRY-02-06`). Stresses: name parsing for catalog display, search normalization.
- **Cross-ref codes jammed into names** (`/3071/A5389`, `/MOOG`, `/GATES`). Stresses: barcode vs name separation, cross-reference import.
- **Barcode = item code, or item code + brand suffix, or BLANK.** Stresses: barcode uniqueness validation, null handling.
- **Duplicate items** (`AKS-003` and `AKS-004` — same item, different trailing space/casing, same barcode). Stresses: **duplicate SKU detection** during import.
- **Mixed unit casing** (`Pcs`/`PCS`/`pcs`/`Nos`/`set`/`Set`/`Ltrs`). Stresses: **unit normalization** — must map to canonical UoM before WAC computation.
- **Zero/blank cost prices** on ~20 SKUs (recon parts, high-value slow movers, unknown stock). Stresses: **WAC=0 trap** — cannot compute COGS without cost; import must warn and block or default.
- **Blank selling price** (`BRK-007`). Stresses: price validation.
- **Dummy/adjustment/test rows** (`ADJ-001` "123-Damy For Argestment", `ADJ-002` TEST ITEM). Stresses: junk row filtering — must not create ledger entries.
- **Composite kit items with cost=0** (`KIT-001`, `KIT-002`). Stresses: BOM vs stocked item distinction.
- **`FLT-011` — OIL FILTER 3071 with barcode `/3071/A5389`** and zero cost/price. Unknown legacy stock. Stresses: orphan item handling.

### 2. Customer Mess (02-customers)
- **Names with embedded account refs + areas** (`GARAGE AL-WATAN / 101`, `Cash Customer / MAHMMUD SURI / 553`). Stresses: name parsing, ref extraction for party ledger mapping.
- **TRN vs CR number confusion**: `C009` has a 14-digit number starting with `30` (CR format) in the TRN field; `C005` has `3100XXXXXX` (incomplete). Stresses: **ZATCA TRN validation** — must be 15 digits starting with `3`, flag malformed entries.
- **Missing TRNs on B2B accounts** claiming to be VAT-registered (`C007`, `C019`, `C046`). Stresses: ZATCA buyer-TRN enforcement on B2B invoices.
- **Mixed mobile formats**: `+966 50 123 4567`, `05-2345678`, `059-0123456`, blank. Stresses: phone normalization.
- **`"In Active"` (two words)** for status on inactive accounts. Stresses: status field parsing.
- **Three generic cash accounts** (`C001`, `C010`, `C042`). Stresses: de-duplication of catch-all parties, which to keep as default walk-in.
- **`C049`** — credit balance (-350 SAR) in the customer ledger from a supplier return posted in the wrong module. Stresses: balance-side validation.
- **`C050`** — owner personal account mixed into customer CRM. Stresses: party type segregation.
- **`C036`** — closed customer still has SAR 1,250 outstanding. Stresses: inactive-party balance reconciliation.
- **`C025` + `C048`** — over-limit customers with live balances. Stresses: credit limit enforcement on migration day-1.

### 3. Supplier Mess (03-suppliers)
- **`"Local General Purchase"` catch-all** — no TRN, no contact. Stresses: generic party handling, petty purchase classification.
- **`S016` name embeds location + account ref** (`ABD HUSSAIN TRDG (Sulabiya) / 314`). Stresses: same pattern as customers — ref extraction.
- **`S011` Jordan import** — no KSA TRN, `Net 60`. Stresses: cross-border supplier VAT treatment (import VAT reverse charge for KSA VAT filer).
- **`S017` BLACKLISTED** (`CHEAP PARTS WHOLESALE`). Stresses: blacklist flag import and enforcement.
- **`S020` blank test row.** Stresses: empty supplier filtering.
- **Old phone format** `012-3456789` on `S004`. Stresses: phone normalization.

### 4. Trial Balance Mess (04-trial-balance)
- **Tally quirks**: `Particulars` column name, `Dr`/`Cr` suffix on balances, `-----` indent hierarchy. Stresses: Tally CSV parser, group hierarchy mapping to Zerupt CoA.
- **Bank account titles include full account numbers + holder names** (`AL RAJHI BANK - SAR AC - 100234567890 / ABU KHALID`). Stresses: bank account extraction vs ledger name.
- **Cryptic account codes**: `X000000001` (suspense), `GM-SAL-001`, `AM-COS-001`, `SA-VAT-OUT-001`. Stresses: CoA code remapping.
- **Dual VAT control accounts** (`SA-VAT-OUT-001 VAT PAYABLE CONTROL`, `SA-VAT-INP-001 VAT RECOVERABLE CONTROL`). Stresses: 15% KSA VAT account mapping for ZATCA.
- **TB does not balance** — SAR 890 Dr difference noted inline. Stresses: Zerupt must detect and report TB imbalance before import, not silently absorb it.
- **`MISC SUPPLIER RETURN CREDIT`** in Sundry Debtors with a Cr balance. Stresses: balance-side flip detection.
- **PDC clearing accounts** (`PDC ISSUED`, `PDC RECEIVED`, `RIYAD BANK RESERVE - PDC CLEARING`). Stresses: PDC lifecycle account mapping.

### 5. Opening Stock Mess (05-opening-stock)
- **WAC = 0 on high-value items** (`AKS-006`, `BRK-007`, `ENG-007`, `TOY-001`). **WAC=0 trap**: Zerupt must warn; importing zero-cost stock silently destroys COGS accuracy.
- **Negative quantities** (`ENG-007` = -1, `TOY-003` = -2). Stresses: negative-stock validation — must block or warn, as WAC computation is undefined for negative qty.
- **Duplicate item** (`AKS-003` and `AKS-004`) both appear with stock. Stresses: which physical stock row wins on merge.
- **Dummy row** (`ADJ-001`) in stock file. Stresses: cross-file junk row consistency check.
- **Unit inconsistency vs items file** (e.g. `OIL-001` is `Ltrs` in items but `Pcs` for 4L packs). Stresses: unit-of-measure conflict resolution during WAC computation.
- **Kit items with zero stock + zero cost** included. Stresses: kit vs component stock handling.

### 6. AR Aging Mess (06-customer-outstanding-aging)
- **PDC rows embedded in aging** (`PDC-IN-001`, `PDC-IN-002`, `PDC-IN-003`) with negative amounts. Stresses: PDC as partial payment — must not double-count as cash receipt.
- **Credit note row** (`CR-NOTE-0022`) with negative amount. Stresses: credit note linkage to original invoice.
- **Bad-debt partial write-off row** (`BADDEBT-NOTE-001`). Stresses: write-off journal creation on migration.
- **`"-"` placeholders** for Paid column when not applicable. Stresses: null vs zero handling in numeric fields.
- **Running `Total Balance`** column — cumulative, not per-invoice. Stresses: must recalculate from individual balances, not import the running column.
- **AR total does not tie to TB** — SAR difference noted. Stresses: reconciliation gate before go-live.
- **Dates DD/MM/YYYY** throughout. Stresses: date format parsing (not MM/DD/YYYY which would silently corrupt data for days 1–12).
- **Old closed customer** with SAR 1,250 outstanding — no legal entity to collect from. Stresses: bad-debt provision workflow.

### 7. AP Aging Mess (07-supplier-outstanding-aging)
- **PDC issued rows** (`PDC-OUT-001` through `PDC-OUT-003`) — negative amounts reducing balance. Stresses: PDC-issued liability treatment, must not double-count as payment.
- **Debit note row** (`DEBIT-NOTE-001` for `ABD HUSSAIN TRDG`) — negative. Stresses: supplier debit note linkage.
- **GRN without invoice** (`PUR-2404-0022` DENSO — `-` in Bill Amount). Stresses: accrued payable / GRN-not-invoiced handling.
- **AP total does not tie to TB** — SAR 5,800 gap. Stresses: AP reconciliation gate.
- **MISC IMPORT CLEARING** SAR 3,200 — 150 days old, unresolved. Stresses: orphan liability resolution.

### 8. PDC Register Mess (08-pdc-register)
- **`PDC-IN-015`** — unidentified cheque found in safe, party unknown, date unknown. Stresses: PDC matching workflow.
- **`PDC-IN-009` BOUNCED** (`ZARQA TRANSPORT`). Stresses: bounced-cheque reversal journal, re-posting of original receivable.
- **Batched PDCs** (`CH-JUMA-MULTI-01/02`) — two cheques from one party in one go. Stresses: multi-PDC batch import.
- **PDC register maintained outside Tally** (WhatsApp notes + Excel). Stresses: completeness — PDCs in register may not all be posted in TB; reconciliation required.
- **Status values**: `Pending Deposit`, `Deposited`, `Cleared`, `Presented`, `BOUNCED`, `Unidentified` — inconsistent across rows. Stresses: status normalization to Zerupt PDC lifecycle states.
- **Verbal approval** for over-limit PDC (`PDC-IN-010` — Noman Fleet). Stresses: audit trail; Zerupt must require explicit credit-limit override approval recorded in system.

---

## Key Migration Audit Concerns (Summary)

| Risk | Source Files | Zerupt Edge Case |
|------|-------------|-----------------|
| WAC = 0 on non-zero-qty items | 01, 05 | COGS will be zero; must block or flag before import |
| Negative opening stock | 05 | Undefined WAC; block import, force manual resolution |
| Duplicate SKUs (same barcode) | 01, 05 | Must deduplicate before creating item master |
| TRN vs CR number confusion | 02 | ZATCA Phase 2 e-invoicing will reject if buyer TRN invalid |
| Missing buyer TRN on B2B | 02 | ZATCA requires TRN on full tax invoices > SAR 1,000 |
| TB does not balance | 04 | Zerupt must fail import with imbalance amount, not absorb |
| PDC not in Tally (WhatsApp-only) | 08 | PDC register must be reconciled to TB before go-live |
| Bounced PDC | 08 | Reversal journal + re-open receivable |
| Unit chaos | 01, 05 | Canonical UoM mapping required before WAC recompute |
| Credit balance in Debtors | 02, 06 | Reclassify as Advance Received or supplier credit |
| Over-limit customers with balance | 02 | Credit limit enforcement from day 1 |
| Inactive customers with open balance | 02, 06 | Require write-off decision before migration |
| GRN-not-invoiced (DENSO) | 07 | Accrued AP or hold for matching |
| Embedded bank account numbers in TB | 04 | Strip from ledger name; store in bank account master |
| Junk/dummy rows | 01, 05 | Filter by flag or pattern before creating records |
