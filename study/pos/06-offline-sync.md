# POS Layer 6 — Offline Sync + Resilience

> Audit date: 2026-06-30. Read-only pass, no code changed.

---

## 1. Architecture Summary

The offline POS uses a per-register Dexie (IndexedDB) instance named `zerupt-pos-{registerId}` (`db.ts`, schema v3). Three queue stores are load-bearing at sync time:

- `saleQueue` — completed offline sales, keyed by UUID `localId`.
- `shiftQueue` — open/close shift events, keyed by UUID `localId`.
- (no movement queue — gap; see §3)

The sync engine (`sync/sync-engine.ts`) drains on reconnect in spec order: shift-opens → sales → shift-closes. A single `inFlight` flag serialises drains. Exponential backoff (2^attempt seconds, cap 5 attempts) re-arms after retryable failures. Permanent failures (4xx) exhaust the budget and wait for manager manual retry via `FailedSyncReview`.

The server (`pos-sync.service.ts`) recomputes all totals server-side — client math is never trusted. GL posting goes via transactional outbox (`ACCOUNTING_EVENTS.POST`) committed atomically with the sale insert.

---

## 2. Idempotency Audit

### 2a. Transactions (sales)

**Status: fully covered.**

Fast-path at `syncTransaction` (line 259–271):
```ts
const existing = await db.query.posTransactions.findFirst({
  where: and(eq(posTransactions.tenantId, tenantId), eq(posTransactions.clientId, input.clientId)),
});
if (existing) return { data: ..., created: false, replayed: true };
```

Race backstop: a 23505 unique-constraint error re-reads by `clientId` and returns the winner (lines 304–320). Emits nothing on replay. The (tenant_id, client_id) partial-unique index is the key.

**Payments on replay**: payment rows are inserted inside the same Drizzle transaction as the sale header. The idempotency fast-path fires before that transaction opens, so a duplicate clientId replay never reaches the payment insert. Payments cannot be double-inserted.

**Returns/refunds offline**: no offline return queue exists. Returns are server-only. Not a current gap — just not built.

### 2b. Shift-open events

**Status: fully covered.**

Same clientId fast-path before the advisory lock (lines 126–135). Advisory lock (`pg_advisory_xact_lock(hashtext(...))`) prevents shiftNumber collisions on concurrent replays. 23505 backstop re-reads by clientId. Same-cashier 409 → auto-resume via `resumeExistingShift`. Different-cashier 409 → structured conflict error routed to `FailedSyncReview`.

### 2c. Shift-close events

**Status: covered, by a different mechanism.**

Close idempotency is achieved via the shift `status` check (line 348):
```ts
if (shift.status === "closed") {
  return { data: ..., created: false, replayed: true };
}
```
The DTO's `clientId` is deliberately unused for close dedup (comment M3). This is correct: there is no "close event" row to key on; the shift row itself is the record.

**Gap**: a shift-close replayed while status is still `open` (e.g. the close committed but the ack was lost) will run `shiftsService.close()` again — Drizzle's `close()` must be idempotent or throw a harmless conflict. Worth verifying `pos-shifts.service.ts close()` handles double-close.

### 2d. Cash movements

**GAP — not queued offline.**

`CashMovementDialog` (`cash-movement-dialog.tsx` line 138, 366):
```ts
if (!shiftId) return;   // guard: dialog can open but submit is disabled
disabled={mutation.isPending || !shiftId}
```
When `shiftId` is null (shift not yet server-linked), the dialog opens, shows an amber warning, but the confirm button is disabled. Cash movements are impossible until the shift-open syncs. Deferred from L0.

---

## 3. Offline Cash-Movement Queue — Design Spec

### Problem
A cashier may need to pay-in petty cash or pay-out to a supplier while connectivity is down. Today the button is live but silently blocked by `!shiftId`.

### Design

**IndexedDB store (add to `db.ts` v4)**

Add `movementQueue` table:
```ts
movementQueue: "localId, syncStatus, createdAt"
```

