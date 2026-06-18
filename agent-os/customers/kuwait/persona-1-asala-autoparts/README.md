# Al-Asala Auto Parts (قطع غيار الأصالة): Customer Requirements

> Single auto-parts and accessories shop in Shuwaikh, Kuwait. Tier: Simple / happy path. Country: Kuwait (KWD, 3-decimal fils). Intake date: 2026-06-15.

---

## At a glance

| Field | Value |
|---|---|
| Legal / trade name (EN) | Al-Asala Auto Parts |
| Trade name (AR) | قطع غيار الأصالة |
| Owner | Bader Al-Otaibi |
| Industry | Automotive parts and accessories (retail) |
| Locations | 1 (Shuwaikh Industrial Area, Kuwait) |
| Users | 2 (owner, counter staff) |
| Items (approx.) | 150 across 8 categories |
| Customers | 4 (3 trade accounts + Walk-in) |
| Suppliers | 2 |
| Currency | KWD (Kuwaiti Dinar, 3 decimal places / fils) |
| Tax / VAT | None. Kuwait has no VAT. |

---

## 1. Business profile and legal

Al-Asala Auto Parts is a single retail shop selling filters, oils, brakes, batteries, belts, wipers, tyres, and electrical parts to garages and individual car owners. We have been operating for several years. We are a sole trader under the owner's civil ID; no formal company registration number is needed in the system. We do not issue tax invoices because Kuwait has no VAT.

We want to move off a manual spreadsheet-based system. Our main goals are: accurate live stock counts, a working POS at the counter, and clean books so we know what the business owes and is owed at any time.

---

## 2. Locations and organisation structure

One branch only: the Shuwaikh shop. We do not have a separate warehouse; stock lives on the shop floor and a small back room that we treat as one location. We do not need multi-warehouse or multi-branch features.

Branch header for receipts: Al-Asala Auto Parts, Shuwaikh Industrial Area, Kuwait. Phone: +965 2233 4455.

---

## 3. Users, roles and permissions

| User | Role | Access notes |
|---|---|---|
| Bader Al-Otaibi (owner) | Admin / full access | Everything |
| Counter staff (1 person) | Cashier | POS + stock lookup only. Should NOT see cost prices or accounting reports. |

No need for store-manager role, approval workflows, or time-based access restrictions.

---

## 4. Products and inventory

- Approximately 150 items organised into 8 categories: Filters, Oils and Fluids, Brakes, Belts, Wipers, Electrical, Batteries, Tyres.
- All items are simple SKUs (Each unit). No serialised items, no IMEI tracking, no lot or expiry management.
- Each item has a barcode (EAN-13 format) printed on packaging; we use a USB barcode scanner at the counter.
- SKU codes follow the pattern `FLT-0001`, `OIL-0001`, etc. These must be preserved exactly on import; they are on our bin labels.
- Stock valuation: we use the cost price on record (weighted average is fine). Opening stock quantities are included in the `products.csv` file.
- No kit or bundle items. No variants (colour/size). No pack-unit conversions; everything is sold by the piece.
- We do not need lot tracking, expiry alerts, or reorder-point automation at this stage.

---

## 5. Pricing

- One price list: standard retail selling price. No tiered pricing, no customer-group pricing.
- We occasionally give a manual discount at the counter (round number, e.g. 500 fils off). The cashier should be able to enter a line-level or cart-level discount at the POS.
- No promotions, scheduled sales, or loyalty points needed.
- Prices are in KWD to 3 decimal places (fils).

---

## 6. Customers and receivables

We have three trade accounts that sometimes buy on credit and a Walk-in bucket for cash customers.

| Code | Name | Notes |
|---|---|---|
| C-001 | Al Salam Garage | Opening balance KWD 250.000 |
| C-002 | Speed Motors Workshop | No opening balance |
| C-003 | Bader Auto Service | Opening balance KWD 120.500 |
| C-004 | Walk-in Customer | No balance; used for all anonymous cash sales |

Total AR opening balance: KWD 370.500 (must tie to account 1131 in the trial balance).

We do not need AR aging statements, credit limits, or formal payment terms at this stage. A simple customer ledger showing what each garage owes us is enough.

---

