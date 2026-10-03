<!-- Zerupt internal knowledge base | Migration intake: what already exists | Updated: 2026-10-02 -->
# What already exists

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** far more migration machinery is already built and shipped than anyone assumed, and the genuinely new work is smaller than it looked.

---

## 1. The path is templates, not Mira

**Founder ruling, and it stands: migration runs on templates.** The customer's data arrives in our spreadsheet templates, and the template importers load it. We do not route migration through the AI-driven Mira flow.

Mira exists in the codebase, and the audit found it wired up. **It is not the migration path**, because it does not work reliably enough to stake a customer's books on. It is recorded here only so nobody rediscovers it and assumes it is the answer.

The good news does not depend on Mira at all. **The template importers already cover most of the layers:**

| Layer | What loads it today |
|---|---|
| 0. Identity | Tenant signup |
| 1. Structure | Branch and warehouse setup. Numbering is the gap |
| 2. Financial foundation | The chart of accounts and mapping setup steps |
| 3a. Items | The item import template |
| 3b. Parties | The books template's customer and supplier sheets |
| 4. Opening position | The books template for balances, the opening import for stock |
| **5. History** | **The sales template, for sales only. Everything else is the build** |
| 6. People | Created one at a time, silently |
| 7 and 8 | Settings and reports that already exist |

So the new work is still Layer 5, replaying the history, and it is still the only layer that needs a real engine.

---

## 2. Every import that exists today

| Import | Does it post? | Notes |
|---|---|---|
| **Sales import** | **Yes.** One sale at a time through the normal sale machinery | The closest thing to a replay engine we have |
| Purchase import | **No.** Draft purchase orders only | ⚠️ The name is misleading. Not a migration path |
| Books import | Yes. The opening trial balance and party balances | Uses its own older tracking |
| Inventory import | Creates items and categories in bulk | |
| Opening import | Yes. Opening stock and balances | Uses its own older tracking |
| Mira unified import | Yes. Masters and the opening position | ⚠️ Wired up, but **not our path**. Unreliable. Do not build on it |

Older imports keep their own tracking tables, and newer ones use the shared one. That is a deliberate split, not an accident.

---

## 3. The shared parts we get for free

| Piece | What it does |
|---|---|
| **Run tracker** | One row per run with status, totals, progress, and a fingerprint so a repeat is safe |
| **Lease and heartbeat** | A crashed run can be reclaimed. A sweeper checks every few hours |
| **Job queue** | The standard way long jobs run. No polling |
| **Column resolver** | Works out which column means what, with confidence scoring, deterministic rules first and AI only as a fallback |
| **Learned decisions** | Remembers what a person chose last time and suggests it again, never applying it automatically |
| **Progress reporting** | Real counts of done against total, shown in the interface |
| **Duplicate protection** | Content fingerprinting |

**The worker pattern already does exactly what a replay needs:** post one document at a time, no wrapping transaction, and whatever succeeded stays. Document 900 failing does not undo document 899.

One detail worth copying rather than rediscovering: **workers run outside a web request**, so they have to resolve the customer's database explicitly. The existing workers do this correctly.

---

## 4. What we reuse, extend and build

### Reuse exactly as it is

- The run tracker, with a new kind of run for document replay
- The queue and worker pattern, copied from the sales import
- The fingerprint approach for safe repeats
- **The real posting services for every document type.** Never reimplement stock, cost, tax or numbering
- The progress and status reporting

### Extend

- **The template importers**, which already cover masters and the opening position. A history replay becomes a new phase after them
- The column resolver, so a customer's own spreadsheet columns can be matched to our template columns

### Do not use

- **Mira.** It is in the codebase and it is not reliable. Migration runs on templates

### Genuinely new

1. **A replay engine that handles more than one document type.** The sales import only knows about sales. History contains purchases, transfers, adjustments, receipts, payments and journals
2. **Intake for large volumes.** Existing imports assume one uploaded file. Tens of thousands of documents needs proper batching, and the current progress field was not designed for it
3. **The reconciliation report.** A wrapper over reports that already exist
4. **The document identity fix.** Keeping the original number, plus a field to record where a record came from
5. **The cost fix on sales.** Threading the existing cost parameter through the migration path

