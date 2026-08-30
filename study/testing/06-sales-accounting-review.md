# Sales Module — Money-Path Accounting Review

Tenant under test: Gulf Auto Parts Company W.L.L. (Kuwait, KWD 3dp, no VAT, auto-parts pack).
Scope: revenue recognition, COGS, credit notes/returns, invoice void, customer receipts
(+advance/allocation/reversal/FX), receivable write-off, rounding, commit-before-GL, and
boolean-as-quantity. Code read at `erp/apps/api/src/sales/**`,
`erp/apps/api/src/accounting-events/listeners/sales.listener.ts`,
`erp/apps/api/src/journal-entries/journal-posting.service.ts`,
`erp/packages/shared/src/pos-money/**`. All DB access read-only.

**Verdict: no CRITICAL found. 1 MEDIUM-HIGH, 3 MEDIUM, 4 LOW. The sales GL path balance-proves
cleanly and the two defect classes carried over from the Purchase programme (rounded-away GL leg
rejected post-commit; returns relieved at company-wide WAC) are both structurally absent here.**

---

## Empirical baseline (live tenant, read-only)

| Check | SQL | Result |
| --- | --- | --- |
| Ledger identity | `select round(sum(debit-credit),6) from journal_entry_lines` | `0.000000` PASS |
| Per-entry balance | group by `journal_entry_id` having `sum(debit) <> sum(credit)` | 0 rows PASS |
| AR sub-ledger vs open invoices | GL `1131` party-tagged net vs `Σ sales_invoices.balance` per customer, full-join, non-equal rows | 0 rows PASS |
| Party-less AR control lines | `1131` lines with `party_id is null` | `0` PASS |
| AR aging dimension | `1131` lines with `due_date is null` | `0 / 316` PASS |
| COGS vs stock ledger | GL `5100` = `573.582 − 17.880` vs SLE `sale`/`sale_return` totals | `555.702000` = `555.702000` PASS |
| Confirmed sales docs with no JE | invoices / credit notes / posted receipts | `0 / 0 / 0` PASS |
| Currency precision in the GL | `journal_entry_lines` where `debit <> round(debit,3)` | `0` PASS |
| Document totals precision | `sales_invoices` where `total/subtotal/tax_total/balance <> round(·,3)` | `0` PASS |
| Outbox | `accounting_event_outbox group by status` | 1440 completed, 1 failed (**purchase.order `document.amended`, not sales**) |

**Coverage caveat, stated plainly:** all 316 confirmed `sales_invoices` in this tenant are
`is_opening = true` with an `opening_journal_entry_id`. There are **zero app-confirmed sales
invoices, zero credit notes, zero receipt vouchers and zero direct sales** in the live data. Every
`inventory.sale` / `4110` / `4200` / `4300` GL movement present is POS-sourced
(`stock_ledger_entries.source_document_type = 'pos'`). So the numeric reconciliations above prove
the *ledger* and the *AR derivation*, but they cannot exercise the sales invoice/CN/receipt JE
paths — those findings are code-derived and marked as such.

---

## MEDIUM-HIGH

### SAL-01 — The receipt path accepts sub-currency-precision amounts; the write-off path does not. Sub-fils AR sub-ledger ↔ GL divergence. CONFIRMED (code)

- `apps/api/src/sales/receipts/receipt-vouchers.dto.ts:26` → `moneySchema`
  (`apps/api/src/common/money.schema.ts:30`) accepts **up to 6 decimals**:
  `/^\d+(\.\d{1,6})?$/`.
- `apps/api/src/sales/receipts/receipt-vouchers.service.ts` contains **no** `toDecimalPlaces` /
  `currencyDecimals` call anywhere (`grep -n "toDecimalPlaces\|currencyDecimals\|round"` returns
  nothing). `totalAmount` and every `allocatedAmount` are persisted and emitted verbatim at 6dp
  (`receipt-vouchers.events.ts:130`, `:139`).
- The invoice sub-ledger is then moved by the **unrounded** figure:
  `receipt-vouchers.service.ts:523-524`
  `paidAmount: sql\`${paidAmount} + ${amount.toString()}\`` / `balance: ... - ${amount}`.
