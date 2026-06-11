<!-- Feature catalog partition | Module: pos | Generated: 2026-06-11 | Source: as-built audit -->
# POS (Point of Sale) — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

---

## Register Management
- **Status:** shipped
- **Description:** Shop owners configure one or more named POS terminals (registers), each with its own printer config, receipt template preset, and calibration values. CRUD operations are available; each register tracks its system-printer type, connection method, and cash-drawer setting.
- **Who it's for:** Shop owner / IT setup.
- **Constraints / notes:** Per-register printer calibration (dotsWidth, leftOffset, formLength) is stored and used by the print agent. Multiple registers per location are supported.

---

## Register Session (Shift Open / Close)
- **Status:** shipped
- **Description:** Cashiers open a named shift against a register with a declared opening float; the system locks the register to that cashier for the session. On close, the cashier declares a closing count and the system reconciles expected vs. actual cash.
- **Who it's for:** Cashier (daily operation), shop owner (audit).
- **Constraints / notes:** Only one open shift per cashier-register pair. Shift close fires an accounting event that journals the cash settlement automatically.

---

## Cash-In / Cash-Out (Float Movements)
- **Status:** shipped
- **Description:** Cashiers can record pay-in (e.g., adding float top-up) and pay-out (e.g., petty cash) movements during an open shift. Each movement is logged against the shift for Z-report reconciliation.
- **Who it's for:** Cashier, shop owner.
- **Constraints / notes:** Movements are listed per shift; affects expected-cash calculation on shift close.

---

## Sale Transaction Lifecycle
- **Status:** shipped
- **Description:** Full line-item sale creation: add items by barcode or search, set quantities, apply line discounts, pay, and complete. Supports hold (park) and recall for serving multiple customers simultaneously.
- **Who it's for:** Cashier.
- **Constraints / notes:** Transaction flows through statuses: `draft → held → paying → completed | voided`. Serial-tracked items require a serial number captured at sale. Inventory is deducted on completion. Tax is calculated per line using the item's tax group.

---

## Line Price Override
- **Status:** shipped
- **Description:** A cashier (or manager) can override the unit price on a transaction line to a custom value, bypassing the catalog price. The override is flagged on the line for audit purposes.
- **Who it's for:** Cashier / manager (with appropriate permissions).
- **Constraints / notes:** Separate endpoint (`PATCH :id/lines/:lineId/price`). Requires `priceOverride: true` flag and a `unitPrice` value. Audit trail records who changed the price.

---

## Line-Level Discount
- **Status:** shipped
- **Description:** Cashiers can apply a fixed-amount discount to any transaction line. The discount is deducted before tax calculation and persisted on the line record.
- **Who it's for:** Cashier / manager.
- **Constraints / notes:** Only fixed-amount (`discountAmount`) is wired in the current API and totals engine. Percentage-discount and "last-one-wins" stacking rules are specced but the coupon/percent-type code path is not yet built (see planned items below).

---

## Order-Level Discount
- **Status:** planned
- **Description:** Apply a single percentage or fixed-amount discount across the entire order subtotal; the discount is distributed proportionally across lines for correct accounting.
- **Who it's for:** Cashier / manager.
- **Constraints / notes:** Specced in `pos/04-discounts-promotions.md`. No service code or DTO fields exist yet.

---

## Coupon Codes
- **Status:** planned
- **Description:** Code-activated discounts (percent or amount, order or line scope) with validity windows, usage limits, per-customer caps, and minimum order amounts.
- **Who it's for:** Shop owner (creates coupons), cashier (applies code at checkout).
- **Constraints / notes:** Specced including offline validation against cached coupon data and server re-validation on sync. No implementation exists yet.

---

## Manager Approval for High Discounts
- **Status:** planned
- **Description:** Discounts above configured thresholds (e.g., >15% line discount) require a manager PIN before they can be applied.
- **Who it's for:** Shop owner (sets thresholds), manager (approves), cashier (triggers flow).
- **Constraints / notes:** Specced in `pos/04`. Not yet implemented in code.

---

