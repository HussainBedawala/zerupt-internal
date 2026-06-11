<!-- Feature catalog partition | Module: purchase | Generated: 2026-06-11 | Source: as-built audit -->
# Purchase — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

## Supplier Master
- **Status:** shipped
- **Description:** Full supplier profile including auto-generated supplier code, payment term days, contact details, and optional logo image upload/delete. Suppliers can be listed with pagination and filtered by status.
- **Who it's for:** Purchasing managers, bookkeepers; all regions.
- **Constraints / notes:** Soft-delete (status=inactive) prevents new documents; existing AP balances are unaffected.

## Supplier Item Code Cache
- **Status:** shipped
- **Description:** Automatically learns a supplier's own internal product codes (e.g. "VENDOR-99") from scanned invoices and maps them to the tenant's SKUs. Populated on every AI invoice scan approval; bad mappings self-correct when a reviewer confirms a different product.
- **Who it's for:** Operations teams using the Sami AI invoice scanner; all regions.
- **Constraints / notes:** Unique per (tenant, supplier, supplier_code). No soft-delete — incorrect mappings are overwritten, not hidden.

## Purchase Order — Draft & Line Management
- **Status:** shipped
- **Description:** Create a draft PO against a supplier with multi-line items; each line carries quantity, unit price, discount, tax group, and target warehouse. Totals (subtotal, tax, discount, grand total) are recomputed live.
- **Who it's for:** Purchasing managers; all regions.
- **Constraints / notes:** PO number is only assigned on confirm (draft uses a UUID placeholder). Lines can be added, updated, and removed while status is draft.

## Purchase Order — Confirm / Approval-Pin Gate
- **Status:** shipped
- **Description:** Confirming a PO advances it from draft to confirmed status and locks lines for editing. A manager approval PIN is required when the PO total exceeds the tenant's configured approval threshold, enforcing a two-person control.
- **Who it's for:** Purchasing managers and approving managers; all regions.
- **Constraints / notes:** PinVerificationService validates the PIN hash at confirm time. Confirmed POs emit `purchase.order.confirmed` which increases on-order inventory qty.

## Purchase Order — Cancel
- **Status:** shipped
- **Description:** Cancels a confirmed PO, releasing the on-order inventory reservation and emitting `purchase.order.cancelled` to reverse any accounting effect.
- **Who it's for:** Purchasing managers; all regions.
- **Constraints / notes:** Cannot cancel a PO that has an associated GRN already confirmed (partially_received or fully_received status).

## Goods Received Note (GRN) — Create & Line Management
- **Status:** shipped
- **Description:** Records the physical arrival of goods against a confirmed PO. Each GRN line links back to a PO line and captures received quantity, actual unit cost, and optionally serial numbers, batch number, and expiry date for lot-tracked items.
- **Who it's for:** Warehouse staff, purchasing teams; all regions.
- **Constraints / notes:** GRN inherits supplier, branch, and currency from the parent PO. Only POs in `confirmed` or `partially_received` status are receivable.

## GRN — Confirm / Approval-Pin Gate
- **Status:** shipped
- **Description:** Confirming a GRN posts stock to inventory and fires `purchase.grn.confirmed`, triggering both the AP journal and the inventory GRN_RECEIPT movement. A manager PIN is required when cumulative received quantity on any line causes a threshold breach.
- **Who it's for:** Warehouse managers, purchasing managers; all regions.
- **Constraints / notes:** FiscalPeriodService validates the receipt date falls in an open period. SerialAllocationService assigns serial numbers on confirm.

## GRN-Matching Bill Flow (from-GRN)
- **Status:** shipped
- **Description:** Create a purchase invoice (bill) directly from one or more confirmed GRNs. Lines are pre-populated from GRN lines (quantities, costs, tax groups) and each invoice line retains a `grnLineId` reference, providing a full 3-way match (PO → GRN → Invoice).
- **Who it's for:** Accounts payable teams; all regions.
- **Constraints / notes:** Source GRN IDs are stored on the invoice (`sourceGrnIds`). The GRN's `hasSupplierInvoice` flag is updated to prevent double-billing.

## Purchase Invoice (Bill) — Manual Create & Line Management
- **Status:** shipped
- **Description:** Create a freehand bill against a supplier without a GRN, for service purchases or situations where goods arrive without a prior PO. Supports multi-line with discount, tax, and due date.
- **Who it's for:** Accounts payable teams; all regions.
- **Constraints / notes:** Bill number (PINV-NNNN) is gapless and only assigned on confirm. Default payment due days fall back to 30 if not configured on the supplier.

