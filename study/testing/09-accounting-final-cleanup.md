# Phase F — Accounting final cleanup (2026-08-30)

Ledger gate (status-aware) checked before and after all writes: `0.000000` both times.
No writes were made to `journal_entry_lines` or `journal_entries` (the one backfill attempt
was rolled back inside a transaction — see item 5). No ZZTEST documents were created this
session (all fixes were code/schema, no new transactions needed to reproduce).

## 1. ACC-ARAP-004 — raw UUID in duplicate-allocation error — CONFIRMED, FIXED

Confirmed live in code: `supplier-payments.service.ts`'s advance-application duplicate-allocation
check threw `Bill ${alloc.purchaseInvoiceId} is already allocated by this advance` (raw UUID),
while its sibling over-allocation error already used `bill.number`.

**Sweep found far more than the one reported site** — the same `alloc.purchaseInvoiceId` /
`a.sourceDocumentId` leak was hand-copied across every bill/invoice validation branch in both
the AP (`supplier-payments.service.ts`) and AR (`receipt-vouchers.service.ts`) allocation paths:
not-found, wrong-supplier/customer, not-confirmed, over-allocation, currency-mismatch, and the
duplicate-allocation check itself — in both the standalone and the `*Composed` (orchestrator-
internal) variant of each method.

**Fixed at every site**, in both files:
- `apps/api/src/purchase/payments/supplier-payments.service.ts` — `createStandard`,
  `createStandardComposed`, `post` (2 near-identical copies), and the advance-apply method:
  added `number` to every `bill` select/query, replaced `alloc.purchaseInvoiceId` with
  `bill.number` in all "belongs to a different supplier" / "is not confirmed" / "exceeds
  outstanding balance" / currency-mismatch (`assertBillCurrencyPayable`) messages, and moved
  the duplicate-allocation check to AFTER the bill row is locked so it can report
  `Bill ${bill.number} is already allocated by this advance`. "Not found" messages now say
  "The selected bill could not be found" (no id to resolve to a number yet).
- `apps/api/src/sales/receipts/receipt-vouchers.service.ts` — `create`, `createComposed`,
  and both `post`/post-composed methods: fetched invoice `number` alongside id/customerId/status,
  reordered the duplicate-check to run after invoice resolution, and replaced every
  `a.sourceDocumentId` / `alloc.sourceDocumentId` in a thrown message with `inv.number` /
  `invoice.number`.

**Sweep counts:** 2 files, 6 distinct methods, ~14 individual error-message sites fixed (up
from the 1 reported).

**Noted but NOT fixed (out of scope for ARAP, flagged for a future COA pass):**
`apps/api/src/journal-entries/account-mapping-crud.service.ts` throws `Account ${accountId}
belongs to a different legal entity` / `... cannot map to a control account (${accountId})`
with a raw account UUID. Different subsystem (account-mapping validation, not AP/AR
allocation) — left alone to keep this fix scoped.

Typecheck clean (`pnpm --filter @zerupt/api typecheck`) after all changes.

## 2. ACC-COA-006 — raw Zod enum dump — CONFIRMED (already fixed by a concurrent session), WITHDRAWN as an open item

Reproduced the exact founder repro against the live API:
```
T=$(bash study/testing/_tools/tok.sh accountant1)
curl -s -H "Authorization: Bearer $T" -H "x-tenant-slug: gulf-auto-parts" \
  -H "x-branch-id: 43df4c2e-ec1b-4dc7-8f0d-d35a250c15e6" \
  "http://localhost:3001/api/v1/tenant/account-mappings?legalEntityId=d67ece83-e21c-4ae4-ad46-c9356d7f0f06&eventType=cheque"
→ {"code":"validation_error","message":"Request validation failed",
   "details":{"errors":[],"properties":{"eventType":{"errors":["Invalid value for \"eventType\"."]}}}}
```
No enum dump — plain language. Also reproduced the bulk-account-create sibling (`POST
/tenant/accounts/bulk` with `type: "bogus"`) — same plain "Invalid value for..." shape, no
dump. Both endpoints go through the shared `apps/api/src/common/zod-validation.pipe.ts`
(confirmed by controller inspection), which already has the fix: `plainLanguageMessage()`
detects the `"Invalid option: expected one of"` Zod prefix and replaces it with `Invalid
value for "<field>".` — exactly the single-primitive fix the addendum asked for.

