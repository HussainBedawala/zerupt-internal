# /harden &lt;module&gt; — Module Hardening Program

Runs Zerupt's proven, ledger-first module-hardening methodology (the process
behind the completed accounting, inventory, purchase, sales, and POS programs).
Autonomous, layer-by-layer: audit → harden backend+frontend → review → gate →
commit-with-sha → log. Usage: `/harden <module>` (e.g. `/harden reports`).

Source of truth for a resumable program is `study/<module>/_hardening-log.md`.
If it already exists, READ IT FIRST and resume from the Progress checklist —
do not restart.

---

## 0. Lock the program (once, before any layer)

1. Read `study/<module>/_hardening-log.md` if present → resume. Else create it.
2. Read the module spec: `agent-os/product/modules/<module>/` and the codemap `erp/docs/CODEMAPS/<module>.md`.
3. Write the log header:
   - **Founder mandate** + one-paragraph program description + execution mode (autonomous) + the no-nested-subagent-spawn reminder.
   - **"What makes `<module>` different"** — the module-specific invariant framing (is it a ledger, or an event-emitting front end that must tie OUT to the ledger?).
   - **Guiding principles** — persona-framed ("think like a {accountant / stockkeeper / purchaser / seller / cashier}"), always including: three-way tie-out, backend-AND-frontend every layer, no tech debt, modular boundary points DOWN only.
   - **Process gates** — reviewer roster, DI boot gate, coverage bar, next migration number.
   - **Locked decisions** — scope/execution calls made once, referenced not re-litigated.
4. Decide the **layer plan** (see §1) and write it as a table + empty Progress checklist.

## 1. Default layer plan (ledger-first, document-chain order)

Start from the **6-layer default**; split a layer into sub-layers (2a/2b/2c) only when its audit shows it's too large (inventory needed this, purchase did not). Add a 7th **presentation** layer only for modules with their own receipts/print surface (POS).

| # | Layer | Core scope |
|---|-------|-----------|
| 0 | Foundation / master data + subledger | Ledger dimensionality decision (what dims the immutable ledger carries) + master data |
| 1 | Primary lifecycle / intake | Posting/movement/tx lifecycle. **Lock dual-path here** if the module has one (PO vs direct, SO vs express) — both paths reuse the SAME atomic engine. |
| 2 | Core engine + GL/stock handoff | Sub-ledgers & valuation / reservations+ATP / GRN+accrual / delivery+COGS / tender |
| 3 | Document confirmation / invoice + discounts | Period & balance integrity / 3-way match / output VAT / discounts+promotions |
| 4 | Reversal-heavy | Returns / landed-cost+revaluation / counts / adjustments |
| 5 | Settlement / offline sync + aging + period close | Payments+aging / receipts+aging / offline idempotent replay |
| (6) | Presentation | Documents / print / WhatsApp / QR — POS-class modules only |
| last | Reporting + period close | ALWAYS last; ties to the ledger by construction |

## 2. Correctness invariants — every layer must STATE and PROVE these

- **Subledger is DERIVED, never stored.** AR/AP/stock-value = SQL aggregation over an immutable, party/item-tagged control-account ledger (AP from 2111, AR from 1131, stock value = Σ signed total_cost). Reconcile must HOLD after every mutating op (create/confirm/void/return/reversal/close).
- **Three-way tie-out.** Module record ↔ balanced GL journal ↔ stock/cash movement, atomic, same DB transaction, for every action.
- **Full reversal coverage, no dead-ends.** Every forward action has a correct, atomic, net-zero contra path that contras the ORIGINAL GL accounts at engine-realized cost.
- **GL-correct by construction** — reviewer balance-proofs, not assertions.
- **Idempotency / exactly-once** — eventId/clientId-keyed on outbox + offline replay; advisory xact-locks around header rows (no double/partial post).
- **Period integrity** — assertPeriodOpen before every posting.
- **Immutable documents / append-only ledger** — DB-level triggers where relevant.
- **Fail-loud over silent-wrong** — non-1 FX rejected not mis-posted; cost-zero COGS flagged (sale still completes — never lose a sale).
- **Money = Decimal everywhere**; generated total/balance columns where drift must be structurally impossible.
- **No TOCTOU** — advisory-locked in-tx checks for hard blocks (e.g. credit limit).
- **Modular boundary DOWN only** — re-verify every layer; invert any upward violation to an event.