## Payment Methods (Tender Types)
- **Status:** shipped
- **Description:** Shop owners configure the payment methods available at each register (cash, card, bank transfer, store credit, etc.). Cashiers select one or more tender types when paying a transaction, supporting split payments.
- **Who it's for:** Shop owner (configures), cashier (uses).
- **Constraints / notes:** Tender types are returned as part of the offline catalog snapshot so they are available without connectivity. Split payment across multiple tender types is supported.

---

## Returns
- **Status:** shipped
- **Description:** Cashiers can create a return against a completed transaction, selecting which lines and quantities to return. Inventory is restocked and accounting entries are reversed on return completion.
- **Who it's for:** Cashier, shop owner.
- **Constraints / notes:** Returns are linked to the original transaction. Partial returns (subset of lines or quantities) are supported.

---

## Exchanges
- **Status:** planned
- **Description:** Process a same-transaction return + re-sale so the customer swaps one item for another in a single flow.
- **Who it's for:** Cashier.
- **Constraints / notes:** Specced in `pos/05-returns-exchanges.md`. No exchange-specific code path found; current return endpoint does not produce a linked new transaction.

---

## Void Transaction
- **Status:** shipped
- **Description:** A cashier can void (cancel) a completed transaction before end-of-day. Inventory deduction is reversed and accounting entries are unwound.
- **Who it's for:** Cashier / manager.
- **Constraints / notes:** Void endpoint is `POST :id/void`. Voided status is permanent; the transaction is retained for audit.

---

## Offline Mode (Offline-First Engine)
- **Status:** shipped
- **Description:** The POS can operate without an internet connection. A full item catalog snapshot is pre-downloaded to the device; sales, shift opens, and shift closes recorded offline are queued and synced to the server when connectivity resumes.
- **Who it's for:** Cashier in locations with unreliable connectivity.
- **Constraints / notes:** Catalog sync uses keyset pagination with delta refresh (`updatedSince`) to keep the local snapshot current. Offline transactions are flagged `isOffline = true`. Any totals discrepancy detected during sync is flagged as `totalsMismatch` for owner review.

---

## Offline-Sync Ingest
- **Status:** shipped
- **Description:** Idempotent server-side endpoints replay queued offline shifts and transactions. Duplicate replays return the existing record rather than creating a duplicate, protecting against network retries.
- **Who it's for:** System (automatic background sync).
- **Constraints / notes:** Three sync endpoints: `POST /sync/shifts/open`, `POST /sync/transactions`, `POST /sync/shifts/close`. Idempotency is enforced; audit log suppresses no-op replays.

---

## Item Catalog Sync
- **Status:** shipped
- **Description:** Registers download a paginated snapshot of all active items, barcodes, categories, tax groups, and tender types. Delta sync fetches only records changed since the last sync, keeping bandwidth low.
- **Who it's for:** Cashier's device (automatic).
- **Constraints / notes:** Inactive items are included in delta pages so the device can learn about deactivations. Reference data (categories, tax groups) is returned on every delta page to avoid missing changes on multi-page fetches.

---

## Receipt Model
- **Status:** shipped
- **Description:** Every completed transaction generates a structured receipt record containing store info, cashier name, line items with taxes, payment breakdown, and a unique receipt number. The receipt is retrievable via API and used for both printing and digital delivery.
- **Who it's for:** Cashier (print), customer (digital).
- **Constraints / notes:** Bilingual fields (Arabic + English) are populated from item name alternatives. Receipt tokens are minted atomically with transaction completion.

---

## Z-Report / Shift Close Summary
- **Status:** shipped
- **Description:** On shift close the system computes a full Z-report: sales by tender type, total cash expected, cash declared by cashier, over/short variance, returns, voids, and cash movements. The report is available on-screen and can be printed.
- **Who it's for:** Cashier (end of shift), shop owner (daily reconciliation).
- **Constraints / notes:** Shift close event fires an accounting journal entry for the cash settlement. The Z-report is also available for a closed shift via `GET /shifts/:id` (detail response includes all aggregates).

---

