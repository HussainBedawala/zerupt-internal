<!-- Feature catalog partition | Module: accounting | Generated: 2026-06-11 | Source: as-built audit -->
# Accounting — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

---

## Chart of Accounts (COA)

- **Status:** shipped
- **Description:** A fully customizable, hierarchical chart of accounts that comes pre-seeded with a retail-optimized template (80+ accounts across Assets, Liabilities, Equity, Income, and Expense). Accounts can be added, deactivated, and renamed; accounts with posted transactions can only be deactivated, never deleted.
- **Who it's for:** Shop owners, accountants, and finance managers in any Zerupt-supported market. Country-specific tax accounts (VAT, GST, SST) are automatically seeded based on the business's registered country.
- **Constraints / notes:** Per-legal-entity scope — each entity in a multi-branch group gets its own COA. System accounts (used by the automation engine) cannot be deleted or have their type changed. COA supports bilingual names (Arabic + English).

---

## Country-Specific Tax Account Seeding

- **Status:** shipped
- **Description:** When a legal entity is created, the system automatically seeds the correct tax liability and receivable accounts for that entity's country — UAE/KSA/Bahrain/Oman/Qatar get VAT accounts, India gets dual GST (CGST/SGST/IGST) accounts, Singapore gets GST, and Malaysia gets SST. Kuwait (no VAT) gets a zero-rate default group.
- **Who it's for:** Retail businesses across GCC, India, and Southeast Asia. Eliminates manual setup of tax accounts at onboarding.
- **Constraints / notes:** Seeded at entity creation from `LegalEntity.countryCode`. Can be modified post-seeding. Country not supported above defaults to the general retail template without tax accounts.

---

## Tax Configuration (Tax Codes and Groups)

- **Status:** shipped
- **Description:** Lets you define any tax code (VAT, GST, SST, etc.) with its rate, calculation type (exclusive or inclusive), and category (standard, zero-rated, exempt, reverse charge, non-recoverable). Tax codes can be bundled into tax groups for compound taxes like India's GST (CGST + SGST applied together).
- **Who it's for:** Accountants and business owners in any tax-applicable market. Especially powerful for India (compound dual GST) and reverse-charge scenarios.
- **Constraints / notes:** Supports versioned rate history — when a government changes a tax rate, you enter a new effective date and the system uses the historically correct rate for each transaction. Tax codes link directly to output and input accounts in the COA.

---

## Tax Calculation Engine

- **Status:** shipped
- **Description:** Automatically calculates tax on every sales invoice, purchase invoice, and POS transaction — handling both exclusive (tax added on top) and inclusive (tax embedded in price) tax types, multi-component groups, and compound taxes. Applies item-level, customer-level, and category-level exemptions.
- **Who it's for:** All merchants in tax-applicable markets. Runs silently — users do not configure it per transaction.
- **Constraints / notes:** Exemption priority order: Item > Customer > Category > Default tax group. Zero-division and rounding handled internally.

---

## Double-Entry Journal Entries (Manual)

- **Status:** shipped
- **Description:** Allows accountants to create manual journal entries with full debit/credit lines, reference numbers, and notes. Entries go through a Draft → Posted workflow; only posted entries affect the ledger. Posted entries cannot be edited — corrections require creating a reversal entry.
- **Who it's for:** Accountants and finance managers who need to record adjustments, accruals, depreciation, and other non-automated entries.
- **Constraints / notes:** Entries must balance (total debits = total credits) before posting. Entry dates are validated against the fiscal period lock status.

---

## Auto-Generated Journal Entries (Event-Driven Engine)

- **Status:** shipped
- **Description:** Every business event — a confirmed sale, a goods receipt, a POS shift close, a stock adjustment, a cheque issuance — automatically generates a balanced, double-entry journal with no manual work required. The accounting engine resolves the correct entity, functional currency, and accounts for each event.
- **Who it's for:** All merchants. Ensures the books are always up to date without requiring accountants to manually record routine transactions.
- **Constraints / notes:** Auto-generated entries are posted immediately and are immutable — corrections must go through reversals. The engine is idempotent: re-processing the same event will not create duplicate entries. Events covered: sales invoices, credit notes, purchase GRNs, supplier payments, customer receipts, POS transactions, POS shift closes, stock adjustments, stock transfers, stock counts, cheque lifecycle, and assembly/production.

---

## Journal Entry Reversal

- **Status:** shipped
- **Description:** Any posted journal entry — whether auto-generated or manual — can be reversed by creating a paired entry with debits and credits swapped. Both the original and the reversing entry remain in the ledger, creating a permanent, auditable correction trail.
- **Who it's for:** Accountants correcting errors or recording period-end accruals that reverse in the next period.
- **Constraints / notes:** System links both entries via `reversalOfEntryId` / `reversedByEntryId`. Journals can never be deleted from the ledger.

