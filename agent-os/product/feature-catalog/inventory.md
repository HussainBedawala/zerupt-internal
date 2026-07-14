<!-- Feature catalog partition | Module: inventory | Generated: 2026-06-11 | Source: as-built audit -->
# Inventory — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

---

## Item Model — Flat + Matrix Items

- **Status:** shipped (flat items; matrix/variant items)
- **Description:** Every sellable product is either a flat item, or a matrix parent with generated variants — both stored as rows in `items`. A matrix parent defines up to 3 attribute axes (bilingual name/nameAlt, ordered bilingual values), and the system auto-generates one `MatrixVariant` row per combination with SKU `{parent}-{VAL1}-{VAL2}`, capped at 250 variants per parent (DB `combo_key` uniqueness is the backstop). Parents are non-stockable, non-sellable, and cannot carry barcodes (DB-trigger enforced) — they exist only as templates. `type`/`parentItemId` are immutable once set. Variants inherit from the parent at generation time only (no live cascade on later parent edits); "generate missing" for a new axis value is idempotent. Variants are deactivated, never deleted, to preserve history. Axes cannot be added or removed after the parent is created; value **rename** is supported and recomputes the variant name (not the SKU).
- **Who it's for:** Apparel/footwear size-color grids and any retailer needing size/color/material variant grids; flat items remain the default for everyone else.
- **Constraints / notes:** Tracking type (serial/batch/none) and valuation method are set once at item creation and are immutable once any movement exists. Deliberately not built in this ship: adding/deleting an axis after parent creation, converting a flat item to/from matrix, and a tenant-wide shared attribute library (axes are defined per-parent). Which merchants see the matrix-item UI at all is gated by the Industry Capability Profile (`apparel_fashion`; see `modules/inventory/01-item-model.md`), with "show more fields" fallback if data already exists.

---

## Item Images & Media

- **Status:** shipped
- **Description:** Each item (or matrix variant) can have multiple image URLs uploaded via the API; the first image is the primary display image. Matrix variants inherit the parent's images unless overridden.
- **Who it's for:** All merchants; especially useful for POS and product browsing.
- **Constraints / notes:** Images stored via Supabase Storage; URLs are returned in item responses. No video support.

---

## Item Categories (Hierarchical)

- **Status:** shipped
- **Description:** Categories form a tree up to four levels deep (e.g., Electronics > Mobile > Accessories > Cases). Each category can set a default tax group and accounting account overrides that all child items inherit.
- **Who it's for:** Store owners and accountants organising large catalogues.
- **Constraints / notes:** Categories cannot be deleted if items reference them; only deactivated.

---

## Barcode Registry

- **Status:** shipped
- **Description:** Every item can carry multiple barcodes (EAN-13, UPC-A, Code 128, custom), each with a bilingual "barcode name" (`label`) so a user can tell multiple barcodes apart (e.g., "Case barcode" vs "Store barcode"). Any scanned barcode resolves to exactly one item within the tenant, with fallback through a normalized-SKU rung and an alternate-codes rung (see below). For matrix items, the barcode resolves to the specific variant; parents 400 on direct lookup since they carry no barcode.
- **Who it's for:** Retailers using barcode scanners at POS, goods receiving, and stock counts.
- **Constraints / notes:** Barcodes must be globally unique per tenant. Items without a supplier barcode can have one auto-generated (see Internal Barcode Generation below).

---

## Alternate Codes

- **Status:** shipped
- **Description:** A separate registry (`item_alternate_codes`) for non-barcode identifiers a retailer needs to look items up by — OEM part numbers, aftermarket equivalents, superseded codes, or other free-form references, each with a note field. Unlike barcodes, alternate codes are unique per item rather than globally unique across the tenant. Wired into the POS/scanner lookup ladder between the normalized-SKU rung and the end of the chain.
- **Who it's for:** Auto parts, electronics, and hardware retailers where the same physical item is commonly referenced by multiple manufacturer or supersession codes.
- **Constraints / notes:** Column visibility in the bulk-import template and item form is gated by the Industry Capability Profile (part-number industries).

---

## Scale Barcodes

- **Status:** shipped
- **Description:** Weighed-goods barcodes printed by store scales (produce, deli, bakery) encode a PLU/item reference plus a weight or price segment in the GS1 "2x" format. The server parses this format with parity to physical scale hardware. Per-tenant settings (`scaleBarcodeEnabled`, `scaleBarcodePluSource`) turn the parsing on and choose whether the PLU segment maps to SKU or barcode. Scale-barcode resolution is the first rung of the POS lookup ladder.
- **Who it's for:** Grocery retailers weighing loose goods at the register.
- **Constraints / notes:** Gated by the Industry Capability Profile (`grocery`); off by default for tenants that don't need it.

