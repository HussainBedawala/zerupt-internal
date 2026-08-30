# Phase G - Reports: final close-out (2026-08-29/30)

Second half of phase G, run under an explicit founder instruction: **close every finding, close
every verification gap, and leave nothing recorded as "deliberately left" or "open"**. Anything that
could not be a code fix had to end as VERIFIED-CORRECT-BY-DESIGN with evidence, not as a deferral.

Nothing committed, nothing stashed - explicit founder requirement. The tree carries the full
uncommitted diff.

## Method in this half

The first half was code + SQL. This half added the two things that half could not do:
**live browser verification** (English and Arabic, all 45 reports) and **live API verification by
authenticated curl** (export bytes and forced pagination). Both found defects that code review had
missed entirely, which is the main lesson of the phase.

## Infrastructure findings (found while unblocking the work)

| ID | Sev | Summary |
|---|---|---|
| ENV-001 | HIGH | The Next dev server had a **38 GB `.next` cache**. It was listening but effectively not serving: 98s cache writes, 30-40s compaction cycles, 10-17s route compiles, and a 25-minute hang on a single route. Cleared (38G -> 28M) and restarted; warm loads went to **0.65s**. This is a strong candidate explanation for the never-investigated **PERF-002** (1.9s curl vs 5.1s browser, ~3s unexplained in the Next/client layer) and for why two prior sessions each managed only ~5 screens before blocking on "browse daemon instability" |
| ENV-002 | HIGH | The running API was serving **stale compiled code** (dist built 2026-08-28, process started 2026-08-29) - it lacked the RPT-026 POS leg and RPT-023's deliveryFeeNet. Any verification run before the rebuild would have been meaningless. Caught by grepping the compiled SERVICE bundle, not `dist/main.js`. Rebuilt and restarted; freshness re-verified by symbol |
| ENV-003 | MED | Intermittent 500s on report routes traced to **Neon connection timeouts** (`Connection terminated due to connection timeout`), not logic. API relaunched with `--network-family-autoselection-attempt-timeout=2000` (the documented Node/Neon Happy Eyeballs fix). The frontend crash it exposed was a real defect and was fixed separately as RPT-049 |

## Findings closed in this half

