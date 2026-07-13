<!-- Zerupt internal knowledge base | Structure map | Updated: 2026-06-11 -->
# Zerupt — Internal Knowledge Base (`agent-os`)

This folder is the **single source of truth** for everything non-code about Zerupt:
brand, marketing, customers, product features, and as-built engineering specs.
The **Zerupt MCP server** (`/tools/zerupt-mcp`) serves this content — and *only* this
content — to AI agents (marketing, product, dev). Nothing here should reach into the
code repo; if an agent needs a fact about the product, it lives here.

> **Connecting an agent to the MCP?** See [`engineering/zerupt-mcp/access-guide.md`](engineering/zerupt-mcp/access-guide.md)
> for the live URL, auth, per-client setup, and the full tool list.

> **Golden rule for marketing:** only claim features marked `shipped` in
> [`product/feature-catalog/`](product/feature-catalog/README.md). `planned` = roadmap, never advertise it as available.

---

## Top-level map

| Folder | What lives here | Primary audience |
|--------|-----------------|------------------|
| **`brand/`** | Identity, positioning, voice, visual system. The 100%-correct source of truth everything else must align to. | Everyone |
| **`marketing/`** | GTM context, offer, content style guide, build-in-public plan, and the `website/` sub-tree (specs + SEO + live digest). | Marketing agents |
| **`customers/`** | Who we sell to: `personas/`, `journeys/`, `testing-checklists/`, and `test-data/` fixtures. | Marketing + Product |
| **`product/`** | What we've built: `mission.md`, `tech-stack.md`, `system-architecture.md`, `feature-catalog/` (canonical feature list), and `modules/` (per-module design specs). | Product + Marketing |
| **`engineering/`** | Deep as-built technical specs (accounting internals, auth, DB architecture, tenant provisioning, knowledge-graph, ZATCA, MCP). | Dev agents |
| **`ops/`** | Runbooks (e.g. provisioning recovery). | Ops |

---

## Where to find specific things

| I need… | Go to |
|---------|-------|
| Brand positioning / the "enemy" / the "Next Move" moment | `brand/brand-foundation.md`, `brand/brand-story.md` |
| Colors, typography, logo usage (marketing-facing) | `brand/design-system.md` |
| Voice, tone, always-say / never-say | `marketing/content-style-guide.md` |
| Positioning, ICP, pricing guardrails | `marketing/marketing-context.md` |
| The Grand Slam Offer | `marketing/offer.md` |
| Every feature, by module, with status + who-it's-for | `product/feature-catalog/` |
| A module's design intent (how it's meant to work) | `product/modules/{module}/` |
| Customer personas / journeys | `customers/personas/`, `customers/journeys/` |
| Current website pages, SEO, structure | `marketing/website/digest.md` (snapshot), `marketing/website/seo.md` (plan) |
| Deep as-built engineering detail | `engineering/{area}/` |
| Merpec Kuwait white-label plan (decisions, costs, risks) | `product/merpec-kuwait/decisions.md` |

---

## Maintenance rules

- **Brand is canonical.** When any doc conflicts with `brand/`, brand wins — fix the other doc.
- **Feature catalog is audited, not aspirational.** Regenerate `product/feature-catalog/` after major feature work; mark new things `shipped` only when they're in production code.
- **Website digest is a snapshot.** Regenerate `marketing/website/digest.md` when the live site changes.
- **Codemaps stay in the code repo** (`erp/docs/CODEMAPS/`) — a dev-efficiency tool for coding agents, not marketing content, intentionally not duplicated here.
- **Keep it clean.** Dated audit/working notes don't belong here — delete them (git history retains) once their fixes land.