---

## Internal EAN-13 Barcode Generation

- **Status:** shipped
- **Description:** Zerupt auto-generates EAN-13 barcodes for items that arrive without a supplier barcode, using the GS1 internal-use prefix range (200–299) so they never collide with supplier codes. A batch endpoint generates barcodes for all untagged items at once.
- **Who it's for:** Retailers selling unlabelled goods, house-brand items, or loose produce.
- **Constraints / notes:** Batch generation is throttled at 3 requests/min. Atomic sequence reservation prevents duplicates under concurrent load.

---

## Location Hierarchy (Branch → Warehouse → Zone → Bin)

- **Status:** shipped
- **Description:** Stock is tracked through a four-level hierarchy: Branch (physical store), Warehouse (storage area), Zone (logical section), and Bin (exact shelf position). Small retailers can stop at the Warehouse level; zones and bins are optional.
- **Who it's for:** Single-outlet retailers (warehouse only) up to multi-branch chains with dedicated warehouse staff.
- **Constraints / notes:** POS always transacts against a branch's default warehouse. Branches and warehouses can only be deactivated (not deleted) once stock has been recorded.

---

## Stock Ledger (Immutable Event Log)

- **Status:** shipped
- **Description:** Every stock change — sale, receipt, adjustment, transfer, return — writes an immutable ledger entry with quantity, unit cost, source document reference, and timestamp. Current stock is always derived from the cumulative sum of these entries; entries are never edited or deleted.
- **Who it's for:** Owners and accountants who need a full, tamper-proof audit trail of every inventory movement.
- **Constraints / notes:** Corrections are made via counter-entries, never by modifying history. The ledger total must always reconcile with the Inventory GL account (account 1141).

---

## Materialised Stock Level Snapshots

- **Status:** shipped
- **Description:** For query performance, the system maintains a live snapshot per item per warehouse showing on-hand, committed (reserved), in-transit, on-order, and available quantities, plus current WAC and last cost. Updated transactionally with every ledger entry.
- **Who it's for:** All users — the POS, purchase team, and inventory dashboard all read from this snapshot.
- **Constraints / notes:** Available = On Hand − Committed. Projected view (adds On Order + In Transit inbound) is also computable.

---

## WAC Cost Engine (Weighted Average Cost)

- **Status:** shipped
- **Description:** The default costing method. Every inbound movement (goods receipt, landed cost, purchase return, adjustment increase) triggers a WAC recalculation: new cost = (existing qty × existing WAC + incoming qty × incoming unit cost) ÷ total qty. Sales exit at the current WAC without changing it.
- **Who it's for:** Most MENA retailers; the standard costing method for non-serial, non-batch items.
- **Constraints / notes:** WAC is per item per warehouse. Edge case: if on-hand is zero when new stock arrives, WAC resets to the incoming unit cost. Negative-stock + new receipt can produce unexpected WAC values and is flagged for review.

---

## FIFO Cost Engine

- **Status:** shipped
- **Description:** Batch-tracked items always use FIFO costing. Each inbound movement creates a cost layer; outbound movements consume from the oldest layer first (or FEFO — earliest expiry first — when expiry dates are set). COGS is the weighted sum across layers consumed.
- **Who it's for:** Pharmacies, food retailers, and any business tracking expiry dates or needing strict first-in-first-out accounting.
- **Constraints / notes:** Landed costs allocated retroactively update the original cost layer. Once items from a layer are sold, retroactive COGS adjustment entries are generated.

---

## Specific-Identification Costing (Serial Items)

- **Status:** shipped
- **Description:** Serial-tracked items carry an individual acquisition cost per physical unit. When a serial unit is sold, the exact cost of that specific unit — not the pool average — becomes the COGS entry. Reporting and the general ledger tie out by construction because the same cost is written to both.
- **Who it's for:** Electronics retailers (IMEI-tracked phones, laptops), jewellers, and anyone selling high-value individually-tracked goods.
- **Constraints / notes:** The WAC pool is unaffected by a serial sale. Claim-at-confirm atomicity means two concurrent sales of the same serial result in exactly one commit and one rollback — no double-sell possible.

---

## Landed Cost Revaluation

- **Status:** shipped
- **Description:** When freight, customs, or other landed costs are confirmed on a purchase, the system reallocates that additional cost to the received items and recalculates WAC (or updates the FIFO cost layer). If affected items were already sold, a COGS adjustment journal entry is generated automatically.
- **Who it's for:** Importers and wholesalers where landed costs materially affect product margin.
- **Constraints / notes:** Allocation methods (by value, by weight, by quantity) are handled in the purchase module; the inventory side receives the per-unit addition via the `landed-cost.listener`.

