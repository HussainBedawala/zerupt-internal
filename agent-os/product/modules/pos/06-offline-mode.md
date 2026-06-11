# Offline Mode

> What works offline, how transactions queue locally, and how sync resolves conflicts on reconnect.

## v1 Scope (DEV-394, decided 2026-06-05)

**Architecture decision: one code path, local-first always.** The register cart never
waits on the network — every cart action hits IndexedDB; every completed sale (and shift
open/close event) enters the sync queue. Online just means the queue drains immediately.
The server-side draft-cart API remains for back-office/audit but the register no longer
depends on it mid-sale.

- **Money:** client computes totals via a shared money module (`packages/shared`,
  extracted from the API's POS totals/rounding code — single source, tested for parity).
  Server **always recomputes** at sync; a mismatch is stored and flagged for review,
  never silently accepted and never rejected (the sale already happened — cash is in
  the drawer).
- **Idempotency:** every offline-created entity carries a client-generated UUID
  (`clientId`); server enforces a unique `(tenant_id, client_id)` index and returns the
  existing record on duplicate replay.

| In scope v1 | Online-only v1 (reason) |
|---|---|
| Full sale lifecycle (scan, line edit, discounts, hold/recall, cash + card pay) | Returns — the returns feature does not exist yet at all; will reuse this queue when built |
| Shift open/close offline (queued events) | Void of an already-synced sale — server-side GL/inventory reversal can't be reasoned about offline |
| Z-report computed locally from local data | Store credit / gift card tenders — stale balances allow double-spend across registers |
| Void of an unsynced local sale (= remove from queue, confirmed + locally audited) | Customer lookup / creation — low frequency at register; additive follow-up on the same IndexedDB layer |
| Catalog/price/tax cache + offline barcode scan | Coupon codes — deferred with discounts/coupons feature |
| Offline receipts (local data, `OFF-` number) | |

## Offline Capabilities (target; v1 column per scope above)

| Feature | Offline Support | Notes |
|---------|----------------|-------|
| New sale transactions | Full | Prices, tax from local cache |
| Returns (with receipt) | Full (post-v1) | If original transaction is in local cache |
| Returns (without receipt) | No | Requires server lookup |
| Hold / Recall | Full | Local to register |
| Void (before payment) | Full | |
| Void (after payment, unsynced) | Full | Removes from local queue; locally audited |
| Void (after sync) | No (v1) | Online-only |
| Cash payments | Full | |
| Card payments | Depends | Terminal may have offline mode |
| Store credit payments | No (v1) | Stale balance = double-spend risk |
| Gift card payments | No (v1) | Stale balance = double-spend risk |
| Discounts | Full | Thresholds + manager PINs cached locally |
| Coupon codes | No (v1) | Deferred with coupons feature |
| Price lookup | Full | Price lists cached locally |
| Stock display | Stale | Shows last-synced stock levels |
| Shift open/close | Full | Queued events, synced on reconnect |
| Z-report generation | Full | Local calculation via shared money module |
| Customer lookup | No (v1) | Recently-used cache is a post-v1 follow-up |
| New customer creation | No (v1) | Post-v1, queued on sync |

## Local Data Cache

Data synced to each register for offline use:

| Data | Sync Frequency | Storage |
|------|---------------|---------|
| Item catalog (name, SKU, barcode, price) | Every 15 min + on change | IndexedDB |
| Price lists (active) | Every 15 min + on change | IndexedDB |
| Tax groups and rates | On change | IndexedDB |
| Coupon codes (active) | Every 15 min | IndexedDB |
| Stock levels (per warehouse) | Every 15 min | IndexedDB |
| Customer list (recent 500) | Every 30 min | IndexedDB |
| Manager PINs (hashed) | On change | IndexedDB |
| Register configuration | On change | IndexedDB |
| Pending transactions (own) | Real-time | IndexedDB |

## Offline Queue

Transactions created offline are stored in a local queue.

| Field | Type | Description |
|-------|------|-------------|
| `localId` | UUID | Client-generated UUID (v4) |
| `registerId` | UUID | Register identifier |
| `payload` | JSON | Full transaction data |
| `createdAt` | DateTime | Local timestamp |
| `syncStatus` | Enum | `Pending`, `Syncing`, `Synced`, `Failed` |
| `syncAttempts` | Integer | Number of sync attempts |
| `syncError` | String | Last error message if failed |
| `serverTransactionId` | UUID | Assigned after successful sync |

## Sync on Reconnect

1. POS detects connectivity restored
2. Queue processed in FIFO order (oldest first)
3. Each transaction sent to server individually
4. Server validates and assigns final `transactionNumber`
5. On success: `syncStatus → Synced`, `serverTransactionId` stored
6. On failure: `syncStatus → Failed`, error logged, skip to next
7. Failed items retried up to 5 times with exponential backoff
8. After 5 failures: flagged for manual review by manager

### Sync Order

1. Shift open events (if shift was opened offline)
2. Completed transactions (in order of `createdAt`)
3. Void transactions
4. Return transactions
5. Shift close events

## Conflict Resolution

| Conflict | Resolution |
|----------|------------|
| Item price changed since cache | Use price at time of sale (offline price honored) |
| Item deactivated since cache | Transaction syncs with warning flag |
| Stock went negative after sync | Allowed — follows tenant's negative stock policy (see `inventory/10-negative-stock.md`) |
| Coupon exceeded max uses | Transaction syncs, coupon marked as over-redeemed, flagged for review |
| Store credit insufficient on server | Transaction syncs, store credit goes negative, flagged for review |
| Gift card insufficient on server | Transaction syncs, gift card goes negative, flagged for review |
| Duplicate `localId` | Idempotent — server rejects duplicate, returns existing record |
| Customer not found | New customer record created from offline data |

## Transaction Numbering (decided 2026-06-05)

1. Device assigns `OFF-{registerCode}-{shiftNumber}-{localSequence}` at completion time
   (local-first: assigned even when online, since the cart never waits on the network)
2. On sync: server assigns the final sequential `transactionNumber` under the existing
   per-shift advisory lock (gaps are acceptable)
3. Receipt shows the offline number; reprint after sync shows the final number
4. Both numbers stored for audit trail (`offline_number` column alongside
   `transaction_number`; `client_id` UUID is the idempotency key)

## Offline Detection

1. POS pings server every 10 seconds
2. After 3 consecutive failed pings: status → Offline
3. UI shows offline indicator (persistent banner)
4. On first successful ping: status → Online, sync begins
5. All offline operations logged with `isOffline = true` flag

## Rules

1. POS must function fully for sales even without connectivity
2. No data is lost — all offline transactions are persisted in IndexedDB
3. IndexedDB data survives browser refresh and restart
4. Cache is per-register (each register maintains its own local store)
5. Stale cache warning: if cache is older than 1 hour, show warning to cashier
6. Full cache refresh can be triggered manually by manager
7. Offline mode does not affect cash drawer or receipt printer (local hardware)
