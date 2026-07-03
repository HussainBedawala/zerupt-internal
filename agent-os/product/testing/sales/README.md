# Sales Module — Testing Index

> **Persona for the whole module: a shopkeeper / counter salesperson who sells stock and is owed money by customers.** Assume the person touching these screens either rings up a quick over-the-counter sale, or raises a sales order → invoices (which relieves stock) → collects payment from trade customers. They are NOT an accountant — but they care intensely that the system knows **exactly what each customer owes them**, never lets them **sell stock they don't have** (or sell it below cost by accident), never **collects the same invoice twice**, and always **relieves the right stock at the right cost**. At every screen ask: **"what's the dumbest thing a salesperson could do here?"** (sell more than in stock, invoice before delivery, take payment twice, give change on a card, void a paid invoice, sell in the wrong currency).

Sales is the **mirror of purchase**: customer/AR not supplier/AP, **output** VAT not input, **revenue + COGS-on-sale** not inventory receipt, **money IN** not OUT. It is a **dual-path** module with an **AR subledger derived from the ledger**:

- **Two first-class paths to the same GL outcome:** (a) the **express direct / counter sale** (`POST /sales/direct-sales` — atomic invoice + receipt in one call, no SO) and (b) the full **SO → invoice → receipt** chain. Both must post identical, correct journals + stock relief for the same economic event.
- **AR is subledger-of-record derived from the immutable, party-tagged `1131` (Accounts Receivable) GL.** What a customer owes equals the sum of party-tagged AR (`1131`) journal lines for that customer. The AR subledger view is a *read* of the ledger, never a separately-maintained number that can drift. The **reconcile invariant** — Σ open invoice balances per customer = customer's 1131 balance — must HOLD after every invoice / receipt / credit note / reversal / void.
- **Sales auto-posts to the GL and to inventory** (event-driven). **There is no separate delivery/fulfillment document** — confirming a sales **invoice** emits `sales.invoice.confirmed`, and (a) the inventory listener creates the SALE stock movement + books **COGS** at the engine-realized cost (Cr Inventory), while (b) the accounting listener posts **AR + revenue + output VAT**. Receipt settles AR. Correctness depends on **both** the screens here **and** the journals + stock ledger entries flowing out of those events.
- **Never a dead-end:** every posted document is reversible (SO cancel, invoice void, credit note, receipt reversal/re-allocation, write-off) — idempotent, net-zero contra, period-gated. A user who did the wrong thing must always have a clean way out.

## Submodule checklists (run in order — dependencies flow downward)

> Customer master must be correct before any document; SO/direct before invoice; invoice (which relieves stock) before receipt/credit-note; everything before AR aging + cross-module.

| # | Submodule | Route |
|---|-----------|-------|
| 01 | [Customers / AR Master](01-customers.md) | `/sales/customers`, `/sales/customers/new`, `/sales/customers/[id]` |
| 02 | [Sales Orders](02-sales-orders.md) | `/sales/orders`, `/sales/orders/new`, `/sales/orders/[id]` |
| 03 | [Direct / Express Sale](03-direct-sale.md) | `/sales/direct/new` |
| 04 | [Sales Invoices (+ stock relief + COGS + output VAT)](04-sales-invoices.md) | `/sales/invoices`, `/sales/invoices/new`, `/sales/invoices/[id]` |
| 05 | [Payments Received / Collections](05-payments-received.md) | `/sales/payments`, `/sales/payments/[id]` (API `tenant/sales/receipt-vouchers`) |
| 06 | [Credit Notes / Sales Returns](06-credit-notes.md) | `/sales/credit-notes`, `/sales/credit-notes/new`, `/sales/credit-notes/[id]` (API `tenant/sales/credit-notes`) |
| 07 | [Receivable Write-offs](07-receivable-writeoff.md) | API `tenant/sales/receivable-write-offs` — no dedicated route (owner-rare) |
| 08 | [AR Aging / Overview](08-ar-aging-overview.md) | `/sales` (overview hub) |
| 09 | [Cross-module Contracts](09-cross-module-contracts.md) | GL / inventory / reports handoffs |

Findings: [`_findings.md`](_findings.md)

---

## Cross-cutting sales invariants (apply to EVERY submodule)

These must hold no matter the dataset. If any fails anywhere, it is at least HIGH, usually CRITICAL.

### AR subledger integrity (subledger derived from GL)
- [ ] **AR = party-tagged 1131 ledger.** For every customer, the balance owed to the business equals the sum of party-tagged Accounts Receivable (`1131`) journal lines for that customer. The AR subledger view is a read of the ledger, never a separately-maintained number that can drift.
- [ ] **Reconcile invariant HOLDS after every action:** Σ (open invoice balances per customer) = customer's 1131 balance; Σ all customers = total 1131 in the GL, after every invoice / receipt / credit note / reversal / void.
- [ ] **Documents are immutable once posted** — a posted SO/delivery/invoice/receipt/credit-note cannot be edited into a different amount or deleted; it is reversed by a new mirrored document (never a hard delete of history).
- [ ] **No partial posts:** a document either fully posts (subledger + GL + stock + audit) or not at all (atomic). A failed post leaves nothing behind.

### Dual-path equivalence
- [ ] **Direct sale and SO→invoice post identical GL + stock relief + COGS** for the same economic event (same goods, same price). No path produces a different inventory value, COGS, revenue, or AR balance.
- [ ] Each document links back to its source (invoice→SO; receipt→invoice; credit-note→invoice) and every link resolves.

