# Agent briefing — Zerupt UI testing (READ FULLY BEFORE ANY ACTION)

You inherit NOTHING. Everything you need is here.

## Environment

- Web: http://localhost:3000 (Next 16, hot reload — source edits apply immediately).
- API: http://localhost:3001 (NestJS). **COMPILED build, NO watcher.** Source edits do nothing until:
  ```
  cd /Users/hus3ain/Development/Zerupt/erp && pnpm --filter @zerupt/api build
  cd apps/api && kill $(lsof -nP -iTCP:3001 -sTCP:LISTEN -t); sleep 5
  nohup node --enable-source-maps dist/main >> /tmp/zerupt-logs/api.log 2>&1 &
  ```
  A 503 from /health whose ONLY failing check is `email_config` is NORMAL on dev. Not a finding.
- Tenant: **Gulf Auto Parts**, Kuwait, **KWD with THREE decimals**. Any 2dp money display is a BUG.
  Auto-parts pack active. Locales en + ar (RTL). Tenant is LIVE.
- Login: http://gulf-auto-parts.localhost:3000/en/login
  owner `anonymator8@gmail.com` / `Dev.zerupt.com@53`
  also `cashier1` / `accountant1` / `storekeeper1`, all `Zerupt.Test@2026`
- DB: connection string is in `/private/tmp/claude-501/-Users-hus3ain-Development-Zerupt/0b59799a-8baf-40eb-bf6d-1813f86be7fc/scratchpad/gulf_db_url.txt`
  Use: `G=$(cat <that file>); psql "$G" -c "..."`
- Browser: gstack browse at `$HOME/.claude/skills/gstack/browse/dist/browse`.
  **NEVER use mcp__claude-in-chrome__* tools.**
- Code: `/Users/hus3ain/Development/Zerupt/erp`. Read `erp/docs/CODEMAPS/<module>.md` FIRST.

## Hard prohibitions

- **NEVER run a full test suite** — it locks the machine. Narrow only:
  `npx jest <fragment> --no-coverage` from `apps/api` (NOTE: `--testPathPatterns` silently
  matches ZERO files — never use it; always confirm "Test Suites: N" in output).
  `npx vitest run <fragment>` from `apps/web`.
- **NEVER run destructive git** — no checkout, reset, stash, clean, restore. Many sessions
  share this tree with a large uncommitted diff. NOTHING is committed. A subagent's
  `git checkout` once destroyed another session's work.
- **NEVER spawn your own subagents.**
- Never void/delete/edit any pre-existing document, or the 4 opening-balance journals
  (OB-0001, OB_AP-0001, OB_AR-0001, OB_INV-0001).

## Write safety

Creating data is ENCOURAGED — that is the point of this exercise. But:
- Prefix EVERYTHING you create with `ZZTEST`.
- Log every document you create by appending a row to `study/testing/_documents-created.md`.
- Run this BEFORE your first write and AFTER your last. **Use the STATUS-AWARE form** -
  the old status-blind version has produced TWO false "integrity breach" alarms in a single
  session, because this programme deliberately creates unbalanced DRAFTS to probe the posting
  gate. Full explanation and the triage queries: `study/testing/_LEDGER-GATE.md`.
  ```
  psql "$G" -Atc "select round(sum(l.debit-l.credit),6) from journal_entry_lines l
    join journal_entries je on je.id=l.journal_entry_id
    where je.status in ('posted','reversed');"
  ```
  It MUST be `0.000000`. It has been through every session. If it is not, STOP and report
  loudly — do not continue testing.
- Existing test item: `ZZTEST-SKU-0001` / `ce4915ed-f88b-4bdb-8885-77e9b9cef882`.

## Method rules — each of these was earned by a real failure. Violating one produces a false report.

1. **A green test is NOT proof a user-facing bug is fixed.** One fix had a passing test, a
   correct EXPLAIN plan and the right SQL result, and was completely unfixed for users — the
   same predicate existed TWICE and only one copy was patched. Always verify the user-visible
   outcome yourself in the browser.
2. **Assert who you are logged in as before EVERY conclusion.** Agents share one browser.
   Absence of a branch gate is NOT proof of login. This caused two wrong conclusions.
