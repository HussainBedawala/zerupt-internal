# 09 — How Zerupt Implements Layer 1

> This chapter maps the Layer 1 concepts (Chapters 01–08) onto the actual code, from a
> code audit on 2026-06-21. File references are real. Use this as the bridge from theory
> to what's running in production.

## The tables

The COA lives in two tables in the **tenant DB** (`packages/db/src/schema/`):

### `accounts` — the chart

`packages/db/src/schema/chart-of-accounts.ts`

Every account is one row. Key columns:

| Column | What it does |
|--------|-------------|
| `id` | UUID primary key — the true identity, never the code |
| `tenantId` | Multi-tenant isolation (no FK; enforced by middleware) |
| `legalEntityId` | FK to `legalEntities` — each entity has its own COA |
| `code` | Human-readable code (e.g. `1131`), unique per entity+tenant |
| `name` | English name |
| `nameAlt` | Arabic name (bilingual, first-class) |
| `type` | `account_type` enum: `asset / liability / equity / income / expense` |
| `subType` | `account_sub_type` enum: 15 valid values |
| `normalBalance` | `normal_balance` enum: `debit / credit` |
| `isHeader` | True = summary node, cannot receive postings |
| `isContra` | True = intentionally opposite-normal-balance |
| `isControlAccount` | True = engine-only postings (AR/AP/Inventory control) |
| `isSystemAccount` | True = seeded, locked, undeletable |
| `cashFlowCategory` | `operating / investing / financing / none` |
| `isCashEquivalent` | IAS 7 cash-equivalent flag (opening cash in Cash Flow Statement) |
| `isActive` | Soft-delete flag; inactive accounts hidden from pickers |
| `parentAccountId` | Self-referential FK — the tree structure |
| `depth` | Denormalized depth (0 = root, max 5) |
| `currencyCode` | Null = entity's functional currency; set for FX accounts |
| `deactivatedAt` | Timestamp of deactivation (audit) |
| `createdBy / updatedBy` | Supabase Auth user UUID; system sentinel for seeded rows |

### `account_system_roles` — the role bindings

`packages/db/src/schema/account-system-roles.ts`

Maps each engine role to exactly one account per legal entity:

| Column | What it does |
|--------|-------------|
| `id` | UUID PK |
| `tenantId` + `legalEntityId` | Scoping |
| `roleKey` | `system_role_key` enum (21 roles as of 2026-06-21) |
| `accountId` | FK → `accounts.id` (restrict on delete) |
| `boundAt` / `boundBy` | Audit trail for the binding |

The unique constraint `(tenantId, legalEntityId, roleKey)` enforces the invariant:
exactly one account per role per entity. This is the gate the engine relies on.

## The enums

`packages/db/src/schema/enums.ts`

Relevant enums:

- `accountType`: `['asset', 'liability', 'equity', 'income', 'expense']`
- `accountSubType`: 15 values (see Chapter 03 for the full list)
- `normalBalance`: `['debit', 'credit']`
- `cashFlowCategory`: `['operating', 'investing', 'financing', 'none']`
- `systemRoleKey`: 21 values (see Chapter 06 for the full list)

## The DB constraints (what the database enforces directly)

All of these live as `check()` calls in `chart-of-accounts.ts`:

| Constraint name | What it enforces |
|----------------|-----------------|
| `accounts_header_not_control_check` | `isHeader = true` AND `isControlAccount = true` are mutually exclusive |
| `accounts_code_not_empty_check` | `trim(code)` must be non-empty |
| `accounts_depth_range_check` | `depth >= 0 AND depth <= 5` |
| `accounts_type_sub_type_valid_check` | Only valid (type, sub-type) pairs are accepted |
| `accounts_normal_balance_consistency_check` | Non-contra accounts must have the type-default normal balance |

And from the unique constraint:
- `accounts_tenant_id_legal_entity_id_code_key` — code unique per (tenant, entity)

And from FKs with `onDelete: restrict`:
- `legalEntityId` FK — can't delete an entity that still has accounts
- `parentAccountId` FK (self-referential) — can't delete a parent with children

The `account_system_roles` table adds:
- `account_system_roles_tenant_entity_role_key` unique constraint — one account per role per entity
- `accountId` FK with restrict — can't delete a role-bound account without unbinding first

## The validation constants (service layer)

`packages/db/src/schema/chart-of-accounts.ts` also exports two constants used by the
application layer (not the DB):

```typescript
export const VALID_SUB_TYPES: Record<AccountType, readonly AccountSubType[]>
export const DEFAULT_NORMAL_BALANCE: Record<AccountType, NormalBalance>
```

These are the TypeScript source of truth for the same rules the DB check constraints
enforce. Having both means: the application catches errors early with a friendly message;
the DB catches anything that bypasses the application.

## The seeding pipeline

### Template data

- `apps/api/src/accounts/data/coa-base-template.ts` — ~80 base retail accounts
- `apps/api/src/accounts/data/coa-country-overlays.ts` — GCC VAT, India GST, etc.
- `apps/api/src/accounts/data/coa-industry-overlays.ts` — industry-specific additions
- `apps/api/src/accounts/data/coa-pdc-accounts.ts` — post-dated cheque accounts

### Template builder

`apps/api/src/accounts/coa-template-builder.ts`

Merges base + country + industry overlays given `(countryCode, industryType)`. Returns
the complete, topology-sorted list of `TemplateAccount` objects ready for insertion.

### Template definition

`apps/api/src/accounts/coa-template.ts`

Defines the `TemplateAccount` type, the `SUPPORTED_TEMPLATES` map of valid country/industry
combos, and the `templateKey()` helper. This is the orchestration layer above the data files.

