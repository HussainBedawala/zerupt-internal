# Withholding Tax (TDS) — Design

> Status: **Not implemented.** No schema, service, or UI.
> Priority: **P1** — required for India compliance (TDS mandatory above ₹30K–₹2.5L thresholds depending on section).
> Depends on: `tax-configuration/01-design.md`, `taxation/04-india-gst-reference.md`

## Problem

Withholding tax (Tax Deducted at Source / TDS) requires the **payer** to deduct a percentage of the payment and remit it to the government on behalf of the payee. This is mandatory in India and exists in several MENA countries (Egypt, Jordan, Morocco).

Unlike VAT/GST (which is added to or included in the price), TDS is **deducted from** the payment amount.

## Scope

### In Scope (Phase 2)

- India TDS on purchases (buyer deducts from supplier payment)
- Configurable TDS sections with rates and thresholds
- Automatic TDS calculation on payment posting
- TDS certificate generation data (Form 16A equivalent)
- Journal entries for TDS deduction

### Out of Scope (Future)

- India TCS (Tax Collected at Source — seller collects)
- Egypt WHT (similar model, different rates)
- Automatic e-filing / government portal integration
- TDS on salaries (payroll module)

## Tax Regime Reference: India TDS

| Section | Nature of Payment | Threshold (₹) | Rate | Rate (no PAN) |
|---------|------------------|---------------|------|---------------|
| 194C | Contractor payment | 30,000 (single) / 1,00,000 (aggregate) | 1% (individual) / 2% (other) | 20% |
| 194H | Commission/brokerage | 15,000 | 5% | 20% |
| 194I | Rent — plant/machinery | 2,40,000 | 2% | 20% |
| 194I | Rent — land/building | 2,40,000 | 10% | 20% |
| 194J | Professional/technical fees | 30,000 | 10% | 20% |
| 194Q | Purchase of goods | 50,00,000 | 0.1% | 5% |

Key rules:
- Threshold is cumulative per supplier per financial year
- If supplier has no PAN, deduct at 20% (or section rate, whichever is higher)
- Lower/nil deduction certificate: supplier provides Form 13 → reduced rate applies

## Schema

### `withholding_tax_sections`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenantId | uuid | |
| legalEntityId | uuid | |
| code | varchar(20) | e.g. "194C", "194J" |
| name | varchar(200) | e.g. "Contractor Payment" |
| country | varchar(2) | ISO country code, e.g. "IN" |
| rate | numeric(7,4) | Standard rate, e.g. 2.0000 |
| rateNoPan | numeric(7,4) | Rate when payee has no PAN/TIN |
| thresholdAmount | numeric(19,6) | Annual threshold below which no TDS |
| thresholdType | enum | `per_transaction`, `cumulative_annual` |
| effectiveFrom | date | |
| effectiveTo | date (nullable) | Null = currently active |
| isActive | boolean | Soft delete |
| createdAt, updatedAt | timestamptz | |

Unique: `(tenantId, legalEntityId, code, effectiveFrom)`

### `supplier_tds_config`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenantId | uuid | |
| supplierId | uuid | FK → suppliers |
| defaultSectionId | uuid (nullable) | FK → withholding_tax_sections. Default TDS section for this supplier. |
| hasPan | boolean | Default true. False → higher rate. |
| panNumber | varchar(20) (nullable) | For validation and certificate generation. |
| lowerDeductionRate | numeric(7,4) (nullable) | From Form 13. Null = use standard rate. |
| lowerDeductionCertNo | varchar(50) (nullable) | Certificate reference. |
| lowerDeductionExpiry | date (nullable) | Certificate validity. |
| isExempt | boolean | Default false. True → no TDS (e.g. government entities). |
| exemptionReason | varchar(200) (nullable) | |
| createdAt, updatedAt | timestamptz | |

Unique: `(tenantId, supplierId)`

### `tds_deductions` (ledger)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| tenantId | uuid | |
| legalEntityId | uuid | |
| supplierId | uuid | FK → suppliers |
| sectionId | uuid | FK → withholding_tax_sections |
| paymentId | uuid | FK → payment voucher that triggered deduction |
| journalEntryId | uuid | FK → journal_entries |
| baseAmount | numeric(19,6) | Amount on which TDS calculated |
| tdsRate | numeric(7,4) | Actual rate applied |
| tdsAmount | numeric(19,6) | Deducted amount |
| financialYear | varchar(9) | e.g. "2026-2027" |
| cumulativeBase | numeric(19,6) | Running total for threshold check |
| deductedAt | timestamptz | |

Index: `(tenantId, supplierId, financialYear)` — for threshold lookups and certificate generation.

## Backend — New Service: `WithholdingTaxService`

### Core Methods

| Method | Purpose |
|--------|---------|
| `shouldDeduct(tenantId, supplierId, sectionId, baseAmount, transactionDate)` | Returns `{ deduct: boolean, rate, tdsAmount, reason }` |
| `calculateDeduction(tenantId, supplierId, sectionId, baseAmount, transactionDate)` | Returns `{ tdsAmount, appliedRate, cumulativeBase, thresholdBreached }` |
| `recordDeduction(deduction, paymentId, journalEntryId, tx)` | Inserts into `tds_deductions` |
| `getCumulativeBase(tenantId, supplierId, sectionId, financialYear)` | Sum of baseAmount for threshold check |
| `getSupplierTdsSummary(tenantId, supplierId, financialYear)` | For certificate generation |