## Receipt Templates (Classic / Compact / Bilingual)
- **Status:** shipped
- **Description:** Three built-in receipt layout presets: Classic (full detail), Compact (condensed single-line items), and Bilingual (English + Arabic side by side). The preset is configured per register and can be overridden per transaction.
- **Who it's for:** Shop owner (configures), cashier (uses).
- **Constraints / notes:** Bilingual preset uses static AR translations for labels; item name Arabic alternatives come from inventory data. Preset is stored in `pos_registers.printerConfig`.

---

## Gift Receipt
- **Status:** shipped
- **Description:** Prints a receipt variant where all prices are replaced with `***` and the payment section is omitted, suitable for gift purchases. The barcode is retained so returns can still be processed against the original transaction.
- **Who it's for:** Cashier (on customer request).
- **Constraints / notes:** Specced and described as built in `pos/10-printing-receipts.md`. Rendered by the print layer; no separate API endpoint — triggered as a print job type.

---

## Duplicate / Reprint Receipt
- **Status:** shipped
- **Description:** Cashiers can reprint any completed transaction's receipt. The reprint is stamped with a `REPRINT / نسخة مكررة` header and timestamp, and a `reprintCount` counter is incremented for audit.
- **Who it's for:** Cashier, customer.
- **Constraints / notes:** API endpoint: `POST :id/receipt/reprint`. Reprint count is persisted on the transaction record.

---

## Barcode Label Printing
- **Status:** shipped
- **Description:** Print barcode labels for items directly from the POS (or inventory module) to a connected thermal or dot-matrix printer via the print agent.
- **Who it's for:** Shop owner, stock staff.
- **Constraints / notes:** Label job type is dispatched through the same print agent WebSocket. Label format (size, barcode symbology) is not yet documented as configurable in the frontend UI.

---

## Print Agent (LAN/USB Printer Bridge)
- **Status:** shipped
- **Description:** A lightweight native desktop binary runs on the same machine as the POS browser. It bridges the browser's network sandbox to raw TCP (ESC/POS) printers on the LAN or connected via USB/OS queue. Discovered automatically via LAN scan and OS print queue enumeration.
- **Who it's for:** Any shop using hardware receipt printers.
- **Constraints / notes:** Binds only to `127.0.0.1` (no LAN exposure). Scans RFC1918 /24 subnets only (SSRF guard). Fallback chain if agent is unreachable: `agent → window.print() → digital-only`; a print failure never blocks a transaction. Packaged as signed native binaries for macOS, Windows, and Linux with an OS service installer.

---

## Printer Discovery & Setup Wizard
- **Status:** shipped
- **Description:** A guided setup wizard (under 2 minutes) detects available printers, prints a calibration test pattern, and saves calibration values and the receipt template preset to the register. Supports both network (LAN TCP) and system (OS queue) printers.
- **Who it's for:** Shop owner / IT setup.
- **Constraints / notes:** Calibration values: `dotsWidth`, `leftOffset`, `formLength`. Dot-matrix graphics mode (ESC * 24-pin raster) enables correct Arabic rendering on dot-matrix printers.

---

## Digital Receipt with QR Code
- **Status:** shipped
- **Description:** Every completed transaction receives a UUID receipt token. A QR code encoding `https://app.zerupt.com/r/{token}` is printed in the receipt footer. The customer can scan it to view a web receipt — no app or account required.
- **Who it's for:** Customer (self-service receipt retrieval), shop owner (paperless option).
- **Constraints / notes:** Public receipt page has no auth shell, no internal IDs, and a 20 req/min rate limit. Uniform 404 for missing/expired tokens (no info leakage). For offline sales, the QR code only appears on post-sync reprint because the token cannot be minted until the transaction reaches the server. WhatsApp delivery is deferred (not built).

---

## Accounts Receivable (Charge-to-Customer / Credit Sale)
- **Status:** shipped
- **Description:** A POS transaction can be settled on credit against a customer's AR account instead of (or in addition to) immediate payment. The outstanding balance appears in the Accounts Receivable aging report.
- **Who it's for:** Shop owner (for trusted/account customers), cashier.
- **Constraints / notes:** Implemented in `pos-credit-ar.ts`. Requires a customer to be linked to the transaction. Settlement against the AR balance is handled in the Accounting module.