---

## Serial Number Tracking

- **Status:** shipped
- **Description:** Items configured for serial tracking require a serial number to be scanned or entered at every inbound (GRN) and outbound (sale/POS) movement. Each serial carries its own status (Available, Reserved, Sold, Returned, Defective, InTransit) and acquisition cost. The claim lifecycle is atomic inside the document's confirm transaction.
- **Who it's for:** Electronics, appliances, luxury goods, and any retailer needing unit-level traceability.
- **Constraints / notes:** Serial number must be unique within the tenant. Tracking type is set once and cannot be changed once movements exist. Negative stock is always blocked for serial items.

---

## Batch / Lot Tracking

- **Status:** shipped
- **Description:** Items configured for batch tracking group stock by lot/batch number, each with optional expiry and manufacturing dates. Stock is consumed FEFO (earliest expiry first). A daily job flags batches nearing expiry and blocks expired batches from being sold.
- **Who it's for:** Pharmacies, food retailers, cosmetics, and any business subject to expiry or recall requirements.
- **Constraints / notes:** Batch items automatically use FIFO/FEFO costing. Expired batches require a write-off adjustment to remove from sellable stock. Batch tracking type cannot be changed after transactions exist.

---

## Stock Adjustments

- **Status:** shipped
- **Description:** Managers can post positive (found/surplus) or negative (damaged/lost/write-off) adjustments to correct physical discrepancies. Adjustments above a configurable value threshold require manager approval before posting. Each adjustment generates an accounting journal entry automatically.
- **Who it's for:** Store managers and inventory controllers handling shrinkage, damage, or data-entry corrections.
- **Constraints / notes:** Approval thresholds are configurable per tenant. A reason is always required.

---

## Stock Transfers (Inter-Location)

- **Status:** shipped
- **Description:** Stock can be moved between warehouses within the same branch (instant, single step) or between branches (two-step: send → receive in transit). The sending WAC cost is carried unchanged to the destination — a transfer is a location change, not a value event. A PDF delivery note is generated at the send step.
- **Who it's for:** Multi-outlet retailers and businesses with separate backroom/floor stock or off-site storage.
- **Constraints / notes:** Partial receipt is supported; shortfalls create an automatic write-down adjustment. WAC/FIFO layer costs are preserved exactly on transit. Inter-branch transfers use a dedicated Transit warehouse type and generate DR/CR Inventory-in-Transit journal entries.

---

## Delivery Notes (Transfer Documents)

- **Status:** shipped
- **Description:** Every stock transfer generates a PDF delivery note showing transfer number, date, source and destination, line items with quantities, and a prepared-by field. The receiver signs off at the Received step; the document is available for print or agent delivery.
- **Who it's for:** Warehouse staff and branch managers documenting inter-location stock movements.
- **Constraints / notes:** Electronic signature is not enforced in v1 (paper sign-off). Document prefix is `TRF-` with sequential numbering.

---

## Stock Counting

- **Status:** shipped
- **Description:** Supports full warehouse counts, cycle counts (ABC-classified), and spot checks. Count sessions run in blind mode (system quantities hidden from counters) to avoid bias. After counting, variances are reviewed by a manager, approved, and posted as COUNT_ADJUSTMENT ledger entries. Movements occurring during an active count are reconciled at posting time so live trading doesn't create false variances.
- **Who it's for:** Store managers and warehouse supervisors performing periodic or year-end stock takes.
- **Constraints / notes:** Multi-counter mode (independent counts for reconciliation) and offline mobile counting are specced but their implementation depth should be verified before quoting. Auto-approval thresholds and investigation thresholds are configurable.

---

## ABC Classification (Cycle Counts)

- **Status:** shipped
- **Description:** Items are automatically classified A/B/C by inventory value (on-hand × average cost). Class A (top 20% by value) is counted monthly; B quarterly; C annually. The system generates count schedules accordingly.
- **Who it's for:** Larger retailers who cannot shut down for a full count and need to distribute counting effort intelligently.
- **Constraints / notes:** Reclassification frequency is configurable. Classification runs on current value snapshot.

---

## Pricing Engine (Price Lists)

- **Status:** shipped
- **Description:** A multi-level pricing hierarchy resolves the selling price for any item in any transaction: customer-specific price first, then the customer's assigned price list (with quantity break tiers), then a branch/location override, then the item's base price. First match wins.
- **Who it's for:** Retailers with wholesale, VIP, or staff pricing tiers; businesses with different prices at different store locations.
- **Constraints / notes:** Price lists support quantity breaks (e.g., 1–9 units at one price, 10+ at another). Prices can be stored in any currency. Tax-inclusive vs tax-exclusive display is handled per context (POS vs B2B invoice).

