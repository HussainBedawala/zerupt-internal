# Sales Layer 5 — Customer Receipts, Credit Notes/Returns, AR Aging, Period Integrity

**Date:** 2026-06-30
**Module:** Sales
**Files studied:**
- `apps/api/src/sales/receipts/receipt-vouchers.service.ts`
- `apps/api/src/sales/receipts/receipt-vouchers.controller.ts`
- `apps/api/src/sales/receipts/receipt-vouchers.events.ts`
- `apps/api/src/sales/receipts/receipt-vouchers.dto.ts`
- `apps/api/src/sales/credit-notes/credit-notes.service.ts`
- `apps/api/src/sales/credit-notes/credit-notes.controller.ts`
- `apps/api/src/sales/customers/customer-ar-balance.service.ts`
- `apps/api/src/sales/receivable-writeoff/receivable-writeoff.service.ts`
- `apps/web/src/features/customers/components/customer-payments-tab.tsx`
- `apps/web/src/features/reports/components/reports/ar-aging-report.tsx`
- Specs: `agent-os/product/modules/sales/05-credit-notes.md`, `06-customer-payments.md`

---

## A. Customer Receipts

### EXISTS

| Behavior | File:Line | Notes |
|---|---|---|
| Draft creation with allocations, customer + status validation | `receipt-vouchers.service.ts:98` | Σ allocs ≤ totalAmount enforced at create |
| Allocation duplicate guard (same document twice) | `receipt-vouchers.service.ts:144` | Set-based dedup |
| Invoice ownership check (same customer, confirmed only) | `receipt-vouchers.service.ts:156` | |
| Composable path (direct sale atomicity) | `receipt-vouchers.service.ts:229` | Used by DirectSaleService; same-tx visibility |
| Fiscal period gate (HardLocked rejects, SoftLocked requires reason+auth) | `receipt-vouchers.service.ts:373` | Both standalone and composable paths |
| FOR UPDATE lock on each invoice at post — sorted canonical order (deadlock-safe) | `receipt-vouchers.service.ts:435` | Serializes concurrent receipt posts |
| Over-allocation guard at post: allocation > invoice.balance throws | `receipt-vouchers.service.ts:455` | Money-loss prevention |
| Invoice balance decrement: `paidAmount += alloc, balance -= alloc` | `receipt-vouchers.service.ts:465` | balanceFn is GENERATED ALWAYS — auto-recomputes |
| Realized FX (IAS 21): cashFN per alloc vs AR at booking rate, fxGainLoss leg | `receipt-fx.ts`, `receipt-vouchers.service.ts:482` | Collapses to zero for functional-currency |
| Transactional outbox (DR cash/bank, CR AR party-tagged) | `receipt-vouchers.service.ts:512`, `events.ts:59` | Durable; listener posts JE |
| Gapless RV-NNNN number reservation, released on failure | `receipt-vouchers.service.ts:406` | |
| Per-payment bank-account selection (bank_transfer only) | `receipt-vouchers.service.ts:369` | Validated: active, postable, isCashEquivalent |
| Advance / on-account: totalAmount > Σ allocations allowed | `receipt-vouchers.service.ts:130` | Comment says listener parks residual in customer deposits |
| UI: customer payments tab lists drafts + posted | `customers/components/customer-payments-tab.tsx:1` | Read-only; receipt-detail-panel for detail |
| UI: receipt print document | `customers/print/customer-receipt-print-document.tsx` | |

### MISSING / GAPS

| Gap | Severity | Notes |
|---|---|---|
| **Receipt REVERSAL endpoint**: no reverse/void in controller or service | CRITICAL | Controller has: create / list / get / post — no reverse. Purchase had reversal (net-zero contra, outbox-durable, PIN+SoD). When a posted receipt was entered in error there is no correction path short of manual journal entries |
| **Cheque payment method**: DTO enum is `["cash", "bank_transfer"]` only | MEDIUM | `receipt-vouchers.dto.ts:69`. Purchase cheque JE path covered in L5. Sales receipts have no cheque leg (no cheque-JE outbox payload). Cheque-receipt is a common MENA/GCC flow |
| **Early payment discount**: no discount leg on receipt | LOW | Spec `06-customer-payments.md` does not appear to mandate it, but it is a common customer incentive; not implemented |
| **Advance application (deposit reuse)**: unallocated residual goes to customer deposits (event comment `events.ts:59`) but there is no deposit table, no apply-deposit endpoint, and no UI to later apply the advance to a new invoice | MEDIUM | The listener presumably credits a deposits control account, but no code path re-allocates it to future invoices |
| **Receipt UI (standalone)**: no receipt-entry page under `/sales/receipts`; receipts are only visible on the customer detail tab | LOW | Create/post flow is API-only for standalone receipts not from a direct sale |

---

## B. Sales Returns / Credit Notes

### EXISTS