### Seed service

`apps/api/src/accounts/coa-seed.service.ts`

Calls the builder, inserts accounts in topological order, then calls the system role binding
step. Wraps everything in a transaction. Exported as `CoaSeedService`, injectable via NestJS DI.

### System role registry

`apps/api/src/accounts/system-roles/system-role-registry.ts`

The single source of truth for which account code each system role defaults to. It
derives all other shape fields (type, subType, normalBalance, isControl, isContra) from
the base template at module load — nothing is hand-typed. Key exports:

- `SYSTEM_ROLES` — frozen array of all 21 roles with their expected shapes
- `SYSTEM_ROLES_BY_KEY` — lookup map by role key
- `SYSTEM_ROLES_BY_CODE` — lookup map by default code
- `roleForKey(key)` / `roleForCode(code)` — helper resolvers

The engine uses this registry to validate that the bound account has the expected type and
flags. If someone binds the `cogs` role to a liability account, the registry can detect
the mismatch.

## The services

`apps/api/src/accounts/accounts.service.ts` — main CRUD orchestrator for account
create/update/deactivate. Enforces lifecycle rules (can't delete if has JE lines, can't
change system account type, etc.) before touching the DB.

`apps/api/src/accounts/accounts-crud.service.ts` — lower-level DB operations for accounts.

`apps/api/src/accounts/coa-tree.service.ts` — tree traversal (descendants, ancestors,
roll-up balance computation, depth calculation on re-parent).

`apps/api/src/accounts/coa-bilingual.ts` — helpers for bilingual name handling and
case-insensitive matching across `name` and `nameAlt`.

`apps/api/src/accounts/coa-cash-equivalent.ts` — logic for the `isCashEquivalent` flag
and IAS 7 cash-flow-statement classification.

`apps/api/src/accounts/coa-cashflow-category.ts` — logic for `cashFlowCategory` assignment.

## Account mapping (for the posting engine)

The posting engine resolves accounts by looking up the `account_system_roles` table. The
service that handles this is in the `journal-entries` module:

`apps/api/src/journal-entries/account-mapping.service.ts` — resolves system role → account
for a given legal entity at posting time.

`apps/api/src/journal-entries/account-mapping-seed.service.ts` — seeds the default account
mapping configuration (the `accountMappings` table in the DB, which is a higher-level
per-document-type mapping built on top of the system roles).

`apps/api/src/journal-entries/account-mapping-defaults.ts` — the default mapping
configuration for each document type (POS sale → which accounts for which legs).

## What's solid

- **DB constraints are comprehensive.** The (type, sub-type) check, normal-balance check,
  depth check, header-not-control check, unique code constraint, and FK restricts all run
  at the database level — they cannot be bypassed by application code.
- **The system-role registry derives everything from the template.** No drift risk between
  the registry and the actual seeded accounts.
- **Bilingual from day one.** Both `name` and `nameAlt` are indexed for fast import
  resolution.
- **Transactional seeding.** The entire COA seed + role-binding step is in one transaction.

## What to watch (Layer 1 hardening candidates)

These are observations from the code audit — not bugs per se, but areas where tighter
enforcement would add confidence:

1. **`isHeader` not checked in the auto posting path.** The manual journal path
   (`journal-entry-draft.service.ts`) checks `isHeader` and rejects posting to a header.
   The automated posting path (`journal-posting.service.ts`) does not re-check it — it
   trusts that the role binding always resolves to a leaf. This is fine in practice (system
   accounts are leaves), but a defence-in-depth check in the auto path would be safer.

2. **No DB constraint preventing type change on a used account.** The `accounts` table has
   no check that freezes `type` or `subType` after the first journal line is written.
   Protection currently lives in the service layer only. A trigger or application-level
   hard block (query for any JE line referencing this account before allowing type change)
   would add DB-level durability.

3. **`isContra` and `isControlAccount` are not checked in the posting engine.** The engine
   trusts the role registry to bind correct accounts. If someone manually re-bound a role
   to a non-control account, the engine would post to it without the protection. A binding
   validation step at engine startup (comparing `account_system_roles` against the registry
   expectations) would catch this early.

4. **The system-role registry is a code artifact, not a DB table.** The mapping of
   `systemRoleKey → expected type/flags` lives in TypeScript. If a migration adds a new
   role key to the enum but the registry isn't updated, the parity test catches it — but
   only at test time. A DB-side role-shape validation table would make the contract durable
   across language boundaries.

5. **`currencyCode` validity is not DB-enforced.** Foreign-currency accounts have a
   `currencyCode` column, but the comment notes "Service layer MUST validate against
   tenantCurrencies whitelist — no FK possible." If the currency is later removed from the
   tenant's whitelist, the account's currency code becomes stale.

None of these are active correctness failures under normal operations — they are the gaps
that a dedicated Layer 1 hardening pass would close.

## How to read the code, fast

1. Schema: `packages/db/src/schema/chart-of-accounts.ts` — the full shape, all constraints.
2. System roles: `apps/api/src/accounts/system-roles/system-role-registry.ts` — 21 roles,
   the default code bindings, shape derivation.
3. DB role bindings: `packages/db/src/schema/account-system-roles.ts` — the binding table.
4. Seeding: `apps/api/src/accounts/coa-seed.service.ts` — how the COA is written at provision.
5. Template data: `apps/api/src/accounts/data/coa-base-template.ts` and
   `coa-country-overlays.ts` — the actual accounts.
6. Enums: `packages/db/src/schema/enums.ts` — `accountType`, `accountSubType`,
   `normalBalance`, `systemRoleKey` enum definitions.