| ID | Sev | Summary | Status |
|---|---|---|---|
| RPT-027 | MED | 5th instance of the permission-gated-lookup class: `purchases-by-item` supplier picker called the permissioned `GET /suppliers` with no fallback, while `/suppliers/directory` already existed. Wired to the fallback. **No permission widened** | FIXED |
| RPT-028 | MED | `parts-sales-by-brand` hardcoded `"UTC"` day bounds while `sales-by-item` used tenant time. Sweep found 2 more (`parts-stock-velocity`, `gross-margin`). The gross-margin one **also repaired its own glTieOut**: the GL leg filters `posting_date`, stamped from the tenant-local fiscal day, so a UTC-bounded document leg was reconciled against a locally-bounded ledger leg. Zero hardcoded UTC day zones remain | FIXED |
| RPT-028b | HIGH | **Root cause behind the whole timezone family**: `localMidnightToUtc` in `tenant-timezone.ts` was system-`TZ` dependent - it round-tripped via `new Date(instant.toLocaleString(...))`, which parses in the SYSTEM zone, so on a machine already set to Asia/Kuwait the computed drift collapsed to zero and every boundary silently fell back to the UTC day. Production runs UTC so it never hit a merchant, but it made these divergences untestable anywhere else. Now reads wall-clock via `Intl` parts | FIXED |
| RPT-029 | MED | `bill-export.service.ts` computed `daysOverdue` from UTC today. Migrated onto `resolveReportAsOf`, threading `today` once per export - which also fixed a second unnamed bug: a long export could straddle midnight mid-stream and emit inconsistent figures across batches | FIXED |
| RPT-030 | LOW-MED | The ~12 remaining "today from UTC" business-date defaults, **classified individually**: 13 genuine bugs changed, 5 correct-by-design left alone. Two deserve naming: the **exchange-rate backdate policy gate** was security-adjacent (for ~3h daily a genuinely backdated rate compared against a stale UTC "today" and slipped through as current - a bypassable control), and the **auto-fetch scheduler** was split correctly (its 02:00Z cadence is legitimately UTC; the `rateDate` it STAMPS is a business date, and they coincide only because 02:00Z is the same calendar day in every UTC+ zone). `promo-engine.ts` was fixed by DESIGN - `onDate` is now required, because a shared package with no DB can never know the zone, and it was silently disagreeing with its own caller. A 14th site was found that the sweep never named | FIXED |
| RPT-031 | LOW | No server-side future-date guard on the aging as-of. Turned out to be **7 reports, not 2**. Extracted Trial Balance's private `assertNotFutureDated` into the shared helper and closed all of them - and found the guard sat INSIDE the caller's try/catch in two services, so a 400 was being swallowed into a 500 | FIXED |
| RPT-032 | LOW | Statement PDF export was a page-only DOM snapshot, so a multi-page statement exported incomplete. Both statements now render the full export payload into an off-screen surface, following the low-stock/fitment-coverage pattern | FIXED |
| RPT-033 | LOW | A 403 rendered identically to a 500, with a Retry button that could never succeed. Lifted z-report-history's graceful degrade into the shared `ErrorState`. Wired across the report components; the 4 nested vat201/drawer components were **classified, not mechanically wired** - none pairs a 403 with a dead-end Retry, so there was nothing to fix | FIXED |
| RPT-034 | MED | POS shift `netSales` was not net (245.038 with a 29.291 return sitting un-deducted). Closed by **renaming, not netting** - a per-shift net-of-returns is incoherent because a return posts to the OPEN shift while its original sale may be in a closed one, so netting would subtract one shift's refund from another's revenue. The cashier is not deprived: cash reconciliation is computed separately from `pos_payments` and does subtract refunds. Guard asserts `not.toHaveProperty("netSales")`. Also fixed a latent void double-deduct on the offline path | FIXED |
| RPT-035 | LOW | Stock Levels showed money with no currency anywhere. Sweep found the caption missing on **20 reports**, not 3. Five were deliberately left (per-row multi-currency, self-labelling) and vat201 is exempt (regulatory fixed AED) | FIXED |
| RPT-036 | **HIGH** | **Dead Stock reported the truncated subtotal as if it were the total.** The page read the export endpoint, which carried no `bucketSummary`, so the frontend derived bucket totals from `data.rows` - capped at 10,000. True population verified by my own SQL: **11,227 items**, not 10,000. Understated dead stock by 1,227 items and ~56,000 KWD. Both the export and paginated paths now aggregate the full set while the row list stays capped, with honest banner copy. I had rated this INFORMATIONAL/SUSPECTED and told the agent withdrawal was acceptable; it checked in SQL first and found a real bug | FIXED |
| RPT-037 | **CRITICAL** | **Keyset pagination could never advance past page 1 on any bulk-seeded ledger.** Postgres `timestamptz` holds MICROSECONDS, a JS `Date` only milliseconds; the cursor re-serialised via `.toISOString()` pointed at a value strictly LESS than the row it came from, so the row-tuple comparison resolved "greater" on the timestamp element for every tied row and **the `id` tiebreaker was never reached**. I verified the trap myself: **316 of this tenant's 332 AR lines share the identical stamp `2026-08-24T03:53:28.645486Z`**. Page 2 was page 1 forever, with the running balance folding forward each click. Invisible in hand-written fixtures, breaks on real imported/seeded ledgers. Existed in **5 services**; in `stock-movement-ledger` the truncation ran the other way on a `<` comparison and would silently SKIP boundary rows. Fixed as a class via one `keysetTimestamp()` helper selecting microsecond ISO text straight from Postgres. **My own prime suspect (the `keepPreviousData` removal) was ruled out with evidence** | FIXED + LIVE-VERIFIED |
| RPT-038 | **CRITICAL** | Goods Received was broken two ways: no default date range (first request omitted both bounds -> 400 -> a Retry that replayed it forever), and zero rows even when filtered. The second cause was **not the query**: `pendingBillOnly: z.coerce.boolean()` applies JS truthiness to the RAW QUERY STRING, so the `"false"` the client sends became `true`. Verified: 6 confirmed GRNs, 0 with an unbilled quantity, so a permanently-on filter removed every row | FIXED |
| RPT-039 | HIGH | Daily Sales and Top Sellers rendered money at 2dp (`409.14`) while their CSV held the true 3dp (`409.138`) - both fetched `useTenantCurrency()` for the export only and never threaded it into the on-screen cells. Third recurrence of the POS-001/POS-022 shape | FIXED |
| RPT-040 | HIGH | The literal string `reports.dailySales.col.paymentBreakdown` rendered as a column header, on screen and in the CSV. **The key was missing from BOTH locales - which is why `i18n:check` passed**: it verifies en/ar PARITY, so a key absent from both is in perfect parity. This is the ROLE-003 blind spot recurring. Closed with copy plus a guard that resolves all 1,373 referenced report keys in both locales | FIXED |
| RPT-041 | HIGH | Sales Returns displayed a credit note twice, byte-identical, with the tie-out badge still green. **Not the cursor bug I hypothesised** - a credit note has TWO journal entries under `sourceDocumentType='cn'` (AR/revenue confirm + a separate COGS JE), and the AR-account predicate sat on the second left join, so it nulled the extra row's GL columns instead of pruning it. Collapsed into one grouped subquery, making fan-out impossible by construction | FIXED |
| RPT-042 | HIGH | `z.coerce.boolean()` on a query-string param, the class behind RPT-038. Ten more sites outside reports; **3 were live user-visible bugs**: the Price Lists "Inactive" filter returned ACTIVE lists, and the GRN "Unbilled receipts" filter returned BILLED receipts (list AND CSV export). Five latent sites also fixed with `.optional()` vs `.default(false)` semantics preserved per site. Helpers moved to `common/` so `inventory/` need not import from `reports/` (dependency direction). Source-level ban now **API-wide**, red/green proven | FIXED |
| RPT-043 | MED | GL account picker showed Arabic in the dropdown but English in the selected chip. Fixed at the divergence: the picker now owns its chip label. **11 call sites** resolved - 4 genuinely redundant `displayValue` props deleted, the rest localised. Two were more than cosmetic: `bill-expense-line-form` and `bill-create-line-editor` feed the label into the submitted line `description`, so wrong-language PAYLOAD data was being sent to the server | FIXED |
| RPT-044 | MED | Day Book account names and statement descriptions were English-only while P&L/Balance Sheet rendered the same accounts bilingually. Frontend gap closed via a shared `BilingualDescription` | FIXED |
| RPT-044b | MED | The data half: automated posting listeners wrote English literals with no `descriptionAlt`. Turned out to be **~200 sites across 16 files**, including two families a listener-only sweep would have missed (`year-end-closing`, `inventory-reconciliation`). Closed with a keyed constant map whose `LineText` type spreads onto a line so **a call site cannot supply one language without the other**. Interpolation handled explicitly (trailing `phrase: value`, safe in both scripts) with a bilingual tender mapper, so Arabic never ends in an English enum slug. **No historical backfill** - existing rows keep their null alt and fall back to English, which is correct for an immutable ledger | FIXED |
| RPT-045 | LOW | Eastern Arabic-Indic digits in aging bucket headers above Western-digit data. Fixed across 4 ar message files with per-string judgement (3 prose strings correctly left). Guard scoped to numeric-data label keys | FIXED |
| RPT-045b | MED | The print/POS review found a **real defect**: the POS **Z-report printed Eastern-digit dates next to Western-digit totals on the same document**, because `formatDate` does not default to `latn` while the money formatters force it. Five adjacent POS surfaces had the same bug. The print stack and POS receipts were VERIFIED-CORRECT-BY-DESIGN with the code path cited; `dashboard/lib/format-date.ts` was already correct and is now pinned by a test | FIXED |
| RPT-046 | LOW | Raw `asset` enum rendered as a pill in the account dropdown; translations already existed | FIXED |
| RPT-047 | MED | Journal line descriptions interpolated a raw item UUID (`COGS: <uuid>`). **The agent argued against my brief and was right**: adding the name to the event PAYLOAD would leak the UUID back on every replayed outbox row. Instead each listener resolves the name inside the same transaction that writes the ledger - version-free by construction. `withRef` now sanitizes a UUID-shaped ref at the chokepoint all ~40 posting sites pass through. Degrades prose, never refuses to post | FIXED |
| RPT-048 | LOW | Em dashes in ledger-bound header descriptions. Sweep found 4 more sites, including the highest-volume generator by far: `import-apply.service.ts` wrote `Opening balance - <party>`, accounting for **614 of the 624 em-dashed rows in the DB** | FIXED |
| RPT-049 | HIGH | Dead Stock crashed into the error boundary on a transient 500. The existing guard checked `data` but not `data.bucketSummary`, so a settled 200 missing that field still threw - a shape `ReportShell`'s state machine cannot catch, since `isEmpty` only reads `rows.length`. Swept the other 53 report components; no further crash sites | FIXED |
| RPT-050 | LOW | Currency caption rollout gap on 3 purchase reports; sweep found 20 | FIXED (folded into RPT-035) |
| RPT-051 | LOW | Remaining em-dash placeholders across the web app, including the private `EM_DASH` in `features/dashboard/lib/constants.ts` - the exact private-constant pattern the shared placeholder's doc comment says caused the last regression | FIXED |
| F1 | HIGH | `stock-movement-ledger/export` took **33s against a 20s statement timeout**, with a 50,000-row cap set 2.5x above a row count that already exceeded the limit - so it failed routinely under any concurrency and surfaced as an opaque 500 | FIXED |
| F2 | MED | Goods Received leaked `DP-<uuid>` internal placeholder PO numbers into the CSV - affecting every direct purchase (3 of 8 POs here). `open-purchase-orders` already excluded these as "internal plumbing POs the user never created" | FIXED |
| F3 | MED | Parts Stock Velocity wrote a locale-formatted date into a CSV cell - in `ar`, Arabic-Indic digits and month names, not machine-parseable. The only export of 46 doing this | FIXED |
| F4 | LOW | Em dashes in **5** Arabic chart-of-accounts seed names (not 3) - including Retained Earnings 3200/3300, which appear on every Arabic tenant's Balance Sheet. Closed across three layers: constant, spec (explicitly a copy change, not a bent test), and a generated idempotent migration matching on code AND exact old string so a customised name is never clobbered | FIXED |
| F5 | LOW | `ENTITY_MAP_FALLBACK` was an em dash reaching CSV cells. Per-column analysis confirmed all four consumers feed NAME columns, never numeric, so the placeholder is correct in every cell it reaches | FIXED |

