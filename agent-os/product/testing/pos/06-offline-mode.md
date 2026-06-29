# POS — Offline Mode Testing Checklist

> Persona: **Counter cashier.** The internet dropped. Customers are still in the queue. You keep ringing up sales. Ask at every screen: **"what's the dumbest thing a cashier could do here, at speed, with a customer waiting?"**

- **Route(s):** `/pos` (IndexedDB-backed, transparent to cashier); back-office sync status (exact route unconfirmed — verify)
- **Feature dir:** `apps/web/src/app/[locale]/(pos)/pos/` — offline service worker / IndexedDB layer
- **Sync API:** `POST tenant/pos/sync/shifts/open`, `POST tenant/pos/sync/transactions`, `POST tenant/pos/sync/shifts/close`
- **Tables:** `pos_transactions` (`isOffline`, `offlineNumber`, `clientId`), `pos_shifts` (`clientId`, `isOffline`)
- **Depends on:** 01-register-session (shift opened while online; offline mode kicks in mid-session), 02-transaction-lifecycle (transactions created offline).

## 0. Preconditions

- [ ] A shift is open and the POS is in a known online state.
- [ ] At least one sale has been completed online so there is a baseline for comparison.
- [ ] A mechanism to simulate network loss is available (DevTools offline mode, or physically disconnecting).
- [ ] Know which features are explicitly blocked offline (store credit, gift card) before starting.

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Offline detection & UI feedback

- [ ] **Offline indicator appears** — within a few seconds of losing connectivity, the POS displays a clear offline banner or status indicator; cashier is never left guessing.
- [ ] **Offline indicator clears** — when connectivity restores, the indicator disappears and sync begins automatically.
- [ ] **Blocked feature warning** — if cashier attempts to use store credit or gift card while offline, a clear "not available offline" message is shown before they reach the payment confirmation step; not a silent failure after the cashier has already told the customer it's fine.

### Offline transactions

- [ ] **Add lines and complete a sale offline** — the transaction is saved to IndexedDB; a temporary `offlineNumber` (with "OFF-" prefix or similar) is shown on screen and on the local receipt.
  - [ ] QR code / public receipt URL is NOT available until after sync — the offline receipt should clearly state "Sync pending — QR available after reconnect" or similar; not a broken QR.
  - [ ] `isOffline = true` and `offlineNumber` are set in the local record.
  - [ ] `clientId` is generated client-side; it is globally unique per tenant (e.g. UUID).
- [ ] **Multiple sales offline** — cashier completes 5+ transactions offline; all are queued in IndexedDB in the order completed.
- [ ] **Hold and recall offline** — parked transactions survive a page refresh while offline (IndexedDB is persistent).
- [ ] **Void offline** — cashier voids an offline transaction before sync; both the sale and the void are queued; on sync the server processes the sale and then the void in FIFO order.

### Sync after reconnect

- [ ] **Sync fires automatically on reconnect** — no manual sync button required (though a manual trigger should exist as a fallback).
- [ ] **FIFO sync order respected** — transactions are submitted in the order: shift open (if opened offline) → transactions (in creation order) → voids and returns → shift close (if closed offline). Out-of-order sync is not attempted.
- [ ] **Server recomputes totals at sync** — the server does not trust client-computed `grandTotal`, `taxTotal`, etc.; it recomputes from the line items. A mismatch between client-stored total and server-computed total is stored as a flag/warning and surfaced to the manager — not silently accepted or rejected.
- [ ] **`clientId` idempotency** — if the same sync payload is submitted twice (e.g. network drops mid-sync and the client retries), the server returns the existing record rather than creating a duplicate; the `clientId` unique index enforces this.
- [ ] **`transactionNumber` assigned at sync** — after sync, the offline transaction gets a real `transactionNumber` (replacing the `offlineNumber`); the receipt QR becomes available.
- [ ] **Sync failure after 5 retries** — if sync fails after 5 retries, a clear alert is shown in the back-office (not just in browser console logs); the manager can see which transactions are pending and take manual action.
- [ ] **Sync failure surfacing** — sync errors appear in the back-office "pending sync" panel or similar; a cashier leaving at end of shift with unsynced transactions is warned and cannot close the shift normally until either synced or manually overridden by a manager.

### Shift opened offline

- [ ] **Shift opened while offline** — the shift is created in IndexedDB with `isOffline = true` and a client-generated `clientId`; it syncs as the first step when connectivity returns.
- [ ] **Shift closed offline** — shift close is queued; synced as the last step after all transactions for that shift are synced.

## 2. Domain invariants (cash / GL / stock)

