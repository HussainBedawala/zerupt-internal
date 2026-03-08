# References for User and Auth Management Specification

## Product Context

- `agent-os/product/mission.md`
- `agent-os/product/roadmap.md`
- `agent-os/product/tech-stack.md`

## Relevant Existing Specs

- `agent-os/specs/2026-02-28-0128-settings-admin-specs/plan.md`
- `agent-os/specs/2026-02-28-0128-settings-admin-specs/shape.md`
- `agent-os/specs/2026-02-28-0128-settings-admin-specs/standards.md`
- `agent-os/specs/2026-02-28-0128-settings-admin-specs/references.md`

## Key Architecture Inputs Used

- Supabase JWT + per-tenant database isolation model
- NestJS modular backend with API-level authorization checks
- Next.js frontend with Settings/Admin control surfaces
- Cross-cutting requirements from roadmap: RBAC, audit trail, multi-branch, i18n
