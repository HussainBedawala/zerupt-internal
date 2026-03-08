# Provider Decision: Supabase vs NextAuth vs Clerk

## Decision

Use **Supabase Auth** as the primary provider for the current architecture.

## Why Supabase Is Better for This Stack Right Now

1. **Backend fit**: it issues JWTs that NestJS can validate directly, without a custom bridge layer.
2. **Tenant isolation fit**: claim-based context works naturally with per-tenant database routing (JWT `tenant_id` claim → TenantContextMiddleware → dedicated DB).
3. **Operational simplicity**: centralized auth platform for all tenants, with storage already in the stack.
4. **Global ERP controls**: supports email/password, OTP/magic links, social login, and enterprise SSO expansion path.
5. **Lower implementation risk**: less custom glue code means fewer auth edge-case failures.

## Where NextAuth/Auth.js Is Strong

- excellent Next.js-native session patterns
- rich provider ecosystem and ecosystem familiarity
- good choice when backend is mostly Next.js APIs

Why not default here: this ERP architecture uses NestJS APIs with per-tenant database routing, so NextAuth would require additional session/token translation logic and policy duplication risk.

## Where Clerk Is Strong

- polished admin/user management UX out of the box
- strong developer experience for auth UI and organization features
- useful for teams that optimize heavily for speed of auth UX rollout

Why not default here: adds another external authority layer and integration complexity with existing per-tenant DB data model and backend policy stack.

## Global ERP Capability Coverage with Supabase

| Capability | Required for Global ERP | Supabase Coverage | Notes |
|---|---|---|---|
| Email/password auth | Yes | Yes | baseline production support |
| Magic link / OTP | Yes | Yes | useful for low-friction recovery/onboarding |
| Social login | Yes | Yes | provider-by-provider rollout |
| MFA | Yes | Partial-now / Full-with-policy rollout | enforce admin-first, then broader |
| Enterprise SSO/SAML | Yes (enterprise tenants) | Roadmap-supported | phase rollout by market segment |
| Session revoke | Yes | Yes | needed for suspend/incident response |
| JWT claims for backend | Yes | Yes | required for NestJS + per-tenant DB routing |
| Admin user lifecycle ops | Yes | Yes via app-level admin APIs | document clear ownership in Settings/Admin |

## Known Gaps and Mitigations

- **Gap**: deep out-of-box admin UX is less turnkey than Clerk
  **Mitigation**: build explicit Settings/Admin control surfaces and runbooks (already scoped).

- **Gap**: enterprise directory sync (SCIM) may require extra implementation work
  **Mitigation**: define identity adapter boundary and phased enterprise integration plan.

- **Gap**: provider-specific constraints may appear in certain regions
  **Mitigation**: keep provider abstraction contract and claims schema stable.

## Migration and Abstraction Strategy

Keep an internal `IdentityProviderAdapter` contract with:

- token verification interface
- session revoke interface
- user lifecycle primitives (invite, activate, suspend, deactivate)
- claims normalization interface

If migration is needed later:

1. keep role/branch/authz logic in ERP domain tables (provider-agnostic)
2. map new provider identities to existing internal user IDs
3. run dual-read validation during migration window
4. cut over by tenant segment, not all tenants at once

## Final Recommendation

For this ERP architecture and timeline, Supabase is the pragmatic default because it meets core global requirements while minimizing integration risk in a NestJS + per-tenant DB system. NextAuth and Clerk remain valid future alternatives through a controlled adapter and migration path.
