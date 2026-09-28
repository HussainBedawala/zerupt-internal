<!-- Zerupt internal knowledge base | Migration intake: Layer 4 | Updated: 2026-09-27 -->
# Layer 4: Opening position (stock, balances and unpaid invoices)

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** the starting point of the story. What they own, what they owe and what is owed to them on day one.

---

## 1. Headline findings

**1. Unpaid invoices come across one by one, not as a lump sum.** ✅ This is much better than expected. Each unpaid customer invoice is posted individually, with its number, its date, its due date and the amount still outstanding, and the system creates a settlement stub for it. So aging works properly, and a payment received after go-live can be matched against the correct original invoice. This is exactly what a real business needs, and we get it for free.

**2. Opening stock and its accounting value are two separate jobs that must be made to agree.** Setting opening stock deliberately posts **no** accounting entry. The value goes into the books through a separate entry. Nothing checks that the two match. If our migration gets them out of step, stock and the books drift apart from day one, and the system will report the gap afterwards.

**3. Repeating the opening stock step doubles the stock.** There is no protection against running it twice, unlike the balances side which is safe to repeat. **Exactly-once is our responsibility.**

**4. Replaying the same document twice is safe.** Every stock movement carries a fingerprint worked out from the document, the movement type, the item and the line. Post the same thing again and it is quietly ignored. So a replay that dies halfway can be restarted without making a mess. This is a very big deal for us.

**5. The reconciliation tools already exist.** A stock value report per item and warehouse, a trial balance, a ledger browser, and a service that detects when the stock value and the accounts have drifted apart. Layer 8 does not need building from scratch.

---

## 2. Opening stock

| Field | Need | Notes |
|---|---|---|
| `warehouseId` | required | **One call per warehouse** |
| `occurredAt` | required | Backdating is allowed. Future dates are refused |
| `reason` | optional | Defaults to "Opening balance" |
| `lines` | required | Between 1 and **2,000 lines per call** |

Per line:

| Field | Need | Notes |
|---|---|---|
| `itemId` | required | |
| `quantity` | required | Must be positive |
| `unitCost` | **required, and above zero** | A zero would corrupt the average cost on the first purchase |
| `batchNumber`, `expiryDate` | optional | For batch-tracked items |
| Pack unit and quantity | optional | If given in a larger unit |

**Rules that shape our work:**

- The date must fall inside an **open** period. See [Layer 1](layer-1-structure.md).
- **The same item cannot appear twice in one call.** Quantities per item and warehouse must be combined first.
- **Maximum 2,000 lines per call.** A 9,200-item catalogue needs at least five calls per warehouse.
- **It posts no accounting entry.** On purpose, so the value is not counted twice.
- **It cannot be reversed** through the normal route. A mistake has to be corrected through the accounting side.
- **Running it twice doubles everything.** No guard exists.

⚠️ **One awkward rule:** the unit cost must be above zero. An item genuinely held at no cost, such as free samples, cannot be opened through this route. Needs a decision if a customer has such items.

---

## 3. Opening balances in the books

Four separate jobs, each with its own shape.

### Trial balance

A list of accounts with a debit or a credit. Two protections worth knowing:

- **Foreign currency fails loudly.** If a line is in a currency other than the company's own and no rate is supplied, it is refused rather than assuming 1 to 1.
- **A difference is plugged automatically** into an Opening Balance Equity account, but **if the plug is too large the whole thing is refused** unless we explicitly acknowledge it. So a half-imported trial balance cannot quietly slip through.

### Unpaid customer invoices, and unpaid supplier bills ✅

One line per invoice:

| Field | Notes |
|---|---|
| Customer or supplier | |
| Invoice or bill number | Their original number |
| Invoice or bill date | |
| Due date | Falls back to the document date |
| Currency, and rate if foreign | |
| **Amount still outstanding** | Not the original total. What is left |

This creates a proper settlement stub per invoice, so aging is right and later payments match the right document.

**These are safe to run again.** A party that already has an opening balance is skipped, not duplicated.

Note: **no tax is posted** on these lines, which is correct. The tax was already dealt with in the old system.

### Stock value

One entry putting the total value of stock into the books, matching the total of quantity times cost from the opening stock step.

**This is the one that must agree with section 2.** Same total, or stock and books disagree from day one.

---

## 4. The stock ledger

Every movement in and out is recorded here, and it is **append-only**. The database itself blocks changes and deletions, so corrections are always new entries. Good for audit, and it means we cannot patch over a mistake quietly.