---

## Promotional Pricing

- **Status:** shipped
- **Description:** Time-bound promotions override the resolved price hierarchy with a percent-off, fixed price, or amount-off rule. Promotions can target specific items, entire categories, or the full catalogue. If multiple promotions apply, the best price for the customer wins.
- **Who it's for:** Retailers running seasonal sales, clearance events, or category-wide discounts.
- **Constraints / notes:** Promotions have a `validFrom`/`validTo` date-time range. `isActive` flag can pause a promotion without deleting it.

---

## Reorder Engine (Reorder Points & Low-Stock Alerts)

- **Status:** shipped
- **Description:** Each item per warehouse can have a reorder level, reorder quantity, safety stock, lead time, and preferred supplier configured. When available stock hits the reorder level, an in-app alert fires in real time (and optionally by email). The system groups reorder-triggered items by supplier and pre-builds a suggested purchase order for one-click conversion.
- **Who it's for:** Buyers and store owners who want to avoid stockouts without manual monitoring.
- **Constraints / notes:** Suggested PO requires user review and approval before becoming an actual PO. Fill-to-max mode (order up to maxLevel) is an alternative to fixed-quantity ordering.

---

## Negative Stock Handling

- **Status:** shipped
- **Description:** A company-level setting controls whether transactions that would cause negative on-hand are blocked (Strict mode) or warned and allowed (Flexible mode). Serial-tracked items always block negative stock regardless of the company setting. All enforcement is applied at the point of transaction confirmation — POS, sales invoice, adjustment, transfer, and assembly.
- **Who it's for:** All merchants; strict mode for businesses where overselling is never acceptable, flexible mode for businesses that occasionally receive stock after selling it.
- **Constraints / notes:** Negative stock events generate a Critical-priority alert. Negative stock combined with a new receipt can produce anomalous WAC values, which are flagged for review.

---

## Barcode & Label Printing

- **Status:** shipped
- **Description:** Labels can be printed on thermal printers (via the Zerupt print agent over TCP 9100, rendered as a raster bitmap) or on standard A4 sticker sheets via browser print. Three preset label sizes are available (small 38×25 mm, standard 50×30 mm, large 58×40 mm). Labels are bilingual: English name above, Arabic name below using the same RTL shaping pipeline as receipts.
- **Who it's for:** Retailers who need to label unlabelled goods or reprint damaged labels; bilingual labels serve MENA merchants.
- **Constraints / notes:** Thermal printing requires the print agent to be running; an explicit warning is shown if it is offline. A4 grid alignment depends on the sticker sheet matching the configured column/row count.

---

## Bulk Item Import (CSV/Excel)

- **Status:** shipped
- **Description:** Items can be imported in bulk via a CSV or Excel template. The system validates each row (required fields, unique SKU/barcode, valid category IDs, data types), presents a preview with per-row error highlighting, and imports only valid rows while producing a downloadable error report for the failures.
- **Who it's for:** New merchants migrating from another system or spreadsheets; large catalogues that cannot be entered one by one.
- **Constraints / notes:** Part of the broader import pipeline; error-row skipping (not blocking) is the default behaviour to maximise the usable import.

---

## Assembly & Disassembly

- **Status:** planned
- **Description:** A bill-of-materials workflow that consumes component items and produces finished goods (assembly), or breaks finished goods back into components (disassembly). The finished-goods cost is calculated as the sum of component costs.
- **Who it's for:** Retailers doing light manufacturing, kitting, or gift-set bundling.
- **Constraints / notes:** Movement types (`ASSEMBLY_IN`, `ASSEMBLY_OUT`, `DISASSEMBLY_IN`, `DISASSEMBLY_OUT`) are defined in the type system and the stock ledger model, but no dedicated controller or BOM data model exists in the current codebase.

---

## Internal Consumption

- **Status:** planned
- **Description:** Records items consumed internally by the business (e.g., office supplies, samples given to customers) with a corresponding expense journal entry.
- **Who it's for:** Businesses that use some of their own inventory internally and need to track the cost correctly.
- **Constraints / notes:** Movement type (`CONSUMPTION`) is defined in the type system; no dedicated endpoint exists yet.

---

## AI-Powered Reorder Suggestions

- **Status:** planned
- **Description:** The AI service will analyse sales velocity, seasonality, and supplier lead-time reliability to suggest adjusted reorder levels and quantities. Users can accept or override the AI suggestions.
- **Who it's for:** Buyers and store owners who want demand-driven, data-backed replenishment rather than static reorder points.
- **Constraints / notes:** Specced in the reorder engine for "Weeks 3-6 / AI enhancement." Infrastructure hooks are in place; the AI enhancement layer is not yet built.
