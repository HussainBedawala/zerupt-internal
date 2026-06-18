# Layla Cosmetics (ليلى للتجميل): Customer Requirements

> Growing cosmetics and beauty retailer; Tier 2 Medium / multi-branch, some messy data. Country: Kuwait (KWD). Intake date: 2026-06-15.

---

## At a glance

| Field | Value |
|-------|-------|
| Business name | Layla Cosmetics (ليلى للتجميل) |
| Owner | Layla Al-Sabah |
| Industry | Cosmetics and beauty retail |
| Country | Kuwait |
| Currency | KWD (3-decimal fils) |
| VAT | None (Kuwait has no VAT) |
| Branches | 3 (The Avenues, Salmiya, Hawally) |
| Users | 6 to 8 |
| Items | ~780 |
| Credit customers | 12 |
| Suppliers | 3 |
| Go-live target | ASAP, ideally within 2 weeks of intake |

---

## 1. Business profile and legal

Layla Cosmetics is a Kuwait-based cosmetics and beauty retailer selling skincare, makeup, fragrances, and beauty accessories across three branches. The business is owner-operated by Layla Al-Sabah and has grown to the point where a shared spreadsheet is no longer manageable, particularly for tracking stock across branches and monitoring outstanding customer balances.

- Legal name: Layla Cosmetics (ليلى للتجميل)
- Business type: Retail, single owner
- Country: Kuwait
- Currency: KWD with fils precision (3 decimal places)
- VAT: Not applicable (Kuwait levies no VAT on retail)
- Fiscal year: 1 January to 31 December
- Primary language: Arabic and English bilingual (receipts and catalog must support both)

---

## 2. Locations and organisation structure

Three retail branches, no central warehouse. Stock is physically held at each branch and replenishment moves between branches manually today.

| Branch | Location | Notes |
|--------|----------|-------|
| The Avenues | The Avenues Mall, Kuwait City | Main / flagship, highest volume |
| Salmiya | Salmiya district | Mid-volume |
| Hawally | Hawally district | Smaller, newer |

Each branch needs:
- Its own receipt header (branch name, address, phone)
- Its own cashier login scope (cashiers should only access their own branch)
- Per-branch stock visibility in inventory reports

The owner wants to be able to see all three branches consolidated as well as individually.

---

## 3. Users, roles and permissions

| Role | Count | Access level |
|------|-------|--------------|
| Owner (Layla Al-Sabah) | 1 | Full access all branches, all reports including cost |
| Store Manager | 3 (one per branch) | Full access to their own branch; can view but not edit accounting; can see cost |
| Cashier | 2 to 4 | POS only at their assigned branch; **must not see product cost** |

Key permission rule: cashiers must not see cost price anywhere, including product pages, purchase orders, or reports. Retail price is fine. This is a firm requirement.

Managers can create and approve sales orders and purchase requests. Only the owner can approve credit limit changes and supplier payments.

---

## 4. Products and inventory

The catalog has approximately 780 items across four main product types: lip products (lipsticks, lip liners, glosses), face products (foundations, concealers, blushes), eye products (eyeliners, mascaras, palettes), and skincare (creams, serums, cleansers). There are also fragrances, tools, and accessories.

- Items are from multiple brands (Ohud, Velvet Skin, Noor Beauty, Lumiere, Rouge Caprice, and others).
- Each item has an Arabic and English name.
- The unit is "Each" or "pc" (effectively the same; Zerupt should normalise these).
- Expiry date and batch number are tracked for skincare and foundation lines but not consistently across all products. The Expiry and Batch columns in the import file will have values for some items and be blank for others; this is intentional.
- Product images matter a lot in cosmetics retail. The owner wants to upload product images to the catalog and have them show in POS search results so cashiers can visually confirm the shade/variant they are scanning.
- Opening quantities per branch are in a separate file (stock_by_branch.csv) rather than on the product master.

---

## 5. Pricing

Single retail price list currently. No separate wholesale or trade pricing.

- One retail price per item in KWD (3 decimals when applicable, but most prices are 2 decimal)
- The owner mentions occasional storewide promotions (Ramadan, National Day) where she discounts a category by a fixed percentage; she wants to be able to apply a category-level discount at POS without editing each item
- No formal loyalty card program today, but she is open to a simple VIP-customer flag that remembers a fixed discount percentage per credit customer

