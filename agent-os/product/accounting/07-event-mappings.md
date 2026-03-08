# Event-to-Journal-Entry Mappings

Every business event and its exact journal entry. Account codes reference `04-chart-of-accounts.md`.

**Convention:** FC = transaction currency amount. FN = functional currency equivalent.

---

## POS Events

### `pos.transaction.completed` — POS Sale

**Revenue:**
```
DR  Cash Register (1112)              [cash amount]
DR  Bank Account (112x)               [card amount]
DR  Customer Deposits (2151)          [store credit used]
DR  Gift Card Liability (2152)        [gift card used]
CR  Product Sales (4110)              [net revenue before tax]
CR  Output Tax Payable (2131)         [tax per component]
```

**COGS (per line item):**
```
DR  Cost of Goods Sold (5100)         [item cost × qty]
CR  Merchandise Inventory (1141)      [same]
```

### `pos.return.completed` — POS Return

**Revenue reversal:**
```
DR  Sales Returns (4200)              [net return amount]
DR  Output Tax Payable (2131)         [tax on returned items]
CR  Cash Register (1112)              [cash refund]
CR  Customer Deposits (2151)          [if refund to store credit]
```

**COGS reversal:**
```
DR  Merchandise Inventory (1141)      [return cost]
CR  Cost of Goods Sold (5100)         [same]
```

### `pos.shift.closed` — Shift Close

**Cash over (actual > expected):**
```
DR  Cash Register (1112)              [overage]
CR  Cash Over / Short (6700)          [overage]
```

**Cash short (actual < expected):**
```
DR  Cash Over / Short (6700)          [shortage]
CR  Cash Register (1112)              [shortage]
```

**Cash transfer to safe/bank:**
```
DR  Petty Cash (1111) or Bank         [transfer amount]
CR  Cash Register (1112)              [same]
```

### `pos.void.completed` — Void Transaction

Full reversal of the original sale's entries (both revenue and COGS). Same as return but source = `VoidedTransaction`.

---

## Sales Events

### `sales.invoice.confirmed` — Invoice Confirmed

**Revenue:**
```
DR  Trade Receivables (1131)          [total incl. tax, FN]
CR  Product Sales (4110)              [net before tax, FN]
CR  Output Tax Payable (2131)         [tax, FN]
```

**COGS (per line item):**
```
DR  Cost of Goods Sold (5100)         [item cost × qty, FN]
CR  Merchandise Inventory (1141)      [same, FN]
```

### `sales.creditNote.confirmed` — Credit Note

**Revenue reversal:**
```
DR  Sales Returns (4200)              [credit note net, FN]
DR  Output Tax Payable (2131)         [tax on credited items, FN]
CR  Trade Receivables (1131)          [total credit, FN]
```

**COGS reversal (if goods returned):**
```
DR  Merchandise Inventory (1141)      [return cost, FN]
CR  Cost of Goods Sold (5100)         [same, FN]
```

No COGS reversal if credit note is for price adjustment only.

### `sales.receipt.posted` — Receipt Voucher (Customer Payment)

**Standard payment:**
```
DR  Bank/Cash (112x/111x)            [received, FN]
CR  Trade Receivables (1131)          [applied amount, FN]
```

**Advance payment (no invoices):**
```
DR  Bank/Cash                         [received, FN]
CR  Customer Deposits (2151)          [same, FN]
```

**With FX gain (rate moved favorably):**
```
DR  Bank Account                      [received at new rate, FN]
CR  Trade Receivables                 [original booking amount, FN]
CR  Realized FX Gain (4820)           [difference]
```

**Overpayment:** Excess → Customer Deposits (2151).

**Advance allocation to later invoice:**
```
DR  Customer Deposits (2151)          [allocated amount]
CR  Trade Receivables (1131)          [same]
```

**Early payment discount:**
```
DR  Bank Account                      [net received]
DR  Sales Discounts (4300)            [discount amount]
CR  Trade Receivables                 [full invoice amount]
```

---

## Purchase Events

### `purchase.grn.confirmed` — Goods Received

**With supplier invoice (matched):**
```
DR  Merchandise Inventory (1141)      [net purchase, FN]
DR  Input Tax Recoverable (1162)      [tax, FN]
CR  Trade Payables (2111)             [total incl. tax, FN]
```

**Without supplier invoice (accrual):**
```
DR  Merchandise Inventory (1141)      [estimated from PO, FN]
CR  GRN Accrual (2121)                [same, FN]
```

**When invoice arrives later:**
```
DR  GRN Accrual (2121)                [accrued amount]
DR  Input Tax Recoverable (1162)      [tax from invoice]
DR/CR  Inventory                      [price variance, if any]
CR  Trade Payables (2111)             [invoice total]
```

### `purchase.landedCost.allocated` — Landed Cost

