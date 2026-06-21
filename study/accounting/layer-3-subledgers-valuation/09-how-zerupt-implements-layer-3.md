# 09 — How Zerupt Implements Layer 3

## Reading the code

This chapter maps the concepts from chapters 00–07 to the actual files in the codebase as
they stand after the 2026-06-21 hardening pass. Reading this chapter while having the files
open will make the Layer 3 wiring readable at a glance.

All paths are relative to `erp/apps/api/src/` unless otherwise noted.

---

## 1. The party model — how AR and AP become per-customer / per-supplier

### The data shape

Two optional fields were added to every line input in the posting pipeline:

| Field | Type | Where it lives |
|-------|------|----------------|
| `partyType` | `"customer" \| "supplier" \| "employee" \| undefined` | `JeLineInput`, `eventLineSchema`, `ResolvedLine` |
| `partyId` | `string (uuid) \| undefined` | same three types |

Files that carry these fields end-to-end:

- `accounting-events/helpers/build-je-payload.ts` — `JeLineInput` accepts both; `buildJePayload` copies them through to `EventLine` via a conditional spread.
- `journal-entries/journal-entries.dto.ts` — `eventLineSchema` adds both with two refinements: (a) party is all-or-nothing (both present or both absent); (b) when `taxCodeId` is set, `taxableAmountTC` is required (Tax F2).
- `journal-entries/journal-posting.service.ts` — `ResolvedLine` carries both; `postFromEvent` threads them through resolved lines into the `DirectPostingLine` map passed to `postDirect`. `postDirect` already had `partyType`/`partyId` on `DirectPostingLine` and already persisted them to the DB — the gap before hardening was purely upstream.

### Role classification — which accounts require a party

`journal-entries/journal-posting.service.ts` (the system-role registry at
`accounts/system-roles/system-role-registry.ts`) classifies every system role with a
`requiresParty: boolean` flag. The load-time invariant is `requiresParty ⇒ isControlAccount`.
The exported helper `resolvePartyRequirement(account)` returns `"required"` or `"forbidden"`.

**Exactly two role keys are `requiresParty = true`:**

| Role key | Account | Code |
|----------|---------|------|
| `trade_receivables` | 1131 Trade Receivables | control account |
| `trade_payables` | 2111 Trade Payables | control account |

Everything else — `merchandise_inventory` (the third control account), all liability/equity
accounts, all non-control accounts — resolves to `"forbidden"`.

**Why `customer_deposits` (1161) and `supplier_prepayments` are NOT party sub-ledgers:**
These accounts have `isControlAccount: false` in `packages/db/src/schema/coa-base-template.ts`.
The `requiresParty ⇒ isControl` load-time guard would crash if they were included. Per-party
tagging of deposits and advances (audit Finding 15) is a separate design change that first
requires promoting those accounts to control accounts; it is explicitly deferred.

### The chokepoint guards in `postDirect`

All four guards run inside the posting transaction, with batched queries (no N+1):

| Guard | What it rejects | Error |
|-------|-----------------|-------|
| control ⇒ party | AR/AP control line with `partyId` null | `BadRequestException` |
| party ⇒ control | Any party set on a non-party-subledger account (including pooled control accounts like inventory) | `BadRequestException` |
| partyId existence | Customer id not in `sales_customers`; supplier id not in `suppliers`; employee (no table) → always rejected | `BadRequestException` |
| manual ⇒ no control | A line in a manual draft (`source === "manual"`) whose `accountId` is any control account | `BadRequestException` |

`validatePostableAccounts` selects `{id, isControlAccount}` and returns a `Map` that is
reused by `validatePartyContract` — one batched fetch covers both guards.

The event/engine path passes `blockControlAccounts: false`, so automated posting CAN write
to control accounts. Manual drafts via `journal-entry-draft.service.ts` pass `true`.

### The DB backstop

