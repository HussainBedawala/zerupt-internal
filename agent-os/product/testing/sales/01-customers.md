# Sales — Customers / AR Master Testing Checklist

> Persona: **a shopkeeper who wants to know exactly what each trade customer owes them.** Test every item as that person, with the Asala dataset loaded (4 customers: C-001 Al Salam KWD 250.000 opening, C-002 Speed Motors nil, C-003 Bader Auto KWD 120.500 opening, C-004 Walk-in nil; total AR = KWD 370.500 = account 1131).

- **Routes:** `/sales/customers`, `/sales/customers/new`, `/sales/customers/[id]`
- **Feature dir:** `apps/web/src/features/customers/`
- **API:** `tenant/sales/customers` (create/list/:id/patch/delete)
- **Depends on:** COA (1131 AR control) seeded; opening balances imported.

## 0. Preconditions
- [ ] Asala dataset imported; opening AR balances present.
- [ ] Logged in as Owner; separately confirm Cashier cannot create/edit customers or see AR/cost detail.
- [ ] Fiscal period open.

## 1. Functional — actions & states
- [ ] **List** loads; shows the 4 customers with correct outstanding balances (C-001 250.000, C-003 120.500, others 0.000). Loading/empty/error states present.
- [ ] **Create customer** — required fields validated; success feedback; list refreshes with the new row.
- [ ] **Edit customer** — non-financial fields (name AR/EN, phone, email, address) editable; opening balance NOT silently editable into a new AR posting.
- [ ] **Detail / ledger** — customer detail shows a running AR ledger (opening + each invoice/receipt/credit-note) that sums to the outstanding balance.
- [ ] Search / filter by name/code/phone returns correct subsets; reset works.
- [ ] CSV export (if present) matches on-screen list.

## 2. Domain invariants
- [ ] **Outstanding balance = Σ party-tagged 1131 ledger rows for that customer** — not a stored field that can drift.
- [ ] **Σ all customer balances = 370.500 = the 1131 control in the trial balance.** No double-post of the opening AR (imported opening posted once as an opening journal, not re-created per customer).
- [ ] Walk-in (C-004) carries **zero** balance and is the bucket for anonymous cash sales.
- [ ] Bilingual name (AR primary / EN secondary) stored and rendered `dir="auto"`.
- [ ] Phone stored/displayed in Kuwait 8-digit format; no corruption.

## 3. Edge cases & defensive UX
- [ ] Duplicate customer **code** rejected (server-side), clear message.
- [ ] Deleting/deactivating a customer **with a non-zero balance or history** is blocked or soft-only — never orphans AR.
- [ ] Rapid double-submit on create makes ONE customer, not two.
- [ ] Empty/very-long/RTL names render correctly; no layout break.
- [ ] Currency/precision on any balance field = KWD 3dp via shared util (not hardcoded 2dp).

## 4. Cross-module / integration
- [ ] Customer picker used elsewhere (SO, invoice, direct sale, receipt) reads this same master; creating here surfaces there.
- [ ] Drill from customer detail into an invoice/receipt resolves to the right record.

## 5. Known gaps (verify or track)
- Credit limits / payment terms / AR aging statements are out of scope for Asala — verify they are simply absent, not half-wired producing wrong numbers.

## Sign-off
- [ ] All CRITICAL/HIGH pass for Asala.
- [ ] Findings logged in `_findings.md`.