---

## Account Mappings (Configurable Automation Rules)

- **Status:** shipped
- **Description:** A configuration layer that determines which accounts are debited and credited for each type of automated event. Tenants can override the system defaults at the tenant, warehouse, category, or item level — for example, routing revenue from a specific product category to a dedicated income account.
- **Who it's for:** Accountants in businesses with complex account structures or multiple revenue streams.
- **Constraints / notes:** Override hierarchy: Item > Category > Warehouse > Tenant default > System default. Control accounts (e.g., Trade Receivables) cannot be overridden. Account type validation enforced.

---

## General Ledger

- **Status:** shipped
- **Description:** A full transaction-level ledger showing every debit and credit posted to any account, with running balance, source document references, and date filtering. Supports drill-down from any account to its individual journal lines.
- **Who it's for:** Accountants and finance managers reviewing transaction history or investigating discrepancies.
- **Constraints / notes:** Scoped per legal entity. Frontend available at `/(app)/general-ledger`.

---

## Trial Balance

- **Status:** shipped
- **Description:** A period-end summary showing opening balance, total debits, total credits, and closing balance for every account — confirming that the ledger is balanced. Exportable for external audit or filing.
- **Who it's for:** Accountants and auditors performing month-end and year-end close procedures.
- **Constraints / notes:** Scoped per legal entity. Verified to balance (total debits = total credits) as part of the year-end pre-close checklist.

---

## Profit & Loss Statement

- **Status:** shipped
- **Description:** An automated income statement showing revenue, cost of goods sold, gross profit, operating expenses, and net profit for any selected fiscal period.
- **Who it's for:** Business owners and finance managers tracking financial performance.
- **Constraints / notes:** Derived from posted journal entries; reflects functional currency of the legal entity.

---

## Balance Sheet

- **Status:** shipped
- **Description:** A point-in-time statement of the business's assets, liabilities, and equity for any selected date.
- **Who it's for:** Business owners, accountants, and investors reviewing the financial position of the business.
- **Constraints / notes:** Scoped per legal entity. Consolidated multi-entity balance sheet is planned (Phase 6).

---

## Tax Summary Report

- **Status:** shipped
- **Description:** A period report summarizing all output tax collected on sales and input tax paid on purchases, broken down by tax code — ready to use as a working paper for filing a VAT or GST return.
- **Who it's for:** Accountants and business owners in tax-registered businesses (UAE, KSA, India, etc.).
- **Constraints / notes:** Grouped by tax code and period. Does not file directly with tax authorities (ZATCA e-invoicing integration is planned separately).

---

## Opening Balances

- **Status:** shipped
- **Description:** Allows migrating businesses to enter their account balances as of a cutoff date when they first go live on Zerupt. The system creates a single opening balance journal entry per entity, with any imbalance flagged immediately (indicates a migration error).
- **Who it's for:** Any business migrating from a previous accounting system or spreadsheets.
- **Constraints / notes:** Balancing entry goes to Opening Balance Equity (account 3900), which should net to zero after all balances are entered. Can also be imported via the bulk import pipeline.

---

## Fiscal Year and Period Management

- **Status:** shipped
- **Description:** Supports any fiscal year start month (not just January). Each year auto-generates 12 monthly periods. Periods can be set to Open, Soft-Locked (warning with override), or Hard-Locked (fully blocked) — preventing accidental backdated entries.
- **Who it's for:** Accountants and finance managers enforcing period discipline across all modules.
- **Constraints / notes:** Period locking is cross-module — POS, Sales, Purchase, Inventory, and Accounting all check period status before allowing any financial transaction. Fiscal settings are per legal entity.

---

## Period Close Management

- **Status:** shipped
- **Description:** A structured workflow for closing accounting periods, with a pre-close checklist (unposted drafts, unreconciled banks, pending stock counts, balanced trial balance) and a final hard-lock that prevents any further changes.
- **Who it's for:** Accountants and finance managers performing month-end close.
- **Constraints / notes:** The checklist is advisory — administrators can proceed with incomplete items, but all gaps are clearly flagged. Frontend available at `/(app)/close-management`.

---

## Year-End Close

- **Status:** shipped
- **Description:** Automates the year-end closing journal — zeroing all income and expense accounts and rolling net profit into Retained Earnings. Then hard-locks all 12 months and creates the next fiscal year's open periods.
- **Who it's for:** Accountants performing annual close.
- **Constraints / notes:** Pre-close checklist includes: all months soft-locked, banks reconciled, no draft entries, trial balance balanced. Closed years can be reopened by super-admin only (logged, auditable). Action creates a reversing entry of the closing journal.

---

## Multi-Currency Support

