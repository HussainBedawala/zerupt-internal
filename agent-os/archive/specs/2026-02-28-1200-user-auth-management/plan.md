# User and Auth Management Specification - Plan

## Context

The ERP roadmap already depends on strong RBAC, auditability, tenant isolation, and multilingual operations. User and auth management must be defined as an operating layer inside Settings/Admin rather than a standalone product module.

Deliverable:
- full doc set under `agent-os/user-auth-management/`
- style parity with `agent-os/product/*` docs
- explicit global ERP controls for identity, invites, sessions, permissions, and compliance

## Scope

- User lifecycle from invite to offboarding
- Secure invitation and activation flows
- Authentication methods and session/token behavior
- Authorization model (tenant, branch, module, action)
- Admin placement in existing Settings/Admin UX and APIs
- Security controls, auditability, and incident operations
- Global readiness: regional compliance, localization, enterprise SSO path

## Constraints

- Keep architecture aligned with current stack (`Next.js` + `NestJS` + `Supabase Auth` + per-tenant PostgreSQL databases)
- Do not introduce a separate module in product navigation
- No custom auth subsystem unless a documented gap requires it
- Every privileged action must produce immutable audit evidence

## Tasks

1. Save spec documentation scaffold and shaping context
2. Create `agent-os/user-auth-management/` foundational docs
3. Document provider decision and migration strategy (Supabase vs NextAuth vs Clerk)
4. Define end-to-end operational flows and failure handling
5. Run consistency pass for AI-friendly structure, terminology, and cross-links
