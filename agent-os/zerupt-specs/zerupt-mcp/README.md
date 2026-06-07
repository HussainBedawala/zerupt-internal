---
title: zerupt-mcp — Zerupt Product-Knowledge MCP Server
status: as-built
version: 0.1.0
updated: 2026-06-07
code: tools/zerupt-mcp/ (repo zerupt-internal)
production_url: https://mcp.zerupt.com/mcp (Railway; pending first deploy)
audience: developers + anyone connecting an AI agent (Claude Code, claude.ai, opencode, n8n, custom)
---

# zerupt-mcp — The Zerupt Product-Knowledge MCP Server

## TL;DR (for agents and humans in a hurry)

- **What:** read-only MCP server exposing Zerupt product knowledge (specs, as-built
  codemaps, code search, marketing/GTM brief) to any MCP-capable AI agent.
- **Connect:** `https://mcp.zerupt.com/mcp` + header `Authorization: Bearer <token>`
  (remote, any client) — or stdio locally: `node tools/zerupt-mcp/dist/index.js` with
  `LOCAL_CONTENT_ROOT=/Users/hus3ain/Development/Zerupt`. Setup recipes: §8.
- **Tools (7):** `marketing_context` (call FIRST for marketing/sales/support work) ·
  `product_overview` · `list_modules` · `get_codemap` (as-built truth) ·
  `get_module_spec` (design intent) · `search` (specs|docs|code|all) · `read_file`.
- **Resources (4):** mission, design system, content style guide, marketing context.
- **Golden rule:** codemaps = what EXISTS; specs = what is PLANNED. Never publish a
  capability claim not backed by a codemap.
- **Safety:** cannot write anything; allowlisted paths only; secrets scrubbed from
  every response; 50KB cap; per-agent revocable tokens; 60 req/min.
- **Content freshness:** reads live from GitHub with a 5-min cache — push to main and
  every connected agent sees it, no redeploy.

---

## 1. What it is, in one paragraph

