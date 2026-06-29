# Layer 2 — GRN Receipt: Overview

> Scope: physical goods in + stock handoff + GR/IR accrual.
> Invoice matching = Layer 3. Landed cost = Layer 4. Purchase returns = Layer 5.

## What This Layer Covers

| Topic | File |
|-------|------|
| GRN vs PO: qty matching, tolerance, partial/multi-GRN, close logic | 01-grn-vs-po-receipt.md |
| Stock ledger handoff at confirm (idempotency, dimensions, cost) | 02-stock-handoff.md |
| Serial / batch / expiry capture at receipt | 03-serial-batch-capture.md |
| GR/IR accrual journal and how Layer 3 clears it | 04-gr-ir-accrual.md |
| Dual path: formal PO→GRN vs Direct Purchase | 05-dual-path-receipt.md |
| GRN reversal / cancel and its stock + accrual reversal | 06-reversal.md |
| Frontend GRN UI | 07-frontend.md |

## Key Files

| Purpose | Path |
|---------|------|
| GRN schema (header + lines) | `erp/packages/db/src/schema/purchase.ts:813` |
| GRN service (create, addLine, confirm, serial) | `erp/apps/api/src/purchase/grn/grns.service.ts` |
| GRN event emission (payload builder) | `erp/apps/api/src/purchase/grn/grns-events.ts` |
| GRN totals recompute | `erp/apps/api/src/purchase/grn/grns-totals.ts` |
| Purchase accounting listener (GR/IR journal) | `erp/apps/api/src/accounting-events/listeners/purchase-accounting.listener.ts:365` |
| Direct Purchase orchestrator | `erp/apps/api/src/purchase/direct/direct-purchase.service.ts` |
| GRN controller | `erp/apps/api/src/purchase/grn/grns.controller.ts` |
| Product spec | `agent-os/product/modules/purchase/03-goods-received-note.md` |
| Event contract spec | `agent-os/product/modules/purchase/08-event-mappings.md` |

## State Machine

```
Draft → Confirmed
```

- Draft is mutable: add/update/remove lines.
- Confirm is irreversible. Corrections via Purchase Return (Layer 5).
- No "cancelled" or "void" GRN status — the spec says no reversal of GRN.

## Confirm Transaction Sequence (happy path)

```
1. Lock GRN row FOR UPDATE (status = draft guard)
2. Lock PO row FOR UPDATE (over-receipt race prevention)
3. Load lines; assert at least one
4. validateSerialCounts (serial items: count = receivedQty, no dups)
5. checkOverReceipt per PO-line (net-received + this GRN vs orderedQty × tolerance)
6. recompute totals (tax + header) anchored to receiptDate
7. Guarded UPDATE grns SET status = 'confirmed' WHERE status = 'draft'
8. applyReceivedQty → UPDATE purchaseOrderLines.receivedQty += this GRN
9. transitionOrder (all lines net-received ≥ ordered → received; some → partially_received)
10. createSerialUnits (atomic in same tx; unique constraint fires here for duplicate serials)
11. outboxService.insert (purchase.grn.confirmed durable payload)
12. COMMIT
13. Post-commit: safeCommitReservation + emitGrnConfirmed (fast-path)
```

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| PO→GRN formal path | EXISTS |
| Direct Purchase (hidden PO→GRN) | EXISTS |
| Over-receipt tolerance + PIN approval | EXISTS |
| Serial unit creation at confirm | EXISTS |
| Batch / expiry capture (DB columns + forwarded in event) | EXISTS (capture) |
| Batch deep-validation (inventory engine materialises lot record) | EXISTS (via inventory listener) |
| GRN accrual journal (DR Inventory / CR 2121) | EXISTS |
| Matched-at-receipt journal (DR Inventory / CR AP 2111) | EXISTS |
| GRN reversal / cancel | REQUIRES (no cancel status; corrections only via purchase return) |
| Bin-level receipt destination | REQUIRES (warehouseId captured; bin dimension not yet in GRN line) |
| Multiple warehouses per GRN (per-line) | EXISTS (warehouseId per line) |
