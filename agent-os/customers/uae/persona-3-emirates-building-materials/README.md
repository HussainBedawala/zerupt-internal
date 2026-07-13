# Emirates Building Materials Trading LLC (شركة الإمارات لتجارة مواد البناء): Customer Requirements

> Large B2B building materials distributor with a Jebel Ali Free Zone location; Tier 3 (scale + specific requirements). Country: United Arab Emirates (AED). Intake date: 2026-07-09.

---

## At a glance

| Field | Detail |
|---|---|
| Legal name | Emirates Building Materials Trading LLC |
| Owner / GM | Faisal Al Nuaimi |
| Country | United Arab Emirates |
| Currency | AED (2 decimal places) |
| VAT / Tax | 5% standard; reverse charge on imports and Jebel Ali DZ->mainland movements |
| Seller TRN | 111619768197685 |
| Business type | B2B wholesale + retail counter; tiles, cement, paint, plumbing, electrical, tools, timber |
| Tier | Large: scale + specific requirements |
| Locations | 5 stores + 1 warehouse (6 total), one store INSIDE Jebel Ali Free Zone (Designated Zone) |
| Users | 20 to 30 |
| Items | ~8,500 (12 categories) |
| Customers | ~4,200 (contractors and trade accounts on credit) |
| Suppliers | ~180 (177 domestic, 3 foreign: China, India, Turkey) |
| Key complexity | Wholesale vs retail pricing, credit control, salesman/PDC, multi-warehouse, Designated Zone reverse charge, foreign-currency import VAT, B2B document flow at scale |

---

## 1. Business profile and legal

Emirates Building Materials Trading LLC distributes tiles and ceramics, cement and aggregates, paint, plumbing, electrical, hand and power tools, timber, fasteners, safety gear, adhesives, and measuring equipment across five UAE emirates. Trade/contractor accounts drive the majority of revenue; each store also serves retail walk-in trade.

The company is VAT-registered, TRN `111619768197685`. One of its six locations, **Jebel Ali Free Zone Store**, sits inside a Designated Zone (DZ) under UAE VAT law: goods physically transferred from this DZ location to any mainland location are treated as an import for VAT purposes and must self-account for VAT under the reverse charge mechanism, even though no money changes hands with a third party.

---

## 2. Locations and organisation structure

| Location | Type | VAT treatment |
|---|---|---|
| Al Quoz Store | Retail store | Mainland, standard |
| Sharjah Industrial Store | Retail store | Mainland, standard |
| Ajman Store | Retail store | Mainland, standard |
| Ras Al Khor Store | Retail store | Mainland, standard |
| Jebel Ali Free Zone Store | Retail store | **Designated Zone** — supplies within/between DZs are typically out-of-scope, but DZ -> mainland movements are treated as imports (reverse charge) |
| Central Warehouse (Al Quoz) | Warehouse (no retail) | Mainland |

Inter-branch transfers from Jebel Ali to any mainland store are tracked separately in `dz_mainland_transfers.csv` (15 sample transfers) and must trigger self-accounted reverse-charge VAT on the goods' value, distinct from ordinary inter-warehouse movements which have no VAT effect.

---

## 3. Users, roles and permissions

20 to 30 users: GM/Owner, Store Manager (per store), Warehouse Manager, Accountant, Salesman/Rep (4-6), Cashier (6-10), Warehouse Picker. Same cost-visibility rules as the equivalent Kuwait persona: cashiers and salesmen never see cost or margin; GM, store managers, accountant, warehouse manager do.

---

## 4. Products and inventory

**Catalog size:** ~8,500 SKUs across 12 categories: Tiles & Ceramics, Cement & Aggregates, Paint & Coatings, Plumbing, Electrical, Hand Tools, Power Tools, Timber & Boards, Fasteners, Safety Gear, Adhesives & Sealants, Measuring & Levelling.

**Identifiers:** SKU format `TILE-000001`, `CEM-000045`, etc. Barcode is the primary scan identifier.

**Pricing per item:** Cost, Wholesale/Trade Price, Retail (Sell) Price — mirrors the Kuwait large persona's two-tier structure.

**Multi-warehouse stock:** each item has a quantity at each of the 6 locations, in `opening_stock_by_warehouse.csv`.

**VAT dimension (new vs Kuwait):** every item carries an implicit `Standard 5%` tax treatment domestically. Cross-border and DZ movements are handled at the transaction/transfer level (Section 8), not per-item.

---

## 5. Pricing

