# Gulf Hardware & Tools Co. (شركة الخليج للأدوات): Customer Requirements

> Large B2B hardware and tools distributor; Tier 3 (scale + specific requirements). Country: Kuwait (KWD, 3-decimal fils). Intake date: 2026-06-15.

---

## At a glance

| Field | Detail |
|---|---|
| Legal name | Gulf Hardware & Tools Co. (شركة الخليج للأدوات) |
| Trade name | Gulf Hardware |
| Owner / GM | Mishari Al-Rashid |
| Country | Kuwait |
| Currency | KWD (Kuwaiti Dinar, 3 decimal places / fils) |
| VAT / Tax | None (Kuwait has no VAT) |
| Business type | B2B wholesale + retail walk-in; hardware, tools, and building materials distributor |
| Tier | Large: scale + specific requirements |
| Locations | 4 retail stores + 1 Central Warehouse (5 total) |
| Users | 20 to 30 |
| Items | ~8,500 (12 categories, mixed pack and UOM units) |
| Customers | ~4,200 (predominantly contractors and trade accounts on credit) |
| Suppliers | ~180 |
| Key complexity | Wholesale vs retail pricing, credit control, salesman assignment, PDC management, multi-warehouse, pack/UOM conversion, B2B document flow, large-volume imports |

---

## 1. Business profile and legal

Gulf Hardware & Tools Co. is a well-established hardware and tools distributor operating in Kuwait since the early 2000s. The company serves two distinct customer segments: trade and contractor accounts that buy on credit (the majority of revenue) and walk-in retail customers at the store counters.

The product range spans hand tools, power tools, plumbing and electrical fittings, safety equipment, garden and outdoor, fasteners and fixings, and general building supplies across 12 categories. Average order values on the trade side are in the hundreds of KWD; retail counter sales are smaller but frequent.

The business is registered in Kuwait. No VAT applies. Document language is bilingual Arabic and English; the Arabic trading name is displayed on all customer-facing documents.

---

## 2. Locations and organisation structure

| Location | Type | Role |
|---|---|---|
| Shuwaikh WH | Store / Warehouse | HQ and primary receiving point |
| Ardiya Store | Retail store | Southside trade and retail |
| Fahaheel Store | Retail store | Southern Kuwait, contractor walk-in |
| Jahra Store | Retail store | Western Kuwait, retail and small contractors |
| Central Warehouse | Warehouse (no retail) | Bulk reserve; supplies the stores |

Shuwaikh WH is the HQ location and the default for purchase receiving. Central Warehouse holds bulk reserve stock and fulfils inter-warehouse transfer requests. The four retail stores each have their own inventory position, their own cashiers, and their own receipt headers.

Inter-warehouse transfers are common: stores request replenishment from Central Warehouse; Central Warehouse pushes slow-moving stock to stores with higher turnover. Transfer documents must show the source location, destination location, items, quantities, and the date. The warehouse team generates picking lists from transfer requests and from large B2B delivery notes.

---

## 3. Users, roles and permissions

The system will have between 20 and 30 users across all five locations. Expected roles:

| Role | Typical count | Permissions |
|---|---|---|
| GM / Owner (Mishari) | 1 | Full access across all locations; all reports; cost and margin visibility |
| Store Manager | 4 (one per store) | Full access to own branch; read-only on other branches; can see cost prices |
| Warehouse Manager | 1 | Stock management, transfers, picking; no POS; no financials |
| Accountant | 1 | Full accounting and financial reports; read-only on inventory; no POS |
| Salesman / Rep | 4 to 6 | Create and manage quotations and sales orders for assigned customers; no cost visibility; no banking |
| Cashier | 6 to 10 | POS only; cannot see cost prices; cannot edit or delete completed transactions |
| Warehouse Picker | 2 to 3 | Print and confirm picking lists; no price visibility |

