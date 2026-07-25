# Direct Sale amend — implementable designs (2026-07-25)

Three designs, all researched against the live working tree (not HEAD) and ready to
execute. Blocked on the concurrent inventory/sales-invoices rewrite finishing; none of
them may be applied while `sales-invoices.service.ts`, `sales-invoices-void.events.ts`,
`inventory-event.listener.ts` or `packages/db/src/schema/sales.ts` are being written.

Companion doc: `direct-sale-amend-findings.md` (the seven defects + what's already fixed).

---

## A. Restock race — synchronous restock inside the void transaction

### Why it still matters after the negative-stock work

The new `negative-stock-policy.ts` classifies `direct_sale` as `TENANT_GOVERNED` and ships
`flexible` as the default. It does **not** touch the async restock. So:

- `strict` tenant → recreate throws `INSUFFICIENT_STOCK` → `voidOriginal.compensate` throws
  by design → `failed_needs_reconcile`, **sale destroyed**.
- `flexible` tenant (the default) → **no error at all**, and three silent harms: a spurious
  `NEGATIVE_STOCK_FLAG`, COGS relieved at the pre-restock WAC, and `costAtSale` snapshotted
  from that same stale WAC. `computeNegativeStockTrueUp` explicitly excludes `sale_return`
  as a cost-establishing receipt, so **nothing ever corrects it**. Inventory value ends off
  by `qty × (originalCost − staleWac)`.

The default path is the silent-money-bug path. That is the worse of the two.

### Precedent

Serial units are already restored **synchronously inside the void tx**
(`sales-invoices.service.ts:1654` → `restoreSerialsForVoid`). And the sibling adapter
already ships a band-aid for this exact race, with a comment admitting it:

```ts
// sales-invoice-amend.adapter.ts:190-194
/** Bounded retry for the ONE known transient in recreate: the void's
 * sale_return restock lands via the (fast-path) event listener, which can
 * still be in flight when the corrected confirm re-guards stock. */
const CONFIRM_STOCK_RETRIES = 3;
```

### Rejected options

- **Reuse `InventoryReversalService.reverseEntries`** — `stockLedger.reverse()` copies
  `movementType` verbatim and negates qty, producing a **negative `sale` row** instead of a
  `sale_return` row. That breaks `readRealizedSaleUnitCosts` (abs-sums `movementType='sale'`)
  and bypasses the `inventory.sale_return` COGS-reversal outbox. High blast radius.
- **Amend saga awaits a reversal itself** — fixes only amend; plain void stays racy for
  "void then immediately re-sell". Splits ownership of the void's stock effect.
- **Settlement barrier / poll** — still a poll, and cannot make the effect atomic: a crash
  between commit and drain still leaves a voided invoice with un-restocked stock.

### Chosen: restock in-tx, keeping `sale_return` semantics

1. **`inventory-event.listener.ts`** — add a transaction-participating variant. Extract the
   existing `db.transaction(tx => {...})` body verbatim into a private method, then:
   ```ts
   /** In-tx variant: does the ledger/level/outbox work inside the CALLER's tx and
    *  returns the post-commit emits for the caller to fire after ITS commit. */
   async applyInboundInTx(payload: StockInboundPayload, tx: Transaction): Promise<() => void>
   ```
   `applyInbound(payload)` becomes `const emit = await db.transaction(tx =>
   this.applyInboundInTx(payload, tx)); emit();` — byte-identical for all seven existing
   callers. Idempotency is already free: `recordAttributed` returns `null` on a duplicate
   `eventId` and returns early before any write.

2. **New `apps/api/src/inventory/sale-return-inbound-payload.ts`** — extract
   `buildSaleReturnInboundPayloads(event, sourceDocumentType)` so the void tx and the
   listener derive **byte-identical** payloads including `eventId`
   (`deterministicUuidV5(line.sourceDocumentLineId ?? String(i), parentEventId)`).
   `fanOutSaleReturn` is rewritten to use it — behaviour-preserving for POS returns, credit
   notes, delivery returns. **Sort the output by `(warehouseId, itemId)`** inside the builder
   so both paths inherit the same lock order as confirm (`sales-invoices.service.ts:2327`).

3. **`sales-invoices.service.ts` `doVoidTx`** — restock between `restoreSerialsForVoid` and
   the outbox insert, from the same payload, returning the emits:
   ```ts
   const event = inventoryDomainEventSchema.parse(payload);
   const emits: Array<() => void> = [];
   for (const p of buildSaleReturnInboundPayloads(event, "inv")) {
     emits.push(await this.inventoryEngine.applyInboundInTx(p, tx));
   }
   await this.outboxService.insert(tenantId, SALES_EVENTS.INVOICE_VOIDED, payload, tx);
   return { updated, payload, emits };
   ```
   Then in `voidInvoice` after commit: `for (const emit of result.emits) emit();` **before**
   `emitInvoiceVoided` — preserves today's relative ordering (inventory GL lands before the
   AR contra listener).