`packages/db/drizzle/0100_layer3_subledger_integrity.sql` defines a constraint trigger
`jel_party_on_subledger_control_trg` on `journal_entry_lines`. It fires `AFTER INSERT OR UPDATE`
and cross-joins `account_system_roles` to confirm that any line whose account is a
`trade_receivables` or `trade_payables` control account carries a non-null `party_id`.
A plain `CHECK` constraint cannot reference another table, hence the trigger. It uses the
`account_system_roles` binding as the source of truth rather than a hardcoded account code,
so it cannot drift from the application's classification.

The trigger was functionally validated by booting the full NestJS app (91 modules, no DI
error, all Jest batches green). Historical party-less AR/AP lines posted before this pass
are not retroactively violated (the trigger fires on new writes only); a one-time backfill
is required before those rows are safe to UPDATE.

---

## 2. Where each listener tags the party

The rule is simple: set `partyType` + `partyId` on the `receivable` or `payable` line
only. Every other line type must carry no party — the guard rejects it.

### Sales-side AR (1131)

| Event | Handler file | Line type tagged | partyId source |
|-------|-------------|-----------------|----------------|
| `sales.invoice.confirmed` | `accounting-events/listeners/sales.listener.ts` | `receivable` (DR) | `payload.customerId` — added to `invoicePayloadSchema` and emitted from `sales/invoices/sales-invoices-events.ts` |
| `sales.creditNote.confirmed` | same | `receivable` (CR reversal) | `payload.customerId` — already emitted |
| `sales.receipt.posted` | same | `receivable` (CR settlement) | `payload.customerId` — already emitted |

Lines deliberately left party-less: `revenue`, `returns`, `output_tax`, `cash`/`bank`,
`discount`, `fx_gain`/`fx_loss`. The `customer_deposit` advance line and overpayment residual
line hit account 1161 (`isControlAccount: false`) — the guard forbids a party there.

### POS on-account (1131)

POS is special: the live path does NOT go through the `@OnEvent(POS_EVENTS.*)` listener.
It builds a `accounting.post` payload directly in:

- `accounting-events/helpers/build-pos-transaction-post.ts` — the `on_account` tender branch
  sets `partyType: "customer", partyId: input.customerId` on the `receivable` line.
- `pos/transactions/pos-transactions-events.ts` — threads `txn.customerId` through both the
  transaction-completed and void-completed builders.
- `accounting-events/listeners/pos.listener.ts` — the legacy/replay path mirrors the live
  path so dead-letter replay produces identical entries.

`customerId` was added (optional) to `transactionPayloadSchema` and `voidPayloadSchema` — optional
because a cash or card sale has no AR line and therefore no party requirement.

POS returns never produce an AR line (refund methods are cash/card/store_credit only, not
on-account), so no party is needed there.

### Purchase-side AP (2111)

| Event | AP line tagged | partyId source | Notes |
|-------|---------------|----------------|-------|
| `purchase.invoice.confirmed` | CR `payable` | `payload.supplierId` — added to emitter in `purchase/invoices/purchase-invoices-events.ts` | |
| `purchase.grn.confirmed` | CR `payable` **only when `hasSupplierInvoice`** | `payload.supplierId` — already emitted | Unmatched GRN credits `accrual` (2121, non-control) — no party |
| `purchase.return.confirmed` | DR `payable` | `payload.supplierId` — already emitted | `accrual` reversal leg is 2121 — no party |
| `purchase.payment.posted` (standard) | DR `payable` | `payload.supplierId` — already emitted | Advance variant posts only 1161 (non-control) — no party |
| `purchase.payment.advanceApplied` | DR `payable` | `payload.supplierId` — already emitted | CR `supplier_advance` (1161) — no party |
| `purchase.landedCost.allocated` | CR `payable` — only when `creditEntityId` present | `component.creditEntityId` (the freight/vendor supplier) | `bank`/`accrual` legs — no party |

