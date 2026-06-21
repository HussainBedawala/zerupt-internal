# 09 — How Zerupt Implements Layer 5

## Reading the code

This chapter maps the concepts from chapters 00–08 to the actual files in the codebase as
they stand after the 2026-06-21 hardening pass (branch `phase-2/layer-5-closeouts`, merged
to main).

All paths are relative to `erp/apps/api/src/` unless otherwise noted.

---

## 1. Profit & Loss

### File
`reports/profit-and-loss.service.ts`

### What it computes
P&L is a **flow report**: it sums income and expense `journal_entry_lines` whose
`postingDate` falls within `[periodStart, periodEnd]` (both ends inclusive). It reads
functional-currency `debit`/`credit` columns (NOT the transaction-currency `debitTC`/
`creditTC`), so the result is always in the entity's functional currency.

### Sign convention — driven by account type, not normalBalance

```typescript
// profit-and-loss.service.ts:50-54
function signedAmount(row): Decimal {
  if (row.type === "income")   return new Decimal(row.credit).minus(row.debit);   // credit-normal
  if (row.type === "expense")  return new Decimal(row.debit).minus(row.credit);   // debit-normal
  return Decimal(0);
}
```

Sign is keyed on `type`, not `normalBalance`. A contra-income account (`type=income`,
`normalBalance=debit`) still gets `credit − debit`, which yields a negative number for a net
debit balance — correctly reducing revenue. Do not change this to use `normalBalance`; doing
so would break contra netting.

### Classification by subType — no code-prefix matching
- Revenue lines: all rows with `accounts.type = "income"` (regardless of sub-type), shown as revenue.
- COGS lines: `type = "expense"` AND `subType = "cost_of_sales"`.
- OPEX lines: `type = "expense"` AND `subType` ∈ the other four expense sub-types
  (`operating_expense`, `financial_expense`, `depreciation_amortisation`, `other_expense`).
- Unknown expense sub-type → excluded from buckets, logged as a `warn` so a mis-seeded COA
  surfaces in monitoring rather than silently corrupting net profit.

Classification uses enum-constrained columns from the schema, not account code prefixes.
Any validly-seeded COA is handled correctly.

### Ties to the trial balance
Both reports:
- Apply `BALANCE_AFFECTING_JE_STATUSES = ["posted", "reversed"]` (from `reports/constants.ts:15`).
- Sum leaf accounts only (`accounts.isHeader = false`).
- Use the same functional-currency debit/credit columns.

P&L `netProfit = Σ income(credit − debit) − Σ expense(debit − credit)` exactly equals the
income-and-expense portion of the trial balance. No divergence in rules.

### Closing-JE exclusion (hardening fix)
The year-end closing entry sweeps every income/expense account to Retained Earnings. If it
were included in a period-to-date P&L, all income and expense would net to zero — producing
a silently wrong zero-profit report.

After hardening, the P&L excludes closing JEs via a subquery matching the CFS pattern:

```typescript
notInArray(
  journalEntries.id,
  sql`(select closing_entry_id from fiscal_years
       where legal_entity_id = ${query.legalEntityId}
         and tenant_id       = ${tenantId}
         and closing_entry_id is not null)`
)
```

`legalEntityId` is required by the DTO, so the subquery is always entity-scoped. The `IS NOT
NULL` guard inside the subquery prevents the NOT-IN-NULL trap (a NULL in the list would exclude
all rows). An empty subquery (no closing entry yet) → excludes nothing. Correct.

The same exclusion now applies to both P&L and Cash Flow Statement, so the two reports'
`netProfit` figures agree for the same date range within a single fiscal year.

### Date column alignment (hardening fix)
Before hardening, P&L date-scoped on `journalEntries.postingDate`; the trial balance
scopes on `journalEntryLines.postingDate`. Both columns are identical in practice (the posting
engine denormalizes the header date to each line), but after hardening, P&L also scopes
on `journalEntryLines.postingDate` — matching the trial balance exactly. If the denormalization
invariant is ever violated, both reports still scope the same line set.

---

## 2. Balance Sheet

### File
`reports/balance-sheet.service.ts`