- But the GL leg is rounded to the currency: `sales.listener.ts:891-898` rounds `allocated` to
  `currencyDecimals(payload.currency)` (3 for KWD) before splitting the AR relief legs, and
  `journal-posting.service.ts:1335-1338` re-rounds every leg to currency precision.

Consequence for a KWD receipt allocating e.g. `5.0005` and `5.0005` to two invoices: the two
invoices' `paid_amount`/`balance` move by `5.0005` each, while GL `1131` is relieved `5.001` and
`5.000`. The **total** still ties, but the **per-invoice** tie the architecture depends on is
permanently broken, and it accumulates.

The fix pattern already exists in this module and was simply not applied here — the write-off
service quantises first:
`apps/api/src/sales/receivable-writeoff/receivable-writeoff.service.ts:141-144`
```ts
const amount = new Decimal(input.amount).toDecimalPlaces(
  currencyDecimals(currency), Decimal.ROUND_HALF_EVEN,
);
```

Mitigations that keep this out of CRITICAL: `apps/web/src/components/money-input.tsx:103,127`
re-formats to the currency's ISO precision on blur, so the shipped UI does not produce these
values; and the posting engine now proactively resolves the 4840 plug for any sub-precision leg
(`journal-posting.service.ts:658-673`), so the entry still posts balanced rather than
dead-lettering. This is an API-boundary defence gap, not a live corruption — no such row exists in
the tenant today (`journal_entry_lines` where `debit <> round(debit,3)` → 0).

---

## MEDIUM

### SAL-02 — `recompute()` writes `balance = total − paidAmount`, omitting `written_off_amount`. CONFIRMED (code + DB)

`apps/api/src/sales/invoices/sales-invoices-totals.ts:340`
```ts
const balance = total.minus(invoice.paidAmount);
```
The live DB constraint is
`sales_invoices_balance_integrity_check CHECK (balance = ((total - paid_amount) - written_off_amount))`.
Any `recompute` pass over an invoice with `written_off_amount > 0` therefore violates the CHECK.
Not currently reachable (write-offs only touch confirmed invoices, `recompute` runs on drafts and
at confirm) and it **fails loud** rather than silently mis-stating AR — which is why this is
MEDIUM not CRITICAL. But the expression is now wrong by construction and will bite the first time
an amend/re-confirm path touches a partially written-off invoice.

### SAL-03 — Sales-invoice discounts never reach the GL; POS discounts do. CONFIRMED (code + DB)

`sales-invoices-events.ts:84-86` — `netRevenue = subtotal − discountTotal`. The listener has no
discount leg (`sales.listener.ts:472-476` credits `revenue` only; the comment at `:83` says so
explicitly). So an invoice discount is *netted into* revenue and is invisible on `4300 Sales
Discounts`. POS, by contrast, posts its order discount as a separate contra-revenue leg — GL `4300`
in this tenant carries `28.690` entirely from POS. Two channels, two GL treatments of the same
economic event. Not a balance error, but Discount/Gross-Margin reports cannot tie to `4300` across
channels, and the trial balance understates both gross revenue and discounts for the sales channel.
Decide one convention.

### SAL-04 — Early-payment discount is dead code on the sales receipt path. CONFIRMED (code)

`sales.listener.ts:877-883` implements a `discount` (contra-revenue 4300) leg for receipts, and
`:922` folds it into the residual. No producer exists: `receipt-vouchers.events.ts:130` and `:234`
hardcode `discountAmount: "0.000000"`, and `grep -n discount receipt-vouchers.service.ts
receipt-vouchers.dto.ts` returns **nothing**. The feature named in the audit brief is therefore
unimplemented, not mis-implemented. Note also that if it *is* wired up later, the existing guard
`if (allocated.greaterThan(totalAmount)) throw` (`receipt-vouchers.service.ts:170`, `:296`, `:470`)
will reject exactly the settle-100-with-95-cash-plus-5-discount case, because it compares
allocations against cash alone rather than cash + discount. Flagging now so the next author does
not ship a half-wired path.

