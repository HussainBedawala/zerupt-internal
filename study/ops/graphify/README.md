# Codebase graph (graphify)

A derived knowledge graph of the whole `erp/` monorepo — every file, symbol,
`import`/`call`/`inherit` edge, clustered into ~700 labeled modules. Built with
the `graphify` CLI (isolated `uv` tool, not a repo dependency). Use it as a
**lens** you pick up at decision points, never as a runtime dependency.

Three graphs, three lanes — do not conflate: **this** = code structure (dev
only) · `zerupt-mcp` = agent-os intent · `GraphModule`/`graph_edges` = tenant
business data.

## Query it (agents: shell out, do not read graph.json — it is 40MB+)
```bash
G=study/ops/graphify/graph.json
graphify explain "TenantDbFactory"        --graph $G   # what it is + neighbors
graphify affected "formatMoneyAmount"     --graph $G   # blast radius before you touch it
graphify path "PosController" "JournalPostingService" --graph $G
graphify query  "existing money formatter" --graph $G  # reuse check (lazy-first rung 2)
```

## Architecture drift check
```bash
study/ops/graphify/check-drift.sh
```
Refreshes the graph (free, AST-only, no LLM) then verifies the **"dependencies
point DOWN toward accounting/inventory"** invariant. Exit 1 on any upward
violation (a foundational module importing up into pos/sales/purchase). Import
cycles are printed as advisory. Baseline at build time: **0 violations**, 4
cycles. `/harden` runs this each layer; run it before any go-live claim.

## Freshness (make-or-break)
A stale graph lies. `check-drift.sh` refreshes automatically. To refresh the
queryable graph manually after code changes:
`cd erp && GRAPHIFY_OUT=$PWD/../study/ops/graphify graphify update . --no-cluster` (free).
A full labeled rebuild (communities + HTML + Obsidian, costs Claude-plan tokens):
`graphify erp --backend claude-cli --out <tmp>` then `graphify cluster-only <tmp> --backend claude-cli`.

## View it
- `graph.html` — legible 700-module architecture view (open in browser).
- `obsidian/` — full vault; open as an Obsidian vault, see `_START_HERE.md` for
  the color legend + filter presets.
- `GRAPH_REPORT.md` — god nodes, surprising connections, cycles (tracked in git).
