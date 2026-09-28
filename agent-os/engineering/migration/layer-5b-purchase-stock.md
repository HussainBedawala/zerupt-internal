<!-- Zerupt internal knowledge base | Migration intake: Layer 5b | Updated: 2026-09-27 -->
# Layer 5b: Purchase and stock movement history

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** past purchases, returns to suppliers, transfers between warehouses, and stock adjustments.

---

## 1. Headline findings

**1. Purchases have the same one-call door as sales.** ✅ A single method creates the order, the goods receipt, the bill and the payment together, in one transaction. It takes the **purchase date** from us, so backdating works, and it requires a key of our choosing so running it twice is safe.

**2. Purchases satisfy our fidelity rule already.** ✅ The unit cost is **required** on every incoming line, and must be above zero. So the cost the old system recorded is the cost we store. Unlike sales, nothing needs building here.

**3. Watch out: the module named "purchase import" is not a migration path.** ❌ It only creates a **draft purchase order** from a spreadsheet. It never receives stock, never creates a bill, never posts anything. It is a tool for a clerk typing in new orders. Its name makes it look like exactly what we want, and it is not. A migration must call the one-call method itself, once per historical document, exactly as the sales import does.

**4. Transfers and adjustments will not accept a cost from us.** A transfer moves stock at whatever our average cost currently is. An adjustment that reduces stock ignores any cost we send. So for these documents, their historical value cannot be reproduced exactly through the normal route. It matters less than for sales, but it is a real difference and it needs a decision.

**5. Returns to suppliers work out their own cost, deliberately.** Stock is relieved at the cost it was originally received at, including its share of freight. Any difference between that and what the supplier credits us lands visibly in a price-difference account rather than quietly changing the stock value. That is correct behaviour, and it means we do not control this figure.

---

## 2. Purchase: two documents, one call

| Document | What it records |
|---|---|
| **Goods receipt** | Stock coming in, at cost |
| **Bill** | What we owe the supplier |

Normally they are linked. For history, the single method creates both together, plus the payment if it was paid.

**What we supply:**

| Field | Need | Notes |
|---|---|---|
| `purchaseDate` | **required** | Drives the period, the due date, everything |
| `idempotencyKey` | **required** | Ours to choose. Makes a repeat safe |
| Supplier | required | Must already exist |
| Branch | required | |
| `currency`, `exchangeRate` | optional | Defaults to the company currency at rate 1 |
| Settlement: paid or credit, and due date | required | |
| Lines | required | See below |
| `softLockOverrideReason` | conditional | Needed to post into a soft-locked period |

**Per line:**

| Field | Need | Notes |
|---|---|---|
| `itemId` | required | |
| `qty` | required | Must be positive |
| **`unitCost`** | **required, above zero** | ✅ Their cost, stored as theirs |
| Warehouse | optional | Defaults to the branch default |
| Tax group | optional | Defaults to the item's |
| Discount | optional | Line or header |
| Pack unit | optional | |
| Serial numbers, batch and expiry | conditional | Required if the item is tracked that way |

**Totals are recalculated**, as with sales. Discounts are spread across lines into a net cost before posting.

---

## 3. Foreign currency ✅

A purchase can be in a foreign currency with its own rate, which is exactly what we need for a Kuwaiti company buying in AED.

Two protections, both fail loudly rather than guessing:

- A rate other than 1 is only allowed if the currency is genuinely foreign.
- If a supplier is set up to trade in a particular currency and the document uses a different one, it is refused rather than posted at 1 to 1.

---

## 4. Freight and other costs

Optional, and handled two ways:

| How it was paid | What happens |
|---|---|
| On the supplier's own invoice | Spread across the lines **by value** and added to the cost before posting. No second document |
| By cash, bank or a third party | A proper landed cost record, posted against the goods receipt |

