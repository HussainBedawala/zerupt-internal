# Purchase Module — Testing Index

> **Persona for the whole module: a purchasing clerk / shop owner who buys stock and owes suppliers money.** Assume the person touching these screens raises purchase orders (or just records a bill when goods arrive), receives goods into stock, matches supplier bills, pays suppliers, and returns bad stock. They are NOT an accountant — but they care intensely that the system knows **exactly what the business owes each supplier**, never lets them **pay the same bill twice**, and never **loses stock that physically arrived**. At every screen ask: **"what's the dumbest thing a purchasing clerk could do here?"** (receive twice, pay twice, bill more than received, void a paid bill, buy in the wrong currency).

Purchase is a **dual-path** module with an **AP subledger derived from the ledger**:

- **Two first-class paths to the same GL outcome:** (a) the **express direct-purchase** path (record a bill when stock arrives, no PO) and (b) the full **PO → GRN → bill → payment** chain. Both must post identical, correct journals for the same economic event.
- **AP is subledger-of-record derived from the immutable, party-tagged `2111` (Accounts Payable) GL.** What the business owes supplier X is the sum of party-tagged 2111 ledger rows for X. The **reconcile invariant** — Σ open bills per supplier = supplier's 2111 balance — must HOLD after every bill / payment / return / reversal / void.
- **Purchase auto-posts to the GL and to inventory** (event-driven). Goods receipt increases stock and hits GR/IR clearing; billing clears GR/IR and raises AP; landed cost revalues stock; payment settles AP. Correctness depends on **both** the screens here **and** the journals + stock ledger entries flowing out.
- **Never a dead-end:** every posted document is reversible (PO cancel, GRN void, bill void, landed-cost reverse, payment reverse, return void) — idempotent, net-zero contra, period-gated. A user who did the wrong thing must always have a clean way out.

## Submodule checklists (run in order — dependencies flow downward)

> Supplier master must be correct before any document; PO/direct before GRN; GRN before bill; bill before payment/return; everything before AP aging + cross-module.

| # | Submodule | Route |
|---|-----------|-------|
| 01 | [Suppliers / AP Master](01-suppliers.md) | `/purchase/suppliers`, `/purchase/suppliers/new`, `/purchase/suppliers/[id]` |
| 02 | [Purchase Orders](02-purchase-orders.md) | `/purchase/orders`, `/purchase/orders/new`, `/purchase/orders/[id]` |
| 03 | [Direct Purchase (express path)](03-direct-purchase.md) | `/purchase/direct`, `/purchase/direct/new` |
| 04 | [Goods Receipt Notes (GRN)](04-grn-receipt.md) | `/purchase/grns`, `/purchase/grns/new`, `/purchase/grns/[id]` |
| 05 | [Purchase Invoices / Bills](05-purchase-invoices.md) | `/purchase/invoices`, `/purchase/invoices/new`, `/purchase/invoices/[id]` |
| 06 | [Landed Costs](06-landed-costs.md) | `/purchase/landed-costs`, `/purchase/landed-costs/new`, `/purchase/landed-costs/[id]` |
| 07 | [Supplier Payments](07-supplier-payments.md) | `/purchase/payments`, `/purchase/payments/new`, `/purchase/payments/[id]` |
| 08 | [Purchase Returns / Debit Notes](08-purchase-returns.md) | `/purchase/returns`, `/purchase/returns/new`, `/purchase/returns/[id]` |
| 09 | [AP Aging / Overview](09-ap-aging-overview.md) | `/purchase` (overview dashboard) |
| 10 | [Cross-module Contracts](10-cross-module-contracts.md) | GL / inventory / reports handoffs |

Findings: [`_findings.md`](_findings.md)

---

## Cross-cutting purchase invariants (apply to EVERY submodule)

These must hold no matter the dataset. If any fails anywhere, it is at least HIGH, usually CRITICAL.

### AP subledger integrity (subledger derived from GL)
- [ ] **AP = party-tagged 2111 ledger.** For every supplier, the balance owed equals the sum of party-tagged Accounts Payable (`2111`) journal lines for that supplier. The AP subledger view is a read of the ledger, never a separately-maintained number that can drift.
- [ ] **Reconcile invariant HOLDS after every action:** Σ (open bill balances per supplier) = supplier's 2111 balance; Σ all suppliers = total 2111 in the GL, after every bill / payment / return / reversal / void.
- [ ] **Documents are immutable once posted** — a posted PO/GRN/bill/payment/return cannot be edited into a different amount or deleted; it is reversed by a new mirrored document (never a hard delete of history).
- [ ] **No partial posts:** a document either fully posts (subledger + GL + stock + audit) or not at all (atomic). A failed post leaves nothing behind.