`git diff --stat` shows this file has an uncommitted 65-line addition already in the shared
tree (not committed by me) — a concurrent session in this same testing programme evidently
closed this one before I started. **No code change made; withdrawn as already resolved.**

## 3. Refusal codes — period / close / opening-balance / reverse / amend — PARTIALLY SWEPT (bounded, documented)

Opening-balance already had a full `OPENING_BALANCE_ERROR_CODES` system (confirmed by
inspection — nothing to do there). The soft-lock family already had a shared coded helper
(`softLockOverrideRequiredError`, code `PERIOD_SOFT_LOCK_OVERRIDE_REQUIRED`) but it was NOT
used everywhere. Given the size of the surface (fiscal-period.service.ts alone has 30+ raw
`ConflictException`/`ForbiddenException` throws), this pass is a bounded, high-leverage sweep,
not exhaustive — documented honestly rather than claimed complete.

**New shared primitive:** `apps/api/src/fiscal-period/hard-lock-error.ts` — `hardLockError(periodLabel, verb)`,
code `PERIOD_HARD_LOCKED` (reuses the exact code string the web client already branches on for
journal-entry post/reverse/manual-entry flows — `apps/web/src/features/journal-entries/**`).
Companion to the existing soft-lock helper.

**Fixed (used the new/existing shared helpers or added `Coded*Exception` + a stable code):**
- `apps/api/src/common/amend/amend-saga-runner.service.ts` Gate 2 (the ONE fiscal-period gate
  every amend flow across sales/purchase/POS/inventory goes through) — hard-lock and soft-lock
  refusals now use `hardLockError` / `softLockOverrideRequiredError` instead of hand-rolled
  English-only `UnprocessableEntityException` strings with `code: null`. Single fix, propagates
  to every amend adapter.
- `apps/api/src/journal-entries/journal-reversal.service.ts` — 4 refusals coded:
  `REVERSE_NO_LINES`, `REVERSE_NOT_POSTED`, `REVERSE_OF_REVERSAL`, `REVERSE_ALREADY_REVERSED`.
  Also fixed 2 raw-UUID leaks in the same block (`entry.entryNumber` instead of `entryId`).
  (Period-gate refusals in this file already had codes via `toReverseException` /
  `PERIOD_SOFT_LOCKED_NEEDS_REASON` — untouched, already correct.)
- `apps/api/src/close-management/close-run.service.ts` — 8 task-state refusals coded:
  `CLOSE_TASK_ALREADY_COMPLETE`, `CLOSE_TASK_SKIPPED`, `CLOSE_TASK_WRONG_REVIEWER`,
  `CLOSE_TASK_NOT_READY_FOR_REVIEW`, `CLOSE_TASK_ALREADY_REVIEWED`,
  `CLOSE_TASK_SELF_REVIEW_BLOCKED`, `CLOSE_TASK_ALREADY_SKIPPED`,
  `CLOSE_TASK_NOT_COMPLETE_OR_SKIPPED`.
- `apps/api/src/close-management/close-run-crud.service.ts` — 2 more coded:
  `CLOSE_JE_WRONG_ENTITY` (also removed a raw journal-entry-id from the message),
  `CLOSE_TASK_STALE_VERSION` (optimistic-concurrency race).
- `apps/api/src/fiscal-period/fiscal-period.service.ts` — the 5 most central fiscal-year
  close/reopen refusals coded: `FISCAL_YEAR_ALREADY_CLOSED` (×2 sites),
  `FISCAL_YEAR_NOT_CLOSED` (×2 sites), `FISCAL_YEAR_NO_PERIODS` (also dropped a raw
  fiscal-year-id from that message).

**NOT swept (explicitly out of scope for this pass, left as English-only `code: null`):**
the remaining ~25 `ConflictException`/`ForbiddenException` throws in `fiscal-period.service.ts`
(period-lock/unlock, fiscal-settings edits, override-approval refusals) and the auto-post
period-lock refusals in `journal-posting.service.ts` (lines ~460/473 — an internal event-driven
posting path, not a direct user action; also leaks a raw `periodId`). These are real remaining
work, not silently dropped — flagged here for the next pass.