zerupt-mcp is a **read-only** [Model Context Protocol](https://modelcontextprotocol.io)
server that gives any MCP-capable AI agent structured access to Zerupt's product
knowledge: what the product is, what each module does, what is *actually built* vs
*planned*, the brand/pricing/GTM context, and full-text search over specs, docs, and
source code. It exists so that marketing, sales, content, and customer-support work can
happen in **separate workspaces and tools** (a marketing folder, claude.ai, opencode)
without cloning or cluttering the codebase — the agent just connects to the server with
a token and asks questions.

**It can never write anything.** There are no write tools. Worst case from a leaked
token is read access to allowlisted docs/specs/code, with secrets scrubbed.

## 2. The problem it solves

| Without zerupt-mcp | With zerupt-mcp |
| -- | -- |
| Marketing/sales agents work blind, or you paste product info by hand | Agent calls `marketing_context` / `product_overview` and has the canonical brief |
| Agents claim features that don't exist (spec ≠ built) | `list_modules`/`get_codemap` = as-built truth; `get_module_spec` is labelled "design intent" |
| Doing marketing inside the ERP repo = clutter + risk | Marketing lives anywhere; only this server bridges back, read-only |
| Each new tool (claude.ai, opencode, n8n) needs its own setup | One URL + one bearer token works for all of them |

## 3. Architecture

```
                         ┌──────────────────────────────────────────────┐
  Claude Code ──┐        │  zerupt-mcp (Railway, mcp.zerupt.com)        │
  claude.ai ────┤ HTTPS  │  ┌────────┐  ┌──────────┐  ┌─────────────┐  │   GitHub REST API
  opencode ─────┼──────▶ │  │ bearer │─▶│ rate     │─▶│ MCP server  │──┼──▶ (fine-grained
  n8n/custom ───┘ +token │  │ auth   │  │ limiter  │  │ 7 tools     │  │    read-only PAT)
                         │  └────────┘  └──────────┘  │ 4 resources │  │    ├ zerupt-internal
  local agent ──────────▶│  stdio mode (no auth,      └─────────────┘  │    └ zerupt-erp
  (same machine)  stdio  │  reads local disk)               │          │
                         │                          security layer:    │
                         │                          allowlist · scrub  │
                         │                          · 50KB cap         │
                         └──────────────────────────────────────────────┘
```

### 3.1 Two transports, one core

| Mode | When | How it runs |
| -- | -- | -- |
| **stdio** (default) | Agent on the same machine (Claude Code local, opencode local) | Client launches `node dist/index.js` as a child process; JSON-RPC over stdin/stdout; one long-lived server instance; **no auth needed** (only your own processes can use it) |
| **http** (`MCP_TRANSPORT=http`) | Any agent anywhere (claude.ai, remote Claude Code, cloud agents) | Express server, MCP **Streamable HTTP** at `POST/GET/DELETE /mcp`; **stateless** — a fresh `McpServer` instance is built per request and the transport is closed when the response finishes (no session state, horizontally scalable) |

Both modes register the identical tool/resource set from `src/server.ts:buildServer()`.

### 3.2 Two content backends, auto-selected

| Backend | Selected when | Behaviour |
| -- | -- | -- |
| **GitHub** (`src/content/github-backend.ts`) | `GITHUB_TOKEN` is set | Reads files live via the GitHub Contents API and searches via the Code Search API across `HussainBedawala/zerupt-internal` + `HussainBedawala/zerupt-erp`. 5-minute TTL in-memory cache, capped at 500 entries (oldest-insertion eviction). 10s `AbortController` timeout on every fetch. **This means content is always fresh: push a spec to GitHub and every connected agent sees it within 5 minutes, no redeploy.** |
| **Local FS** (`src/content/local-backend.ts`) | `LOCAL_CONTENT_ROOT` is set (and no `GITHUB_TOKEN`) | Reads straight from disk (dev mode: `LOCAL_CONTENT_ROOT=/Users/hus3ain/Development/Zerupt`). Search = recursive scan of allowlisted roots. `realpath` checks block symlink escapes. |

If neither env var is set the server **fails fast at startup** with a clear error.

### 3.3 Virtual path model

Tools never see real filesystem paths. Everything is addressed by **virtual paths**
with two roots, mapped per backend:

| Virtual prefix | GitHub backend | Local backend |
| -- | -- | -- |
| `internal/...` | repo `zerupt-internal` | `$LOCAL_CONTENT_ROOT/...` |
| `erp/...` | repo `zerupt-erp` | `$LOCAL_CONTENT_ROOT/erp/...` |

Example: `internal/agent-os/product/mission.md`, `erp/docs/CODEMAPS/pos.md`.

## 4. The security model (read this before adding anything)

Defence in depth, applied in this order on every request:

1. **Bearer auth** (HTTP mode only, `src/auth.ts`) — `Authorization: Bearer <token>`.
   Tokens come from env `MCP_TOKENS` as comma-separated `name:token` pairs (e.g.
   `opencode:tok_oc_...,claude:tok_cl_...`). Per-agent names let you revoke one client
   without rotating the rest. Comparison is timing-safe (sha256 both sides +
   `crypto.timingSafeEqual`, full-map iteration — no early exit). Tokens must be
   ≥ 24 chars (enforced at startup). Token **values** are never logged, only names.
2. **Rate limit** (`src/rate-limit.ts`) — 60 requests/min sliding window per token
   name. In-process only (fine for a single Railway instance; documented Redis path if
   we ever scale out).
3. **Path allowlist** (`src/security.ts`) — only these virtual paths are readable,
   listable, or searchable:
   - `internal/agent-os/**` (specs, brand, offer, marketing context)
   - `internal/study/**` (study notes)
   - `erp/docs/**` (codemaps + dev docs)
   - `erp/DESIGN.md`, `erp/README.md`
   - `erp/apps/*/src/**`, `erp/packages/*/src/**` (source code, read + search)
4. **Path denylist** (always wins, even inside the allowlist) — any path segment
   matching `.env*`, `*.pem`, `*.key`, `node_modules`, `.git`, `dist`, `coverage`,
   `secrets`, `credentials`, `drizzle/meta`.
5. **Traversal hardening** — paths are URL-decoded then normalised before checks
   (catches `%2e%2e%2f`); absolute paths and `..` rejected; local backend additionally
   `realpath`s every resolved path and verifies it stays under the root (symlink
   escape protection).
6. **Secret scrub on every response** — output is regex-scrubbed (bounded,
   ReDoS-safe patterns) for OpenAI/Anthropic-style keys, GitHub PATs, AWS keys, JWTs,
   and credentialed connection strings → replaced with `[REDACTED]`.
7. **Response cap** — every tool response is truncated at 50,000 characters with an
   explicit "truncated, narrow your query" suffix.
8. **Error hygiene** — clients never see stack traces, absolute filesystem paths, or
   raw GitHub API error bodies (those are logged server-side only).
9. **Container** — Docker runs as non-root `node` user, pinned `node:20.19-slim`.

`/healthz` is intentionally unauthenticated (Railway health checks) and returns only
`{"ok":true}`.

## 5. What an agent gets: the 7 tools

Every tool returns markdown/plain text (MCP `content: [{type:"text"}]`), scrubbed and
capped per §4.

### 5.1 `product_overview` — "what is Zerupt?"
- **Args:** none
- **Returns:** `internal/agent-os/product/mission.md` + `internal/agent-os/product/tech-stack.md` concatenated with headers.
- **Use when:** agent needs the elevator-to-deep pitch and the stack.

### 5.2 `list_modules` — "what exists, really?"
- **Args:** none
- **Returns:** every codemap in `erp/docs/CODEMAPS/` with its ~10-line summary header,
  plus the banner: *codemaps = AS-BUILT truth; specs = design intent, may not be built.*
- **Use when:** first call in any "can Zerupt do X?" investigation.

### 5.3 `get_module_spec` — design intent, full detail
- **Args:** `module` (e.g. `"pos"`, `"accounting"`, `"ai-engine"`), optional `file`
- **Returns:** without `file` → lists the files in `internal/agent-os/product/{module}/`;
  with `file` → that file's content, prefixed with the "SPEC = design intent,
  cross-check get_codemap" banner.
- **Use when:** deep feature understanding, roadmap/vision content, AI-team story
  (`ai-engine` module holds Zee/Sami/Mira specs).

### 5.4 `get_codemap` — as-built ground truth
- **Args:** `module`
- **Returns:** `erp/docs/CODEMAPS/{module}.md` — pre-computed index of real routes,
  screens, services, and DB tables.
- **Use when:** verifying any capability claim before publishing it. **Marketing rule:
  never promise a feature that isn't in a codemap.**

### 5.5 `search` — full-text across everything
- **Args:** `query`, `scope` ∈ `specs` | `docs` | `code` | `all`
  - `specs` → `internal/agent-os/**` · `docs` → `erp/docs/**` + `internal/study/**` ·
    `code` → erp `apps/*/src` + `packages/*/src`
- **Returns:** up to 30 hits as path + line + snippet. (GitHub backend = GitHub code
  search; query qualifiers like `repo:` are stripped — injection-safe.)
- **Use when:** "does anything mention ZATCA QR codes?", "where is store credit handled?"

### 5.6 `read_file` — direct read of any allowlisted path
- **Args:** `path` (virtual path, e.g. `erp/DESIGN.md`,
  `internal/agent-os/offer.md`, `erp/apps/api/src/pos/pos.service.ts`)
- **Use when:** following up a search hit or a codemap reference.

### 5.7 `marketing_context` — the curated GTM brief
- **Args:** none
- **Returns:** `internal/agent-os/marketing-context.md` — the hand-curated digest:
  positioning rules, the migration wedge copy, pricing tiers + guarantee, ICP,
  channel stack, brand voice, built-vs-planned guardrails, and the never-say list.
- **Use when:** ANY marketing/sales/support content task. **This should be the first
  call of every marketing session.** Updating it = edit the file + git push (live for
  all agents within the 5-min cache TTL). On pricing/offer conflict, the Linear
  "Offer" doc wins.

## 6. The 4 resources

Resources are pinnable context (clients can attach them without a tool round-trip):

| Name | URI | Content |
| -- | -- | -- |
| `mission` | `zerupt://internal/agent-os/product/mission.md` | Product mission |
| `design` | `zerupt://erp/DESIGN.md` | Brand design system + tokens |
| `content-style-guide` | `zerupt://internal/agent-os/content-style-guide.md` | Content/messaging style guide |
| `marketing-context` | `zerupt://internal/agent-os/marketing-context.md` | The GTM digest (same as the tool) |

All served as `text/markdown`, scrubbed.

## 7. What a request actually looks like (HTTP mode)

MCP Streamable HTTP is plain JSON-RPC 2.0 over HTTPS. A client does:

```
1. POST /mcp   {"jsonrpc":"2.0","id":1,"method":"initialize", ...}
       headers: Authorization: Bearer <token>
                Accept: application/json, text/event-stream
2. POST /mcp   {"jsonrpc":"2.0","id":2,"method":"tools/list"}
3. POST /mcp   {"jsonrpc":"2.0","id":3,"method":"tools/call",
                "params":{"name":"marketing_context","arguments":{}}}
```

Server-side per request: auth → rate limit → fresh `McpServer` built → transport
handles the JSON-RPC → tool runs (backend read → allowlist check → scrub → cap) →
response → transport closed → one structured JSON log line
(`{"svc":"zerupt-mcp","token":"opencode","method":"POST","ms":412}`).

You never hand-write these calls — every MCP client does it for you. The only thing a
human configures is **URL + token**.

## 8. Connecting clients (the part everyone actually needs)

The remote server is ONE url + ONE header for every client:

- URL: `https://mcp.zerupt.com/mcp`
- Header: `Authorization: Bearer <that client's token>`

### 8.1 Claude Code (any folder, any machine)

```bash
# remote (recommended once Railway is live) — per project:
claude mcp add --transport http zerupt https://mcp.zerupt.com/mcp \
  --header "Authorization: Bearer <token>"

# or available in ALL your projects:
claude mcp add --scope user --transport http zerupt https://mcp.zerupt.com/mcp \
  --header "Authorization: Bearer <token>"

# local stdio (no Railway needed, same machine only):
claude mcp add zerupt-local \
  --env LOCAL_CONTENT_ROOT=/Users/hus3ain/Development/Zerupt \
  -- node /Users/hus3ain/Development/Zerupt/tools/zerupt-mcp/dist/index.js
```

Verify inside a session with `/mcp` — you should see zerupt with 7 tools + 4 resources.

### 8.2 claude.ai (web/desktop)

Settings → Connectors → Add custom connector → URL
`https://mcp.zerupt.com/mcp`. When asked for authentication, supply the bearer token
(claude.ai supports custom headers for custom connectors; use the `claude` token).

### 8.3 opencode

`opencode.json` in the workspace:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "zerupt": {
      "type": "remote",
      "url": "https://mcp.zerupt.com/mcp",
      "headers": { "Authorization": "Bearer <opencode token>" }
    }
  }
}
```

### 8.4 Anything else (n8n, custom scripts, ChatGPT connectors)

Any MCP-capable client: give it the URL + bearer header. For raw scripts, use the MCP
TypeScript/Python SDK client with `StreamableHTTPClientTransport`.

### 8.5 Smoke test from a terminal

```bash
curl -s https://mcp.zerupt.com/healthz                  # → {"ok":true}
curl -s -X POST https://mcp.zerupt.com/mcp \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

