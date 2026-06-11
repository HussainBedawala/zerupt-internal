# POS Engine

> Rules for how the point-of-sale terminal handles transactions, payments, shifts, and receipts. Each file is self-contained.

## Files

| File | What It Covers |
|------|---------------|
| `01-register-session.md` | Register entity, shift open/close, cash float, register assignment |
| `02-transaction-lifecycle.md` | Cart → checkout → payment → receipt, hold/recall, void |
| `03-payment-methods.md` | Cash, card, split tender, store credit, gift card, custom methods |
| `04-discounts-promotions.md` | Line-level, order-level, coupon codes, manager approval thresholds |
| `05-returns-exchanges.md` | Original receipt lookup, reason codes, refund methods, exchange flow |
| `06-offline-mode.md` | Offline capabilities, local queue, sync-on-reconnect, conflict resolution |
| `07-receipt-model.md` | Thermal print layout (80mm), bilingual AR/EN, digital receipt options |
| `08-z-report-shift-close.md` | Cash count by denomination, expected vs actual, over/short handling |
| `09-cross-module-contracts.md` | What POS reads from Inventory, what events POS emits |

## Design Decisions

- POS runs fullscreen, separate from the main ERP shell
- Full offline mode — all core functions work without connectivity
- All transactions are immutable — corrections via void/reversal, never edits
- Manager PIN required for: discounts above threshold, voids, price overrides, no-sale drawer open
- Cash register account is `1112` (see `accounting/04-chart-of-accounts.md`)
- POS does not create journal entries or stock movements directly — it emits events consumed by Accounting and Inventory engines
- Transaction numbering: `{registerId}-{shiftNumber}-{sequence}` with offline gap tolerance
- Prices resolved via Inventory pricing engine (see `inventory/07-pricing-engine.md`)
- Tax calculated per line using tax model (see `accounting/02-tax-model.md`)
