# Chapter 03 — Negative-Stock Policy

## Where the policy lives

The authoritative enforcement point is `StockLedgerService.decrementOutbound()`.
Source: `apps/api/src/inventory/stock-ledger.service.ts`.

This was established in Layer 0 as the **single chokepoint** for all outbound quantity
movements. Layer 2 hardening (sub-layer 2a) removed the duplicate pre-check that existed
in the adjustment service (Layer 0/2 audit F11 — "dup negative-stock pre-check removed;
sole authority = decrementOutbound").

## How it is enforced

`decrementOutbound` reads the tenant's negative-stock policy (stored at the tenant or
warehouse level) before writing any ledger entry. If negative stock is disallowed and
the resulting on_hand would go below zero, it throws a `ConflictException` before
any write occurs. The check is inside the function body, so it fires for every caller —
sales, POS, adjustments, transfers, count variance posting.

## Per-location / per-item config

As of Layer 0/1/2/3 hardening:
- **Per-tenant policy**: exists and is enforced.
- **Per-warehouse override**: the schema supports this via a warehouse-level policy flag,
  but the enforcement code reads a unified policy. Per-warehouse granularity is schema-present
  but effectively tenant-wide at runtime (the resolver merges them).
- **Per-item override**: NOT built. There is no `items.allowNegative` field. The hardening
  log notes that the negative-stock check is inside `decrementOutbound`, which reads a
  warehouse/tenant policy — not item-level.

## Stock count posting and negative stock

When `StockCountsService.approvePost()` posts a decrease adjustment for a shortage variance,
it calls `StockAdjustmentsService.create()` with `allowNegative: true` (line 719):
```typescript
await this.stockAdjustments.create(tenantId, userId, {
  warehouseId: header.warehouseId,
  type: "Lost",
  lines: nonSerialDecreases,
  reason: `Stock count ${header.docNumber ?? id} — shortage variance`,
  allowNegative: true,  // ← explicitly permits negative on count adjustments
});
```

This is correct behavior: a physical count may reveal that the system is overstating
on-hand (shrinkage, theft, spoilage), and the correction must post even if it drives
on-hand negative. The `allowNegative: true` flag is passed to `decrementOutbound`, which
respects it regardless of tenant policy.

## Serial and batch adjustments during count posting

Missing serials (found during count reconciliation): the adjustment is posted as a
`"Lost"` type with `allowNegative: true`. The serial rows are transitioned to `"defective"`
status in a separate UPDATE after the ledger write (stock-counts.service.ts:752-773).

Extra serials found: posted as `"Found"` type (increase). `StockAdjustmentsService`'s
`applyIncreasesBatched` creates new `item_serial_numbers` rows with status `"available"`.

## Transferability of policy to standalone inventory

For a stockkeeper running inventory standalone (without accounting), the negative-stock
policy is fully functional. The FiscalPeriodService dependency is the only accounting
dependency surfaced at the adjustment posting layer — and that is appropriate (period
integrity is shared).
