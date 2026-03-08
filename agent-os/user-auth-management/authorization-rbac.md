# Authorization and RBAC

## Authorization Model

Authorization is evaluated on five dimensions:

1. tenant
2. branch
3. module
4. action
5. optional field-level restrictions

Default mode is deny-unless-granted.

## Role Layers

- **System-level roles**: internal platform operators (strictly separated)
- **Tenant-level roles**: owner, admin, finance-admin, operations-admin
- **Branch-level roles**: branch-manager, cashier, inventory-clerk
- **Custom roles**: tenant-defined bundles constrained by policy guardrails

## Permission Contract

Permission identifiers follow stable naming:

- `users.create`
- `users.invite`
- `users.suspend`
- `roles.assign`
- `settings.security.update`
- `reports.export`

## Segregation of Duties

Mandatory controls:

- no single role can both create and approve high-risk financial actions without explicit exception
- role grants to privileged roles require step-up auth + dual audit entries
- owner-level actions require stronger confirmation flows

## Enforcement Layers

1. UI visibility (convenience only)
2. API authorization guards (primary policy engine)
3. Dedicated tenant database (final data isolation boundary — each tenant's data lives in its own DB)

## Change Governance

- role templates versioned
- permission changes logged with before/after diffs
- bulk changes support preview and rollback where safe
- breaking permission changes require release note and migration notes

## Review Cadence

- monthly privileged-access review
- quarterly full role recertification
- immediate review after any incident involving access misuse
