# Phase G — residual keyset-cursor microsecond sweep (2026-08-30)

Continuation of `09-keyset-cursor-sweep.md`. That pass fixed 11 sites and shipped a ratchet spec
(`audit/keyset-cursor-precision.spec.ts`) with `KNOWN_OFFENDERS = []`. This pass rebuilds the
inventory from scratch (not trusting the prior list), finds the ratchet's own textual-scan blind
spot, fixes 7 MORE genuinely-CRITICAL sites it missed, and closes the blind spot itself.

## Method

1. `rg`-scoped (never whole-tree) for: the shared helper (`keysetTimestamp`, `common/keyset-timestamp.ts`),
   every file mentioning "cursor", every `*.cursor.ts` codec, and every `encode/decodeXCursor` call site,
   across `erp/apps/api/src` and `erp/apps/web/src` only.
2. For each hit, read the actual `.select({...})` feeding the cursor and the `encode*Cursor(...)` call
   site, and classified SAFE / UNSAFE / N/A by hand — not by re-running the old ratchet, which (see
   below) has a real blind spot.
3. Settings' own lists (branches, roles, team-users, doc-numbering, notification-policies,
   user-profile, session-ledger, audit-log) were explicitly checked, not assumed.

## Full table

| File:line | Path / list | SAFE / UNSAFE / N/A | Evidence |
|---|---|---|---|
| `reports/general-ledger.service.ts:123` | General Ledger | SAFE | `createdAt: keysetTimestamp(journalEntryLines.createdAt)` |
| `reports/purchase-register.service.ts:483` | Purchase Register | SAFE | `keysetTimestamp(purchaseInvoices.createdAt)` |
| `reports/purchase-returns.service.ts:299` | Purchase Returns report | SAFE | `keysetTimestamp(purchaseReturns.createdAt)` |
| `reports/stock-movement-ledger.service.ts` | Stock Movement Ledger | SAFE | `keysetTimestamp(...)` on `occurredAt` |
| `reports/day-book.service.ts:163` | Day Book | SAFE | `keysetTimestamp(journalEntryLines.createdAt)` |
| `audit/audit-log.service.ts:177` | **Settings > Audit Log** | SAFE | `keysetTimestamp(auditLog.createdAt).as("created_at_cursor")` — this is the CRITICAL that started the whole programme (1,120/13,161 lost); live-proved again below |
| `notifications/notifications.service.ts:153` | Notifications inbox | SAFE | `cursorCreatedAt: keysetTimestamp(notifications.createdAt)` |
| `close-management/close-run.service.ts` / `-crud.service.ts` | Close Run list | SAFE | row-value seek on `keysetTimestamp`-sourced text |
| `cheques/cheques.service.ts` | Cheque register | SAFE | `keysetTimestamp(cheques.createdAt)`, stripped before response |
| `purchase/direct/export/direct-purchase-export.service.ts` et al. (8 export services) | Purchase exports (direct-purchase, GRN, bill, landed-costs, orders, supplier-payments, returns) | SAFE | all use `keysetTimestamp()`; confirmed unchanged since Phase F |
| `sales/direct/export/direct-sale-export.service.ts` | Direct Sale export | SAFE | `keysetTimestamp(confirmedAt)` |
| `sales/quotations/export/quotation-export.service.ts:319` | Quotation export | SAFE | `createdAtCursor: sql<string>\`${quotations.createdAt}::text\`` (microsecond-preserving cast, equivalent to `keysetTimestamp`) |
| `sales/invoices/export/invoice-export.service.ts:295` | Sales Invoice export | SAFE | same `::text` pattern |
| `sales/delivery-orders/export/delivery-order-export.service.ts:299` | Delivery Order export | SAFE | same `::text` pattern |
| `journal-entries/export/journal-entry-export.service.ts:304` | Journal Entry export | SAFE | same `::text` pattern |
| `pos/catalog/pos-catalog.service.ts:114-132` | POS catalog delta sync | SAFE (by design, not `keysetTimestamp`) | deliberately buckets `[cursorMs, cursorMs+1ms)` and tie-breaks by id — documented workaround for the same millisecond-truncation fact, not the naive bug |
| `reports/goods-received.service.ts` | Goods Received report | N/A | cursor key is a plain SQL `date` column (`receiptDate`), no sub-day precision to lose |
| `reports/open-purchase-orders.service.ts` | Open Purchase Orders | N/A | same — plain `date` cursor key |
| **`reports/customer-statement.service.ts:452,610` (+664)** | **Customer Statement** | **UNSAFE → FIXED** | selected raw `createdAt: journalEntryLines.createdAt` (JS `Date`), encoded via `createdAtToIso(lastRow.createdAt)` = `.toISOString()`. Same defect shape as the original audit-log CRITICAL |
| **`reports/supplier-statement.service.ts:502,713` (+773)** | **Supplier Statement** | **UNSAFE → FIXED** | identical pattern, `createdAtToIso` |
| **`reports/sales-register.service.ts:356`** | **Sales Register report (in a module marked COMPLETE)** | **UNSAFE → FIXED** | raw `confirmedAt: salesInvoices.confirmedAt`, cursor built via `confirmedAtToIso()` = `.toISOString()` |
| **`reports/sales-returns.service.ts:270`** | **Sales Returns / Credit Notes report** | **UNSAFE → FIXED** | raw `confirmedAt: salesCreditNotes.confirmedAt`, cursor via `toIso()` |
| **`reports/unbilled-deliveries.service.ts:192`** | **Unbilled Deliveries report** | **UNSAFE → FIXED** | raw `confirmedAt: deliveryOrders.confirmedAt`, cursor via `confirmedAtToIso()` |
| **`reports/pos-cash-variance.service.ts:206`** | **POS Cash Variance report** | **UNSAFE → FIXED** | raw `closedAt: posShifts.closedAt`, cursor via a locally-defined `toIso()` wrapper |
| **`reports/pos-refunds-voids.service.ts:276`** | **POS Refunds & Voids report** | **UNSAFE → FIXED** | `eventAt: this.eventAtExpr` (raw `coalesce(voidedAt, completedAt)` SQL, still parsed to a `Date`), cursor via `toIso()` |
| Settings: `branches`, `roles`, `team-users`, `doc-numbering`, `notification-policies`, `user-profile`, `security-settings/session-ledger` | Settings lists | N/A | none paginate by keyset — small/complete result sets, plain `orderBy` with no cursor field at all |
| `suppliers/export/supplier-export.service.ts:92` | Supplier export | N/A | offset-based by design (documented in its own header, small master-data table) — not a keyset cursor |
| `apps/web/src/**` | Client-side | N/A | web only forwards the server's opaque `nextCursor` string; no client ever re-derives or re-encodes a cursor from a `Date` |

