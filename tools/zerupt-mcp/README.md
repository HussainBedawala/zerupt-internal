# zerupt-mcp

Read-only marketing and product knowledge MCP server for [Zerupt](https://zerupt.com) — the world's first agentic AI retail ERP.

**Scope:** serves ONLY content from `agent-os/` (brand, marketing, product specs, customer personas). The `erp/` code repository is intentionally NOT served — no codemaps, no source code, no erp docs. This keeps the surface clean and curated for marketing/content agents.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_TRANSPORT` | No | `stdio` | `stdio` or `http` |
| `GITHUB_TOKEN` | If no LOCAL_CONTENT_ROOT | — | Fine-grained PAT with read access to `zerupt-internal` repo |
| `LOCAL_CONTENT_ROOT` | If no GITHUB_TOKEN | — | Absolute path to local zerupt-internal root (e.g. `/Users/hus3ain/Development/Zerupt`) |
| `MCP_TOKENS` | Yes (HTTP mode) | — | Comma-separated `name:token` pairs, e.g. `opencode:tok_abc,claudeai:tok_def` |
| `PORT` | No | `3100` | HTTP server port |

**Backend selection:** `GITHUB_TOKEN` takes priority; if absent, `LOCAL_CONTENT_ROOT` is used; if neither is set the server exits with a clear error.

---

## Running Locally

### stdio mode (for opencode / Claude Code)

```bash
cd tools/zerupt-mcp
npm install
npm run build

# With local files:
LOCAL_CONTENT_ROOT=/Users/hus3ain/Development/Zerupt npm run dev

# With GitHub:
GITHUB_TOKEN=ghp_xxx npm run dev
```

### HTTP mode

```bash
MCP_TRANSPORT=http \
MCP_TOKENS="opencode:$(openssl rand -hex 24)" \
LOCAL_CONTENT_ROOT=/Users/hus3ain/Development/Zerupt \
npm start
```

Then test:
```bash
curl http://localhost:3100/healthz
# → {"ok":true}
```

---

## Token Minting

Generate a secure random token:

```bash
openssl rand -hex 24
# e.g. a3f7c2e1d8b9f0e4c6a2b5d7e9f1c3a4b6d8e0f2
```

Add to `MCP_TOKENS` as `clientname:token`.

---

## opencode.json Snippets

### Local stdio (development)

```json
{
  "mcpServers": {
    "zerupt": {
      "type": "stdio",
      "command": "node",
      "args": ["/Users/hus3ain/Development/Zerupt/tools/zerupt-mcp/dist/index.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "LOCAL_CONTENT_ROOT": "/Users/hus3ain/Development/Zerupt"
      }
    }
  }
}
```

### Remote HTTP (production, e.g. Railway)

```json
{
  "mcpServers": {
    "zerupt": {
      "type": "http",
      "url": "https://mcp.zerupt.com/mcp",
      "headers": {
        "Authorization": "Bearer <your-token>"
      }
    }
  }
}
```

---

## Claude.ai Remote MCP Setup

1. Go to **Claude.ai → Settings → Integrations → Add MCP server**
2. Server URL: `https://mcp.zerupt.com/mcp`
3. Add header: `Authorization: Bearer <your-token>`
4. Save and test with the `product_overview` tool.

---

## Available Tools

| Tool | Args | Source | Description |
|------|------|--------|-------------|
| `product_overview` | — | `agent-os/product/mission.md` + `tech-stack.md` | Product mission + tech stack digest |
| `get_brand` | `section?`: `foundation\|story\|design-system\|voice\|all` | `agent-os/brand/` + `marketing/content-style-guide.md` | Brand essentials — identity, story, design tokens, voice |
| `list_personas` | — | `agent-os/customers/personas/` + `journeys/` | Lists all persona and journey files with headings |
| `get_persona` | `name`: string | `agent-os/customers/` | Returns content of a matching persona or journey file |
| `list_features` | `module?`: string, `status?`: `shipped\|planned\|all` | `agent-os/product/feature-catalog/` | Feature catalog — master index or per-module, filtered by status |
| `get_module_spec` | `module`: string, `file?`: string | `agent-os/product/modules/{module}/` | Spec files for a module — list or read |
| `get_website_info` | `doc?`: `digest\|seo\|experience\|copy\|all` | `agent-os/marketing/website/` | Website docs — digest, SEO, experience, copy |
| `marketing_context` | — | `agent-os/marketing/marketing-context.md` | Positioning, ICP, GTM context |
| `search` | `query`: string, `scope`: `brand\|marketing\|product\|customers\|all` | `agent-os/**` | Scoped full-text search across agent-os knowledge |

**Intentionally NOT served:** `erp/` source code, codemaps, DESIGN.md, study notes. Use the erp repo directly for engineering context.

### Path model (agent-os only)

All virtual paths must be under `internal/agent-os/`. The `internal/` prefix maps to the zerupt-internal repo root:

- `internal/agent-os/brand/` → brand identity, design system, story
- `internal/agent-os/marketing/` → marketing context, style guide, website docs
- `internal/agent-os/product/` → mission, tech stack, feature catalog, module specs
- `internal/agent-os/customers/` → personas, journeys, test data

---

## Railway Deploy

1. In Railway, create a **New Service → GitHub Repo → `HussainBedawala/zerupt-internal`**
2. Set **Root Directory** to `tools/zerupt-mcp`
3. Railway auto-detects the Dockerfile
4. Set these environment variables in Railway:
   - `GITHUB_TOKEN` — fine-grained PAT (read-only, `zerupt-internal` repo only)
   - `MCP_TOKENS` — e.g. `opencode:tok_abc,claudeai:tok_def`
   - `MCP_TRANSPORT` — `http`
   - `PORT` — `3100` (Railway sets this automatically too)
5. Deploy. Health check: `GET /healthz` → `{"ok":true}`
6. Copy the Railway service URL and use it in your opencode/claude.ai config.

---

## Running Tests

```bash
npm test
npm run typecheck
```