The landed-cost payable case carries a DTO-level guard: `purchase/landed-costs/landed-costs.dto.ts`
has a Zod refinement that rejects `creditAccountType === "payable"` when `creditEntityId` is absent.
This prevents a party-less 2111 line that the posting guard would dead-letter.

All purchase listener code is in `accounting-events/listeners/purchase-accounting.listener.ts`.

### Cheques (1131 / 2111)

`accounting-events/listeners/cheque-accounting.listener.ts` and its live helper
`accounting-events/helpers/build-cheque-je-payload.ts` tag at one chokepoint each via
`partyForChequeLine()`:

| Leg line type | Party |
|---------------|-------|
| `receivable` (1131) | `customer / counterpartyId` — received, bounce-in, cancel-in |
| `payable` (2111) | `supplier / counterpartyId` — issued, bounce-out, cancel-out |
| `pdc_receivable`, `pdc_payable`, `cheques_in_transit`, `bank`, `fee_income` | none |

`counterpartyId` was added as required to `ChequeJeInput` and threaded from
`cheques/cheques.events.ts`. `pdc_receivable` (1134) and `pdc_payable` (2145) are NOT
`trade_receivables`/`trade_payables` and do not require a party — confirmed via
`account-mapping-defaults.ts`.

---

## 3. Inventory valuation — WAC engine as-built

### The WAC self-correction fix

**File:** `inventory/stock-level.service.ts` — `decrementOutbound`

Before hardening, the outbound decrement subtracted cost from `total_value` like this:

```
total_value = total_value − (qty × WAC)
```

The problem: `average_cost` is stored at 6 decimal places. Repeated multiplication and
subtraction accumulate rounding residuals, causing `total_value` to drift from
`on_hand × average_cost`. The fix recomputes directly from the post-decrement balance:

```sql
total_value = round((on_hand − qty) × average_cost, 6)
```

This runs in the same `UPDATE` statement against the row held under `SELECT FOR UPDATE`, so
`total_value` can never drift from `on_hand × WAC` after any single operation.
The COGS GL credit is unchanged — still `qty × current WAC` from the listener.

### The negative-stock COGS true-up

**File:** `inventory/inventory-event.listener.ts` — `applyInbound`

When stock was sold while on-hand was negative (units sold before the receipt arrived),
the COGS posted at sale time used whatever WAC was available — which may understate cost
if the actual receipt cost is higher. On the next genuine receipt (`grn_receipt` or
`adjustment_increase`) that restores stock from negative:

```
trigger  : prior on_hand < 0  AND  receiptUnitCost > priorWac
units    : min(|priorOnHand|, receiptQty)
trueUp   : round(units × (receiptUnitCost − priorWac), 6)
JE       : DR COGS  /  CR Inventory  for trueUp amount
```

The JE uses a deterministic event id (`deterministicUuidV5("negstock-trueup", payload.eventId)`)
so it can never duplicate the receipt's own JE. It goes through the outbox (at-least-once
durability) plus an in-process fast-path emit post-commit — the same two-channel pattern used
by other engine-sourced postings.

Excluded from the true-up: `sale_return` reversals, `transfer_in`/`assembly_in`
(reclassifications with their own cost basis), receipts where cost ≤ prior WAC (no understatement).

### Transfer receive uses pack-resolved base qty

**File:** `inventory/transfers/stock-transfers.service.ts` — receive path

Pack-unit receipts were blending the WAC using raw (pack) quantity while the ledger row used
base quantity, producing a WAC mismatch. The receive path now resolves `baseQtyReceived` via
`resolvePackUnit` before passing it to both the WAC engine and `upsertInbound`. When no pack
unit is configured, `baseQtyReceived === qtyReceived`, so there is no behavioral change for
simple items.

### Inventory reconciliation basis

**File:** `inventory-reconciliation/inventory-reconciliation.service.ts` — `readSubledger`

Before hardening the subledger total was `Σ(total_value)` from the stored column — the same
column that drifted from WAC. This masked valuation drift because both the GL and the subledger
used the drifted number. Now:

```sql
total       = Σ round(on_hand × average_cost, 6)   -- authoritative recompute vs GL
storedTotal = Σ total_value                         -- independent 2nd check
valueDrift  = total − storedTotal                   -- WARN when |drift| > threshold
```

The variance against the GL uses the recomputed `total`. A genuine valuation error is now
detectable rather than masked.

A one-time backfill corrects existing stored-column drift:
```sql
UPDATE materialized_stock_levels
SET total_value = round(on_hand * average_cost, 6)
WHERE total_value <> round(on_hand * average_cost, 6);
```

---

## 4. AR/AP sub-ledger reconciliation — the three-way tie-out

**Module:** `subledger-reconciliation/` (six files: types, dto, service, controller, module, spec)

`SubledgerReconciliationService.detect()` runs three independent queries for each of AR and AP:

| Leg | Query | Purpose |
|-----|-------|---------|
| GL Control | `Σ(debit − credit)` over all posted lines on the control account | The authoritative GL balance |
| GL Sub-ledger | `Σ(debit − credit)` grouped by `partyId IS NOT NULL` | Per-party breakdown; NULL-party lines go to the unattributed bucket |
| Operational | `Σ(sales_invoices.balance)` / `Σ(purchase_invoices.balance)` on open/overdue docs | The invoice system's view of what is owed |

The control accounts are resolved via `account_system_roles` (role_key = `trade_receivables` /
`trade_payables`) — never by hardcoded account code.

Variances computed (all in `Decimal.js` at 6dp, no float arithmetic):

- `partyGapVariance` = `|glControl − unattributedAmount − glSubledger|` — measures how much of
  the GL control balance is not yet attributed to a party. Must be ~0 once party coverage is 100%.
- `glOpDrift` = `|abs(glControl) − abs(operationalTotal)|` — measures divergence between
  the GL and the invoice system.
- `partyCoverageOk` = `partyGapVariance ≤ threshold AND unattributedLineCount = 0`
- `glOpTied` = `glOpDrift ≤ threshold`

**Endpoint:** `GET /tenant/accounting/subledger-reconciliation?legalEntityId=<uuid>&threshold=<decimal>`
Requires `accounting.journal.read` permission. Returns AR and AP detect results plus a top-level
`hasWarnings` flag.

**Monthly close integration:** `reconcile_ar_ap_subledger` was added as a `closeTaskKey` enum value
(migration `0101_layer3_close_task_key_subledger.sql`) and wired into `close-management/close-defaults.ts`
at sort order 55 (between "review accruals" at 50 and "lock period" at 60). The task is a manual
checklist item; no JE is posted — any drift is reported only, and a human must investigate.

---

## 5. Tax — as-built

### Per-component posting with taxCodeId (all listeners)

Every `output_tax` and `input_tax` line carries:
- `taxCodeId` — the UUID of the tax code component
- `taxableAmountTC` — the net base on which the tax was calculated (required when `taxCodeId` is set, enforced by `eventLineSchema` refinement)
- `taxAmountTC` — the tax amount itself (newly populated as Tax F3 in this pass, across sales, purchase, and POS listeners)

Before hardening, `taxAmountTC` was populated in the schema but left null by most listeners.
Now every `output_tax`/`input_tax` line in every listener sets it explicitly.

### POS-return tax line fix (Tax F1)

POS returns previously carried a single scalar `taxAmount` with no `taxCodeId`. The VAT
return aggregation keys on `taxCodeId`, so POS-return tax was silently excluded from the
output VAT summary — overstating net output tax.

The fix threads `taxLines: taxLineSchema[]` (matching the sale and void payload shapes) through:
- `pos/transactions/pos-transactions-events.ts` — `buildReturnCompletedJePayload` now accepts a `taxLines` parameter
- `pos/transactions/pos-transactions.service.ts` — feeds ABS-quantity line copies to `computeComponentSummary` to produce correct non-zero tax on returns (return lines carry negative qty, which floored to zero before the fix)
- `accounting-events/listeners/pos.listener.ts` — posts one `output_tax` DEBIT per component with `taxCodeId` set, matching the void path