| Behavior | File:Line | Notes |
|---|---|---|
| Dual type: `goods_return` (stock back in, COGS reversal) and `price_adjustment` (no stock) | `credit-notes.service.ts:144,205` | Correctly gated: warehouse required only for goods_return |
| Draft creation: price/tax snapshots from invoice lines, no client-set price | `credit-notes.service.ts:195` | |
| Manager PIN approval gate | `credit-notes.service.ts:239` | `sales.creditNote.confirm` permission |
| Fiscal period gate at confirm (HardLocked/SoftLocked) | `credit-notes.service.ts:250` | |
| FOR UPDATE lock on invoice at confirm | `credit-notes.service.ts:295` | Serializes concurrent CN confirms + receipt posts |
| Per-line over-credit guard: creditQty ≤ invoiced − Σ(prior confirmed credits) — inside locked tx | `credit-notes.service.ts:562` | Race-safe; concurrent confirms can't over-credit |
| Over-AR guard at header level: CN total > invoice.balance throws | `credit-notes.service.ts:337` | Prevents crediting a settled invoice (no money-loss) |
| Invoice balance decrement: `paidAmount += total, balance -= total` | `credit-notes.service.ts:369` | balanceFn GENERATED ALWAYS — auto-recomputes |
| Return cost at original COGS: engine-realized first (SLE), then pre-commit snapshot, then WAC — never zero | `credit-notes.service.ts:673` | A2 tie-by-construction (COGS reversal == original COGS) |
| Serial tracking: assertSerialsSold at create, claimForReturn at confirm (atomic, in tx) | `credit-notes.service.ts:164,329` | Guards never-sold / already-returned serials |
| Transactional outbox (DR revenue / CR AR, plus inventory COGS reversal event) | `credit-notes.service.ts:390`, `events.ts` | Outbox-durable |
| Gapless CN-NNNN number | `credit-notes.service.ts:280` | |
| UI: credit-note-dialog.tsx, credit-note-print-document.tsx | `features/invoices/components/` | Accessible from invoice detail panel |

### MISSING / GAPS

| Gap | Severity | Notes |
|---|---|---|
| **Credit note VOID**: no void/reversal endpoint | LOW | Spec explicitly says "No reversal of credit note. If credit was incorrect, create a new invoice." (`05-credit-notes.md`). Spec-aligned design decision, but creates audit gap — there is no way to mark a confirmed CN as erroneous without a manual JE |
| **SO-sourced CN dual path**: spec alludes to SO-sourced invoices; the credit-note service has a single path (`invoiceId` required) — no difference between direct-sale-invoice CN and SO-sourced-invoice CN | LOW | Functionally equivalent since all credit notes reference an invoice; no gap in practice |
| **FX on credit note decrement**: credit note `total` is in transaction currency (from invoice); the `balance` column is also TC; the decrement is TC-on-TC — correct. However, if invoice was foreign-currency and the CN is confirmed later at a different date, there is no realized FX leg on the CN's AR reduction (unlike receipts) | MEDIUM | The CN JE credits AR at the invoice's original booking rate (pulled from the invoice row). No explicit FX gain/loss on CN is computed or posted. This diverges from IAS 21 if the TC CN amount converts at a different rate than original booking rate |
| **Price-adjustment CN with partial invoice**: when invoice is partially paid via a receipt and then a price-adjustment CN is raised, the `balance` guard (`total > balance`) works correctly. Verified safe. | — | No gap |

---

## C. AR Aging

### EXISTS

| Behavior | File:Line | Notes |
|---|---|---|
| `agingBuckets(tenantId, customerId?)`: 0-30 / 31-60 / 61-90 / 90+ by invoice.dueDate | `customer-ar-balance.service.ts:226` | Functional currency; prefers balanceFn (GENERATED), falls back to balance × exchangeRate |
| Excludes draft/voided (status='confirmed'), excludes zero-balance (balance > 0), excludes opening-balance entries (isOpening=false) | `customer-ar-balance.service.ts:234` | |
| NULL dueDate treated as current (age = -1 → current bucket) | `customer-ar-balance.service.ts:232` | |
| `reconcile(tenantId, threshold)`: GL sub-ledger (debit-normal party lines) vs aging (confirmed invoice balances) | `customer-ar-balance.service.ts:285` | Returns customers with drift > threshold |
| GL-native balance `getBalance`: Σ(debit − credit) over trade_receivables control account, party-tagged | `customer-ar-balance.service.ts:112` | Used for credit-limit advisory lock |
| Batched balance `getFunctionalBalancesByCustomer`: O(1) scans for customer list view | `customer-ar-balance.service.ts:182` | |
| UI: `/reports/ar-aging` page with `ArAgingReport` component | `apps/web/src/app/[locale]/(app)/reports/ar-aging/page.tsx` | Exists and registered in report-registry |

### GAPS

