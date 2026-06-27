# 09 — Open Questions and Decisions for the Layer 0 Audit

This chapter collects every unresolved design question and known gap identified during the
Layer 0 study. The audit (step 2 of the hardening program) must resolve each one with a
concrete decision: fix now, defer with documented rationale, or accept as-is.

---

## OQ-01: Missing batch/serial/bin dimensions on the ledger (CRITICAL for 10 years)

**The gap:** `stock_ledger_entries` has no `batch_id`, `serial_number_id`, or `bin_id`
column. The ledger cannot answer "which lot was sold?" without joining to source documents.

**Impact:**
- No batch recall trace from the ledger alone
- No serial-level movement history
- FIFO layers have `batch_id` (nullable, no FK) but ledger entries do not — the two are
  unconnected at the DB level
- `materialized_stock_levels` is keyed on `(item_id, warehouse_id)` only — no batch-level
  on-hand from the materialized view

**Decision required:**
1. Add `batch_id uuid nullable → item_batches.id` to `stock_ledger_entries` NOW
2. Add `serial_number_id uuid nullable → item_serial_numbers.id` to `stock_ledger_entries` NOW
3. Add `bin_id uuid nullable → bins.id` to `stock_ledger_entries` NOW
4. Accept the cost: writing services must pass these where tracking_type mandates it
5. Decide: does `materialized_stock_levels` also need batch-level granularity?
   (If yes: unique key changes from `(item_id, warehouse_id)` to `(item_id, warehouse_id, batch_id, bin_id)` — a major schema change)

**Recommendation:** Add the three nullable columns to the ledger NOW via migration. The
materialized level granularity question can be deferred (add batch-level row as a
separate table later if needed), but the ledger dimension deferral compounds every year.

---

## OQ-02: Stale FK comment on `inventory_cost_layers.batch_id` (LOW — fix now)

**The gap:**
```typescript
// TECH DEBT: Add FK once batches table exists.
batchId: uuid("batch_id"),
```

The `item_batches` table now exists. The FK is missing, not the table.

**Decision required:** Add the FK (`→ item_batches.id`, `onDelete: 'restrict'`) in the
next migration. Low-risk, one-line change.

---

## OQ-03: No DB-level immutability guard on `stock_ledger_entries` (MEDIUM)

**The gap:** Immutability is enforced only via the application layer (no UPDATE/DELETE
methods on `StockLedgerService`). A developer with direct DB access or a future service
bypassing the service layer could UPDATE or DELETE rows silently.

**Decision required:** Add one of:
- A Postgres `RULE` denying UPDATE/DELETE:
  ```sql
  CREATE RULE sle_no_update AS ON UPDATE TO stock_ledger_entries DO INSTEAD NOTHING;
  CREATE RULE sle_no_delete AS ON DELETE TO stock_ledger_entries DO INSTEAD NOTHING;
  ```
- A row-level security policy (if RLS is enabled on the schema)
- Accept the application-layer-only control and document it

**Recommendation:** Add the RULE — it is zero-cost at runtime and makes immutability
enforceable even from psql. The RULE also serves as documentation embedded in the DB.

---

## OQ-04: No DB-level assertion that `total_cost = abs(quantity) × unit_cost` (MEDIUM)

**The gap:** `total_cost` is denormalized. A CHECK constraint rejects negative values but
does not verify the formula. A service bug setting `total_cost` to an arbitrary
non-negative value would be silently accepted.

**Decision required:** Add:
```sql
CHECK (total_cost = round(abs(quantity) * unit_cost, 6))
```
Note: Postgres allows CHECK on multiple columns using expressions. The `round()` is needed
because both values are `numeric(19,6)`.

**Caveat:** `landed_cost_adjustment` rows have `quantity = 0` and `unit_cost = 0` so the
formula evaluates to `total_cost = 0` — which should be their correct value anyway. The
constraint should hold.

---

## OQ-05: `recordMany()` skips per-row idempotency (LOW — document decision)

**The gap:** The batched insert path used for opening balances does not handle per-row
duplicate `event_id` — any unique violation rolls back the entire batch.

**Decision required:** Is this acceptable? Opening balance imports are designed as "run
once" and the document-level uniqueness (one opening balance per item per warehouse) is
enforced upstream. Accept-as-is if opening balance re-runs are blocked at the document
level. Otherwise add per-row idempotency to `recordMany()`.

---

## OQ-06: No `reverses_entry_id` on compensating entries (LOW — decide on need)

**The gap:** When a compensating entry corrects an error, there is no column linking it
back to the original entry. The audit trail is via the source document chain only.

**Decision required:** Add `reverses_entry_id uuid nullable → stock_ledger_entries.id`?
This enables "show me the full correction chain for entry X" without joining through
documents. Useful for customer support and auditor drill-down.

---

## OQ-07: Reconciliation query not automated (MEDIUM)

**The gap:** The consistency invariant `on_hand = Σ quantities` has no automated
monitoring. If a bug breaks the invariant in production, no alert fires.

**Decision required:** Add a scheduled job (BullMQ or pg-boss) that runs the
reconciliation query (Chapter 05) nightly and emits an alert if any discrepancy exceeds
a threshold (e.g., 0.000001). This is the inventory equivalent of the accounting trial
balance check.

---

## OQ-08: `in_transit` column uses `as any` cast in TypeScript (LOW — cosmetic)

**The gap:** `StockLevelService` uses `({ inTransit: quantity } as any)` when inserting
`in_transit` due to a "stale type cache" comment. This bypasses TypeScript type safety.

**Decision required:** Investigate if the Drizzle type cache issue is still present with
the current version. If resolved, remove the `as any` cast. If not, add a comment
explaining exactly why the cast is needed and what would break without it.

---

## OQ-09: `createdBy` sentinel for system jobs (MINOR — document)

**The gap:** System jobs (BullMQ workers, domain listeners) use
`00000000-0000-0000-0000-000000000000` as `created_by`. This is mentioned in the schema
comment but not enforced by a CHECK constraint or a formal enum.

**Decision required:** Document the sentinel UUID in a constants file and import it
everywhere it is used, so "system job" is self-documenting rather than an opaque nil UUID.

---

## Summary table for the audit

| ID | Severity | Gap | Recommendation |
|---|---|---|---|
| OQ-01 | CRITICAL | Missing batch/serial/bin dimensions on ledger | Add columns NOW in migration |
| OQ-02 | LOW | Stale FK comment on cost layers | Add FK in migration |
| OQ-03 | MEDIUM | No DB-level immutability guard | Add Postgres RULE |
| OQ-04 | MEDIUM | No formula CHECK on `total_cost` | Add CHECK constraint |
| OQ-05 | LOW | `recordMany()` skips idempotency | Document or fix |
| OQ-06 | LOW | No `reverses_entry_id` | Decide on need |
| OQ-07 | MEDIUM | Reconciliation not automated | Add scheduled job |
| OQ-08 | LOW | `as any` in `in_transit` insert | Fix or document |
| OQ-09 | MINOR | System sentinel UUID undocumented | Add constants file |