Each entry records: item, warehouse, branch, legal entity, quantity (signed), unit cost, total cost, currency, the document it came from, the movement type, the effective date, and optionally batch, serial or bin.

**Two details that matter to us:**

1. **The fingerprint.** Every entry carries a value worked out from the document, movement type, item and line. Post the same movement twice and the second is ignored. **This is what makes a replay safe to restart.**
2. **The effective date drives reports**, not the date we happened to load it. So a backdated document appears in the right month.

The total cost must equal quantity times unit cost, checked by the database within a small tolerance. Our arithmetic has to be right.

---

## 5. Batch and serial tracking

| | Supported at opening? |
|---|---|
| Batch numbers with expiry | **Yes.** On each opening line |
| Serial numbers | **No.** The opening route has no field for them |

So a business tracking individual serial numbers cannot bring in their opening serials through the normal route. There is another route that accepts serials, but it is not the opening document type and it would post accounting entries we do not want.

**This needs solving before migrating any serial-tracked business.** It does not affect a parts wholesaler who does not use serials.

---

## 6. Cost behaviour we rely on

| Situation | What happens |
|---|---|
| Stock goes in | Average cost is recalculated, unless we supply the cost |
| Stock goes out | Cost comes from the pool, **or from the figure we supply** |
| On-hand reaches zero | The average is kept, unless it was never set, in which case the next receipt sets it |
| On-hand goes negative | The average freezes. A supplied cost can be adopted so a later correction does not double-count |

This is close enough to how most old systems behave that reproducing their history is realistic, as long as we supply their costs.

---

## 7. Reconciliation: already built ✅

| Tool | What it gives us |
|---|---|
| Stock levels report | Quantity and value per item and warehouse. Compare to theirs |
| Trial balance | The accounts side |
| Stock movement ledger | Every movement, to confirm each document landed |
| Inventory reconciliation service | Detects a gap between the stock value and the accounts, and can post a correction or park it |

That last one is effectively an automatic check on the very mistake described in finding 2.

---

## 8. Speed

| Fact | Consequence |
|---|---|
| A document's lines are written in one batch, with one lock each for costs and quantities | Already optimised. A previous version took 25 minutes for a 1,500-line opening and broke the connection |
| Locks are always taken in the same order | No deadlocks, but two documents touching the same item wait for each other |
| No bulk path across documents | **25,000 documents means 25,000 separate transactions** |
| Accounting entries for adjustments go through a queue | Not instant, which is fine for us |

**So a replay is one document at a time.** For a 25,000-document customer that is acceptable. For a customer with a million documents it would not be, which is where a bulk path becomes a real build.

---

## 9. Order of work

1. Post the opening trial balance.
2. Post unpaid customer invoices, one by one.
3. Post unpaid supplier bills, one by one.
4. Post opening stock, **once per warehouse**, in batches of up to 2,000 lines.
5. Post the matching stock value entry into the books.
6. Run the reconciliation check before loading any history.

---

## 10. What the old system must tell us

| We need | Notes |
|---|---|
| Trial balance at the opening date, by account | Must balance, or the difference is visible |
| Every unpaid customer invoice: number, date, due date, **amount still outstanding** | Not the original total |
| Every unpaid supplier bill: same | |
| Stock per item per warehouse: quantity **and unit cost** | Cost must be above zero |
| The total stock value | Must match quantity times cost |
| Batch numbers and expiry, if used | |
| Cash and bank balances | Part of the trial balance |

---

## 11. Traps

| Trap | Consequence |
|---|---|
| Opening stock run twice | **Stock doubles.** No protection |
| Stock value and the books not matching | They drift from day one, and the system will say so |
| Same item twice in one call | Refused |
| More than 2,000 lines in one call | Refused |
| A zero unit cost | Refused |
| Opening date in a locked period | Refused |
| Sending the original invoice total instead of the outstanding amount | Every balance is wrong |
| Expecting to undo an opening stock entry | Cannot be done the normal way |

---

## 12. Open questions

1. **How do we bring in opening stock for serial-tracked items?** No route today. Needs solving before such a customer.
2. **Who guarantees opening stock runs only once?** Nothing in the system does. Our tool must.
3. **What is the full list of movement types?** Only some were confirmed. Needed when mapping document types.
4. **Is there any bulk path across documents anywhere?** None found. Domain 12 will confirm.
