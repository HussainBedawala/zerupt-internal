# Sales Module

> Rules for how quotations, sales orders, invoicing, credit notes, and customer payments work. Each file is self-contained.

## Files

| File | What It Covers |
|------|---------------|
| `01-customer-model.md` | Customer entity, status lifecycle, credit limits, payment terms |
| `02-quotation-lifecycle.md` | Quotation state machine, validity, conversion to sales order |
| `03-sales-order-lifecycle.md` | SO state machine, stock reservation, approval, partial invoicing |
| `04-sales-invoice.md` | Invoice confirmation, COGS capture, tax, multi-currency |
| `05-credit-notes.md` | Credit notes for goods returns and price adjustments |
| `06-customer-payments.md` | Receipt vouchers, partial payments, advances, early discounts, FX |
| `07-cross-module-contracts.md` | What Sales needs from Inventory/Accounting, what it emits |
| `08-event-mappings.md` | Every sales event with payload schema and cross-module references |

## Design Decisions

- Workflow: Quotation → Sales Order → Invoice (each step optional — standalone invoices allowed)
- All documents are immutable — corrections via credit notes, never edits
- Event-driven — Sales emits events consumed by Accounting and Inventory engines
- Partial flows supported: partial invoicing, partial credit, partial payment
- Multi-currency — transaction currency per customer/document, functional currency for accounting (see `accounting/03-multi-currency.md`)
- Tax per line using tax model (see `accounting/02-tax-model.md`)
- Prices resolved via Inventory pricing engine (see `inventory/07-pricing-engine.md`)
- Manager PIN required for: SO approval above threshold, credit note approval, payment override, price override on invoice
- Sales does not create journal entries or stock movements directly — it emits events consumed by Accounting and Inventory engines
- `validatePeriod(date)` called before all financial posting actions (see `accounting/08-period-control.md`)
- Sales is B2B (Accounts Receivable). POS handles B2C (immediate payment). See `pos/09-cross-module-contracts.md`.
