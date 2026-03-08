# Offline Mode

> What works offline, how transactions queue locally, and how sync resolves conflicts on reconnect.

## Offline Capabilities

| Feature | Offline Support | Notes |
|---------|----------------|-------|
| New sale transactions | Full | Prices, tax from local cache |
| Returns (with receipt) | Full | If original transaction is in local cache |
| Returns (without receipt) | No | Requires server lookup |
| Hold / Recall | Full | Local to register |
| Void (before payment) | Full | |
| Void (after payment) | Full | Manager PIN validated locally |
| Cash payments | Full | |
| Card payments | Depends | Terminal may have offline mode |
| Store credit payments | Limited | Uses last-synced balance, reconciled on sync |
| Gift card payments | Limited | Uses last-synced balance, reconciled on sync |
| Discounts | Full | Thresholds + manager PINs cached locally |
| Coupon codes | Limited | Uses locally cached coupon data |
| Price lookup | Full | Price lists cached locally |
| Stock display | Stale | Shows last-synced stock levels |
| Shift open/close | Full | Synced on reconnect |
| Z-report generation | Full | Local calculation |
| Customer lookup | Limited | Recently used customers cached |
| New customer creation | Queued | Created on sync |

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

## Transaction Numbering

1. Online: server assigns sequential `transactionNumber`
2. Offline: POS generates temporary number `OFF-{registerId}-{localSequence}`
3. On sync: server assigns final sequential number (gaps are acceptable)
4. Receipt shows offline number; reprint after sync shows final number
5. Both numbers stored for audit trail

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
