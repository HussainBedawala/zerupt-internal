# Tax Framework — Design Implications for Zerupt ERP

> Last updated: 2026-03-14
> Derived from: 01-gcc, 02-mena-non-gcc, 03-southeast-asia, 04-india-gst references

---

## Summary of Tax Systems Across Target Markets

| Country | Tax System | Standard Rate | Input Credit? | E-Invoicing |
|---------|-----------|---------------|---------------|-------------|
| UAE | VAT | 5% | Yes | Planned |
| Saudi Arabia | VAT | 15% | Yes | ZATCA Fatoora (mandatory) |
| Bahrain | VAT | 10% | Yes | Planned |
| Oman | VAT | 5% | Yes | Fawtara (Aug 2026) |
| Qatar | None (planned 5%) | — | — | — |
| Kuwait | None | — | — | — |
| Egypt | VAT | 14% | Yes | ETA (mandatory) |
| Jordan | GST (VAT-like) | 16% | Yes | Not yet |
| Lebanon | VAT | 11% | Yes | Not yet |
| Iraq | Selective sales tax | Varies | No | — |
| Morocco | VAT | 20% | Yes | Not yet |
| Tunisia | VAT | 19% | Yes | Not yet |
| Singapore | GST | 9% | Yes | InvoiceNow (voluntary) |
| Malaysia | SST (split) | 5-10% / 6-8% | **No** | MyInvois (mandatory) |
| Indonesia | PPN (VAT) | 11% / 12% luxury | Yes | e-Faktur (mandatory) |
| Thailand | VAT | 7% (temp) / 10% (statutory) | Yes | Voluntary |
| Philippines | VAT | 12% | Yes | Phased |
| Vietnam | VAT | 8% (temp) / 10% | Yes | Mandatory |
| Cambodia | VAT | 10% | Yes | Not yet |
| Myanmar | Commercial Tax | 5% | **No** | Not yet |
| Brunei | None | — | — | — |
| India | Dual GST | 5% / 18% / 40% | Yes | Mandatory (≥₹5cr) |

---

## Critical Design Requirements

### 1. Multiple Tax System Types

The `TaxCode.type` enum needs to support:
- **Exclusive** — tax added on top (most countries)
- **Inclusive** — tax embedded in price (retail contexts, some B2C scenarios)

The system also needs a concept of **tax system type** at the tenant/entity level:
- `VAT` — standard multi-stage with input credit (UAE, Saudi, Bahrain, Oman, Egypt, etc.)
- `GST_DUAL` — India's CGST/SGST/IGST split
- `SST` — Malaysia's single-stage sales + service tax (no input credit)
- `SALES_TAX` — simple single-stage (Myanmar, Iraq)
- `NONE` — no consumption tax (Kuwait, Qatar, Brunei)

### 2. Date-Effective Rates Are Critical

| Scenario | Country | Details |
|----------|---------|---------|
| Rate expiry | Thailand | 7% expires Sep 30, 2026 — may revert to 10% |
| Temporary reduction | Vietnam | 8% expires Dec 31, 2026 — reverts to 10% |
| Major slab change | India | GST 2.0 (Sep 22, 2025) — old 12%/28% → 5%/18%/40% |
| Gradual reform | Morocco | Simplifying to 0%/10%/20% by end 2026 |

The `TaxRate` entity with `effectiveFrom`/`effectiveTo` dates is essential. Rate lookup must always use **transaction date**, never current date.

### 3. Compound Tax Calculation

India's Compensation Cess is calculated on the base + prior non-compound taxes. The `isCompound` flag on `TaxGroupComponent` handles this correctly per the spec.

Example: Luxury car — 18% GST + 22% Cess
- GST (non-compound): ₹100 × 18% = ₹18
- Cess (compound on base only in this case): ₹100 × 22% = ₹22
- Total: ₹140

### 4. Tax Category Distinctions

The `TaxCode.category` enum is critical:
- **Standard** — normal taxable supply
- **ZeroRated** — 0% rate but input credit is allowed (exports)
- **Exempt** — no tax AND no input credit (financial services in some countries)
- **ReverseCharge** — recipient pays instead of supplier
- **NonRecoverable** — tax paid but cannot be claimed as input credit

Zero-rated vs Exempt is the most commonly confused distinction and has major financial implications.

### 5. Jurisdiction-Based Tax Determination

| Country | Jurisdiction Level | How Determined |
|---------|-------------------|----------------|
| India | State-level | Supplier GSTIN state code vs recipient GSTIN state code |
| USA (future) | State/county/city | Shipping address (nexus rules) |
| GCC countries | National | Single rate per country |
| Malaysia | National | Product/service classification |

For India specifically: the first 2 digits of GSTIN encode the state. Same state → CGST+SGST. Different state → IGST.

### 6. E-Invoicing Compliance Fields

Tax codes and invoices need metadata for compliance:

| Country | System | Required Fields |
|---------|--------|----------------|
| Saudi Arabia | ZATCA Fatoora | Tax category code, exemption reason code |
| India | IRP/GSTN | HSN/SAC code, GSTIN, IRN, QR code |
| Egypt | ETA | Tax ID, UUID, electronic signature |
| Oman | Fawtara | Structured invoice fields (upcoming) |
| Indonesia | e-Faktur | Tax invoice serial number (NSFP) |

### 7. No-Tax Countries

Kuwait, Qatar (for now), and Brunei need a "No Tax" default group. The system should:
- Allow tenant setup with zero tax codes
- Not require tax group assignment on items
- Still allow adding tax codes when these countries implement VAT

---

## Recommendations Beyond Spec

### A. Add `taxSystem` to LegalEntity or TenantIdentity
The spec's `TaxCode` model doesn't capture which tax system the entity operates under. Add a field:
```
taxSystem: VAT | GST_DUAL | SST | SALES_TAX | NONE
```
This drives UI behavior (show/hide CGST/SGST split, enable/disable ITC tracking).

### B. Add `countryTaxProfile` Seed Data
Pre-built tax configurations per country that can be applied during onboarding:
- "UAE Standard" → VAT 5% exclusive
- "India GST 18%" → CGST 9% + SGST 9% (intra) / IGST 18% (inter)
- "Malaysia SST" → Sales 10% + Service 8%

### C. HSN/SAC Code Field on TaxCode or Separate Entity
India requires HSN codes per product. Add an optional `hsnCode` field or a separate `ProductTaxClassification` entity that maps products to tax codes by jurisdiction.

### D. Consider Tax Exemption Certificates
B2B customers in many countries can provide tax exemption certificates. The spec mentions item/customer/category/transaction-type exemptions — ensure the customer entity has a `taxExemptionStatus` field.

### E. Audit Trail for Rate Changes
Every rate change must be audit-logged. When a `TaxRate` is created or its `effectiveTo` is set, create an audit entry. This is critical for GCC compliance (ZATCA) and India (GST Council notifications reference).
