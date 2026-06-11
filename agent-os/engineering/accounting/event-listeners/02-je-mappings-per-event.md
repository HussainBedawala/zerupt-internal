# Event Listener JE Mappings — Per-Event DR/CR Reference

> Depends on: `event-listeners/01-design.md` (architecture)
> Source of truth: `agent-os/product/accounting/07-event-mappings.md`
> Account codes: `agent-os/product/accounting/04-chart-of-accounts.md`
> Account resolution: `account-mappings/01-design.md` (5-level override)
> JE posting: `journal-entries/02-posting-pipeline.md`

## Overview

This file defines the exact DR/CR lines that `AccountingEventListenerService` must build for each business event before calling `JournalPostingService.postFromEvent()`. Account codes shown are defaults from the COA template — actual account IDs are resolved at runtime via `AccountMappingService.resolve(lineType, legalEntityId, branchId?)`.

**Status: Not implemented.** No `AccountingEventListenerService` exists. The inventory module emits `accounting.post` but nothing consumes it.

**Convention:** FC = transaction currency amount. FN = functional currency equivalent.

---

## Handler Architecture

Each handler follows the same pattern:

```
@OnEvent('module.action.status')
async handleEventName(payload: PostEventPayload) {
  1. Extract amounts, line items, tax from payload
  2. For each line: resolve accountId via AccountMappingService.resolve(lineType, ...)
  3. If COGS needed: call CogsCalculatorService.calculate(itemId, qty)
  4. If FX possible: call FxGainLossService.calculate(tcAmount, fcAmount, rate)
  5. Build JE lines array: { accountId, debit, credit, description, lineType }
  6. Call JournalPostingService.postFromEvent({ ...payload, lines })
}
```

**Error handling (per handler):**

| Error | Action |
|-------|--------|
| Account mapping not found | Throw `AccountMappingMissingError` — blocks posting, logged as CRITICAL |
| Fiscal period locked | Throw `PeriodLockedError` — event stays in queue for retry after period reopen |
| COGS calculation fails | Throw `CogsCalculationError` — blocks posting, requires manual resolution |
| FX rate not found | Throw `RateNotFoundError` — blocks posting, user must enter rate |
| JE posting fails | BullMQ retries (3 attempts, exponential backoff). After exhaustion → dead letter queue |

---

## POS Events (4)

### `pos.transaction.completed` — POS Sale

**Revenue lines:**

| DR/CR | Line Type | Account (default) | Amount | Description |
|-------|-----------|-------------------|--------|-------------|
| DR | `cash` | Cash Register (1112) | Cash tendered | Cash received |
| DR | `bank` | Bank Account (112x) | Card payment amount | Card payment |
| DR | `customer_deposit_used` | Customer Deposits (2151) | Store credit applied | Store credit used |
| DR | `gift_card_used` | Gift Card Liability (2152) | Gift card applied | Gift card redeemed |
| CR | `revenue` | Product Sales (4110) | Net revenue before tax | Sale revenue |
| CR | `output_tax` | Output Tax Payable (2131) | Tax per component | Tax collected |

**COGS lines (per line item with inventory):**

| DR/CR | Line Type | Account (default) | Amount | Description |
|-------|-----------|-------------------|--------|-------------|
| DR | `cogs` | Cost of Goods Sold (5100) | Item WAC x qty | COGS — {itemName} |
| CR | `inventory` | Merchandise Inventory (1141) | Same | Inventory reduction — {itemName} |

**Notes:**
- Multiple payment methods = multiple DR lines (cash + card split)
- COGS lines are per line item, not per transaction
- POS is always in local currency — no FX

### `pos.return.completed` — POS Return

**Revenue reversal:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `sales_return` | Sales Returns (4200) | Net return amount |
| DR | `output_tax` | Output Tax Payable (2131) | Tax on returned items |
| CR | `cash` | Cash Register (1112) | Cash refund |
| CR | `customer_deposit` | Customer Deposits (2151) | If refund to store credit |

