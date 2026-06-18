# Gulf Hardware & Tools Co. - Accounting Module Test Plan

This document provides a comprehensive end-to-end testing plan for the Accounting module of the Gulf Hardware persona. It covers frontend, backend, and database verification for all accounting flows, using the specific data imported for this persona.

## 1. Opening Balances & Data Migration Verification

**Objective:** Verify that the imported data correctly established the opening financial position without double-counting.

### 1.1 Trial Balance & Subledgers
* **Action:** Navigate to Reports > Trial Balance.
* **Expected Result:** 
  * The Trial Balance loads successfully in under 5 seconds.
  * All amounts are displayed to 3 decimal places (e.g., `1,234.500 KWD`).
* **Action:** Navigate to Reports > Aged Receivables and Reports > Aged Payables.
* **Expected Result:**
  * The grand total of the Aged Receivables report exactly matches the "Accounts Receivable" control account balance in the Trial Balance.
  * The grand total of the Aged Payables report exactly matches the "Accounts Payable" control account balance in the Trial Balance.
* **DB Verification:** Check the `journal_entries` table to ensure the AR and AP control totals from `trial_balance.xlsx` were not double-posted when `customers.csv` and `suppliers.csv` were imported.

### 1.2 Customer Balances
* **Input:** Search for Customer `CN-00001` (United Trading Est).
* **Expected Result:** Outstanding Balance is exactly `1,609.330 KWD`.
* **Input:** Search for Customer `CN-00002` (Desert Interiors).
* **Expected Result:** Outstanding Balance is exactly `211.940 KWD` (verifying the Euro comma-decimal format `"211,94"` was parsed correctly).
* **Input:** Search for Customer `CN-00004` (Capital Engineering).
* **Expected Result:** Credit Limit is `0.000` or `null` (cash/COD only account).

### 1.3 Supplier Balances & AI Column Mapping
* **Input:** Import `suppliers.csv` which has the column header `Outstanding` (instead of `Outstanding Balance`).
* **Expected Result (Mira AI Import):** The AI import pipeline automatically maps the `Outstanding` column to the internal `Outstanding Balance` field without requiring the user to manually rename the column.
* **Input:** Search for Supplier `V-0001` (Kazma Supplies).
* **Expected Result:** Outstanding Balance is exactly `13,664.880 KWD`.

---

## 2. Accounts Receivable & Credit Control

**Objective:** Ensure credit limits are enforced and AR aging is calculated correctly.

### 2.1 Credit Limit Block
* **Input:** Create a new POS "On Account" sale or Sales Order for `CN-00001` (United Trading Est).
  * Current Balance: `1,609.330 KWD`
  * Credit Limit: `5,000.000 KWD`
  * Available Credit: `3,390.670 KWD`
  * Add items to the cart totaling `4,000.000 KWD`.
* **Expected Result (Frontend):** System displays a warning/block that the transaction exceeds the credit limit by `609.330 KWD`.
* **Expected Result (Backend):** API rejects the transaction creation unless a GM override token is provided.

### 2.2 Credit Limit Override
* **Input:** Apply GM override to the blocked transaction above.
* **Expected Result:** Transaction succeeds. Customer's outstanding balance becomes `5,609.330 KWD`.

### 2.3 Cash-Only Accounts
* **Input:** Create an "On Account" sale for `CN-00004` (Capital Engineering) for `10.000 KWD`.
* **Expected Result:** Transaction is blocked because the account has no credit limit (Cash/COD only).

---

## 3. Post-Dated Cheque (PDC) Management

**Objective:** Verify the full lifecycle of PDCs and their GL impact.

### 3.1 Historical PDC Verification
* **Input:** Navigate to PDC Register. Search for `CHQ-738453` (Gulf Builders).
* **Expected Result:** Status is `Cleared`.
* **DB Verification:** Ensure no new GL entries were created for this historical cleared cheque during import.

### 3.2 PDC Lifecycle - Receipt (On Hand)
* **Input:** Receive a new PDC from `CN-00003` (Oasis Builders) for `500.000 KWD`. Cheque No: `CHQ-TEST01`, Date: +30 days.
* **Expected Result (Frontend):** PDC appears in the register as `On Hand`.
* **Expected Result (Backend/GL):** 
  * Debit `PDC Receivable` account: `500.000 KWD`
  * Credit `Customer AR` account: `0.000 KWD` (AR is NOT credited yet).
  * Customer's outstanding balance remains unchanged.

### 3.3 PDC Lifecycle - Deposited
* **Input:** Change status of `CHQ-TEST01` to `Deposited` into "Boubyan Bank".
* **Expected Result (GL):**
  * Debit `Boubyan Bank` account: `500.000 KWD`
  * Credit `PDC Receivable` account: `500.000 KWD`

### 3.4 PDC Lifecycle - Cleared
* **Input:** Change status of `CHQ-TEST01` to `Cleared`.
* **Expected Result (GL):**
  * Debit `PDC Receivable` account: `500.000 KWD`
  * Credit `Accounts Receivable` (Oasis Builders): `500.000 KWD`