- **Status:** shipped
- **Description:** Enables transactions in any currency while maintaining books in the business's functional (reporting) currency. Every journal entry line stores both the original transaction currency amount and the functional currency equivalent.
- **Who it's for:** Businesses operating across currencies — GCC import/export merchants, businesses with foreign suppliers or customers, multi-country groups.
- **Constraints / notes:** Functional currency is set per legal entity at onboarding and locked after the first posted journal entry. Currency decimal precision is currency-aware (KWD/BHD/OMR = 3 decimals, USD/AED/SAR = 2, JPY = 0). Only currencies in the tenant's whitelist can be used.

---

## Exchange Rate Management

- **Status:** shipped
- **Description:** Lets you enter exchange rates manually or have them auto-fetched. Rates are stored with effective dates so historical transactions always use the rate that was active on the transaction date.
- **Who it's for:** Accountants in multi-currency businesses.
- **Constraints / notes:** Rates are tenant-wide and shared across all legal entities. If no rate exists for the exact date, the most recent prior rate is used. Frontend available at `/(app)/exchange-rates`.

---

## Realized FX Gain/Loss

- **Status:** shipped
- **Description:** When a foreign-currency invoice is settled at a different exchange rate than it was originally booked, the system automatically calculates and posts the realized foreign exchange gain or loss to the correct income/expense account.
- **Who it's for:** Businesses buying from or selling to foreign-currency counterparties (e.g., GCC importer paying USD suppliers).
- **Constraints / notes:** Calculated at payment posting time. Posted to accounts 4820 (Realized FX Gain) or 7210 (Realized FX Loss) in the COA.

---

## Unrealized FX Revaluation (Month-End)

- **Status:** shipped
- **Description:** At month-end, revalues all open foreign-currency balances (unpaid invoices, FC bank accounts) to the closing exchange rate and posts unrealized gain/loss entries. These entries automatically reverse on the first day of the next period.
- **Who it's for:** Accountants in multi-currency businesses following accrual accounting standards.
- **Constraints / notes:** Scoped per legal entity. Revaluation entries auto-reverse; only the closing-rate difference is carried. Frontend at `/(app)/exchange-rates` (revaluation section).

---

## COGS — Weighted Average Cost (WAC)

- **Status:** shipped
- **Description:** Automatically calculates and posts Cost of Goods Sold using the weighted average cost method every time a sale is confirmed or a POS transaction is completed. The average cost updates on each goods receipt.
- **Who it's for:** All retail merchants as the default costing method. Works for standard (non-batch, non-serial) inventory items.
- **Constraints / notes:** WAC recalculates on: GRN receipt, landed cost allocation, purchase return, upward stock adjustment with cost, and assembly completion. COGS is posted at the time of sale, not when the order is drafted.

---

## COGS — FIFO (Batch-Tracked Items)

- **Status:** shipped
- **Description:** For batch-tracked items (e.g., perishables, items with lot numbers), automatically calculates COGS using FIFO cost layers — oldest stock is costed out first.
- **Who it's for:** Merchants selling batch-tracked or lot-controlled inventory (food and beverage, pharmaceuticals, cosmetics).
- **Constraints / notes:** Requires the item to be batch-tracked. Cost layers are maintained per batch receipt.

---

## COGS — Specific Identification (Serial-Tracked Items)

- **Status:** shipped
- **Description:** For serialized items (e.g., electronics, jewellery), COGS is posted using each unit's own acquisition cost — not the pool average. The cost recorded at goods receipt is used exactly when that serial number is sold, ensuring COGS ties perfectly to the GL.
- **Who it's for:** Merchants selling high-value serialized goods where each unit has a distinct cost (electronics, luxury items, equipment).
- **Constraints / notes:** Serial units with a zero or null acquisition cost are rejected at sale confirmation — preventing zero-cost COGS errors. WAC pool for the same item is unaffected by specific-identification sales.

---

## Retroactive COGS Adjustment (Landed Costs)

- **Status:** shipped
- **Description:** When landed costs (freight, customs, insurance) are allocated to a shipment after some of those goods have already been sold, the system retroactively recalculates WAC/FIFO and posts an adjustment journal to true up COGS.
- **Who it's for:** Importers and wholesalers who receive supplier invoices for shipping costs after the goods have entered inventory and been partially sold.
- **Constraints / notes:** Adjustment entry: DR COGS / CR Inventory for the difference. Scoped to the affected GRN and its sold items.

---

## Bank Reconciliation

- **Status:** shipped
- **Description:** Upload a bank statement (CSV with column mapping) or enter statement lines manually, then auto-match them to journal entries by amount, date, and reference number. Unmatched items can be manually paired or flagged. Reconciliation is locked when the adjusted book balance equals the bank balance.
- **Who it's for:** Accountants and bookkeepers performing monthly bank reconciliation.
- **Constraints / notes:** CSV column mapping is saved per bank account. Auto-match tolerance: exact amount + date within ±2 days (configurable). Cannot mark a period as reconciled if there is any outstanding difference. Outstanding cheques and deposits in transit carry forward automatically.