### What it computes
The balance sheet is a **stock report**: it sums all `journal_entry_lines` with
`postingDate ≤ asOfDate` (no lower bound — cumulative from inception). This captures every
opening balance, period posting, and year-end close entry.

Net income from unclosed income/expense accounts is rolled up into equity, producing the
full accounting equation:

```
Assets = Liabilities + Equity + NetIncome(current period)
```

### Contra-asset sign — driven by account type (hardening fix, HIGH-1)

Before hardening, `closingBalance()` keyed sign off `row.normalBalance`. A contra-asset
(e.g. Accumulated Depreciation, `type=asset`, `normalBalance=credit`) returned
`credit − debit` = a positive number, which was then pushed into the asset section as a
positive addition — **overstating total assets by 2× accumulated depreciation**.

After hardening:

```typescript
// balance-sheet.service.ts:58-80
function closingBalance(row): Decimal {
  if (row.type === "asset" || row.type === "expense")
    return new Decimal(row.debit).minus(row.credit);    // debit-positive
  return new Decimal(row.credit).minus(row.debit);      // credit-positive
}
```

A contra-asset (`type=asset`, net credit balance) now yields `debit − credit < 0`, correctly
reducing net PP&E. The accounting equation holds: by double-entry identity, `Σ(debit − credit)`
for assets plus `Σ(debit − credit)` for expenses equals `Σ(credit − debit)` for liabilities,
equity, and income — so `isBalanced` remains `true` after the fix.

### Net-income rollup to equity
Income and expense accounts are included in the balance query (no period boundary — only the
`asOfDate` upper bound). The income fold is:

```typescript
// balance-sheet.service.ts:200-211
case "income":  equityLines += closingBalance(row);   // adds credit-positive income
case "expense": equityLines -= closingBalance(row);   // subtracts debit-positive expense
```

The resulting `currentPeriodNetIncome` (cumulative net income since last close) is folded
into `totalEquity`. For a period equal to inception..asOfDate, BS net income equals P&L
`netProfit` exactly on a correctly-seeded COA.

### Accounting equation check
```typescript
// balance-sheet.service.ts:236-238
const residual = Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome));
isBalanced = residual < BALANCE_TOLERANCE (1e-6);
```

This check CANNOT catch the pre-fix contra sign bug (which was sign-consistent across both
sides of the equation). It CAN catch a genuine `postDirect` bypass or a logic regression that
breaks the double-entry identity. It is a real test, not vacuous.

### Status filter and isolation
Same as P&L and TB: `BALANCE_AFFECTING_JE_STATUSES`, leaf-only, defense-in-depth tenant
isolation on lines + headers + accounts + legalEntityId.

---

## 3. Cash Flow Statement (indirect method)

### File
`reports/cash-flow-statement.service.ts`

### Method
**Indirect** — starts with net profit, adds back non-cash items and working-capital movements,
then derives investing and financing flows.

### Reconciles by construction
The engine is movement-based. For every leaf account it computes:

```
signedMovement = (closing − opening), debit-positive
```

Movements are mapped:
- P&L accounts → fold into `netProfit`
- Cash-equivalent accounts → accumulate the cash pool (`closingCash − openingCash`)
- All other BS accounts → `amount = −movement` (the offsetting cash impact)

Because `Σ(all signed movements) = 0` by double-entry, and the cash pool is
`closingCash − openingCash`, summing all non-cash-pool impacts necessarily equals
`closingCash − openingCash`. The engine verifies this:

```typescript
// cash-flow-statement.service.ts:279-281
const residual = cashDelta.minus(netChangeInCash).abs();
reconciles = residual.lte(RECONCILE_EPSILON);
```

`reconciles=false` is surfaced (flag + server warn), not swallowed.

### Closing-JE exclusion
Year-end closing entries are excluded from BOTH the opening and closing snapshots
(symmetric). This is correct for within-FY periods: income/expense movements cancel
on both snapshots and the closing entry does not distort net profit. The P&L report
(after hardening) applies the same exclusion, so the two reports' `netProfit` agrees
for the same single-FY window.

