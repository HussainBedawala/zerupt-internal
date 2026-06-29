# Layer 3 — Purchase Invoice / Billing: Overview

Layer 3 is the AP posting layer. It converts supplier invoices into double-entry journal entries, manages GRN accrual clearing, input VAT recognition, and AP subledger entries. It sits directly on top of Layer 2 (GRN / goods receipt).

## Layer Stack Recap

| Layer | Document | Key JE |
|-------|----------|--------|
| 2 (below) | GRN confirmed | DR Inventory 1141 / CR GRN Accrual 2121 (or CR AP 2111 if matched) |
| **3 (this)** | **Bill confirmed** | **DR GRN Accrual 2121 (clear) + DR Input Tax 1162 / CR AP 2111** |
| 4 (above) | Payment posted | DR AP 2111 / CR Cash/Bank |

## Two Entry Paths

| Path | Trigger | Key difference |
|------|---------|---------------|
| **3-way match** | Bill built from GRN (`fromGrn`) | Clears 2121 instead of re-debiting 1141 |
| **2-way (direct)** | Direct purchase or manual bill | GRN still used internally; `hasSupplierInvoice=false` accrual path |

## Core Files

| File | Role |
|------|------|
| `erp/apps/api/src/purchase/invoices/purchase-invoices.service.ts` | Bill lifecycle: create, fromGrn, addLine, confirm |
| `erp/apps/api/src/purchase/direct/direct-purchase.service.ts` | Composable direct-purchase orchestrator (PO→GRN→bill→pay) |
| `erp/apps/api/src/accounting-events/listeners/purchase-accounting.listener.ts` | Event→JE: invoice.confirmed, grn.confirmed, grn.voided, return.confirmed, payment.posted |
| `erp/packages/db/src/schema/purchase.ts` | Schema: purchaseInvoices, purchaseInvoiceLines |

## Event Flow (3-way match)

```
fromGrn() → draft bill (grnLineId on each line)
  → confirm() →
    1. recompute() — freeze tax/totals at bill date
    2. applyGrnMatching() — increment billedQty, compute accrualClearedAmount
    3. UPDATE status=confirmed, assign PINV-NNNN number
    4. outbox.insert(purchase.invoice.confirmed)
    5. emit purchase.invoice.confirmed →
         PurchaseAccountingListener →
           DR grn_accrual 2121 (accrualClearedAmount)
           + DR inventory 1141 (remainder, if any)
           + DR input_tax 1162 (recoverable VAT)
           + CR payable 2111 (gross total, supplier-tagged)
```

## Key Accounts

| Code | Name | Role |
|------|------|------|
| 1141 | Inventory | Stock value; debited at receipt and at manual bill |
| 1162 | Input Tax | Recoverable VAT/GST receivable |
| 2111 | Trade Payables | AP control account (party-tagged, subledger) |
| 2121 | GRN Accrual | Cleared when bill confirms against a GRN |
| 1161 | Supplier Prepayments | Advance payments (not in Layer 3) |

## Immutability

Confirmed bills are immutable. No cancel or edit. Corrections flow through purchase returns (Layer 5).