Cost-price visibility must be restricted to GM, store managers, accountant, and warehouse manager. Cashiers and salesmen must not see cost or margin. The GM must be able to restrict or grant any permission per user.

---

## 4. Products and inventory

**Catalog size:** approximately 8,500 active SKUs across 12 categories.

**Categories (12):** Hand Tools, Power Tools, Plumbing, Electrical, Safety & PPE, Garden & Outdoor, Fasteners & Fixings, Paint & Coatings, Storage & Shelving, General Hardware, Machinery & Equipment, Cleaning Supplies.

**Identifiers:** each item has a unique SKU code (format: `HAND-000001`, `PLMB-000045`, etc.) and a barcode. The barcode is the primary scan identifier at the POS counter and on picking lists.

**Pack and UOM units:** items are bought and received in packs (Box, Dozen, Roll, Set, Bag) and sold in the base selling unit (Each, Metre, Litre, etc.). The system must store a base-unit conversion factor per item (e.g., 1 Box = 12 Each; 1 Dozen = 12 Each; 1 Roll = 50 Metres) and apply it consistently across POS, sales documents, purchase orders, and stock on hand. A user scanning a box barcode at the POS counter must see "1 Box" resolved to 12 units deducted from stock automatically.

**Pricing per item:** Cost Price, Retail Price, Wholesale/Trade Price (minimum two price tiers required; see Section 5).

**Images:** not critical for launch but the system should accept product images for the catalog.

**Multi-warehouse stock:** each item has a stock quantity at each of the five locations. Opening stock is provided per warehouse in `opening_stock_by_warehouse.csv`. Stock movements from POS sales, delivery notes, and inter-warehouse transfers must be posted to the correct warehouse.

**Transfers:** inter-warehouse transfer requests generate a picking list at the source warehouse. The warehouse team confirms despatch; stock moves from source to destination when confirmed. Partial fulfilment must be possible.

**Picking lists:** for B2B delivery notes and inter-warehouse transfers; must show item code, name, location/bin if any, ordered quantity, picked quantity, and barcode (for scan-confirm workflows). A4 print format.

---

## 5. Pricing

**Price tiers required:**

| Tier | Description | Applied to |
|---|---|---|
| Retail Price | Standard counter price | Walk-in customers; default |
| Wholesale / Trade Price | Discounted trade price | Contractor and trade accounts |

All 4,200 customer accounts are on the trade/wholesale tier by default. Walk-in (anonymous) POS customers default to retail price.

**Price by customer type:** when a sales order or POS sale is raised against a named customer account, the system must automatically apply their price tier (Wholesale vs Retail) without requiring the salesman to select it manually.

**Special / per-customer pricing (nice to have for launch, required within 6 months):** some high-volume contractors have negotiated individual item prices that override the standard wholesale tier. The system should allow setting a special price per customer per item, or a blanket percentage discount per customer. For the go-live date, the standard two-tier approach is sufficient.

**Margin visibility:** selling below cost must be blocked or require GM approval (configurable).

---

## 6. Customers and receivables

**Volume:** 4,200 accounts. The vast majority are trade accounts (contractors, subcontractors, maintenance companies, fit-out firms). There are a small number of retail walk-in accounts; most walk-in sales do not require a named account.

**Customer data captured:** Account No, Customer Name, Phone (Kuwait 8-digit mobile, +965 prefix), Credit Limit (KWD), Outstanding Balance (opening balance at migration date), Salesman (assigned rep), Payment Terms.

**Credit control (must-have):**
- Each account has a Credit Limit in KWD.
- At POS and when raising a sales order, the system must check available credit (Credit Limit minus outstanding balance minus unposted open orders).
- If the transaction would exceed the credit limit, the system must warn the cashier or salesman and block the transaction (configurable: warn-only vs hard block per customer or globally).
- The GM and accountant must be able to override a credit-block with their credentials.
- Accounts with no credit limit set (blank field in the import) are treated as cash-only or COD accounts.