## 7. Suppliers, payables and purchasing

Two suppliers, both local Kuwait wholesalers:

| Code | Name | Phone | Opening AP balance |
|---|---|---|---|
| S-001 | Gulf Parts Distribution | +965 2233 4455 | KWD 2,400.000 |
| S-002 | Shuwaikh Auto Supply | +965 2288 7766 | KWD 1,100.000 |

Total AP opening balance: KWD 3,500.000 (must tie to account 2111 in the trial balance).

We place purchase orders verbally or by phone; we do not need a formal PO module at go-live. Recording supplier bills when stock arrives is sufficient.

No post-dated cheques (PDC) to track. No foreign-currency suppliers.

---

## 8. Accounting and finance

**Opening balances and trial balance:** We have a clean, balanced trial balance from our previous system. The file is `trial_balance.csv`. It has 6 accounts: Cash on Hand, Bank (NBK Current), Accounts Receivable, Inventory, Accounts Payable, and Owner Capital. Total debits = total credits (KWD 204,987.820 each side). No opening-balance equity plug is needed.

**Chart of accounts:** We do not need a complex COA. Standard GCC retail COA is fine. We just need the accounts above wired correctly.

**Fiscal year:** 1 January to 31 December (calendar year).

**Base currency:** KWD. All amounts to 3 decimal places (fils). Rounding: standard arithmetic rounding to 3 dp.

**Tax / VAT:** Kuwait has no VAT. Tax fields should be blank or zero. We do not want VAT lines on receipts.

**Bank accounts:** One: NBK Current Account (National Bank of Kuwait). We also keep a petty-cash float at the till.

**Post-dated cheques:** Not applicable. Not needed for us.

---

## 9. Point of sale (POS)

- One POS terminal at the counter (Windows PC with a browser).
- We open the shift with a small cash float (typically KWD 50). We want to record the float at shift open.
- Payment methods: Cash and KNET card. We do not accept cheques or bank transfer at the counter.
  - Cash: system should calculate change due.
  - KNET: terminal is handled physically; the cashier just selects KNET in the system to record the payment.
- Split payment (part cash, part KNET) is not common for us but would be useful if available.
- Returns: simple item return with refund to cash or reversal. Not a frequent event but it does happen.
- Discounts: cashier can apply a manual discount (amount or percent) at line level or cart level.
- We do not need a kitchen display, table management, or anything beyond a standard retail counter POS.

---

## 10. Sales documents

We only need the thermal receipt at the point of sale. We do not issue formal A4 invoices, quotations, sales orders, or delivery notes. All trade-account sales are also done face-to-face at the counter.

Not needed for us: quotations, sales orders, delivery notes, A4 tax invoices.

---

## 11. Printing and templates

- **Receipt:** 80mm thermal roll, printed on the shop's thermal printer.
- **Layout:** Business logo at the top, then branch name and phone, then item lines, then totals (subtotal, discount if any, total in KWD), then payment method, then change due.
- **Language:** Arabic primary, English secondary (bilingual receipt is fine).
- **Logo file:** `logo-asala.png` (PNG, also an SVG variant available). Logo goes at the top of the receipt.
- No VAT summary section needed.
- We do not need A4 document templates at this stage.

---

## 12. Reporting and analytics

We need the basics:

- Daily sales summary (total sales, cash vs KNET split, number of transactions).
- Stock on hand report (current qty and value per item).
- Profit and loss (monthly is sufficient).
- Balance sheet (to confirm AR, AP, and inventory values).
- Customer ledger (what each of the 3 trade accounts owes).

We do not need advanced analytics, dashboards with charts, or custom report builder at go-live. The standard reports that come with the system are enough for now.

---

## 13. Data migration

All files are clean and straightforward. No encoding issues, no mixed number formats, no duplicate rows. The trial balance is balanced. Import order matters for accounting integrity.

**Import order:**

1. `trial_balance.csv` (set opening balances and conversion date)
2. `products.csv` (items with opening stock quantities)
3. `customers.csv` (3 trade accounts + Walk-in, with AR opening balances)
4. `suppliers.csv` (2 suppliers with AP opening balances)

