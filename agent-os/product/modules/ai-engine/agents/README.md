# Agent Responsibility Cards

One file per agent. Each card is **self-sufficient**: an LLM (or human) loading a single card understands that agent's exact responsibilities, boundaries, data contract, laws, degradation behavior, and how to diagnose it during testing. Deep design rationale stays in the numbered specs (`../0X-*.md`); cards state the contract.

| Card | Agent | Status |
|---|---|---|
| `zee.md` | Zee — master, the voice & orchestrator | persona live at launch |
| `mira.md` | Mira — migration specialist (agent #0) | MVP (June 15) |
| `sami.md` | Sami — invoice scanner | MVP (June 15) |
| *(Phase B)* | Noor (dead stock) · Maya (margin) · Tariq (shrinkage) · Arjun (stockout) | cards written when each is built; interim spec: `../03-money-found-engine.md` |

## Card format (use for every new agent)

1. YAML block: `agentKey, role, status, tier (OWN/BORROW/RENT), unlock, counter`
2. What the agent IS (identity, 2–3 bullets)
3. Exact responsibilities (numbered table with code location)
4. What it does NOT own (boundary against sibling agents + NestJS)
5. Data contract (`READS / EMITS / WRITES-via-NestJS / privacy boundary`)
6. Non-negotiable laws
7. Failure & degradation table
8. Diagnostic anchors for testing

Universal rules that apply to every card (from `../00` and `../01`): Python thinks NestJS acts · brain never writes business tables · all writes audited with `origin: 'zee/<agentKey>'` · every correction captured (`ai_corrections`) · no silent degradation · claims trail measured accuracy.
