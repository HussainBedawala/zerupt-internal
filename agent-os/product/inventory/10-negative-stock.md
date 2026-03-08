# Negative Stock Handling

## Company-Level Setting

| Mode | Behavior |
|------|----------|
| **Strict** | Block any transaction that would cause on-hand to go below zero |
| **Flexible** (default) | Warn the user but allow the transaction to proceed |

Set during onboarding. Changeable by admin.

## Item-Level Overrides

| Item Type | Override | Rationale |
|-----------|----------|-----------|
| Serial-tracked | Always strict (block) | Each serial is a physical unit. Cannot sell what doesn't exist. |
| Batch-tracked | Warn | Batch consumption tracks layers. Negative means data issue. |
| Regular (no tracking) | Follow company setting | |

## Enforcement Points

Every outbound movement checks before proceeding:

| Module | Check Point |
|--------|------------|
| POS | Before completing transaction |
| Sales | Before confirming invoice |
| Inventory | Before posting adjustment (decrease), transfer (send), consumption |
| Assembly | Before consuming components |

## Check Logic

```
availableAfter = currentOnHand - outboundQty

if availableAfter < 0:
  if item.trackingType == 'Serial':
    → BLOCK (always)
  elif companyMode == 'Strict':
    → BLOCK
  elif companyMode == 'Flexible':
    → WARN (show dialog: "This will cause negative stock. Proceed?")
    → If user confirms, allow and log the override
    → Create negative stock alert
```

## When Negative Stock Occurs

1. Alert created immediately (priority: Critical)
2. Item flagged in inventory dashboard
3. Inventory value may be incorrect (negative qty × WAC = negative value)
4. Resolution options:
   - Receive pending GRN (stock was sold before receipt was recorded)
   - Create positive adjustment (found stock)
   - Investigate data entry error

## WAC with Negative Stock

If on-hand is negative and new stock arrives:
```
New WAC = (negative_qty × old_WAC + incoming_qty × incoming_cost)
          ÷ (negative_qty + incoming_qty)
```

This can produce unexpected results. The system should flag items where WAC changed significantly due to negative stock resolution.