4. **Delete the band-aid** — `CONFIRM_STOCK_RETRIES`, `isInsufficientStockError`, and
   `confirmWithRestockRetry` in `sales-invoice-amend.adapter.ts:190-203, 762-797` collapse to
   a plain `this.invoices.confirm(...)`. Leaving them would mask a regression.

5. **DI** — inject `InventoryEventListener` into `SalesInvoicesService`; direction is already
   sales → inventory, so no cycle. Verify it's in `inventory.module.ts`'s `exports`.

### Why plain void does not regress

The async listener stays wired. On outbox re-delivery `buildSaleReturnInboundPayloads`
reproduces the same per-line `eventId`s, `recordAttributed` returns `null`, and the handler
returns early — **a proven no-op, not a double restock.** Failure semantics tighten
correctly: a restock failure now rolls the void back (invoice stays confirmed, re-voidable)
instead of leaving a voided invoice with un-restocked stock plus a dead-letter row.

---

## B. Cost basis — original cost preserved, correction pinned to the original date

### The fix is TWO parts, and both are mandatory

Preserving `costAtSale` alone fixes reporting and leaves the GL/subledger drifting. The
materialized relief must also happen at the original cost.

`decrementOutbound` (`stock-level.service.ts:677-687`) has two branches: the *pool* branch
recomputes value at the current average and leaves it untouched; the ***specific*** branch —
taken only when `specificTotalCost` is supplied — relieves `total_value -= specificTotalCost`
and re-derives the average. The specific branch is load-bearing.

**Neutrality proof.** Pool `Q` @ `W`, value `V = Q·W`; line sold `q` @ frozen `c₀`.

- Void restock: `on_hand = Q+q`, `W' = (Q·W + q·c₀)/(Q+q)`, `V' = V + q·c₀`
- Re-deduct at `c₀` **with specific relief**: `V'' = V' − q·c₀ = V`, `on_hand = Q`,
  average re-derives to `V/Q = W`. COGS debit `= q·c₀`. **Net ΔCOGS = 0.**
- Today's pool branch instead gives `ΔCOGS = q·Q·(W − c₀)/(Q+q)`, pool short by the same,
  average permanently dragged to `W'`.

### Precedent

Delivery orders already do exactly this — `inventory-domain.listener.ts:485-494` freezes
`costAtDelivery` and passes `cogsSpecificTotalCost`, with the comment: *"Using live WAC here
stranded qty × (WAC − cost) in 1144 forever."* Sales invoices emit that field **only for
serial lines** (`sales-invoices-events.ts:157`), so every non-serial line falls through to
live WAC. This design applies a proven mechanism to the path that was missed.

### New: as-of-date cost resolver

`apps/api/src/inventory/as-of-cost.service.ts` — no new table, no migration.

