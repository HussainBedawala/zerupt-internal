# Update Codemaps

Regenerate module-based codemaps in `erp/docs/CODEMAPS/` by scanning the actual codebase.

## Step 1: Identify What's Built

Scan `erp/apps/api/src/` for NestJS modules and `erp/apps/web/src/` for features/routes. Only create codemaps for modules that have actual code (not just specs).

## Step 2: Regenerate Codemaps

For each built module, create or update `erp/docs/CODEMAPS/{module}.md` with:

| Section | What to Include |
|---------|----------------|
| **Status** | Phase number, build completeness |
| **API Controllers & Routes** | Route prefix, controller file, key endpoints (CRUD, custom actions) |
| **Services** | Service name, file path, purpose (one line each) |
| **Event Listeners** | Listener file, what events it handles |
| **Frontend Routes** | URL path, component name |
| **Frontend Features** | Feature directory, what it contains |
| **Database Tables** | Table name, schema file, purpose |
| **Specs** | Pointers to `agent-os/product/` and `agent-os/zerupt-specs/` |
| **Cross-Module Dependencies** | What this module depends on, what depends on it |

### Current modules to cover:
- `accounting.md` — Phase 2 (COA, journals, fiscal, reports, exchange rates, mappings, events)
- `settings-admin.md` — Phase 1 (tenant settings, users, roles, legal entities, branches, warehouses, zones, bins, currencies, tax, doc numbering, notifications)
- `shared-infra.md` — Cross-cutting (db, db-admin, tenant-context, shared, ui packages, DI tokens, guard chain)

Add new codemaps when new modules get built (inventory, POS, sales, purchase, etc.).

## Step 3: Diff Detection

1. If previous codemaps exist, compare with current scan
2. If changes > 30%, show diff and ask user before overwriting
3. If changes <= 30%, update in place

## Step 4: Freshness Header

Add to top of each file:
```markdown
<!-- Generated: YYYY-MM-DD | Modules scanned: N -->
```

## Guidelines

- **Module-based files** (one per domain), NOT generic backend/frontend/data splits
- Keep each codemap under **1500 tokens** — enough for routes + tables + file paths
- File paths relative to `erp/` (e.g., `apps/api/src/accounts/accounts.controller.ts`)
- No implementation details — just file paths, route signatures, table names
- Run after major feature additions, new modules, or schema changes
