# Currency Master & Precision

Spec for the currency configuration system: currency policies, tenant currency whitelist, decimal precision rules, and seed data.

## Key Decisions

- **Three-table design:** `currency_policies` (singleton) + `tenant_currencies` (whitelist) + `exchange_rates` (see separate spec)
- **Immutable codes:** Currency codes cannot change after creation
- **Soft-disable:** Currencies deactivated via `is_active`, not deleted
- **Decimal.js everywhere:** All financial math uses Decimal.js, never floating-point
- **Precision hierarchy:** Display (per-currency decimal_places) < Internal (28-digit Decimal.js) < Storage (numeric 18,6 or 18,10)

## Files

- [01-schema-and-precision.md](01-schema-and-precision.md) — Full schema, API, precision rules, gaps

## Status

**Code: Fully implemented.** Spec documents what was built + identifies hardening gaps (downstream reference checks, auto-fetch, currency lock enforcement).
