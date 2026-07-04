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
- [x] All CRITICAL/HIGH pass for Asala.
- [x] Findings logged in `_findings.md`.

### Sign-off note — 2026-07-04 (Asala, prod dogfood)
**SIGNED OFF.** 17 findings raised, **all FIXED** (0 open, 0 deferred) across commits `2c6380b3`, `b9037a50`, `40ed984a` on `main`. Reviewed by code/frontend/nestjs/accounting reviewers; reconcile invariant verified at the DB (**Σ party-tagged 1131 = KWD 370.500**, untagged = 0; a zero-opening new customer CUST-0005 posts **no** 1131 line).

Highlights:
- **AR statement** tab added — GL-authoritative, per-currency running balance, closing ties to `getBalance().byCurrency` by construction (single-currency renders unchanged).
- **Sequence-collision** (imported CUST codes vs lazy `cus` sequence) fixed at the choke point (sequence born at `max+1`, no race) + prod data patch (`cus.next_number=5`).
- **CSV formula-injection** hardened app-wide via shared `escapeCsvCell` (6 divergent copies migrated).
- Form redesign: only **name** required, currency dropdown (hidden for single-currency), phone/email restored, tax-group field (hidden for no-VAT), one clean error toast, optional user code override.
- Detail UX: **Block/Unblock** action added, card pencils removed, edit route created (was 404).

**Carry-forward to 03/04:** verify a **blocked** customer is actually prevented from being sold to (enforcement lives at sale/invoice creation + the customer picker), parallel to the credit-limit gate. Blocked *status* + reason now exist and are settable; enforcement is untested.

**Deferred to a VAT/multi-entity persona (not applicable to Asala, no debt for this dataset):** none — findings 6/13/14 (multi-currency) were fully implemented, not deferred.