### GL posting (ties to accounting) — every document posts the CORRECT, balanced journal
- [ ] **Sales invoice confirm (stock relief + COGS):** the `sales.invoice.confirmed` event books Dr COGS (at engine-realized cost — WAC/FIFO), Cr Inventory, and creates the SALE stock movement at the same cost. **Cannot sell more than on hand** — oversell is blocked before revenue/AR post (rolls back cleanly). COGS/stock relief posts **exactly once** per confirm, never double.
- [ ] **Sales invoice (AR side):** Dr Accounts Receivable (`1131`, party-tagged), Cr Revenue + Cr output VAT (if any).
- [ ] **Direct / express sale (invoice + relief in one):** Dr AR (or Cash/Bank if paid on the spot) + the COGS/inventory relief + revenue + output VAT — in balanced entries for one economic event.
- [ ] **Receipt / collection:** Dr Cash/Bank, Cr Accounts Receivable (`1131`, party-tagged). Allocations reduce the specific open invoices.
- [ ] **Sales return / credit note:** reverses the original — Cr AR (or refund Cash), Dr Revenue + output-VAT reversal; **stock returns to inventory (Dr Inventory, Cr COGS) at the original realized cost**; net-zero contra to the original posting.
- [ ] Failed auto-postings land in the dead-letter queue / durable outbox (nothing silently dropped — see the outbox suppressErrors gap that once marked rows complete with no GL).

### Payment safety (the "collect twice" guard)
- [ ] **An invoice can never be over-allocated / over-collected:** total receipts + credit notes allocated to an invoice ≤ invoice total; the open balance floors at zero and never goes negative.
- [ ] **Reversals are idempotent:** reversing an already-reversed document is a safe no-op, not a double-reversal.
- [ ] **Credit-limit block (if enabled):** a sale that would push a customer past their credit limit is hard-blocked in-transaction (no TOCTOU race) unless overridden with the dedicated permission + reason. (Asala does not use credit limits — verify it is simply not enforced, not silently ignored where it should apply.)

### Currency & precision
- [ ] All amounts display in the **tenant functional currency** (never hardcoded USD/SAR) at the **currency's precision** (KWD = 3dp) via the shared `currency-precision` util — never hardcoded 2 or 3.
- [ ] **FX is fail-loud module-wide:** a foreign-currency rate ≠ 1 is rejected at invoice / receipt / credit-note (deferred capability). Verify it is rejected cleanly, not silently mis-posted. (Asala is KWD-only, so this should never trigger for this persona.)

### Audit & tenant isolation
- [ ] Every mutation writes an immutable audit-trail record (who/when/what, before/after).
- [ ] All data shown belongs to the current tenant only; no cross-tenant leakage in any list/report/drill-down.
- [ ] Permission checks enforced server-side, not just hidden in the UI. Sensitive actions (void, reverse, credit-limit override, price override) gated (PIN / SoD / signed token where applicable). Cashier role should NOT see cost/COGS or margin.

### Period integrity
- [ ] Documents cannot post/void into a **closed period**; the guard is server-side and gives a clear message. `validatePeriod` runs before every posting.

---

## Cross-cutting systemic findings (check these on EVERY screen)

Recurred across nearly every accounting/inventory/purchase screen; check proactively on every sales screen too:

1. **Hardcoded currency defaults** (USD/SAR) instead of `useTenantCurrency()`.
2. **2dp formatting** instead of dynamic precision — reuse `apps/web/src/lib/currency-precision.ts`; never hardcode. Normalize typed int → float on blur.
3. **Redundant module layout header** on sub-pages (section resolver should return `""` for non-section sub-paths).
4. **Free-text inputs that should be searchable pickers** (customer, item, account, invoice, SO) — reuse existing pickers/endpoints; don't rebuild.
5. **Secondary-language label/placeholder** must be generic via `useBilingualLabels()`, `dir="auto"`, hidden for monolingual tenants.
6. **Toolbar polish**: filter chevron alignment; date-picker icon overlap; missing CSV export on list/report screens.
7. **Defensive UX**: every action needs loading/error/empty/success; destructive actions (void/reverse/delete-draft) need confirmation + data-loss warning; debounce submit; validate client + server.

## Persona note — Al-Asala Auto Parts (Kuwait)

The loaded dataset is **Al-Asala Auto Parts** (`agent-os/customers/kuwait/persona-1-asala-autoparts`): single Kuwait auto-parts shop, **KWD (3dp fils), no VAT**, 4 customers — 3 trade accounts + Walk-in (C-001 Al Salam Garage, opening AR KWD 250.000; C-002 Speed Motors, no opening; C-003 Bader Auto Service, opening AR KWD 120.500; C-004 Walk-in, no balance; **total 1131 opening = KWD 370.500**). The shop sells **face-to-face at the counter** and does not issue formal A4 invoices, quotations, SOs, or delivery notes — so the **direct / express counter sale (03) is the primary flow**, and most collection is immediate (cash / KNET). Trade accounts occasionally buy on credit → AR + receipts (06). SO/delivery are exercised for completeness but are not this shop's daily reality. **No VAT means output-VAT lines should be blank/zero** on every sales document. No FX, no credit limits, no loyalty. **The cashier role must NOT see cost prices or margin.**

## Severity rubric

See [`../README.md`](../README.md). Fix CRITICAL/HIGH immediately; batch MEDIUM/LOW for review (founder generally wants them fixed too).
