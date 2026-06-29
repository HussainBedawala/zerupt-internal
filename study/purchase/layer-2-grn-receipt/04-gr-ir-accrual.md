# Chapter 4 — GR/IR Accrual Journal

## The Two Credit Paths

At GRN confirm, the accounting listener `handleGrnConfirmed` (`purchase-accounting.listener.ts:365`) always posts:
```
DR Inventory 1141   (inventoryAmount = grn.subtotal)
CR ??? (depends on hasSupplierInvoice flag)
```

| `hasSupplierInvoice` | Credit Leg | Account | Notes |
|---------------------|------------|---------|-------|
| `false` (default) | GRN Accrual | 2121 | Bill not yet received — GRIR pending |
| `true` | Accounts Payable | 2111 (supplier-tagged) | Bill received with goods |

## The GR/IR Accrual Path (hasSupplierInvoice = false)

Journal at GRN confirm:
```
DR  Inventory 1141              = grn.subtotal
CR  GRN Accrual 2121            = creditTotal
```

Where `creditTotal = grn.total − reverseChargeTaxTotal` (`grns-events.ts:126–128`). Tax legs are **not recognised** on the GRN — `taxLines` is empty when `hasSupplierInvoice = false`.

Comment: `purchase-accounting.listener.ts:396–399`:
> "Input tax legs are only recognised when the bill is matched at receipt. When hasSupplierInvoice = false there is no input tax (taxLines is empty)."

### How Layer 3 Clears the Accrual

When the purchase invoice (`purchase.invoice.confirmed`) confirms later:

```
DR  GRN Accrual 2121          = accrualClearedAmount   (clears the 2121 from GRN confirm)
DR  Inventory 1141            = inventoryRemainder      (manual/unmatched lines)
DR  Input Tax 1162            = per tax leg             (recoverable VAT recognised here)
CR  Accounts Payable 2111     = payableTotal            (supplier-tagged)
```

`accrualClearedAmount` = the portion of the bill's net subtotal that came from matched GRN lines.
`purchase-accounting.listener.ts:237–247`

Net result across both JEs:
```
DR  Inventory 1141  (net cost)
DR  Input Tax 1162  (VAT)
CR  Accounts Payable 2111
```
Identical to what a single "matched at receipt" GRN would have posted. The 2121 is a transit account.

## The Matched-at-Receipt Path (hasSupplierInvoice = true)

Journal at GRN confirm:
```
DR  Inventory 1141              = grn.subtotal
DR  Input Tax 1162              = per recoverable tax leg
DR  RC Input Tax 1162.10        = per reverse-charge leg (+ CR RC Output Tax 2131.10)
CR  Accounts Payable 2111       = creditTotal  (supplier-tagged)
```

Tax is recognised immediately. The bill (Layer 3) will debit 2121 for `accrualClearedAmount = 0` (nothing to clear) and debit inventory only for any manually-added unmatched lines.

## Key Fields in the Event Payload

File: `grns-events.ts:74`

| Field | Value | Purpose |
|-------|-------|---------|
| `inventoryAmount` | `grn.subtotal` (Σ qty × cost) | DR Inventory leg |
| `creditTotal` | `grn.total − RC tax total` | CR AP or 2121 leg |
| `taxLines` | populated only when `hasSupplierInvoice = true` | input tax legs |
| `hasSupplierInvoice` | boolean | switches credit account |
| `supplierId` | required | tags the AP control line (party subledger) |

## GR/IR Accrual Reversal on Purchase Return

When a purchase return confirms (Layer 5), the listener (`handleReturnConfirmed`) splits the AP debit by source-GRN flag:

| Source GRN flag | Debit leg |
|----------------|-----------|
| `hasSupplierInvoice = true` (matched) | DR Accounts Payable 2111 (`debitPayableTotal`) |
| `hasSupplierInvoice = false` (accrual) | DR GRN Accrual 2121 (`debitAccrualTotal`) |

`purchase-accounting.listener.ts:639–659`

This prevents a return against an accrual-only GRN from incorrectly touching the AP subledger before the bill has even arrived.

## REQUIRES / Gaps

| Gap | Detail |
|-----|--------|
| Aged GRIR report | No dedicated report for open 2121 balances by GRN / age. REQUIRES. |
| Tax at receipt on accrual GRNs | Tax correctly deferred to bill. But there is no guard preventing a caller from setting `hasSupplierInvoice = false` AND passing tax lines — `taxLines` would just be ignored. Low risk but inconsistent. |
| `hasSupplierInvoice` editability | Once a GRN is in draft, the `hasSupplierInvoice` flag can be changed before confirm. No validation that the flag won't change the expected accounting path. REQUIRES documentation or UI lock. |
| Partial-bill accrual split | `accrualClearedAmount` is computed at bill level by `PurchaseInvoicesService.fromGrn`. The GRN service itself does not track how much of each GRN line has been billed — `billedQty` on grnLines tracks this per-line. |
