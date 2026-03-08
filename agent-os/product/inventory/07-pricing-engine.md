# Pricing Engine

## Price Structure

Each item can have prices defined at multiple levels. The system resolves the final selling price using a hierarchy.

## Price List

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | string | |
| `name` | string | "Retail", "Wholesale", "VIP", "Staff Discount" |
| `type` | enum | `Standard`, `Promotional` |
| `currencyCode` | string | Prices in this list are in this currency |
| `isActive` | boolean | |
| `validFrom` | date | null = always valid |
| `validTo` | date | null = no end date |

## Price List Item

| Field | Type | Description |
|-------|------|-------------|
| `priceListId` | string | |
| `itemId` | string | |
| `price` | decimal | Selling price in the price list's currency |
| `minQty` | decimal | Minimum quantity for this price to apply (quantity break) |

Multiple entries per item per price list allowed (for quantity breaks):
```
Item: T-Shirt in "Wholesale" list
  qty 1-9:    8.000
  qty 10-49:  7.200  (10% off)
  qty 50+:    6.400  (20% off)
```

## Customer-Specific Price

| Field | Type | Description |
|-------|------|-------------|
| `customerId` | string | |
| `itemId` | string | |
| `price` | decimal | |
| `validFrom` | date | |
| `validTo` | date | |

Overrides everything else for this customer + item combination.

## Location Price

| Field | Type | Description |
|-------|------|-------------|
| `branchId` | string | |
| `itemId` | string | |
| `price` | decimal | |

Different branches can have different prices (e.g., mall store vs warehouse outlet).

## Price Resolution Hierarchy

When determining the price for an item in a transaction:

```
1. Customer-specific price (if exists and valid date range)
   ↓ not found
2. Customer's assigned price list (if customer has a default price list)
   → find item in that list, pick the row matching quantity
   ↓ not found
3. Branch/location price (if exists)
   ↓ not found
4. Item's base price
```

**First match wins.** No further lookups after a match.

## Base Price

Every item has a base price stored directly on the item:

| Field | Type | Description |
|-------|------|-------------|
| `basePrice` | decimal | Default selling price in tenant's functional currency |
| `basePriceCurrency` | string | Currency of the base price |

## Promotional Pricing

Promotions are time-bound price overrides:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `name` | string | "Summer Sale", "Black Friday" |
| `type` | enum | `PercentOff`, `FixedPrice`, `AmountOff` |
| `value` | decimal | % off, fixed price, or amount off |
| `itemIds` | array | Items this applies to (or empty = all items) |
| `categoryIds` | array | Categories this applies to |
| `validFrom` | datetime | |
| `validTo` | datetime | |
| `isActive` | boolean | |

Promotions override the resolved price from the hierarchy:
```
Final price = min(hierarchy_price, promotional_price)
```

If multiple promotions apply, the **best price for the customer** wins (lowest).

## Tax on Prices

Prices can be stored as tax-inclusive or tax-exclusive (per price list or per tenant setting). The display context determines which to show:

- **POS / B2C:** Show tax-inclusive price
- **Invoice / B2B:** Show tax-exclusive with tax line

The pricing engine returns: `{ baseAmount, taxAmount, totalAmount, taxInclusive }`.