```sql
SELECT item_id, warehouse_id,
       SUM(quantity) AS on_hand,
       SUM(CASE WHEN quantity < 0 THEN -total_cost ELSE total_cost END) AS total_value
FROM stock_ledger_entries
WHERE tenant_id = $1 AND occurred_at <= $asOf
  AND (item_id, warehouse_id) IN ((..),(..),…)
GROUP BY item_id, warehouse_id
```

`unitCost = totalValue / onHand` (6dp HALF_EVEN). This **is** the true running average by
construction — every outbound relieved at the then-current average.

- Served by the existing `sle_item_warehouse_occurred_at_idx`. **No new index needed.**
  One query per amend, N = distinct (item, warehouse) pairs, typically < 20. Bound at 500.
- **Self-cancelling:** the original outbound (−q @ c₀) and the void's restock (+q @ c₀) both
  fall at or before `asOf` and cancel exactly, so the answer is identical before or after
  the void. No ordering hazard in the saga.
- **Fallback ladder, never a silent zero:** ledger → latest pre-`asOf` inbound `unit_cost`
  → `"0"` with `basis: "none"` and a `logger.warn`.
- **Tuple gotcha:** never `= ANY(${jsArray})` in a raw sql template (Drizzle inlines a ROW
  tuple and breaks at 2+ elements — this is what broke the stock-levels report). Build the
  IN-list with `sql.join(...)`.

### Threading

- `voidInvoice` already computes the original per-unit cost in `readRealizedSaleUnitCosts`
  (`:2185`) and only uses it internally. **Return it** as `OriginalCostLot[]`, aggregated by
  `(itemId, warehouseId)`.
- Adapter carries it on the saga context (same pattern as the existing `reversedReceipts`
  threading), immutably: `return { ...ctx, originalCostLots }`.
- Extend the orchestrator-only part of `ConfirmInvoiceInput` (where `occurredAt` /
  `deliverySourced` already live — the HTTP path never sets these) with
  `costBasis?: { asOf: Date; lots: readonly OriginalCostLot[] }`.
- New pure module `apps/api/src/sales/invoices/amend-cost-basis.ts` —
  `allocateCostBasis(lines, lots, asOfWacByKey)` draws each line down against its lot at
  `c₀` in `lineNumber` order; residual (new line, or the *increment* on a raised quantity)
  draws at the as-of WAC. Returns a per-unit weighted cost. No DB, 100% unit-testable.
- One edit in `assertStockAndSnapshotCost:2378` serves **both** `confirm()` and
  `confirmComposed()` (the direct-sale twin).
- **Generalize the fan-out** (`sales-invoices-events.ts:157`): `serialLineIds` becomes
  `specificCostLineIds`, so amended non-serial lines also emit `cogsSpecificTotalCost` —
  which is what buys the specific relief branch and therefore the neutrality proof.
- **Fallback discipline:** empty lots → as-of WAC for the whole document, **never** live WAC.

### Other consumers (build once)

- **Backdated invoice confirm** — same bug, no amend involved: `confirmedAt` backdated but
  the WAC read is live. Same one-line fix once (d) lands.
- **Invoice void / credit note / POS return** — replace their `?? "0"` cost fallbacks.
- **As-of valuation report** (`reports/inventory-valuation.service.ts:592-636`) uses the
  **same SQL formula**. Extract it into one shared `sql` fragment so the report and the
  posting path can never disagree about what "value as of T" means. (Report uses whole-day
  `< date+1`; resolver takes an instant and uses `<=`. Keep both explicit.)
- **Backdated purchase / GRN is NOT solved by this** — a backdated inbound blends into
  today's pool; correctness needs a forward replay of every movement after T, not a read.
  Known, unfixed, out of scope. The resolver is the read primitive such a replay would use.

### Conflict watch

`stock-level.service.ts`'s `specificTotalCost` branch is load-bearing for the neutrality
proof. If the in-flight inventory work changes its relief semantics, this breaks **silently**
(GL right, subledger drifts). Coordinate before either lands.

---

## C. Stable identity overlay

### Schema (`direct_sales`)