```
DR  Merchandise Inventory (1141)      [landed cost amount, FN]
CR  Trade Payables (2111)             [if billed by supplier]
CR  Bank Account (112x)               [if paid directly]
CR  Accrued Expenses (2122)            [if accrued]
```

Triggers WAC recalculation. If goods already sold, triggers retroactive COGS adjustment (see `05-cogs-logic.md`).

### `purchase.return.confirmed` — Purchase Return

```
DR  Trade Payables (2111)             [return total incl. tax, FN]
CR  Merchandise Inventory (1141)      [return cost, FN]
CR  Input Tax Recoverable (1162)      [tax on returned goods, FN]
```

### `purchase.payment.posted` — Payment Voucher (Supplier Payment)

**Standard payment:**
```
DR  Trade Payables (2111)             [applied amount, FN]
CR  Bank/Cash (112x/111x)            [paid, FN]
```

**Advance payment (no invoices):**
```
DR  Supplier Prepayments (1161)       [paid, FN]
CR  Bank/Cash                         [same, FN]
```

**With FX loss:**
```
DR  Trade Payables                    [original booking, FN]
DR  Realized FX Loss (7210)           [difference]
CR  Bank Account                      [paid at new rate, FN]
```

**Early payment discount:**
```
DR  Trade Payables                    [full invoice amount]
CR  Bank Account                      [net paid]
CR  Purchase Discount Income (4810)   [discount]
```

---

## Inventory Events

### `inventory.adjustment.posted` — Stock Adjustment

**Decrease (loss, damage, write-off):**
```
DR  Inventory Write-Down (5200)       [qty × cost, FN]
CR  Merchandise Inventory (1141)      [same, FN]
```

**Increase (found, surplus):**
```
DR  Merchandise Inventory (1141)      [qty × assigned cost, FN]
CR  Inventory Gain/Loss (5300)        [same, FN]
```

### `inventory.transfer.completed` — Stock Transfer

**Instant (same inventory account):** No journal entry.

**Two-step (inter-branch) — Send:**
```
DR  Inventory in Transit (1142)       [qty × cost, FN]
CR  Merchandise Inventory — A (1141)  [same, FN]
```

**Two-step — Receive:**
```
DR  Merchandise Inventory — B (1141)  [qty × cost, FN]
CR  Inventory in Transit (1142)       [same, FN]
```

**Missing items on receive:**
```
DR  Merchandise Inventory — B         [received qty × cost]
DR  Inventory Write-Down (5200)       [missing qty × cost]
CR  Inventory in Transit (1142)       [sent qty × cost]
```

### `inventory.consumption.posted` — Internal Consumption

```
DR  Internal Consumption (6800)       [qty × cost, FN]
CR  Merchandise Inventory (1141)      [same, FN]
```

### `inventory.assembly.completed` — Assembly

```
DR  Inventory — Finished Good         [total component cost]
CR  Inventory — Component A           [component A cost]
CR  Inventory — Component B           [component B cost]
```

With scrap: DR Production Costs (5500) for scrap amount.

### `inventory.disassembly.completed` — Disassembly

Reverse of assembly:
```
DR  Inventory — Component A           [allocated cost]
DR  Inventory — Component B           [allocated cost]
CR  Inventory — Finished Good         [finished good cost]
```

### `inventory.count.approved` — Stock Count Variance

Creates stock adjustment entries per variance line (see `inventory.adjustment.posted`).

---

## Cheque Events

### `cheque.status.received` — Customer Cheque Received
```
DR  Cheques in Hand (1150)            [amount, FN]
CR  Trade Receivables (1131)          [same, FN]
```

### `cheque.status.deposited` — Cheque Deposited
```
DR  Cheques in Transit (1129)         [amount, FN]
CR  Cheques in Hand (1150)            [same, FN]
```

### `cheque.status.cleared` — Received Cheque Cleared
```
DR  Bank Account (112x)               [amount, FN]
CR  Cheques in Transit (1129)         [same, FN]
```

### `cheque.status.bounced` — Cheque Bounced
```
DR  Trade Receivables (1131)          [cheque amount]  ← re-opens AR
DR  Cheque Bounce Fees (7130)         [bank fee]
CR  Cheques in Transit (1129)         [cheque amount]
CR  Bank Account (112x)               [bank fee]
```

### `cheque.status.issued` — Supplier Cheque Issued
```
DR  Trade Payables (2111)             [amount, FN]
CR  Cheques Issued (2140)             [same, FN]
```

### `cheque.status.cleared` (issued) — Issued Cheque Cleared
```
DR  Cheques Issued (2140)             [amount, FN]
CR  Bank Account (112x)               [same, FN]
```

### `cheque.status.cancelled` — Cheque Cancelled

Reverse the original entry:

Received cheque cancelled before deposit:
```
DR  Trade Receivables (1131)          [amount]
CR  Cheques in Hand (1150)            [amount]
```

Issued cheque cancelled before clearing:
```
DR  Cheques Issued (2140)             [amount]
CR  Trade Payables (2111)             [amount]
```

