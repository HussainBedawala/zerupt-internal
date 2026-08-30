# Residual `queryKey`/`queryFn` parameter-mismatch sweep

Follow-up to `study/testing/10-residual-keeppreviousdata.md`, which flagged
(but did not fix) `useExpiringWarrantiesQuery`'s `queryKey`/`queryFn`
mismatch as a separate, worse bug class: page/limit changes silently serve
stale cached data instead of unmounting into a skeleton.

## Method

1. Enumerated every `useQuery(`/`useInfiniteQuery(` call across
   `erp/apps/web/src/features/*/api/*.ts` (129 files, ~150 hook call sites).
2. Wrote a heuristic scanner (balanced-paren block extraction, not a
   single-line regex) that pulls each hook's `queryKey` expression and the
   argument list of its `queryFn`'s call, then diffs identifiers. This
   produced ~109 raw hits, the overwhelming majority false positives from
   two safe, dominant shapes used almost everywhere in this codebase:
   - **Whole-params-object forwarding**: `queryKey: xKeys.list(params)`,
     `queryFn: () => fetchX(params)` — the identical `params` object is both
     the cache key input and the fetch argument, so anything that varies is
     automatically keyed. This is the pattern in inventory, purchase,
     reports (`params!`), POS, and most of the rest of the app.
   - **Keyset `useInfiniteQuery`**: cursor/pageParam is deliberately
     EXCLUDED from the key (documented in each hook's own comment) so every
     page of one infinite-scroll session shares a single cache entry — the
     opposite of the bug, not an instance of it.
3. Manually read every flagged file to separate real mismatches from
   parser noise (object-literal destructuring split wrong by the crude
   comma-splitter, `!`/`as T`/`?? x` casts, etc.).
4. Cross-checked every hook accepting `page`/`limit`/`cursor`/`offset` or a
   scope scalar (`branchId`/`warehouseId`/`legalEntityId`) in its own
   signature (not inherited via a `params` object) against its `queryKey` by
   hand: `locations-queries.ts` (branches/warehouses), `team-queries.ts`
   (users), `pos-queries.ts` (registers/shifts/transactions/cash
   movements), `auto-parts-queries.ts` (search/whatFits/vehicles),
   `numbering-queries.ts` (sequences), `webhooks-queries.ts` (deliveries),
   `billing-queries.ts` (invoices), `close-management-queries.ts` (runs),
   `fx-revaluation-queries.ts` (preview) — all confirmed to key on every
   forwarded scalar.

## Finding: only ONE real instance of the class found

| # | file:line | hook | queryFn params missing from queryKey | user-visible consequence | severity |
|---|---|---|---|---|---|
| 1 | `features/inventory/api/serial-numbers-queries.ts:129-134` | `useExpiringWarrantiesQuery(days, page, limit)` | `page`, `limit` (key only had `days`) | Changing page returns the SAME cached result — **no refetch at all**, page 2 silently shows page 1's rows with no loading state, no error, no visual clue. | **HIGH** (not CRITICAL — see scope note below) |

No CRITICAL (scope/branch/warehouse-leak-shaped) instance was found anywhere
in the sweep. Every hook that accepts a branch/warehouse/legal-entity scalar
(`useBranchesQuery`, `useWarehousesQuery`, `useCashBankAccountsQuery`,
`useWhatFitsQuery`, `useTemplatesQuery`, `useRegistersQuery`/`useShiftsQuery`
via their `params` objects, etc.) was manually verified to include that
scalar in its `queryKey`. **CONFIRMED** by direct code read for each.

### Why this is ranked HIGH, not CRITICAL, despite matching the CRITICAL description in the task brief

The brief calls a missing scope parameter "the most dangerous variant" and
flags it CRITICAL; `days`/`page`/`limit` are not scope parameters (no
branch/warehouse/tenant leak risk — the underlying `fetchExpiringWarranties`
call is still tenant-scoped server-side, just cached client-side under an
incomplete key), so per the brief's own severity rubric (CRITICAL = data
loss/money wrong/tenant leak/auth bypass; HIGH = fails silently) this is
HIGH: it fails silently (stuck on page 1's data with no indication) but
never crosses a tenant/branch/warehouse boundary.

**Additional finding, stated plainly**: `useExpiringWarrantiesQuery` has
**zero callers** anywhere in `apps/web/src` (`grep -rn
"useExpiringWarrantiesQuery"` outside its own definition file returns
nothing, and no component under `features/inventory/components/` or
elsewhere references "expiring warranties" UI). It is dead/unreachable code
today — the bug could not have been reproduced by clicking through the live
app, because there is no page that calls this hook. It is still a real,
shipped defect (the hook is exported and could be wired into a screen at any
time with the bug already live), so it was fixed rather than left as a
lower-priority backlog item, but the live-browser proof for this task had to
target a different, reachable fixed hook instead (see Live verification
below).

## Fix

`erp/apps/web/src/features/inventory/api/serial-numbers-keys.ts`:
```ts
// before
expiring: (days: number) => [...serialNumberKeys.all, "expiring", days] as const,
// after
expiring: (days: number, page: number, limit: number) =>
  [...serialNumberKeys.all, "expiring", days, page, limit] as const,
```

`erp/apps/web/src/features/inventory/api/serial-numbers-queries.ts`:
```ts
export function useExpiringWarrantiesQuery(days = 30, page = 1, limit = 50) {
  return useQuery({
    queryKey: serialNumberKeys.expiring(days, page, limit),
    queryFn: () => fetchExpiringWarranties(days, page, limit),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData, // also missing — folded the residual
                                        // keepPreviousData fix into the same
                                        // paginated hook while touching it
  });
}
```
Also added `placeholderData: keepPreviousData` to the same hook (it is
page-keyed like every other paginated list in the app, so it belongs in the
same class as the 23 hooks already fixed in the prior residual sweep — it
was simply not caught then because that pass excluded this hook as "a
separate finding, not fixed here").

## Task 2: regression coverage for BOTH classes

### Extended per-module `keepPreviousData` tests (same shape as the existing two)

New test files, mirroring `features/inventory/api/__tests__/pagination-keeps-previous-data.test.ts`:

| File | Hooks covered |
|---|---|
| `features/reports/api/__tests__/pagination-keeps-previous-data.test.ts` | `useDayBookQuery`, `useGoodsReceivedReportQuery`, `useOpenPurchaseOrdersReportQuery`, `usePosCashVarianceQuery`, `usePosDiscountsQuery`, `usePosRefundsVoidsReportQuery`, `usePurchaseReturnsReportQuery`, `useSalesReturnsReportQuery`, `usePurchaseRegisterQuery`, `useSalesRegisterQuery`, `useUnbilledDeliveriesQuery` (11 hooks, 8 `useQuery` + 3 `useInfiniteQuery`) |
| `features/pos/api/__tests__/pagination-keeps-previous-data.test.ts` | `useRegistersQuery`, `useShiftsQuery` |
| `features/billing/api/__tests__/pagination-keeps-previous-data.test.ts` | `useInvoicesQuery` |
| `features/admin/api/__tests__/pagination-keeps-previous-data.test.ts` | `useAdminTenantsQuery` |
| `features/numbering/api/__tests__/pagination-keeps-previous-data.test.ts` | `useSequencesQuery` |
| `features/webhooks/api/__tests__/pagination-keeps-previous-data.test.ts` | `useWebhookDeliveriesQuery` |
| `features/close-management/api/__tests__/pagination-keeps-previous-data.test.ts` | `useRunsQuery` (keyset `useInfiniteQuery`) |

`features/inventory/api/__tests__/pagination-keeps-previous-data.test.ts`
was also extended with a dedicated case for `useExpiringWarrantiesQuery`
that asserts BOTH invariants at once (queryKey contains `page`/`limit`
AND `placeholderData` is set) — this is the one hook where both bug
classes coincided.

### Combined AST-adjacent static guard (attempted, kept — not rejected)

The prior agent judged a whole-repo static check "not cheap enough" because
it needs real option-object boundary detection (not a naive per-line regex)
plus an allowlist. I built it anyway, scoped to `features/*/api/*.ts` (not
the whole repo — that's where every TanStack Query hook in this app lives,
per `apps/web/CLAUDE.md`'s Data Fetching Pattern), because a defined,
mechanically-enumerable directory set with a small, reason-carrying
allowlist is exactly the shape the brief asked me to evaluate honestly
rather than default-reject:

**`erp/apps/web/src/__tests__/query-key-completeness-guard.test.ts`**

- Parses each `export function use...Query(...)` with a real balanced-brace
  scan (not single-line regex), so it cannot misattribute one hook's
  `queryKey` to a neighboring hook in the same file — the exact failure mode
  called out in the brief for the earlier cursor-precision ratchet.
- For every scalar the hook's own signature accepts (minus `enabled`) that
  is actually forwarded into its `queryFn`'s call arguments, asserts that
  scalar's name appears in the `queryKey` text.
- Carries a 10-entry allowlist, each with a written reason (keyset infinite
  queries, "fetch everything" loop-until-exhausted hooks, hardcoded-literal
  probes, and one genuine scanner blind spot — `usePartFinderQuery`'s `q` is
  renamed to `debounced` via `useDebounce` before use, and `debounced` (not
  `q`) is what's actually keyed and forwarded; verified by hand).
- Includes a "did this actually scan anything" assertion (`apiFiles.length
  > 80`, `totalHooks > 100`) so the check cannot silently go inert if a
  future refactor moves the API layer — the exact gap called out for the
  branch-scoping helper that could not recurse into arrays.
- Explicitly documents in its own header what it does NOT catch (an
  intermediate local-variable alias a few lines above the hook that neither
  the key nor the queryFn destructures inline) — none of the ~130 hooks
  swept use that shape today, stated rather than implied as full coverage.

**What made this tractable at the scope I chose (not full-repo)**: this
codebase has exactly ONE dominant hook shape (`export function
use<Thing>Query(...)`) confined to `features/*/api/*.ts`, with no shared
factory to trace through (confirmed in the prior residual pass — "no shared
pagination hook/factory exists"). A whole-repo version would additionally
need to find call sites of these hooks in `components/` to catch a
DIFFERENT bug (a caller passing the wrong prop into an otherwise-correct
hook) — that really would need type-aware AST tooling and was out of scope
here; this guard only checks the hook DEFINITION, which is where both real
bugs in this sweep actually lived.

## Deliberate-break verification (both guards)

Per the task's standing rule against guards that pass while the bug is
live, I reverted the fix in place, ran the tests, confirmed failure, then
restored the fix and re-ran to confirm green again:

1. **`pagination-keeps-previous-data.test.ts` (inventory)** — reverted
   `serialNumberKeys.expiring(days, page, limit)` back to
   `serialNumberKeys.expiring(days)`. Result:
   ```
   × useExpiringWarrantiesQuery includes page and limit in its queryKey and keeps previous data
   AssertionError: expected [ 'tenant', 'serial-numbers', …(4) ] to include 2
   ```
   **CONFIRMED FAILS** on the reintroduced bug. Restored, re-ran: 9/9 pass.

2. **`query-key-completeness-guard.test.ts`** — same revert. Result:
   ```
   × every use*Query hook's queryKey contains every scalar param it forwards to queryFn
   - "...useExpiringWarrantiesQuery(...) forwards param "page"... does not appear in its queryKey..."
   - "...useExpiringWarrantiesQuery(...) forwards param "limit"... does not appear in its queryKey..."
   ```
   **CONFIRMED FAILS**, correctly naming both missing params. Restored,
   re-ran: 2/2 pass.

Both guards are therefore proven to catch the actual bug, not just to exist
alongside it.

## Full test run (targeted, never a full suite)

```
npx vitest run pagination-keeps-previous-data query-key-completeness-guard
 Test Files  10 passed (10)
      Tests  37 passed (37)
```

## Typecheck

`pnpm --filter @zerupt/web typecheck` — **PASS**, clean `tsc --noEmit`, exit
code 0, after fixing:
- Two `noUncheckedIndexedAccess`-shaped `undefined` errors in the new
  static guard's regex-match handling (added an explicit `if (!hook)
  continue` guard and a `?? ""` fallback).
- Eight `as Parameters<...>` casts in the new reports test file that TS
  correctly flagged as "these two object shapes don't sufficiently
  overlap" (the mock params only carry `page`/`limit`, not each report's
  full filter shape like `dateFrom`/`dateTo`/`legalEntityId`) — changed to
  `as unknown as Parameters<...>`, the standard escape for a deliberately
  partial mock object in a test, same as this codebase's existing
  `pagination-keeps-previous-data.test.ts` files already do elsewhere
  (`as Parameters<typeof useBatchesQuery>[0]` etc. for shapes that DO
  overlap; the `unknown` step is only needed where they don't).

## Live browser verification

Logged in as owner (`anonymator8@gmail.com`) — **CONFIRMED** via
`/en/settings/team`: the Members table renders "Hussain Bedawala /
anonymator8@gmail.com / Owner / All locations / Active", and the header
avatar reads "HB", both only visible to an authenticated owner session.

`useExpiringWarrantiesQuery` (the hook with the confirmed bug) has **no
UI caller** (stated above), so it cannot be exercised by clicking through
the app — there is no warranty-expiry screen to visit. Per the task's own
fallback clause ("or whichever fixed hook is reachable with real data"),
verified a different hook this task's Task 2 added fresh test coverage
for instead:

**Settings > Document Numbering** (`/en/settings/numbering`,
`useSequencesQuery` — fixed for `keepPreviousData` in the prior residual
pass, now also covered by this task's new
`features/numbering/api/__tests__/pagination-keeps-previous-data.test.ts`):

- Page 1: "Showing 1–25 of 79". First rows: Internal Barcode (tenant-wide),
  then Al Rai Main Showroom (B1) sequences (Invoice, Purchase Order, Sales
  Order, POS Receipt, ... through Purchase Return PR).
- Clicked "Next page" (`@e146`).
- Page 2: "Showing 26–50 of 79". Rows are genuinely DIFFERENT — the tail of
  B2 Fahaheel Branch's sequences (Adjustment through Purchase Return) then
  the start of B3 Jahra Branch's sequences (Invoice through Transfer). No
  overlap with page 1's B1/Internal-Barcode rows, no blank/skeleton flash
  observed in the text diff, pager text updated correctly.

**CONFIRMED**: page 2 returns different rows than page 1, proving the
paginated-list fix class (Task 2's regression target) holds live.

A second attempt to verify a different newly-tested hook (POS > Registers,
`/en/pos/registers`) failed with `goto: Timeout 15000ms exceeded` and the
shared browse daemon restarted mid-navigation — consistent with the
briefing's documented daemon instability under concurrent sessions, not a
product finding. **SUSPECTED-only, not re-attempted** for POS Registers
specifically; not filed as a bug, per the task's explicit instruction to
mark such cases SUSPECTED rather than infer a result.

## Summary table (severity-ranked)

| Finding | Severity | Status |
|---|---|---|
| `useExpiringWarrantiesQuery` queryKey missing `page`/`limit` → stale/wrong cached page served silently | HIGH | CONFIRMED, FIXED |
| No CRITICAL (scope/branch/warehouse) queryKey omission found anywhere in the sweep | — | CONFIRMED (manual read of every branch/warehouse/legal-entity-accepting hook) |
| `useExpiringWarrantiesQuery` also missing `placeholderData: keepPreviousData` | LOW (folds into the already-shipped residual sweep's class; hook has no UI caller) | CONFIRMED, FIXED |
| `useExpiringWarrantiesQuery` has zero callers in the frontend (dead code) | MEDIUM (founder standard: shipped-but-unreachable code with a live latent bug) | CONFIRMED |