### effectOfFxOnCash — IAS 7.28 compliance (hardening addition)

IAS 7 requires the effect of exchange rate changes on foreign-currency cash to be presented
as a **separate reconciling line**, not folded into operating flows.

The FX revaluation JE (posted by `fx-revaluation.service.ts`) writes one offset leg directly
to the revalued account (denominated in functional currency), and one gain/loss leg to
4830/7220 (a P&L account). For a foreign-currency cash account, the offset leg is the ONLY
functional-currency line touching that account — every genuine receipt/payment on a foreign
cash account is denominated in the foreign currency.

The implementation splits each cash-equivalent account's aggregate into:
- `funcMovement` — lines where `currency = functionalCurrency` (the reval offset)
- `foreignMovement` — lines where `currency ≠ functionalCurrency` (genuine cash flows)

```typescript
// cash-flow-statement.service.ts (classifyMovements)
effectOfFxOnCash += account.funcMovement  // only for cash-equiv accounts with foreign activity
operatingTotal   -= effectOfFxOnCash      // remove from operating
netChangeInCash  stays identical           // adds back below financing
```

The statement still foots exactly. For single-currency tenants, no cash-equivalent account
has foreign-currency activity, so `effectOfFxOnCash = 0` and all 32 pre-existing tests pass
byte-identically.

The DTO exposes `effectOfFxOnCash: string` (functional currency, 6 dp).

### BS↔CFS cash reconciliation (hardening pin)
The CFS cash pool uses `isCashEquivalent=true` (derived from group anchors 1110/1120 +
overdraft 2220). The balance sheet classifies by `type/subType`, not `isCashEquivalent`.
This means bank overdrafts (2220, a liability) are IN the CFS cash pool but in liabilities
on the BS. Per IAS 7, this is correct — overdrafts repayable on demand are cash equivalents.

The reconciling relationship is:

```
CFS closingCash = Σ(cash-equiv asset balances) − Σ(cash-equiv liability balances)
               = BS cash − overdraft
```

A pinning test (test 26 in `cash-flow-statement.service.spec.ts`) asserts this relationship
for a bank 800 + overdraft 300 scenario: `closingCash = 500`, `reconciles = true`.

---

## 4. GL-native multi-currency AR/AP aging

### Files
`reports/ar-aging.service.ts`, `reports/ap-aging.service.ts`

### The fundamental shift — from invoices to the GL

Before hardening, both aging reports read `salesInvoices.balance` / `purchaseInvoices.balance`
— denormalized functional-currency columns maintained by allocation logic. This had three
structural defects:

1. **Did not tie to the TB control account.** The reconciliation service's `glOpDrift` measured
   precisely the gap between aging total and GL control balance.
2. **Missed opening-import items.** Party lines imported via `opening-balance.service.ts` carry
   no `sales_invoices` row; the old aging silently dropped them.
3. **No per-currency breakdown.** A customer invoiced in USD and KWD had both collapsed into one
   functional-currency row — impossible to show "owes USD 5,000 and KWD 1,500".

After hardening, both reports derive directly from `journal_entry_lines` on the AR/AP control
account, with no join to the invoice tables.

### Query shape

The control account is resolved by system role (never hardcoded):

```typescript
// resolveControlAccountIds (ar-aging.service.ts)
SELECT account_id FROM account_system_roles
WHERE tenant_id = $t AND role_key = 'trade_receivables'
  [AND legal_entity_id = $e]
-- innerJoin accounts: AND accounts.tenant_id = $t   ← defense-in-depth guard
```

The main aggregate:

```sql
SELECT jel.party_id, customer.name, customer.code,
       jel.currency,
       SUM(jel.debit_tc  - jel.credit_tc)::text  AS net_tc,
       SUM(jel.debit     - jel.credit)::text      AS net_func,
       ($asOf::date - jel.due_date)               AS age_days   -- parameterized
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
LEFT JOIN sales_customers ON id = jel.party_id
WHERE jel.tenant_id = $t AND je.tenant_id = $t
  AND je.status IN ('posted','reversed')           -- BALANCE_AFFECTING_JE_STATUSES
  AND jel.account_id IN (controlAccountIds)
  AND jel.party_id IS NOT NULL
  [AND je.legal_entity_id = $e] [AND jel.branch_id = $b]
GROUP BY jel.party_id, customer.name, customer.code, jel.currency, age_days
```