## 3. Per-layer loop

1. Subagent writes the layer **study doc**: `study/<module>/<NN>-<topic>.md` (persona-framed explainer). Delegate; keep detail out of orchestrator context.
2. Subagent runs a **full layer audit** → writes gaps to `/tmp/<module>-hardening/layer-<N>-audit.md` (NOT into context), returns a terse summary.
3. **Harden** backend AND frontend — the web UI must actually expose the hardened behavior. Fix as the persona would need.
4. **Migrations**: `drizzle-kit generate` → apply to dev tenant DB. Prod auto-applies via Railway pre-deploy migrator on merge to main. NEVER hand-edit `_journal.json`'s `when` (journal-integrity CI guard exists because this caused an 11-migration prod silent-skip).
5. **Reviewer panel** (dispatch by what the layer touches):
   - Always `code-reviewer`; backend → `nestjs-reviewer` + `api-reviewer`; any GL/COGS/tax/tie-out → `accounting-reviewer` (balance-proof every JE); PIN/SoD/cash/auth → `security-reviewer`; migrations → `database-reviewer`; web → `frontend-reviewer`.
   - For money paths, ALSO run an **independent cross-model pass** (gstack `/review` — Codex/fresh subagent, not Claude-reviewing-Claude).
   - Fix ALL CRITICAL/HIGH/MED same session. None deferred silently.
6. **Gates**: real `node dist/main.js` boot (the DI/wiring gate unit tests miss) · 100% coverage on financial/GL/tie-out/reversal paths, 80%+ general · confirm literal "Test Suites: N" with N>0 (jest passWithNoTests silently passes on 0 matches).
7. **Commit + merge to main.** Log `- [x] L<n> <name> — shipped <8-char-sha> (mig <NNNN>)` in the Progress checklist AND a `### L<n> — <name> (shipped <sha>, <date>, mig <NNNN>)` entry in the Layer log (what shipped + bug named, reviewer summary, gates passed).
8. Optionally pre-run the NEXT layer's read-only study+audit in parallel while this one finishes (the purchase-program speedup).

## 4. Deferrals — track, never drop

- Name each deferral explicitly in the Layer-log entry. Distinguish **deferred scope/features** (founder decisions — e.g. ZATCA QR, loyalty) from **founder TODOs** (need a human because review was code/test-level — e.g. "verify live stock-relief on a real dev tenant before go-live").
- At the point of deferral in code, drop a `// ponytail: <ceiling>, <upgrade trigger>` comment, AND log it in the "Deferred" section of `_hardening-log.md`.
- `/ponytail-debt` then independently cross-checks that nothing was dropped silently. Run it before any go-live claim.

## 5. Mandates (non-negotiable)

- Backend AND frontend every layer. · Dual-path both audited every layer, one shared engine. · Subagents must NOT spawn their own subagents (write to `/tmp/<module>-hardening/`, return terse summaries). · Autonomous end-to-end once locked; report only at layer/program boundaries. · Any new scheduled job → verify TenantContext/ALS is present (this bug class appeared twice in inventory). · CI guards born from incidents stay on.

## 6. Program close

When all layers ship: write the program-level **Deferred** roll-up (scope vs founder-TODOs) into `_hardening-log.md`, chain all layer SHAs, and update the terse mirror in `MEMORY.md` under Hardening programs. Run `/ponytail-debt` for a final dropped-corner sweep.