**COGS reversal (per returned item):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory` | Merchandise Inventory (1141) | Return cost (current WAC) |
| CR | `cogs` | Cost of Goods Sold (5100) | Same |

**Decision: Returns use current WAC**, not original sale cost. This is standard for perpetual WAC systems — the original cost is absorbed into the weighted average.

### `pos.shift.closed` — Shift Close

**Cash over (actual > expected):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `cash` | Cash Register (1112) | Overage |
| CR | `cash_over_short` | Cash Over/Short (6700) | Overage |

**Cash short (actual < expected):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `cash_over_short` | Cash Over/Short (6700) | Shortage |
| CR | `cash` | Cash Register (1112) | Shortage |

**Cash transfer to safe/bank:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `petty_cash` or `bank` | Petty Cash (1111) or Bank | Transfer amount |
| CR | `cash` | Cash Register (1112) | Same |

### `pos.void.completed` — Void Transaction

Full reversal of the original sale's entries (both revenue and COGS). Identical to `pos.return.completed` but `sourceType = 'VoidedTransaction'`. The handler should:

1. Look up the original `pos.transaction.completed` JE by `sourceDocumentId`
2. Build exact reversal lines (swap DR/CR)
3. Post with reference to the voided transaction

---

## Sales Events (3)

### `sales.invoice.confirmed` — Invoice Confirmed

**Revenue (FN amounts — converted from TC if foreign currency):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `trade_receivable` | Trade Receivables (1131) | Total incl. tax, FN |
| CR | `revenue` | Product Sales (4110) | Net before tax, FN |
| CR | `output_tax` | Output Tax Payable (2131) | Tax, FN |

**COGS (per line item):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `cogs` | Cost of Goods Sold (5100) | Item WAC x qty, FN |
| CR | `inventory` | Merchandise Inventory (1141) | Same, FN |

**FX note:** If invoice is in foreign currency, all amounts are converted to FN at the spot rate on invoice date. The TC amounts are stored on the JE lines for FX gain/loss calculation at payment time.

### `sales.creditNote.confirmed` — Credit Note

**Revenue reversal:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `sales_return` | Sales Returns (4200) | Credit note net, FN |
| DR | `output_tax` | Output Tax Payable (2131) | Tax on credited items, FN |
| CR | `trade_receivable` | Trade Receivables (1131) | Total credit, FN |

**COGS reversal (only if goods returned):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory` | Merchandise Inventory (1141) | Return cost, FN |
| CR | `cogs` | Cost of Goods Sold (5100) | Same, FN |

No COGS reversal if credit note is a price adjustment only (no physical return).

### `sales.receipt.posted` — Receipt Voucher (Customer Payment)

**Standard payment:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `bank` or `cash` | Bank/Cash (112x/111x) | Received, FN |
| CR | `trade_receivable` | Trade Receivables (1131) | Applied amount, FN |

**Advance payment (no invoices):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `bank` | Bank/Cash | Received, FN |
| CR | `customer_deposit` | Customer Deposits (2151) | Same, FN |

**With FX gain (rate moved favorably):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `bank` | Bank Account | Received at current rate, FN |
| CR | `trade_receivable` | Trade Receivables | Original booking amount, FN |
| CR | `fx_gain` | Realized FX Gain (4820) | Difference |

**With FX loss:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `bank` | Bank Account | Received at current rate, FN |
| DR | `fx_loss` | Realized FX Loss (7210) | Difference |
| CR | `trade_receivable` | Trade Receivables | Original booking amount, FN |

**Overpayment:** Excess goes to Customer Deposits (2151).

**Advance allocation to later invoice:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `customer_deposit_used` | Customer Deposits (2151) | Allocated amount |
| CR | `trade_receivable` | Trade Receivables (1131) | Same |

**Early payment discount:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `bank` | Bank Account | Net received |
| DR | `sales_discount` | Sales Discounts (4300) | Discount amount |
| CR | `trade_receivable` | Trade Receivables | Full invoice amount |

---

## Purchase Events (4)

### `purchase.grn.confirmed` — Goods Received

**With supplier invoice (matched):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory` | Merchandise Inventory (1141) | Net purchase, FN |
| DR | `input_tax` | Input Tax Recoverable (1162) | Tax, FN |
| CR | `trade_payable` | Trade Payables (2111) | Total incl. tax, FN |

**Without supplier invoice (accrual):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory` | Merchandise Inventory (1141) | Estimated from PO, FN |
| CR | `grn_accrual` | GRN Accrual (2121) | Same, FN |

**When invoice arrives later (reversal + actual):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `grn_accrual` | GRN Accrual (2121) | Accrued amount |
| DR | `input_tax` | Input Tax Recoverable (1162) | Tax from invoice |
| DR/CR | `inventory_variance` | Merchandise Inventory (1141) | Price variance (if any) |
| CR | `trade_payable` | Trade Payables (2111) | Invoice total |