---

## LOW

### SAL-05 — Void restock of a specific-cost (serial) line loses the specific-total anchor. SUSPECTED (code)

Confirm sends `cogsSpecificTotalCost` for serial/amended lines
(`sales-invoices-events.ts:173-175`), so the engine relieves the exact Σ acquisition cost. The void
payload sends only a per-unit `unitCost` (`sales-invoices-void.events.ts:96-98`) and no
`cogsSpecificTotalCost`, so the restock is `round(Σcost/qty, 6) × qty`. For a non-terminating
quotient (Σ = 10 over qty 3) that leaves ~1e-6 of value stranded in inventory. Invisible in a 3dp
GL; real in `item_cost_pools`. Guarded in spirit by `amend-cost-neutrality.spec.ts`.

### SAL-06 — Stale contract comment on `invoicePayloadSchema.functionalCurrency`. CONFIRMED (code)

`sales.listener.ts:156-159` claims `functionalCurrency` is "Required whenever exchangeRate !== 1
(enforced in the handler)". `handleInvoiceConfirmed` (`:437-520`) enforces nothing, and `emitPost`
(`:1193-1239`) never forwards the field. Harmless in fact — the posting engine reads the functional
currency from `legal_entities` (`journal-posting.service.ts:422-425`) — but the comment describes a
guard that does not exist, which is how a future author ships a real gap.

### SAL-07 — Legacy credit-note void re-resolves tax from current config. ALREADY MARKED (code)

`credit-notes.totals.ts:174-184` carries an explicit `ponytail:` note: for credit notes confirmed
before `taxBreakdown` existed, the void reversal re-resolves components against the *current* tax
config anchored to the confirm date. A post-confirm `outputAccountId` remap makes the reversal drift
from what confirm posted. Correctly scoped and documented; zero-impact in Kuwait (no VAT). Listed
only so it is not lost.

### SAL-08 — One failed outbox row, out of scope. CONFIRMED (DB)

`accounting_event_outbox` has 1 `failed` row: `document.amended`, `documentType:
"purchase.order"`, 4 attempts, schema-validation failure. It is an **audit/amend-saga** event, not
an `accounting.post` — no GL impact and not a sales defect. Reported because it will show up in any
outbox health check.

---

## Balance-proofed as CORRECT (genuine positives)

1. **The Purchase CRITICAL is fixed, class-wide.** A GL leg whose value rounds below half a fils is
   now **dropped** and its value absorbed by the functional residual, not rejected post-commit:
   `journal-posting.service.ts:1367-1382` (`return null` on a rounded-away leg) +
   `:899-903` (`.filter(line => line !== null)`) + `:905-910` (still ≥ 2 lines) + `:927-969`
   (materiality-bounded 4840 plug). `:658-673` additionally pre-resolves the plug account for any
   sub-precision leg so a KWD document that has already committed cannot dead-letter.

2. **Sales document totals are currency-quantised, so PUR-017 does not exist here.** Every header
   figure is a sum of per-line tax-engine outputs that were already `bankersRound(·, dp)` with
   `dp = currencyDecimals(invoice.currency)`: `tax-engine.ts:290,298,300,308,316-324` →
   `document-totals.ts:53-76` → `sales-invoices-totals.ts:221-229`. Columns are `numeric(19,6)` but
   hold 3dp values. Empirically: 0 sales invoices with sub-fils totals. Consequently AR
   (= `revenue + tax + deliveryNet`, `sales.listener.ts:456`) is exact at 3dp and the confirm JE
   produces **no** residual and **no** rounded-away leg in KWD.

3. **The Purchase return-cost defect is explicitly avoided in reverse.** `credit-notes.service.ts`
   `readRealizedSaleUnitCosts` (`:1512-1551`) reads the **engine-realized** COGS from the original
   sale's `stock_ledger_entries` (scoped `movement_type='sale' AND source_document_type='inv'`,
   `:1530-1533`), and `resolveReturnCost` (`:1460-1500`) ties a **full-line** return bit-exactly via
   `Σtotal ÷ creditQty` only when `creditQty.equals(saleQty)` (`:1471-1474`), falling back to the
   blended per-unit for partials, then `costAtSale`, then pool WAC — each fallback `logger.warn`s,
   and a zero-cost restock warns loudly rather than passing silently (`:1493`). Company-wide WAC is
   the **last** tier, never the first.

