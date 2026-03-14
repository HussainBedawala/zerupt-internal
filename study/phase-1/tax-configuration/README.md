# Tax Configuration — Study Topics

> From DEV-45: Build tax configuration framework (tax codes, groups, rates)

---

## 1. Date-Effective Rate Versioning

**What:** Storing multiple rate versions per tax code with `effectiveFrom`/`effectiveTo` date ranges, and always looking up rates by transaction date rather than current date.

**Why it matters:** Tax rates change — Thailand's 7% VAT expires Sep 2026 (reverts to 10%), Vietnam's 8% temporary rate expires Dec 2026, India's GST 2.0 changed slabs on Sep 22, 2025. If you use "current rate" instead of "transaction date rate," you'll misstate taxes on historical transactions and fail audits. ZATCA (Saudi) and GST (India) authorities compare your submitted returns against the rate that was legally effective on the invoice date.

**How it works:**
- Each `TaxRate` row has `[effectiveFrom, effectiveTo)` — a half-open interval
- `effectiveTo = null` means "still active / no end date"
- Lookup query: `WHERE effectiveFrom <= txDate AND (effectiveTo IS NULL OR effectiveTo > txDate)`
- Overlap prevention: before inserting, check no existing rate covers any part of the new period
- Race condition: use `SELECT ... FOR UPDATE` on the parent TaxCode row to serialize concurrent rate mutations within a transaction