### `purchase.landedCost.allocated` — Landed Cost

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory` | Merchandise Inventory (1141) | Landed cost amount, FN |
| CR | `trade_payable` | Trade Payables (2111) | If billed by supplier |
| CR | `bank` | Bank Account (112x) | If paid directly |
| CR | `accrued_expense` | Accrued Expenses (2122) | If accrued |

Triggers WAC recalculation. If goods already sold → retroactive COGS adjustment (additional DR COGS / CR Inventory for the cost uplift on sold units).

### `purchase.return.confirmed` — Purchase Return

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `trade_payable` | Trade Payables (2111) | Return total incl. tax, FN |
| CR | `inventory` | Merchandise Inventory (1141) | Return cost, FN |
| CR | `input_tax` | Input Tax Recoverable (1162) | Tax on returned goods, FN |

### `purchase.payment.posted` — Payment Voucher (Supplier Payment)

**Standard payment:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `trade_payable` | Trade Payables (2111) | Applied amount, FN |
| CR | `bank` or `cash` | Bank/Cash (112x/111x) | Paid, FN |

**Advance payment:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `supplier_prepayment` | Supplier Prepayments (1161) | Paid, FN |
| CR | `bank` | Bank/Cash | Same, FN |

**With FX loss:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `trade_payable` | Trade Payables | Original booking, FN |
| DR | `fx_loss` | Realized FX Loss (7210) | Difference |
| CR | `bank` | Bank Account | Paid at current rate, FN |

**Early payment discount:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `trade_payable` | Trade Payables | Full invoice amount |
| CR | `bank` | Bank Account | Net paid |
| CR | `purchase_discount` | Purchase Discount Income (4810) | Discount |

---

## Inventory Events (6)

### `inventory.adjustment.posted` — Stock Adjustment

**Decrease (loss, damage, write-off):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory_writedown` | Inventory Write-Down (5200) | Qty x cost, FN |
| CR | `inventory` | Merchandise Inventory (1141) | Same, FN |

**Increase (found, surplus):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory` | Merchandise Inventory (1141) | Qty x assigned cost, FN |
| CR | `inventory_gain` | Inventory Gain/Loss (5300) | Same, FN |

### `inventory.transfer.completed` — Stock Transfer

**Instant (same branch, same inventory account):** No JE.

**Two-step inter-branch — Send:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory_transit` | Inventory in Transit (1142) | Qty x cost, FN |
| CR | `inventory` | Merchandise Inventory — Source (1141) | Same, FN |

**Two-step — Receive:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory` | Merchandise Inventory — Dest (1141) | Qty x cost, FN |
| CR | `inventory_transit` | Inventory in Transit (1142) | Same, FN |

**Missing items on receive:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory` | Merch Inventory — Dest | Received qty x cost |
| DR | `inventory_writedown` | Inventory Write-Down (5200) | Missing qty x cost |
| CR | `inventory_transit` | Inventory in Transit (1142) | Sent qty x cost |

### `inventory.consumption.posted` — Internal Consumption

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `internal_consumption` | Internal Consumption (6800) | Qty x cost, FN |
| CR | `inventory` | Merchandise Inventory (1141) | Same, FN |