**Row type (add to `types.ts`)**
```ts
export interface MovementQueueRow {
  readonly localId: string;           // UUID v4 idempotency key
  readonly shiftClientId: string;     // ties to shiftQueue.localId
  readonly kind: "pay_in" | "pay_out";
  readonly amount: string;            // decimal string
  readonly reason: string;
  readonly reasonCode: string | null;
  readonly approvedBy: string | null; // captured offline for pay_out
  readonly approvalPin: string | null;
  readonly createdAt: string;
  syncStatus: SyncStatus;
  syncAttempts: number;
  syncError: string | null;
  serverMovementId: string | null;
}
```

**Sync endpoint (new)**
`POST /tenant/pos/sync/movements`
- Body: `{ clientId, shiftClientId, shiftId?, kind, amount, reason, reasonCode?, approvedBy?, approvalPin? }`
- Server resolves shift by `shiftId` first, then `shiftClientId` (same pattern as transactions).
- Server validates approval PIN server-side at replay (same as online path).
- Idempotency: `(tenant_id, client_id)` partial-unique index on `pos_cash_movements`.
- Returns: `{ id, createdAt }`.

**Drain order (update `sync-engine.ts`)**
After shift-open events sync (step 1), before sales (step 2):
1. shift-opens
2. **movement events** (flush pending movements whose shift-open is Synced)
3. sales
4. shift-closes

A movement whose shiftClientId maps to a Failed shift-open is blocked exactly like sales.

**Dialog change (update `cash-movement-dialog.tsx`)**
- Remove `disabled={!shiftId}` guard on submit.
- When `shiftId` is null (offline), write to `movementQueue` instead of calling the mutation.
- Show "Queued for sync" toast instead of success.
- Keep the amber "shift not synced" info banner as context.
- Pay-out offline: capture `approvedBy` + `approvalPin` in the local row; PIN validation happens server-side at replay.

**Migration**: NO new tenant DB migration needed if `pos_cash_movements` already has a `client_id` nullable column. If not, add: `ALTER TABLE pos_cash_movements ADD COLUMN client_id UUID UNIQUE;` + partial-unique index on `(tenant_id, client_id) WHERE client_id IS NOT NULL`.

---

## 4. Stale-Price Enforcement — Design Spec

### Current state

`staleness.ts`:
```ts
export const STALE_CACHE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour
```
`stale-cache-banner.tsx` renders only when `isCacheStale(lastSyncAt, now)` — a low-prominence amber banner with a manual refresh button. No block, no forced confirm.

### Gap
A cashier can sell at prices that are 3, 6, or 12 hours stale with no friction. In MENA retail, price changes (VAT-inclusive promotions, daily specials) are common. An unknowing cashier commits a wrong-price sale that requires a credit note.

### Design

Add two additional thresholds to `staleness.ts`:

```ts
/** Warn with confirm dialog — cache is old but sale is still allowed. */
export const STALE_WARN_THRESHOLD_MS = 2 * 60 * 60 * 1000;   // 2 hours

/** Hard block — catalog is too stale to risk selling. */
export const STALE_BLOCK_THRESHOLD_MS = 4 * 60 * 60 * 1000;  // 4 hours
```

Use in `use-cart-actions.ts` (or `use-complete-sale.ts`) `completeSale()`:
- age ≥ WARN (2h) and < BLOCK (4h): show a confirm dialog ("Prices last refreshed X hours ago. Proceed?"). Cashier can override.
- age ≥ BLOCK (4h): block the Pay button entirely. Show an inline message in the cart panel directing the cashier to press "Refresh Catalog" or call their manager. New sale is disabled until catalog is refreshed.

The StaleCacheBanner at 1h remains — it becomes the advisory hint before the warn threshold kicks in.

The `isCacheStale()` function already accepts an injectable `thresholdMs` — no refactor needed, just call with the right constant.

---

## 5. Cash-Drawer Feedback — Design Spec

### Current state