- `rootId uuid NOT NULL` — first anchor in the chain; the root's own `rootId` = its own id
  (self-referencing at insert, never nullable, so every query filters unconditionally). No
  self-FK — written once, never updated.
- `version integer NOT NULL DEFAULT 1` — +1 per amendment.
- `saleNumber` — the user-facing identity, allocated **once on the root**, copied verbatim
  onto every amendment. **Never re-allocated on amend.** Match the existing
  `invoiceNumber`/`receiptNumber` column type rather than inventing a third convention.
- `index(tenantId, rootId, version DESC)` — tip lookup with no sort node.
- `uniqueIndex(tenantId, rootId) WHERE status != 'voided'` — at most one live row per chain;
  cheap DB invariant that catches a future adapter bug loudly instead of silently branching.

Backfill: `root_id = id`, `version = 1`, `sale_number = <borrowed invoice number>` for every
existing row — so existing sales look identical to today. Add nullable → backfill → SET NOT NULL.

### Numbering

Add `dsl` to the `document_type` enum (`packages/db/src/schema/enums.ts:83-97`;
`ALTER TYPE ... ADD VALUE` is safe in a txn on Neon PG16 per that file's own comment).
Allocate via `DocNumberingService.reserveNumber` + `commitReservation`, per-branch, mirroring
`receipt-vouchers.service.ts:440` / `sales-invoices.service.ts:940`. **Verify the casing
convention** — call sites pass `"RV"`/`"INV"` while the pg enum values are lowercase.

**The amend path must never call `reserveNumber`.** Add
`DirectSaleService.createAmendedVersion(tenantId, actorUserId, payload, chain)` which skips
number reservation and writes the inherited `rootId`, `version + 1`, `saleNumber`. Do **not**
thread an optional `chainOverride` through the public `create()` — that invites misuse.
The invoice underneath still gets a genuinely new number (compliance).

### Route + list

- Detail: only when the fetched row is `voided`, one indexed lookup
  `WHERE tenant_id AND root_id ORDER BY version DESC LIMIT 1`. Return `currentVersionId` as
  **data**, don't silently redirect server-side (audit views legitimately want the historical
  snapshot). Frontend does `router.replace` and reuses the existing `stale` banner pattern in
  `direct-sale-detail-panel.tsx:43-60`.
- List: `SELECT DISTINCT ON (tenant_id, root_id) ... ORDER BY tenant_id, root_id, version DESC`,
  backed by the same index. Fully-cancelled chains still surface (their voided tip is the
  chain representative) — falls out of the query shape for free.

### Generality — do NOT over-extract

`direct_sales` is a genuine special case: an anchor with **no number of its own**, borrowing
another document's. Invoices/bills/credit notes already own a proper document number, so the
"tax number must change but user-facing number must not" conflict doesn't apply to them the
same way. Extract only `resolveChainTip(db, tenantId, table, rootCol, versionCol, id)` into
`common/amend/`. Everything else stays per-entity until a second adapter actually needs it.

### Migration safety

Tail was **0220** at time of research, with 0218-0220 uncommitted (order-level discount +
delivery fee on `sales_invoices`, and the coa cash-equivalent backfill) — different tables,
no column collision. Re-check `git status --short packages/db` at implementation time, run
`npx drizzle-kit generate` (never `push`), and never hand-edit `_journal.json`'s `when`.

---

## Execution order

1. Land the in-flight inventory/sales rewrite (not ours).
2. **A** (restock race) — makes the void atomic; deletes the retry band-aid.
3. **B** (cost basis) — depends on A being in place for `originalCostLots` to be reliable.
4. **C** (identity overlay) — independent of A/B, blocked only on `sales.ts`.
5. Serial/batch capture on direct sale (defect #5 in the findings doc).
6. UI: detail page rebuild, then tiered Edit.

Integration tests are the throughline — every amend test today mocks `directSale.create`
itself, which is why two silent data-loss paths shipped into a live endpoint.
