# Purchase Module

> Rules for how supplier orders, goods receiving, landed costs, returns, and supplier payments work. Each file is self-contained.

## Files

| File | What It Covers |
|------|---------------|
| `01-supplier-model.md` | Supplier entity, status lifecycle, payment terms, currency/tax defaults |
| `02-purchase-order-lifecycle.md` | PO state machine, line schema, approval, partial receipt tracking |
| `03-goods-received-note.md` | GRN receipt against PO, over-receipt tolerance, serial/batch capture |
| `04-landed-cost-allocation.md` | Allocating freight/customs/insurance to GRN items, allocation methods |
| `05-purchase-returns.md` | Return to supplier, partial returns, debit notes |
| `06-supplier-payments.md` | Payment vouchers, partial payments, advances, early discounts, FX |
| `07-cross-module-contracts.md` | What Purchase needs from Inventory/Accounting, what it emits |
| `08-event-mappings.md` | Every purchase event with payload schema and cross-module references |

## Design Decisions

- All documents are immutable — corrections via reversal documents, never edits
- Event-driven — Purchase emits events consumed by Accounting and Inventory engines
- Partial flows supported: partial receipt, partial return, partial payment
- Multi-currency — transaction currency per supplier/PO, functional currency for accounting (see `accounting/03-multi-currency.md`)
- Tax per line using tax model (see `accounting/02-tax-model.md`)
- Manager PIN required for: PO approval above threshold, over-receipt beyond tolerance, manual landed-cost override, return override, payment override
- Purchase does not create journal entries or stock movements directly — it emits events consumed by Accounting and Inventory engines
- `validatePeriod(date)` called before all financial posting actions (see `accounting/08-period-control.md`)