`print-dispatcher.ts` (lines 192–200):
```ts
if (openDrawer && register.cashDrawerConnected) {
  printBytes = assemble([printBytes, cashDrawerKick()]);
}
const result = await printAgentClient.print(printBytes, target);
if (!result.ok) {
  throw new Error(`Agent print failed: ${result.message ?? result.code ?? "unknown"}`);
}
return { method: "agent", ok: true };
```

The drawer kick is bundled with print bytes in one agent job. If the print agent is unreachable or the drawer physically fails, execution falls through to `fallbackBrowserPrint()` and returns `{ method: "browser", ok: true, error: errorMsg }`.

In `local-sale-receipt.tsx` (line 116): offline receipts use `window.print()` directly — `dispatchReceiptPrint` is never called here. `dispatchReceiptPrint` is not called anywhere in production code (only in tests and `print/index.ts` export). So the drawer kick is currently never exercised in the receipt flow.

### Gaps
1. `dispatchReceiptPrint` is exported but not wired into `LocalSaleReceipt` — the drawer never kicks.
2. No caller inspects the `DispatchReceiptPrintResult` to surface failure to the cashier.

### Design

In `local-sale-receipt.tsx`, replace `window.print()` with `dispatchReceiptPrint(...)`:
- Pass `openDrawer: true` for cash sales (derive from `receipt.payments.some(p => p.method === "cash")`).
- On return: if `result.method === "browser" && result.error`, show a small toast: "Receipt printed but drawer did not open — open manually."
- If `result.method === "agent" && result.ok`, show nothing (success is silent).
- The `fallbackBrowserPrint` callback remains `window.print`.

This requires the `register` prop on `LocalSaleReceipt` (already present as `readonly register?: any` at line 21 — needs typing).

---

## 6. Post-Payment Dwell (L2 Coverage Check)

**Status: adequate.**

`pay-surface.tsx` phase `changeDue` (lines 252–282):
- Full-screen `CheckCircle2` (green) + large mono change amount.
- Explicit "Acknowledge" button (`POS_TID.paySurfaceAcknowledge`) transitions to receipt phase.
- Zero-change shows "no change" label.
- The cashier cannot accidentally skip this screen — Back is gone, the only action is Acknowledge.

No additional dwell work needed at L6. The `receipt` phase follows naturally.

---

## 7. Sync Failure Surfacing

**Status: solid, no silent data loss.**

- Failed sales land in `FailedSyncReview` with full `syncError` string, totals-mismatch diff table (`TotalsMismatchTable`), retry and void actions.
- Failed shift-events land in the same review surface; structured shift-conflict errors decoded via `decodeShiftConflict` into a human-readable register-in-use message.
- `SyncAttentionBanner` surfaces `failedCount > 0` prominently with retry-all action.
- L2-blocked tenders (gift_card, store_credit) filtered client-side (`BLOCKED_METHODS`) — never reach the server, so no sync rejection path.
- Total-mismatch is flagged (`totalsMismatch` on the row) but NOT rejected — server math wins; the mismatch is surfaced in review.
- The `removeUnsynced` guard (`sale-queue-repo.ts` lines 177–194) refuses to delete Synced or Syncing rows — no silent loss path.

**Minor gap**: failed shift-close events have no void action in `FailedSyncReview` (only retry). A shift-close that permanently fails (e.g. shift already closed on another device) needs a "dismiss" path so the manager isn't stuck.

---

## 8. Gaps Summary

| # | Gap | Severity |
|---|-----|----------|
| G1 | Cash-movement queue not built — movements blocked when offline | High |
| G2 | Stale-price enforcement is advisory-only — cashier can sell at 12h-old prices | High |
| G3 | `dispatchReceiptPrint` never called from `LocalSaleReceipt` — drawer kick never fires | Medium |
| G4 | No cashier feedback when drawer fails (result value not surfaced) | Medium |
| G5 | Failed shift-close has no "dismiss" in review — manager stuck if close permanently fails | Low |
| G6 | Double-close idempotency of `pos-shifts.service.ts close()` unverified | Low |
