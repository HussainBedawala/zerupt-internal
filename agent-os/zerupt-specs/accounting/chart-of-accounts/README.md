# Chart of Accounts (COA)

The accounting backbone — a hierarchical, bilingual, multi-entity chart of accounts with country-aware templates, system/control account semantics, and tree operations.

## Files

1. `01-schema-design.md` — Table structure, enums, constraints, indexes, hierarchy model
2. `02-api-and-validation.md` — CRUD endpoints, validation rules, tree operations, template seeding
3. `03-templates-and-localization.md` — Base template (100+ accounts), country overlays (GCC, India, SEA), bilingual support

## Linear Issues (Chart of Accounts Milestone)

| Issue | Title | Status |
|-------|-------|--------|
| DEV-50 | Design COA schema | Done |
| DEV-51 | Implement COA CRUD API | Done |
| DEV-52 | Create COA templates per country + industry | Done |
| DEV-53 | Build COA Management UI | Done |

## Key Decisions

- **Self-referential hierarchy** — parent FK with denormalized `depth` (max 5 levels), O(1) depth checks, O(n) tree builds in memory
- **System + control account distinction** — system accounts are immutable seed data; control accounts are engine-only (no manual postings)
- **Soft-delete via deactivatedAt** — accounts with transaction history are deactivated, never hard-deleted
- **Type → subType mapping enforced** — 5 account types map to 15 sub-types, validated at create + update
- **Country overlays on base template** — single base template with additive/override layers per tax regime (GCC VAT, India GST, SG GST, MY SST)
- **Bilingual from day one** — `name` (primary) + `nameAlt` (alternate language) on every account
- **Idempotent seeding** — template insert skips existing codes, safe to re-run
