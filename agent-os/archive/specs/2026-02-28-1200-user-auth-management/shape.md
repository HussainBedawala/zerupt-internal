# User and Auth Management Specification - Shaping Notes

## Scope

Define a production-grade user and auth operating model for a global ERP, implemented inside existing Settings/Admin capabilities. Cover user creation, secure invites, login/session security, RBAC, audit controls, compliance, and support operations.

## Decisions

- Supabase Auth is default identity provider for this architecture
- Settings/Admin owns policy and lifecycle controls; domain modules consume permissions
- Tenant isolation is enforced at database and token-claim level, not just UI checks
- Invite-first onboarding is the default for employee users
- Role and branch assignments must be explicit and auditable

## Context

- Visuals: none
- References: `agent-os/product/mission.md`, `agent-os/product/roadmap.md`, `agent-os/product/tech-stack.md`
- Product alignment: RBAC, audit trail, multi-branch control, i18n readiness, and compliance-first operations

## Standards Applied

- `agent-os/standards/index.yml` is currently empty
- Working standards are inherited from existing `agent-os/product` conventions:
  - clear file-level ownership and purpose
  - rule/table/checklist driven writing
  - explicit boundaries and failure modes
  - cross-linking for AI and human retrieval