AP mirrors with `trade_payables` and `SUM(credit_tc − debit_tc)` (credit-normal).

**Key correctness properties:**
- `party_id IS NOT NULL` drops no control-account amount, because the posting chokepoint
  (`validatePartyContract`) REQUIRES a party on every control-account line. Every
  `trade_receivables` / `trade_payables` line carries a party by invariant.
- `grandTotalFunctional = Σ net_func` = `Σ(debit − credit)` on the control account = TB
  control line. Ties by construction, drift = 0.
- Per-row amounts are in transaction currency (per-currency breakdown). Bucket totals and
  `grandTotalFunctional` are functional (cross-currency sums are meaningless in TC).

### due_date dimension — migration 0106

The aging query buckets by `jel.due_date`. This column did not exist before hardening.

**Migration `0106_layer5_jel_due_date.sql`** adds:

```sql
ALTER TABLE "journal_entry_lines" ADD COLUMN IF NOT EXISTS "due_date" date;
```

Backfill (idempotent, `WHERE due_date IS NULL`):
- AR control lines ← `sales_invoices.due_date` via `journal_entries.source_document_id`
- AP control lines ← `purchase_invoices.due_date` via the same path
- Control accounts resolved by system role (`account_system_roles` + `is_control_account`),
  never hardcoded codes.

Posting plumbing (threaded through):
- `build-je-payload.ts → JeLineInput` gains `dueDate?` + `sourceDocumentDate?`
- `eventLineSchema` in `journal-entries.dto.ts` gains both fields
- `journal-posting.service.ts → postDirect` writes `dueDate` to the insert
- Listeners:
  - `sales.listener.ts` — sets `dueDate` + `sourceDocumentDate` on the AR control line
  - `purchase-accounting.listener.ts` — sets both on the AP payable line
  - POS (`build-pos-transaction-post.ts`) — sets `sourceDocumentDate` only (no payment terms)
  - Cheque listener — both left null (relief/settlement; no due date load-bearing)
- Opening-balance service — sets `dueDate` on AR/AP opening JE lines from the imported balance

### Report-side FIFO settlement (reviewer-added)

The raw GL aggregate produces one row per `(party_id, currency, age_days)` combination. A
partial payment posts a credit to the control account with ITS OWN `due_date` (often NULL →
current), not applied against the oldest open invoice.

A FIFO settlement layer in `buildResponse` resolves this:

```typescript
// settleAndBucket() per (party, currency)
// charges = residuals with tc > 0, sorted OLDEST-FIRST (largest ageDays first)
// credits = residuals with tc < 0 (payments, credit notes, usually null due_date)
// apply credits oldest-first; surviving residual bucketed by its own due_date
// leftover credit (overpaid party) → negative current bucket
```

This ensures a payment is applied to the oldest open invoice balance, not to the current
bucket, producing accountant-expected aging distributions. The per-party net (TC and functional)
is preserved exactly, so `grandTotalFunctional` is unaffected.

### Performance indexes — migration 0107

`0107_layer5_report_indexes.sql` adds four covering indexes identified as missing by the audit:

| Index | Covers |
|-------|--------|
| `jel_control_party_aging_idx` on `(account_id, party_id, currency) WHERE party_id IS NOT NULL` | Aging control-account + party filter |
| `jel_posting_date_functional_idx` on `(tenant_id, account_id, posting_date)` | P&L / BS date-range scans |
| `je_legal_entity_status_idx` on `(legal_entity_id, status, posting_date)` | Cross-entity report joins |
| `je_source_doc_idx` on `(source_document_id, tenant_id)` | Backfill + closing-JE subquery |

These are safe to add at any time (B-tree, concurrent build, no lock on data).

---

## 5. AR write-off path (new feature)

