<!-- Feature catalog partition | Module: knowledge-graph | Generated: 2026-06-11 | Source: as-built audit -->
# Business Knowledge Graph — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

## Graph Edge Store (graph_edges)
- **Status:** shipped
- **Description:** A tenant-scoped directed-edge table (`graph_edges`) in the Postgres schema that links any two business entities — items, suppliers, customers, accounts, transactions — by typed relationship. Edges carry a type, confidence score, and provenance source so the system can distinguish AI-inferred links from manually created or migration-seeded ones. The 6-tuple (tenantId, fromType, fromId, toType, toId, edgeType) is unique and idempotently upserted. Only three edge kinds are currently materialised: `supplied_by` (item→supplier), `duplicate_of` (party/item deduplication), `resolved_from` (import provenance). FK-derivable relations are computed at query time, not stored.
- **Who it's for:** All tenants — the foundation layer every AI agent (Zee, Mira, Sami) queries to answer cross-entity questions.
- **Constraints / notes:** Tenant-isolated; tenantId enforced on every query (hardened 2026-06-11, commit c7b6bb7). Schema file: `packages/db/src/schema/graph-edges.ts`.

## Born-from-Migration Seeding
- **Status:** shipped
- **Description:** When a new tenant is provisioned or migrated, the graph is automatically seeded from existing business data — items are linked to their suppliers, parties are linked to import fingerprints, and duplicates flagged during import create `duplicate_of` edges. No manual setup required; the graph is populated on day one.
- **Who it's for:** Any business onboarding with existing data (CSV import, opening balances).
- **Constraints / notes:** Seeding is idempotent (upsert). Confidence scores are set to 1.0 for migration-sourced edges (deterministic, not inferred). Source field = `'migration'`. Triggered from `GraphService.addEdges` called by the migration/provisioning pipeline.

## Blast-Radius Analysis
- **Status:** shipped
- **Description:** Before a user deactivates or deletes a customer, supplier, or item, the system traverses the graph to show exactly what else would be affected — hard blocks (open AR/AP invoices with outstanding balances) and soft warnings (e.g., sole-supplier relationships that would orphan items). A clear summary is returned: "Safe to remove" or "Cannot remove: N hard blocks." Surfaces as a pre-action dialog in the frontend.
- **Who it's for:** Multi-branch owners and accountants who manage large product/supplier catalogs and need to avoid accidental data damage.
- **Constraints / notes:** API endpoint `GET /tenant/graph/blast-radius?nodeType=<type>&nodeId=<uuid>`. Frontend dialog at `apps/web/src/features/graph/components/blast-radius-dialog.tsx`. Requires `reports.dashboard.view` permission. Guard also fires on customer/supplier deactivate endpoint.

## Dormant Capital Detection
- **Status:** shipped
- **Description:** Identifies inventory items that carry stock value but have had zero sales movement in the past 90 days, and surfaces the total tied-up capital value. Also counts orphan items (no supplier link) and orphan categories (no items). The result is surfaced on the dashboard insights widget.
- **Who it's for:** Retail owners and buyers who want to free up cash locked in slow-moving stock; multi-branch owners cleaning up their chart of accounts.
- **Constraints / notes:** Default window is 90 days (configurable per call). API: `GET /tenant/graph/insights` (dashboard summary) and `GET /tenant/graph/dormant-capital` (full item list). Frontend: `apps/web/src/features/graph/components/graph-insights-widget.tsx`. Dormant threshold is query-computed (not a stored config field) in the current build.

## Both-Sides Relationship View
- **Status:** shipped
- **Description:** Detects parties that appear in the system as both a customer and a supplier — a common pattern in MENA retail (e.g., a distributor you also sell to). Surfaces these pairs for reconciliation so owners can understand the full two-way relationship and outstanding balances on both sides.
- **Who it's for:** Multi-branch retailers, wholesalers, and trading businesses with contra-party (overlapping supplier/customer) relationships.
- **Constraints / notes:** API: `GET /tenant/graph/both-sides-parties`. Query file at `apps/api/src/graph/queries/both-sides.query.ts`. Requires `reports.dashboard.view` permission.

## AI Agent Graph Access (Zee / Mira / Sami)
- **Status:** shipped
- **Description:** All three AI agents can query the knowledge graph to enrich their answers. Zee (financial assistant) can trace account relationships and explain supplier dependency risks or dormant-capital exposure; Mira (data cleaner) uses graph edges to resolve duplicates; Sami (inventory agent) traverses item-supplier links. The graph turns isolated data points into connected business context.
- **Who it's for:** Any user interacting with AI agents — questions like "who supplies this item?" or "what accounts does this supplier touch?" are answered from the graph.
- **Constraints / notes:** Graph access is read-only from the agent layer; mutations go through domain services. tenantId hardening applied 2026-06-11 (commit c7b6bb7) — earlier builds had a potential cross-tenant edge leak in AI query paths.
