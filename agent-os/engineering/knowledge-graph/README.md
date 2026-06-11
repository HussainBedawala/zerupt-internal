# Business Knowledge Graph (DEV-417)

> **Status:** v1 built + shipped to `main` (commit `c7b6bb7`, 2026-06-11). As-built spec.
> The connected brain that every agent (Zee, Mira, Sami) and module reads from.

## Why

Before this, Zerupt had three disconnected graphs, each scoped to one moment: the import
**consolidation graph** (died with the migration session), the **ontology** (curated but
narrow), and the **learning flywheel** (a key-value cache). This fuses them into ONE
persistent, tenant-scoped graph that outlives the import — and that the user can *feel*.

Affordable for a solo founder and safe next to the money: a graph **view over the relational
tables we already have** + one thin edge table. **No graph DB** (no Neo4j; Postgres traversals
cover SMB scale). **No pgvector** in v1 — semantic matching is a later layer.

## Node / edge model

**Nodes** = existing rows given a stable `(type, id)` handle: `party`, `item`, `category`,
`warehouse`, `account`, `document`, `tax_code`, `legal_entity`, `import_fingerprint`.

**Edges** — most are already FKs, traversed on demand. Only three are *materialized* in the
tenant-scoped `graph_edges` table (everything else is computed):

| Edge | Source | Meaning |
|------|--------|---------|
| `supplied_by` | inferred from purchase history | item → supplier (confidence ∝ line frequency) |
| `duplicate_of` | migration consolidation | merged/canonicalized party → canonical |
| `resolved_from` | migration consolidation | node → the import fingerprint it came from |

`graph_edges` columns: `tenant_id, from_type, from_id, to_type, to_id, edge_type,
confidence(numeric 4,3), source, metadata(jsonb), created_at, updated_at`.
Idempotent: `UNIQUE(tenant_id, from_type, from_id, to_type, to_id, edge_type)`; indexed
outbound, inbound, and by edge_type. CHECK on edge_type ∈ the three kinds + confidence 0–1.
Migration: `packages/db/drizzle/0075_majestic_kinsey_walden.sql`.

## Service & API

`apps/api/src/graph/` — `GraphModule` exports `GraphService` (tenant-scoped via `TENANT_DB`,
immutable, ≤50-line methods, SQL builders in `graph/queries/*`):

- `addEdges(tenantId, edges[])` — idempotent upsert
- `inbound/outbound(tenantId, type, id, edgeType?)`
- `blastRadius(tenantId, nodeType, nodeId)` → `{ hardBlocks[], warnings[], summary }`
- `bothSidesParties(tenantId)` → customer-AND-supplier pairs with open AR/AP
- `dormantCapital(tenantId, sinceDays=90)` → tied-up items + orphans
- `insights(tenantId)` → dashboard summary

Endpoints (read-only, `@RequiresPermission`): `GET /tenant/graph/{blast-radius, both-sides-parties, insights}`.

## Born from the migration — Mira builds the graph

`migration-session.service.consolidate()` seeds `duplicate_of` + `resolved_from` edges
**best-effort** at go-live (`migration/graph-edge-derivation.ts` — pure, unit-tested), then
`inventory/supplied-by-inference.ts` infers `item → supplier` from purchase history. Both are
wrapped so a failure **never** breaks consolidation / go-live. Fresh tenant with no purchase
history → zero edges, which is fine.

## Agent access

- **Mira** — edge seeding at migration (above).
- **Sami** — `scanner.service` enriches a matched invoice with `graphContext`: supplier open
  exposure (blast-radius) + both-sides flag. Best-effort, omitted on failure.
- **Zee** — the dashboard insights endpoint backs her surfaces.

## The user feels it (3 features, AR + EN, defensive states)

1. **Pre-delete blast-radius guard.** `DELETE`/deactivate on item / customer / supplier calls
   `blastRadius`; hard blocks → HTTP 409 with the structured payload unless `?force=true`.
   Web: `BlastRadiusDialog` lists dependencies; hard blocks disable confirm, warnings allow
   "Delete anyway" (force). Helper: `inventory/items/blast-radius.guard-helper.ts`.
2. **Dormant-capital + orphan insight** — dashboard `graphInsights` widget:
   "N items haven't sold in 90 days — KWD X tied up" + orphan items/categories.
3. **Both-sides-party reconciliation** — contacts who are both customer and supplier with net
   AR/AP, surfaced for netting (informational in v1).

## Not done (handoff)

- Customer/supplier **frontend** deactivate dialogs still use plain confirms — backend guard +
  reusable `BlastRadiusDialog` are ready; one-line swap each.
- Netting mutation for both-sides parties (v1 is informational).
- Cross-tenant learning, a trained classifier, and pgvector remain future rungs
  (see `project_mira_ingestion_brain`).
