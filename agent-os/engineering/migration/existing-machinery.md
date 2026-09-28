<!-- Zerupt internal knowledge base | Migration intake: what already exists | Updated: 2026-09-27 -->
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
