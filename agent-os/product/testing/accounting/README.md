# Accounting Module — Testing Index

> **Persona for the whole module: an accountant.** Assume the only person touching these screens is a qualified bookkeeper/accountant who expects double-entry to be correct, every report to tie out to the ledger, and closed periods to stay closed. They will not forgive wrong numbers.

The accounting module is an event-driven double-entry ledger: every other module (POS, Sales, Purchase, Inventory, Cheques) auto-posts journal entries through listeners. So accounting correctness depends on *both* the screens here **and** the postings flowing in from elsewhere.

## Submodule checklists (run in order — dependencies flow downward)

| # | Submodule | Route |
|---|-----------|-------|
| 01 | [Chart of Accounts](01-chart-of-accounts.md) | `/accounting/chart-of-accounts` |
| 02 | [Journal Entries](02-journal-entries.md) | `/accounting/journal-entries` |
| 03 | [General Ledger](03-general-ledger.md) | `/accounting/general-ledger` |
| 04 | [Trial Balance](04-trial-balance.md) | `/accounting/trial-balance` |
| 05 | [Opening Balances](05-opening-balances.md) | `/accounting/opening-balance(s)` |
| 06 | [Account Mappings](06-account-mappings.md) | `/accounting/account-mappings` |
| 07 | [Financial Reports (P&L, BS, Cash Flow)](07-financial-reports.md) | `/reports/*` |
| 08 | [AR & AP Aging](08-ar-ap-aging.md) | `/reports/ar-aging`, `/reports/ap-aging` |
| 09 | [Tax / VAT / TDS](09-tax-vat.md) | `/settings/taxation`, `/reports/tax-summary` |
| 10 | [Fiscal Years & Periods](10-fiscal-years-periods.md) | `/accounting/fiscal-years`, `/settings/fiscal` |
| 11 | [Period Close Management](11-period-close.md) | `/accounting/close-management` |
| 12 | [Bank Reconciliation](12-bank-reconciliation.md) | `/accounting/bank-reconciliation` |
| 13 | [Cheques (PDC Register)](13-cheques-pdc.md) | `/accounting/cheques` |
| 14 | [Multi-Currency & FX](14-multi-currency-fx.md) | `/settings/currencies`, exchange rates |
| 15 | [Dead Letters (event retry)](15-dead-letters.md) | `/accounting/dead-letters` |
| 16 | [Audit Trail](16-audit-trail.md) | `/accounting/audit-trail` |

Findings: [`_findings.md`](_findings.md)

---

## Cross-cutting accounting invariants (apply to EVERY submodule)

These must hold no matter the dataset. If any fails anywhere, it is at least HIGH, usually CRITICAL.

### Double-entry integrity
- [ ] **Every journal entry balances:** Σ debits = Σ credits, to the currency's precision (no rounding leak).
- [ ] **No partial posts:** an entry is fully posted or not at all (atomic). A failed post leaves nothing behind.
- [ ] **Posted entries are immutable:** you cannot edit or delete a posted entry — only reverse it. Reversal creates a new, balanced, mirrored entry (never deletes history).

### Reports tie out
- [ ] **GL ⊃ TB:** the sum of each account's GL movements equals that account's trial-balance figure for the same date range.
- [ ] **TB balances:** total debits = total credits on the trial balance.
- [ ] **Balance Sheet balances:** Assets = Liabilities + Equity as of any date.
- [ ] **Accounting equation across reports:** P&L net profit for a period flows into Equity (retained earnings) on the Balance Sheet at period end.
- [ ] **Subledgers tie to control accounts:** AR aging total = AR control account balance; AP aging total = AP control account balance; inventory valuation = inventory control account balance.
- [ ] **Tax summary ties:** tax collected/paid in the tax report reconciles to the VAT output/input account balances.

### Sign & classification
- [ ] Assets & Expenses are debit-normal; Liabilities, Equity & Revenue are credit-normal. Normal balances display with the correct sign.
- [ ] Contra accounts (accumulated depreciation, returns/allowances) carry the opposite sign of their parent type.

### Period & fiscal controls
- [ ] You **cannot post into a locked/closed period.** Attempt is rejected with a clear message (client + server).
- [ ] Backdated entries land in the correct period and are blocked if that period is locked.
- [ ] Year-end close moves P&L to retained earnings and zeroes income/expense for the new year.

### Multi-currency
- [ ] Foreign-currency entries store both transaction-currency and base-currency amounts; base amounts are what roll up into reports.
- [ ] FX gain/loss is posted to the correct account on settlement/revaluation; unrealized vs realized handled distinctly.

### Audit & traceability
- [ ] Every mutation writes an immutable audit-trail record (who/when/what — before/after).
- [ ] Every auto-posted entry links back to its source document, and the link resolves.
- [ ] Failed auto-postings land in the dead-letter queue (nothing is silently dropped).

### Tenant isolation (security)
- [ ] All data shown belongs to the current tenant only; no cross-tenant leakage in any list, report, or drill-down.
- [ ] Permission checks enforced server-side, not just hidden in the UI.
