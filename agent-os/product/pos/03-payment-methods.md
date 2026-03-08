# Payment Methods

> How payments are accepted, split across tenders, and how change is calculated.

## Payment Record

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique payment identifier |
| `transactionId` | UUID | Yes | Parent transaction |
| `method` | Enum | Yes | `Cash`, `Card`, `StoreCredit`, `GiftCard`, `Custom` |
| `amount` | Decimal | Yes | Amount tendered in this payment |
| `amountFC` | Decimal | No | Foreign currency amount (if multi-currency cash) |
| `currency` | String | Yes | Currency of this payment |
| `exchangeRate` | Decimal | No | Rate used if currency differs from functional |
| `reference` | String | No | Card auth code, gift card number, etc. |
| `cardType` | String | No | `Visa`, `Mastercard`, `KNET`, `mada`, `Amex` |
| `cardLast4` | String | No | Last 4 digits of card |
| `giftCardId` | UUID | No | Gift card used |
| `storeCreditId` | UUID | No | Store credit used |
| `changeGiven` | Decimal | No | Change returned (cash only) |
| `createdAt` | DateTime | Yes | When payment was recorded |

## Supported Methods

### Cash

1. Cashier enters amount tendered
2. If tendered > grand total, change = tendered - grand total
3. Change is always in the transaction's currency
4. Cash drawer opens on completion
5. Cash increases the register's `expectedCash` for shift close

### Card

1. Cashier selects "Card" and enters amount (defaults to remaining balance)
2. Payment terminal processes the charge
3. Cashier enters auth code / approval reference
4. Card payments do not affect cash drawer
5. Card settlements go to bank account (configured per card type per branch)

### Split Payment

1. Multiple payments can be applied to a single transaction
2. Each payment is a separate record with its own method
3. Sum of all payment amounts must equal or exceed `grandTotal`
4. Overpayment only allowed on the last payment if it's cash (change returned)
5. No overpayment allowed on card, store credit, or gift card

### Store Credit

1. Customer must be linked to the transaction
2. System shows available store credit balance
3. Amount cannot exceed available balance
4. Balance is deducted immediately on completion
5. If transaction is voided, store credit is restored

### Gift Card

1. Cashier scans or enters gift card number
2. System validates: card exists, active, has balance
3. Amount cannot exceed card balance
4. Balance is deducted immediately on completion
5. If transaction is voided, gift card balance is restored
6. Gift card can be used with any customer (not customer-linked)

### Custom Payment Method

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique method identifier |
| `code` | String | Yes | Short code, e.g. `BNPL` |
| `name` | String | Yes | Display name |
| `nameAlt` | String | No | Alternate language name |
| `affectsCashDrawer` | Boolean | Yes | Whether to include in cash count |
| `requiresReference` | Boolean | Yes | Whether cashier must enter a reference |
| `accountId` | UUID | Yes | GL account for this method |
| `isActive` | Boolean | Yes | Whether available on POS |

## Rounding

| Currency | Smallest Denomination | Rounding Rule |
|----------|----------------------|---------------|
| KWD | 0.005 | Round to nearest 5 fils |
| AED | 0.25 | Round to nearest 25 fils |
| SAR | 0.05 | Round to nearest 5 halalas |
| USD | 0.01 | No rounding needed |
| BHD | 0.005 | Round to nearest 5 fils |

1. Rounding applies to cash payments only
2. Card payments use exact amount (no rounding)
3. Rounding difference is absorbed by the register (tracked in cash over/short)
4. Rounding is applied to the `grandTotal`, not per line

## Rules

1. At least one payment is required to complete a transaction
2. Payment cannot be added to a `Completed` or `Voided` transaction
3. Payments on a voided transaction are reversed (refund to original method)
4. Foreign currency cash: cashier enters FC amount + rate, system calculates functional equivalent
5. Card payment requires a reference (auth code) — cannot be blank
6. Gift card and store credit cannot produce change — overpayment not allowed
7. Payment records are immutable after transaction completion
