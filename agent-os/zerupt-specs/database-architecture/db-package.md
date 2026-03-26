# db Package — Tenant Database

**Path:** `erp/packages/db/`
**Neon DB:** `zerupt_tenant_dev` (local), dynamically provisioned per customer in prod
**Purpose:** All tenant business data — accounts, journals, inventory, settings, RBAC, etc.
**Driver:** `neon-serverless` (WebSocket pooling, per-request connection)
**NestJS token:** `TENANT_DB`

## Directory Structure

```
db/
├── drizzle.config.ts              # Drizzle CLI config (reads DATABASE_TENANT_URL from .env)
├── package.json                   # Scripts: db:generate, db:migrate, db:push, db:studio
├── tsconfig.json                  # Extends root
├── vitest.config.ts               # Test config for schema validation tests
├── drizzle/                       # Generated migration SQL (DO NOT EDIT)
│   ├── meta/_journal.json         # Migration journal
│   ├── 0000_chunky_the_fury.sql   # Initial schema — all base tables
│   └── 0001_majestic_omega_red.sql # Inventory costing tables
├── src/
│   ├── drizzle.ts                 # TenantDatabase type export (typed Drizzle instance)
│   ├── index.ts                   # Barrel export — all schemas + inferred TS types
│   └── schema/
│       ├── index.ts               # Schema barrel export
│       ├── enums.ts               # 27 pgEnum definitions (account types, statuses, etc.)
│       ├── tenant-identity.ts     # Tenant routing record (name, country, timezone, RTL flag)
│       ├── audit.ts               # Immutable audit log (7 composite indexes, append-only)
│       ├── rbac.ts                # roles, rolePermissions, rolePermissionBranches, userRoles
│       ├── org-structure.ts       # legalEntities → branches → warehouses → zones → bins
│       ├── currency.ts            # currencyPolicies, tenantCurrencies, exchangeRates
│       ├── fiscal.ts              # fiscalSettings, fiscalYears, fiscalPeriods
│       ├── tax.ts                 # taxCodes, taxRates, taxGroups, taxGroupComponents
│       ├── document-sequence.ts   # documentSequences, sequenceReservations
│       ├── chart-of-accounts.ts   # accounts (GL tree with parent/child hierarchy)
│       ├── journal-entry.ts       # journalEntries + journalEntryLines (double-entry)
│       ├── account-mapping.ts     # accountMappings (event → GL account links)
│       ├── notifications.ts       # eventPolicies, recipientRules, preferences (5 tables)
│       ├── inventory-costing.ts   # stockLedger, costLayers, materializedLevels, itemConfig
│       ├── relations.ts           # All Drizzle relations (319 lines)
│       ├── chart-of-accounts.test.ts  # Schema validation tests (23 tests)
│       └── journal-entry.test.ts      # Schema validation tests (31 tests)
```

## Tables by Domain

### Settings & Identity
| Table | Purpose |
|-------|---------|
| `tenant_identity` | Tenant name, country, timezone, language, RTL flag |
| `audit_log` | Immutable action log — every mutation tracked |

### RBAC
| Table | Purpose |
|-------|---------|
| `roles` | System + custom roles (Owner, Manager, Cashier, Accountant) |
| `role_permissions` | Permission keys per role (e.g., `accounting.account.create`) |
| `role_permission_branches` | Branch-scoped permission overrides |
| `user_roles` | User-to-role assignments |

### Organizational Structure
| Table | Purpose |
|-------|---------|
| `legal_entities` | Legal companies (UAE LLC, Saudi LLC) with tax registration |
| `branches` | Physical locations (stores, warehouses) under legal entities |
| `user_branches` | User-to-branch assignments |
| `warehouses` | Storage locations under branches (store, warehouse, transit) |
| `zones` | Warehouse zones (Electronics, Apparel, F&B) |
| `bins` | Individual storage slots within zones |

### Accounting
| Table | Purpose |
|-------|---------|
| `accounts` | Chart of accounts — GL tree with parent/child, normal balance |
| `journal_entries` | Posted journal entries (event-driven, reversible) |
| `journal_entry_lines` | Debit/credit lines (double-entry enforced via constraints) |
| `account_mappings` | Maps transaction events to GL accounts |

### Currency & Tax
| Table | Purpose |
|-------|---------|
| `currency_policies` | Multi-currency enabled? Rounding mode, rate source |
| `tenant_currencies` | Enabled currencies (AED, USD, EUR, etc.) |
| `exchange_rates` | Historical rates with date + currency pair |
| `tax_codes` | Tax definitions (VAT 5%, Zero-rated, Exempt) |
| `tax_rates` | Rate history with effective dates |
| `tax_groups` | Grouped tax codes for transactions |
| `tax_group_components` | Individual codes within a group |

### Fiscal
| Table | Purpose |
|-------|---------|
| `fiscal_settings` | Year-end month, period close policy per legal entity |
| `fiscal_years` | FY 2026, FY 2027, etc. — open/closed status |
| `fiscal_periods` | Monthly periods within a year — open/locked status |

### Document Numbering
| Table | Purpose |
|-------|---------|
| `document_sequences` | Auto-numbering rules (INV-00001, POS-000001, etc.) |
| `sequence_reservations` | Reserved-but-not-committed numbers (prevents gaps) |

### Notifications
| Table | Purpose |
|-------|---------|
| `notification_event_policies` | Which events trigger notifications |
| `recipient_rules` | Who receives them (by role, by owner, etc.) |
| `recipient_rule_branches` | Branch-scoped recipient overrides |
| `notification_preferences` | User opt-in/out per category |
| `notification_preference_defaults` | Role-level defaults |

### Inventory Costing
| Table | Purpose |
|-------|---------|
| `stock_ledger_entries` | Every stock movement (in/out/adjust) |
| `inventory_cost_layers` | FIFO cost layers for batch tracking |
| `materialized_stock_levels` | Pre-computed stock counts per warehouse/item |
| `item_costing_config` | Per-item costing method (WAC or FIFO) |

## Key Design Decisions

- **tenantId on every table** — defense-in-depth for multi-tenant isolation (no FK to admin DB).
- **Immutable audit log** — append-only, no update/delete. Tracks before/after snapshots.
- **Double-entry enforcement** — journal entry lines must balance (CHECK constraints).
- **Bilingual fields** — `nameAlt`, `descriptionAlt` throughout for Arabic support.
- **CSS logical properties only** — RTL/LTR handled at DB level via `isRtlDefault`.
- **Tech debt markers** — `itemId` FKs in inventory tables deferred until items table is built (Phase 3).
