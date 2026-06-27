# 02 — Stock Movement / Ledger Report

## Purpose

The stock movement ledger is the drill-down from a balance to every individual movement
that produced it. It is the inventory equivalent of the accounting general ledger:
every change to on-hand for an item at a warehouse is a row, ordered by time,
with a running balance after each movement.

A stockkeeper uses this to:
- Investigate unexpected on-hand discrepancies ("why is item X at -3?")
- Audit a specific purchase/sale/transfer chain
- Produce a period movement summary (inflows, outflows, net)

## As-built

**Service:** `apps/api/src/reports/stock-movement-ledger.service.ts`
**Controller:** `apps/api/src/reports/stock-movement-ledger.controller.ts`
**Route:** GET `tenant/reports/stock-movement-ledger`
**DTO:** `apps/api/src/reports/stock-movement-ledger.dto.ts`
**Spec:** NO spec file exists for this service.

**Query params:**
- `dateFrom?` (YYYY-MM-DD), `dateTo?` (YYYY-MM-DD)
- `itemId?` (UUID)
- `warehouseId?` (UUID)
- `movementType?` (enum of 13 movement types)
- `sourceModule?` (pos | sales | purchase | inventory | accounting | other)
- `page` (default 1), `limit` (default 50, max 200)

**What it reads:**

```sql
SELECT sle.*, items.name, items.sku, warehouses.name
FROM stock_ledger_entries sle
INNER JOIN items ON items.id = sle.item_id
INNER JOIN warehouses ON warehouses.id = sle.warehouse_id
WHERE sle.tenant_id = ? AND items.tenant_id = ?
  [AND sle.created_at BETWEEN ? AND ?]
  [AND sle.item_id = ?]
  [AND sle.warehouse_id = ?]
  [AND sle.movement_type = ?]
ORDER BY sle.created_at ASC
LIMIT ? OFFSET ?
```

## Critical bug: orders by createdAt, not occurredAt

The stock movement ledger service orders by `sle.created_at` (line 105 in
`stock-movement-ledger.service.ts`) and filters date ranges against `sle.created_at`
(lines 164-172).

**However**, Layer 0 and Layer 4 hardening established that the correct temporal
ordering field is `occurredAt` (the EFFECTIVE movement date). `createdAt` is the
system insert timestamp. These two can diverge in the following cases:
- Backdated adjustments (e.g. a count posted for a count_date from last week)
- Any adjustment or movement where `occurredAt` was set to a historical date

**Effect on the report:**
1. Date-range filtering on `createdAt` excludes backdated movements from the correct
   period (a movement with `occurredAt = 2026-06-01` but `createdAt = 2026-06-27`
   would not appear in a June 1-June 30 date filter).
2. Running balance computation is wrong for any tenant that has backdated adjustments —
   the ordering puts later-recorded-but-earlier-effective movements in the wrong position.
3. The report is incoherent with the stock-count variance report, which stores
   `count_date` (the effective date from Layer 4) and posts adjustments with that
   date as `occurredAt`.

**Fix:** Switch `buildWhere` and `orderBy` to use `stockLedgerEntries.occurredAt`
(the field exists — `inventory-costing.ts` line 166 confirms `occurred_at` is
NOT NULL on the schema). The field should also be returned in the response shape
(currently `date` returns `createdAt`).

## Running balance limitation

The running balance is computed in-application over a single page
(`stock-movement-ledger.service.ts` lines 123-137). It resets to 0 at the top of
each page. The comment in the service acknowledges this:

> "Cross-page running balance is intentionally excluded to keep the query simple."

This means:
- Page 2 of a date range report shows a running balance that starts from 0, not
  from the closing balance of page 1.
- A "balance carried forward" from page 1 to page 2 is not available without
  paginating from the very start.
- The `runningBalance` field in `LedgerRow` is described as an "approximation for
  display purposes — not a DB-guaranteed value."

**For standalone stockroom use, this is a correctness problem for multi-page reports.**
The fix is either a pre-query that Σ(quantity) for all rows before the current page
offset (cheap if indexed on item_id, warehouse_id, occurred_at), or a window function.

## Filters and dimensions

| Filter | Supported | Notes |
|---|---|---|
| dateFrom / dateTo | YES | But uses createdAt, not occurredAt (bug above) |
| itemId | YES | UUID exact match |
| warehouseId | YES | UUID exact match |
| movementType | YES | 13-value enum |
| sourceModule | Partial | Derived in-app after DB fetch — not a DB predicate; post-filter on sourceModule does NOT reduce the DB scan or affect pagination |
| batchId | NO | Cannot drill into a specific lot's history from this report |
| serialNumberId | NO | Cannot drill into a specific serial unit's history |

The `sourceModule` post-filter bug: the `count` query runs without the sourceModule
filter (line 94-100 in the service), so `meta.total` reflects the unfiltered count
even when `sourceModule` is specified. Pages will be wrong.

## docNumber is always null

The `LedgerRow.docNumber` field is null for every row. Comment in service:
"doc number lookup is out of scope — sourceDocumentId is the trace key." This is a
UX gap: a stockkeeper can't read "GRN-0047" from the movement ledger — they get a UUID.

## Summary of gaps

| Gap | Severity | Notes |
|---|---|---|
| Orders/filters by createdAt instead of occurredAt | HIGH | Breaks period reporting for backdated movements |
| Running balance resets per page | MED | Approximation for multi-page drill-down |
| sourceModule post-filter corrupts meta.total | MED | Count query ignores the filter |
| batchId / serialId not filterable | MED | Can't drill into a lot or serial unit's full history |
| docNumber always null | LOW | Stockkeeper sees UUID not human-readable doc number |
| No spec file for the service | LOW | Zero test coverage |
