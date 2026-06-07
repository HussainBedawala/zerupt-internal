# zerupt-mcp

Read-only product-knowledge MCP server for [Zerupt](https://zerupt.com) — the world's first agentic AI retail ERP. Marketing/sales agents connect to it to learn what the product is, what each module does, what's actually built vs planned, and to search specs/code.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MCP_TRANSPORT` | No | `stdio` | `stdio` or `http` |
| `GITHUB_TOKEN` | If no LOCAL_CONTENT_ROOT | — | Fine-grained PAT with read access to `zerupt-internal` + `zerupt-erp` repos |
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
      "url": "https://zerupt-mcp.up.railway.app/mcp",
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
2. Server URL: `https://zerupt-mcp.up.railway.app/mcp`
3. Add header: `Authorization: Bearer <your-token>`
4. Save and test with the `product_overview` tool.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `product_overview` | Product mission + tech stack digest |
| `list_modules` | All ERP modules with codemap summaries (AS-BUILT) |
| `get_module_spec` | Spec files for a module (design intent) |
| `get_codemap` | AS-BUILT codemap for a module |
| `search` | Scoped search: `specs`, `code`, `docs`, `all` |
| `read_file` | Read any allowlisted virtual path |
| `marketing_context` | Positioning, ICP, GTM context |

### Path model

- `internal/...` → zerupt-internal repo root
- `erp/...` → zerupt-erp repo

**Allowlist:** `internal/agent-os/**`, `internal/study/**`, `erp/docs/**`, `erp/DESIGN.md`, `erp/README.md`, `erp/apps/*/src/**`, `erp/packages/*/src/**`

---

## Railway Deploy

1. In Railway, create a **New Service → GitHub Repo → `HussainBedawala/zerupt-internal`**
2. Set **Root Directory** to `tools/zerupt-mcp`
3. Railway auto-detects the Dockerfile
4. Set these environment variables in Railway:
   - `GITHUB_TOKEN` — fine-grained PAT (read-only, both repos)
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
