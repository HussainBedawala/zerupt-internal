# Discounts & Promotions

> Rules for applying discounts at line and order level, coupon codes, and manager approval thresholds.

## Discount Types

| Type | Scope | Description |
|------|-------|-------------|
| `LinePercent` | Line | Percentage off a single line |
| `LineAmount` | Line | Fixed amount off a single line |
| `OrderPercent` | Order | Percentage off the order subtotal |
| `OrderAmount` | Order | Fixed amount off the order subtotal |
| `Coupon` | Order or Line | Code-activated discount |

## Line-Level Discount

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | Enum | Yes | `LinePercent` or `LineAmount` |
| `value` | Decimal | Yes | Percentage (0-100) or fixed amount |
| `reason` | String | No | Cashier-entered reason |
| `approvedById` | UUID | No | Manager who approved (if above threshold) |

### Rules

1. Line discount applied before tax calculation
2. `LinePercent` caps at 100%
3. `LineAmount` cannot exceed `quantity × unitPrice`
4. Multiple line discounts on the same line are not stacked — last one wins
5. Line discount stored on the transaction line (see `02-transaction-lifecycle.md`)

## Order-Level Discount

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | Enum | Yes | `OrderPercent` or `OrderAmount` |
| `value` | Decimal | Yes | Percentage (0-100) or fixed amount |
| `reason` | String | No | Cashier-entered reason |
| `approvedById` | UUID | No | Manager who approved (if above threshold) |

### Rules

1. Order discount is distributed proportionally across lines (for accounting)
2. Distribution formula: `lineShare = (lineTotal / subtotal) × orderDiscount`
3. Rounding remainder added to the highest-value line
4. Order discount applied before tax calculation
5. Only one order-level discount per transaction

## Coupon Code

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | UUID | Yes | Unique coupon identifier |
| `code` | String | Yes | Alphanumeric code, case-insensitive |
| `discountType` | Enum | Yes | `LinePercent`, `LineAmount`, `OrderPercent`, `OrderAmount` |
| `discountValue` | Decimal | Yes | Percentage or fixed amount |
| `validFrom` | DateTime | Yes | Start of validity |
| `validUntil` | DateTime | Yes | End of validity |
| `maxUses` | Integer | No | Total redemption limit (null = unlimited) |
| `maxUsesPerCustomer` | Integer | No | Per-customer limit |
| `usedCount` | Integer | Yes | Current redemption count |
| `minimumOrderAmount` | Decimal | No | Minimum subtotal to qualify |
| `applicableItemIds` | UUID[] | No | Restrict to specific items (null = all) |
| `applicableCategoryIds` | UUID[] | No | Restrict to categories (null = all) |
| `isActive` | Boolean | Yes | Whether coupon is active |

### Rules

1. Coupon validated at application time: active, within date range, under max uses, meets minimum
2. One coupon per transaction
3. Coupon can stack with one line-level discount (but not with order-level manual discount)
4. Coupon `usedCount` incremented on transaction completion, decremented on void
5. Offline: coupon validation uses locally cached coupon data; server re-validates on sync

## Manager Approval Thresholds

| Action | Threshold | Approval |
|--------|-----------|----------|
| Line discount (percent) | > 15% | Manager PIN |
| Line discount (amount) | > 10% of line total | Manager PIN |
| Order discount (percent) | > 10% | Manager PIN |
| Order discount (amount) | > 5% of subtotal | Manager PIN |
| Price override | Any | Manager PIN |
| Selling below cost | Any | Manager PIN |

### Rules

1. Thresholds are configurable per tenant (above are defaults)
2. Manager enters PIN on the POS terminal — no separate login
3. `approvedById` recorded on the discount or line
4. If manager is the cashier on shift, their own PIN is valid
5. Approval is per-action, not blanket — each discount above threshold needs separate approval
6. Offline: approval still required, validated against locally cached manager PINs
