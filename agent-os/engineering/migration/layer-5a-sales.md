<!-- Zerupt internal knowledge base | Migration intake: Layer 5a | Updated: 2026-10-02 -->
# Layer 5a: Sales history

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** past sales invoices, returns and counter sales, replayed in date order.

---

## 1. Headline findings

**1. A sales import already exists, and it works the way we planned.** ✅ There is a module that takes a spreadsheet of sales and posts each one through the normal sale machinery, one at a time, each in its own transaction so one bad row cannot half-write. It checks the period, refuses duplicates and produces a rejected-rows file. **It is the pattern we designed, already built.**

**2. Backdating works.** ✅ A sale carries its own date, and that date drives the accounting period, the tax rate used, the due date and the recorded time. A sale recorded today but dated January 2026 posts to January 2026.

**3. The cost gap is closed.** ✅ A replayed sale line can carry the old system's cost, and the line's `unitCost` is **optional**.

   - **`unitCost` present:** the source's own historical cost is pinned as that line's cost of sale. This is the existing cost mechanism used by the amend process and by goods returns, threaded through the replay path.
   - **`unitCost` absent:** the line is costed the way a live sale is costed, at the **company-wide weighted average cost of that moment**. Replay runs in date order, so that average is the running average as of the sale. If the stock cannot cover the sale (stock below the quantity, or never received), the sale takes a provisional or zero cost and the next receipt posts the true-up. That is correct Zerupt behaviour but it moves cost between periods compared with the source, so the record carries the warning `uncosted_sale_provisional_cost`.
   - **Deterministic same-day costing.** Receipts reach the cost average through the accounting outbox, which is applied asynchronously. So before a sale with an uncosted line, the history runner settles the outbox if anything was applied since the last settle. A same-day receipt followed by a sale then costs identically on every run, whatever the poller timing.
   - If only some lines carry a cost, those are pinned and a stock line without one is costed at the pool average as of the sale date, never at zero.

   *Code: `handlers/sales-invoice.handler.ts`, `handlers/uncosted-sale.ts`, `layers/history.runner.ts` under `apps/api/src/migration-replay/`.*

**4. Totals are always recalculated, and then checked against the source.** Prices and discounts are supplied by us, then the system works out the line totals and tax itself. We cannot hand it a finished invoice and say "store this". For a no-tax country the arithmetic is simple enough that differences are unlikely. For a VAT country it is a genuine risk and needs testing early.

   The safety net: when the record carries a source total, the sale is confirmed and its total compared with the source **inside the same transaction**. A difference of one minor unit or more throws `fidelity_mismatch` and rolls the sale back, so nothing half-right is stored. This in-transaction guard (`assertConfirmedTotal`) replaced the separate preview pass for sales, so each sale is worked out once, not twice. Other document kinds still use a preview pass.

   There is **one** tolerance, shared by the validate-time preview, the in-transaction guard and the post-verify (`totalsDiffer` and `fidelityMismatch` in `handlers/support.ts`). Two totals differ when they are one full minor unit or more apart, at the **coarser** of the source's declared decimals and the currency's own. A source declaring more decimals than the currency books can therefore never make the check stricter than the ledger.

**5. Counter sales need a till session.** A POS transaction must belong to a register and a shift. There is no way to record one without them, so historical counter sales either need invented shifts or should be brought in as ordinary sales invoices instead.

---

## 2. What a sales invoice is

| Field | Need | Notes |
|---|---|---|
| `number` | automatic | **Always from our counter.** Their number cannot be used yet |
| `customerId` | **required** | A real customer. There is no anonymous sale on this table |
| `branchId` | **required** | |
| `currency`, `exchangeRate` | required | Rate must be above zero |
| `status` | required | `draft`, `confirmed`, `voided`. **Confirming is posting.** There is no separate step |
| `dueDate` | optional | Worked out from payment terms at confirmation |
| `salespersonId` | optional | No checking behind it. See [Layer 3b](layer-3b-parties.md) |
| Totals | calculated | The system works these out. We cannot set them |
| `taxBreakdown` | frozen at confirm | |
| Void fields | conditional | Reason and approver required together |

Per line: item, description, quantity (above zero), unit price, discount, tax group, warehouse (required for stock items), and a frozen snapshot of the pack unit used.

### What the replay record carries for a sale

| Field | Need | Notes |
|---|---|---|
| Per line `unitCost` | **optional** | Present: pinned as the cost of sale. Absent: costed at the live company-wide average. See finding 3 |
| Per line `taxCodeRef` | **optional** | Absent: the tax group is resolved exactly as a live sale resolves it (item, then customer, then the legal entity default). A no-tax country needs none |
| `billDiscount` | optional, never negative | A header discount after line discounts and before tax. Replayed as the direct sale's own order discount (an amount), which the totals engine spreads into the lines |
| `totals.total` | optional | When present, drives the fidelity guard above |

**Two blocking problems protect tax fidelity:**

| Problem | When |
|---|---|
| `tax_in_no_tax_country` | A sale carries a non-zero `taxTotal` but the company's country has no sales tax. Never folded into the price. The operator decides |
| `tax_unverifiable_without_total` | A VAT sale has a line with no `taxCodeRef` and the sale has no `totals.total`. The default tax group cannot be proven against anything, so the export must send a total or the codes |

**`costAtSale` is filled in by the system, not by us.** That is the gap in finding 3.

**There is no "unconfirm".** A confirmed invoice is corrected by voiding and reissuing, or by a credit note. That is the right design, and it means our replay must get it right the first time.

---

## 3. The call a migration makes

There is a single method that does the whole job in one transaction:

```
draft invoice  →  confirm (stock out, cost of sales, receivable, revenue, tax)
               →  receipt voucher if it was paid
               →  done
```