## 9. Operations

### 9.1 Environment variables

| Var | Required | Meaning |
| -- | -- | -- |
| `MCP_TRANSPORT` | no (default `stdio`) | `stdio` or `http` |
| `GITHUB_TOKEN` | one of these two | Fine-grained PAT, **Contents: Read-only**, repos `zerupt-internal` + `zerupt-erp` only → selects GitHub backend |
| `LOCAL_CONTENT_ROOT` | one of these two | Absolute path to the Zerupt root → selects local backend (dev) |
| `MCP_TOKENS` | http mode only | `name:token,name:token` — server refuses to start without it in http mode. Mint: `openssl rand -hex 24` |
| `PORT` | no (default `3100`) | HTTP port (Railway injects its own) |

### 9.2 Railway deployment (production)

- Service: new service in the existing Railway project, source = GitHub repo
  `zerupt-internal`, **Root Directory = `tools/zerupt-mcp`** (Dockerfile auto-detected;
  healthcheck `/healthz` configured in `railway.json`).
- Env vars: `GITHUB_TOKEN`, `MCP_TRANSPORT=http`, `MCP_TOKENS`.
- Domain: `mcp.zerupt.com` (Railway custom domain → CNAME in DNS).
- Deploys automatically on push to `zerupt-internal` main.
- Logs: one JSON line per request with token *name*, method, latency.

