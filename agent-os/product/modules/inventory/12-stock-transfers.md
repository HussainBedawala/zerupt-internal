# Stock Transfers

> As-built spec — DEV-391 (2026-06). Two-step inter-branch transfer with WAC cost-carry, in-transit GL, and delivery note.

---

## States

```
Draft → Sent (InTransit) → Received (Completed)
Draft → Cancelled
```

Document prefix: `TRF-` (sequential, no gaps).

---

## Draft → Sent

1. Validate source location has sufficient `onHand` stock for each line.
2. Respect negative-stock policy (`10-negative-stock.md`) — block if policy is `Strict`.
3. Create stock ledger entries: `TRANSFER_OUT` at source, -quantity, at current WAC.
4. Decrease source `onHand`; increase destination `inTransit`.
5. Emit accounting event via outbox: **DR Inventory in Transit / CR Inventory** (source account).
6. Transfer status → `InTransit`. Delivery note PDF available for dispatch.

---

## Sent → Received

1. Receiver enters quantity received per line (may be less than sent — partial receive allowed).
2. Create stock ledger entries: `TRANSFER_IN` at destination, +received quantity, at the **same WAC carried from the source** (no P&L at transfer — cost just moves between locations).
3. Decrease destination `inTransit`; increase `onHand`.
4. Emit accounting event via outbox: **DR Inventory / CR Inventory in Transit** (destination account).
5. Transfer status → `Completed` (or `PartiallyReceived` if any line is short).

**Shortfall (missing items):** received qty < sent qty → missing qty creates an `ADJUSTMENT_OUT` ledger entry from transit at the carried WAC. Accounting event: write-down to shrinkage/loss account. No P&L entry for the transfer itself; only the shortfall triggers a loss.

---

## Cost Rules

- WAC is carried from source to destination unchanged. Transfer is a location change, not a value event.
- No recalculation of destination WAC on receipt — the incoming cost is the source WAC, already pooled at the item level.
- FIFO tenants: the cost layer is carried at its layer cost.
- If source and destination belong to different inventory GL accounts (different branches on a multi-entity chart), separate DR/CR entries are generated per account.

---

## Negative Stock Policy

Transfers respect the tenant negative-stock policy (`10-negative-stock.md`). If `policy = Strict`, the send step is blocked when source stock is insufficient. If `Warn`, the user must confirm. If `Allow`, no guard.

---

## Delivery Note

Generated at the Sent step. Content: transfer number, date, source/destination location, lines (item, description, quantity sent), prepared-by. Available as PDF via browser print or agent. Signed off by receiver at the Received step (signature field on the document, not enforced electronically in v1).
