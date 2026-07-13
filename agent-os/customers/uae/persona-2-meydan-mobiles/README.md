# Meydan Mobiles & Electronics (ميدان للجوالات والإلكترونيات): Customer Requirements

> Growing mobile phones and electronics retailer; Tier 2 Medium / multi-branch, messy data, VAT mess included. Country: United Arab Emirates (AED). Intake date: 2026-07-09.

---

## At a glance

| Field | Value |
|-------|-------|
| Business name | Meydan Mobiles & Electronics (ميدان للجوالات والإلكترونيات) |
| Owner | Yousef Al Marri |
| Industry | Mobile phones, accessories and electronics retail |
| Country | United Arab Emirates |
| Currency | AED (2-decimal fils) |
| VAT | 5% standard. Tax-registered, TRN on file. |
| Seller TRN | 190482354774019 |
| Branches | 3 (Bur Dubai, Sharjah, Ajman) |
| Users | 6 to 8 |
| Items | ~781 |
| Credit customers | 12 |
| Suppliers | 3 |
| Go-live target | ASAP, ideally within 2 weeks of intake |

---

## 1. Business profile and legal

Meydan Mobiles & Electronics is a UAE-based mobile phone and electronics retailer with branches in Dubai (Bur Dubai), Sharjah and Ajman. The business is owner-operated by Yousef Al Marri and has outgrown a shared spreadsheet, particularly for cross-branch stock and outstanding customer balances.

- Legal name: Meydan Mobiles & Electronics
- Country: UAE. Currency: AED, 2 decimal places.
- VAT: registered, TRN `190482354774019`. Standard rate 5% applies to almost everything sold.
- Fiscal year: 1 January to 31 December.
- Primary language: Arabic and English bilingual.