### Dual-path equivalence
- [ ] **Direct purchase and PO→GRN→bill post identical GL + stock** for the same economic event (same goods, same cost). No path produces a different inventory value or AP balance.
- [ ] Each document links back to its source (bill→GRN→PO; payment→bill; return→bill/GRN) and every link resolves.

### GL posting (ties to accounting) — every document posts the CORRECT, balanced journal
- [ ] **Goods receipt (GRN):** Dr Inventory (at cost), Cr GR/IR clearing (goods-received-not-invoiced). Stock ledger entry created at the same cost.
- [ ] **Purchase invoice / bill:** Dr GR/IR clearing (clearing the receipt) + Dr input VAT (if any) , Cr Accounts Payable (2111, party-tagged). Price variance (PPV) posts to `purchase_variance` (5210) when bill price ≠ receipt cost.
- [ ] **Direct purchase bill (no GRN):** Dr Inventory + Dr input VAT, Cr AP — in one balanced entry.
- [ ] **Landed cost:** Dr Inventory (allocated across GRN lines), Cr `landed_cost_accrual` (2122) / AP / cash; stock is **revalued** (WAC recomputed) by the allocated amount.
- [ ] **Supplier payment:** Dr Accounts Payable (2111, party-tagged), Cr Cash/Bank. Allocations reduce the specific open bills.
- [ ] **Purchase return / debit note:** reverses the original — Cr Inventory (at cost), Dr AP / GR/IR — net-zero contra to the original posting; stock reduced.
- [ ] Failed auto-postings land in the dead-letter queue (nothing silently dropped).

### Payment safety (the "pay twice" guard)
- [ ] **A bill can never be over-allocated / over-paid:** total payments + returns allocated to a bill ≤ bill total; the open balance floors at zero and never goes negative.
- [ ] **Reversals are idempotent:** reversing an already-reversed document is a safe no-op, not a double-reversal.

### Currency & precision
- [ ] All amounts display in the **tenant functional currency** (never hardcoded USD/SAR) at the **currency's precision** (KWD = 3dp) via the shared `currency-precision` util — never hardcoded 2 or 3.
- [ ] **FX is fail-loud module-wide:** a foreign-currency rate ≠ 1 is rejected at bill / landed-cost / payment (deferred capability). Verify it is rejected cleanly, not silently mis-posted. (Asala is KWD-only, so this should never trigger for this persona.)

### Audit & tenant isolation
- [ ] Every mutation writes an immutable audit-trail record (who/when/what, before/after).
- [ ] All data shown belongs to the current tenant only; no cross-tenant leakage in any list/report/drill-down.
- [ ] Permission checks enforced server-side, not just hidden in the UI. Sensitive actions (void, reverse, approve) gated (PIN / SoD where applicable).

### Period integrity
- [ ] Documents cannot post/void into a **closed period**; the guard is server-side and gives a clear message.

---

## Cross-cutting systemic findings (check these on EVERY screen)

Recurred across nearly every accounting/inventory screen; check proactively on every purchase screen too:

1. **Hardcoded currency defaults** (USD/SAR) instead of `useTenantCurrency()`.
2. **2dp formatting** instead of dynamic precision — reuse `apps/web/src/lib/currency-precision.ts`; never hardcode. Normalize typed int → float on blur.
3. **Redundant module layout header** on sub-pages (section resolver should return `""` for non-section sub-paths).
4. **Free-text inputs that should be searchable pickers** (supplier, item, account, GRN, PO) — reuse existing pickers/endpoints; don't rebuild.
5. **Secondary-language label/placeholder** must be generic via `useBilingualLabels()`, `dir="auto"`, hidden for monolingual tenants.
6. **Toolbar polish**: filter chevron alignment; date-picker icon overlap; missing CSV export on list/report screens.
7. **Defensive UX**: every action needs loading/error/empty/success; destructive actions (void/reverse/delete-draft) need confirmation + data-loss warning; debounce submit; validate client + server.

## Persona note — Al-Asala Auto Parts (Kuwait)

The loaded dataset is **Al-Asala Auto Parts** (`agent-os/customers/kuwait/persona-1-asala-autoparts`): single Kuwait auto-parts shop, **KWD (3dp fils), no VAT**, 2 suppliers (S-001 Gulf Parts Distribution, opening AP KWD 2,400.000; S-002 Shuwaikh Auto Supply, opening AP KWD 1,100.000; **total 2111 opening = KWD 3,500.000**). The owner "places POs verbally / by phone" and mostly just **records a supplier bill when stock arrives** — so the **direct-purchase path (03) and bill (05) are the primary flows**; PO/GRN/landed-cost are exercised for completeness but are not this shop's daily reality. No VAT means **input-VAT lines should be blank/zero** on every purchase document. No PDC, no foreign-currency suppliers — FX fail-loud should never trigger.

## Severity rubric

See [`../README.md`](../README.md). Fix CRITICAL/HIGH immediately; batch MEDIUM/LOW for review (founder generally wants them fixed too).