## Data gaps closed by manufacturing the missing rows

The tenant lacked the rows needed to prove several fixes, so they were created as ZZTEST documents
(logged in `_documents-created.md`), and each fix re-verified against real data:

| gap | before | after | result |
|---|---|---|---|
| voided POS transactions | 0 | 1 | RPT-019 LIVE-CONFIRMED: 774.071 -> 810.875 -> back to 774.071; buggy code would have landed at 737.267 |
| mirror invoices | 0 | 1 | RPT-026 double-count guard LIVE-CONFIRMED: invoice leg 1,252.909 unguarded vs 1,119.641 guarded, delta exactly 133.268 |
| invoices with a delivery fee | 0 | 1 | RPT-023 LIVE-CONFIRMED: salesperson gross moved 57.916, not 67.916 |
| distinct exchange rates | 1 | 2 | FX cluster LIVE-CONFIRMED: AED 1000 @ 0.0835 added 83.500, not 1024.690 |

## Verification gaps closed

- **Browser, English**: all 45 reports. Confirmed live: the tax-summary/vat201 Kuwait redirect, RPT-011's
  export stamping the DATA's date, RPT-014's full-range fitment export.
- **Browser, Arabic (RTL)**: all 45 reports. RPT-002's breadcrumb fix confirmed on 17+ reports. Bidi
  verified on document numbers and mixed Arabic/Latin names. Layout mirrored correctly throughout.