4. **COGS cannot be double-consumed or read as zero.** `sales-invoices-cogs.ts:1-13` documents that
   `costAtSale` is a reporting snapshot only, that the inventory engine owns COGS via the
   `inventory.sale` fan-out, and that the frozen `materialized_stock_levels.average_cost` must never
   be read (it would book zero COGS on every sale). Cost is read from `item_cost_pools` via the one
   shared reader. Empirically COGS ties: GL `5100` `555.702000` = SLE `573.582 − 17.880`.

5. **Void nets to exactly zero by construction.** `sales-invoices-void.events.ts:83-86` reverses off
   the **immutable stored** `subtotal − discountTotal` and `deliveryFeeNet` (never re-derived), at
   the invoice's **own booked** `exchangeRate` (`:74`), with `occurredAt` = the **original confirm
   date** (`:76`) so the contra lands in the same period; the listener mirrors every leg including
   `delivery_income` (`sales.listener.ts:561-567`). Serials are restored inside the void tx before
   any posting, and the sale_return relieves at the engine-realized original cost.

6. **AR is genuinely derived from the party-tagged GL, and the DB enforces it.** Live triggers:
   `jel_party_on_subledger_control_trg` (party mandatory on sub-ledger control accounts),
   `trg_journal_entries_immutable` / `trg_journal_entry_lines_immutable` (no UPDATE/DELETE on the
   ledger), `trg_jel_totals_match_deferred` (header ↔ lines at commit),
   `trg_prevent_hard_locked_period`, plus
   `je_posted_balanced_check CHECK (total_debit = total_credit)`. An unbalanced or party-less posted
   entry is structurally unreachable, independent of application code.