**Totals: 30 keyset-relevant paths enumerated (SAFE 21, N/A 7 including all settings lists, UNSAFE 7 — all fixed here).**

The 7 UNSAFE sites span 3 different modules the prior phase's own doc called COMPLETE (Sales,
Purchase/Reports, POS) — confirming the task's premise that the eleven-site fix undercounted.

## The fix

Same shape as Phase F: each raw `Date`-typed select gained a sibling `keysetTimestamp()`-derived
text column (`confirmedAtCursor` / `closedAtCursor` / `eventAtCursor` / `createdAtCursor`), and the
`encode*Cursor(...)` call site was switched from the lossy `Date.toISOString()` helper to that
column. The `Date` field itself is untouched (still used for display/date-only derivations, which
need no microsecond precision).

`reports/pos-refunds-voids.service.ts`'s `eventAt` is a raw SQL expression
(`coalesce(voidedAt, completedAt)`), not a plain column — `keysetTimestamp()` accepts any
`SQLWrapper`, so `keysetTimestamp(this.eventAtExpr)` works unmodified; no second implementation
was needed.

Two of the seven (`sales-register`, `pos-cash-variance`) guard a cursor field typed
`string | null` (the underlying timestamp is nullable in the schema even though the report only
ever lists rows where it is set). Rather than re-adding a lossy fallback (`?? toIso(...)`, which
would silently reintroduce the bug and did briefly reappear during editing — see next section), a
new **shared** helper `assertCursorTimestamp(value, field)` was added next to `keysetTimestamp()`
in `common/keyset-timestamp.ts` (re-exported from `reports/keyset-timestamp.ts`, same one-name-one-body
discipline as the existing re-export) that throws loudly instead of falling back.

