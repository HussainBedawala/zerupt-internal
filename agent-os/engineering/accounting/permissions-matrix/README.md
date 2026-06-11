# Permissions Matrix — Accounting Modules

Complete RBAC matrix for all accounting operations. Maps every endpoint to its permission key, identifies gaps, and defines role templates.

## Key Decisions

- **`module.entity.action` format** — standardized across all modules
- **Three scope types** — Tenant (full), Branch (filtered), Own (self-created only)
- **Segregation of duties** — maker-checker pairs enforced at role assignment
- **No separate guard classes** — single global PermissionGuard + @RequiresPermission decorator

## Files

- [01-accounting-permissions.md](01-accounting-permissions.md) — Full matrix, SoD rules, role templates, gaps

## Status

**Partially implemented.** Permission keys defined for COA, JE, mappings, fiscal periods, FX revaluation, reconciliation, currency. Missing: tax config, reports, doc numbering, audit trail. Guard annotations need verification on several controllers.
