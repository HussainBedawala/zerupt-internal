# Z-Report & Shift Closing

> Cash count by denomination, expected vs actual cash, discrepancy handling, and bank deposit.

## Expected Cash Calculation

```
expectedCash =
  openingFloat
  + cashSalesTotal
  - cashRefundsTotal
  - cashPayouts
  + cashReceived (pay-ins)
```

| Component | Source |
|-----------|--------|
| `openingFloat` | Shift record |
| `cashSalesTotal` | Sum of cash payments on completed sale transactions |
| `cashRefundsTotal` | Sum of cash refunds on completed return transactions |
| `cashPayouts` | Petty cash withdrawals during shift |
| `cashReceived` | Cash pay-ins during shift (e.g., change fund top-up) |

## Cash Count by Denomination

Cashier counts physical cash and enters quantities per denomination.

### Kuwait (KWD)

| Denomination | Type |
|-------------|------|
| 20.000 | Note |
| 10.000 | Note |
| 5.000 | Note |
| 1.000 | Note |
| 0.500 | Note |
| 0.250 | Note |
| 0.100 | Coin |
| 0.050 | Coin |
| 0.020 | Coin |
| 0.010 | Coin |
| 0.005 | Coin |

1. Denomination tables are configurable per tenant currency
2. Cashier enters quantity per denomination
3. System calculates total: `sum(denomination × quantity)`
4. This total becomes `actualCash` on the shift record

## Cash Over/Short

```
cashOverShort = actualCash - expectedCash
```

| Result | Meaning | Action |
|--------|---------|--------|
| `cashOverShort = 0` | Balanced | No action |
| `cashOverShort > 0` | Cash over | Logged, investigate if above threshold |
| `cashOverShort < 0` | Cash short | Logged, investigate if above threshold |

### Discrepancy Thresholds

| Threshold | Action |
|-----------|--------|
| ≤ ±1.000 KWD (configurable) | Auto-accepted, logged |
| > ±1.000 KWD | Manager review required before close |
| > ±5.000 KWD | Manager review + written explanation required |

1. Thresholds configurable per tenant in functional currency
2. Cash over/short posts to account `6700` (Cash Over/Short) — see `accounting/07-event-mappings.md`

## Cash Movements During Shift

### Pay-In (Cash Received)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique identifier |
| `shiftId` | UUID | Yes | Current shift |
| `type` | Enum | Yes | `PayIn` |
| `amount` | Decimal | Yes | Amount added to drawer |
| `reason` | String | Yes | e.g., "Change fund top-up" |
| `approvedById` | UUID | Yes | Manager who approved |
| `createdAt` | DateTime | Yes | Timestamp |

### Pay-Out (Petty Cash)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique identifier |
| `shiftId` | UUID | Yes | Current shift |
| `type` | Enum | Yes | `PayOut` |
| `amount` | Decimal | Yes | Amount removed from drawer |
| `reason` | String | Yes | e.g., "Office supplies" |
| `approvedById` | UUID | Yes | Manager who approved |
| `createdAt` | DateTime | Yes | Timestamp |

1. Both pay-in and pay-out require manager PIN
2. Both affect `expectedCash` calculation
3. Cash drawer opens for each

### Bank Deposit

1. At shift close, manager specifies amount deposited to bank
2. Remaining cash left in drawer becomes next shift's float (or removed)
3. Bank deposit recorded on shift close event
4. Accounting: DR Bank (per branch config) → CR Cash Register (1112) — see `accounting/07-event-mappings.md`

## Z-Report Content

| Section | Data |
|---------|------|
| **Header** | Branch, register, shift number, cashier, open/close times |
| **Sales Summary** | Transaction count, gross sales, returns, net sales |
| **Payment Breakdown** | Total by method: cash, each card type, store credit, gift card, custom |
| **Tax Summary** | Tax collected by tax group |
| **Discount Summary** | Total discounts by type (line, order, coupon) |
| **Void Summary** | Count and total of voided transactions |
| **Cash Movements** | Opening float, pay-ins, pay-outs, expected cash |
| **Cash Count** | Actual cash by denomination |
| **Over/Short** | Difference and explanation |
| **Bank Deposit** | Amount deposited |

## Rules

1. Z-report generated automatically on shift close
2. Z-report is immutable once shift is closed
3. Z-report printable on thermal printer or viewable on screen
4. Z-report data available in the ERP reporting module
5. No-sale drawer open (without transaction): requires manager PIN, logged
6. `pos.shift.closed` event emitted with full Z-report data
7. Shift cannot reopen after close — start a new shift instead