- **Export bytes**: all 30 server export routes exercised by authenticated curl, 29 returning 200 with
  non-empty content, values tied to SQL on GL, day-book, purchase-register, sales-register, AR/AP aging
  and pos-sales-summary. **Structural correction to the original premise: there is no server-side CSV
  endpoint** - all 46 CSVs are assembled client-side and the `/export` routes return JSON - so the JSON
  was verified by curl plus a line-by-line audit of all 46 `handleExport` handlers.
- **Pagination, live**: a full **14-page GL walk at limit 25** returned all 332 rows, every id disjoint,
  matching SQL exactly, with the running balance continuous across every boundary and ending at
  588,080.041 = the server's recomputed closing balance. `stock-movement-ledger` paged cleanly with
  **11,239 of 11,302 rows sharing one timestamp** - a harsher case than the one that broke.


## Live HTTP verification, completed at close (owner JWT, GET only)

The three checks an agent was blocked on (it lacked test credentials and correctly stopped rather
than working around the permission classifier) were completed directly:

| check | result |
|---|---|
| `supplier-statement/export` (params are `supplierId`/`fromDate`/`toDate`, not the dateFrom/dateTo the earlier 400 suggested) | **200**, closing balance **2,627.765** = GL 2111 party-tagged balance **2,627.765**, exact |
| SML `warehouseId` filter | **RESPECTED** - Al Rai / Fahaheel / Shuwaikh each return only their own rows |
| sales-register `customerId` filter | **RESPECTED** - 6 invoices across 4 customers narrows to 3 invoices, 1 customer |
| general-ledger account filter | **RESPECTED** - 2111 closes at **1,346,111.843**, 1131 at **588,080.041**, both matching the AP/AR tie-outs verified earlier by SQL |
| pos-cash-variance single-day filter | **RESPECTED** - 3 shifts in the month, 2 on the single day |
| **F1 end to end over HTTP** | full-range SML export **200, 11,302 rows, 6.87 MB, 11.4s** solo; **3 concurrent exports all 200 in 13.8-17.8s** - the exact combination that previously returned a 500 and stalled for 5.5 minutes |

