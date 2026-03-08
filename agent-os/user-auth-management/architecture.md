# Architecture

## Target Architecture

- **Identity provider**: Supabase Auth (primary)
- **Frontend**: Next.js manages session-aware UI and Settings/Admin controls
- **Backend**: NestJS enforces permission checks and branch/tenant policies
- **Database**: Dedicated PostgreSQL database per tenant (physical isolation, no RLS needed)

## Trust Boundaries

1. Browser and mobile clients are untrusted
2. API gateway/backend performs authorization decisions
3. Dedicated tenant database is the isolation boundary — each request routes to the tenant's own DB via TenantContextMiddleware
4. Admin-only operations require elevated permission checks and audit logs

## Token and Claims Contract

Required claims for backend authorization:

- `sub`: unique user identity
- `tenant_id`: tenant scope
- `branch_scope`: branch IDs or wildcard
- `roles`: assigned role identifiers
- `session_id`: revocation and traceability key

Contract rules:

- Claims are validated in NestJS middleware/guards
- Missing or invalid tenant claims fail closed
- Short-lived access token + managed refresh flow

## Data Ownership

- Supabase Auth stores identity credentials and session primitives
- ERP database stores user profile, role bindings, branch assignments, invite records, and audit events
- Authorization policies are evaluated in backend and reinforced by dedicated tenant databases (physical isolation)

## Why This Fits the Current Stack

- Works across both Next.js and NestJS without building token bridges
- Matches dedicated-DB-per-tenant isolation architecture
- Reduces integration complexity versus NextAuth-only session models
- Keeps migration options open via a provider abstraction layer

## High-Level Request Path

1. User authenticates through Supabase Auth
2. Access token with validated claims is sent to NestJS
3. NestJS authorizes action against role and policy mappings
4. TenantContextMiddleware routes to the tenant's dedicated database; query executes within isolated DB
5. Sensitive mutations emit immutable audit events
