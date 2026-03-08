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

Cross-cutting control layer (not a separate module).

| File | Purpose |
|------|---------|
| [user-auth-management/README.md](user-auth-management/README.md) | Overview |
| [user-auth-management/architecture.md](user-auth-management/architecture.md) | Trust boundaries, JWT claims, Supabase Auth |
| [user-auth-management/user-lifecycle.md](user-auth-management/user-lifecycle.md) | Invited → Active → Suspended → Offboarded |
| [user-auth-management/authentication.md](user-auth-management/authentication.md) | Login methods, sessions, MFA, recovery |
| [user-auth-management/authorization-rbac.md](user-auth-management/authorization-rbac.md) | Role/permission model, enforcement points |
| [user-auth-management/secure-invitations.md](user-auth-management/secure-invitations.md) | Invitation model, abuse controls |
| [user-auth-management/security-controls.md](user-auth-management/security-controls.md) | Encryption, rate limiting, IP restrictions |
| [user-auth-management/compliance-and-regionalization.md](user-auth-management/compliance-and-regionalization.md) | GDPR, data residency |
| [user-auth-management/operations-runbook.md](user-auth-management/operations-runbook.md) | Incident procedures, support playbooks |
| [user-auth-management/provider-decision.md](user-auth-management/provider-decision.md) | Supabase Auth vs NextAuth vs Clerk |

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