### Reverse-charge and out-of-scope

Reverse-charge components produce two legs: `rc_input_tax` (recoverable self-assessed) and
`rc_output_tax` (output liability). Both legs now receive `taxAmountTC`.

`out_of_scope` was missing from the `TaxCategory` union in
`packages/shared/src/pos-money/tax-types.ts`. Any component with `category = "out_of_scope"`
would fall through to the standard charged/recoverable branch and produce incorrect tax.
The fix adds `"out_of_scope"` to the union and adds an explicit early-continue branch in
`packages/shared/src/pos-money/tax-engine.ts`: `taxAmount = 0`, no summary-map entry,
no box assignment.

### Rate precision (Tax F4)

`tax-config/tax-config.service.ts` previously called `Number(taxCode.rate)` to convert the
Drizzle-returned `numeric(7,4)` string, then `tax-calc/tax-calc.service.ts` called
`String(rateInfo.rate)` to convert it back. This round-trip through a JavaScript float is
lossy for rates like 8.25%, 7.775%, or 8.1% that are not exactly IEEE 754 representable.

The fix removes both conversions: `tax-config.service.ts` now calls `String(...)` directly,
and `EffectiveRateResponse.rate` is typed as `string`. The rate travels as an exact decimal
string from the DB column through to the tax engine with no float conversion.

---

## 6. Known deferrals — be honest about what was not built

| Item | Status | Where flagged |
|------|--------|---------------|
| Sales-side receipt FX gain/loss — real multi-currency aging | Layer 4 scope; not started | `fixes-l3-sales.md` note |
| Write-off / bad-debt path | No JE path exists; flagged for founder to decide policy before implementation | `fixes-l3-arap-contract.md` |
| Purchase-return MEDIUM-1 — inventory credit should be `qty × current WAC` not `qty × billed cost` | Reverted; needs a two-JE clearing-account redesign so the engine owns the inventory-relief leg (mirroring how COGS is a separate engine-posted JE) | `fixes-l3-purchase.md` §PART B; `verify-l3.md` Gate 6 |
| GL-native multi-currency aging report | Layer 5 (reporting); not started | Layer 3 scope note |
| Historical AR/AP line backfill — party tagging on pre-hardening JE lines | DB trigger fires only on new writes; old lines are not retroactively validated; backfill SQL must be applied before UPDATE-ing historical rows | `fixes-l3-arap-contract.md` §5; `verify-l3.md` §3 |
| Per-party tagging of `customer_deposits` / `supplier_advance` | Requires promoting those accounts to control accounts first (audit Finding 15, MEDIUM) | `system-role-registry.ts` PARTY_SUBLEDGER_ROLE_KEYS comment |

---

## The mental model

> The party model is not a foreign-key join bolted onto the GL — it is baked into the
> posting primitive as a contract. Two role keys (`trade_receivables`, `trade_payables`)
> are the only ones that require a party. The posting service enforces this at the chokepoint:
> control without party throws, party without control throws, party with non-existent entity
> throws. A DB trigger is the last line of defence. Every listener (sales, purchase, POS,
> cheque) threads the customer or supplier id onto exactly the right line type and nowhere
> else. The inventory subledger achieves the same correctness goal differently: WAC is
> self-correcting on every write, the negative-stock true-up closes the COGS gap at receipt
> time, and the reconciliation now compares Σ(on_hand × WAC) against the GL rather than
> the drifted stored column. Tax lines carry their code id, their taxable base, and their
> amount — in every listener, on every path including POS returns, at exact decimal precision
> throughout. Reconciliation ties everything together: the AR/AP three-way tie-out sits in
> the monthly close checklist; the inventory reconciliation surfaces drift before it compounds.