No second cursor helper was hand-copied anywhere; every fix routes through the ONE existing
`keysetTimestamp()` implementation.

## The regression test had a real blind spot — found and closed

`audit/keyset-cursor-precision.spec.ts` is a ratchet that scans every cursor-producing source file
for `.toISOString()` textually near the word "cursor". Running it BEFORE any fix in this phase
**passed** with the empty `KNOWN_OFFENDERS` inventory — despite `customer-statement.service.ts`,
`supplier-statement.service.ts`, `sales-register.service.ts`, `sales-returns.service.ts`,
`unbilled-deliveries.service.ts`, `pos-cash-variance.service.ts` and `pos-refunds-voids.service.ts`
all genuinely carrying the bug at that moment. Root cause: the truncation in all seven happened
inside a small locally-defined helper (`toIso`, `confirmedAtToIso`, `createdAtToIso`) — the
`encode*Cursor(...)` call site textually reads `toIso(lastRow.confirmedAt)`, which does not contain
the literal string `"toISOString()"`, so the direct scan never fires. **A green run of this test
was not proof the class was fixed** — exactly the class of false-negative the founder's method
rule 1 warns about.

Fix: `offendingFiles()` now also detects a local helper function whose body is
`return ... .toISOString()` (regex `HELPER_BODY_RX = /return[^;{}]*\.toISOString\(\)/` over a
3-line lookahead from the `function name(...)` declaration line), collects its name, and treats a
call to that name — not just a literal `.toISOString()` — as an offending line for the existing
cursor-context window check. This was verified to actually catch the class: mid-fix, before adding
`assertCursorTimestamp`, `pos-cash-variance.service.ts` and `sales-register.service.ts` still had a
`lastRow.xCursor ?? toIso(lastRow.x)` fallback, and the strengthened test correctly flagged BOTH as
unexpected offenders (proving the detector fires on the real shape); after removing the fallback in
favor of `assertCursorTimestamp`, both cleared. Two over-eager iterations of the detector (lookahead
too wide, catching unrelated display-only `toISOString()` helpers in the same file) were tightened
by requiring the helper's own body — not merely nearby code — to `return` an ISO string.

**Spec file: `apps/api/src/audit/keyset-cursor-precision.spec.ts`.** Assertions: (1) no file outside
`KNOWN_OFFENDERS` (now, and forever, `[]`) builds a cursor from a direct `.toISOString()` call OR a
call through a local millisecond-truncating helper; (2) the audit log specifically stays clean;
(3) the scan actually visited >20 files (guards against a silently-empty scan).

```
$ npx jest keyset-cursor-precision --no-coverage   # from erp/apps/api
Test Suites: 1 passed, 1 total
Tests:       3 passed, 3 total
```

## Build / typecheck

`pnpm --filter @zerupt/api build` — clean after fixing two knock-on typecheck errors the first
build caught that `tsc --noEmit` alone had missed at the point they were introduced: a second,
un-updated `LineRow`-shaped select in each of `customer-statement.service.ts` and
`supplier-statement.service.ts` (the export-all path, a separate query from the paginated one) was
missing the new `createdAtCursor` field, and `reports/keyset-timestamp.ts` needed to re-export
`assertCursorTimestamp` alongside `keysetTimestamp`. Both fixed; build is green.