- [ ] **`clientId` uniqueness per tenant:** every offline transaction and shift record has a `clientId` that is unique within the tenant; the server-side unique index enforces idempotent replay; duplicate `clientId` on sync returns the existing record, not a 500.
- [ ] **`isOffline = true` and `offlineNumber` are non-null for all offline transactions:** no offline transaction is synced with `isOffline = false` or a null `offlineNumber`; these fields are set client-side before sync and the server preserves them.
- [ ] **Server recomputes totals on sync; mismatch is stored and flagged:** the server never silently accepts a client-total that differs from its own computation; nor does it reject the sync (which would lose data). The mismatch is stored in a `syncFlags` column or similar and surfaced in a back-office alert.
- [ ] **QR / receipt token not minted until post-sync:** the public receipt URL references a `receipt_tokens` row in the admin DB; this row must not exist until the transaction is synced and `transactionNumber` is assigned. An offline receipt shown to the customer before sync should carry only the `offlineNumber`.
- [ ] **Store credit and gift card are hard-blocked offline:** no offline transaction record can have a store credit or gift card tender line; the client enforces the block before the cashier gets to the payment step, and the sync API rejects any such line if it somehow arrives.
- [ ] **FIFO sync ordering:** the sync API must process transactions in the correct order; if the API receives an out-of-order request (e.g. a transaction referencing a shift that has not yet been synced), it must queue or reject the request with a retriable error — not create orphan records.

## 3. Edge cases & defensive UX — "the dumbest thing a cashier could do here"

- [ ] **Cashier refreshes the browser while offline mid-sale:** the in-progress transaction (if auto-saved to IndexedDB) is restored on reload; cashier is not dropped to a blank cart.
- [ ] **Cashier closes the browser tab while offline:** IndexedDB data survives; on reopening the tab and going to `/pos`, unsynced transactions are still visible in the held/pending list.
- [ ] **Connectivity restored mid-payment:** cashier is in the payment step when connectivity returns; the sync of previous offline transactions should not interrupt the current payment flow.
- [ ] **Clock skew:** cashier's device clock is significantly different from the server clock; offline transaction `createdAt` may be backdated or future-dated at sync. Confirm the server uses server-side `NOW()` for the final `createdAt` while preserving the client-side `offlineCreatedAt` for audit.
- [ ] **Cache staleness > 1 hour:** item prices or stock statuses cached in the local DB are more than 1 hour old; the POS shows a "prices may be outdated" warning but does not block the sale. Confirm this warning exists and the threshold is configurable.
- [ ] **Trying to apply a coupon offline:** clearly blocked before the cashier enters the code; not a timeout or network error.
- [ ] **Sync from two devices simultaneously for the same shift:** each device's transactions have distinct `clientId` values; the server accepts both; no cross-device collision.
- [ ] **Very large offline queue (50+ transactions):** sync completes without timeout; progress is visible; no single large payload that exceeds server body limits.

## 4. Cross-module / integration

- [ ] After sync, each offline transaction's `pos.transaction.completed` event fires; GL and inventory listeners process correctly just as they would for an online sale.
- [ ] The Z-report for a shift that had offline transactions shows the correct totals, including all synced-offline transactions; no gap in expectedCash or transaction count.
- [ ] Voided offline transactions are fully reversed in both inventory and the GL after sync, identical to an online void.
- [ ] Offline returns (if supported): verify the return's originalTransactionId is validated post-sync; a return against an as-yet-unsynced offline sale must either be blocked offline or held for validation at sync time.

## 5. Known gaps (from recon — verify or track)

- **Store credit / gift card balance double-spend** — when offline, the local cache may show a valid balance that has since been spent on another device or another cashier's station. If the hard block is only client-side, a tampered client could still submit a store credit line at sync. Confirm the sync API rejects store credit / gift card lines unconditionally when `isOffline = true`. **CRITICAL**.
- **Sync failure after 5 retries — manual review path** — the spec states that sync failure → manual manager review; whether a back-office UI surface exists to list unsynced transactions is unconfirmed. If it is logs-only, this is a **HIGH** operational gap; a manager cannot act on a log line at end of shift.
- **Cache staleness > 1 h warns but does not block** — item prices cached more than 1 hour ago may have been updated (sale price change, deactivation); selling at the old price is a margin risk. The warning exists in spec but its visual prominence is unconfirmed. **MEDIUM**.
- **Clock skew handling** — whether the server reconciles client-side `createdAt` vs. server `NOW()` is unconfirmed; large clock skew could cause transactions to appear out of order in reports. **MEDIUM**.
- **Offline return support** — whether returns can be initiated offline at all is unconfirmed. If they are silently blocked, the cashier has no recourse for an offline return. If they are allowed, the `originalTransactionId` validation path at sync is complex. **MEDIUM** — confirm the design decision.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