## Purchase Invoice — Confirm & Accounting Post
- **Status:** shipped
- **Description:** Confirming a bill posts the AP journal entry (Cr AP / Dr Inventory or Expense per line) and emits `purchase.bill.confirmed`. The bill balance is tracked for payment allocation.
- **Who it's for:** Accountants, AP teams; all regions.
- **Constraints / notes:** FiscalPeriodService validates the invoice date. Tax lines are built and emitted in the event payload for input VAT/GST recovery posting.

## Supplier Payment — Standard (Bill Settlement)
- **Status:** shipped
- **Description:** Record a payment to a supplier and allocate it against one or more confirmed bills in a single transaction. The allocated amount reduces each bill's outstanding balance atomically.
- **Who it's for:** Accounts payable teams, cashiers; all regions.
- **Constraints / notes:** Allocation is validated against confirmed bills of the same supplier. Concurrent payments against the same bill are serialized at DB level. Approval PIN required on post.

## Supplier Payment — Advance
- **Status:** shipped
- **Description:** Park a prepayment with a supplier before any bill exists. The advance is posted to an advance-payable holding account (1161) and later applied to bills when they are received.
- **Who it's for:** Purchasing managers, AP teams; all regions (common in MENA/GCC supplier relationships).
- **Constraints / notes:** FX gain/loss on advance application is computed at application time (not post time). Separate `allocateAdvance` call applies the parked advance to specific bills.

## FX Gain / Loss on Supplier Payments
- **Status:** shipped
- **Description:** When a bill is denominated in a foreign currency and paid at a different exchange rate, the system automatically computes and posts the realized FX gain or loss (accounts 4820/7210) as part of the payment posting journal.
- **Who it's for:** Accountants at multi-currency tenants; GCC (USD/AED/SAR invoices are common).
- **Constraints / notes:** Computed by `computeSupplierPaymentFx`. Zero for same-currency transactions and for advance payments (FX realizes on application). Advance-applied FX is computed at allocation time.

## Purchase Returns (Debit Notes)
- **Status:** shipped
- **Description:** Create a return document against a confirmed GRN to send goods back to a supplier. Each return line references the original GRN line; the system validates that returned quantities never exceed originally received quantities.
- **Who it's for:** Purchasing managers, warehouse staff; all regions.
- **Constraints / notes:** Approval PIN required on confirm. Confirming a return emits `purchase.return.confirmed`, reversing the inventory receipt and posting the AP credit. `resolveGrnInvoiceFlags` updates the GRN's invoice flags accordingly.

## Landed Cost Allocation
- **Status:** shipped
- **Description:** Attach additional costs (freight, customs duties, insurance, etc.) to a GRN and allocate them across received lines to true-up landed cost of inventory. Four allocation methods supported: by value, by quantity, by weight, and manual.
- **Who it's for:** Purchasing managers, cost accountants; import-heavy retailers in MENA, SEA, India.
- **Constraints / notes:** `by_weight` method uses `items.weight_kg` from the inventory master. Manual allocation requires an approval PIN from a manager. Posting a landed cost triggers `inventory/landed-cost.listener.ts` to revalue stock at the adjusted cost.

## AP Overview Dashboard
- **Status:** shipped
- **Description:** Single-page AP summary showing total outstanding AP balance, total overdue AP (invoices past due date with remaining balance), and recent payables activity — giving a real-time cash obligations snapshot.
- **Who it's for:** Finance managers, owners; all regions.
- **Constraints / notes:** Overdue AP computed as confirmed invoices where `dueDate < today AND balance > 0`. Exposed at `tenant/purchase/overview`.

## Event-Driven Accounting Integration
- **Status:** shipped
- **Description:** Every purchase lifecycle action (PO confirm/cancel, GRN confirm, bill confirm, return confirm, payment posted, advance applied) fires a domain event consumed by `purchase-accounting.listener.ts` to post the correct double-entry journal without polling or manual triggers.
- **Who it's for:** Internal / accounting engine; transparent to end users.
- **Constraints / notes:** Events: `purchase.order.confirmed`, `purchase.grn.confirmed`, `purchase.bill.confirmed`, `purchase.return.confirmed`, `purchase.payment.posted`, `purchase.payment.advanceApplied`. GRN confirmed is also consumed by `InventoryDomainEventListener` for stock movement journaling.