### 9.3 Token lifecycle

- Mint: `openssl rand -hex 24`, prefix by client (`tok_oc_`, `tok_cl_`...) for
  readability.
- Grant: append `name:token` to `MCP_TOKENS` on Railway → redeploys → live.
- Revoke ONE client: remove its pair from `MCP_TOKENS`. Others unaffected.
- The GitHub PAT expires (set 90 days) — calendar a rotation; the server starts failing
  reads with `GitHub API error 401` when it lapses.

### 9.4 Local development

```bash
cd tools/zerupt-mcp
npm install
npm run typecheck && npm test          # 66 tests
npm run dev                            # stdio mode via tsx
node smoke-test.mjs                    # end-to-end stdio smoke test
# http mode locally:
MCP_TRANSPORT=http MCP_TOKENS=dev:tok_dev_$(openssl rand -hex 24) \
  LOCAL_CONTENT_ROOT=/Users/hus3ain/Development/Zerupt npm start
```

## 10. Extending it (developer guide)

- **Add a tool:** create `src/tools/<name>.ts` (pure function: backend in, string out;
  route ALL output through `sanitiseResponse`), register in `src/server.ts` with a zod
  schema, add a test. Keep tools read-only — write tools are out of scope by design.
- **Widen the allowlist:** edit `src/security.ts` — think hard; everything allowlisted
  is exposed to every token holder. Never allowlist env files, migrations meta, or
  anything credential-adjacent.
