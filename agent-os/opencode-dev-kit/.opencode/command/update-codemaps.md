---
description: Regenerate module-based codemaps in docs/CODEMAPS/ by scanning the actual codebase
agent: build
---
Regenerate module-based codemaps in `docs/CODEMAPS/` by scanning the actual codebase.

$ARGUMENTS

## Step 1: Identify What's Built

Scan the API source tree (e.g. `apps/api/src/`) for backend modules and the web source tree (e.g. `apps/web/src/`) for features/routes. Only create codemaps for modules that have actual code, not just specs or plans.

## Step 2: Regenerate Codemaps

For each built module, create or update `docs/CODEMAPS/{module}.md` with:

| Section | What to Include |
|---------|----------------|
| **Status** | Build completeness |
| **API Controllers & Routes** | Route prefix, controller file, key endpoints (CRUD, custom actions) |
| **Services** | Service name, file path, purpose (one line each) |
| **Event Listeners** | Listener file, what events it handles |
| **Frontend Routes** | URL path, component name |
| **Frontend Features** | Feature directory, what it contains |
| **Database Tables** | Table name, schema file, purpose |
| **Specs** | Pointers to wherever module/product specs live in this repo |
| **Cross-Module Dependencies** | What this module depends on, what depends on it |

Cover every module that has real, built code. Add a new codemap whenever a new module gets built.

## Step 3: Diff Detection

1. If previous codemaps exist, compare with the current scan
2. If changes exceed 30%, show the diff and ask the user before overwriting
3. If changes are 30% or less, update in place

## Step 4: Freshness Header

Add to the top of each file:
```markdown
<!-- Generated: YYYY-MM-DD | Modules scanned: N -->
```

## Guidelines

- **Module-based files** (one per domain), NOT generic backend/frontend/data splits
- Keep each codemap under **1500 tokens** - enough for routes + tables + file paths
- File paths relative to the repo root that contains the code
- No implementation details - just file paths, route signatures, table names
- Run after major feature additions, new modules, or schema changes