Same two-tier structure as the equivalent large Kuwait persona: Retail (walk-in default) and Wholesale/Trade (all 4,200 named accounts default here). Both price tiers as stored in `item_master.xlsx` are treated as VAT-exclusive internally; VAT is added at invoice/receipt time per the applicable treatment (standard, zero-rated export, or reverse charge).

---

## 6. Customers and receivables

**Volume:** 4,200 accounts, predominantly UAE contractors and trade firms.

**Customer data captured:** Account No, Customer Name, Phone (UAE mobile 05X XXX XXXX), Credit Limit (AED), Outstanding Balance, Salesman, Payment Terms, **TRN**.

**TRN at scale:** roughly 92% of customer accounts carry a TRN; the remainder are blank — a smaller-scale version of the same mess exercised more aggressively in P2. Full tax invoices (required above AED 10,000, common at this business's order sizes) need the buyer's TRN; accounts without one must be flagged, not silently invoiced as if compliant.

**Credit control, salesman assignment, payment terms, aged receivables, customer statements:** identical structure and requirements to the Kuwait large persona (credit limit vs outstanding + open orders; four aging buckets; salesman field on every document; statements per account).

---

## 7. Suppliers, payables and purchasing

**Volume:** 180 suppliers (`suppliers.csv`): 177 domestic UAE suppliers (VAT-registered, TRN on file, AED, `Standard - Domestic` treatment) and **3 foreign suppliers** with no UAE TRN, foreign currency, and `Reverse Charge - Import` treatment:

| Vendor | Country | Currency | VAT Treatment |
|---|---|---|---|
| Shanghai Wanjia Building Materials Co | China | USD | Reverse Charge - Import |
| Anand Ceramics Pvt Ltd | India | USD | Reverse Charge - Import |
| Istanbul Yapi Malzemeleri Ltd | Turkey | EUR | Reverse Charge - Import |

For these three, the business self-accounts for import VAT (output and input both recorded by the buyer, net-zero cash effect but must appear on the VAT return) and separately carries FX exposure on the AP balance since the invoices are denominated in USD/EUR, not AED. Zerupt must not silently treat these as ordinary domestic AP.

---

## 8. Accounting and finance

**Opening trial balance:** `trial_balance.xlsx`, includes two VAT-related control accounts beyond the standard domestic one:

| Code | Account | Debit | Credit |
|------|---------|-------|--------|
| 1100 | Cash on Hand | 145,000.00 | |
| 1110 | Bank - FAB Current | 3,200,000.00 | |
| 1131 | Accounts Receivable - Trade | (per file, ~124.4M) | |
| 1141 | Inventory - Goods for Resale | (per file, ~466.2M) | |
| 1500 | Warehouse Equipment & Racking | 950,000.00 | |
| 2111 | Accounts Payable - Trade | | (per file, ~39.4M) |
| 2210 | VAT Payable | | 186,500.40 |
| 2211 | Reverse Charge VAT Payable (imports / DZ) | | 42,800.00 |
| 3901 | Share Capital | | (balancing) |

Balanced (no OBE plug on this persona — the mess here is structural/VAT-treatment complexity, not a bookkeeping error).

**Reverse Charge VAT Payable (2211)** is new versus the Kuwait persona and versus P1/P2 here: it isolates self-accounted VAT from foreign-supplier imports and Jebel Ali DZ-to-mainland transfers so the VAT return can report it on its own line, separate from ordinary output/input VAT.

**Fiscal year:** 1 January to 31 December. **Currency:** AED, 2 decimal places; foreign-currency supplier bills carry their own currency + an FX rate captured at invoice date.

---

## 9. Point of sale (POS)

Same structure as the Kuwait large persona (shift/float, barcode-first lookup at 8,500-item scale, wholesale-vs-retail auto price tier, credit-limit check on-account sales, split payment) but with 5% VAT added to every receipt line and payment methods extended to **Cash, card, Tabby, Tamara, On Account**.

---

## 10. Sales documents

Same B2B flow as Kuwait: `Quotation -> Confirmed Sales Order -> Delivery Note -> A4 Tax Invoice`, with the addition that:

- Invoices over **AED 10,000** must be issued as a **full tax invoice** (buyer name, address, TRN, invoice date, tax invoice number, itemised VAT). Below that threshold a simplified tax invoice is acceptable.
- Invoices against Jebel Ali DZ stock movements to a mainland customer must carry the reverse-charge notation.

140 open quotations in `open_quotations.csv` (unchanged in structure from Kuwait; project references now use UAE landmark names, e.g. "Tower - Business Bay", "Villa - Arabian Ranches", "Warehouse - Jebel Ali").

---

## 11. Printing and templates

Same three templates as Kuwait (retail receipt, A4 B2B invoice, warehouse picking list), with VAT summary lines added to the receipt and full/simplified tax invoice logic on the A4 template, plus TRN fields (seller always, buyer when on file and invoice is a full tax invoice).

---

## 12. Reporting and analytics

Adds, versus the Kuwait large persona:

- **VAT return summary:** standard output VAT, input VAT, reverse-charge VAT (imports + DZ transfers) on its own line, net payable.
- **TRN completeness report:** percentage of B2B accounts with TRN on file (target: monitor the ~8% currently missing).
- **DZ transfer log:** all Jebel Ali -> mainland movements with their self-accounted VAT value, for FTA audit trail.

All other reports (sales by branch/salesman/customer, inventory valuation, aged receivables/payables, PDC due/status, financials) mirror the Kuwait persona.

---

## 13. Data migration

**Import order:**

1. `trial_balance.xlsx`
2. `item_master.xlsx` (8,500 SKUs)
3. `opening_stock_by_warehouse.csv` (6 location columns, including Jebel Ali Free Zone Store)
4. `customers.csv` (4,200 accounts, incl. TRN column, ~8% blank)
5. `suppliers.csv` (180 vendors, 3 foreign with no TRN / foreign currency / reverse-charge treatment)
6. `pdc_register.csv` (220 cheques)
7. `open_quotations.csv` (140 open quotations)
8. `dz_mainland_transfers.csv` (15 sample Designated Zone -> mainland transfers; must NOT post as ordinary stock moves — each requires a self-accounted reverse-charge VAT entry)

**Known mess (mirrors Kuwait's messy-at-scale AR formats, plus new UAE dimensions):**

The `Outstanding Balance` column in `customers.csv` has the same five formats as the Kuwait persona (plain decimal, quoted comma-thousands, quoted comma-decimal/Euro, currency-prefixed `AED ...`, dash/blank) at 4,200-row scale.

**New for UAE:** the `suppliers.csv` file mixes 177 domestic rows (AED, TRN present) with 3 foreign rows (USD/EUR, TRN blank, `Reverse Charge - Import` treatment) in the same column set — the import pipeline must not force a TRN requirement on the foreign rows, and must not force an AED-only currency assumption across the whole file.

**Row-count reconciliation, xlsx multi-sheet handling, import performance/chunking:** identical requirements to the Kuwait large persona at the same scale (8,500 items / 4,200 customers).

---

## 14. Integrations and hardware

Same hardware set as the Kuwait large persona (barcode scanners, A4 printers, 80mm thermal printers at 5 retail counters, card/Tabby/Tamara terminals, cash drawers) plus: Jebel Ali store requires its stock movements to mainland to be logged distinctly (system-level requirement, not a hardware one) for the reverse-charge audit trail.

---

## 15. Operational details

| Parameter | Detail |
|---|---|
| Business hours | Typically 08:00-13:00 and 16:00-21:00, split-shift; may vary by store |
| Weekend | Saturday and Sunday (Dubai/Sharjah mainland stores); note Sharjah Industrial Store follows Dubai here since it is not the retail-consumer branch from P2 |
| Primary language | Arabic; English also used on all documents |
| Phone format | UAE mobile 05X XXX XXXX; +971 country code |
| Currency | AED, 2 decimal places; foreign supplier invoices in USD/EUR with FX rate captured at invoice date |
| Rounding | Standard rounding at 2dp; cash tender rounds to nearest 25 fils at the counter |
| VAT | 5% standard on domestic sales; reverse charge on foreign imports and DZ->mainland transfers; full tax invoice required above AED 10,000 |
| Fiscal year | 1 January to 31 December |
| Date format | DD/MM/YYYY for documents; ISO 8601 for data/exports |
| Timezone | Asia/Dubai |

---

## 16. Special or custom requirements

**Must-have for go-live (all Kuwait-equivalent requirements apply, plus):**

1. **Jebel Ali Designated Zone handling:** stock transfers from the Jebel Ali Free Zone Store to any mainland location must generate a self-accounted reverse-charge VAT entry, separate from an ordinary inter-warehouse transfer. This must be visible on the VAT return and in a dedicated DZ transfer log.
2. **Foreign-currency AP with reverse charge:** the 3 foreign suppliers must be recorded in their invoice currency (USD/EUR) with FX rate capture, self-accounted import VAT, and must not be forced into the domestic AED/TRN-required flow.
3. **Full vs simplified tax invoice threshold:** automatic switch to full tax invoice format (with buyer TRN) for any invoice over AED 10,000.
4. **TRN completeness monitoring:** ~8% of the 4,200 customer accounts have no TRN; dashboard/report to track and chase this down over time.
5. Wholesale/retail tiers, credit control, salesman assignment, PDC register, multi-warehouse, pack/UOM conversion, B2B document flow, and scale/performance requirements are unchanged from the Kuwait large persona.

---

## 17. Go-live expectations, training, phased rollout and success criteria

**Target go-live:** 4 to 6 weeks after data migration sign-off, phased rollout store-by-store (Al Quoz first, Jebel Ali and Central Warehouse mid-phase, full AR/credit control and VAT reporting live by phase 4) — same structure as the Kuwait large persona's phased plan.

**Success criteria (adds to the Kuwait equivalents):**
- Opening AR subledger ties to the imported TB AR control figure.
- A stock transfer from Jebel Ali to Al Quoz correctly posts a reverse-charge VAT entry and appears in the DZ transfer log.
- A foreign supplier invoice (USD) posts with the correct FX rate and appears on the VAT return as a reverse-charge line, not ordinary domestic input VAT.
- Any invoice over AED 10,000 automatically renders as a full tax invoice with buyer TRN (or a clear warning if the buyer has none on file).
- 5-location stock report ties to the sum of `opening_stock_by_warehouse.csv` after all sales and transfers on go-live day.

---

## 18. Open questions and risks

| # | Question / Risk | Owner | Priority |
|---|---|---|---|
| 1 | Jebel Ali DZ classification: confirm Zerupt's tax-treatment logic matches the FTA's current designated-zone list before go-live (DZ status can change). | Faisal + Zerupt | High |
| 2 | Foreign-currency AP: confirm which FX source rate (FTA-published vs bank rate) to use for reverse-charge valuation. | Faisal's accountant | High |
| 3 | ~8% of customer accounts missing TRN: confirm these are genuinely non-VAT-registered small contractors, not just unfilled data. | Faisal's accountant | Medium |
| 4 | `item_master.xlsx` active sheet: confirm Sheet1 is the correct data sheet. | Zerupt (Mira import) | High |
| 5 | PDC cheques with Status = Cleared: confirm these import as historical, no re-posting. | Faisal + Accountant | High |
| 6 | Open quotations must not post GL entries on import. | Faisal + Zerupt | High |
| 7 | Duplicate customer names (same contractor group, different account numbers): confirm intentionally separate accounts. | Faisal's accountant | Medium |
| 8 | Full tax invoice threshold (AED 10,000): confirm no exceptions requested for regular high-volume trade customers who prefer the simplified format. | Faisal | Low |

---

## Data file manifest

| File | What it is | Rows (excl. header) | Format | Known mess / quirk |
|---|---|---|---|---|
| `trial_balance.xlsx` | Opening trial balance | 9 accounts | Excel (.xlsx) | Includes VAT Payable (2210) and Reverse Charge VAT Payable (2211) as separate lines; balanced |
| `item_master.xlsx` | Full item catalog | 8,500 | Excel (.xlsx) | Pack/UOM mixed units; prices AED 2dp; SKU codes must be preserved exactly |
| `opening_stock_by_warehouse.csv` | Opening stock per item per location | 8,500 | CSV, UTF-8 | 6 location columns incl. Jebel Ali Free Zone Store; blank treated as zero |
| `customers.csv` | 4,200 trade/contractor accounts | 4,200 | CSV, UTF-8 with BOM | Outstanding Balance has 5 formats; TRN column ~8% blank; duplicate customer names across different account numbers |
| `suppliers.csv` | 180 vendor accounts | 180 | CSV, UTF-8 with BOM | 177 domestic (AED, TRN, Standard - Domestic); 3 foreign (China/India/Turkey; USD/EUR; no TRN; Reverse Charge - Import) |
| `pdc_register.csv` | 220 post-dated cheques | 220 | CSV, UTF-8 with BOM | Status On Hand / Deposited / Cleared; Cleared must not re-post |
| `open_quotations.csv` | 140 open quotations/sales orders | 140 | CSV, UTF-8 with BOM | Project Ref uses UAE landmark names; must not post GL entries |
| `dz_mainland_transfers.csv` | Jebel Ali (Designated Zone) -> mainland stock transfers | 15 | CSV, UTF-8 with BOM | Each row requires a self-accounted reverse-charge VAT entry, not an ordinary inter-warehouse transfer |
| `logo-ebm.png` / `logo-ebm.svg` | Company logo | n/a | PNG + SVG | Use on receipts and A4 documents |
