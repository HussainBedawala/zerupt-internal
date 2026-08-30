# Phase F — keyset cursor microsecond sweep (2026-08-30)

Postgres `timestamptz` stores microseconds; a JS `Date` holds only milliseconds.
Building a cursor with `someDate.toISOString()` emits a position strictly SMALLER
than the row it came from (`03:53:28.645486` becomes `03:53:28.645`). The cure is
the existing `keysetTimestamp()` helper (`apps/api/src/common/keyset-timestamp.ts`,
re-exported from `reports/keyset-timestamp.ts`); no second implementation was written
and nothing was switched to offset pagination.

## Per-file findings

Every one of the 11 sites sorts DESC and seeks with `<`. With the cursor truncated
DOWNWARD, a sibling row sharing the millisecond is neither `<` the bound nor equal to
it, so it fails the predicate and is **silently dropped**. The direction matters: the
RPT-037 REPEATED-page variant needs ASC + `>`, and none of these 11 are that shape.
All 11 are real cursors — nothing withdrawn as a false positive.

| Service | Sort key / direction | Operator | Impact | Fixed |
|---|---|---|---|---|
| `cheques/cheques.service.ts` | (chequeDate, createdAt, id) DESC | row-value `<` | SKIPPED | yes |
| `close-management/close-run.service.ts` (+ `close-run-crud.service.ts`) | (startedAt, id) DESC | `lt` / `or`, now row-value `<` | SKIPPED | yes |
| `notifications/notifications.service.ts` | (createdAt, id) DESC | `lt` / `or`, now row-value `<` | SKIPPED | yes |
| `purchase/direct/export/direct-purchase-export.service.ts` | (invoiceDate, createdAt, id) DESC | row-value `<` | SKIPPED | yes |
| `purchase/grn/export/grn-export.service.ts` | (receiptDate, createdAt, id) DESC | row-value `<` | SKIPPED | yes |
| `purchase/invoices/export/bill-export.service.ts` | (invoiceDate, createdAt, id) DESC | row-value `<` | SKIPPED | yes |
| `purchase/landed-costs/export/landed-costs-export.service.ts` | (documentDate, createdAt, id) DESC | row-value `<` | SKIPPED | yes |
| `purchase/orders/export/purchase-orders-export.service.ts` | (orderDate, createdAt, id) DESC | row-value `<` | SKIPPED | yes |
| `purchase/payments/export/supplier-payment-export.service.ts` | (paymentDate, createdAt, id) DESC | row-value `<` | SKIPPED | yes |
| `purchase/returns/export/purchase-return-export.service.ts` | (returnDate, createdAt, id) DESC | row-value `<` | SKIPPED | yes |
| `sales/direct/export/direct-sale-export.service.ts` | (confirmedAt, id) DESC | row-value `<` | SKIPPED | yes |

Split: **11 SKIPPED, 0 REPEATED, 0 withdrawn.**

### Shape of the fix

- 8 exports + cheques + notifications: the query now also selects
  `cursorCreatedAt` / `cursorConfirmedAt` = `keysetTimestamp(col)` (microsecond ISO
  text straight out of Postgres) and the cursor carries THAT string. The `Date`
  column stays for display formatting, which needs no microseconds.
- `cheques` and `notifications` selected whole rows, so the extra column is added via
  `getTableColumns(...)` spread; cheques strips `cursorCreatedAt` before the rows
  leave `list()` so the API response shape is unchanged.
- `close-run`: the cursor type changed from `{ startedAt: Date }` to
  `{ startedAt: string }` and the crud seek moved from `lt`/`or` on a `Date` to a
  row-value `(startedAt, id) < (?::timestamptz, ?::uuid)`.
- Two decoders (`notifications`, `close-run`) no longer re-parse the cursor into a
  `Date` (that re-truncation would have undone the fix); they still validate
  parseability and reject a garbled value with `BadRequestException`.

## Live proof (gulf-auto-parts, purchase invoices)

`SELECT count(*) FROM purchase_invoices` = **304**. 296 of them share a millisecond
with a sibling, so the at-risk shape is present in real data.

The HTTP export batches at 1000 rows, so 304 rows fit in a single batch and the CSV
is complete in both builds (305 lines = header + 304, before and after — the endpoint
is a control, not the proof). The defect only fires at a batch boundary, so it was
reproduced against the same live table by walking the identical keyset predicate at
page size 50 with each cursor form:

| Cursor form | Rows walked before the walk reported exhaustion |
|---|---|
| truncated to milliseconds (`Date.toISOString()`) | **50 of 304 (16.4%)** |
| microsecond text (`keysetTimestamp()`) | **304 of 304 (100%)** |

The truncated walk returned an empty page 2 — an export that ends silently and short,
which is exactly the audit-log failure (1,120 of 13,161) in a file nobody can eyeball.

Post-change HTTP export: 200, 305 lines, byte-identical to the pre-change file.
Ledger gate `sum(debit - credit)` over posted+reversed lines: **0.000000** before and
after the rebuild/restart. No data was created.

## Tests

| Test | Classification |
|---|---|
| `purchase/invoices/export/bill-export.service.spec.ts` — NEW "carries FULL microsecond precision in the keyset cursor, not a truncated JS Date" | new; captures the WHERE handed to drizzle on the second batch and asserts it binds `...645486Z` and NOT `...645Z`. Verified to FAIL against the pre-fix line and pass after. Its `boundValues` walker recurses through arrays as well as objects on purpose — an object-only walker would find nothing here and the assertion could never fail. |
| same file — `billRow()` fixture `createdAt` `.000Z` → `.645Z` plus a `cursorCreatedAt` of `2026-04-01T10:00:00.645486Z` | (a) stale in shape, and a `.000Z` timestamp cannot exercise this bug |
| `notifications.service.spec.ts` — `NOW` gains real millis, new `NOW_MICROS` constant, fixture gains `cursorCreatedAt` | (a) stale in shape |
| `notifications.service.spec.ts` — three `decoded.createdAt.toISOString()` assertions | (b) actively asserted the old behaviour (cursor carries a `Date`); rewritten to assert the microsecond STRING survives the round trip |
| `notifications.service.spec.ts` — `encodeCursor(NOW, ...)` round-trip | (b) rewritten to pass microsecond text |
| `close-run-pagination.spec.ts` — `makeRun` gains `cursorStartedAt` via a `microsOf()` helper | (a) stale in shape |
| `close-run-pagination.spec.ts` — `cursor: { startedAt: t2, id: "b" }` | (b) actively asserted the buggy bound (a JS `Date`); rewritten to expect `microsOf(t2)` |

No snapshot was regenerated. Nothing was deleted as "now meaningless".

## Allowlist

`apps/api/src/audit/keyset-cursor-precision.spec.ts`: `KNOWN_OFFENDERS` is now `[]`.
The spec itself is untouched otherwise — including the "actually scanned something"
assertion (`> 20` files scanned), which stays as the guard against a silently-empty
scan. The `alreadyFixed` half of the ratchet now keeps the list empty: adding a line
back for a clean site fails the suite.

## Status

- `pnpm --filter @zerupt/api typecheck` — clean.
- `npx jest keyset-cursor-precision notifications.service close-run cheques.service` — 7 suites, 180 tests, pass.
- `npx jest export` — 18 suites, 220 tests, pass.
- `npx jest bill-export` — 1 suite, 18 tests, pass.
