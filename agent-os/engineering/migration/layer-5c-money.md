<!-- Zerupt internal knowledge base | Migration intake: Layer 5c | Updated: 2026-10-02 -->
# Layer 5c: Money movements (receipts, payments and journals)

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** money coming in from customers, money going out to suppliers, and manual accounting entries.

---

## 1. Headline findings

**1. A payment can settle an opening-balance invoice.** ✅ This was the most important open question in the whole audit, and the answer is yes. An opening invoice is an ordinary invoice with a flag, and the settlement path does not treat it differently. **So a customer paying an old pre-migration invoice next month works normally.** Without this, every migration would leave a permanently unmatched balance.

**2. Settlement is properly flexible.** ✅ One receipt can settle many invoices, partly or fully, and money received with nothing to apply it to becomes a **deposit**, a first-class thing that can be applied later or refunded. That is how real businesses behave, so legacy data will fit.

**3. A manual journal cannot be tagged with a customer or supplier, but the internal route can.** ✅ **Resolved.** The manual journal screen's input has no field for the party or the due date, so that path is a dead end. The low-level posting method underneath it does accept both, and three services already use it that way, including the opening balance service.

So legacy journals that moved customer or supplier balances **can** be replayed. The condition is that **the replay engine must live inside the backend as a service**, not outside as a script calling the web interface. See [the build list](build-list.md).

**4. A historically voided document has to be posted and then reversed.** There is no way to write one in as already void. So a document cancelled in 2024 becomes two entries in our system, netting to zero. Faithful in effect, noisier in appearance, and it needs explaining to the customer.

**5. Receipts and payments do not accept an idempotency key on creation.** Unlike sales and purchases, a retry can create a duplicate. **Our tool must do its own duplicate checking** before creating each one.

**6. There is no bulk import for payments, receipts or journals.** The books import only posts a single opening entry. So these are replayed one at a time, like sales and purchases.

---

## 2. Customer receipts

Two routes:

| Route | Use |
|---|---|
| **Receipt voucher** | Money from a customer, applied to their invoices. **This is the migration route** |
| Direct receipt | Money from someone who is not a customer, such as miscellaneous income |

What a receipt voucher needs:

| Field | Need | Notes |
|---|---|---|
| `customerId` | required | Must be a real customer |
| `branchId` | required | |
| `paymentDate` | required | **Backdating works** |
| `totalAmount` | required | |
| `allocations` | optional | Empty means money on account |
| `exchangeRate` | conditional | **Required if foreign.** Refused rather than assumed |

---

## 3. How money is matched to invoices ✅

| Capability | Supported? |
|---|---|
| One receipt settling several invoices | Yes |
| Part payment of an invoice | Yes, any amount up to what is outstanding |
| **Settling an opening-balance invoice** | **Yes.** Same path as any other |
| Money received with nothing to apply it to | Yes, held as a deposit, applied or refunded later |
| **Early-payment discount at settlement** | **Yes, a first-class field.** See section 3a |

Supplier payments work the same way, in mirror image, including against opening bills.

### 3a. Settlement discount in the replay record ✅

A settlement discount (cash discount given or taken when an invoice is settled) is a first-class field on `customerReceipt` and `supplierPayment` history records. **No journal workaround and no synthetic discount account is used.** The replay hands each discount to the live settlement service as an explicit figure, and the live service posts it.

| Field | Meaning |
|---|---|
| Record `amount` | The **cash** received or paid. It never includes the discount. The tenders carry this figure |
| Allocation `amount` | The **gross** settled on that invoice or bill, which is cash plus discount |
| Allocation `discount` | Optional. The discount part of that gross. Zero or absent means none. Never negative |
| Record `discount` | Optional header total. When present it must equal the sum of the allocation discounts |

Rules, checked when the bundle is validated:

1. The sum of (allocation `amount` minus allocation `discount`) must not exceed the record `amount`. Any cash left over stays as a deposit (customer) or advance (supplier).
2. A discount cannot exceed the allocation it belongs to.
3. A discount needs allocations. There is no document to discount without one.
4. **A supplier payment with a discount must allocate its whole amount.** The part-allocated advance path cannot carry a discount, so that shape is refused.
5. A discount is allowed on an opening receivable or opening payable allocation, because the live service settles an opening balance the same way as an invoice or bill.

After posting, the handler reads the voucher back and checks both the cash applied and the discount granted against the source.

*Code: `packages/shared/src/migration-replay/records-history.ts` and `settlement-discount.ts`; handlers `customer-receipt.handler.ts` and `supplier-payment.handler.ts`.*

---

## 4. Tenders, bank accounts and cheques