3. **The branch-scoping trap — three agents already fell in.** Warehouse names do NOT map 1:1
   to branch names. **Al Rai owns THREE warehouses:** `B1_AL_RAI_MAIN_SHOWROOM-MAIN`,
   `..._TR` (Transit), and `WH1_B1` (display name "Shuwaikh Central Warehouse" — the name
   looks like a different branch but it is NOT). Other branches own one warehouse each.
   **Run SQL joining warehouse -> branch before calling ANYTHING a leak.**
   The item catalogue is company-wide BY DESIGN (5,000 items) — a catalogue count is NOT a leak.
4. **State the layer and the network baseline for any performance claim.** This machine is
   ~700-900ms RTT from Neon (Singapore). Raw browser timings look catastrophic and are mostly
   latency. A number without that baseline is not a finding.
5. **A negative control that passes once is not a control.** A locale bug looked route-specific
   because the control page merely resolved faster. Repeat controls.
6. **Check the schema before recommending removal of anything financial.** Two agents disagreed
   on whether two cost fields were duplicates; the DB settled it — different columns,
   different tables.

## The founder's standard (these count as REAL findings, weighted equally with bugs)

- **A button must do what its label says.** A "Post"/"Confirm" that only creates a draft is a
  HIGH finding.
- **No unnecessary draft stage.** The default is NO draft; a draft must EARN its place. If it
  exists, state why it is needed.
- **Count the clicks / dialogs / forced fields per create flow**, then answer directly:
  **could an untrained Kuwaiti shop owner do this on the first try in under 60 seconds?**
  If no, say exactly what stops them.
- **Confirm once, only for irreversible actions.** No stacked dialogs (a dialog on top of a
  dialog is a finding), no repeated questions, no dead ends. Never confirm an ordinary save.
- **Defaults over questions.** If the system can know it (branch, warehouse, date, currency),
  it must not ask. Flag every field that could have been defaulted but was left blank.
- **Plain language.** No jargon, no raw IDs, no internal parameter names in user-facing copy.
  Error copy says what to DO, not what broke internally.
- **Industry fields:** a tenant must NOT see fields irrelevant to their industry at all — not
  even collapsed. Two guardrails: a hidden field never drops its value on save, and it stays
  visible if this item already has a value. The mechanism is DECLARATIVE in the pack manifest
  (`hidesCoreFields` / `promotesCoreFields` / `suppressesCoreFields`).
  **Never add industry conditionals to the core form panel.**
- **No em dashes** in any product copy or UI string.
- Full **ar/en parity on every screen**; RTL must use CSS logical properties only.

## Per-screen checklist (abbreviated — full version in study/testing/README.md sections A-G)

A. Scoping: branch / legal-entity / warehouse / tenant. Aggregates obey the same scope as rows.
   Switching scope refetches and shows no stale data.
B. Permissions: route IS gated; backend `@RequiresPermission` matches the frontend gate;
   clean denial not a crash; `cost.view` strips cost/margin in UI **and** server-side;
   action buttons gated individually.
C. Audit: every mutation writes an audit row with correct actor/entity/branch. Verify in DB.
D. Lists: pagination (deep pages, page-size change), search (partial, exact, Arabic, no-results),
   every filter individually AND combined, filters survive pagination, sorting both directions,
   empty/loading/error states, export respects applied filters.
E. Forms: validation client AND server, KWD 3dp, NO tax UI (Kuwait is a no-tax country),
   keyboard-first happy path, loading/error/empty/success on every action, warn before data
   loss, responsive at 375/768/1280/1920.
F. i18n: no hardcoded strings, en+ar complete, RTL correct, printed docs bind to the DOCUMENT
   language never the UI locale.

## How to report

Rank every finding **CRITICAL / HIGH / MEDIUM / LOW / FRICTION** and mark each
**CONFIRMED** or **SUSPECTED**. CONFIRMED requires evidence you personally observed
(browser output, SQL result, or the code path read end to end). Include exact reproduction
steps and the evidence inline.

Severity: CRITICAL = data loss, money wrong, tenant leak, auth bypass. HIGH = blocks the task
or fails silently. MEDIUM = confusing, friction, missing state. LOW = cosmetic/copy.
FRICTION = works but wastes the user's time.

**Do not inflate severity.** Three "CRITICAL" reports last session were false alarms caused by
the branch-scoping trap (rule 3). Your severe claims WILL be independently verified — a false
CRITICAL costs more than a missed MEDIUM.

Write your findings to the file named in your task prompt, and also return a concise summary
of the findings as your final message (the orchestrator sees only your final message).
