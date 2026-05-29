# Merpec Agent OS — Product Specifications Index

Single source of truth for the Merpec retail ERP product design, architecture, and implementation specs.

---

## Strategic Documents

| File | Purpose |
|------|---------|
| [product/mission.md](product/mission.md) | Market position, competitive analysis, Year 1 targets |
| [product/roadmap.md](product/roadmap.md) | Phase 1 (MVP), Phase 2 (Growth), Phase 3 (Scale) |
| [product/tech-stack.md](product/tech-stack.md) | Full architecture: frontend, backend, DB, AI, hosting, CI/CD |
| [product/ai-ml-opportunities.md](product/ai-ml-opportunities.md) | 10 AI/ML integration points with methods and guardrails |
| [product/solo-cto-study-guide.md](product/solo-cto-study-guide.md) | Operating model, learning paths, system audit checklist |
| [product/legacy-modules.md](product/legacy-modules.md) | Legacy Merpec module reference |

---

## Module Specifications

Each module has a README + numbered spec files covering architecture, data models, workflows, cross-module contracts, and event mappings.

| Module | Path | Key Specs |
|--------|------|-----------|
| **Accounting** | [product/accounting/](product/accounting/) | Architecture, tax model, multi-currency, COA, COGS, event mappings, period control, year-end, bank recon |
| **Sales** | [product/sales/](product/sales/) | Customer model, quotation/SO/invoice lifecycle, credit notes, payments, cross-module contracts |
| **Purchase** | [product/purchase/](product/purchase/) | Supplier model, PO lifecycle, GRN, landed costs, returns, payments |
| **Inventory** | [product/inventory/](product/inventory/) | Item model, location hierarchy, stock ledger, cost engine, movements, serial/batch, pricing, counting, reorder |
| **POS** | [product/pos/](product/pos/) | Register sessions, transaction lifecycle, payments, discounts, returns, offline mode, receipts, Z-report |
| **Dashboard** | [product/dashboard/](product/dashboard/) | Information architecture, KPI catalog, widgets, actions, filters, alerts, role defaults, performance |
| **Reports** | [product/reports/](product/reports/) | Report definitions, builder, templates, query engine, export/scheduling |
| **Settings & Admin** | [product/settings-admin/](product/settings-admin/) | Organisation, team, roles, branches, currency, tax config, numbering, notifications, audit trail, imports |

---

## User & Auth Management

Cross-cutting control layer (not a separate module). Product rules for users, roles, and
invitations live in **Settings & Admin** (`product/settings-admin/02`, `03`). As-built auth
specs and auth ADRs live in **`zerupt-specs/authentication/`**.

| File | Purpose |
|------|---------|
| [product/settings-admin/02-team-user-lifecycle.md](product/settings-admin/02-team-user-lifecycle.md) | User/invitation entities, state machine, branch & session rules |
| [product/settings-admin/03-roles-permissions-policy.md](product/settings-admin/03-roles-permissions-policy.md) | Role/permission model, evaluation order, approval matrix |
| [zerupt-specs/authentication/architecture.md](zerupt-specs/authentication/architecture.md) | As-built: token storage, security chain, route protection |
| [zerupt-specs/authentication/auth-flows.md](zerupt-specs/authentication/auth-flows.md) | As-built: signup, login, OAuth, refresh, 401 retry, logout |
| [zerupt-specs/authentication/secure-invitations.md](zerupt-specs/authentication/secure-invitations.md) | Invite-token security model, anti-abuse, audit events |
| [zerupt-specs/authentication/security-controls.md](zerupt-specs/authentication/security-controls.md) | Detection rules, security test expectations |
| [zerupt-specs/authentication/compliance-and-regionalization.md](zerupt-specs/authentication/compliance-and-regionalization.md) | GDPR, retention, regional rollout, SCIM path |
| [zerupt-specs/authentication/operations-runbook.md](zerupt-specs/authentication/operations-runbook.md) | Incident playbooks, break-glass, key rotation |
| [zerupt-specs/authentication/provider-decision.md](zerupt-specs/authentication/provider-decision.md) | ADR: Supabase Auth vs NextAuth vs Clerk |

---

## Implementation Specs

| Spec | Path | Status |
|------|------|--------|
| Accounting Engine | [specs/2026-02-27-accounting-engine-spec/](specs/2026-02-27-accounting-engine-spec/) | Completed |
| Settings & Admin | [specs/2026-02-28-0128-settings-admin-specs/](specs/2026-02-28-0128-settings-admin-specs/) | Completed |
| User Auth Management | [specs/2026-02-28-1200-user-auth-management/](specs/2026-02-28-1200-user-auth-management/) | Completed |

---

## Standards

| File | Purpose |
|------|---------|
| [standards/index.yml](standards/index.yml) | System-wide standards index (to be populated) |

---

## Related: merpec-frontend (Design Reference)

The `../merpec-frontend/` directory contains a Design OS app with 151 React preview components and per-section UI specs. It is a **design reference**, not production code. When specs differ, this directory (agent-os) is the canonical source for domain logic and backend. merpec-frontend is authoritative for UI flows and component design.
