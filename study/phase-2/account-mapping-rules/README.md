# Account Mapping Rules

## Core Concept

Account mappings decouple business events from hardcoded account codes. Instead of the posting service knowing "sales always go to account 4110", a configuration table maps `(eventType, lineType) → accountId`. This makes the accounting engine configurable per tenant.

## Override Hierarchy

```
Item > Category > Warehouse > Tenant > System
```

When the posting service resolves an account for a line type, it fetches all matching mappings and picks the most specific scope. This allows a retailer to:
- Use system defaults for most events
- Override revenue accounts per warehouse (different tax jurisdictions)
- Override COGS accounts per item category (different cost structures)

## LINE_TYPE → Account Type Rules

Not every account can be mapped to every line type. Accounting rules dictate:
- Revenue lines must map to **income** accounts
- COGS/expense lines must map to **expense** accounts
- Receivable/cash/inventory lines must map to **asset** accounts
- Payable/tax payable lines must map to **liability** accounts

This prevents misconfiguration (e.g., mapping revenue to a liability account), which would produce incorrect financial statements.

## System vs User Scope

System-scope mappings are seeded during tenant provisioning and are **immutable** — users cannot edit or delete them. Users can override them by creating tenant/warehouse/category/item scope mappings that take precedence in the hierarchy.

This protects the accounting engine's baseline correctness while giving tenants flexibility.

## Idempotent Seeding

The seed service resolves account codes to IDs via DB lookup (not hardcoded UUIDs), making it portable across tenants. It uses `onConflictDoNothing()` for true DB-level idempotency, not just application-level checks.

## Key Design Decisions

1. **VARCHAR for event types** (not pgEnum) — new modules add new events without requiring DB migrations
2. **Scope stored as enum column** — the DB enforces scopeId nullability via CHECK constraints
3. **Validation at create/update time** — account type rules are checked when mappings are created, not when they're resolved during posting (fail early)