**Resources:**
- [PostgreSQL range types](https://www.postgresql.org/docs/current/rangetypes.html) — alternative to manual overlap checks
- [Temporal tables pattern](https://en.wikipedia.org/wiki/Temporal_database) — academic foundation for date-effective data

---

## 2. Multi-Tax-System Architecture (VAT vs GST vs SST)

**What:** Different countries use fundamentally different consumption tax systems. A single "tax rate" field cannot model them all.

**Why it matters:** Zerupt targets MENA + SEA + India — three distinct tax system families:
- **VAT** (most countries): Multi-stage, input credit allowed, single rate per transaction
- **GST Dual** (India): Split between Central (CGST) and State (SGST) for intra-state, or unified IGST for inter-state. The split is determined by comparing supplier and recipient GSTIN state codes.
- **SST** (Malaysia): Single-stage, NO input credit. Sales Tax (on goods) and Service Tax (on services) are separate levies with different rates.

**How it works:**
- `TaxSystemType` enum on `LegalEntity` drives UI behavior (show/hide CGST/SGST split, enable/disable ITC tracking)
- `TaxGroup` bundles multiple `TaxCode` components (e.g., CGST 9% + SGST 9% = GST 18%)
- `isCompound` flag on group components handles India's Compensation Cess (calculated on base + prior taxes)
- Malaysia SST is modeled with `NonRecoverable` category since there's no input credit mechanism

**Resources:**
- [India GST Council notifications](https://gstcouncil.gov.in/) — official rate change announcements
- [Malaysia MySST Portal](https://mysst.customs.gov.my/) — SST registration and compliance

---

## 3. Tax Categories and Their Financial Impact

**What:** The distinction between Standard, ZeroRated, Exempt, ReverseCharge, and NonRecoverable determines how tax flows through the accounting system.

**Why it matters:** Getting the category wrong has direct financial consequences:
- **Zero-rated** (0% rate, input credit allowed): Used for exports. You charge 0% but can still recover the tax you paid on inputs. Misclassifying as Exempt means you lose input credit.
- **Exempt** (no tax, no input credit): Financial services, healthcare in many countries. You don't charge tax AND you can't recover input tax on related purchases.
- **Reverse Charge**: The buyer (not seller) pays the tax. Creates self-invoices. Net zero on the books but both sides must appear on tax returns. Common for imported services.
- **NonRecoverable**: Tax is paid but cannot be claimed back (Malaysia SST, Myanmar Commercial Tax). The tax becomes part of the cost of goods.

**How it works:**
```
Sales (Standard):
  DR  Accounts Receivable    [total incl. tax]
  CR  Sales Revenue          [net before tax]
  CR  Output Tax Payable     [tax amount]

Purchases (Standard, recoverable):
  DR  Inventory/Expense      [net before tax]
  DR  Input Tax Recoverable  [recoverable tax]
  CR  Accounts Payable       [total incl. tax]

Purchases (NonRecoverable):
  DR  Inventory/Expense      [net + tax — tax becomes cost]
  CR  Accounts Payable       [total incl. tax]

Reverse Charge:
  DR  Input Tax Recoverable  [tax]
  CR  Output Tax Payable     [tax]
  (Net zero, but both reported on tax return)
```

**Resources:**
- [ZATCA VAT Guide](https://zatca.gov.sa/en/RulesRegulations/VAT/Pages/default.aspx) — Saudi classification rules
- [IRAS GST Guide](https://www.iras.gov.sg/taxes/goods-services-tax-(gst)) — Singapore zero-rated vs exempt

---

## 4. Row-Level Locking for Financial Data Integrity

**What:** Using `SELECT ... FOR UPDATE` to prevent race conditions when multiple concurrent requests try to modify related financial records.

**Why it matters:** Tax rate overlap detection is a classic TOCTOU (Time-Of-Check-Time-Of-Use) bug. Two concurrent requests can both check "no overlapping rate exists," both pass the check, and both insert — creating overlapping rate periods. This corrupts `getEffectiveRate` (which rate applies on a given date?), leading to incorrect tax calculations on invoices.

**How it works:**
- Lock the parent row (`TaxCode`) at the start of the transaction: `SELECT id FROM tax_codes WHERE id = $1 FOR UPDATE`
- This serializes all concurrent rate mutations for the same tax code
- Other tax codes are unaffected (row-level lock, not table-level)
- The lock is held only for the duration of the transaction (milliseconds)
- Alternative: PostgreSQL `SERIALIZABLE` isolation level (heavier, locks more broadly)

**Resources:**
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Designing Data-Intensive Applications, Ch. 7](https://dataintensive.net/) — transaction isolation and race conditions

---

## 5. Compound Tax Calculation

**What:** When `isCompound = true` on a tax group component, that component is calculated on the base amount plus all prior non-compound taxes, not just the base.

**Why it matters:** India's Compensation Cess works this way. Without compound calculation support, you cannot correctly compute taxes for luxury goods in India.

**How it works:**
```
Example: Luxury car — 18% GST + 22% Cess (compound)
  Base amount: ₹100
  GST (non-compound): ₹100 × 18% = ₹18
  Cess (compound): (₹100 + ₹18) × 22% = ₹25.96   ← NOT ₹100 × 22%
  Total: ₹143.96

Without compound: ₹100 + ₹18 + ₹22 = ₹140  (understates by ₹3.96)
```

The `sortOrder` field determines which components are "prior" — lower sortOrder = calculated first. Only non-compound taxes accumulate into the compound base.

**Resources:**
- [CBIC Compensation Cess notifications](https://www.cbic.gov.in/) — India cess rate schedules
- [ClearTax GST Calculator](https://cleartax.in/s/gst-calculator) — interactive compound calculation examples

---

## 6. E-Invoicing Compliance Landscape

**What:** Many target countries require electronic invoice submission to government portals, with specific data formats, signing requirements, and real-time clearance.

**Why it matters:** Non-compliance means invoices are legally invalid. In Saudi Arabia (ZATCA Fatoora Phase 2), B2B invoices must be cleared by ZATCA before you can issue them to the buyer. In India, businesses above ₹5cr turnover must generate an IRN (Invoice Reference Number) from the IRP portal.

**Key systems (2026):**
| Country | System | Status |
|---------|--------|--------|
| Saudi Arabia | ZATCA Fatoora | Mandatory, rolling to ≥SAR 375K revenue |
| India | IRP/GSTN | Mandatory for ≥₹5cr turnover |
| Egypt | ETA | Mandatory for all VAT-registered |
| Oman | Fawtara | Mandatory from Aug 2026 |
| Malaysia | MyInvois | Mandatory, phased rollout |
| Indonesia | e-Faktur | Mandatory for all PKP |
| Vietnam | e-Invoice | Mandatory for all businesses |

**Note:** DEV-45 built the data model foundation. E-invoicing integration (API calls to government portals) is a Phase 2+ concern.

**Resources:**
- [ZATCA E-Invoicing Developer Portal](https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/What-is-e-invoicing.aspx)
- [India E-Invoice Portal](https://einvoice1.gst.gov.in/)