**Salesman assignment:** each customer is assigned to one of four to six salesmen (Rakesh, Anwar, Mahmoud, Joseph, Suresh, Khaled in the data). This assignment must be stored per customer and appear on all sales documents raised for that customer. Sales performance reporting (sales by salesman, AR aging by salesman) is required. Commission calculation is a nice-to-have for post-launch.

**Payment terms per customer:** Cash, COD, 30 days, 45 days, 60 days, 90 days. Terms drive the due date on invoices and the aging bucket classification.

**Aged receivables:** four aging buckets: Current (not yet due), 1 to 30 days overdue, 31 to 60 days, 61 to 90 days, 90+ days. Report must be filterable by salesman and by store/branch. Totals must tie to the AR control account in the GL.

**Customer statements:** printable and emailable A4 statement per customer showing opening balance, each transaction with date and document reference, and closing balance for a selected period.

---

## 7. Suppliers, payables and purchasing

**Volume:** 180 suppliers. Data file: `suppliers.csv` (columns: Vendor Code, Supplier Name, Phone, Outstanding balance at migration date).

**Purchase workflow:** Purchase Requisition (optional) to Purchase Order to Goods Receipt Note (GRN) to Supplier Invoice to Payment. The GRN is the trigger for updating warehouse stock and posting to AP.

**Lead times:** to be entered per supplier post-go-live; not in the migration data.

**Payment terms per supplier:** to be configured per supplier post-go-live; not detailed in the migration file. Common terms in the trade are 30 to 60 days net.

**AP aging:** same four-bucket structure as AR, reconciled to the AP control account.

**Supplier statements and remittances:** A4 remittance advice to accompany payments; supplier statement reconciliation view.

---

## 8. Accounting and finance

**Opening trial balance:** provided in `trial_balance.xlsx`. This is a large multi-account TB representing the closing balances of the prior system as of the conversion date. It includes the AR and AP control totals; these must not be double-posted when customer and supplier opening balances are also imported.

**Chart of accounts:** standard Kuwait commercial COA. Five top-level categories: Assets, Liabilities, Equity, Revenue, Expenses. Sub-accounts for each store's revenue and cost lines are preferred but can be configured post-go-live.

**Fiscal year:** January 1 to December 31.

**Currency:** KWD only. No multi-currency requirement at launch. All amounts stored and displayed to 3 decimal places (fils). Rounding rule: round half up at the fils level. Report totals must not lose sub-fils precision through intermediate rounding.

**VAT / Tax:** none. Kuwait has no VAT. All documents must omit VAT lines entirely; no "0% VAT" row on invoices.

**Banks:** the company uses 2 to 3 Kuwaiti banks (names to be provided during setup). Bank accounts mapped to the COA. Payment receipts are posted as: KNET terminal receipts, cash deposits, and cheque clearances.

**PDC (post-dated cheque) management (must-have):**
Post-dated cheques are a primary collection instrument for trade receivables in Kuwait. The requirements are:

