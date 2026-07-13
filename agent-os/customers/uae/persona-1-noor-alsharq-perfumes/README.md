# Nur Al Sharq Perfumes & Oud (نور الشرق للعطور): Customer Requirements

> Single perfume, oud and bakhoor shop in Deira, Dubai. Tier: Simple / happy path, but fully VAT-compliant. Country: United Arab Emirates (AED, 2-decimal fils). Intake date: 2026-07-09.

---

## At a glance

| Field | Value |
|---|---|
| Legal / trade name (EN) | Nur Al Sharq Perfumes & Oud |
| Trade name (AR) | نور الشرق للعطور |
| Owner | Rashid Al Marzouqi |
| Industry | Perfumes, oud, attar and bakhoor (retail) |
| Locations | 1 (Deira, Dubai) |
| Users | 2 (owner, counter staff) |
| Items (approx.) | 138 across 8 categories |
| Customers | 4 (3 trade accounts + Walk-in) |
| Suppliers | 2 |
| Currency | AED (UAE Dirham, 2 decimal places / fils) |
| Tax / VAT | 5% standard-rated VAT. Tax-registered, TRN on file. |
| Seller TRN | 138823384687885 |

---

## 1. Business profile and legal

Nur Al Sharq Perfumes & Oud is a single retail shop in Deira selling oud oil, attar, branded perfumes, bakhoor, gift sets and incense burners. The business is VAT-registered with the Federal Tax Authority (FTA) and holds a 15-digit Tax Registration Number (TRN) starting with 1: `138823384687885`. Every tax invoice we issue must show this TRN.

We currently run a manual spreadsheet. Our goals: accurate live stock, a working POS at the counter, VAT correctly calculated and reported, and clean books.

---

## 2. Locations and organisation structure

One branch only: the Deira shop. No separate warehouse; stock lives on the shop floor and a small back room treated as one location.

Branch header for receipts: Nur Al Sharq Perfumes & Oud, Deira, Dubai, UAE. TRN: 138823384687885. Phone: +971 4 222 1100.

---

## 3. Users, roles and permissions

| User | Role | Access notes |
|---|---|---|
| Rashid Al Marzouqi (owner) | Admin / full access | Everything |
| Counter staff (1 person) | Cashier | POS + stock lookup only. Should NOT see cost prices or accounting reports. |

No store-manager role, approval workflows, or time-based access restrictions needed.

---

## 4. Products and inventory

- Approximately 138 items across 8 categories: Oud, Attar, Perfumes, Bakhoor, Gift Sets, Musk & Amber, Incense Burners, Travel Sets.
- All items are simple SKUs (Each unit). No serialised items, no lot/expiry management (oud and attar do not expire meaningfully within shelf life expected here).
- Each item has a barcode (EAN-13) for the USB barcode scanner at the counter.
- SKU codes follow the pattern `OUD-0001`, `ATR-0001`, etc. Must be preserved exactly on import; they are on our shelf labels.
- Every item is tagged `Tax Group = Standard 5%` — the shop sells only standard-rated goods.
- **Selling Price in `products.csv` is VAT-INCLUSIVE** (the legally required shelf price in the UAE). The tax breakdown (net + 5% VAT) must be computed and shown on the receipt, not re-charged on top of the listed price.
- No kit/bundle items, no variants beyond what's already in the name, no pack-unit conversions.

---

## 5. Pricing

- One price list: standard retail selling price, tax-inclusive as displayed on the shelf and in `products.csv`.
- Cashier can apply a manual discount (amount or percent) at line or cart level; the VAT recalculates on the discounted net amount, not the original price.
- No promotions, scheduled sales, or loyalty points needed.
- Prices are in AED to 2 decimal places (fils). Cash transactions round to the nearest 25 fils at settlement (system computes exact totals; cash tender/change rounds).

---

## 6. Customers and receivables

| Code | Name | TRN | Notes |
|---|---|---|---|
| C-001 | Al Maha Gifting Trading LLC | 138823384687885-style (own TRN on file) | Opening balance AED 1,200.00 |
| C-002 | Zayed Hospitality Supplies | TRN on file | No opening balance |
| C-003 | Deira Souq Retail Est | TRN on file | Opening balance AED 480.75 |
| C-004 | Walk-in Customer | n/a | No balance; anonymous cash sales |

Total AR opening balance: AED 1,680.75 (must tie to account 1131 in the trial balance).

All three trade (B2B) customers have their TRN on file — this is the clean path; TRN capture per B2B customer is required so invoices over AED 10,000 can carry the buyer's TRN on a full tax invoice (not expected at this shop's typical order size, but the field must exist).

---

## 7. Suppliers, payables and purchasing

