# Settings & Admin Specification — Plan

## Context

Merpec already has detailed specs for accounting, inventory, POS, purchase, and reports. Settings & Admin is now required as the configuration and control plane for all modules.

Deliverable:
- full spec set under `agent-os/product/settings-admin/`
- style parity with sibling modules (README + numbered self-contained files)

## Scope

- Organization and governance settings
- Team/user lifecycle and access control
- Roles/permissions and field visibility
- Branch/location/warehouse configuration boundaries
- Currency, fiscal period, tax, and numbering controls
- Notifications, integrations, audit, and migration controls
- Cross-module contracts

## Constraints

- Rules/tables/state-machine style only
- No duplicated accounting journal logic or inventory movement logic
- Immutable policy for security and compliance records
- Explicit ownership boundaries between Settings/Admin and domain modules

## Tasks

1. Create `README.md` and module blueprint
2. Author governance specs (`01`-`03`)
3. Author operational settings specs (`04`-`08`)
4. Author platform controls specs (`09`-`11`)
5. Author cross-module contracts (`12`)
6. Run consistency pass against existing module conventions