* **Expected Result (Frontend):** Oasis Builders outstanding balance decreases by `500.000 KWD`.

### 3.5 PDC Lifecycle - Bounced
* **Input:** Take an existing `Deposited` cheque, e.g., `CHQ-381730` (Pearl Builders, `2,329.030 KWD`), and mark it as `Bounced`.
* **Expected Result (GL):** Reversal of the deposit entry.
  * Debit `PDC Receivable` account: `2,329.030 KWD`
  * Credit `Gulf Bank` account: `2,329.030 KWD`
* **Expected Result (Frontend):** Customer is flagged; balance remains unchanged (since it was never cleared).

---

## 4. Point of Sale (POS) Accounting

**Objective:** Verify counter sales post correctly to the GL and respect price tiers.

### 4.1 Anonymous Cash Sale
* **Input:** Add an item to POS without selecting a customer. Pay `10.000 KWD` in Cash.
* **Expected Result (Frontend):** Retail price is applied automatically. No VAT is calculated.
* **Expected Result (GL):**
  * Debit `Cash in Hand` (Store Branch): `10.000 KWD`
  * Credit `Sales Revenue`: `10.000 KWD`
  * Debit `COGS`: [Item Cost]
  * Credit `Inventory Asset`: [Item Cost]

### 4.2 Named Customer KNET Sale
* **Input:** Select customer `CN-00002` (Desert Interiors). Add items. Pay `50.000 KWD` via KNET.
* **Expected Result (Frontend):** Wholesale/Trade price is applied automatically.
* **Expected Result (GL):**
  * Debit `KNET Clearing` / `Bank` account: `50.000 KWD`
  * Credit `Sales Revenue`: `50.000 KWD`

### 4.3 Split Payment
* **Input:** Total sale `100.000 KWD`. Pay `20.000 KWD` Cash, `80.000 KWD` KNET.
* **Expected Result (GL):**
  * Debit `Cash in Hand`: `20.000 KWD`
  * Debit `KNET Clearing`: `80.000 KWD`
  * Credit `Sales Revenue`: `100.000 KWD`

---

## 5. B2B Sales Documents Accounting

**Objective:** Verify the Quotation -> SO -> DN -> Invoice pipeline GL impacts.

### 5.1 Pre-Invoice Documents
* **Input:** Create a Quotation for `1,000.000 KWD`. Convert to Sales Order. Convert to Delivery Note.
* **Expected Result (GL):** NO financial journal entries are created.
* **Expected Result (Inventory):** Delivery Note reduces physical stock on hand.

### 5.2 A4 Invoice Posting
* **Input:** Convert the Delivery Note to an Invoice.
* **Expected Result (Frontend):** Invoice shows `0.000` VAT. Total is `1,000.000 KWD`.
* **Expected Result (GL):**
  * Debit `Accounts Receivable` (Customer): `1,000.000 KWD`
  * Credit `Sales Revenue`: `1,000.000 KWD`
  * Debit `COGS`: [Total Cost of Items]
  * Credit `Inventory Asset`: [Total Cost of Items]

### 5.3 Open Quotations Migration Check
* **Input:** Check `open_quotations.csv` imported records.
* **Expected Result:** They appear in the pipeline but have generated `0` GL entries.

---

## 6. Purchasing & Accounts Payable

**Objective:** Verify supplier invoices and payments.

### 6.1 Goods Receipt & Supplier Invoice
* **Input:** Create a Purchase Order for `V-0002` (Mubarak Distribution) for `5,000.000 KWD`. Receive goods (GRN) and post Supplier Invoice.
* **Expected Result (GL upon Invoice):**
  * Debit `Inventory Asset`: `5,000.000 KWD`
  * Credit `Accounts Payable` (Mubarak Distribution): `5,000.000 KWD`

### 6.2 Supplier Payment
* **Input:** Record a payment to `V-0002` for `2,000.000 KWD` via Bank Transfer.
* **Expected Result (GL):**
  * Debit `Accounts Payable` (Mubarak Distribution): `2,000.000 KWD`
  * Credit `Bank Account`: `2,000.000 KWD`
* **Expected Result (Frontend):** Supplier outstanding balance decreases by `2,000.000 KWD`.

---

## 7. Reporting & Precision

**Objective:** Verify Kuwaiti localization (KWD, 3 decimals, no VAT).

### 7.1 Precision and Rounding
* **Input:** Sell 3 units of an item priced at `0.333 KWD` each.
* **Expected Result:** Subtotal is `0.999 KWD`.
* **Input:** Apply a 10% discount to an item priced at `1.255 KWD`.
* **Expected Result:** Discount is `0.1255`, rounded half-up to `0.126 KWD`. Final price `1.129 KWD`.

### 7.2 VAT Exclusion
* **Input:** Generate any Invoice, POS Receipt, or Quotation.
* **Expected Result:** No VAT line exists. No "0% VAT" text is displayed. The subtotal equals the grand total.

### 7.3 Performance
* **Input:** Open the Trial Balance, P&L, and Aged Receivables reports.
* **Expected Result:** Each report loads and renders in under 5 seconds, handling the 4,200 customers and 8,500 items efficiently without timeouts.