---

## 6. Customers and receivables

Twelve accounts are on credit terms. Most are salons, beauty lounges, and boutiques that pick up stock and pay monthly. A few are individual VIP buyers (the owner's personal clients).

- Credit terms are typically 30 or 60 days
- The owner reviews outstanding balances once a month and chases overdue accounts by phone
- She wants an aged-receivables report (current / 30 / 60 / 90+ days) per customer
- She would also like to record a phone number and notes per customer

The outstanding balance data she has is in a spreadsheet (customers_aging.csv) and she acknowledges it is "a bit messy." Specific formats found in the file:

| Customer | Outstanding format | Issue |
|----------|--------------------|-------|
| Layla Al-Sabah VIP | 1.765,32 | European locale: period as thousands separator, comma as decimal |
| Salon Glamour | ٦٩٨ | Arabic-Indic digits |
| Mariam Beauty Lounge | 1,506.37 | Correct locale (comma thousands, period decimal) |
| نورة العتيبي | - | Dash = zero / no balance |
| Fatima Boutique | 582.62 KWD | Currency suffix appended |
| Hessa Al-Rashid | 561,50 | European format (comma as decimal) |
| Glow Salon Salmiya | ٨٦٨ | Arabic-Indic digits |
| دلال للتجميل | 826.87 | Standard, OK |
| Reem Aesthetics | - | Dash = zero |
| Bridal Studio Kuwait | 844.25 KWD | Currency suffix appended |
| Sara Al-Mutairi | 430,24 | European format |
| Amira Spa | ١٧٦٦ | Arabic-Indic digits |

The "Since" date on all rows is 13/02/2026, which is the as-of date for opening AR balances.

One customer (CUST-004, نورة العتيبي) has no phone number on file. Two customers have no phone. Zerupt should import these without error and simply leave phone blank.

---

## 7. Suppliers, payables and purchasing

Three active suppliers. Purchase orders are raised by branch managers and approved by the owner.

| Code | Supplier | Phone | Opening balance |
|------|----------|-------|-----------------|
| SUP-01 | Lumiere Distribution Gulf | 22110099 | KWD 4,200.000 |
| SUP-02 | Paris Beauty Imports | 22330011 | KWD 1,800.500 |
| SUP-03 | مستحضرات الخليج | 22556677 | KWD 930.000 |

Note: SUP-03's name is in Arabic only (مستحضرات الخليج, which means "Gulf Cosmetics"). Zerupt must accept and display an Arabic-only supplier name correctly.

Total opening AP: KWD 6,930.500, which ties to the trial balance.

Purchasing workflow:
1. Branch manager raises a purchase request in Zerupt
2. Owner approves and converts to a purchase order
3. Goods received at branch; stock updated on receipt
4. Invoice matched to PO and posted for payment

---

## 8. Accounting and finance

**Chart of accounts:** The owner wants a standard retail COA appropriate for Kuwait. She does not need industry-specific sub-accounts beyond what is standard.

**Fiscal year:** 1 January to 31 December. Opening conversion date is 13/02/2026 (mid-year).

**Currency:** KWD (Kuwaiti Dinar), 3 decimal places (fils). All amounts must store and display to 3 decimals.

**VAT:** None. The VAT Payable account in the trial balance has a zero balance and can be removed or zeroed out.

**Banks:** One bank account, Boubyan Bank.

**Opening trial balance:** The owner's accountant exported the trial balance from their old spreadsheet. It does not balance. Debit total is KWD 495,576.400 and credit total is KWD 494,376.400, a difference of KWD 1,200.000. The owner is aware of this and says "there is probably a missing entry somewhere, but I cannot find it." She expects Zerupt to post the difference to an Opening Balance Equity (OBE) account (3900) as a plug, and to show her clearly on the reconciliation screen what was plugged rather than silently absorbing the difference.

Trial balance accounts:

| Code | Account | Debit | Credit |
|------|---------|-------|--------|
| 1100 | Cash | 3,200.000 | |
| 1110 | Bank - Boubyan | 28,500.000 | |
| 1131 | Trade Receivables | 6,400.000 | |
| 1141 | Inventory - Stock on Hand | 442,476.400 | |
| 1500 | Shop Fit-out & Fixtures | 15,000.000 | |
| 2111 | Trade Payables | | 6,930.500 |
| 2200 | VAT Payable | | 0.000 |
| 3901 | Owner Capital | | 487,445.900 |

Debits: 495,576.400 / Credits: 494,376.400 / Imbalance: 1,200.000 (Zerupt plugs to OBE 3900)

---

## 9. Point of sale (POS)

- Payment methods: Cash and KNET (Kuwait's national debit network). No credit card terminal for now.
- Shifts: each cashier opens and closes a shift at their branch; the manager reviews the shift summary before sign-off.
- Branch switching: the system should default to the cashier's assigned branch; a manager logged in as a floater should be able to select which branch they are operating from.
- Returns: cashiers can process refunds to cash or KNET; all refunds require a manager approval code at this stage.
- Discounts: cashiers can apply a manual line discount up to 10%; any discount above 10% requires manager override.
- Hold order: cashiers sometimes put an order on hold while a customer runs to the ATM; the POS should support held orders.
- Receipts: printed on 80mm thermal paper. Receipt must show branch name and address at the top, the SVG logo, item name (Arabic or English depending on cashier language setting), quantity, price, total in KWD to 3 decimal places, and a thank-you line.

---

## 10. Sales documents

- Retail POS receipt (80mm thermal): used for all walk-in sales
- Sales invoice (A4): for credit customers (salons, beauty lounges) who need a paper invoice for their own records
- Credit note: for returns against a posted invoice
- Delivery note: simple packing slip when a courier delivers an order to a credit customer

Invoices must show both Arabic and English item names. Payment terms (30 or 60 days) must appear on the invoice.

---

## 11. Printing and templates

- Logo: `logo-layla.svg` (SVG format). Zerupt must render the SVG on thermal receipts and A4 invoices.
- Each branch has its own header block (name, address, phone number in the +965 8-digit format).
- Receipts are Arabic-first, with English below for item names where both exist.
- The owner wants to review a print preview before committing the template to live use.
- A4 invoices should have a footer with bank details (Boubyan Bank) for customers paying by transfer.

---

## 12. Reporting and analytics

Priority reports:

| Report | Detail |
|--------|--------|
| Daily sales by branch | Per-cashier and per-branch totals, compared to same day last week |
| Stock on hand by branch | Current qty per item per branch, with low-stock alert threshold |
| Expiry and near-expiry | Items whose expiry date is within 60 days or already past |
| Aged receivables | Per-customer breakdown: current / 30 / 60 / 90+ days outstanding |
| Gross margin | Per item and per category; visible to owner and manager only, not cashier |
| Supplier payables aging | What is owed and when it is due per supplier |

The owner checks sales every morning from her phone. She wants the dashboard to show yesterday's revenue across all branches, current total stock value, and total outstanding AR, without needing to navigate multiple screens.

---

## 13. Data migration

Opening conversion date: **13 February 2026**.

The owner has prepared five files. She has flagged that the data "came from several years of spreadsheets and is not perfectly clean." The known issues are documented below so the importer can be verified against them.

### File 1: products.csv (781 data rows)

Primary product master with SKU, name, brand, category, unit, cost, retail price, opening quantity (aggregate), expiry, and batch.

Known mess:

- **Inconsistent category spellings:** "Skin Care", "Skincare", and "skincare" are all used for the same category. Similarly "Lip" and "Lipstick" overlap; "Face" and "Foundation" overlap; "Eye Makeup" and "Eyes" overlap; "Fragrance", "Fragrances", and "Perfumes" appear for what is essentially one category. Zerupt's AI should group these intelligently and surface a mapping for the owner to confirm before import.
- **Duplicate SKU:** LC-00008 appears twice (once as "Lumiere Satin Lipstick - 04 Crimson" and once as "Lumiere Satin Lipstick - 04 Crimson (refill)"). These are two distinct products that were accidentally assigned the same code. Zerupt should flag the duplicate and ask the owner which SKU to reassign.
- **Blank cost prices:** 6 items have no cost entered (the Cost column is empty). Retail price is present. Zerupt should import these and mark them as "cost unknown" rather than defaulting to zero, and surface them in a post-import warning so the owner can fill them in.
- **Inconsistent unit values:** most rows say "Each" but some say "each" (lowercase) or "pc". These are all the same unit and should be normalised.
- **Expiry and batch:** most rows have both blank or both filled. A handful have an expiry date but no batch, or a batch but no expiry. Various date formats used: YYYY-MM, YYYY-MM-DD, "Mar-2027", plain "2027". Zerupt must parse all of these.
- **Opening quantity in this file** is an aggregate total; the per-branch split is in stock_by_branch.csv. If both files are imported, the per-branch file takes precedence for initial stock levels.

### File 2: stock_by_branch.csv (781 data rows)

Per-branch opening stock quantities. Three branch columns: "The Avenues", "Salmiya", "Hawally". Zerupt must map each column to the corresponding branch and distribute stock accordingly.

Known mess: none significant; the file is relatively clean. Row count matches products.csv (same SKU list).

### File 3: customers_aging.csv (12 data rows)

Credit customer list with opening AR balances as of 13/02/2026.

Known mess: see Section 6 above for the full per-customer breakdown. Summary:
- Three customers use European locale formatting (period = thousands, comma = decimal): CUST-001, CUST-006, CUST-011
- Three customers use Arabic-Indic digits: CUST-002, CUST-007, CUST-012
- Two customers use a currency suffix ("582.62 KWD", "844.25 KWD"): CUST-005, CUST-010
- Two customers have a dash for zero balance: CUST-004, CUST-009
- Two customers have no phone number on file

### File 4: suppliers.csv (3 data rows)

Supplier master with opening AP balances.

Known mess: SUP-03 has an Arabic-only name (مستحضرات الخليج). No other issues.

### File 5: trial_balance.csv (8 data rows)

Opening trial balance for the accounting conversion.

Known mess: the TB does not balance. Debit total 495,576.400 minus credit total 494,376.400 leaves an unreconciled difference of **KWD 1,200.000**. Zerupt should post this difference to Opening Balance Equity (account 3900) as a plug and display the plug amount prominently on the reconciliation confirmation screen. The VAT Payable line (account 2200) has a zero balance and can be kept for chart-of-accounts completeness or removed; the owner has no preference.

---

## 14. Integrations and hardware

| Item | Detail |
|------|--------|
| POS terminal | Standard Windows tablet or iPad at each branch; browser-based POS is fine |
| Receipt printer | 80mm Bluetooth thermal printer (one per branch) |
| Barcode scanner | USB barcode scanner at each branch for scanning product barcodes |
| KNET | Standalone KNET terminal at each branch; no software integration required at go-live (cashier keys in amount manually, receipt stapled) |
| Accounting software | None currently; Zerupt is the first proper system |
| E-commerce | None at go-live |

---

## 15. Operational details

- Business hours: Saturday to Thursday, 10:00 to 22:00; closed Friday (Kuwait weekend is Friday/Saturday, so The Avenues branch may open Friday afternoons during mall hours; branch setting needed)
- Public holidays: Kuwait National Day (25 Feb), Liberation Day (26 Feb), plus Islamic holidays; the owner does not need the system to block sales on holidays, just wants the calendar to be correct for reporting periods
- Phone format: all Kuwait numbers are 8 digits, prefixed +965 (e.g., +965 9903 0072)
- Language: owner and managers are bilingual; cashiers may be Arabic-first; system should support both locales per-user
- Internet: all branches have reliable WiFi; no offline-first requirement at go-live, but the owner would like to know the plan if the connection drops mid-shift

---

## 16. Special or custom requirements

1. **Expiry and near-expiry alerts:** Zerupt should flag any item whose expiry date is within 60 days (configurable threshold) on the inventory dashboard and in a dedicated report. Near-expiry items should also show a visual indicator in POS search results so cashiers can sell older stock first (FIFO sell-through).

2. **Per-branch reporting:** all inventory and sales reports must be filterable by branch. The owner wants branch-comparison views (e.g., revenue last 30 days: Avenues vs. Salmiya vs. Hawally on one chart).

3. **Cashier cost-hiding:** product cost must be invisible to any user with the Cashier role. This applies to the POS screen, the product catalog, purchase documents, and all reports. Retail price is always visible.

4. **SVG logo on receipts:** the business logo is in SVG format. The logo must render correctly on both 80mm thermal receipts and A4 invoices without rasterisation artefacts.

5. **Batch and expiry on purchase receipts:** when goods are received from a supplier, the system should prompt for batch number and expiry date (where the product has expiry tracking enabled) so the inventory record stays current.

---

## 17. Go-live expectations, training and success criteria

**Timeline:** the owner wants to be live within two weeks of data import. She is willing to run in parallel (old spreadsheets alongside Zerupt) for the first two weeks to cross-check.

**Training needs:**
- Owner: full system walkthrough, 2 to 3 hours
- Store managers: POS + inventory + purchasing + basic reports, 1 to 2 hours per manager
- Cashiers: POS only, 30 to 45 minutes per cashier

**Success criteria (owner's words, lightly tidied):**
- At end of day 1, all three cashiers can complete a sale and print a receipt without help
- At end of week 1, stock on hand in Zerupt matches a manual count at one branch (the owner will choose which branch to spot-check)
- At end of month 1, the AR aging report in Zerupt matches what she would have tracked manually, and outstanding balances have been collected or aged correctly

**Ongoing support:** the owner prefers WhatsApp for quick questions. She will designate one store manager as the internal Zerupt champion per branch.

---

## 18. Open questions and risks

| # | Question or risk | Owner's current position |
|---|-----------------|--------------------------|
| 1 | The duplicate SKU LC-00008 needs a new code assigned to the refill variant. | Owner to confirm new SKU before import |
| 2 | Category consolidation: 13+ raw category values map to roughly 6 to 8 logical categories. | Zerupt AI to propose a mapping; owner to approve |
| 3 | 6 items have no cost. Margin reporting will be incomplete until costs are added. | Owner to supply costs after go-live |
| 4 | The KWD 1,200 TB imbalance will be plugged to OBE. If the missing entry is found later, the owner will need to post a correcting journal. | Owner is comfortable with this approach |
| 5 | Expiry tracking is inconsistent across the product range. The owner wants to enable it only for items where it is relevant (skincare and some face products). | To be confirmed product-by-product at import review |
| 6 | KNET integration (automated terminal pairing) is not in scope for go-live. Manual reconciliation is acceptable short-term. | Accepted |
| 7 | Friday branch hours at The Avenues: does the mall require the branch to open on Fridays? If so, the branch calendar needs a custom schedule. | Owner to confirm |
| 8 | Product images: the owner has images for the main lines but not all 780 items. Will missing images cause issues in POS visual catalog? | Zerupt should show a placeholder; owner to upload images post-go-live |

---

## Data file manifest

| File | What it contains | Rows | Known mess |
|------|-----------------|------|------------|
| products.csv | Item master with cost, retail price, opening qty (aggregate), expiry, batch | 781 | Inconsistent category spellings (Skin Care / Skincare / skincare; Lip / Lipstick; Eye Makeup / Eyes; Fragrance / Fragrances / Perfumes); duplicate SKU LC-00008 (two distinct products); 6 blank cost prices; unit casing inconsistency (Each / each / pc); expiry date in multiple formats (YYYY-MM, YYYY-MM-DD, Mon-YYYY, plain YYYY) |
| stock_by_branch.csv | Per-branch opening quantities; 3 columns (The Avenues, Salmiya, Hawally) | 781 | Clean; column names must map to branch names exactly |
| customers_aging.csv | 12 credit customers with opening AR balances as of 13/02/2026 | 12 | Mixed number formats: European locale (1.765,32), Arabic-Indic digits (٦٩٨, ٨٦٨, ١٧٦٦), currency suffix (582.62 KWD, 844.25 KWD), dash for zero (-); 2 missing phone numbers; 1 Arabic-only customer name |
| suppliers.csv | 3 suppliers with opening AP balances | 3 | SUP-03 has Arabic-only name (مستحضرات الخليج); all balances clean |
| trial_balance.csv | Opening TB for accounting conversion | 8 | Deliberately unbalanced: debits 495,576.400, credits 494,376.400, difference 1,200.000; expect OBE plug to 3900; VAT Payable line present at zero |
| logo-layla.svg | Business logo in SVG format | n/a | SVG format (not PNG); must render on thermal receipt and A4 invoice |
