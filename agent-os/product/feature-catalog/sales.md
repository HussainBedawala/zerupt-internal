<!-- Feature catalog partition | Module: sales | Generated: 2026-06-11 | Source: as-built audit -->
# Sales — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

---

## Customer Master (CRUD)
- **Status:** shipped
- **Description:** Full create/read/update/delete for customer records with auto-generated customer codes (CUST-0001 sequence), tax group assignment, net payment terms (days), and active/inactive status lifecycle.
- **Who it's for:** Sales managers, store owners — any merchant onboarding B2B buyers or repeat retail customers.
- **Constraints / notes:** Customer codes are tenant-scoped and unique; deletion is restricted if invoices or receipts exist. Status can be deactivated to prevent new transactions.

## Customer Contacts
- **Status:** shipped
- **Description:** Multiple named contacts (name, phone, email) can be attached to a customer record — handy for businesses that have a purchasing manager separate from the account owner.
- **Who it's for:** B2B merchants dealing with corporate clients.
- **Constraints / notes:** Contacts are children of the customer; deleting a customer cascades and removes all contacts.

## Customer Addresses
- **Status:** shipped
- **Description:** Multiple shipping/billing addresses stored per customer, enabling address selection at invoice time.
- **Who it's for:** Merchants with customers who have multiple delivery sites.
- **Constraints / notes:** Cascades on customer delete.

## Customer Image Upload
- **Status:** shipped
- **Description:** Merchants can upload a logo or photo for a customer (PNG/JPEG/WebP, max 2 MB). Magic-byte validation prevents spoofed uploads.
- **Who it's for:** Store owners who want visual recognition in customer lists.
- **Constraints / notes:** Stored in Supabase Storage. Content-type spoofing is blocked server-side.

## Customer Import (via Onboarding Import Hub)
- **Status:** shipped
- **Description:** Bulk import customers from CSV/Excel via the AI-assisted onboarding import pipeline. The importer applies AI party-matching and fuzzy name deduplication before writing records.
- **Who it's for:** Merchants migrating from another system with an existing customer list.
- **Constraints / notes:** Import is triggered through the onboarding wizard (Step 7 intent flags); not a standalone one-click upload on the customers page. Duplicate detection is AI-assisted, not a hard block.

## Customer AR Ledger View
- **Status:** shipped
- **Description:** The customer detail screen shows all open invoices, payment history, and outstanding balance in a tabbed AR ledger — giving a full credit picture for a single customer.
- **Who it's for:** Credit managers, store owners chasing payments.
- **Constraints / notes:** Read-only aggregate from `sales_invoices` and `receipt_voucher_allocations` tables; no manual ledger adjustment from this view.

## Sales Order — Draft Creation
- **Status:** shipped
- **Description:** Create a pre-fiscal sales order (draft) with optional customer, branch, warehouse, order channel (online / phone / walk-in), and line items. Tax is computed live using the same engine as invoices so totals match before commitment.
- **Who it's for:** Sales reps and store staff capturing customer intent before fulfilment is confirmed.
- **Constraints / notes:** Orders are purely informational — they do not touch stock or post any journal entries. No discount fields on order lines (invoices carry discounts).

## Sales Order — Line Management
- **Status:** shipped
- **Description:** Add, edit, and remove order lines individually. Each line carries item, quantity, unit price, and tax group; totals are recomputed on every change.
- **Who it's for:** Sales reps adjusting an order before confirmation.
- **Constraints / notes:** Line changes are only permitted while the order is in draft status.

## Sales Order — Confirm
- **Status:** shipped
- **Description:** Confirming an order locks it from further edits and stamps confirmed-by/confirmed-at metadata. Tax totals are finalised at this point.
- **Who it's for:** Sales supervisors or any staff with order-confirm permission.
- **Constraints / notes:** Confirmation does not move stock — stock is only committed when the resulting invoice is confirmed.

## Sales Order — Convert to Invoice
- **Status:** shipped
- **Description:** One-click conversion creates a DRAFT sales invoice pre-populated with all order lines, links back to the source order ID, and immediately marks the order as fulfilled.
- **Who it's for:** Any staff member ready to bill a confirmed order.
- **Constraints / notes:** The invoice lifecycle (confirm → stock deduction + journal entry) is authoritative from this point; the order is read-only after conversion.

