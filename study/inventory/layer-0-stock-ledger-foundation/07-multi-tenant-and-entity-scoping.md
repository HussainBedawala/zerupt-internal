# 07 — Multi-Tenant and Branch / Legal-Entity Scoping on the Ledger

## Multi-tenancy: one database per tenant

Zerupt's architecture uses per-tenant Postgres databases (Neon projects / branches). Every
tenant's `stock_ledger_entries` table contains ONLY that tenant's data. There is no shared
`inventory` database with a `tenant_id` partition.

This means:

- **Row-level security is not needed** — the DB boundary IS the tenant boundary
- **`tenant_id` column exists for defense-in-depth**, not as a query filter
- **`tenant_id` index is intentionally absent** — per the schema comment:
  "per-tenant DB makes it redundant" (no cross-tenant data to filter)

The `TenantContextMiddleware` (NestJS) resolves the correct Neon database connection for
each request using the JWT's `tenant_id` claim and the admin DB's tenant registry. Every
query issued by the service layer automatically targets the correct tenant DB.

## The `tenant_id` column: defense-in-depth

Despite the DB isolation, every table in the tenant DB carries `tenant_id`:

```typescript
tenantId: uuid("tenant_id").notNull(),
// tenantId: Defense-in-depth for multi-tenant isolation. No FK because the
// tenants table lives in the admin DB (separate Neon project). Enforcement
// is via TenantContextMiddleware which injects tenantId into every query.
```

Purpose:
1. **Emergency forensics**: if a future architecture change pools tenant data (e.g., a
   shared analytics replica), `tenant_id` is already present and can be used as a filter
2. **Application-level assertions**: services can assert that the tenant_id on a fetched
   row matches the authenticated tenant (belt-and-suspenders)
3. **Audit context**: every ledger row permanently records which tenant it belongs to,
   even if a row is exported or migrated

## Legal entity scoping (`legal_entity_id`)

A single tenant may operate multiple legal entities (e.g., a holding company with
subsidiaries in UAE and KSA). Each legal entity:
- Has its own currency (functional currency)
- Has its own fiscal periods and COA structure
- Has its own GL accounts (DR COGS / CR Inventory are legal-entity-specific)

`stock_ledger_entries.legal_entity_id` ensures that inventory movements are attributed to
the correct legal entity for:
- GL journal entry generation (the outbox payload carries `branchId`, which the accounting
  listener uses to resolve `legalEntityId` → correct GL accounts)
- Currency: `currency` on the ledger row is the functional currency of the legal entity at
  posting time
- Regulatory reporting: each entity's inventory must be reportable independently

The `onDelete: 'restrict'` FK means a legal entity cannot be deleted if it has any ledger
history — protecting the audit trail from a naive admin delete.

## Branch scoping (`branch_id`)

A legal entity may have multiple branches (stores, outlets). `branch_id` on the ledger:
- Enables branch-level stock-movement reports (the `sle_branch_id_created_at_idx` index)
- Travels in the outbox payload so the accounting journal entry is posted to the correct
  branch GL sub-ledger
- Does NOT determine which warehouse the movement is in — that is `warehouse_id`

Relationship: `branch_id` → `branches` (which belongs to a `legal_entity_id`). A
warehouse belongs to a branch. The ledger carries both IDs directly (denormalized) to
avoid a join on every stock query.

## Warehouse scoping (`warehouse_id`)

The warehouse is the finest-grained location dimension on the ledger. One warehouse = one
physical location where stock is tracked. Examples: "Main Store", "Back Warehouse",
"Transit Hub".

The `(item_id, warehouse_id)` pair uniquely identifies a position in
`materialized_stock_levels`. This is the smallest unit of on-hand that can be queried
without joining to the ledger.

Warehouses belong to branches; branches belong to legal entities. The hierarchy:

```
legal_entity
  └── branch (store / outlet)
        └── warehouse (physical storeroom / shelf area)
              └── zone (optional spatial subdivision)
                    └── bin (optional specific slot)
```

Currently the ledger tracks to the warehouse level. Zones and bins exist in the schema
(`zones`, `bins` tables, controllers at `tenant/zones` and `tenant/bins`) but are NOT
dimensions on the ledger (see Chapter 02 discussion of `bin_id`).

## Multi-currency notes

`currency` on the ledger row is the functional currency of the legal entity at the time
of posting. This is denormalized from `legal_entities.currency` at write time for:
- Immutability: even if the entity later changes its functional currency (a rare event
  requiring a closing procedure), the historical cost data remains denominated correctly
- Query performance: no join needed to read cost values

Transaction-currency amounts (e.g., a purchase in USD when the entity's functional
currency is AED) are NOT stored on the ledger. The conversion to functional currency
happens before the ledger entry is written. The source document (purchase invoice,
GRN) holds the original transaction-currency amounts if needed for FX gain/loss tracking.

## How tenant provisioning interacts with the ledger

When a new tenant is provisioned (`apps/api/src/provisioning/steps/run-migrations.step.ts`),
the tenant DB is created from scratch with all migrations applied. The `stock_ledger_entries`
table starts empty. Opening balances are seeded via the `opening_balance` movement type
during the onboarding wizard flow.

When tenants are migrated (Railway pre-deploy command `migrate-tenants.cli --apply`), all
EXISTING tenant DBs receive any new ledger schema migrations before traffic switches.
This is the safe deployment pattern: schema changes precede code that depends on them.

## Summary

| Scope | Column | Purpose |
|---|---|---|
| Tenant | `tenant_id` | Defense-in-depth; no FK; no index needed (per-tenant DB) |
| Legal entity | `legal_entity_id` | Currency, GL, fiscal period attribution |
| Branch | `branch_id` | Branch-level reports, GL journal routing |
| Warehouse | `warehouse_id` | Physical location (finest ledger dimension currently) |
| Zone / Bin | not present | Future dimension (bins table exists but not linked) |
