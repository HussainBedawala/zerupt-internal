# Compliance Watcher Agent

## Purpose

Monitor tax configuration and flag potential compliance issues before they become problems. Covers GCC VAT, India GST, and SEA SST/PPN regimes.

**Rate limit:** 10 suggestions/day/tenant

---

## Monitors

### Event-Driven Checks

| Check | Trigger Event | Logic |
|-------|---------------|-------|
| Zero-tax invoice in VAT-registered tenant | `sales.invoice.confirmed` | If tenant has an active VAT/GST/SST registration and an invoice is confirmed with zero tax on a standard-rated item, flag as Critical. |
| Tax component mismatch | `sales.invoice.confirmed`, `purchase.invoice.confirmed` | If an item uses a tax component that doesn't match its tax category, flag as Warning. |
| ZATCA validation failure (KSA) | `sales.invoice.confirmed` | For KSA tenants: validate e-invoice against ZATCA schema. Flag any schema validation errors as Critical. |
| GST mismatch (India) | `sales.invoice.confirmed` | For India tenants: verify CGST+SGST or IGST is applied correctly based on supplier/customer state vs. tenant state. |

### Scheduled Checks

| Check | Schedule | Logic |
|-------|----------|-------|
| Tax rate effective date approaching | Daily (`0 7 * * *`) | Check for tax rate versions with future `effectiveFrom` dates within 14 days. Flag affected price lists that haven't been updated. |
| Filing deadline readiness | Daily (`0 7 * * *`) | 5 days before filing deadline: verify all transactions posted and reconciled for the period. |
| Missing tax registration | Monthly (`0 7 1 * *`) | If transaction volume exceeds the country's mandatory registration threshold but no TRN is configured, flag as Critical. |
| Tax component nightly scan | Nightly (`0 3 * * *`) | Scan all items: flag items whose tax component doesn't match their category. |

## Multi-Region Coverage

### GCC VAT

| Country | Rate | Special Rules |
|---------|------|---------------|
| KW | 0% (VAT-ready) | No active VAT. Monitor for future introduction. |
| SA | 15% | ZATCA e-invoicing compliance. Phase 2 (reporting) and Phase 3 (integration) requirements. |
| AE | 5% | Standard VAT. FTA filing deadlines. |
| BH | 10% | Standard VAT. NBR filing deadlines. |
| QA | 0% | No VAT currently. |
| OM | 0% | No VAT currently. |

### India GST

| Component | Rate Range | Logic |
|-----------|-----------|-------|
| CGST + SGST | 0–14% each | Intra-state transactions |
| IGST | 0–28% | Inter-state transactions |
| Cess | Variable | Applicable to specific items (luxury, tobacco) |

Checks: HSN code mapping, state-based component selection, composition scheme limits, GSTR filing readiness.

### SEA

| Country | Tax | Rate | Special Rules |
|---------|-----|------|---------------|
| MY | SST | Sales Tax 10%, Service Tax 8% | Registration threshold MYR 500,000 |
| ID | PPN | 11% | E-Faktur compliance |
| SG | GST | 9% | Standard GST |

## Example Suggestions

**CRITICAL:**
> Invoice INV-DXB-0891 was created with zero tax for a standard-rated item ("Office Desk"). This may indicate a tax configuration error.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/sales/invoices/{id}", secondaryRoute: "/settings/tax" } }`

**WARNING:**
> New VAT rate of 10% takes effect on 2026-04-01 for Bahrain. 3 price lists have not been updated to reflect the new rate.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/settings/price-lists?needsUpdate=true" } }`

**INFO:**
> Your VAT return for Q1 2026 is due in 12 days. All transactions are posted and reconciled.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/reports/vat-return?period=2026-Q1" } }`

**CRITICAL (India):**
> Invoice INV-MUM-0234 applies CGST+SGST but customer is in a different state (Maharashtra → Gujarat). IGST should be applied instead.
>
> `suggestedAction: { actionType: "navigate", endpoint: null, payload: { route: "/sales/invoices/{id}" } }`

## Event References

- `sales.invoice.confirmed`
- `purchase.invoice.confirmed`
- `accounting.journal.posted` (tax-related journals)

## Permissions

| Action | Required Key |
|--------|--------------|
| View compliance suggestions | `dashboard.suggestions.view` + `settings.tax.view` |
| Navigate to invoice | `sales.invoice.view` or `purchase.invoice.view` |
| Navigate to tax settings | `settings.tax.view` |