---

## 5. What this means for effort

| Layer | Status |
|---|---|
| 0. Identity | Exists |
| 1. Structure | Mostly exists. Numbering is the gap |
| 2. Financial foundation | Exists |
| 3. Masters | Exists, through the item and books templates |
| 4. Opening position | Exists, through the books template and the opening import |
| **5. History** | **The build** |
| 6. People | Exists |
| 7. Peripherals | Exists, with two product gaps |
| 8. Proof | Reports exist. The comparison is a wrapper |

**One layer out of nine is the real work.** That is a very different project from the one we started describing a week ago.

---

## 6. Open questions

1. How large can the progress field realistically get before it becomes a problem?
2. Do the existing templates cover every field this specification says we need, or do some templates need extra columns?
3. Is a template needed for each history document type, or does history arrive another way?

---

## 7. Status update: what has been built since

Several of the "genuinely new" items above now exist. The replay engine lives inside the backend as a service (`apps/api/src/migration-replay/`) and its record schemas and problem codes live in `packages/shared/src/migration-replay/`. The first adapter is [the Merpec exporter](merpec-exporter.md).

### 7.1 Performance and operations

**The accounting outbox poller works per tenant now.** Replay posts documents faster than the old poller drained them, and one busy tenant used to wake every tenant's database. Now:

- A nudge (the wake-up sent after a commit) **carries its tenant id**. Only that tenant goes "hot", on its own ladder (1 second, 2, 4 and so on, dropping off when idle). The global idle ladder is not reset, so one tenant's activity no longer wakes the fleet. A nudge with no tenant id still resets the global ladder, as a safe default.
- A hot tenant is **drained for up to 20 rounds** of 10 rows in one tick, stopping early at a short round, a round that made no progress (only deferrals), or **20 seconds** of wall clock, so a slow tenant cannot hold the poller's lock against others.
- A full sweep of every tenant still runs on the slow ladder, one round per tenant. It is the crash-recovery safety net.
- **Reconcile runs only on a sweep**, never on a hot tick, so a tenant's first nudge never pays for the drift scan.
- Every timer arm is floored at the **minimum interval** (1 second), so a tick that finds the poller busy cannot re-arm at zero and spin.

*Code: `accounting-events/outbox-poller.service.ts`, `outbox-hot-ladder.ts`, `accounting-events.constants.ts`.*

**The direct sale reads its items in one query.** `DirectSaleService` loads every line's item with one batched read (`preloadItems`) instead of a full read per line. Errors come out the same, in line order.

**The history runner settles the outbox at three points:** each business-day boundary after something was applied, before a sale that needs the live cost average (see [Layer 5a](layer-5a-sales.md)), and at the end of each layer. A dead letter pauses the run.

### 7.2 Migrations this work depends on

These must be applied before the replay engine and the changes in this document work. Tenant database, in `packages/db/drizzle/`:

| Migration | What it adds |
|---|---|
| 0421 | Supplied-number and source reference columns on `sequence_reservations` (keeping the customer's document numbers) |
| 0422 | The migration bundle and record tables |
| 0423 | A bundle, layer and status index on migration records, and a check that a record's step is `post` or `void` |
| 0424 | `pinned_short_qty` on item cost pools, with bounds checks |
| 0425 | `journal_entries.migration_bundle_id`, which bundle's replay posted an entry |
| 0426 | Named print layouts (several named layouts per scope and document type, one default). Not migration-specific, but part of the same range |
| 0427 | **Settlement discount** as a first-class figure on sales and purchase invoices, receipt and payment allocations and vouchers, and the confirm-percent setting. The invoice balance check now subtracts it |
| 0428 | The `tcn` (tax credit note) document type |
| 0429 | A 0 to 100 check on the settlement-discount confirm percent |

Admin database, in `packages/db-admin/drizzle/`: **0053** adds `tenants.data_migration_enabled` (default false), a guard refuses the migration routes for a tenant until an admin turns it on.

