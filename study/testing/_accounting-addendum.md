# Phase F — Accounting addendum (read AFTER study/testing/_agent-briefing.md)

You inherit NOTHING. Read `study/testing/_agent-briefing.md` FULLY first — environment, hard
prohibitions, write safety, method rules, founder's standard, per-screen checklist. Then this.

## Working API access (already proven this session — use it, do not re-derive)

```bash
cd /Users/hus3ain/Development/Zerupt
T=$(bash study/testing/_tools/tok.sh accountant1)   # or owner | cashier1 | storekeeper1
LE=d67ece83-e21c-4ae4-ad46-c9356d7f0f06             # the ONLY legal entity
API=http://localhost:3001/api/v1                    # NOTE the /api/v1 prefix
curl -s -H "Authorization: Bearer $T" -H "x-tenant-slug: gulf-auto-parts" \
     -H "x-branch-id: 43df4c2e-ec1b-4dc7-8f0d-d35a250c15e6" \
     "$API/tenant/accounts?legalEntityId=$LE&limit=5"
```
Branches: Al Rai Main Showroom `43df4c2e-ec1b-4dc7-8f0d-d35a250c15e6` · Fahaheel
`c0730989-d27c-4413-b623-c657d37f6e80` · Jahra `f9e79267-b53a-4aee-83a2-7fd221ae6111` ·
Salmiya `cfcb92d3-4cf2-4af5-b1fb-e1c5cebb3a7d`.
DB: `G=$(cat /private/tmp/claude-501/-Users-hus3ain-Development-Zerupt/0b59799a-8baf-40eb-bf6d-1813f86be7fc/scratchpad/gulf_db_url.txt); psql "$G" -c "..."`
Admin DB: `DATABASE_ADMIN_URL` in `erp/.env`. Tenant code `gulf-auto-parts-mt5kya1i`.

## The method that closed Reports 45/45 — use it

Drive BREADTH from code + SQL + authenticated curl. Reserve the browser for a focused
visual/RTL/interaction pass. The browser CONFIRMS; it rarely DISCOVERS.
For Accounting add a FOURTH check: **derive the expected number from the GL by hand BEFORE
believing any screen.** This is the module where a wrong number has nowhere further to hide.

## The master gate — run BEFORE your first write and AFTER your last

```sql
SELECT round(sum(debit-credit),6) FROM journal_entry_lines;  -- MUST be 0.000000
```
It has been 0.000000 through every session of the entire programme (baseline this session:
0.000000 over 889 lines). If it is not zero: STOP, report loudly, and DO NOT attempt a
correcting entry. Purchase recovered stranded money by void + re-raise THROUGH THE PRODUCT,
never a hand-written correcting journal.

## Absolute prohibitions specific to Accounting

- **NEVER touch the 4 opening-balance journals** (OB-0001, OB_AP-0001, OB_AR-0001, OB_INV-0001).
  Not void, not edit, not reverse, not re-date. They anchor every reconciliation in this tenant.
- Never void/delete/edit ANY pre-existing document. Create your own ZZTEST-prefixed ones.
- Log every document you create in `study/testing/_documents-created.md`.

## Accounting domain facts (established, do not re-litigate)

- Control accounts: AR = party-tagged **trade_receivables 1131** · AP = **trade_payables 2111** ·
  inventory = **merchandise_inventory 1141** · revenue = **product_sales 4200** net of returns,
  less contra-revenue 4300.
- **RPT-001 lesson:** `account_system_roles` is UNIQUE on (tenant, entity, roleKey), so a role
  names exactly ONE account and a second contra silently drops out. Sweep contra-revenue by
  `sub_type='sales_revenue' AND is_contra` instead of by role.
- AP/AR balances and aging derive from the **party-tagged GL sub-ledger**, never from
  denormalized document balances. A mismatch usually means you read the wrong source.
- Cost pools are **company-wide per (item, legal entity)**, not per branch. A company-wide cost
  is NOT a branch leak. They currently tie to GL 1141 within 0.000330 (documented 6dp-ledger-vs-
  3dp-GL leg rounding, deliberately left).
- POS has ONE `sourceDocumentType='pos'` and NO `je.event_type` — discriminate by joining
  `sourceDocumentId -> pos_transactions` or by GL role.
- **Sales allows foreign currency; purchase does not.** The asymmetry is DELIBERATE
  (`purchase-fx-guard.ts`, resolved erp 69be287c). Do NOT "fix" it. Credit-note FX must use the
  ORIGINAL INVOICE's rate. FX fails loud, never silently defaults.
- The tenant has an **AED invoice at rate 0.0835** created during Reports, so FX paths are live.
- `EVENT_REGISTRY` is the single source of truth for event->account mappings, with a CI
  completeness spec resolving every pair in BOTH directions. Adding a mapping needs no manual
  step — it propagates to every tenant via the deploy's steps 3+4. Never hand-seed one.