| Code | Name | Phone | TRN | Opening AP balance |
|---|---|---|---|---|
| S-001 | Gulf Oud Distribution FZE | +971 4 222 1100 | on file | AED 3,400.00 |
| S-002 | Sharq Attar Supplies LLC | +971 4 233 5566 | on file | AED 1,550.00 |

Total AP opening balance: AED 4,950.00 (must tie to account 2111). Both suppliers are UAE-domestic and VAT-registered; input VAT on their invoices is fully recoverable — no reverse charge.

No PDCs to track. No foreign-currency suppliers.

---

## 8. Accounting and finance

**Opening balances and trial balance:** clean and balanced. `trial_balance.csv` has 7 accounts: Cash, Bank, AR, Inventory, AP, VAT Payable, Owner Capital. Total debits = total credits. No OBE plug needed.

**Chart of accounts:** standard GCC/UAE retail COA plus a VAT Payable (output less input) control account (2210).

**Fiscal year:** 1 January to 31 December.

**Base currency:** AED, 2 decimal places (fils). Standard arithmetic rounding.

**Tax / VAT:** 5% standard rate on all items. Seller TRN `138823384687885` must print on every receipt. Simplified tax invoice is sufficient below AED 10,000 (this shop's typical basket); a full tax invoice format (with buyer TRN) must still be available for any transaction that crosses that threshold.

**Bank accounts:** Emirates NBD Current Account. Petty-cash float at the till.

**Post-dated cheques:** not applicable.

---

## 9. Point of sale (POS)

- One POS terminal at the counter.
- Shift float typically AED 200.
- Payment methods: Cash, card, Apple Pay. Cash rounds to nearest 25 fils; card/Apple Pay settle to the exact cent.
- Returns: simple item return with refund to original tender.
- Discounts: line-level or cart-level, amount or percent; VAT recalculates on the discounted net.
- Receipt must show the VAT summary line (net, VAT 5%, gross) and the seller TRN.

---

## 10. Sales documents

Only the thermal receipt (simplified tax invoice) at point of sale. No A4 tax invoices, quotations, or delivery notes needed — all sales are face-to-face at the counter, all below the AED 10,000 full-tax-invoice threshold.

---

## 11. Printing and templates

- **Receipt:** 80mm thermal roll.
- **Layout:** logo at top, branch name/address/TRN, item lines, subtotal, VAT 5% breakdown, total in AED, payment method, change due.
- **Language:** Arabic primary, English secondary.
- **Logo file:** `logo-noor.png` (PNG) and `logo-noor.svg` (SVG).
- VAT summary section is REQUIRED (unlike the Kuwait equivalent persona, which omits it).

---

## 12. Reporting and analytics

- Daily sales summary (cash / card / Apple Pay split).
- Stock on hand report.
- VAT return summary (output VAT collected, input VAT recoverable, net payable) — feeds the FTA quarterly VAT return.
- Profit and loss (monthly).
- Balance sheet.
- Customer ledger.

---

## 13. Data migration

All files are clean. Import order:

1. `trial_balance.csv` (opening balances + conversion date)
2. `products.csv` (items with opening stock; Selling Price is VAT-inclusive; Tax Group column present)
3. `customers.csv` (3 trade accounts + Walk-in, with TRNs and AR opening balances)
4. `suppliers.csv` (2 suppliers with AP opening balances and TRNs)

After import, verify: AR control (1131) = AED 1,680.75, AP control (2111) = AED 4,950.00, Inventory (1141) = AED 619,074.55, VAT Payable (2210) = AED 1,850.30. These must match the trial balance exactly.

**Quirks / notes:** None — clean path. SKU codes must be preserved exactly. Selling Price is tax-inclusive; the import must NOT re-apply 5% VAT on top of it.

---

## 14. Integrations and hardware

| Hardware | Details |
|---|---|
| Barcode scanner | USB wired scanner (HID), EAN-13 |
| Thermal printer | 80mm USB thermal receipt printer (ESC/POS) |
| Cash drawer | Connected to thermal printer |
| Card terminal | Standalone; cashier selects Card/Apple Pay manually in the system |

No e-commerce, no accounting software sync, no WhatsApp integration at go-live.

---

## 15. Operational details (the small stuff)

| Item | Detail |
|---|---|
| Working hours | Saturday to Thursday, approx. 9:00 AM to 10:00 PM |
| Weekend | Saturday and Sunday (Dubai) |
| Primary language | Arabic (UI and receipts); English for SKUs/system labels |
| Phone format | +971, mobile 05X XXX XXXX or landline 04 XXX XXXX |
| Currency rounding | 2 decimal places (fils); cash settlement rounds to nearest 25 fils |
| Receipt language | Bilingual (Arabic + English) |
| Number format | Standard: 1,234.56 (comma thousands, period decimal) |
| Date format | DD/MM/YYYY |
| Timezone | Asia/Dubai |

---

## 16. Special or custom requirements

None beyond standard UAE VAT compliance: TRN on receipts, 5% VAT summary line, tax-inclusive shelf pricing baked into `products.csv`.

---

## 17. Go-live expectations, training and success criteria

**Timeline:** live within one working day of onboarding.

**Training:** owner self-serves via onboarding wizard; counter staff needs 30 minutes on the POS screen (sale, cash, card, Apple Pay, print receipt with VAT summary, return).

**Success criteria:**

1. Opening stock matches physical count (138 items).
2. Opening AR (AED 1,680.75) and AP (AED 4,950.00) match old records.
3. Receipt correctly shows a 5% VAT breakdown and the seller TRN.
4. End-of-day cash matches system cash total.
5. VAT summary report ties to the sum of VAT lines on the day's receipts.

**Support preference:** WhatsApp first; video call if broken.

---

## 18. Open questions and risks

| # | Question / Risk | Status |
|---|---|---|
| 1 | Conversion date: confirm the opening-balance date (likely end of last month). | Open |
| 2 | Emirates NBD bank balance: confirm it matches the actual account balance on the conversion date. | Open |
| 3 | Walk-in Customer record: confirm zero opening balance, used for all anonymous sales. | Confirmed |
| 4 | Cash rounding to nearest 25 fils: confirm this is applied only at final cash tender, not on each line. | Confirmed |
| 5 | VAT Payable opening balance (AED 1,850.30): confirm this is the net amount owed to FTA as of the conversion date, not yet paid. | Open |

---

## Data file manifest

| File | Contents | Rows (excl. header) | Notes |
|---|---|---|---|
| `trial_balance.csv` | 7 GL account opening balances | 7 | Balanced. Includes VAT Payable (2210) = AED 1,850.30. Import first. |
| `products.csv` | Item master: SKU, name, category, unit, cost, VAT-inclusive selling price, opening qty, barcode, tax group | 138 | Clean. All rows `Tax Group = Standard 5%`. Selling Price column is VAT-inclusive. |
| `customers.csv` | 3 trade accounts + Walk-in, with TRN, phone/email, opening AR balances | 4 | AR total = AED 1,680.75. All B2B accounts carry TRN. |
| `suppliers.csv` | 2 local VAT-registered suppliers with TRN and opening AP balances | 2 | AP total = AED 4,950.00. |
| `logo-noor.png` / `logo-noor.svg` | Shop logo (PNG + SVG) | n/a | Upload to Settings; appears at top of receipt. |
| `inventory-import-items.csv` | Items sheet for Zerupt inventory import template (v3 ADAPTIVE) | 138 | Tax Group column SHOWN (UAE has non-default tax groups) — see notes below. |
| `inventory-import-categories.csv` | Categories sheet (v3) | 8 | Codes: OUD, ATR, PRF, BKH, GFT, MSK, INC, TRV. |
| `inventory-import-opening-stock.csv` | Opening Stock sheet (v3) | 138 | One warehouse column (Main Warehouse - Deira). No Batches sheet. |

---

## Inventory import template notes (v3 ADAPTIVE column set)

**Template version:** DEV-430 v3 ADAPTIVE. The generator resolves column visibility per tenant industry, country and flags. The CSVs above match the exact column order the v3 generator emits for this tenant.

**Column visibility (perfumes/cosmetics-adjacent retail, UAE - VAT ON, no batch items):**

| Column | Shown? | Reason |
|---|---|---|
| Name (primary) | Yes | Always on |
| Name (secondary) | Yes | Tenant has Arabic as secondary language |
| SKU | Yes | Always on |
| Barcode | Yes | Always on |
| Category Code | Yes | Always on |
| **Tax Group** | **Yes** | `hasNonDefaultTaxGroup = true` — UAE is a VAT jurisdiction with multiple tax groups (Standard 5%, Zero-Rated, Exempt, Reverse Charge) even though this tenant only uses Standard 5%. **This is the key difference from the Kuwait persona**, where Tax Group is hidden because Kuwait has no VAT at all. |
| Tracking | No | Always hidden in v3 |
| Cost | Yes | Always on |
| Sell Price | Yes | VAT-inclusive, per Section 4 |
| Base Unit | Yes | Always on |
| Brand | Yes | Always on |
| Reorder Level | Yes | Always on |
| Valuation Method | No | Always hidden in v3 |
| Wholesale Price | No | perfumes/cosmetics retail is not in WHOLESALE_PRICE_INDUSTRIES for this tenant |
| Pack Name / Factor / Barcode / Sell Price | No | Single-unit retail; no pack groups configured |

**Opening Stock - Batches sheet:** Not generated. `hasBatchTrackedItems = false`.

**How to use the CSVs:** the app only accepts the downloaded XLSX template. Download the inventory template for this tenant, then paste rows from these CSV files into the matching sheets; column order matches exactly.