## Sales Order — Cancel
- **Status:** shipped
- **Description:** Cancels a confirmed order that has not yet been converted to an invoice, releasing it from the fulfilled pipeline.
- **Who it's for:** Store managers handling customer cancellations.
- **Constraints / notes:** Cannot cancel an order that has already been converted to an invoice.

## Sales Order — Delete (Draft)
- **Status:** shipped
- **Description:** Permanently deletes a draft order and all its lines.
- **Who it's for:** Staff cleaning up erroneous or abandoned drafts.
- **Constraints / notes:** Only available while the order is in draft status.

## Sales Order — Multi-Channel Tracking
- **Status:** shipped
- **Description:** Each order is tagged with the channel it came through — online, phone, or walk-in — surfaced as a badge in the order list for operational visibility.
- **Who it's for:** Merchants running omnichannel retail who need to track order sources.
- **Constraints / notes:** Channel is informational only; no routing or workflow differences per channel in the current build.

## Sales Invoice — Draft Creation
- **Status:** shipped
- **Description:** Create a sales invoice in draft, either manually or from a converted sales order. Supports customer, branch, due date, currency (ISO 4217), and multi-line items with per-line tax groups and promotions applied automatically.
- **Who it's for:** Billing staff, cashiers, store managers.
- **Constraints / notes:** Currency decimal precision is enforced per-currency (KWD/BHD/OMR = 3dp, AED/SAR/INR = 2dp, etc.).

## Sales Invoice — Line Management
- **Status:** shipped
- **Description:** Add, update, and remove invoice lines; totals (subtotal, tax, discount, grand total) recompute on every change. Promotions are resolved live against active promotion rules.
- **Who it's for:** Billing staff adjusting invoices before posting.
- **Constraints / notes:** Line editing is only allowed in draft status.

## Sales Invoice — Confirm (Post)
- **Status:** shipped
- **Description:** Confirming an invoice deducts stock (COGS), claims any serial-number allocations, emits `sales.invoice.confirmed` which triggers the accounting listener to post AR debit, revenue credit, and COGS journal entries atomically.
- **Who it's for:** Accountants and store managers finalising a sale.
- **Constraints / notes:** Requires an open fiscal period. Serial-tracked items must have valid serials allocated before confirm. Confirmation is irreversible (no un-post in current build).

## Sales Invoice — Display Status Derivation
- **Status:** shipped
- **Description:** Invoice status is shown as draft / confirmed / paid / overdue based on balance and due date — marketers can show "smart status" without querying accounting tables.
- **Who it's for:** All users looking at invoice lists or customer AR tabs.
- **Constraints / notes:** Derived in-memory at read time from stored columns; no separate status field for overdue.

## Sales Invoice — Promotions Integration
- **Status:** shipped
- **Description:** When building invoice lines, active promotions are fetched and resolved per-line, automatically applying eligible discounts before the invoice is saved.
- **Who it's for:** Merchants running time-limited or volume-based promotions.
- **Constraints / notes:** Promotions are resolved at draft time — changes to promotions after invoicing do not retroactively affect posted invoices.

## Sales Invoice — Serial Number Tracking
- **Status:** shipped
- **Description:** For serial-tracked inventory items, invoice confirmation claims specific serial numbers as sold, maintaining a full chain of custody per unit.
- **Who it's for:** Electronics, jewellery, and high-value goods merchants.
- **Constraints / notes:** Serials must be pre-allocated before confirm; mismatched serials roll back the entire confirmation.

## Sales Invoice — Printable Tax Document
- **Status:** shipped
- **Description:** A printable A4 tax invoice layout is available from the invoice detail screen, rendering bilingual (AR/EN) document with line items, tax breakdown, and merchant header.
- **Who it's for:** Merchants in VAT-registered markets (GCC) who must issue a tax-compliant paper/PDF invoice to customers.
- **Constraints / notes:** Frontend-rendered (React); print stylesheet scoped to avoid style bleed. ZATCA Phase 2 QR/XML e-invoicing is planned, not yet shipped.