| Gap | Severity | Notes |
|---|---|---|
| **reconcile() vs agingBuckets() filter mismatch**: `reconcile()` aging query uses `status='confirmed'` with NO `balance > 0` filter, while `agingBuckets()` filters `balance > 0`. A fully-paid invoice (balance=0) contributes 0 to both — net non-issue. But an over-credited invoice (balance<0, which should not exist given guards) would drift. Minor inconsistency in SQL intent | LOW | `customer-ar-balance.service.ts:295` vs `234` |
| **No customer-level aging drill-down on aging report**: the `agingBuckets()` supports per-customer scope but the UI report may not expose per-customer drill-down | LOW | Not confirmed without reading ArAgingReport component fully |

---

## D. Receivable Write-Off

### EXISTS

| Behavior | File:Line | Notes |
|---|---|---|
| DR bad_debt (6430) / CR AR control (1131 party-tagged) via accounting.post event | `receivable-writeoff.service.ts:347` | Role-resolved, not hardcoded |
| Over-write-off guard: amount > openBalanceTc throws | `receivable-writeoff.service.ts:245` | Reads GL net inside locked tx |
| Race-safe: outbox upsert (ON CONFLICT DO NOTHING) prevents double-submit | `receivable-writeoff.service.ts:237` | Deterministic eventId (uuidV5) |
| Fiscal period gate (HardLocked/SoftLocked) | `receivable-writeoff.service.ts:148` | |
| Immutable audit record | `receivable-writeoff.service.ts:281` | who/when/amount/customer/reason |
| Multi-currency: one currency at a time, GL-derived open balance per (customer, currency) | `receivable-writeoff.service.ts:102` | |

### GAPS

| Gap | Severity | Notes |
|---|---|---|
| **No write-off reversal**: once written off there is no unwind endpoint | MEDIUM | If a customer later pays a written-off debt, the user must manually post a receipt to re-recognize the income (a separate "bad debt recovery" flow); this is not guided in the UI |

---

## E. Period Integrity — Module-Wide

| Boundary | Covered | File:Line |
|---|---|---|
| Receipt post | YES | `receipt-vouchers.service.ts:373` |
| Receipt post (composable path) | YES | `receipt-vouchers.service.ts:588` |
| Credit note confirm | YES | `credit-notes.service.ts:250` |
| Write-off | YES | `receivable-writeoff.service.ts:148` |
| Receipt REVERSAL | N/A | Not implemented |
| Credit note VOID | N/A | Not implemented |

SoftLocked always requires explicit `softLockOverrideReason` + `assertSoftLockOverrideAllowed` before any reservation or outbox insert — guaranteeing no silent dead-letters.

---

## F. GL / Reconcile Invariant — correctness summary

| Invariant | Status |
|---|---|
| Receipt decrements invoice.balance correctly (TC, FOR UPDATE, over-pay guard) | HOLDS |
| balanceFn recomputes automatically (GENERATED ALWAYS) — service never writes it | HOLDS |
| Credit note decrements invoice.balance correctly (TC, FOR UPDATE, over-credit guard per-line + per-header) | HOLDS |
| GL sub-ledger (party-tagged JE lines) == aging (invoice balances) via reconcile endpoint | HOLDS for implemented transactions; RECEIPT REVERSAL gap would break this if a reversal is done via manual JE (JE affects GL but not invoice.balance) |
| Write-off relieves GL only (no invoice.balance change) — AR aging buckets will still show invoice balance until invoice is separately settled | KNOWN DESIGN: write-off posts GL; aging view drifts from GL for written-off invoices until manually reconciled or a credit note is also raised |

---

## Layer 5 GAP CANDIDATES

| # | Gap | Severity | Impact |
|---|---|---|---|
| G1 | Receipt REVERSAL missing (no reverse endpoint, no contra JE, no balance re-credit) | CRITICAL | Keying error on posted receipt has no correction path; manual JE breaks reconcile invariant |
| G2 | Advance/deposit application: unallocated receipt amount has no apply-to-invoice flow | MEDIUM | Customer over-payments are parked but cannot be re-allocated without manual workaround |
| G3 | Cheque payment method absent on receipts (enum: cash/bank_transfer only) | MEDIUM | Common MENA/GCC flow; no cheque JE leg; post-dated cheque management absent |
| G4 | FX gain/loss on credit note AR reduction: no realized FX leg when CN confirmed at a date after the invoice (IAS 21 gap) | MEDIUM | On foreign-currency invoices, the CR AR is booked at the original rate (correct), but any rate movement between invoice date and CN date is not recognized as a separate FX P&L line |
| G5 | Write-off reversal / bad-debt recovery guided flow missing | MEDIUM | No API endpoint for recovering a written-off debt; requires manual journal entry |
| G6 | No standalone receipt-entry UI (only accessible via customer payments tab) | LOW | Operator friction for posting standalone receipts |
| G7 | reconcile() does not exclude zero-balance invoices consistently (minor SQL intent drift vs agingBuckets) | LOW | Edge case; in practice zero-balance rows contribute 0 to both sides |
| G8 | Credit note VOID: spec forbids it; design decision — but leaves no audit-friendly correction path for a wrongly-confirmed CN | INFO | Spec-aligned; raise if spec review triggers |