7. **Multi-currency fails loud, in the right direction.** Sales *invoices* allow foreign currency
   (booked in document currency at the document's own rate, `sales.listener.ts:36-47`); credit notes
   against a foreign-currency invoice are **blocked** with an explicit reason rather than mis-posted
   (`credit-notes.service.ts:471-476`); cross-currency settlement is **blocked**
   (`receipt-vouchers.service.ts:500-506`); a receipt in the functional currency must carry rate 1
   (`:150-160`); and a non-zero realized FX with no `functionalCurrency` throws instead of defaulting
   (`sales.listener.ts:394-408`). Realized FX uses the correct **sales** sign convention
   `allocated × (receiptRate − invoiceRate)`, explicitly contrasted with purchase's inverse
   (`receipt-fx.ts:11-16`), and AR relief is grouped **one leg per distinct invoice booking rate**
   so the per-(party, currency) sub-ledger nets to zero (`sales.listener.ts:345-359`).

8. **Multi-invoice AR splits cannot lose an ulp in KWD.** `roundAllocationGroups` /
   `groupAllocationsByRate` (`sales.listener.ts:329-359`) distribute through the one shared
   largest-remainder helper at the transaction currency's precision, so Σ legs === the allocated
   total exactly. The reversal grouper additionally keys on `(rate, original due date)`
   (`:365-389`) so re-opened receivables resume ageing in their own bucket rather than collapsing
   into one undated leg.

9. **Every fiscal path is period-gated before anything is claimed.** `validatePeriod` runs *before*
   the number reservation and outbox insert on invoice confirm
   (`sales-invoices.service.ts:1337`, `:1646`), receipt post (`receipt-vouchers.service.ts:417`),
   receipt reverse (`:653`, `:1075`) and write-off (`receivable-writeoff.service.ts:150`); soft-lock
   requires an explicit reason plus `assertSoftLockOverrideAllowed`, and the override is threaded to
   the engine so the JE posts rather than dead-letters.

10. **Commit-before-GL is a bounded outbox window, not a hole.** The outbox row is inserted **inside**
    the confirming transaction with the same deterministic `uuidv5` eventId as the post-commit
    fast-path emit (`sales-invoices.service.ts:1506-1556`, `sales-invoices-events.ts:123`), so the
    poller re-drive is idempotent. Empirically zero confirmed invoices / credit notes / posted
    receipts lack a JE. Residual risk: a period closed *between* commit and the async post would
    dead-letter the JE and leave a confirmed document with no GL — inherent to the outbox design,
    monitorable via the `failed` outbox count.

11. **Posted documents are never mutated to correct a price.** `price-edit.service.ts:219-269`
    routes a price correction through a **credit note** (over-charge) or a **debit note**
    (under-charge) — new documents, new JEs — rather than editing a posted invoice.

12. **No float, no boolean-as-quantity, no string-concatenated money SQL.** Every money value is
    `Decimal` (`decimal.config.ts`, `Decimal.set({ precision: 28, rounding: ROUND_HALF_EVEN })` at
    `journal-posting.service.ts:308`). A grep of `apps/api/src/sales` for `parseFloat` / `Number(` /
    `? 1 :` finds only validation predicates and presentation comparisons
    (`invoice-filters.ts:110`, `sales-invoices.dto.ts:53,102,110`), never arithmetic. **Item 8 of the
    brief has no analogue in sales** — I looked for it specifically and did not find one.

13. **The credit-note `applied` / `refundable` split is deliberate, not drift.**
    `credit-notes.service.ts:531-558`: only the slice the invoice balance can absorb moves
    `paidAmount`/`balance`; the excess stands as a customer credit in the party-tagged AR
    sub-ledger until a refund voucher clears it (`sales.listener.ts:944-1006`). This means that once
    credit notes exist in a tenant, GL `1131` will legitimately sit **below** `Σ open invoice
    balances` by the unrefunded credit. Anyone re-running my AR reconciliation query on a tenant with
    credit notes must not read that gap as a defect.

14. **Tax is anchored to the document date, never "now".** `recompute` and `recomputeSummary` have
    **no** `new Date()` default and the reason is documented at `sales-invoices-totals.ts:282-292`;
    the void replays the frozen confirm-time `taxBreakdown` (incl. per-component `accountId`) so a
    later tax-code remap cannot make the reversal drift (`sales-invoices-totals.ts:359-364`).

15. `npx jest sales.listener --no-coverage` → **116 passed** (the ERROR lines in output are an
    intentional negative-path assertion).

---

## Summary

| Sev | ID | Finding | Status |
| --- | --- | --- | --- |
| MED-HIGH | SAL-01 | Receipt path accepts 6dp amounts; sub-ledger moves unrounded while the GL rounds → per-invoice AR divergence. Write-off path quantises, receipts do not. | CONFIRMED (code) |
| MEDIUM | SAL-02 | `recompute()` balance omits `written_off_amount`, contradicting the live CHECK. Fails loud; latent. | CONFIRMED (code+DB) |
| MEDIUM | SAL-03 | Invoice discounts netted into revenue (no `4300` leg); POS posts them separately. Cross-channel GL inconsistency. | CONFIRMED (code+DB) |
| MEDIUM | SAL-04 | Early-payment discount is listener-only dead code; the `allocated > total` guard would reject it if wired. | CONFIRMED (code) |
| LOW | SAL-05 | Void restock drops `cogsSpecificTotalCost` for serial lines → sub-ulp inventory value stranded. | SUSPECTED |
| LOW | SAL-06 | Stale "enforced in the handler" comment on `functionalCurrency`. | CONFIRMED |
| LOW | SAL-07 | Legacy-CN void re-resolves tax from current config (already `ponytail`-marked). | ALREADY MARKED |
| LOW | SAL-08 | 1 failed outbox row — purchase `document.amended`, no GL impact. | CONFIRMED (DB) |

**No CRITICAL.** Do not "fix" the AR-vs-invoice-balance gap that credit notes create (positive 13),
and do not port purchase's FX fail-loud onto sales invoices (positive 7) — both are correct by
design.
