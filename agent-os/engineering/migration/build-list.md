<!-- Zerupt internal knowledge base | Migration intake: what we must build | Updated: 2026-09-27 -->
# What we must build

Part of the [Zerupt Migration Intake Specification](README.md).

Every gap found across the nine layers, in one place, ordered by how much it matters.

---

## 1. Must build before any real migration

### 1.1 Keep the customer's document numbers 🔴

**The problem:** every document number comes from our own counter. No document type anywhere accepts a number from the caller. So their invoice 100001 becomes our invoice 1, and their paperwork, their messages and their customer conversations all stop matching.

**The build:** a migration-only way to supply the number, plus a place on the document to record where it came from. Setting the counter to continue afterwards already works.

**Also fixes:** the missing source reference found in Layer 7, which is the same problem.

*Found in: [Layer 1](layer-1-structure.md), [Layers 7 and 8](layer-7-8-peripherals-proof.md)*

---

### 1.2 Use the customer's cost on historical sales 🔴

**The problem:** no public path accepts a cost on a sale, so a replayed sale is costed at today's average. Every historical profit figure would differ from what they are used to.

**The build:** thread the existing cost parameter through the migration path. **The mechanism already exists** and is used by the amend process and by goods returns, which already put stock back at the original cost. This is wiring, not invention.

*Found in: [Layer 5a](layer-5a-sales.md)*

---

### 1.3 The replay engine 🔴

**The problem:** the sales import only knows about sales. History contains purchases, transfers, adjustments, receipts, payments and journals.

**The build:** a worker that walks documents in date order and posts each one through its proper service, copying the existing sales import pattern: one document at a time, no wrapping transaction, whatever succeeded stays. Reuses the run tracker, the queue, the lease and heartbeat, and progress reporting.

**Must handle:** resuming after a crash, batching large volumes, recording what could not be posted, and generating stable keys so repeats are safe.

*Found in: [existing machinery](existing-machinery.md)*

---

### 1.4 The reconciliation report 🔴

**The problem:** without it we cannot prove anything, and we have no way to find our own mistakes.

**The build:** a wrapper that calls reports that already exist, compares them to the customer's own figures, and lists the differences. Plus the two existing reconciliation detectors for stock and for party balances.

**Build it early.** It is the debugging tool for the whole project, not a certificate at the end.

*Found in: [Layers 7 and 8](layer-7-8-peripherals-proof.md)*

---

### 1.5 Migration mode 🟠

**The problem:** several settings would block or disturb a replay, and there is no single switch.

**The build:** snapshot the tenant's settings, relax negative stock and the approval gates, disable the notifications that can be disabled, run, then **restore exactly what was there before**.

*Found in: [Layers 7 and 8](layer-7-8-peripherals-proof.md)*

---

### 1.6 Duplicate protection for receipts and payments 🟠

**The problem:** unlike sales and purchases, these do not accept a key, so a retry creates a duplicate.

**The build:** our own check before creating each one, using their original reference.

*Found in: [Layer 5c](layer-5c-money.md)*

---

## 2. Needs a decision before we can finish the design

### 2.1 Journals that touch a customer or supplier ✅ RESOLVED

**Answer: yes, and no engine work is needed.**

The low-level posting method already accepts the customer or supplier and the due date on each line. Three services already call it directly, including the opening balance service, which posts party-tagged receivable and payable lines exactly the way a migration needs to.

What must be avoided is the manual journal screen's own input shape, which has no such fields. That path is a dead end.

**The consequence, and it shapes the whole build:**

> **The replay engine has to live inside the backend as a service, not outside as a script calling the web interface.**

That is a better design anyway. It gets transactions, locks, the tenant's database connection and every existing guard for free, and it copies a pattern that is already proven three times over in the codebase.

**What the engine must resolve for itself**, because the low-level method does none of it: the accounting period for the date, the accounts from the mapping, the exchange rate, the document number, and who posted it.

*Found in: [Layer 5c](layer-5c-money.md)*

### 2.2 Counter sales need a till session 🟠

