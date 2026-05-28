# Stock Adjustments & Opening Balances (DEV-264)

Why a retail ERP needs manual stock adjustments, and the accounting/costing concepts
behind doing them safely. Implementation lives in `erp/apps/api/src/inventory/stock-adjustments/`.

## Why this exists

A full Purchase module (PO → GRN → supplier invoice → payment) is heavy. For the MVP
the same *physical* outcome — "stock entered or left the building outside a sale" — is
captured by one user-facing document: the **stock adjustment**. It covers receiving goods
(`PurchaseReceived`), damage/loss (`Damaged`/`Lost`/`WriteOff`), found stock (`Found`), and
a special onboarding case: **opening balances**. This is the wedge that lets a shop go live
without first building procurement.

## The two ledgers must never disagree

Every stock movement touches two independent record systems:

1. **The stock ledger** (quantity + cost of physical goods) — append-only `stock_ledger_entries`
   plus the fast-path `materialized_stock_levels` (current on-hand + weighted-average cost).
2. **The general ledger** (money) — journal entries in the accounting module.

The cardinal rule: **the value written to the stock ledger and the value posted to the GL
must be the same number.** If they drift, inventory on the balance sheet stops matching the
warehouse, and no report can be trusted. We guarantee this by computing each line's `totalCost`
once and feeding the identical figure to both the ledger write and the accounting event.

## Weighted-average cost (WAC), applied to adjustments

WAC answers "what is one unit worth right now?" after blending every receipt:

```
newWAC = (existingQty × existingWAC + incomingQty × incomingCost) / (existingQty + incomingQty)
```

- **Increase** (receive/found): recompute WAC with the incoming cost. If no cost is given,
  goods enter *at the current WAC* (the average is unchanged). A brand-new item has no WAC,
  so the first stock-in *must* carry an explicit cost — otherwise it would enter at 0 and
  silently poison every future COGS calculation.
- **Decrease** (damage/loss): stock leaves *at the current WAC*. The average per remaining
  unit doesn't change; only quantity and total value drop.

All money is `numeric(19,6)` with banker's rounding (ROUND_HALF_EVEN) to avoid the
penny-drift that naive rounding accumulates over thousands of transactions.

## What the accounting entries actually are

- **Decrease**: `DR Inventory Write-Down / CR Inventory` — value leaves the asset and lands
  in an expense/loss account.
- **Increase (found/receive)**: `DR Inventory / CR Inventory Gain` — asset goes up, offset by
  a gain.

The inventory module never writes journal entries itself; it emits `inventory.adjustment.posted`
and the accounting module owns the GL mapping. This keeps the two domains decoupled.

## Opening balances are NOT a gain

The subtle one. When a shop migrates in, you seed its starting stock. It is tempting to treat
that as a big "found" adjustment — but that would post an *inventory gain* (P&L income), which
is wrong: the business didn't earn anything, it just brought existing assets onto the books.
Opening inventory value is part of the **opening balance journal entry** (DR Inventory /
CR Opening Balance Equity), posted once by the accounting `OpeningBalanceService`. So the
inventory opening-balance path seeds quantity + cost into the stock ledger and **emits no
accounting event** — otherwise the inventory asset would be counted twice. Opening balances
are also the single exception to server-generated timestamps: the user supplies the cutover
date (always in the past, never future).

## Negative stock: a policy, not a bug

Selling or writing off more than you have on record shouldn't always be blocked — data entry
lags reality in real shops (goods sold before the receipt was keyed). So it's a company choice:

- **Strict**: block any movement that would push on-hand below zero.
- **Flexible** (default): allow it when the user explicitly confirms, and raise a
  negative-stock alert for someone to reconcile.

This is a real persisted setting (`tenant_identity.negative_stock_policy`), read inside the
posting transaction so a concurrent settings change can't be raced.

## Posting is all-or-nothing

A document with many lines posts in a single DB transaction: header + every ledger line +
every stock-level update commit together or not at all. Per-item rows are locked
`SELECT … FOR UPDATE` in a deterministic (sorted) order so two concurrent adjustments on the
same items can't deadlock. The document number (`ADJ-0001`) is reserved from a gap-tolerant
sequence and committed after the document lands (released if the transaction rolls back).

## Period control

You can't change history that's been closed. Before any write, the transaction date is checked
against the fiscal period: hard-locked / soft-locked / future-dated / backdated-before-the-lock
are all rejected. This is what stops someone "fixing" last quarter's stock after the books closed.

## Takeaways

- One physical movement, two ledgers — keep their values identical by construction.
- WAC blends cost on the way in; goods leave at the current average.
- Opening stock is an equity injection, not income — never double-post it.
- Negative stock is a tenant policy with an audit trail, not a hard error.
- Atomic, period-guarded, lock-ordered posting is what makes inventory numbers trustworthy.
