#!/usr/bin/env bash
# Zerupt architecture drift check.
# Refreshes the code graph (free, AST-only, no LLM) then verifies the
# "dependencies point DOWN toward accounting/inventory" invariant.
# Exit 1 on any upward violation (import cycles are advisory, not gating).
set -uo pipefail
ROOT="/Users/hus3ain/Development/Zerupt"
GDIR="$ROOT/study/ops/graphify"

cd "$ROOT/erp"
echo "[drift] refreshing code graph (free, no LLM)…"
GRAPHIFY_OUT="$GDIR" graphify update . --no-cluster >/dev/null 2>&1 \
  || echo "[drift] refresh incomplete — scanning existing graph"

python3 "$GDIR/_arch_check.py" "$GDIR/graph.json"
