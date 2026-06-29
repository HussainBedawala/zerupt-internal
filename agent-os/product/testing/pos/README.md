# POS Module — Testing Index

> **Persona for the whole module: a counter cashier (and, for close, a shift supervisor / owner).** Assume the only people touching these screens stand at the till: they ring up sales fast, take cash and card, give change, hold and recall carts, process returns, and at end of day count the drawer and close the shift. They are NOT accountants and NOT storekeepers. They expect the till to be fast, to never lose a sale, to keep working when the internet drops, to give correct change, and to reconcile cash at close without an argument. At every screen ask: **"what's the dumbest thing a cashier could do here, at speed, with a customer waiting?"**

POS is an **event-emitting front end**, not a ledger of its own. A completed sale persists to `pos_transactions` / `pos_transaction_lines` / `pos_payments`, then emits `pos.transaction.completed` which the accounting listener turns into a balanced journal entry (DR Bank/Cash → CR Sales; DR COGS → CR Inventory per line) and the inventory module turns into a stock-ledger deduction. POS itself **never writes journal entries or stock movements directly.** Correctness therefore depends on **three** things tying out: the POS records, the GL entries that flow out, and the inventory relief — for every sale, return, void, and shift close.

POS is also the only module that runs **offline**: sales are queued in IndexedDB under a `clientId` and replayed at sync. Idempotency (exactly-once replay) and server-side total recomputation are load-bearing.

## Submodule checklists (run in order — dependencies flow downward)

> A register + open shift must exist before transactions; transactions before payments/discounts/returns; the rest before close/reports/cross-module.

| # | Submodule | Route(s) |
|---|-----------|----------|
| 01 | [Register & Session](01-register-session.md) | `/pos`, `/pos/shifts` |
| 02 | [Transaction Lifecycle](02-transaction-lifecycle.md) | `/pos` (cart), back-office `pos-transactions` |
| 03 | [Payment Methods](03-payment-methods.md) | payment panel within `/pos` |
| 04 | [Discounts & Promotions](04-discounts-promotions.md) | inline on `/pos` cart |
| 05 | [Returns & Exchanges](05-returns-exchanges.md) | return flow from `/pos` |
| 06 | [Offline Mode](06-offline-mode.md) | transparent on `/pos` (IndexedDB + `/pos/sync/*`) |
| 07 | [Receipt Model](07-receipt-model.md) | post-sale on `/pos`; public `/r/[token]` |
| 08 | [Z-Report & Shift Close](08-z-report-shift-close.md) | `/pos/shifts` |
| 09 | [Cross-Module Contracts](09-cross-module-contracts.md) | events only (no UI) |
| 10 | [Printing & Receipts](10-printing-receipts.md) | print actions on `/pos`; agent `ws://127.0.0.1:9723` |

Findings: [`_findings.md`](_findings.md)

---

## Cross-cutting POS invariants (apply to EVERY submodule)

These must hold no matter the dataset. If any fails anywhere, it is at least HIGH, usually CRITICAL.

### Cash & payment integrity
- [ ] **Payment completeness:** for every completed transaction, `Σ(pos_payments.amount) − Σ(changeGiven) = grandTotal` (within currency rounding).
- [ ] **Cash reconciliation:** for every closed shift, `expectedCash = openingFloat + Σ(cash sales) − Σ(cash refunds) − Σ(pay-outs) + Σ(pay-ins)`, and `cashOverShort = actualCash − expectedCash`, stored exactly on `pos_shifts`.
- [ ] **grandTotal arithmetic:** `grandTotal = subtotal + taxTotal − discountTotal` exactly (no tolerance).
- [ ] No overpayment on non-cash tenders; `changeGiven` only on cash; card payments carry a `reference`.

### Ties to accounting & inventory (the three-way tie-out)
- [ ] **Balanced JE per sale:** every completed transaction has exactly one journal entry with `Σ(debit) = Σ(credit)`, keyed `sourceDocumentType='PosTransaction'`, `sourceDocumentId=transaction.id`.
- [ ] **COGS relief per line:** every sale line produces DR COGS (5100) / CR Inventory (1141) for `quantity × costAtSale`.
- [ ] **Stock deduction per line:** every sale line produces a matching negative stock-ledger entry (item × location × quantity).
- [ ] **Return & void reversal:** a completed return/void fully reverses both the GL entry and the stock movement — net zero financial + inventory effect after original + reversal.
- [ ] `costAtSale > 0` for any item with `trackingType != 'none'` (zero cost ⇒ WAC capture failed).

### Sessions & sync
- [ ] **Shift uniqueness:** at most one `pos_shifts` row per `registerId` with `status IN ('open','closing')` at any time; a cashier has at most one open shift.
- [ ] **Idempotent sync:** replaying an existing `clientId` returns the existing record — never a duplicate transaction/line/payment.
- [ ] **Server recomputes totals at sync:** mismatches are stored and flagged, never silently accepted and never rejected.
- [ ] **Print/sync never blocks a sale:** a sale completes even if the printer, network, or token mint fails.

### Returns
- [ ] Cumulative returned quantity per original line ≤ original quantity sold; return uses the **original** sale price; serial on return matches the original sale.

### Currency, audit & tenant isolation
- [ ] All money displays in the **tenant functional currency** at its precision (KWD = 3dp) via the shared `currency-precision` util — never hardcoded USD/SAR or 2/3 dp.
- [ ] Every mutation writes an immutable audit record; completed/voided/closed records are immutable (no edit, no delete, no reopen).
- [ ] All lists/reports show only the current tenant's data; permissions enforced server-side, not just hidden in the UI.

---

## Cross-cutting systemic findings (check these on EVERY screen)

Recurred across nearly every accounting and inventory screen; check proactively on every POS screen too:

1. **Hardcoded currency defaults** (USD/SAR) instead of `useTenantCurrency()`.
2. **2dp formatting** instead of dynamic precision — reuse `apps/web/src/lib/currency-precision.ts`; never hardcode.
3. **Redundant module layout header** on sub-pages (section resolver should return `""` for non-section sub-paths).
4. **Free-text inputs that should be searchable pickers** (item, customer, tender) — reuse existing pickers/endpoints.
5. **Secondary-language label/placeholder** must be generic via `useBilingualLabels()`, `dir="auto"`, hidden for monolingual tenants.
6. **Toolbar polish**: filter chevron alignment; date-picker icon overlap; missing CSV export on list/report screens.
7. **Defensive UX**: every action needs loading/error/empty/success; destructive actions need confirmation + data-loss warning; debounce; validate client + server. (Heightened for POS: speed + a waiting customer.)

## Severity rubric

See [`../README.md`](../README.md). Fix CRITICAL/HIGH immediately; batch MEDIUM/LOW for review (founder generally wants them fixed too).