Everything in one go, and it accepts a key of our choosing so that running it twice is safe.

It takes a **sale date**, which is threaded all the way through. So backdating is genuinely supported, not a workaround.

**This is the same method the existing sales import uses**, which tells us it is the intended door for bringing in history.

---

## 4. What we supply, and what the system decides

| Thing | Who decides |
|---|---|
| Item, quantity, unit price, discount | **We supply** |
| Warehouse | We supply, or it uses the branch default |
| Tax group | We supply, or it uses the item's |
| Line totals, tax amounts, invoice totals | **The system calculates** |
| **Cost of sale** | **We supply it when we have it** (`unitCost`). If absent, the system costs it at the live average |
| Due date | We supply, or it is worked out from payment terms, defaulting to 30 days |
| Document number | The system assigns |

So we control the inputs, and the system computes the outputs and checks the total against the source. Cost is the one output we can also pin.

**What this means in practice for a no-tax customer:** line total is quantity times price minus discount. Our arithmetic and theirs will agree. Low risk.

**For a VAT customer:** tax is computed from the tax group as it stood on the document date. If our rounding differs from theirs by a fraction, it differs on every line. **This must be tested against real data before committing to a VAT migration.**

---

## 5. Receivables and due dates

When an invoice is confirmed, an event carries the customer, the date and the due date, and the receivable line is posted tagged with both. That is what makes statements and aging work, as described in [Layer 2](layer-2-financial.md).

The due date is ours to supply. If we leave it out, it is worked out from the customer's payment terms, falling back to 30 days.

**Receivables can only be posted against a real customer record.** There is no way to post to a free-text name, which is another reason customers must be loaded first.

---

## 6. Returns and credit notes

- A credit note **must point at a real invoice**. There are no standalone credit notes.
- Two kinds: goods returned, and a price adjustment.
- ✅ **A goods return puts stock back at the original sale's cost**, not today's cost. It uses exactly the mechanism we want for sales, which proves the plumbing exists.

**The trap:** if the customer's history contains a credit note whose original invoice is older than the period we are importing, there is nothing for it to point at. Those need a decision: import the original invoice too, or record the credit another way.

---

## 7. Counter sales (POS)

A POS transaction must belong to a **register** and a **shift**, and both are required links, not optional labels.

So for historical counter sales we have three choices:

| Option | Comment |
|---|---|
| Create synthetic shifts, for example one per day per register | Faithful, but invents records that never existed |
| Bring counter sales in as ordinary sales invoices | Simpler, and the existing sales import only supports this shape anyway. Loses the "it was a till sale" distinction |
| Do not migrate POS history | Only acceptable if they do not use POS |

**This needs a decision per customer.** The existing import does not cover POS, so anything else is a build.

---

## 8. What would reject legacy data, and what to do about it

| Check | Behaviour | What we do |
|---|---|---|
| **Closed period** | Rejected | Create years open, lock afterwards. See [Layer 1](layer-1-structure.md) |
| Soft-locked period | Needs a reason | Supply one |
| **Credit limit** | **Blocks the sale** unless overridden with a reason and the right permission | Migration must pass the override. Their history already happened |
| Negative stock | **Allowed** on this path, always. It behaves like a till | Good for us. Their history may well contain it |
| Duplicate document | Detected by the import's own key and kicked back, not silently skipped | Good |
| Missing customer | Rejected | Load customers first |
| Their invoice number | Cannot be used | The build in finding 3's sibling gap |

---

## 9. Speed

Each sale is one transaction: draft, lines, confirm, stock movements, journal entry, an outbox event, an audit row, and optionally a receipt. Failures are isolated to the row.

The existing import posts them one at a time on purpose, so that sale number 900 failing cannot corrupt sale 899. For 25,000 documents that is the right trade.

---

## 10. What the old system must tell us

| We need | Notes |
|---|---|
| Invoice number | Kept as a reference until we can set the real number |
| Date | Drives everything |
| Customer | Must already exist |
| Branch, and warehouse per line | |
| Currency and rate | |
| Per line: item, quantity, unit price, discount, tax group | |
| **Per line: the cost the old system recorded** | Optional. Send it to reproduce their profit figures. Leave it out and the live average cost is used, with a warning when stock is short |
| Payment terms or due date | |
| Paid or credit, and how it was paid | Drives whether a receipt is created |
| Salesperson | If they use one |
| Voided or cancelled, and why | |
| For returns: the original invoice it refers to | |

---

## 11. Traps

| Trap | Consequence |
|---|---|
| Leaving `unitCost` out when the customer's profit figures must match | Costs fall to the running company-wide average, and short stock gets a provisional cost with a warning |
| Invoice numbers renumbered | Their paperwork stops matching |
| Credit note with no original invoice in range | Cannot be created |
| Counter sales without shifts | Cannot be created |
| Credit limit blocking historical sales | Needs an override, or half the history refuses |
| Assuming we can supply finished totals | We cannot. Only the inputs. A total that does not reproduce is refused with `fidelity_mismatch` |
| VAT line with no tax code and no source total | Blocked with `tax_unverifiable_without_total` |
| Tax on a sale in a country with no sales tax | Blocked with `tax_in_no_tax_country` |
| VAT rounding differing from theirs | Small per line, large across 20,000 lines |

---

## 12. Open questions

1. **Does a till shift have to be open when a transaction is written, or does any shift do?** Decides how painful synthetic shifts would be.
2. **Do tax rates carry history far enough back?** If not, an old document could be taxed at today's rate.
3. **How many rows does the existing sales import accept per file?** Sets the batch size.
4. ~~Can the cost parameter be threaded through without disturbing the amend process?~~ **Resolved.** The cost is pinned through the same cost-basis mechanism; see finding 3.
