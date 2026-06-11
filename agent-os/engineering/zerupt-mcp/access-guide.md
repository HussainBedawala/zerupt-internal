<!-- Zerupt MCP — access & connection guide | Updated: 2026-06-11 -->
# Zerupt MCP — How to Connect (Always-Reference Guide)

The **Zerupt MCP** is the single read-only gateway to everything non-code about Zerupt:
brand, marketing, customers, the full feature catalog, and the website. Any AI agent
(your marketing workspace, Claude.ai, Claude Code, opencode, Cursor) connects to it to get
**live, accurate product truth** without touching the codebase.

It serves the `agent-os` folder of the `zerupt-internal` repo and nothing else. Content is
read live from GitHub `main`, so the server reflects whatever has been pushed (≤5-min cache).

---

## The essentials

| Thing | Value |
|-------|-------|
| **Live URL** | `https://mcp.zerupt.com/mcp` |
| **Transport** | Streamable HTTP |
| **Auth** | `Authorization: Bearer <token>` (required) |
| **Health check** | `https://mcp.zerupt.com/healthz` → `{"ok":true}` (no auth) |
| **Where the token lives** | Railway → `zerupt-internal` service → Variables → `MCP_TOKENS` (format `name:token`). Never commit the token. |
| **Server code** | `tools/zerupt-mcp/` (root repo) · spec: `agent-os/engineering/zerupt-mcp/README.md` |

> **Quick check it's alive:** `curl https://mcp.zerupt.com/healthz` should return `{"ok":true}`.

---

## Connect from each client

### Claude Code (CLI) — recommended for the marketing workspace
```bash
claude mcp add --scope user --transport http zerupt \
  https://mcp.zerupt.com/mcp \
  --header "Authorization: Bearer <your-token>"
```
Then in any session: "ask the zerupt MCP for the feature catalog" / use the tools below.

### Claude.ai (web) — remote connector
1. Settings → Connectors / Integrations → Add MCP server
2. URL: `https://mcp.zerupt.com/mcp`
3. Header: `Authorization: Bearer <your-token>`
4. Save, then test with the `product_overview` tool.

### opencode / Cursor / generic MCP client (JSON config)
```json
{
  "mcpServers": {
    "zerupt": {
      "type": "http",
      "url": "https://mcp.zerupt.com/mcp",
      "headers": { "Authorization": "Bearer <your-token>" }
    }
  }
}
```

### Local development (stdio, no token, reads your disk)
```bash
cd tools/zerupt-mcp
MCP_TRANSPORT=stdio LOCAL_CONTENT_ROOT=/Users/hus3ain/Development/Zerupt node dist/index.js
```
Use this to test changes before pushing — it reads the local `agent-os/` instead of GitHub.

---

## What you can ask it (the 9 tools)

| Tool | Args | Returns |
|------|------|---------|
| `product_overview` | — | Mission + tech-stack digest |
| `get_brand` | `section?` (`foundation`/`story`/`design-system`/`voice`/`all`) | Brand identity, positioning, visual system, voice |
| `list_personas` | — | All customer personas + journeys |
| `get_persona` | `name` | A specific persona / country journey |
| `list_features` | `module?`, `status?` (`shipped`/`planned`/`all`) | The audited feature catalog — master index, or one module filtered by status |
| `get_module_spec` | `module`, `file?` | A module's design-intent spec |
| `get_website_info` | `doc?` (`digest`/`seo`/`experience`/`copy`/`all`) | Current site structure, SEO, copy |
| `marketing_context` | — | Positioning, ICP, pricing guardrails |
| `search` | `query`, `scope` (`brand`/`marketing`/`product`/`customers`/`all`) | Full-text search across agent-os |

**Pinnable resources:** `mission`, `design`, `content-style-guide`, `marketing-context`, `brand-foundation`, `feature-catalog`, `website-digest`.

### Example asks for a marketing agent
- "Use `list_features` with status `shipped` — what can we truthfully advertise?"
- "`get_brand` voice — write 3 ad headlines in our tone."
- "`get_persona` for the KSA shop owner, then draft a WhatsApp message for her."
- "`get_website_info` digest — what pages exist and what's the current hero copy?"

---

## Golden rules for agents using this MCP
- **Only claim `shipped` features.** `planned` = roadmap, never advertise as available. The
  `list_features` catalog is the source of truth (e.g. ZATCA e-invoicing is shipped; PCSID
  renewal is still planned).
- **Brand is canonical.** `get_brand` wins over anything else. Say "up and running," never
  "live"; no em dashes; sentence case; launch is June 15, 2026.
- **It's read-only.** The MCP never writes. To change what agents see, edit `agent-os/` and
  push to `main` (the server picks it up within ~5 minutes).

---

## Keeping it fresh (for the founder)
The live server reads GitHub `main`. After editing anything in `agent-os/`:
1. Commit + push the root `zerupt-internal` repo to `main`.
2. Content changes appear automatically (≤5 min cache). **No redeploy needed for content.**
3. **Redeploy the Railway service only when the MCP *code* (`tools/zerupt-mcp/`) changes** —
   new tools, allowlist, etc. (content-only edits don't need it).

Regenerate the snapshots periodically: the **feature catalog** (after feature work) and the
**website digest** (after site changes) — both live in `agent-os/` and are served as-is.
