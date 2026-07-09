# Audit Trail Hardening Program — Log (started 2026-07-09)

> Founder trigger (2026-07-09): a client asked Hussain's dad for the full audit trail of an
> invoice — created when/by whom, edited how many times, by whom, when, and WHAT CHANGED each
> time. Dad's system stores only created-by + last-updated-by. Zerupt must be provably better:
> capture EVERYTHING end to end, tamper-proof, accessible only to the right people with the
> right permissions. Run as a dedicated, resumable hardening program (like the module programs),
> categorized financial-docs-first, one category at a time. Invoices were only an EXAMPLE — the
> mechanism must be fully generic, dynamic, scalable, accurate, future-proof. Ponytail: reuse the
> existing audit spine, don't rebuild. Working directly on `main`. Testing on prod, 0 real users
> (tenant is disposable) — no backfill/migration-safety concerns, but keep deny-list rigor.

Plan file: `~/.claude/plans/robust-stargazing-sparkle.md`

## What already existed (verified 2026-07-09, do NOT rebuild)
Immutable `audit_log` table (DB trigger blocks UPDATE/DELETE, `packages/db/src/schema/audit.ts`),
global `@Audited` interceptor on ~100 controllers, tenant-scoped + `settings.audit.read`-gated
reads, full timeline/table/diff/export UI (`apps/web/src/features/audit/`). Who/when/how-many was
already captured. The hole was FIDELITY: `before` was null everywhere (captureBeforeState had zero
callers) and `after` was gutted by a ~30-key hard allowlist.

## Guiding principles (every category)
1. Generic mechanism first — no per-entity hardcoding; entity registry + shared deny-list.
2. Money/security/tenant paths: 100% capture-correctness coverage; reviewers stay paranoid.
3. Capture model = FULL SNAPSHOT minus a shared sensitive deny-list (never an allowlist).
4. before/after must be complete (parent + line items) so a child-field edit is visible.
5. Permanent over expedient; deletion over addition; shortest correct diff.

## Process gates (every category)
- Reviewers: code-reviewer + security-reviewer ALWAYS (immutable log = PII/secret + tamper risk);
  + nestjs/api (backend), accounting-reviewer (financial entities), frontend-reviewer (history UI),
  database-reviewer (migrations). No lazy framing in reviewer prompts.
- `node dist/main.js` boot = DI gate. 100% capture-correctness coverage per category; 80%+ general.
- Confirm "Test Suites: N" in jest output. Commit to `main` with sha. Log + next.

## Category plan
| # | Category | Status |
|---|----------|--------|
| 0 | Generic capture mechanism (deny-list, registry, before-capture, correlation, client diff) | ✅ SHIPPED 2026-07-09 |
| 1 | Financial documents (invoices, credit/debit notes, payments, receipts, journal entries) — verify + per-entity history views | pending |
| 2 | Master data (customers, suppliers, items, COA, tax config, doc numbering) | pending |
| 3 | Inventory & operations (adjustments, counts, transfers, batches, serials, price lists, promotions, reorder) | pending |
| 4 | POS (registers, shifts, transactions, cash movements) | pending |
| 5 | Settings/admin/security (roles/RBAC, users, org, webhooks, api-keys, flags, security) + admin_audit_log immutability trigger | pending |
| 6 | Non-HTTP coverage (jobs, events, outbox, system) + cross-event correlation | pending |
| 7 | Access + UI polish + close-out (verify settings.audit.read seeding, history-view consistency, export/retention) | pending |

Per category after L0: (a) composite registry loaders, (b) verify capture fidelity, (c) wire the
per-entity history view into detail pages (reuse `AuditPanel` pre-filtered by entityType/entityId —
the `/accounting/audit-trail` page already supports it; nothing links yet), (d) 100% tests,
(e) reviewer panel, (f) commit, (g) log.

---

## Layer 0 — Generic capture mechanism ✅ SHIPPED 2026-07-09