### Files
`sales/receivable-writeoff/receivable-writeoff.{service,controller,dto}.ts`
`sales/receivable-writeoff/receivable-writeoff.service.spec.ts`

### What it does
An authorized user writes off an uncollectible customer receivable. The journal entry is:

```
DR 6430  Impairment Loss on Trade Receivables   (expense, operating_expense)
CR 1131  Trade Receivables                       (AR control, party-tagged)
```

Account 6430 already exists in the base COA template (IFRS 9 ECL expense leg). It is
resolved by account mapping (`lineType = bad_debt → 6430`), never hardcoded.

### Architecture
The service builds an outbox payload and emits `sales.receivable.writeOff` →
`SalesAccountingListener.handleReceivableWriteOff` → maps `bad_debt` (DR) + `receivable`
(CR, with `partyType=customer`, `partyId`) → emits `accounting.post` →
`JournalPostingService.postFromEvent`. The event path sets `blockControlAccounts: false`
(the engine IS allowed to post to the AR control account with a party — the same gate
that sales invoices, receipts, and FX revaluation go through).

**Migration `0108_layer5_bad_debt_writeoff_mapping.sql`** inserts:
- `bad_debt → 6430` mapping (for event type `sales.receivable.writeOff`)
- `receivable → 1131` mapping

### Permission gating and audit

```
@RequiresPermission("sales.receivable.write-off")   — added to permissions.ts
OWNER_ONLY_KEYS                                      — cashier cannot write off; Owner bypasses
@Audited + explicit auditLog.append                  — who/when/amount/customer/reason/currency/rate
@Throttle(5/min)
```

The `sales.receivable.write-off` permission key is in `OWNER_ONLY_KEYS` in
`packages/shared/src/permissions.ts`. A finance role may be granted it explicitly.

### Correctness and defensive checks
- **Cannot write off more than the open balance** — open balance re-read inside the
  transaction via the same GL party-sub-ledger query that aging uses. `Σ(debit − credit)`
  on the AR control for `(customerId, currency)`.
- **Cannot write off when balance = 0** — explicit guard.
- **Multi-currency** — write-off is in a specific currency at a specific exchange rate.
  Foreign-currency write-offs require a rate; functional-currency write-offs must supply
  rate = 1. Both JE legs are consistent in TC and functional.
- **Idempotent** — deterministic `eventId` (UUIDv5 of customer|currency|date|amount or
  caller-supplied `idempotencyKey`). Duplicate emit → existing JE returned, no double-post.
- **Race-safe** — open-balance read + outbox insert in one transaction.

After the write-off JE is posted, the customer's AR control balance decreases by the
write-off amount. Because aging derives from the same GL control lines, the amount drops
out of aging automatically with no separate invoice-table update.

---

## 6. Purchase-return two-JE clearing redesign

### Files affected
`accounting-events/listeners/purchase-accounting.listener.ts`
`inventory/inventory-event.listener.ts`
`packages/db/drizzle/0109_layer5_purchase_return_clearing.sql`

### Why the old design was wrong

Before hardening, the purchase-return listener posted a single JE:

```
DR  Accounts Payable / Accrual     (supplier credit amount incl. tax)
CR  Inventory (1141)               at document unit cost (NOT engine WAC)
CR/DR variance → COGS (5100)      price plug
```

Two defects: (1) inventory was relieved at the document cost, not the engine's
weighted-average cost (WAC) — breaking the GL = stock-ledger invariant; (2) the variance
was misclassified as COGS (5100) rather than a purchase price variance.

Additionally, the inventory engine's `applyOutbound(purchase_return)` also emitted an
`inventory.purchase_return` event, but no account mapping existed for it — that leg was
dead-lettering to the DLQ with no one noticing.

### New design — two self-balancing JEs through account 1192

**AP-side JE** (owned by `PurchaseAccountingListener`):

```
DR  Trade Payables (2111, supplier-party) / Accrual (2121)  ← supplier credit incl. tax
DR/CR  Purchase Price Variance (5210)                        ← price-net − doc cost
CR  Purchase Return Clearing (1192)                          ← at DOCUMENT cost (ex-tax)
CR  Input Tax (reverse)                                      ← tax legs unchanged
```