A receipt or payment carries a list of tenders: cash, bank transfer, cheque or card. Each has an amount, and a reference is required for cards and transfers. The fee on a card tender is always worked out by the system, never supplied.

The cash or bank account is chosen per tender, or falls back to the default mapping from [Layer 2](layer-2-financial.md).

**Cheques are a proper register**, with a post-dated date separate from the date received, and a full life of its own: received, deposited, then cleared or bounced, with a replacement chain when one bounces. Each step posts its own accounting entry.

⚠️ **So replaying a historical cheque means walking its whole life**, not writing a single final state. For a business that ran on post-dated cheques, that is a meaningful piece of work.

---

## 5. Manual journal entries

| Field | Need | Notes |
|---|---|---|
| `postingDate` | required | **Backdating works**, subject to period locks |
| `currency` | required | |
| Lines, at least two | required | Account, then a debit or a credit, never both |
| Tax fields | optional | |
| Branch, cost centre | optional | |
| **Party and due date** | ❌ **Not available** | |
| **Exchange rate** | ❌ Not ours to set | Worked out from the rate table for that date |

Two consequences:

1. **A legacy journal that moved a customer or supplier balance cannot be replayed here.** It needs the internal route.
2. **A backdated foreign-currency journal needs historical rates loaded**, or it fails. Correctly, it fails loudly rather than assuming 1 to 1.

---

## 6. Exchange differences on settlement ✅

When a payment is made at a different rate than the invoice, the difference is worked out per allocation and posted to a gain or loss account. The rate is ours to supply on the receipt, and a foreign currency with a missing rate is refused.

That is exactly the behaviour a faithful migration needs.

---

## 7. Voids and reversals

There is no "already void" state to write. Everything is post, then reverse.

| Thing | How a void is recorded |
|---|---|
| Invoices and bills | A voided status, with reason, time and who did it, all required together |
| Journals | A reversing entry, with a required reason |
| Receipts and payments | Reversal recorded on the voucher |

**A reason is always required**, and legacy data often has none. So we need a standard placeholder, something like "Voided in previous system, reason not recorded".

---

## 8. What would reject legacy data

| Check | Note |
|---|---|
| Missing reason on a void or reversal | Must be supplied |
| Hard-locked period | Cannot be posted into at all |
| Soft-locked period | Needs an override reason |
| More than 6 decimal places on an amount | Refused |
| A rate with more than 10 decimals, or above 100 million | Refused |
| A journal line with zero on both sides | Refused |
| A line with both a debit and a credit | Refused |
| **Approval PIN, if maker-checker is switched on** | The migration would need an approver. Best switched off during migration |

---

## 9. What the old system must tell us

| We need | Notes |
|---|---|
| Every receipt: number, date, customer, amount, currency and rate | |
| **Which invoices each receipt settled, and how much against each** | This is what makes balances right |
| Money received on account with nothing applied | Becomes a deposit |
| Every supplier payment: same detail | |
| How each was paid: cash, bank, cheque or card, with references | |
| Cheques: number, cheque date, and what happened to it | A full life, not just a final state |
| Manual journals: date, lines, accounts, amounts, and any party | Party-tagged ones need the internal route |
| Voided documents, with a reason if recorded | |
| Early-payment discounts, per invoice or bill | Carried as the allocation `discount`. Write-offs have no field of their own |

---

## 10. Traps

| Trap | Consequence |
|---|---|
| **Manual journals touching customer or supplier balances** | Land with nobody attached, statements wrong |
| Retrying a receipt or payment | **Creates a duplicate.** No key protection |
| Expecting to write a document as already void | Two entries instead of one |
| Cheque history written as a single final state | Misses the accounting of each step |
| Backdated foreign journals without historical rates | Refused |
| Maker-checker left on during migration | Everything waits for approval |
| Amounts with more precision than we allow | Refused |
| A discounted supplier payment that does not allocate its whole amount | Refused. Allocate fully |
| Putting the discount inside the record `amount` | Cash would be overstated. The record `amount` is cash only; the discount rides on the allocations |

---

## 11. Open questions

1. ~~Can a migration use the internal route that accepts party and due date?~~ **Resolved: yes.** See finding 3.
2. ~~How exactly do settlement discounts work on a receipt?~~ **Resolved.** See section 3a. Write-offs (a balance forgiven with no cash) still have no dedicated field.
3. Is there a limit on how many invoices one receipt can settle?

Also confirmed while answering question 1: the posting engine **requires** a party on any control-account line and **requires** a due date on any line that creates a receivable or payable. So a replay that forgets them does not silently produce empty statements. It is refused. That is better than the audit feared.