---

## Cheque Management

- **Status:** shipped
- **Description:** Tracks the full lifecycle of both incoming (customer) and outgoing (supplier) cheques — from issuance/receipt through depositing, clearing, and bouncing. Each status change automatically posts the correct journal entries (e.g., cheque in hand, cheques in transit, cheque bounce fee).
- **Who it's for:** Businesses in Kuwait, KSA, UAE, and other GCC markets where post-dated cheques are a primary payment instrument.
- **Constraints / notes:** Cheque status states: Received → Deposited → Cleared / Bounced; Issued → Presented → Cleared / Bounced. Bounce automatically posts a bank charge. Frontend at `/(app)/cheques`.

---

## Withholding Tax / TDS (India)

- **Status:** shipped
- **Description:** Manages India's Tax Deducted at Source (TDS) sections and rates. Applies the correct TDS deduction on eligible supplier payments and posts the corresponding liability.
- **Who it's for:** Indian businesses required to deduct TDS on supplier payments (Section 194C, 194J, etc.).
- **Constraints / notes:** India-specific. TDS sections are configurable via `tenant/tds-sections`. API and DB exist (`withholding_tax_sections` table); verify frontend exposure before using as a selling point for non-India markets.

---

## Dead Letter / Event Retry

- **Status:** shipped
- **Description:** When an automated accounting event fails to process (e.g., due to a transient DB error), it lands in a dead-letter queue and is surfaced in a management screen. Admins can inspect the failure reason and retry processing without data loss.
- **Who it's for:** System administrators and support teams ensuring accounting integrity.
- **Constraints / notes:** Frontend at `/(app)/dead-letters`. This is an operational/reliability feature, not a user-facing accounting feature in the traditional sense.

---

## Accounting Outbox (Transactional Reliability)

- **Status:** shipped
- **Description:** Every automated accounting event is written to a transactional outbox in the same database transaction as the source document state change. This guarantees that no business event is ever "lost" — if the accounting engine is temporarily unavailable, the event will be processed when it recovers.
- **Who it's for:** All users indirectly — ensures accounting is always consistent with operational data even under system failures.
- **Constraints / notes:** Infrastructure/reliability feature. Not directly visible to end users.

---

## AR Aging Report

- **Status:** shipped
- **Description:** Shows all outstanding customer balances grouped by how overdue they are (current, 30, 60, 90+ days), helping identify which customers owe money and for how long.
- **Who it's for:** Finance managers and shop owners managing cash flow and collections.
- **Constraints / notes:** Derived from posted sales invoices and receipts in the journal ledger.

---

## AP Aging Report

- **Status:** shipped
- **Description:** Shows all outstanding supplier balances grouped by due date, helping the business prioritize supplier payments and avoid late fees.
- **Who it's for:** Finance managers and purchasing teams managing supplier payment schedules.
- **Constraints / notes:** Derived from posted purchase invoices and supplier payment journals.

---

## Cash Flow Statement

- **Status:** shipped
- **Description:** An automated statement of cash flows (Operating, Investing, Financing activities) for any selected fiscal period, based on journal entries tagged to cash flow categories.
- **Who it's for:** Business owners and accountants reporting to investors, banks, or auditors.
- **Constraints / notes:** Accounts must have `cashFlowCategory` set in the COA for correct classification. Indirect method based on the general ledger.

---

## Consolidated Reporting (Multi-Entity)

- **Status:** planned
- **Description:** Consolidated financial statements across multiple legal entities, with currency translation and inter-company elimination — showing group-level P&L, balance sheet, and cash flows.
- **Who it's for:** Multi-country or multi-entity retail groups (e.g., a group with a Kuwait entity and a KSA entity).
- **Constraints / notes:** Specced for Phase 6. Single-entity reports are fully shipped; group currency and consolidation engine are not yet built.

---

## ZATCA E-Invoicing Integration (KSA)

- **Status:** planned
- **Description:** Full compliance with Saudi Arabia's ZATCA e-invoicing mandate — Phase 1 (QR-code reporting invoices) and Phase 2 (real-time clearance via ZATCA's Fatoora portal). Covers cryptographic signing (secp256k1), XML generation, and submission.
- **Who it's for:** Businesses operating in Saudi Arabia subject to ZATCA Wave 24 (revenue ≥ SAR 375,000). Mandatory for KSA operations.
- **Constraints / notes:** Deep research and architecture complete (2026-06-11); implementation not yet shipped. Phase 1 is MVP-sized; Phase 2 requires ZATCA onboarding and certificate management. Data residency question is open.
