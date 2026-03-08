# Standards for User and Auth Management Specification

No formal standards from `agent-os/standards/` were applied because `index.yml` is present but empty.

Interim standards used for this work:

- Keep docs AI-friendly: explicit headings, stable terms, checklists, and decision records
- Keep controls auditable: every privileged change has actor, timestamp, old/new values, and source
- Keep auth architecture cohesive across frontend and backend: shared claims contract and token semantics
- Keep tenant security non-optional: tenant and branch boundaries must be enforced server-side
- Keep product fit explicit: all user/auth operations are designed for Settings/Admin, not a separate module

Interim principles borrowed from `agent-os/product/tech-stack.md` auth/security direction:

- Supabase Auth JWT model is the default token strategy across frontend and backend
- Dedicated-database-per-tenant isolation is treated as a non-negotiable security boundary
- RBAC is enforced at API and database levels, not just in UI controls
- Audit trail completeness is required for all create/update/delete and privileged actions