**Sharjah weekend note:** Sharjah observes a Friday-Sunday weekend (unlike Dubai/Ajman's Saturday-Sunday). The Sharjah branch needs its own working-days calendar.

---

## 2. Locations and organisation structure

| Branch | Location | Notes |
|--------|----------|-------|
| Bur Dubai | Bur Dubai, Dubai | Main / flagship, highest volume |
| Sharjah | Sharjah Industrial Area | Mid-volume. Weekend Fri-Sun (different from Dubai/Ajman) |
| Ajman | Ajman City Centre area | Smaller, newer |

Each branch needs its own receipt header, its own cashier login scope, and per-branch stock visibility.

---

## 3. Users, roles and permissions

| Role | Count | Access level |
|------|-------|--------------|
| Owner (Yousef Al Marri) | 1 | Full access all branches, all reports including cost |
| Store Manager | 3 (one per branch) | Full access to own branch; can see cost |
| Cashier | 2 to 4 | POS only at assigned branch; must not see product cost |

Cashiers must never see cost price, on any screen or report.

---

## 4. Products and inventory

~781 items: phones, accessories, chargers, audio, wearables, repair parts.

- Multiple brands (Nova, Zenlink, Falconx, Orbit, PureSound, Vantage).
- Unit inconsistently entered: "Each" / "each" / "pc" — Zerupt should normalise.
- Repair-parts SKUs (replacement screens/batteries) sometimes carry a shelf-life note; most items do not (phones have no expiry).
- Opening quantities per branch are in `stock_by_branch.csv`, not on the product master.

**VAT mess (deliberate, the key UAE-specific test dimension):**

- Most rows are correctly tagged `Standard 5%`.
- A handful of rows are tagged `Zero-Rated 0%` — some legitimately (bulk export-bound accessory lots), but at least one is a **mis-tagging left over from a bulk-export batch that was later sold retail**, i.e. an item that should be Standard 5% is still marked zero-rated. Zerupt should flag zero-rated retail-channel items for the owner's review rather than trust the sheet blindly.
- A handful of rows have a **blank Tax Group** — these must default to Standard 5% on import, not silently import as untaxed.
- **Price column ambiguity (must resolve, not dead-end):** the raw `Price (mixed incl./excl. VAT)` column mixes VAT-inclusive and VAT-exclusive entries row-by-row with no flag column indicating which is which. Roughly 3 in 4 rows are tax-inclusive (net x 1.05, matching the tax-inclusive shelf-price law); the remainder were entered as plain net cost-plus-margin by a part-time staff member who did not add VAT. Zerupt's AI import must detect this in context — comparing the implied margin against cost — and ask the owner to confirm rows that look exclusive rather than importing them as-is (which would understate VAT collected).

---

## 5. Pricing

Single retail price list. No separate wholesale tier at this store (unlike the P3 hardware persona).

- Category-level percentage discounts occasionally applied storewide (e.g. Ramadan phone-accessory sale).
- No formal loyalty program.

---

## 6. Customers and receivables

Twelve accounts on credit terms — mostly small electronics retailers and one telecom reseller.

- Credit terms typically 30 or 60 days.
- Aged-receivables report needed (current / 30 / 60 / 90+).

**TRN mess (deliberate, UAE-specific):** roughly half of the 12 B2B customers are MISSING their TRN in `customers_aging.csv`. For a supply chain where these customers may want to reclaim input VAT, missing TRN should be surfaced as an onboarding data-quality warning ("6 of 12 B2B customers have no TRN on file — full tax invoices to these customers cannot show a buyer TRN until this is fixed"), not silently accepted or blocked.

**Other messy formats found in the file (mirrors the Kuwait mess style, UAE-flavoured):**

| Customer | Outstanding format | Issue |
|----------|--------------------|-------|
| Meydan Retail Partners LLC | European locale (period=thousands, comma=decimal) | Row 1 |
| Bur Dubai Mobile Souq | Arabic-Indic digits | Row 2 |
| Sharjah Electronics Hub | Correct locale (comma thousands, period decimal) | Row 3 |
| شركة الاتحاد للاتصالات | Dash = zero / no balance | Row 4 |
| Ajman Gadget World | Currency suffix "... AED" | Row 5 |
| (pattern repeats across the 12-row cycle) | | |

Two customers have no phone number on file.

---

## 7. Suppliers, payables and purchasing

| Code | Supplier | Phone | TRN | Opening balance |
|------|----------|-------|-----|-----------------|
| SUP-01 | Nova Distribution Gulf FZE | 043321100 | on file | AED 9,800.00 |
| SUP-02 | Falconx Imports LLC | 043445566 | on file | AED 4,200.50 |
| SUP-03 | شركة الاتصالات الخليجية | 065512233 | on file | AED 1,650.00 |

Total opening AP ties to the trial balance. All three suppliers are UAE-domestic and VAT-registered (no reverse charge at this persona; that dimension is exercised in P3).

---

## 8. Accounting and finance

**Chart of accounts:** standard UAE retail COA plus VAT Payable (2210).

**Fiscal year:** 1 January to 31 December. Opening conversion date: 1 March 2026.

**Currency:** AED, 2 decimal places.

**Opening trial balance — DELIBERATELY UNBALANCED:** the owner's bookkeeper exported the TB from the old spreadsheet and it does not balance.

| Code | Account | Debit | Credit |
|------|---------|-------|--------|
| 1100 | Cash | 8,500.00 | |
| 1110 | Bank - Mashreq Current | 61,000.00 | |
| 1131 | Trade Receivables | 14,200.00 | |
| 1141 | Inventory - Stock on Hand | (per file) | |
| 1500 | Shop Fit-out & Fixtures | 22,000.00 | |
| 2111 | Trade Payables | | 15,650.50 |
| 2210 | VAT Payable | | 3,120.75 |
| 3901 | Owner Capital | | (per file) |

**Imbalance: exactly AED 950.00** (debits exceed credits by AED 950.00). This is the deliberate OBE-plug test amount for this market. Zerupt should post the AED 950.00 difference to Opening Balance Equity (account 3900) as a plug and show it clearly on the reconciliation screen, mirroring the Kuwait persona's KWD 1,200.00 plug but at a different amount so the two test tenants are not confusable.

---

## 9. Point of sale (POS)

- Payment methods: **Cash, card, Tabby, Tamara** (UAE retail BNPL standard — required for phone/electronics ticket sizes). No Apple Pay at this shop currently (all three branches use older card terminals); a future requirement.
- Shifts per cashier per branch.
- Branch switching for floater managers.
- Returns require manager approval code.
- Discounts: cashier can apply up to 10% without approval; above 10% requires manager override.
- Held orders supported (Tabby/Tamara checkout sometimes takes a minute to confirm).
- Receipt: VAT summary line required (5% standard, or the applicable rate per line if mixed).

---

## 10. Sales documents

- Retail POS receipt (80mm thermal, simplified tax invoice).
- A4 sales invoice for the 12 credit customers.
- Credit note for returns against a posted invoice.
- Delivery note for courier-delivered credit-customer orders.

Full tax invoices (buyer TRN required) apply to any single invoice over AED 10,000 — rare at this ticket size but the template must exist and pull the buyer's TRN when present.

---

## 11. Printing and templates

- Logo: `logo-meydan.svg` / `logo-meydan.png`.
- Each branch has its own header block including its own TRN reference to the shared seller TRN.
- Receipts Arabic-first, English secondary.
- A4 invoices show VAT breakdown and, if a full tax invoice, the buyer's TRN (blank with a warning if the customer record has none).

---

## 12. Reporting and analytics

| Report | Detail |
|--------|--------|
| Daily sales by branch | Per-cashier and per-branch, incl. Tabby/Tamara settlement lag |
| Stock on hand by branch | Current qty and low-stock alerts |
| Aged receivables | Current / 30 / 60 / 90+ per customer |
| VAT return summary | Output VAT, input VAT, net payable, flags zero-rated/blank-tax-group rows used |
| TRN data-quality report | Lists B2B customers missing TRN |
| Gross margin | Per item/category; hidden from cashiers |

---

## 13. Data migration

Opening conversion date: **1 March 2026**.

### File 1: products.csv (781 data rows)

Known mess:
- Inconsistent category spellings (`Accessories` / `accessories` / `Acc.`).
- Duplicate SKU (row 30, an "(open box)" variant reusing an existing SKU) — Zerupt should flag and ask for a new SKU.
- ~6% of rows have a blank Cost.
- Unit casing inconsistency (Each / each / pc).
- **Tax Group column:** mostly `Standard 5%`; some rows `Zero-Rated 0%` (at least one mis-tagged item that should be standard); some blank (must default to standard 5%, never silently untaxed).
- **Price column ambiguity:** mixed VAT-inclusive and VAT-exclusive entries in the same column, no flag — see Section 4. AI import must detect via implied-margin heuristics and confirm with the owner.

### File 2: stock_by_branch.csv (400 data rows sampled)

Per-branch opening stock, columns: Bur Dubai, Sharjah, Ajman. Relatively clean.

### File 3: customers_aging.csv (12 data rows)

See Section 6 for the full mess breakdown: mixed locale number formats, Arabic-Indic digits, currency suffix, dash-for-zero, missing phones, and roughly half the B2B accounts missing TRN.

### File 4: suppliers.csv (3 data rows)

Clean, all domestic, all with TRN.

### File 5: trial_balance.csv (8 data rows)

Deliberately unbalanced by exactly **AED 950.00**; expect OBE plug to account 3900.

---

## 14. Integrations and hardware

| Item | Detail |
|------|--------|
| POS terminal | Windows tablet or iPad per branch |
| Receipt printer | 80mm Bluetooth thermal, one per branch |
| Barcode scanner | USB scanner per branch |
| Card / Tabby / Tamara | Handled via each provider's own terminal/app; cashier records the result manually in the POS at go-live (no API integration yet) |
| Accounting software | None currently |

---

## 15. Operational details

- Business hours: Bur Dubai and Ajman Saturday-Thursday 10:00-22:00 (closed Friday); Sharjah Friday-Sunday reduced hours due to local weekend difference — branch-level calendar required.
- Phone format: UAE mobile 05X XXX XXXX, +971 country code.
- Language: bilingual per-user.
- Timezone: Asia/Dubai for all branches.

---

## 16. Special or custom requirements

1. **Sharjah weekend override:** Sharjah branch calendar must differ from Dubai/Ajman (Fri-Sun vs Sat-Sun).
2. **VAT mis-tag review queue:** any item flagged Zero-Rated or blank-tax-group in a retail (non-export) channel should surface in a review queue before it is trusted for VAT reporting.
3. **TRN completeness warning:** dashboard indicator for B2B customers with no TRN on file.
4. **Tabby/Tamara at POS:** must appear as first-class payment methods alongside cash and card.

---

## 17. Go-live expectations, training and success criteria

**Timeline:** live within two weeks of data import; parallel run with spreadsheets for two weeks.

**Success criteria:**
- Opening stock matches physical count.
- The AED 950.00 TB imbalance is plugged to OBE, and shown clearly, not silently absorbed.
- VAT return summary correctly separates standard/zero-rated/blank-defaulted-to-standard lines.
- TRN-missing customers surface in the data-quality report, not silently accepted.

**Support preference:** WhatsApp.

---

## 18. Open questions and risks

| # | Question or risk | Owner's current position |
|---|-----------------|--------------------------|
| 1 | Zero-rated tagging on retail-channel items: confirm which SKUs were genuinely export-bound vs mis-tagged. | Owner to review post-import warning list |
| 2 | Price-column ambiguity (VAT incl. vs excl.): confirm the AI's row-by-row inclusive/exclusive determination before it's trusted for VAT reporting. | Owner to confirm during import review |
| 3 | The AED 950.00 TB imbalance will be plugged to OBE. | Owner is comfortable with this approach |
| 4 | 6 of 12 B2B customers have no TRN. Owner will chase these post-go-live. | Accepted |
| 5 | Sharjah's Friday-Sunday weekend: confirm this doesn't affect any consolidated same-day-across-branches reporting. | Owner to confirm |

---

## Data file manifest

| File | What it contains | Rows | Known mess |
|------|-----------------|------|------------|
| products.csv | Item master: cost, mixed incl./excl. VAT price, opening qty, tax group | 781 | Category spelling drift; duplicate SKU; blank costs; unit casing; Tax Group mis-tags/blanks; VAT-inclusive/exclusive price ambiguity |
| stock_by_branch.csv | Per-branch opening qty (Bur Dubai, Sharjah, Ajman) | 400 | Clean |
| customers_aging.csv | 12 credit customers, opening AR as of 01/03/2026 | 12 | Mixed locale formats, Arabic-Indic digits, currency suffix, dash-for-zero, missing phones, ~half missing TRN |
| suppliers.csv | 3 suppliers with opening AP and TRN | 3 | Clean |
| trial_balance.csv | Opening TB | 8 | Deliberately unbalanced by AED 950.00; expect OBE plug to 3900 |
| logo-meydan.png / .svg | Business logo | n/a | Both formats accepted |
