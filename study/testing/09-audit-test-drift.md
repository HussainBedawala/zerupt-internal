# Phase F — audit test drift (4 failing specs closed)

Before: `Test Suites: 4 failed, 24 passed, 28 total` / `Tests: 4 failed, 436 passed, 440 total`
After: `Test Suites: 28 passed, 28 total` / `Tests: 440 passed, 440 total`

## Failure 1 — `audit-registry-coverage.spec.ts`

Root cause: 7 `@Audited("X")` entity types shipped without a matching `AUDIT_ENTITY_REGISTRY`
entry, so a non-Owner reader would have found them invisible under the GAP-1 module-scoped
filter (fail-closed).

Offenders and what they got, in `apps/api/src/audit/audit-entity-registry.ts`:

| Entity type | Module | Table | Notes |
|---|---|---|---|
| `AccountingEventOutbox` | accounting | `accountingEventOutbox` | Dead-letter retry control action (the HIGH finding that added the decorator this phase) |
| `PartGrade` | inventory | `partGrades` | Auto-parts grade CRUD, same module as Fitment/Vehicle/PartBrand |
| `OpeningBalanceReconcilingItem` | settings | `openingBalanceReconcilingItems` | Go-live gate ack, same module as OpeningBalanceImport |
| `PosApproval` | pos | *(module-only, no table)* | Manager PIN→token exchange has no persisted row — the response is a signed token; entityId resolves to `"unknown"` per the controller's own comment |
| `PricingSettings` | inventory | `pricingSettings` | Singleton row (PK `tenantId`, no `id` column, modelled on SecuritySettings); the sibling `priceStrategyConfig` table shares the same entityType but isn't the loader target |
| `SupplierRefundReceipt` | purchase | `supplierRefundReceipts` | Header-only, same shape as RefundVoucher |
| `PurchaseImport` | purchase | `importRuns` | Backs onto the generic import-runs table like BooksImport/InventoryImport (kind `"purchase-import"`) |

Classification: (a) — the test itself needed no change, only the registry it audits. Registered
every type properly; did not touch or weaken any `@Audited` decorator.

`PosApproval` also required adding it to the `MODULE_ONLY` allowlist in
`audit-entity-registry.spec.ts` (module-only pseudo-entities with no table/loader) alongside
`SalesImport` and the OpeningBalance* batch entries — same precedent, same reasoning.

## Failure 3 — `audit-entity-registry.spec.ts`

One test (`Item: withChildren composite loader merges parent + barcodes + packUnits`) failed
independently: the `Item` loader now folds in `alternateCodes` (a prior-phase fix for
alternate/OEM code audit continuity) that the test's expectation predates.

Classification: (a) — stale in shape only. The loader's intent (fold form-owned Item children
into the before-snapshot) is unchanged; the test just hadn't been updated for the third child.
Updated the expectation to include `alternateCodes: childRows` and its `Array.isArray` check.

## Failure 2 — `audited-never-on-get.spec.ts`

`subledger-reconciliation.controller.ts:44` (`SubledgerReconciliationController.detect`, a
`@Get()` handler) carried `@Audited("SubledgerReconciliation")`.

**Ruling: the decorator was wrong, removed.** Read the handler — it is genuinely read-only
(`GET /tenant/accounting/subledger-reconciliation`, calls `service.detect()`, no DB write in
the controller or the service's `detect` path — the service's own module header says "no JEs
are posted"). `AuditLogInterceptor` never writes audit rows for a GET (confirmed against its
implementation), so the decorator was a no-op: it looked like this read was audited when it
was not, which is a worse state than an honest gap — someone would trust a row exists that
never gets written. Removed the decorator and left a comment on the handler pointing at
AUDIT-003 (exports/reads unauditable by design, a founder decision still open) so the real
need — auditing a read of reconciliation data — stays tracked rather than faked.
`AUDIT_ENTITY_REGISTRY`'s existing `EXEMPT_ENTITY_TYPES` entry for `"SubledgerReconciliation"`
(with the same "read-only reporting service" reasoning) is now simply unused rather than
contradicted — left in place since it costs nothing and documents the same fact for a reader
of that file.

Classification: (b) — the spec was asserting correct behaviour (`@Audited` should never sit on
a GET); the offending production code was the bug. No test change needed here at all.

## Failure 4 — `keyset-cursor-precision.spec.ts`

`pos-cash-variance.service.ts` and `pos-refunds-voids.service.ts` had already been fixed to
stop truncating their keyset cursor to milliseconds, but the `KNOWN_OFFENDERS` allowlist still
listed them, so the guard's own `alreadyFixed` check failed the run.

Classification: (c) — those two lines in the allowlist had gone tautological/meaningless: they
asserted a defect that no longer existed, so the test was passing (before the fix shipped) for
a reason unrelated to today's code. Removed both lines.

**On the allowlist mechanism itself**: I did not delete it or force it to assert empty. The
remaining 11 entries are real, current offenders (still truncating via `.toISOString()` in a
cursor context) — `cheques/cheques.service.ts`, `close-management/close-run.service.ts`,
`notifications/notifications.service.ts`, and 8 export services under
`purchase/*/export/*.ts` and `sales/direct/export/direct-sale-export.service.ts`. Asserting
"empty" today would just force re-adding all 11, which defeats the point.

More importantly: the mechanism is **not** the latent trap it looks like. This very failure is
proof it already self-detects staleness — the spec's `alreadyFixed` check is exactly the "fail
loudly when an entry becomes stale" guard the task asked me to consider adding. It did its job:
someone fixed two services, forgot to prune the list, and the very next CI run caught it. No
further mechanism change was needed or made. The only lever left to reduce for-real risk is
finishing the remaining 11 fixes, which is out of scope for this phase (test-drift closure,
not new remediation) — flagging them here as the honest remaining exposure, per the CRITICAL
background in the task brief.

## Notes

- No test was weakened, no `as any`/`@ts-expect-error` added, no snapshot bulk-regenerated.
- Only production files touched: `apps/api/src/audit/audit-entity-registry.ts` (registry
  additions) and `apps/api/src/subledger-reconciliation/subledger-reconciliation.controller.ts`
  (removed the no-op `@Audited`).
- `pnpm --filter @zerupt/api typecheck` — clean, no errors.