- Register each cheque received: Cheque Number, linked Customer Account, Bank (drawer's bank), Amount (KWD), Cheque Date (the date on the cheque face, which is in the future at time of receipt), and Status.
- Status lifecycle: On Hand (received but not yet deposited), Deposited (sent to the bank, awaiting clearing), Cleared (funds confirmed received), Bounced (returned by the bank).
- At receipt, the cheque is logged but does not yet credit the customer's AR balance; it sits in a "PDC Receivable" holding account.
- When a cheque moves to Deposited, a bank transaction is created (debit bank, credit PDC Receivable). When Cleared, the AR balance is credited (debit PDC Receivable, credit AR).
- Due-date reminders: the system must generate a report or notification of cheques falling due within the next N days (configurable, e.g., 7 days). The accountant checks this daily before bank runs.
- Bounced cheques: must reverse the clearing entry, return the balance to AR, and flag the customer for review. A bounced-cheque fee is sometimes charged; this must be postable as a manual journal or debit note.
- The migration PDC register (`pdc_register.csv`) contains 220 cheques with statuses On Hand, Deposited, and Cleared. These must be imported with their existing statuses; Cleared cheques are historical and should not re-post.

---

## 9. Point of sale (POS)

**Counter setup:** each of the four retail stores has a POS counter. Shuwaikh WH also has a counter for trade pick-up sales. Central Warehouse does not have a retail counter.

**Session / shift:** cashier opens a shift with a float declaration; closes the shift with a cash count; system reconciles cash expected vs counted and highlights any difference.

**Item lookup:** by barcode scan (primary), by SKU, or by name search. At 8,500 items, name search must return results within 1 to 2 seconds; partial-match search is expected.

**Price tier at POS:** if the customer is a named account, the wholesale price applies automatically. For anonymous counter sales, retail price applies.

**Payment methods:** Cash (change-due calculation in fils), KNET (terminal reference number recorded), On Account (posts to the named customer's AR; requires credit check). Split payment between cash and KNET is required.

**Credit limit check at POS:** before completing an "On Account" sale, the system must verify available credit. If over-limit, either block or require GM-level override (see Section 6).

**No VAT:** the POS receipt must not show any tax line.

**Receipt:** 80mm thermal receipt (see Section 11).

**Stock location:** the POS at each store deducts from that store's warehouse stock.

---

## 10. Sales documents

**B2B document flow:**

```
Quotation (QT) -> Confirmed Sales Order (SO) -> Delivery Note (DN) -> A4 Tax Invoice (INV)
```

Each stage must reference the prior document number(s). The flow is partially fulfilled: a single SO may produce multiple partial DNs and invoices.

**Quotation:** issued to a customer for a project or bulk inquiry. Must carry: quotation number (QT-YYYY-XXXX format), date, validity period, customer details, salesman, line items with wholesale price and quantity, subtotal, and any project reference. Status: Quotation, Confirmed Order, Part-Delivered, Closed/Cancelled.

**Sales Order:** created from a confirmed quotation or directly. Links to quotation number. Triggers credit check.

**Delivery Note:** picking document for the warehouse team. Lists items to be picked, their warehouse location, and the customer delivery address. Confirms physical despatch; updates stock on hand. Partial DNs allowed.

**A4 Invoice:** issued on or after delivery. References the DN and SO numbers. Shows customer's trade price, no VAT, terms and due date based on payment terms, bank details for wire transfer, and company stamp area.

**Project Reference:** many B2B orders relate to construction projects (Villa - Salwa, Tower - Sharq, Warehouse, Fit-out, Maintenance, etc.). The project reference field must appear on QT, SO, DN, and INV and must be searchable and filterable in reports.

**Open quotations at migration:** 140 open quotations are in `open_quotations.csv` with statuses Quotation, Confirmed Order, and Part-Delivered. These must be imported as open documents visible in the sales pipeline; they should not post to the GL (they are not yet delivered/invoiced).

---

## 11. Printing and templates

**Three print templates required:**

| Template | Format | Use |
|---|---|---|
| Retail receipt | 80mm thermal | Counter POS sales at all stores |
| A4 B2B invoice | A4 portrait | Trade invoices, statements, quotations |
| Warehouse picking list | A4 landscape | Inter-warehouse transfers, B2B delivery notes |

**Retail receipt (80mm):**
- Logo at top (Gulf Hardware logo PNG/SVG)
- Branch name and address
- Date, time, cashier name, shift number
- Line items: item name (bilingual AR/EN), quantity, unit, unit price, line total
- Subtotal, no VAT, total in KWD
- Payment method and change due
- Document number (RCP-YYYY-XXXXX format)
- Thank-you message in Arabic and English

**A4 B2B invoice:**
- Gulf Hardware letterhead with logo, company name in Arabic and English, address, phone, CR number
- Invoice number (INV-YYYY-XXXXX), date, due date, payment terms
- Customer name (AR and EN), account number, salesman name
- Project reference (if present)
- Line items: SKU, description (bilingual), quantity, unit, unit price (trade), line total
- Subtotal; no VAT line; grand total in KWD (numeric and written in Arabic)
- Bank transfer details for electronic payment
- Signature and stamp area

**Warehouse picking list (A4 landscape):**
- Document header: transfer number or DN number, source location, destination, date
- Line items: item code, barcode, description, ordered qty, picked qty (blank for manual fill), unit
- Footer: prepared-by and confirmed-by signature lines

**Document numbering schemes:**
- Quotation: QT-YYYY-XXXX (sequential per year)
- Sales Order: SO-YYYY-XXXX
- Delivery Note: DN-YYYY-XXXX
- Invoice: INV-YYYY-XXXXX
- POS Receipt: RCP-YYYY-XXXXX
- Transfer: TRF-YYYY-XXXX
- PDC Register: CHQ-XXXXXX (matches the format in the migration file)

**Language:** all documents bilingual. Arabic on the right, English on the left (or stacked AR above EN for line items on narrow receipts). RTL rendering must be correct.

---

## 12. Reporting and analytics

**Sales reports:**
- Sales by branch (daily, weekly, monthly, custom range)
- Sales by salesman (volume and value; filterable by date and branch)
- Sales by customer (top customers by revenue; filterable by salesman)
- Sales by category and item

**Inventory reports:**
- Stock on hand by warehouse (all 5 locations; exportable to Excel)
- Inventory valuation: Σ(qty x cost) per item and per category; grand total must tie to the inventory asset account in the GL
- Slow-moving stock (items with no sales in X days)
- Transfer history

**Accounts receivable:**
- Aged receivables report (four buckets; by salesman; by branch)
- Customer statements (per-account; custom date range)
- PDC due report (cheques falling due in the next N days; grouped by bank)
- PDC status report (all cheques by status: On Hand / Deposited / Cleared / Bounced)

**Accounts payable:**
- Aged payables (four buckets)
- Supplier statements

**Financial:**
- Profit and Loss (consolidated and per-branch where possible)
- Balance sheet
- Trial balance at any date

**Performance:**
- At 8,500 items and 4,200 customers, all list screens must paginate or use virtualised scroll; reports must not timeout. The GM expects any standard report to open in under 5 seconds.

---

## 13. Data migration

**Import order (must follow this sequence):**

1. `trial_balance.xlsx`: opens the books with correct opening balances; AR and AP control totals defined here.
2. `item_master.xlsx`: loads all 8,500 SKUs with categories, UOM, pack units, costs, prices, barcodes.
3. `opening_stock_by_warehouse.csv`: distributes stock across the 5 warehouse columns.
4. `customers.csv`: 4,200 customer accounts with credit limits, outstanding balances, salesman, payment terms.
5. `suppliers.csv`: 180 vendor accounts with outstanding balances.
6. `pdc_register.csv`: 220 post-dated cheques with current statuses.
7. `open_quotations.csv`: 140 open quotations/sales orders (no GL posting; open-pipeline visibility only).

**Known mess and what the system must handle (do not dead-end on any of these):**

The `Outstanding Balance` column in `customers.csv` contains at least five distinct formats across 4,200 rows:

| Format seen | Example | Required handling |
|---|---|---|
| Plain decimal | `1242.49` | Direct parse |
| Quoted comma-thousands (Anglo) | `"1,609.33"` | Strip commas |
| Quoted comma-decimal (Euro/Arab locale) | `"211,94"` or `"1.135,52"` | Swap separator; treat comma as decimal point |
| Currency-prefixed | `KWD 1781.40` or `KWD 630.20` | Strip prefix, parse remainder |
| Dash or blank | `-` or `` | Treat as zero outstanding |

The AI import pipeline must detect the format in context (not per-cell in isolation) and parse the full 4,200-row file consistently. After parsing, the system must display a reconciliation summary: number of rows parsed, sum of balances imported, number of zero or blank balances, so that the accountant can verify the total AR subledger before confirming the import.

**Duplicate customer names:** common contractor group names (e.g., "Fahad Builders", "Kazma Contracting Co", "Desert Interiors") appear under multiple account numbers. These are legitimate separate accounts (different CR numbers or locations); the system must not silently de-duplicate them. If the AI detects potential duplicates it must surface them for review, not merge them automatically.

**Phone lengths:** Kuwait mobile numbers are 8 digits. Some rows may have +965 prefix prepended; the system should normalise to the 8-digit local form for display and accept both formats at import.

**xlsx files:** `item_master.xlsx` and `trial_balance.xlsx` are Excel files. The import pipeline must handle ExcelJS multi-sheet parsing. If the active sheet is not the first sheet, Mira must identify the correct data sheet. The 5 MB import cap applies; `item_master.xlsx` is approximately 476 KB and `trial_balance.xlsx` is approximately 5 KB, both well within the cap. If any file approaches or exceeds the cap the system must reject it with a clear error message, not silently truncate.

**Row-count reconciliation (critical):** after each import, the system must display: rows in file, rows successfully imported, rows skipped or flagged, and any parsing warnings. The accountant will cross-check the row count against the source file. Any silent truncation or sampling that does not apply to all rows is unacceptable.

**Import performance:** with 8,500 items and 4,200 customers, the import jobs will be the largest the system has processed. Timeouts, partial commits, and memory issues must not occur. Chunk-and-recover import architecture is expected.

---

## 14. Integrations and hardware

| Item | Detail |
|---|---|
| Barcode scanners | USB or Bluetooth handheld scanners at each store counter and at the Central Warehouse; standard HID input |
| A4 printers | One per store + one at Central Warehouse for invoices, delivery notes, and picking lists |
| Thermal printers | 80mm thermal receipt printer at each store counter (5 units) |
| KNET terminals | One per store counter; KNET reference numbers entered manually into the system at this stage |
| Cash drawers | One per store counter; triggered on cash sale completion |
| Internet | Fixed DSL or fibre at each location; mobile 4G backup |
| Integrations | None required at launch; future: direct KNET API integration for automated reconciliation |

---

## 15. Operational details

| Parameter | Detail |
|---|---|
| Business hours | Typically 08:00 to 13:00 and 16:00 to 21:00 (Kuwaiti split-shift; may vary by store) |
| Weekend | Friday and Saturday (closed or reduced hours); Sunday is a working day |
| Primary language | Arabic; English also used on all documents |
| Phone format | 8-digit Kuwait mobile; +965 country code; no spaces or dashes in stored format |
| Currency symbol | KD or KWD; 3 decimal places; example: KD 1,234.500 |
| Number format | Anglo format (period as decimal separator, comma as thousands separator) in the system UI; the import pipeline must also accept European locale formats from legacy data |
| Rounding | Round half-up at the fils (third decimal) level; no intermediate truncation |
| No VAT | Tax field hidden or zero on all documents; no VAT registration number |
| Fiscal year | 1 January to 31 December |
| Date format | DD/MM/YYYY for documents; ISO 8601 (YYYY-MM-DD) for data and exports |

---

## 16. Special or custom requirements

**Must-have for go-live:**

1. **Wholesale vs retail price tier**: two prices per item; auto-apply by customer type at POS and on sales documents.
2. **Credit control**: credit limit stored per customer; warn or block at POS and sales order creation; available-credit calculation includes open orders; GM override.
3. **Salesman assignment**: salesman field stored per customer; shown on all sales documents; sales-by-salesman report.
4. **Payment terms per customer**: drives invoice due date and aging bucket.
5. **PDC register**: full lifecycle: On Hand, Deposited, Cleared, Bounced; holding account mechanics; due-date report; migration of existing 220 cheques with status preservation.
6. **Multi-warehouse stock**: five stock locations; inter-warehouse transfers; picking lists; per-warehouse stock report.
7. **Pack / UOM base-unit conversion**: buy in Box/Dozen/Roll/Bag, sell in Each/Metre; conversion factor stored and applied across all modules (POS, sales, purchase, stock).
8. **B2B document flow**: Quotation to Sales Order to Delivery Note to A4 Invoice; project reference field on all four document types.
9. **A4 invoice and picking-list print templates**: bilingual AR/EN; company letterhead.
10. **Scale and performance**: 8,500-item search under 2 seconds; 4,200-customer list with pagination; import with row-count reconciliation; no silent truncation.

**Nice-to-have (target within 6 months of go-live):**

- Per-customer special pricing (override the standard wholesale tier on a per-item or per-percentage basis).
- Salesman commission calculation and commission report.
- Direct KNET API integration for automated terminal reconciliation.
- Customer portal for statement and invoice download (self-service).
- Reorder point and suggested purchase order generation based on stock levels and lead times.
- Mobile app for salesmen (quotation creation and customer balance check in the field).

---

## 17. Go-live expectations, training, phased rollout and success criteria

**Target go-live:** approximately 4 to 6 weeks after system setup and data migration sign-off.

**Phased rollout:**

| Phase | Scope | Duration |
|---|---|---|
| Phase 1 | Shuwaikh WH only; POS, inventory, basic invoicing | Weeks 1 to 2 |
| Phase 2 | Add Central Warehouse; inter-warehouse transfers | Week 3 |
| Phase 3 | Roll out remaining 3 stores; full AR/credit control | Weeks 4 to 5 |
| Phase 4 | Accounting sign-off; PDC management; reporting live | Week 6 |

**Training requirements:**
- GM and accountant: full system training (accounting, reporting, PDC, user management).
- Store managers: inventory, sales documents, customer AR, branch reporting.
- Cashiers: POS operation, shift open/close, payment methods, credit-limit responses.
- Warehouse team: transfer requests, picking list print and confirm, GRN.
- Salesmen: quotation to invoice flow, customer account management, AR statements.

**Success criteria:**
- Opening AR subledger total matches the imported TB AR control figure (zero discrepancy).
- Pack/UOM conversion verified: scan a Box barcode at POS, confirm 12 Each deducted from stock.
- A POS sale with an over-credit-limit customer is blocked (or warns and requires override).
- A PDC cheque moved from On Hand to Deposited posts the correct journal entry automatically.
- 5-warehouse stock report totals tie to the sum of `opening_stock_by_warehouse.csv` after all sales and transfers on the go-live day.
- Any standard report (aged receivables, inventory valuation) opens in under 5 seconds on the live tenant.

---

## 18. Open questions and risks

| # | Question / Risk | Owner | Priority |
|---|---|---|---|
| 1 | Excel `item_master.xlsx`: confirm which sheet contains the item data (Sheet1 assumed); Mira must identify the active data sheet correctly. | Zerupt (Mira import) | High |
| 2 | PDC migration: cheques with Status = Cleared represent historical cleared cheques. Confirm these should be imported as closed/historical records and not re-trigger any journal entry. | Mishari + Accountant | High |
| 3 | Open quotations: confirm that importing open QT/SO records does not post any GL entries. Only confirmed delivered invoices should post revenue. | Mishari + Zerupt | High |
| 4 | Duplicate customer accounts: approximately 15 to 20 customer names appear multiple times with different account numbers. Confirm these are intentionally separate accounts before import. | Mishari's accountant | Medium |
| 5 | Credit limit for blank-limit customers: the import data has some customers with no credit limit value. Confirm the intended behaviour: zero-limit (cash/COD only) or unlimited. | Mishari | Medium |
| 6 | Salesman names in the data (Rakesh, Anwar, Mahmoud, Joseph, Suresh, Khaled) must be created as Zerupt user accounts or as non-login salesman records before import. Clarify which. | Mishari + Zerupt | Medium |
| 7 | Payment terms column in `customers.csv` has a data quality issue: some rows contain a salesman name in the payment terms column and vice versa (column shift). The AI must detect and flag these rows rather than silently importing wrong values. | Zerupt (Mira) | High |
| 8 | Wholesale price tier name: confirm the system calls it "Wholesale" or "Trade" on customer-facing documents. Gulf Hardware staff use "Trade Price" internally. | Mishari | Low |
| 9 | Multi-currency future requirement: any KWD-only items (tools sourced internationally) where the supplier invoice arrives in USD? If yes, multi-currency AP may be needed sooner than anticipated. | Mishari | Low |
| 10 | 5 MB import cap: `item_master.xlsx` is 476 KB (safe). If the file is regenerated with images or additional columns and crosses the cap, the system must reject clearly. Confirm cap behaviour with Zerupt. | Zerupt | Medium |

---

## Data file manifest

| File | What it is | Rows (excl. header) | Format | Known mess / quirk |
|---|---|---|---|---|
| `trial_balance.xlsx` | Opening trial balance for book conversion | ~50 to 100 accounts (est.) | Excel (.xlsx), single sheet | Large multi-account TB; AR and AP control totals must not double-post with customer/supplier imports; conversion date must be confirmed before posting |
| `item_master.xlsx` | Full item catalog: SKU, name, category, unit/pack, cost, wholesale price, sell price, barcode | 8,500 | Excel (.xlsx); exercises ExcelJS multi-sheet parsing | Pack/UOM unit column contains mixed values (Each, Box, Pack, Dozen, Roll, Set, Bag); prices are KWD to 3 decimal places; must preserve SKU codes exactly |
| `opening_stock_by_warehouse.csv` | Opening stock quantities per item per warehouse | 8,500 | CSV, UTF-8; 5 warehouse columns | Columns: Code, Name, Shuwaikh WH, Ardiya Store, Fahaheel Store, Jahra Store, Central Warehouse; some items have zero stock in several warehouses (blank treated as zero) |
| `customers.csv` | 4,200 trade and contractor customer accounts | 4,200 | CSV, UTF-8 with BOM | Outstanding Balance column has at least 5 formats: plain decimal, quoted comma-thousands (Anglo), quoted period-thousands/comma-decimal (Euro locale), KWD-prefixed, and dash/blank; some rows appear to have Payment Terms and Salesman columns shifted; duplicate customer names with different account numbers |
| `suppliers.csv` | 180 vendor accounts | 180 | CSV, UTF-8 with BOM | Outstanding Balance is a plain decimal; relatively clean; phone numbers are 8-digit landline (not mobile) for some suppliers |
| `pdc_register.csv` | 220 post-dated cheques received from customers | 220 | CSV, UTF-8 with BOM | Status values: On Hand, Deposited, Cleared; Cleared cheques must be imported as historical and not re-post; Cheque Date is the future-dated face date (not receipt date); amounts are quoted comma-thousands |
| `open_quotations.csv` | 140 open quotations and sales orders in the pipeline | 140 | CSV, UTF-8 with BOM | Status values: Quotation, Confirmed Order, Part-Delivered; Project Ref is populated on ~30% of rows; must not post GL entries on import; Document No format is QT-YYYY-XXXX |
| `logo-gulf.png` | Company logo (raster) | n/a | PNG, ~10 KB | Use on receipts and A4 documents |
| `logo-gulf.svg` | Company logo (vector) | n/a | SVG, ~300 B | Preferred for A4 invoices and letterhead; system must accept SVG for logo uploads |