**What shipped**
- `apps/api/src/audit/audit-denylist.ts` (NEW) — single source of truth. `isDeniedKey` (exact set +
  collision-safe substring guards), recursive `scrubSnapshot` (walks objects+arrays, Date→ISO,
  MAX_DEPTH 8 / MAX_NODES 5000 truncate-not-throw), `scrubSnapshotObject`. Imported at BOTH write
  (interceptor) and read (controller) so the two can never drift.
- `apps/api/src/audit/audit-entity-registry.ts` (NEW) — 100 entityType→table entries; 11 composite
  parent+lines loaders (Sales/PurchaseInvoice, CreditNote, Sales/PurchaseOrder, PurchaseReturn, Grn,
  PosTransaction, StockCount, StockTransfer, LandedCost); `loadBeforeSnapshot` (never throws, logs).
- `audit-log.interceptor.ts` — flipped allowlist→full-snapshot deny-list; async pre-handler
  before-capture for Update/Delete via registry (structurally cannot block the mutation:
  `from(prepareBefore().catch(()=>undefined))`); HTTP-scoped correlation id (validated inbound header
  else randomUUID, memoized on request); escape-hatch sentinel `auditBeforeCaptured`.
- `audited.decorator.ts` — removed obsolete `fields` allowlist option (only `action?` remains).
- `audit-log.controller.ts` — read redaction now recurses + uses shared `isDeniedKey` (masks).
- `suppliers.controller.ts` — dropped the `fields` workaround (full snapshot covers it).
- Web: `features/audit/utils/audit-diff.ts` (NEW) + `audit-field-diff.tsx` — recursive nested/array
  diff, id-matched line items, timestamp-noise suppression. Flows to timeline + dialog.

**Reviewer panel findings (all fixed before commit)**
- CRITICAL (nestjs): `withLines` indexed the table by `column.name` (snake_case) but Drizzle keys by
  camelCase JS prop → every composite FK resolved to `undefined` → before-snapshot silently null for
  ALL line-based financial docs. Fixed: pass the column objects directly (`eq(fkColumn, id)`). Added a
  regression test spying on drizzle `eq`/`asc` to assert no undefined column.
- CRITICAL (security): India PAN (`panNumber` on `supplierTdsConfig`) leaked into the immutable log
  (bare `pan` was excluded to avoid "company" collisions; compound slipped through). Fixed: added
  `pannumber` + compound substring guards.
- HIGH (security): region national IDs (emiratesId/civilId/aadhaar) not in deny-list under the
  deny-list-only model. Fixed: added exact + compound-substring guards (collision-safe; short terms
  ssn/pan/tin/bic stay exact-key only).
- HIGH (frontend): duplicate-id array items produced a false "changed" row instead of "removed".
  Fixed by the diff util (consume each matched new item once).
- MEDIUM: mutation-block made structural (`.catch` on the pre-step); whole-array add/remove now shows
  per-item breakdown instead of raw JSON; LOW: `__proto__`/`constructor`/`prototype` denied; circular
  deepEqual guarded.

**Gates:** api typecheck + web typecheck + build green; `node dist/main.js` → "Nest application
successfully started"; audit jest suite 127 passing / 6 suites; web audit-diff Vitest green;
i18n:check green.

**Known follow-ups (documented, deferred by design — NOT silent gaps)**
- 10 entityTypes unmapped in the registry (admin-DB identity: FeatureFlag/UserTenantMap/UserProfile;
  JE-posting actions with no dedicated row: FxRevaluation/OpeningBalance*; read-only
  SubledgerReconciliation; ReorderGeneratePo covered by PurchaseOrder). before=null for these, same as
  before L0 (no regression). Address in their categories (esp. L5 admin-DB before-capture needs an
  admin-db loader path).
- `SupplierTdsConfig` before-capture: route param `id` is supplierId but the table PK differs, so
  before is null — needs a custom loader keyed by supplierId (L2/L5).
- Cross-event/outbox correlation threading (HTTP-scoped correlation ships now) — L6.
- Per-entity history views not yet wired into detail pages — starts L1.

**Commit:** 31af69a4 (zerupt-erp)