⚠️ **The one-call path only spreads by value.** If the old system spread freight by weight, or somebody typed in the split by hand, that exact allocation cannot be reproduced through this door. The full landed-cost engine supports other methods, but it is a different, longer route.

---

## 5. Payables and due dates

The payable posts to the trade payables control account, **tagged with the supplier**, which is what makes supplier statements and aging work. The due date is ours to supply, and if left out it is worked out from the supplier's payment terms, falling back to 30 days.

---

## 6. Returns to suppliers

- The link to the original bill is **optional**, so a return can stand alone. ✅ This is more forgiving than sales credit notes, which must point at an invoice.
- **We do not set the cost.** Stock is relieved at what it originally cost, including its share of freight.
- The price we are credited is ours to supply, and any gap between the two lands in a visible price-difference account.

So a historical return comes across with the right stock effect and the right supplier credit, with any difference shown rather than hidden.

---

## 7. Transfers, adjustments, damage

### Transfers between warehouses

| Field | Notes |
|---|---|
| From and to warehouse | required |
| Lines: item, quantity sent | required |
| Pack unit, serial numbers | optional |
| `occurredAt` | **Backdating works**, separately for sending and receiving |
| `idempotencyKey` | required |

❌ **No cost can be supplied.** The transfer moves stock at our current average cost.

### Adjustments

Types available: **Damaged, Lost, Found, Write-off, Purchase received, Other**.

| Field | Notes |
|---|---|
| Warehouse, type | required |
| Direction | required only for "Other" |
| Lines: item, quantity | required |
| `unitCost` | Used on **increases**. **Ignored on decreases** |
| `occurredAt` | Backdating works. A future date is refused |
| `idempotencyKey` | required |

There is no separate "consumption" type. It would map to Write-off or Other, which needs a decision when a source system distinguishes them.

---

## 8. What would reject legacy data

| Check | Behaviour |
|---|---|
| Zero or blank cost on anything coming in | **Refused.** It would corrupt the average cost |
| A date in the future | Refused |
| A closed period | Refused. Purchases can carry an override reason for soft locks |
| Serial or batch tracked items without their details | Refused |
| Supplier currency not matching the document | Refused |
| Too many lines on one document | Refused. Must be split |
| Missing idempotency key | Refused. We must generate a stable one per historical document |

That last one is worth repeating: **every one of these documents requires a key from us**. Generating it from the old system's document identifier makes the whole replay safely repeatable, for free.

---

## 9. What the old system must tell us

| We need | Notes |
|---|---|
| Purchase number, date, supplier | Number kept as a reference for now |
| Currency and exchange rate | |
| Per line: item, quantity, **unit cost**, discount, tax | Cost is required and must be above zero |
| Freight and other charges, and how they were split | Value-based splits reproduce exactly. Others do not |
| Paid or credit, due date, how it was paid | |
| Purchase returns, and the bill they relate to if any | |
| Transfers: from, to, item, quantity, date | Cost cannot be supplied |
| Adjustments: warehouse, type, item, quantity, cost if increasing, date | |
| Voided documents, and why | |

---

## 10. Traps

| Trap | Consequence |
|---|---|
| **Mistaking "purchase import" for a migration path** | It only makes draft orders. Nothing posts |
| Zero cost lines | Refused. Legacy data often contains them |
| Freight split by weight or by hand | Cannot be reproduced through the one-call path |
| Expecting to set the cost on transfers or adjustments | Not possible |
| "Received but not yet billed" | The one-call path always creates the bill too. That state needs a different route |
| Forgetting stable idempotency keys | A repeated run creates duplicates |

---

## 11. Open questions

1. **Can a very old date be posted through the purchase path**, or is there a limit on how far back the override reaches?
2. **Do transfers and adjustments have an override for locked periods?** Purchases do. These two were not confirmed.
3. **Where does "consumption" belong** when a source system treats it as its own type?
4. **Is there any internal way to force cost on a transfer or adjustment?** Only the outside contract was checked.