---

## Banking Events

### `bank.transfer.completed` — Inter-Account Transfer

```
DR  Target Bank (112x)                [amount, FN]
CR  Source Bank (112x)                [amount, FN]
```

With fee:
```
DR  Target Bank                       [amount]
DR  Bank Charges (7110)               [fee]
CR  Source Bank                       [amount + fee]
```

Cross-currency: DR/CR Realized FX Gain/Loss for rate difference.

---

## Accounting Internal Events

### `accounting.fxRevaluation.completed` — Month-End FX Revaluation

Per open FC balance: `difference = FC_amount × closing_rate - book_value`

**Gain:**
```
DR  AR/AP/Bank                        [difference]
CR  Unrealized FX Gain (4830)         [difference]
```

**Loss:**
```
DR  Unrealized FX Loss (7220)         [difference]
CR  AR/AP/Bank                        [difference]
```

Auto-reverses on first day of next period.

### `accounting.yearEnd.closed` — Year-End Closing

```
DR  All Income accounts               [their balances]
CR  All Expense accounts              [their balances]
DR/CR  Retained Earnings — Current Year (3300)  [net = income - expenses]

Then:
DR  Retained Earnings — Current Year (3300)     [full balance]
CR  Retained Earnings — Prior Years (3200)      [same]
```

### `accounting.openingBalance.posted` — Opening Balance

```
DR/CR  [Each account]                 [opening balance]
DR/CR  Opening Balance Equity (3900)  [balancing amount]
```

3900 should net to zero after all balances entered.

---

## Future Stubs (CRM & Loyalty Module)

### `loyalty.giftCard.sold`
```
DR  Cash/Bank                         [face value]
CR  Gift Card Liability (2152)        [same]
```

### `loyalty.giftCard.redeemed`
```
DR  Gift Card Liability (2152)        [used amount]
CR  Product Sales (4110)              [net revenue]
CR  Output Tax Payable (2131)         [tax]
```

Expired unredeemed: DR Gift Card Liability / CR Other Income.

### `loyalty.storeCredit.issued`
```
DR  Sales Returns (4200)              [return amount]
DR  Output Tax Payable (2131)         [tax reversal]
CR  Store Credit Liability (2153)     [credit amount]
```

### `loyalty.storeCredit.redeemed`
```
DR  Store Credit Liability (2153)     [used amount]
CR  Product Sales (4110)              [net revenue]
CR  Output Tax Payable (2131)         [tax]
```

---

## Quick Reference

| # | Event | Module | Section |
|---|-------|--------|---------|
| 1 | `pos.transaction.completed` | POS | POS |
| 2 | `pos.return.completed` | POS | POS |
| 3 | `pos.shift.closed` | POS | POS |
| 4 | `pos.void.completed` | POS | POS |
| 5 | `sales.invoice.confirmed` | Sales | Sales |
| 6 | `sales.creditNote.confirmed` | Sales | Sales |
| 7 | `sales.receipt.posted` | Sales | Sales |
| 8 | `purchase.grn.confirmed` | Purchase | Purchase |
| 9 | `purchase.landedCost.allocated` | Purchase | Purchase |
| 10 | `purchase.return.confirmed` | Purchase | Purchase |
| 11 | `purchase.payment.posted` | Purchase | Purchase |
| 12 | `inventory.adjustment.posted` | Inventory | Inventory |
| 13 | `inventory.transfer.completed` | Inventory | Inventory |
| 14 | `inventory.consumption.posted` | Inventory | Inventory |
| 15 | `inventory.assembly.completed` | Inventory | Inventory |
| 16 | `inventory.disassembly.completed` | Inventory | Inventory |
| 17 | `inventory.count.approved` | Inventory | Inventory |
| 18 | `cheque.status.received` | Cheques | Cheques |
| 19 | `cheque.status.deposited` | Cheques | Cheques |
| 20 | `cheque.status.cleared` (received) | Cheques | Cheques |
| 21 | `cheque.status.bounced` | Cheques | Cheques |
| 22 | `cheque.status.issued` | Cheques | Cheques |
| 23 | `cheque.status.cleared` (issued) | Cheques | Cheques |
| 24 | `cheque.status.cancelled` | Cheques | Cheques |
| 25 | `bank.transfer.completed` | Banking | Banking |
| 26 | `accounting.fxRevaluation.completed` | Accounting | Accounting |
| 27 | `accounting.yearEnd.closed` | Accounting | Accounting |
| 28 | `accounting.openingBalance.posted` | Accounting | Accounting |
| 29 | `loyalty.giftCard.sold` | Loyalty | Future |
| 30 | `loyalty.giftCard.redeemed` | Loyalty | Future |
| 31 | `loyalty.storeCredit.issued` | Loyalty | Future |
| 32 | `loyalty.storeCredit.redeemed` | Loyalty | Future |