### Calculation Logic

```
1. Look up supplier config
   - If isExempt → return { deduct: false, reason: 'supplier_exempt' }

2. Look up section effective on transactionDate
   - If no active section → return { deduct: false, reason: 'no_active_section' }

3. Check threshold
   - Get cumulative base for (supplier, section, financialYear)
   - If thresholdType = 'cumulative_annual':
     - If cumulativeBase + baseAmount < threshold → return { deduct: false, reason: 'below_threshold' }
     - If cumulativeBase was below threshold but cumulativeBase + baseAmount >= threshold:
       → TDS on FULL cumulative amount (catch-up deduction)
   - If thresholdType = 'per_transaction':
     - If baseAmount < threshold → return { deduct: false, reason: 'below_threshold' }

4. Determine rate
   - If supplier.lowerDeductionRate is set AND not expired → use it
   - Else if supplier.hasPan = false → use section.rateNoPan
   - Else → use section.rate

5. Calculate: tdsAmount = baseAmount × rate / 100
   - Round to currency decimals (ROUND_HALF_EVEN)
```

### Catch-Up Deduction

When cumulative payments cross the threshold mid-year:

```
Scenario: 194C threshold = ₹1,00,000. Payments: ₹40K, ₹40K, ₹30K.
- Payment 1 (₹40K): cumulative = ₹40K < threshold → no TDS
- Payment 2 (₹40K): cumulative = ₹80K < threshold → no TDS
- Payment 3 (₹30K): cumulative = ₹1,10K ≥ threshold
  → TDS on ₹1,10,000 (full cumulative), not just ₹30K
  → Minus any TDS already deducted (₹0) = TDS on ₹1,10,000
```

## Journal Entry Mapping

### `purchase.payment.posted` with TDS

**Without TDS (existing):**

| DR/CR | Account | Amount |
|-------|---------|--------|
| DR | Trade Payables (2111) | Invoice amount |
| CR | Bank (112x) | Invoice amount |

**With TDS:**

| DR/CR | Account | Amount |
|-------|---------|--------|
| DR | Trade Payables (2111) | Invoice amount |
| CR | Bank (112x) | Invoice amount − TDS |
| CR | TDS Payable — {section} (2135) | TDS amount |

The supplier receives `invoiceAmount - tdsAmount`. The deductor (tenant) must remit `tdsAmount` to the government by the 7th of the following month.

### New Account Codes

| Code | Name | Type |
|------|------|------|
| 2135 | TDS Payable | Current Liability |
| 2136 | TDS Payable — 194C | Current Liability (sub-account) |
| 2137 | TDS Payable — 194J | Current Liability (sub-account) |

Sub-accounts per section are optional — a single 2135 with section tracked on the JE line also works.

## Integration Points

```
Purchase payment flow:
  1. User creates payment voucher for supplier
  2. PaymentService calls WithholdingTaxService.shouldDeduct()
  3. If deduct = true:
     - Show TDS in payment UI: "TDS @2% (194C): ₹2,000 — net payment: ₹98,000"
     - User confirms
  4. PaymentService posts payment event with tdsAmount
  5. AccountingEventListener builds JE with TDS payable line
  6. WithholdingTaxService.recordDeduction() stores ledger entry
```

## API Endpoints

### TDS Sections (Admin)

| Method | Route | Permission |
|--------|-------|-----------|
| GET | `/tenant/tds-sections?legalEntityId=` | `settings.tax.read` |
| POST | `/tenant/tds-sections` | `settings.tax.create` |
| PATCH | `/tenant/tds-sections/:id` | `settings.tax.update` |

### Supplier TDS Config

| Method | Route | Permission |
|--------|-------|-----------|
| GET | `/tenant/suppliers/:id/tds-config` | `settings.tax.read` |
| PUT | `/tenant/suppliers/:id/tds-config` | `settings.tax.update` |

### TDS Reports

| Method | Route | Permission |
|--------|-------|-----------|
| GET | `/tenant/tds-deductions?supplierId=&financialYear=` | `accounting.reports` |
| GET | `/tenant/tds-deductions/summary?financialYear=` | `accounting.reports` |

## Frontend

### Supplier Form — TDS Section

Add a "Withholding Tax" section to the supplier edit form:
- Default TDS section (dropdown)
- PAN number (text, validated format: `AAAAA0000A`)
- Has PAN (toggle, default true)
- Lower deduction certificate (collapsible):
  - Rate override (number)
  - Certificate number (text)
  - Expiry date (date picker)
- Exempt toggle + reason

### Payment Voucher — TDS Display

When creating a supplier payment:
- Auto-calculate TDS based on supplier config + section
- Show: "TDS @{rate}% (Section {code}): {amount}"
- Show net payment: "Supplier receives: {netAmount}"
- Allow override: "Apply different section" dropdown
- Allow skip: "No TDS for this payment" (requires reason — audit logged)

### TDS Report Page

- Filter: financial year, supplier, section
- Table: Supplier | Section | Base Amount | Rate | TDS Amount | Payment Date | Certificate
- Summary row: total base, total TDS per section
- Export: CSV for Form 26Q filing

## Country Quick Setup

Add TDS sections to the country quick setup in `tax-configuration/01-design.md`:

- **India:** Seed sections 194C, 194H, 194I (both), 194J, 194Q with current rates and thresholds
- **Egypt:** WHT sections (future — rates differ, 1-20% depending on payment type)
- **Other countries:** No TDS sections seeded
