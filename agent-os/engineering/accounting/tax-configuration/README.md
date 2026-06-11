# Tax Configuration

CRUD for tax codes, tax groups (with compound components), and versioned tax rates. Required before POS/Sales/Purchase modules can calculate tax.

## Files

1. `01-design.md` — Backend endpoints, validation rules, frontend tabs, country quick setup
2. `02-exemption-resolution.md` — Tax group resolution chain (item > customer > category > default), India jurisdiction
3. `03-withholding-tax.md` — TDS schema, calculation, threshold logic, JE mapping, India sections

## Key Decisions

- **Schema already exists** — 4 tables in `tax.ts`, this spec adds services + UI
- **Versioned rates** — rates change over time, lookup always by transaction date
- **Compound tax** — component calculated on base + prior non-compound taxes (India GST pattern)
- **One default group per entity** — enforced by partial unique index
- **Country quick setup** — idempotent seeding for common tax regimes (UAE, Saudi, India, etc.)
- **Account linking** — output (liability) and input (asset) accounts linked at tax code level
