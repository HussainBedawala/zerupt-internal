# Withholding Tax / TDS — Study Topics

## Concepts

### What is TDS (Tax Deducted at Source)?
- The **payer** deducts tax from the payment and remits it to the government on behalf of the payee
- Unlike VAT/GST (added to price), TDS is **deducted from** the payment
- Mandatory in India above certain thresholds, exists in Egypt, Jordan, Morocco

### India TDS Sections
- Each section covers a type of payment (contractors, rent, professional fees, goods)
- Each has a standard rate, a no-PAN rate (20% minimum), and an annual threshold
- Key sections: 194C (contractors), 194H (commission), 194I (rent), 194J (professional), 194Q (goods)

### Threshold Tracking
- **Cumulative annual**: aggregate all payments to a supplier per FY; TDS kicks in when cumulative crosses threshold
- **Per transaction**: each payment checked independently against threshold
- **Catch-up deduction**: when cumulative crosses threshold mid-year, TDS on the FULL cumulative (not just the crossing payment)

### Financial Year
- India FY: April 1 to March 31 (e.g., "2026-2027")
- Thresholds and deductions reset at FY boundary
- Cumulative tracking is per-supplier per-section per-FY

### Rate Determination Priority
1. No PAN → always use higher rate (§206AA: max of section rate or 20%)
2. Lower deduction certificate (Form 13) → use reduced rate if not expired
3. Standard section rate

## Technical Concepts

### Exact Decimal Arithmetic
- IEEE 754 floating-point (`parseFloat`) loses precision on financial amounts
- `decimal.js` with `ROUND_HALF_EVEN` (banker's rounding) ensures exact calculations
- All TDS amounts stored as `numeric(19,6)` in Postgres

### Concurrent Payment Race Condition
- Two payments for the same supplier processed simultaneously could both read the same prior cumulative
- Solution: `SELECT ... FOR UPDATE` locks rows during threshold check within a transaction
- Without locking: both payments could independently trigger catch-up, causing double-deduction

### Idempotency Guard
- `UNIQUE(tenant_id, payment_id, section_id)` on deductions table
- Prevents duplicate TDS records from retry logic or double-processing
- Insert fails if same payment already has a deduction for that section

## Further Reading
- India Income Tax Act: Sections 194C, 194H, 194I, 194J, 194Q, 206AA
- Form 16A: TDS certificate issued to deductee
- Form 26Q/27Q: Quarterly TDS return filed with government