A POS transaction requires a register and a shift. Options: invent shifts, bring counter sales in as ordinary invoices, or skip POS history. **Per customer decision.**

*Found in: [Layer 5a](layer-5a-sales.md)*

### 2.3 Salespeople who are not users 🟠

No staff record exists for people who do not log in, and the cashier on a till sale must be a real user. **Create placeholder accounts, or lose the reporting?**

*Found in: [Layer 3b](layer-3b-parties.md), [Layer 6](layer-6-people.md)*

### 2.4 Attachments 🟠

There is no attachment mechanism at all. **Build one, or tell customers their scanned documents cannot come across?**

*Found in: [Layers 7 and 8](layer-7-8-peripherals-proof.md)*

### 2.5 Opening stock exactly once 🟠

Running it twice doubles the stock, and nothing prevents it. **Our tool must guarantee it, or the system should.**

*Found in: [Layer 4](layer-4-opening.md)*

---

## 3. Smaller gaps, worth knowing

| Gap | Where | Impact |
|---|---|---|
| A fourth price level is not wired into the item import | [Layer 3a](layer-3a-items.md) | Only if the customer uses one |
| Transfers and adjustments will not take a cost | [Layer 5b](layer-5b-purchase-stock.md) | Their historical value cannot be reproduced exactly |
| Freight split by weight or by hand cannot be reproduced on the quick path | [Layer 5b](layer-5b-purchase-stock.md) | Needs the longer landed-cost route |
| Serial numbers cannot be set at opening | [Layer 4](layer-4-opening.md) | Blocks serial-tracked businesses only |
| A zero unit cost is refused | [Layer 4](layer-4-opening.md) | Free stock has no route |
| A voided document must be posted then reversed | [Layer 5c](layer-5c-money.md) | Two entries instead of one. Explain it |
| Cheques need their whole life replayed | [Layer 5c](layer-5c-money.md) | Real work for a cheque-heavy business |
| Customer codes are case-sensitive, supplier codes are not | [Layer 3b](layer-3b-parties.md) | Clean customer codes before import |
| Named payment terms do not exist | [Layer 3b](layer-3b-parties.md) | Terms collapse to a number of days |
| Credit limits are not enforced on documents | [Layer 3b](layer-3b-parties.md) | Only affects daily use, not migration |
| Only weighted average costing | [Layer 3a](layer-3a-items.md) | A FIFO source cannot be reproduced exactly |
| Totals are always recalculated | [Layer 5a](layer-5a-sales.md) | Test against real VAT data early |

---

## 4. Questions still open

| Question | Why it matters | Where |
|---|---|---|
| Can a migration use the internal posting route? | Decides whether party journals can be replayed | [Layer 5c](layer-5c-money.md) |
| Is any automatic email sent to customers on document creation? | A replay could email three years of documents | [Layers 7 and 8](layer-7-8-peripherals-proof.md) |
| Do tax rates carry history far enough back? | Old documents could be taxed at today's rate | [Layer 5a](layer-5a-sales.md) |
| Can a hard-locked period be reopened, and by whom? | Fixing a mistake after a year is locked | [Layer 1](layer-1-structure.md) |
| What is the full list of role names for control accounts? | Needed to build the account mapping | [Layer 2](layer-2-financial.md) |
| Where is the auto-parts pack switched on? | Everything about parts items assumes it is on | [Layer 3a](layer-3a-items.md) |
| Do transfers and adjustments have a locked-period override? | Purchases do | [Layer 5b](layer-5b-purchase-stock.md) |
| Do the existing templates carry every field this spec needs? | Missing columns become template changes | [existing machinery](existing-machinery.md) |

---

## 5. What this adds up to

**Four things must be built, one must be decided, and the rest are known limits to be explained rather than engineered around.**

Nothing on this list is an architectural problem. The two most important fixes, document identity and historical cost, are both small changes to paths that already exist. The replay engine is a new worker built from parts that are already proven in the sales import.

The largest risk left is not technical. It is agreeing with each customer, in advance and in writing, which numbers must match exactly and which differences are acceptable.