**Inventory-side JE** (owned by `InventoryEventListener.buildCogsPayload`):

```
DR  Purchase Return Clearing (1192)    ← at DOCUMENT cost (ex-tax)
CR  Inventory (1141)                   ← at ENGINE WAC cost
DR/CR  Purchase Price Variance (5210)  ← doc cost − WAC cost
```

Clearing (1192) carries the document cost on BOTH sides → nets to zero across the two JEs.
Total variance = `(price-net − WAC)` across the two 5210 legs. Inventory is relieved at
WAC, preserving `GL inventory balance = Σ(on_hand × WAC)` exactly.

**Accounts added by migration 0109:**
- `1192` Purchase Return Clearing — `asset / current_asset`, system-owned, **non-monetary**
  (IS 21 does not retranslate clearing accounts), parent 1190
- `5210` Purchase Price Variance — `expense / cost_of_sales`, parent 5000

Both are resolved by account mapping (`purchase.return.confirmed / purchase_return_clearing → 1192`,
`purchase.return.confirmed / purchase_variance → 5210`, and the mirror inventory event mappings).

The old `cogs_adjustment → 5100` mapping for returns is removed.

---

## 7. Key correctness invariants — the complete set for Layer 5

| Invariant | Mechanism |
|-----------|-----------|
| P&L ties to TB income+expense portion | Same status filter, same leaf columns, same date-scoping column (post-fix) |
| P&L excludes year-end closing entry | `NOT IN (closing_entry_id subquery)`, also applied to CFS |
| BS equation holds (Assets = Liab + Equity + NI) | `isBalanced` check; sign driven by type (post-fix) |
| BS contra-asset reduces, not adds | `closingBalance` now type-driven, not normalBalance-driven |
| CFS reconciles by construction | Movement-based engine; independent cash-delta cross-check |
| effectOfFxOnCash ties exactly | Extracted from already-reconciled operating; footing unchanged |
| BS↔CFS cash reconciliation | Pinning test + IAS 7 comment; overdraft in both pools by design |
| AR/AP aging ties to TB control | GL-native; `grandTotalFunctional = Σ(debit−credit) on control account` |
| Aging includes opening-import items | Opening-balance service sets `dueDate` on JE lines; no invoice row needed |
| Aging FIFO settlement correct | Oldest-charge-first credit application; per-party net preserved |
| Write-off relieves GL AR sub-ledger | CR 1131 with party; same data source as aging → drops from aging automatically |
| Purchase-return inventory at WAC | Two-JE clearing; inventory JE uses `costResult.totalCost` from engine |
| Clearing (1192) nets to zero | Same doc cost on both sides; variance classified to 5210, not COGS |
| No SQL injection in aging | `sql.raw` removed; `asOf::date` is a bound parameter |

---

## The mental model

> Layer 5 is where the ledger is read, not written. Every number in every report traces back
> to `journal_entry_lines` through the same status filter, the same functional-currency columns,
> and the same leaf-account restriction that the trial balance uses. The P&L shows flows;
> the balance sheet shows stocks; the cash flow statement shows what moved cash. All three
> derive from the same rows — their differences are only in date scoping (flow vs. stock),
> account classification (income/expense vs. asset/liability/equity), and the cash-pool
> definition. The aging report is the per-party, per-currency drill-down of the AR/AP control
> account balance: because every control-account line must carry a party (enforced by the
> Layer-3 posting invariant), the sum of all aging buckets equals the control-account balance
> on the trial balance, to the cent, by construction. Three features shipped in this pass
> close the gaps that Layer 3 and 4 left open: write-offs now have a permissioned, audited,
> idempotent path through the outbox (the only correct way to relieve AR); purchase returns
> now relieve inventory at engine WAC through a clearing account, not at document cost; and
> the cash flow statement now presents the IAS 7 FX-on-cash line correctly, isolating
> foreign-currency cash revaluation from genuine operating flows without touching the footing.
> With Layer 5 hardened, the entire accounting module — Layers 0 through 5 — is correct,
> self-consistent, and permanently defensible.