### `inventory.assembly.completed` — Assembly

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory_fg` | Inventory — Finished Good | Total component cost |
| CR | `inventory_component` | Inventory — Component A | Component A cost |
| CR | `inventory_component` | Inventory — Component B | Component B cost |
| DR | `production_scrap` | Production Costs (5500) | Scrap amount (if any) |

### `inventory.disassembly.completed` — Disassembly

Reverse of assembly:

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `inventory_component` | Inventory — Component A | Allocated cost |
| DR | `inventory_component` | Inventory — Component B | Allocated cost |
| CR | `inventory_fg` | Inventory — Finished Good | Finished good cost |

### `inventory.count.approved` — Stock Count Variance

Delegates to `inventory.adjustment.posted` — creates one adjustment entry per variance line. Handler should iterate count variance lines and emit adjustment events (or build all lines in a single JE).

---

## Cheque Events (7)

### `cheque.status.received` — Customer Cheque Received

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `cheques_in_hand` | Cheques in Hand (1150) | Amount, FN |
| CR | `trade_receivable` | Trade Receivables (1131) | Same, FN |

### `cheque.status.deposited` — Cheque Deposited

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `cheques_in_transit` | Cheques in Transit (1129) | Amount, FN |
| CR | `cheques_in_hand` | Cheques in Hand (1150) | Same, FN |

### `cheque.status.cleared` (received) — Received Cheque Cleared

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `bank` | Bank Account (112x) | Amount, FN |
| CR | `cheques_in_transit` | Cheques in Transit (1129) | Same, FN |

### `cheque.status.bounced` — Cheque Bounced

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `trade_receivable` | Trade Receivables (1131) | Cheque amount (re-opens AR) |
| DR | `cheque_bounce_fee` | Cheque Bounce Fees (7130) | Bank fee |
| CR | `cheques_in_transit` | Cheques in Transit (1129) | Cheque amount |
| CR | `bank` | Bank Account (112x) | Bank fee |

### `cheque.status.issued` — Supplier Cheque Issued

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `trade_payable` | Trade Payables (2111) | Amount, FN |
| CR | `cheques_issued` | Cheques Issued (2140) | Same, FN |

### `cheque.status.cleared` (issued) — Issued Cheque Cleared

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `cheques_issued` | Cheques Issued (2140) | Amount, FN |
| CR | `bank` | Bank Account (112x) | Same, FN |

### `cheque.status.cancelled` — Cheque Cancelled

Reverse the original entry based on cheque type and last status:

**Received cheque cancelled before deposit:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `trade_receivable` | Trade Receivables (1131) | Amount |
| CR | `cheques_in_hand` | Cheques in Hand (1150) | Amount |

**Issued cheque cancelled before clearing:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `cheques_issued` | Cheques Issued (2140) | Amount |
| CR | `trade_payable` | Trade Payables (2111) | Amount |

---

## Banking Events (1)

### `bank.transfer.completed` — Inter-Account Transfer

**Simple (same currency):**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `bank` | Target Bank (112x) | Amount, FN |
| CR | `bank` | Source Bank (112x) | Amount, FN |

**With bank fee:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `bank` | Target Bank | Amount |
| DR | `bank_charges` | Bank Charges (7110) | Fee |
| CR | `bank` | Source Bank | Amount + fee |

**Cross-currency:** Add DR/CR Realized FX Gain (4820) or Loss (7210) for rate difference.

---

## Accounting Internal Events (3)

### `accounting.fxRevaluation.completed` — Month-End FX Revaluation

Per open foreign-currency balance: `difference = FC_amount x closing_rate - book_value`

**Gain:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `ar` / `ap` / `bank` | AR/AP/Bank Account | Difference |
| CR | `unrealized_fx_gain` | Unrealized FX Gain (4830) | Difference |

**Loss:**

| DR/CR | Line Type | Account (default) | Amount |
|-------|-----------|-------------------|--------|
| DR | `unrealized_fx_loss` | Unrealized FX Loss (7220) | Difference |
| CR | `ar` / `ap` / `bank` | AR/AP/Bank Account | Difference |

Auto-reverses on first day of next period.

### `accounting.yearEnd.closed` — Year-End Closing

Handled by `YearEndClosingService` (already built). Event listener delegates directly.

```
DR  All Income accounts (4xxx)        [their balances]
CR  All Expense accounts (5xxx-7xxx)  [their balances]
DR/CR  Retained Earnings — Current Year (3300)  [net = income - expenses]

Then:
DR  Retained Earnings — Current Year (3300)     [full balance]
CR  Retained Earnings — Prior Years (3200)       [same]
```

### `accounting.openingBalance.posted` — Opening Balance

```
DR/CR  [Each account]                 [opening balance]
DR/CR  Opening Balance Equity (3900)  [balancing amount]
```

3900 should net to zero after all opening balances are entered.

---

## Implementation Priority

Build in this order (each phase unlocks a module):

| Phase | Events | Count | Unlocks |
|-------|--------|-------|---------|
| 1 | POS (4) + Inventory adjustment/transfer (2) | 6 | POS module |
| 2 | Sales (3) + Cheques (7) | 10 | Sales module |
| 3 | Purchase (4) + Inventory remaining (4) | 8 | Purchase module |
| 4 | Banking (1) + FX revaluation (1) + Opening balance (1) | 3 | Full accounting |

**Total: 27 events** (excludes 4 future loyalty stubs and `yearEnd.closed` which is already built).