## Closing integrity

`sum(debit-credit)` = **0.000000** · 889 lines · 120 entries · `sum(debit)` = 11,629,545.143000 ·
**0 opening-balance journals modified** (`updated_at = created_at` on all of them).

Test gates at close: API `src/reports` **73 suites / 1244 tests**; web `features/reports` **38 files /
412 tests**; web inventory + pos-transactions **61 files / 448 tests**; `tax-document-assembler`
**23 tests**; `packages/shared` format + print **268 tests**. Web typecheck **0 errors**, API typecheck
**0 errors**, `i18n:check` all locales in sync.

## Investigated and WITHDRAWN (this half)

- Purchase Register "ignoring" its date filter - 296 of 303 confirmed bills are opening-balance imports,
  correctly excluded; the 7 real bills all fall in the window.
- daily-sales vs pos-sales-summary disagreeing by 5.000/11.000 - both tie exactly, different bases; the
  gap is Delivery Income (4130), rightly outside Product Sales.
- 627 em dashes in day-book descriptions - stale seeded data; the source is already fixed.
- VAT201 having no server guard - `UaeCountryGuard`/`TaxRegistrationGuard` already existed; only the
  route guard was missing, so RPT-012's severity was overstated in the original finding.
- The `stripCost` bodies being "verbatim" (my own brief) - they were not: 3 field lists, 2 contracts.
- The GL pagination symptom being a `keepPreviousData` render artifact (my own hypothesis) - ruled out
  with evidence; the backend genuinely returned page 1's rows.
- The sales-returns duplicate being the cursor bug (my own hypothesis) - ruled out; it was a join fan-out.
- The negative-stock "regression" - stale tests, not a regression. `negative-stock-policy.ts` is
  byte-identical to HEAD; `sales_invoice` was deliberately moved to `TENANT_GOVERNED` in commit
  62794696 with the founder ruling in the file header, and that commit never updated this spec.

## Closed as VERIFIED-CORRECT-BY-DESIGN (not deferrals)

- **93 ledger lines containing a UUID and 624 containing an em dash** are immutable posted history.
  Backfilling text on posted journal rows would violate the immutable-audit rule this codebase is built
  on; a ledger row should say what it said when it was written. The SOURCES are all fixed, so no new row
  can carry either. Flagged for founder override if a Day Book cosmetic backfill is ever wanted.
- **Print stack and POS receipt digits** bind to the DOCUMENT's language, not the viewer's locale, with
  the code path cited and `resolvePrintNumerals()` returning `latn` for every input today.
- **Five reports without a currency caption** render per-row multi-currency values that label themselves;
  vat201 is regulatory fixed-AED.

## Stale tests found pinning outdated behaviour: 12+

Including two that could never have done their job: a tenant-scope assertion in `price-lists.service.spec.ts`
whose `containsParamValue` helper did not recurse into arrays (so it returned `false` unconditionally on a
security-relevant check), and three batches rejection tests that were passing for the wrong reason - they
failed on a missing `version` token, not on the financial-field allowlist they claimed to guard. Every one
was classified before being changed; no snapshot was ever bulk-regenerated.