## Credit Note — Draft Creation
- **Status:** shipped
- **Description:** Issue a credit note against a posted (confirmed) sales invoice to record a full or partial return. Lines are validated against the original invoice lines and quantities.
- **Who it's for:** Accounts receivable staff and store managers handling customer returns.
- **Constraints / notes:** A credit note must reference a confirmed invoice; quantities cannot exceed what was originally invoiced.

## Credit Note — Confirm
- **Status:** shipped
- **Description:** Confirming a credit note reverses the relevant portion of the original sale: returns serial numbers to stock, restores inventory quantities, and emits `sales.creditNote.confirmed` to post the AR credit and revenue reversal journal entries.
- **Who it's for:** Accountants finalising a return.
- **Constraints / notes:** Serial number returns are validated — only serials that appear in the original invoice can be returned. The entire confirm is atomic; a serial mismatch rolls back everything.

## Receipt Voucher — Customer Payment Creation
- **Status:** shipped
- **Description:** Record a customer payment (cash, bank transfer, or other method) against one or more open invoices with per-invoice allocation amounts.
- **Who it's for:** Cashiers and AR clerks recording payments received.
- **Constraints / notes:** A single receipt can partially pay multiple invoices. The receipt references a customer and branch for GL routing.

## Receipt Voucher — Post
- **Status:** shipped
- **Description:** Posting a receipt voucher finalises the payment: reduces the AR balance on each allocated invoice (updating `balance` and `paidAmount`), and emits `sales.receipt.posted` to post the bank/cash debit and AR credit journal entries.
- **Who it's for:** Accountants and senior cashiers who close the payment cycle.
- **Constraints / notes:** Realised FX gain/loss is handled in the accounting listener when the receipt currency differs from the invoice currency (though MVP is single functional-currency; FX lines are code-present but dormant).

## AR Overview Dashboard
- **Status:** shipped
- **Description:** A summary dashboard showing total outstanding receivables, overdue amount and count, and an AR aging breakdown (current / 1–30 / 31–60 / 61+ days overdue) across all confirmed invoices for the tenant.
- **Who it's for:** Business owners, finance managers tracking cash collection health.
- **Constraints / notes:** Configurable time window (`days` param). Currency-aware; uses the tenant's functional currency.

## Event-Driven Accounting Integration
- **Status:** shipped
- **Description:** Three sales events (`sales.invoice.confirmed`, `sales.creditNote.confirmed`, `sales.receipt.posted`) fire into the NestJS EventEmitter bus. The accounting listener builds balanced double-entry journal entries (AR, revenue, COGS, bank) and writes them to the outbox — keeping sales and accounting loosely coupled with at-least-once delivery via a DLQ fallback.
- **Who it's for:** Internal architecture — no direct user surface, but ensures every sale is accurately reflected in the general ledger without manual bookkeeping.
- **Constraints / notes:** Events use an outbox pattern with a dead-letter queue. The listener is async so posting failures do not block the confirm response. A zero-value invoice produces no JE.

## ZATCA Phase 2 QR / XML E-Invoicing
- **Status:** planned
- **Description:** Cryptographically-signed XML invoices (UBL 2.1, XAdES-B-B) with QR codes and PIH chaining, submitted to the ZATCA Fatoora platform for compliance in Saudi Arabia. Phase 1 (simplified) and Phase 2 (standard, B2B) are both specced.
- **Who it's for:** KSA merchants above the Wave 24 threshold (SAR 375k annual revenue) mandated under Saudi e-invoicing law.
- **Constraints / notes:** Requires secp256k1 key pair, ZATCA sandbox/production credentials, and a Java-based SDK oracle for signature generation. Deep research complete; implementation not started.

## Quotation / Formal Quote Lifecycle
- **Status:** planned
- **Description:** A dedicated quotation document type (separate from sales orders) with expiry date, version history, and accept/reject workflow — allowing merchants to send formal price quotes before committing to an order.
- **Who it's for:** B2B merchants in trade and wholesale who negotiate prices before sale.
- **Constraints / notes:** Specced in `agent-os/product/sales/02-quotation-lifecycle.md`; no backend or frontend code exists yet. Current sales orders serve as lightweight informal quotes.
