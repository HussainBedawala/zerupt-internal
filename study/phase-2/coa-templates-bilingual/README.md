# COA Templates: Country+Industry Combinations & Bilingual Accounting

## Core Concepts

### Composable Template Architecture
Templates are built by composing layers, not duplicating entire COAs per country:
1. **Base template** — universal accounts shared across all industries and countries
2. **Industry overlay** — additive accounts for specific business types (wholesale adds trade discounts)
3. **Country overlay** — jurisdiction-specific tax accounts (India dual GST, Malaysia SST)
4. **Bilingual names** — localized `nameAlt` per country (Arabic for GCC, Malay for MY)
5. **Country name overrides** — rename base accounts for jurisdictional terminology (SG: "Input GST Recoverable" instead of generic "Input Tax Recoverable")

This is a classic **open-closed principle** application: the system is open for extension (new countries/industries) but closed for modification (adding a new combo doesn't change existing templates).

### Why Not One Template Per Combo?
5 countries x 2 industries = 10 templates. Each has ~70 accounts = 700 account definitions. With composable layers, the base (70) + a few overlay accounts covers all combos. DRY, less error-prone, easier to maintain.

### Bilingual Accounting Standards
- **GCC (UAE, KSA, Bahrain, Oman, Qatar):** Arabic accounting terms follow SOCPA (Saudi Organization for Chartered and Professional Accountants) and IFRS Arabic translations. Key terms: الأصول (Assets), الالتزامات (Liabilities), حقوق الملكية (Equity).
- **Malaysia:** Malay terms follow MFRS (Malaysian Financial Reporting Standards). Key terms: Aset (Assets), Liabiliti (Liabilities), Ekuiti (Equity).
- **India, Singapore:** English is the business language; no `nameAlt` needed.

### Tax System Variants
| Country | System | Accounts Added |
|---------|--------|----------------|
| GCC | Single-rate VAT (5%) | None extra — base 1162/2131 suffice |
| India | Dual GST (CGST+SGST intra-state, IGST inter-state) | 6 sub-accounts (1162.01-.03, 2131.01-.03) |
| Singapore | Single GST (9%) | None extra — base renamed |
| Malaysia | SST (Sales & Service Tax) | None extra — base renamed |

### Module-Load Safety
The collision detection pattern (asserting at import time that no overlay code duplicates a base code) catches configuration errors before any request is served. This is a compile-time-like check in a runtime language — a defensive pattern for data-driven systems.

### Idempotent Seeding
The seed operation checks existing account codes and skips them. This means:
- Re-running seed is safe (won't duplicate)
- Partial seeds (e.g., base seeded, then country changed) will add missing accounts
- Already-existing accounts keep their user modifications

## Further Reading
- SOCPA Chart of Accounts guidelines (Arabic accounting standards)
- IFRS Foundation Arabic translations
- Malaysian Accounting Standards Board (MASB) MFRS glossary
- India GST structure: CGST Act 2017, IGST Act 2017