- **Add curated content:** prefer writing markdown into `agent-os/` (e.g. a
  `sales-playbook.md`, `support-faq.md`) and exposing it as a tool/resource — that's
  cheaper and safer than new code paths. The marketing-context tool is the template.
- **Future candidates (not built):** Linear-backed pricing tool, a `support_context`
  digest, per-token tool scoping (e.g. support tokens can't search code), OAuth if a
  third party ever gets access.

## 11. File map

```
tools/zerupt-mcp/
  src/index.ts              entry: transport selection, http server, fail-fast checks
  src/server.ts             buildServer(): registers 7 tools + 4 resources
  src/auth.ts               MCP_TOKENS parsing, timing-safe bearer middleware
  src/rate-limit.ts         60 req/min sliding window per token
  src/security.ts           allowlist/denylist, path normalisation, scrub, 50KB cap
  src/content/backend.ts    ContentBackend interface (getFile/listDir/search)
  src/content/github-backend.ts   GitHub API + cache + timeouts
  src/content/local-backend.ts    local FS + realpath/symlink guards
  src/tools/*.ts            one pure function per tool
  src/__tests__/*           66 tests: security, auth, rate-limit, backends, sanitisation
  Dockerfile                multi-stage, node:20.19-slim, non-root
  railway.json              healthcheck /healthz
  README.md                 quick-start (this doc is the deep reference)
```

## 12. Review & quality record

Built 2026-06-07. Reviewed by security-reviewer + code-reviewer subagents: 29 findings
(3 CRITICAL, 9 HIGH, 9 MEDIUM, 8 LOW) — all fixed same-session (timing-safe auth,
symlink escape, listDir allowlist bypass, per-request server lifecycle, LRU cache cap,
fetch timeouts, non-root container, ReDoS-safe scrub patterns, fail-fast config).
66/66 vitest tests green; stdio + HTTP smoke tests passed (initialize, tools/list = 7
tools, valid read, 401 on bad token).