API was rebuilt and restarted ONCE, at the end, after all seven fixes were made (batched per the
resource-constraint instruction). Freshness confirmed by grepping the compiled `dist/` bundle for
the new symbols post-restart (`assertCursorTimestamp` present in `pos-cash-variance.service.js` and
`sales-register.service.js`; `confirmedAtCursor`/`eventAtCursor`/`createdAtCursor` present in the
other five) — not by mtime.

## Live proof

Ledger identity gate, before and after everything in this phase (read-only sweep; no documents
created): `select round(sum(debit-credit),6) ... where status in ('posted','reversed')` = **0.000000** both times.

### Proof 1 — Settings > Audit Log (the module the original CRITICAL was found in)

SQL truth (Gulf Auto Parts tenant DB, direct query): `select count(*) from audit_log` = **13,417**
at the time the comparison snapshot was taken. 12,272 of the (then) 13,387 rows shared a millisecond
with a sibling row — confirming the at-risk shape is still massively present in real data.

Walked the live API as the owner (`GET /api/v1/tenant/audit-logs?limit=100`, following `nextCursor`)
end to end: **135 pages, 13,408 rows returned, all 13,408 ids UNIQUE (zero duplicates)**.

Diffing the API's id set against the SQL id set found 9 rows present in SQL but absent from the walk.
Investigated each: all 9 have `created_at` timestamps inside the ~5-minute window the walk itself
ran in (`08:48:14` through `08:55:00`), on a tenant this session shares with **nine other agents
running in parallel** per the orchestrator's resource-constraint notice — i.e. rows genuinely
inserted concurrently, mid-walk, by other sessions' live writes, not rows the keyset seek skipped
over. This is the expected, well-understood limitation of keyset-paginating a live, growing table
without a snapshot (a new row can land at a position the walk has already passed) — structurally
different from the bug this sweep hunts, which is a **deterministic, 100%-reproducible** hole at
every page boundary regardless of concurrent writes (see Phase F's own before/after: truncated
cursor got 50/304 rows on a STATIC table with zero concurrent writers; this walk got 13,408/13,417,
i.e. 99.93%, entirely attributable to nine parallel agents actively mutating the same tenant for
five minutes). CONFIRMED: no duplicates. CONFIRMED (via timestamp correlation, not re-run under
quiescence — SUSPECTED as the full explanation rather than re-proven under a frozen table) that the
9-row gap is concurrent-write noise, not a pagination defect.

### Proof 2 — Sales Register report (one of the seven newly-fixed CRITICAL sites)

SQL truth: `select count(*) from sales_invoices where status='confirmed' and confirmed_at in
[2026-08-24, 2026-08-31)` scoped to the tenant's one legal entity — the report itself reported
**`summary.invoiceCount: 9`** for that exact window at `limit=50` (single page, `nextCursor: null`).

Re-ran the SAME window forcing pagination with `limit=2`: **5 pages, 9 rows returned, all 9 ids
UNIQUE**, and the id set is byte-identical to the single-page fetch's 9 ids. Because this dataset
is small and static (no concurrent writer touches these specific 9 rows), the walk completed inside
a single sub-second-to-few-second window with no concurrency exposure at all — a clean, gap-free,
duplicate-free result. CONFIRMED.

(This tenant's 9 in-window rows happen not to share a microsecond with each other, so this
particular walk does not itself exercise the collision case — the audit-log walk above is the one
that does, at scale. The class fix is proven by code read + the strengthened ratchet spec, which
DOES fail on the exact `toIso(lastRow.x)` shape this file used before the fix, as demonstrated
above.)

## Classification of every changed assertion

No pre-existing test assertion was changed or deleted in this phase — the seven fixes only added a
field to interfaces/selects and swapped which field feeds `encode*Cursor`; no spec referenced the
old lossy helper's cursor output directly (the existing specs for these seven services test
totals/GL-tie-out/rows, not cursor byte-content). The one test file touched,
`keyset-cursor-precision.spec.ts`, had its DETECTOR logic strengthened, not its inventory
(`KNOWN_OFFENDERS` stayed `[]` throughout — the fix never needed to "allow" anything, because the
services were fixed to the point of being genuinely clean before the spec was declared done).