- Kuwait has **no VAT**. Any tax UI on a Kuwait screen is a finding. KWD is **3 decimals** —
  any 2dp display is a bug.

## Highest-value things to hunt in this module

1. **A document committing before its GL posts.** Purchase had exactly this: a leg rounding to
   sub-fils zero threw AFTER commit, leaving a bill invisible to AP, aging and trial balance.
   This is the single highest-value defect class here.
2. **Period close that can be bypassed**, and **a reversal that does not reverse.** Both CRITICAL.
   Five error maps in Purchase invented a fake "period closed" cause — check the REAL one fires.
3. **Maker-checker gap.** In Purchase an accountant could post a payment with no approver.
   Journal posting and period close are the same control shape.
4. A fired **tie-out tells you two numbers disagree, never which to trust.** RPT-001's cards were
   wrong; RPT-004's cards were right and the BANNER lied. Derive truth from the GL yourself
   before choosing a side. **Gross-vs-net on the two sides of a tie-out is the money-bug shape
   in this codebase.**

## The proven defect patterns — hunt ALL of them

1. **Path divergence / hand-copied helpers.** The most common defect across five modules. One
   name, two bodies, only one patched. Grep the function name repo-wide before calling anything
   fixed. Extract to ONE helper; never patch the second site.
2. **Fix at the primitive, not the call site.** RPT-052: the canonical shared formatters
   themselves emitted the banned em dash, which is why it had been "fixed" four times.
   SAL-PRINT-001 was closed by renaming a type so a raw UUID became UNREPRESENTABLE. Make the
   bug impossible, not absent.
3. **False success** — "completed" reported after a 500 or 403; one left a shift open forever.
4. **False failure** — a client timeout BELOW real write time (abort at 30003ms, write landing
   at 39489ms) reporting a committed financial write as failed. Check every client timeout
   against measured p99 write time on this network (~700-900ms RTT to Neon Singapore).
5. **Permission-gated lookups the user legitimately cannot make, failing silently downstream.**
   Fixed as a class via `useListWithDirectoryFallback` + permission-free `/directory` endpoints.
   NEVER widen a permission to fix a render bug.
6. **A flag used as a proxy for a quantity** (`supplier_invoice` standing in for "has this been
   billed" — stranded KWD 11).
7. **Type-coercion traps.** `z.coerce.boolean()` applies JS truthiness so `"false"` is true. A JS
   Date holds milliseconds while Postgres timestamptz holds MICROseconds, so a keyset cursor
   pointed before its own row and pagination could never advance past page 1 (five services
   affected, one silently skipped rows). Both were CRITICAL. Assume more exist.
8. **Pagination is guilty until proven innocent.** After RPT-037, WALK every keyset-paginated
   list past page 1 on real data. Also check for missing `placeholderData: keepPreviousData`
   and pagination unmounting on page change.

## Tests can demand defects

12+ stale tests in this programme pinned OUTDATED behaviour — including a tenant-scope assertion
whose helper could not recurse into arrays so it could never fail, and three tests passing for
the wrong reason. **Classify every changed assertion before touching it.** Never bulk-regenerate
a snapshot. Vitest passing != tsc clean (one file was 19/19 green with 12 type errors) — run
typecheck too.

## Cross-cutting items already open (do NOT fix blind, but note interactions)

- **AUDIT-002 (CRITICAL):** `POST /tenant/accounts/bulk` creates GL accounts with NO audit path
  at all. Squarely an Accounting finding — it is to be closed this phase.
- **AUDIT-003 (HIGH):** exports unauditable by design; the interceptor never audits GET.
- **AUDIT-004 (HIGH):** `audit_log` has no `branch_id` / `legal_entity_id` columns.
- **PERM-004:** denied users get fully interactive forms; the block lands only on submit.
  Server enforcement is correct, so this is UX, not security.
- **PERF-002:** ~3s browser-vs-curl gap ABOVE the API, in the Next/client layer. Strong lead:
  the `.next` cache is currently **27 GB**. Check cache size before filing any perf finding.

## Reporting format

Rank every finding **CRITICAL / HIGH / MEDIUM / LOW / FRICTION** and mark each **CONFIRMED** or
**SUSPECTED**. CONFIRMED requires evidence you personally observed (SQL result, curl output, or
the code path read end to end). Include the exact SQL/curl you ran INLINE. Also record:
- items **withdrawn after investigation** (across POS and Purchase, MOST reported CRITICALs were
  withdrawn on investigation and acting on them would have broken working behaviour), and
- honest **verification gaps** — what you could not check and why.
That is what makes the scoreboard trustworthy. Expect your own hypotheses to be disproven.
