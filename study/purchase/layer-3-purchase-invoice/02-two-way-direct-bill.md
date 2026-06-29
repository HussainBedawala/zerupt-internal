# 02 — Two-Way Match / Direct Bill

Two-way match means a bill is posted without a prior GRN (or with the GRN created atomically in the same transaction). There are two variants:

## Variant A: Direct Purchase (Composable Orchestrator)

File: `erp/apps/api/src/purchase/direct/direct-purchase.service.ts`

A single atomic transaction creates all documents in sequence:

```
hidden PO (confirmed, no event)
  → draft GRN (hasSupplierInvoice = false)
    → confirm GRN (DR Inventory 1141 / CR GRN Accrual 2121)
      → fromGrn() → draft bill (GRN-linked lines)
        → confirm bill (DR GRN Accrual 2121 [clear] / CR AP 2111)
          → (optional) standard payment + post (DR AP 2111 / CR Cash/Bank)
```

Net ledger result: `DR Inventory 1141 / DR Input Tax 1162 / CR AP 2111 (or CR Cash/Bank if paid)` — identical to 3-way match. The 2121 accrual appears and clears within the same transaction.

Key design decision: `hasSupplierInvoice = false` on the GRN so the GRN posts to 2121 (not AP), and the bill then clears it. This ensures a payable bill exists that can be settled separately if needed (the "credit" settlement path).

### Exchange Rate

Direct purchase is **functional-currency only**: `exchangeRate = "1"` hardcoded, never trusted from client (direct-purchase.service.ts:44). This prevents AP-aging-in-functional corruption.

### Approval Gate (M2)

After `confirm bill`, if `po_approval_threshold` is configured AND `confirmedBill.total > threshold`:
- `approvedBy` + `approvalPin` required
- Verified via `PinVerificationService` (SoD: approver ≠ actor, must hold `purchase.order.confirm`)
- Gate runs **inside** the transaction — rollback on failure leaves nothing committed (direct-purchase.service.ts:286)

### Idempotency

`directPurchases` table has `UNIQUE(tenantId, idempotencyKey)`. A retry returns the prior anchor row (replayed=true) with no re-posting. Unique-violation on the anchor itself → catch → retry lookup → return existing.

## Variant B: Manual Bill (No GRN)

Via `POST /tenant/purchase-invoices` → `create()`. Lines added manually via `addLine()`. No `grnLineId` on lines. At confirm:
- `applyGrnMatching()` returns `"0"` (no GRN-linked lines)
- Full `inventoryAmount` goes to DR Inventory 1141 (no accrual clearing)
- Input tax recognised if tax group set on lines

This is a pure 2-way match: only the invoice (no GRN, no PO check). Quantity and price are unconstrained.

## Variant C: fromGrn() as Standalone (External caller)

`POST /tenant/purchase-invoices/from-grn` → bill built from already-confirmed GRNs that had `hasSupplierInvoice = false`. This is the standard 3-way match path (see chapter 01) but is called "2-way" in some contexts because the PO may or may not have existed — the bill is matched to the GRN, not the PO.

## Comparison Table

| Dimension | Direct Purchase | Manual Bill |
|-----------|----------------|------------|
| GRN created | Yes (hidden, same tx) | No |
| GRN-linked lines | Yes (via fromGrn) | No |
| accrualClearedAmount | = full bill net | "0" |
| Inventory debit | via GRN confirm (1141) then clear via bill | direct from bill (1141) |
| Price constraint | None (user sets unitCost on line) | None |
| Qty constraint | None | None |
| Approval gate | Yes (M2 threshold) | No |
| Idempotency | Yes (idempotencyKey) | No |
| Currency | Functional only (rate=1) | Any (exchangeRate) |

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| Direct purchase orchestrator | EXISTS |
| Approval threshold gate (M2) | EXISTS |
| Idempotency on direct purchase | EXISTS |
| Functional-currency-only enforcement | EXISTS |
| Manual bill (no GRN) path | EXISTS |
| Multi-currency direct purchase | REQUIRES (currently blocked by design) |
| Bill-without-GRN quantity tolerance | REQUIRES (no guard at all — user-entered) |