After import, verify: AR control (1131) = KWD 370.500, AP control (2111) = KWD 3,500.000, Inventory (1141) = KWD 190,717.320. These must match the trial balance exactly and must not be double-posted.

**Quirks / notes:** None. This is the clean path. SKU codes (`FLT-0001` format) must be preserved as-is because they are on our bin labels.

---

## 14. Integrations and hardware

| Hardware | Details |
|---|---|
| Barcode scanner | USB wired scanner (plug-and-play, HID keyboard emulation). Scans EAN-13 barcodes on packaging. |
| Thermal printer | 80mm USB thermal receipt printer (ESC/POS). |
| Cash drawer | Connected to the thermal printer; opens on sale completion. |
| KNET terminal | Standalone physical terminal from the bank. Not integrated with the software; cashier records the payment manually in the POS. |

No e-commerce, no accounting software sync (e.g. QuickBooks), no WhatsApp integration needed at go-live.

---

## 15. Operational details (the small stuff)

| Item | Detail |
|---|---|
| Working hours | Saturday to Thursday, approximately 8:00 AM to 6:00 PM |
| Weekend | Friday and Saturday (Kuwait) |
| Primary language | Arabic (UI and receipts); English acceptable for product SKUs and system labels |
| Phone format | 8 digits, e.g. 9988 7766 (country code +965) |
| Currency rounding | 3 decimal places (fils); standard rounding |
| Receipt language | Bilingual (Arabic + English) |
| Number format | Standard: 1,234.500 (comma thousands separator, period decimal) |
| Date format | DD/MM/YYYY |

---

## 16. Special or custom requirements

None. This is a straightforward single-shop setup. We have no custom workflows, special integrations, or unusual business rules. The standard Zerupt retail configuration covers everything we need.

---

## 17. Go-live expectations, training and success criteria

**Timeline:** We want to go live within one working day of onboarding starting, ideally the same afternoon.

**Training:** The owner will learn the system himself via the onboarding wizard. Counter staff needs 30 minutes of coaching on the POS screen only (ring up a sale, take cash, take KNET, print receipt, do a return).

**Success criteria:**

1. Opening stock matches our physical count (150 items, qtys from `products.csv`).
2. Opening AR (KWD 370.500) and AP (KWD 3,500.000) match what our old records show.
3. Counter staff can ring up a sale, take payment, and print a receipt without help within 5 minutes.
4. End-of-day cash in the till matches the system's cash total for the shift.
5. Owner can pull a P&L and balance sheet and the numbers look sane.

**Support preference:** WhatsApp message first; video call if something is broken.

---

## 18. Open questions and risks

| # | Question / Risk | Status |
|---|---|---|
| 1 | Conversion date: what date should we treat as the opening balance date? Owner to confirm (likely end of last month). | Open |
| 2 | NBK bank balance (KWD 12,400.000): confirm this is the actual account balance on the conversion date, not a rough estimate. | Open |
| 3 | Walk-in Customer record: confirm it should carry zero opening balance and be used for all anonymous counter sales. | Confirmed |
| 4 | SKU labels on bins: bins are already labelled `FLT-0001` etc. If the import changes the format, labels become wrong. Risk is low since this is a clean import, but worth confirming SKUs are preserved exactly. | Low risk |

---

## Data file manifest

| File | Contents | Rows (excl. header) | Notes |
|---|---|---|---|
| `trial_balance.csv` | 6 GL account opening balances | 6 | Balanced: debits = credits = KWD 204,987.820. Import first. |
| `products.csv` | Item master: SKU, name, category, unit, cost, selling price, opening qty, barcode | 150 | Clean. EAN-13 barcodes. SKUs must be preserved exactly. |
| `customers.csv` | 3 trade accounts + Walk-in, with phone/email and opening AR balances | 4 | AR total = KWD 370.500. C-002 and C-004 have no opening balance. |
| `suppliers.csv` | 2 local suppliers with opening AP balances | 2 | AP total = KWD 3,500.000. |
| `logo-asala.png` | Shop logo (PNG) | n/a | Upload to Settings. Appears at top of 80mm receipt. |
| `logo-asala.svg` | Shop logo (SVG variant) | n/a | Alternative format; SVG accepted for logo uploads. |
