#!/usr/bin/env python3
"""Architecture-invariant + import-cycle checker over a graphify graph.json.

Zerupt doctrine: dependencies point DOWN toward accounting/inventory, never up.
accounting and inventory are FOUNDATIONAL PEERS (tier 0) — they may import each
other freely. pos/sales/purchase are UPPER transactional modules (tier 1). The
illegal case (a real drift alarm) is a foundational module importing UP into an
upper module. Those must be inverted to an event. We also report import cycles.

Scope: apps/api/src only (that is where the modular-monolith ledger boundary
lives; frontend feature cross-imports are intentionally out of scope).

Usage: python3 _arch_check.py <graph.json>
Exit 1 if any invariant violation is found (so /harden gates on it).
"""
import json
import sys
import re
from collections import defaultdict

# feature-folder -> tier. First matching pattern wins.
# tier 0 = foundational (accounting + inventory, peers); tier 1 = upper modules.
# Violation = a tier-0 file importing a tier-1 file (dependency pointing UP).
LAYERS = [
    (0, "accounting", re.compile(r"apps/api/src/(journal-entries|fiscal-period|accounts|accounting|general-ledger|trial-balance|chart-of-accounts|close-management|journal[-/]|ledger)")),
    (0, "inventory",  re.compile(r"apps/api/src/(inventory|stock[-/]|batch)")),
    (1, "upper",      re.compile(r"apps/api/src/(pos|sales|purchase|grn|credit-note)")),
]
DEP_RELATIONS = {"imports", "imports_from", "calls"}


def layer_of(path):
    if not path:
        return None
    for lvl, name, rx in LAYERS:
        if rx.search(path):
            return (lvl, name)
    return None


def main(graph_path):
    d = json.load(open(graph_path))
    id2file = {n["id"]: (n.get("source_file") or "") for n in d["nodes"]}

    # ---- 1. upward-dependency violations ----
    violations = []
    file_imports = defaultdict(set)  # file -> set(files it imports), backend only
    for e in d["links"]:
        rel = e.get("relation")
        if rel not in DEP_RELATIONS:
            continue
        sf = e.get("source_file") or id2file.get(e.get("source"), "")
        tf = id2file.get(e.get("target"), "")
        if "apps/api/src" in sf and "apps/api/src" in tf and sf != tf:
            if rel in ("imports", "imports_from"):
                file_imports[sf].add(tf)
        ls, lt = layer_of(sf), layer_of(tf)
        if ls and lt and ls[0] < lt[0]:
            violations.append((ls[1], sf, lt[1], tf, rel))

    # ---- 2. file-level import cycles (Tarjan SCC) ----
    index = {}
    low = {}
    onstack = {}
    stack = []
    counter = [0]
    sccs = []

    def strongconnect(v):
        # iterative Tarjan to avoid recursion limits on 3900 files
        work = [(v, iter(file_imports.get(v, ())))]
        index[v] = low[v] = counter[0]; counter[0] += 1
        stack.append(v); onstack[v] = True
        while work:
            node, it = work[-1]
            advanced = False
            for w in it:
                if w not in index:
                    index[w] = low[w] = counter[0]; counter[0] += 1
                    stack.append(w); onstack[w] = True
                    work.append((w, iter(file_imports.get(w, ()))))
                    advanced = True
                    break
                elif onstack.get(w):
                    low[node] = min(low[node], index[w])
            if advanced:
                continue
            work.pop()
            if low[node] == index[node]:
                comp = []
                while True:
                    w = stack.pop(); onstack[w] = False
                    comp.append(w)
                    if w == node:
                        break
                if len(comp) > 1:
                    sccs.append(comp)
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])

    for v in list(file_imports):
        if v not in index:
            strongconnect(v)

    # ---- report ----
    short = lambda p: p.split("apps/api/src/")[-1] if "apps/api/src/" in p else p
    print(f"graph: {graph_path}")
    print(f"built_at_commit: {d.get('built_at_commit', 'unknown')}")
    print("=" * 60)

    print(f"\n## Upward-dependency violations (deps must point DOWN): {len(violations)}")
    if violations:
        for src_layer, sf, tgt_layer, tf, rel in violations[:50]:
            print(f"  [{src_layer} -> {tgt_layer}] {short(sf)}  --{rel}-->  {short(tf)}")
        if len(violations) > 50:
            print(f"  ... +{len(violations) - 50} more")
    else:
        print("  none — modular boundary holds ✓")

    print(f"\n## Backend import cycles: {len(sccs)}")
    for comp in sorted(sccs, key=len)[:20]:
        print("  cycle: " + " -> ".join(short(f) for f in comp))
    if len(sccs) > 20:
        print(f"  ... +{len(sccs) - 20} more")

    return 1 if violations else 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python3 _arch_check.py <graph.json>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
