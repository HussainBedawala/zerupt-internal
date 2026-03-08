# User and Auth Management

Purpose: define how users are created, invited, authenticated, authorized, monitored, and offboarded inside existing Settings/Admin capabilities.

This is not a separate product module. It is a control layer that supports all ERP modules.

## Design Intent

- Global ERP readiness (multi-branch, multi-country, compliance-aware)
- Strong tenant isolation and least-privilege defaults
- Fast day-to-day admin operations with audit-safe controls
- AI-friendly structure: explicit rules, tables, and checklists

## File Index

1. `mission.md` - goals, non-goals, principles, and success metrics
2. `architecture.md` - system architecture and trust boundaries
3. `user-lifecycle.md` - user states and lifecycle transitions
4. `secure-invitations.md` - invitation model and abuse controls
5. `authentication.md` - login methods, sessions, MFA, recovery
6. `authorization-rbac.md` - role/permission model and enforcement
7. `admin-settings-integration.md` - placement in Settings/Admin UX and APIs
8. `security-controls.md` - hard security requirements and monitoring controls
9. `compliance-and-regionalization.md` - global compliance and localization expectations
10. `operations-runbook.md` - operational procedures and incident playbooks
11. `provider-decision.md` - Supabase vs NextAuth vs Clerk decision and migration path
12. `flows-and-control-points.md` - end-to-end flows, events, and failure handling

## Quick Start for Builders

- Start with `mission.md` and `architecture.md`
- Implement lifecycle and invite logic from `user-lifecycle.md` and `secure-invitations.md`
- Apply enforcement from `authorization-rbac.md` and `security-controls.md`
- Validate rollout and support readiness using `operations-runbook.md`