**i18n:** no new frontend translation keys were added (server messages stay English-only
plain-language strings, same convention every other `Coded*Exception` in this codebase already
uses — the web client's generic error-toast renders `body.message` when it has no
code-specific handler, per `apps/web/src/lib/api-client.ts`'s `extractErrorCode`). Full
ar-translated copy for these NEW codes (a dedicated `t("...")` mapping per code, the pattern
`PERIOD_HARD_LOCKED` already has on the journal-entries screens) is a frontend follow-up, not
done here. `pnpm --filter @zerupt/web i18n:check` passes (no new keys referenced, so nothing to
desync).

## 4. FX provider — exchangerate.host → Frankfurter — CONFIRMED HIGH (latent), FIXED

Confirmed live: `curl "https://api.exchangerate.host/2026-08-29?base=KWD&symbols=AED"` →
`{"success":false,"error":{"code":101,"type":"missing_access_key"}}`. The service would fail
loud for every tenant the instant `EXCHANGE_RATE_AUTO_FETCH_ENABLED` flips on.

**Switched to Frankfurter** (`apps/api/src/exchange-rates/exchange-rate-fetch.service.ts`):
- `SUPPORTED_PROVIDER` is now `"frankfurter"`; `UnsupportedProviderError` unchanged (still the
  fail-loud seam for a future keyed provider).
- Same SSRF input validation preserved verbatim (`CURRENCY_RE`, `DATE_RE`).
- **New: `UnsupportedCurrencyError`.** Frankfurter's ECB feed publishes only ~30 major
  currencies (`GET https://api.frankfurter.app/currencies`, checked live: 30 entries, verified
  with `curl`). A hardcoded `FRANKFURTER_CURRENCIES` set is checked BEFORE the network call, so
  the rejection names the exact unsupported currency — Frankfurter itself returns an
  undifferentiated `404 {"message":"not found"}` for either a bad base or a bad symbol, which
  is not actionable. Also re-checked AFTER a successful fetch (every requested quote currency
  must actually appear in the response `rates` object), because a holiday/skipped-date response
  can omit a currency without erroring the request.

**Worse than the task assumed — escalating the finding, not just KWD:** live-verified that
Frankfurter/ECB does not publish **any** Gulf currency — not only KWD, but AED, SAR, QAR, OMR
and BHD are **all absent** from the 30-currency set (`curl -sL
"https://api.frankfurter.app/currencies"` — AUD, BRL, CAD, CHF, CNY, CZK, DKK, EUR, GBP, HKD,
HUF, IDR, ILS, INR, ISK, JPY, KRW, MXN, MYR, NOK, NZD, PHP, PLN, RON, SEK, SGD, THB, TRY, USD,
ZAR). Zerupt's entire GCC market — its primary launch region — is unserved by this provider,
not just the Kuwait launch customer. This is documented prominently in the file header and the
`exchangeRateSource` enum comment (see below), and is exactly the "validate against the
worst-case country" rule: KWD (0% ECB coverage) rather than, say, INR (fully covered).

**KWD fail-loud test result** (`apps/api/src/exchange-rates/exchange-rate-fetch.service.spec.ts`,
2 new tests, both pass):
- KWD as a **quote** currency (`baseCurrency: "USD", quoteCurrencies: ["KWD"]`) → rejects with
  `UnsupportedCurrencyError`, `.currency === "KWD"`, zero network calls, zero rows stored.
- KWD as the **base** currency (`baseCurrency: "KWD", quoteCurrencies: ["USD"]`) → same result —
  the base is checked too, not only the quote list.

Full spec run: `npx jest exchange-rate-fetch.service --no-coverage` → 5/5 pass (rewrote the 2
pre-existing tests that used AED as a quote currency — now ECB-unsupported under the new
provider — to use EUR; classified as **stale in shape only**, same assertions, different fixture
currency and response envelope shape since Frankfurter's response has no `success` field).
`npx jest exchange-rate-auto-fetch.scheduler --no-coverage` → 6/6 pass after updating one stale
assertion that hardcoded the old default provider string `"exchangerate.host"` to `"frankfurter"`
(same case — **stale in shape only**, the scheduler's own logic under test is unchanged).

**Honest documentation (task item 4b):**
- `packages/db/src/schema/enums.ts` — `exchangeRateSource` enum now carries a block comment:
  `auto_fetched` is wired end-to-end but exposed in NO tenant-facing UI as of 2026-08-30, gated
  behind `EXCHANGE_RATE_AUTO_FETCH_ENABLED` (default off), and the only keyless provider cannot
  serve a GCC tenant at all — deliberate, not an oversight, deferred until a real multi-currency
  customer exists.
- `exchange-rate-fetch.service.ts` file header carries the full provider-swap history and the
  GCC-coverage-gap warning.
- `packages/db/src/schema/currency.ts` — updated the stale `exchangerate.host` example in the
  `exchangeRateProvider` column comment to `frankfurter`.

No override UX, bulk rate import, or new UI built (per the explicit instruction) — code-only.
Also fixed one pre-existing cosmetic bug while in this file: two import statements on the same
line with no separating newline in `exchange-rate-auto-fetch.scheduler.ts`.

## 5. The 17 (actually 20) historical NULL due-date rows — RULING: NOT backfillable via migration; DEFINITIVE

**Re-ran the query fresh** (status-aware, tenant `gulf-auto-parts`, control accounts 1131/2111,
posted+reversed only): **20 rows today**, not 17 — 3 more accumulated between when the task was
scoped and now (ongoing test activity in this shared tree; all 3 new rows are dated
2026-08-30, today). None are the 4 protected opening-balance journals (all entry numbers are
`B1ALRAIMAINS-JRN-*`).

**First finding: 4 of the 20 are not settlement legs at all.** They are `fx.unrealized_revaluation`
/ `fx.unrealized_revaluation.reversal` auto-JEs (entry numbers JRN-00087/00105/00106/00107,
`source_document_type IS NULL`). A revaluation entry marks a party's open AR/AP balance to
market at a point in time — it does not settle a specific invoice/bill, so "which document's
due date" is not a meaningful question for these rows. **Ruling: these are out of scope for
due-date backfill entirely** — a revaluation leg should never carry a specific-document due
date, and the aging report should exclude/handle them by their own event type, not by
falling back to oldest-first. (Confirming the aging report already does this correctly, or
fixing it if not, is a separate follow-up — not investigated further here.)

**Of the remaining 16 true settlement/reversal legs, 15 have a fully deterministic 1:1 join
back to their original document** (verified against live data, one-by-one):
- 7 `rv` (AR receipt settlement) rows — each receipt voucher has **exactly one**
  `sales_payment_allocations` row, so `journal_entries.source_document_id →
  sales_payment_allocations.receipt_voucher_id → sales_invoices.due_date` is unambiguous.
- 4 `pay` (AP payment settlement) rows — same pattern via `supplier_payment_allocations`,
  each payment has exactly one allocation.
- 1 `inv` (invoice void reversal) — `source_document_id` IS the invoice id directly.
- 1 `cn` (credit note reversal) — `source_document_id` → `sales_credit_notes.invoice_id` →
  the original invoice's due date.
- 1 `pinv` (bill void reversal) — `source_document_id` IS the bill id directly.
- 1 `prn` (purchase return) — `source_document_id` → `purchase_returns.bill_id` (NOT NULL
  for this one) → the bill's due date.

**1 row is genuinely NOT derivable:** the other `prn` row
(`purchase_returns.id = '0ccefa5f-b1b0-42af-b10b-6d117bf15164'`) has `bill_id IS NULL` — this
return was never linked to a specific bill at creation, and nothing else on the JE line or the
return record identifies which bill it reduced. This one row's original due date is genuinely
lost, not merely unresolved by a smarter query.

**But the 15 derivable rows are STILL NOT backfillable via a migration, and I am not writing
one.** Live-tested (transaction rolled back, no data changed): a plain `UPDATE
journal_entry_lines SET due_date = ...` on a posted-journal line is rejected outright by the
database's own immutability trigger,
`prevent_posted_journal_line_mutation()` — `ERROR: Cannot UPDATE journal_entry_lines for a
posted journal entry`, unconditionally, with **no column exemption** (it does not distinguish
a metadata column like `due_date` from a monetary one). This is a stronger, more fundamental
invariant than the backfill's benefit: this trigger is exactly what makes "posted means
immutable" a database-enforced guarantee rather than an app-layer convention trusted by
every reconciliation and audit process in the system. Writing a migration that disables or
works around this trigger — even scoped to one non-monetary column, even temporarily — would
be the first precedent for mutating a posted ledger line, and the accounting addendum's
standing rule ("never a hand-written correcting entry; void + re-raise through the product") is
a specific case of that same general principle.

**Definitive ruling: the data is derivable, but the ledger will never be backfilled to hold
it, by design.** No migration was written (a draft was tested and then removed — see below).

**What the aging report should do instead (recommendation, not implemented — flagged as a
follow-up, out of budget for this pass):** move the resolution from write-time backfill to
READ-time derivation in the AP/AR aging query itself. For a settlement/reversal leg
(`source_document_type` in `rv`/`pay`/`inv`/`cn`/`pinv`/`prn`) whose stored `due_date IS NULL`,
the aging report can `COALESCE` the same deterministic joins documented above (invoice/bill
directly, or through the single allocation row, or through the credit-note/return's FK) at
query time — this requires no ledger mutation, works retroactively for exactly these 15 rows,
and would also self-heal any future row of the same shape without another migration. Only the
1 genuinely unattributable `prn` row (and the 4 revaluation rows, by their own separate rule)
should fall through to the existing oldest-first bucketing — and even then, the report should
flag such a row distinctly (e.g. an "unknown due date" badge) rather than silently presenting
it as if it were dated, so a reviewer knows to treat that one bucket assignment as an estimate.
Building this read-time COALESCE and the UI flag is new work, explicitly not done here.

**Housekeeping:** a draft migration (`0317_backfill-arap-due-dates.sql`) was generated via
`npx drizzle-kit generate --custom`, tested inside a rolled-back transaction against the live
`gulf-auto-parts` tenant DB (confirmed via `DIRECT_URL_TENANT` vs. the actual tenant connection
string — they are DIFFERENT databases, `zerupt_tenant_dev` vs.
`zerupt_tenant_gulf_auto_parts_mt5kya1i`, so the file-header's `DIRECT_URL_TENANT` warning was
itself reconfirmed as correct and I tested directly against the real tenant DB instead), hit
the immutability trigger, and was then fully removed (the `.sql` file, its `meta/*_snapshot.json`,
and its `meta/_journal.json` entry) rather than committed in a broken or bypassed state. The
journal was restored by removing exactly the one entry `drizzle-kit` had appended (not
hand-retyped) — verified as valid JSON and diff-clean against the pre-existing uncommitted
0309–0316 entries from concurrent sessions in this shared tree.

## Ledger gate

Before: `0.000000` (status-aware, `posted`+`reversed`). After: `0.000000`. No writes landed on
`journal_entries` / `journal_entry_lines`.

## Verification

- `pnpm --filter @zerupt/api typecheck` — clean.
- `pnpm --filter @zerupt/web typecheck` — **1 pre-existing failure**, unrelated to this session:
  `src/features/purchase/components/direct/__tests__/direct-purchase-form-fields-currency.test.tsx(82,52)`
  references a renamed variable (`isMultiCurrencyEnabled` vs. `multiCurrencyEnabled`) — a
  concurrent session's in-flight purchase-currency work in this shared tree (no file under
  `exchange-rates/`, `fiscal-period/`, `close-management/`, `journal-entries/`, `purchase/payments/`,
  or `sales/receipts/` that I touched). Confirmed unrelated by `git diff --stat` (I made no web
  changes at all this session).
- `pnpm --filter @zerupt/web i18n:check` — passes ("Translation check passed. All locales are
  in sync.").
- `npx jest exchange-rate-fetch.service --no-coverage` — 5/5 pass.
- `npx jest exchange-rate-auto-fetch.scheduler --no-coverage` — 6/6 pass.
