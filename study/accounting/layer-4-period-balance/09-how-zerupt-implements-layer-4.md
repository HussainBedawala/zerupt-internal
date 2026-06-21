# 09 — How Zerupt Implements Layer 4

## Reading the code

This chapter maps the concepts from chapters 00–06 to the actual files in the codebase as
they stand after the 2026-06-21 hardening pass (commit 5d4a006f, branch
`phase-2/layer-4-period-balance`, merged to main).

All paths are relative to `erp/apps/api/src/` unless otherwise noted.

---

## 1. Trial balance — balanced by construction, now visible

### How the TB is derived

`reports/trial-balance.service.ts` builds the trial balance by summing raw `journal_entry_lines`
grouped by `accountId`. It filters on `BALANCE_AFFECTING_JE_STATUSES` (from
`reports/constants.ts:15`):

```typescript
export const BALANCE_AFFECTING_JE_STATUSES = ["posted", "reversed"] as const;
```

Including `reversed` is deliberate. When a journal entry is reversed, the original entry's
status flips to `"reversed"` and a contra entry is posted as `"posted"`. Summing both nets
to zero — which is exactly correct. Excluding `"reversed"` would leave a phantom positive
balance from the original, masking the reversal.

Because every journal entry is stored with a single `postingDate` header shared by all its
lines, an as-of or date-range TB always picks up whole balanced entries. No JE can split
across a period boundary, so the TB grand total always satisfies `Σdr = Σcr` over any date
range or as-of date, with no rounding accumulation.

### The double-entry chokepoint — `postDirect`

Everything enters the ledger through one function: `journal-posting.service.ts → postDirect`.
Before any insert it runs an exact equality check:

```typescript
// journal-posting.service.ts:607, 617
if (!new Decimal(totalDebit).equals(new Decimal(totalCredit))) {
  throw new BadRequestException(...);
}
```

Both the functional amounts (lines 607) and the transaction-currency amounts (617) are
checked. The check uses `Decimal.equals`, which treats two strings as equal only if their
numeric values match exactly — there is no epsilon window.

After the insert, a DB `CHECK` constraint provides a last-resort backstop:

```
-- packages/db/src/schema/journal-entry.ts:167
"je_posted_balanced_check"  → status != 'posted' OR total_debit = total_credit
```

The header totals are computed from the normalized lines inside the same transaction that
inserts the lines, so they can never drift from `Σlines`.

### Reconciliation services now use the same status policy

Before hardening, `subledger-reconciliation.service.ts` and `opening-import/reconciliation.service.ts`
filtered on the bare `"posted"` status rather than `BALANCE_AFFECTING_JE_STATUSES`. After fix F2
(`fixes-l4-tb.md`), all four query sites in both services use `inArray(journalEntries.status, BALANCE_AFFECTING_JE_STATUSES)`.
This matters the moment any AR/AP control-account posting is reversed: the recon's GL-control
balance now agrees with the TB's GL-control balance because both apply the same status filter.

### The out-of-balance banner (frontend)

Before hardening the trial-balance table rendered `totalDebit` and `totalCredit` side-by-side in
the footer but never compared them. A data-corruption bug or a direct DB write could produce an
imbalanced ledger, and the UI would display it silently.

After fix F1, `apps/web/src/features/trial-balance/components/trial-balance-table.tsx` computes:

```typescript
const diff = new Decimal(totalDebit).minus(new Decimal(totalCredit));
const isOutOfBalance = !diff.isZero();
```

| State | UI |
|-------|----|
| Entity-wide, balanced | Quiet "Balanced" badge with CheckCircle icon |
| Entity-wide, out of balance | Loud destructive `role="alert"` banner showing the exact diff |
| Branch-filtered | Informational `role="note"` explaining branch views legitimately do not balance |

The branch note is shown whenever `branchId` is non-null (fix F4, folded into F1). The
destructive error banner is suppressed for branch-filtered views so a legitimate inter-branch
imbalance is not mistaken for broken books.

i18n keys `trialBalance.balance.outOfBalanceBanner`, `.inBalanceBadge`, `.branchNote` are added
to both `apps/web/messages/en/trialBalance.json` and `apps/web/messages/ar/trialBalance.json`.

---

## 2. Opening balances — seeding, idempotency, and the live-transactions guard

### Where the code lives

`opening-balance/opening-balance.service.ts` handles three complementary paths:

| Method | What it posts | GL impact |
|--------|---------------|-----------|
| `postGlOpeningBalances` | Main GL opening journal | DR/CR every account line; OBE plug (3900) absorbs residual |
| `postArOpeningBalances` | Per-customer AR opening | DR AR control / CR OBE; then seeds stub invoices for aging |
| `postApOpeningBalances` | Per-supplier AP opening | CR AP control / DR OBE; then seeds stub bills for aging |
| `postInventoryOpeningCounterpart` | Inventory GL counterpart | DR inventory (1140) / CR OBE when stock file arrives without a TB |

All four paths route through `postDirect`, so every opening journal is balanced exactly.

### The OBE plug

For the main GL opening (`postGlOpeningBalances`, lines 274–309) the service sums every
provided line in both functional and transaction currency, then appends an Opening Balance
Equity (account 3900, role `opening_balance_equity`) plug line sized to absorb the EXACT
residual in both dimensions. This means a multi-currency opening journal balances in both
functional and TC, not just one.

AR and AP openings always debit or credit the OBE account on the opposite leg from the
control account: a customer opening is `DR AR control / CR OBE`; a supplier opening is
`CR AP control / DR OBE`. The control accounts are resolved from system roles
(`trade_receivables`, `trade_payables`), never hardcoded account codes.

### Idempotency

Three independent guards prevent double-posting:

1. One-opening-journal-per-entity guard (line 208–222): if a GL opening journal already
   exists for the legal entity the call is rejected with `ConflictException`.
2. Symmetric control-seeded guard (lines 231–254): if a prior `ob_ar` or `ob_ap` already
   touched the control account the GL opening is about to write, it is rejected.
3. Per-stub idempotency (lines 628–636, 748–758): AR/AP stub invoices and bills are keyed
   on `openingJournalEntryId`, so replays produce no-ops rather than duplicate stubs.

### The live-transactions guard (new, fix F3)

Before hardening there was no check against posting opening balances after live transactions
already existed. A tenant who ran sales for several weeks then imported an opening TB dated
in the past would silently double-count any balances captured by both sources.

The new guard runs at the start of `postGlOpeningBalances` (before `validateAccounts`):

```typescript
// opening-balance.service.ts:264-280
const [liveJe] = await db
  .select({ id: journalEntries.id, entryNumber: journalEntries.entryNumber })
  .from(journalEntries)
  .where(and(
    eq(journalEntries.tenantId, tenantId),
    eq(journalEntries.legalEntityId, input.legalEntityId),
    eq(journalEntries.status, "posted"),
    notInArray(journalEntries.sourceDocumentType, ["ob", "ob_ar", "ob_ap"]),
    gte(journalEntries.postingDate, input.asOfDate),
  ))
  .limit(1);
if (liveJe !== undefined) throw new ConflictException(...);
```

It looks for any posted entry whose source type is not one of the opening-balance document
types (`ob`, `ob_ar`, `ob_ap`) and whose posting date falls on or after the requested opening
date. A single match aborts the opening with a clear message. The check is read-only (no
migration required) and adds no overhead to the typical happy path.

### Per-party AR/AP seeding

Every AR control line inside `postArOpeningBalances` and `postApOpeningBalances` carries
`partyType` and `partyId` (lines 572–573, 882–883). This is the only path that populates
the GL party dimension at opening time, consistent with the Layer 3 constraint that AR/AP
control lines must carry a party.

---

## 3. Fiscal periods and locking

### The four states

| DB value | API label | What it means |
|----------|-----------|---------------|
| `open` | `Open` | Posting unrestricted |
| `soft_locked` | `SoftLocked` | Posting requires an override reason and permission |
| `hard_locked` | `HardLocked` | Posting absolutely blocked |
| (FY closed) | treated as `HardLocked` | `validatePeriod` maps a closed FY's periods to HardLocked regardless of stored status |

The `period_status` enum in `packages/db/src/schema/fiscal.ts:97` contains only the first
three values. A fiscal year's `isClosed` flag is checked separately in `validatePeriod`
(line 1183) and treated as HardLocked at the application level.

### The posting chokepoint

Every posting path calls `fiscal-period.service.ts → validatePeriod` BEFORE reaching
`postDirect`. `validatePeriod` resolves the period from the transaction date (not a
caller-supplied id), so a backdated document inherits the historical period's lock status
automatically. `isBackdatedPastLock` (lines 1148–1152) provides a second independent check
blocking any date earlier than the earliest non-hard-locked period start.

### The DB trigger backstop

Migration `0098` created `trg_prevent_hard_locked_period` (a `BEFORE INSERT OR UPDATE`
trigger on `journal_entries`). The trigger fires when a row's `fiscal_period_id` points to
a hard-locked period, or when an UPDATE changes the `fiscal_period_id` to one. It raises an
exception directly from the DB layer, so no bypass through the application is possible.

`soft_locked` is intentionally NOT blocked by the trigger — it is an application-layer gate,
because the soft-lock is meant to be override-able by authorized users.

### Soft-lock override — now permission-gated (fix F1)

Before hardening, a soft-locked period could be bypassed by any user who supplied any
non-empty reason string. The override policy fields (`allowSoftLockOverride`, `softLockOverrideRoles`)
existed in the settings table but were never consulted.

After fix F1, both soft-lockable paths call a new method:

```
fiscal-period.service.ts → assertSoftLockOverrideAllowed(tenantId, userId, periodResult)
```

The method enforces two gates in sequence:

1. **Policy gate:** if `allowSoftLockOverride === false` the override is rejected with
   `ForbiddenException` regardless of the user's role. Soft-lock behaves exactly like
   hard-lock when the policy forbids overrides.
2. **Role gate:** resolves the user's active, non-expired roles from `user_roles ⋈ roles`
   (the same active/expiry filter `PermissionService` uses) and requires membership in
   `softLockOverrideRoles` (stored as role UUIDs, not names). The Owner system role
   bypasses this check, consistent with how `PermissionService` treats Owner.

The method is wired into both soft-lockable paths:

- `journal-entry-draft.service.ts:351` — manual JE post
- `journal-reversal.service.ts` — journal reversal

Hard-lock behavior is untouched. The event/engine path (`postFromEvent`) rejects soft-lock
outright and never reaches the override gate.

### Hard-close now gated on close-checklist completion (fix F2)

Before hardening, `updatePeriodStatus` and `closeFiscalYear` applied the lock immediately
with no check that the close-management checklist was complete. After fix F2, two new
guards run before the lock is applied:

- **Per-period hard-lock:** `updatePeriodStatus` calls `assertPeriodCloseRunComplete`
  when the target status is `HardLocked`. Soft-lock and unlock are unaffected.
- **Year-end close:** `closeFiscalYear` calls `assertYearCloseRunsComplete` before
  opening the close transaction. It loads EVERY period in the fiscal year and asserts
  each has a `close_runs.status = "complete"` row — not just the last period.

Both methods read the `close_runs` table directly through the tenant DB, with no injection
of `CloseManagementService` and no new module import. This avoids introducing a new edge
into the existing `JournalPosting ↔ FiscalPeriod ↔ YearEnd` forward-reference cycle.

A close run's status is `"complete"` only when `allRequiredResolved` is true, which requires
all tasks — including the `reconcile_ar_ap_subledger` checklist item added in Layer 3 — to
be resolved. The checklist item is still a manual human attestation; what changed is that the
hard-lock can no longer be applied until that attestation is recorded.

---

## 4. Year-end close

### What the close does

`journal-entries/year-end-closing.service.ts → generateClosingEntry` (lines 204–376):

1. Sums all income accounts (type = `income`) and expense accounts (type = `expense`) across
   the fiscal year's periods via posted `journal_entry_lines`.
2. Debits each income account (crediting it to zero) and credits each expense account
   (debiting it to zero).
3. The net income `netIncomeExpense` sweeps to Retained Earnings. RE-Current (the current-year
   retained earnings account) is cleared to its pre-existing manual balance first, then the
   full P&L net goes to RE-Prior. The proof (lines 330–335) is algebraically sound for profit,
   loss, zero activity, and any prior RE balance.
4. Balance-sheet accounts (type not in `{income, expense}`) are untouched — they carry
   forward without any close entry.

The closing entry is validated by `postDirect` as any other entry would be, so it must
balance exactly in both functional and TC.

### Idempotency

`closeFiscalYear` guards on `fiscalYearRow.closingEntryId !== null` (line 133) — a second
close attempt throws before any work is done.

### Reversibility

`reopenFiscalYear` (line 836) calls `JournalReversalService.reverseEntry` on the closing
entry first, then flips `isClosed = false` under a `SELECT FOR UPDATE` lock. If the close
entry has already been reversed (crash recovery path), the method clears only the reference.

### Reopen now restores prior per-period statuses (fix F4, migration 0102)

Before hardening, `closeFiscalYear` auto-locked all non-hard-locked periods to `hard_locked`
without recording what those periods' statuses had been. On reopen, the periods stayed
hard-locked and the user had to manually batch-unlock them, losing the original `open` or
`soft_locked` distinction.

Migration `0102_brown_absorbing_man.sql` adds a nullable column:

```sql
ALTER TABLE "fiscal_periods" ADD COLUMN "status_before_close" "period_status";
```

During `closeFiscalYear`, the auto-lock UPDATE now also captures each period's prior status:

```sql
-- fiscal-period.service.ts:620
UPDATE fiscal_periods
SET status_before_close = status,
    status = 'hard_locked',
    locked_at = ..., locked_by = ..., updated_at = ...
WHERE fiscal_year_id = ...
  AND tenant_id = ...
  AND status != 'hard_locked'
```

Periods that were already `hard_locked` before the close receive `NULL` in `status_before_close`
and stay hard-locked on reopen (the `status_before_close IS NOT NULL` predicate excludes them).

During `reopenFiscalYear`, each period with a captured `status_before_close` is restored:

```sql
-- fiscal-period.service.ts:905
SET status = status_before_close,
    locked_at   = CASE WHEN status_before_close = 'open' THEN NULL ELSE locked_at END,
    locked_by   = CASE WHEN status_before_close = 'open' THEN NULL ELSE locked_by END,
    status_before_close = NULL,
    ...
```

Every restoration is audit-logged individually, with `System` as the source.

### Close is gated on every period's checklist

Because year-end close now requires `assertYearCloseRunsComplete` (section 3 above), the
close entry can only be generated once every period in the year has a complete close run.
This enforces: reconcile sub-ledgers → revalue FX → TB → lock all periods → then close the
year.

---

## 5. FX — monetary classification, unrealized revaluation, and realized settlement

### 5a. `accounts.is_monetary` — the IAS 21 filter (migration 0104)

`packages/db/src/schema/chart-of-accounts.ts` now carries:

```typescript
isMonetary: boolean("is_monetary").notNull().default(true)
```

The single classification function is `apps/api/src/accounts/coa-monetary-classification.ts → deriveIsMonetary`.
It is deterministic and region-agnostic:

| Accounts | `is_monetary` |
|----------|--------------|
| All income / expense accounts | `false` (never period-end retranslated) |
| Header / group accounts | `false` (non-postable, never revalued) |
| Inventory subtree (root 1140) | `false` (stated at WAC, not cash) |
| Non-current assets subtree (root 1200) | `false` (PPE, intangibles, accumulated depreciation) |
| Prepayments header (1160) and Supplier Prepayments (1161) | `false` (rights to goods/services, not cash) |
| Input Tax Recoverable (1162) | `true` (a right to recover cash from the tax authority) |
| Everything else: cash, bank, AR, AP, loans, accruals, taxes payable | `true` |

Note: 1162 sits under the 1160 group but is monetary. The 1160 group code is therefore an
explicit leaf carve-out, NOT a subtree anchor. Only 1140 and 1200 are subtree anchors.

Migration `0104_layer4_account_is_monetary.sql` adds the column with `DEFAULT true` and runs
a single idempotent backfill using a `WITH RECURSIVE` CTE to walk the parent chain for the
1140 and 1200 subtrees.

Template seeding derives `isMonetary` via `deriveIsMonetary` at seed time rather than
hand-annotating every one of the 88+ base accounts. User-created accounts get `DEFAULT true`
(conservative — only an account with a subtree-anchor ancestor or explicit leaf code would
ever be non-monetary, and none of those can be user-created).

### 5b. Unrealized FX revaluation (IAS 21.23)

**Trigger:** `POST /tenant/fx-revaluation` — called as a pre-lock close activity.

**Balance query:** `fx-revaluation/fx-revaluation.service.ts` selects all `journal_entry_lines`
whose account has `accounts.isMonetary = true` (fix C2), whose currency differs from the
entity's functional currency, and whose status is in `BALANCE_AFFECTING_JE_STATUSES`. The
query LEFT JOINs `account_system_roles` on `{trade_receivables, trade_payables}` and groups
by `(accountId, currency, partyType, partyId)` (fix H3).

This means:

- A USD bank account with five posted entries produces one row grouped by (bankAccount, USD,
  null, null).
- A customer's EUR receivable produces one row per customer grouped by (1131, EUR, "customer",
  customerId). Each customer's FC balance is revalued and posted SEPARATELY, carrying the party
  tag. This satisfies the Layer 3 control-account guard: every AR/AP JE line must carry a party.

**Rate:** `resolveExactClosingRate` requires a closing rate dated EXACTLY on the period-end
date. No silent fallback to a prior date. Missing rate throws `NotFoundException` (fail-loud).
The inverse direction is computed as `1/forward` at full `Decimal` precision rather than the
stored 10dp column to avoid rounding loss for KWD/IDR-class pairs.

**JE structure per revalued balance:**

| Leg | Line type | Account |
|-----|-----------|---------|
| Gain: DR revalued account, CR gain | `balance_sheet_offset` / `fx_gain` | The account itself / 4830 |
| Loss: DR loss, CR revalued account | `fx_loss` / `balance_sheet_offset` | 7220 / the account itself |

The offset leg carries `accountId: balance.accountId` directly so the posting engine
resolves it without consulting `account_mapping`. The gain/loss leg carries no `accountId`
and resolves via the mapping table:

```typescript
// account-mapping-defaults.ts:392-393
{ eventType: "fx.unrealized_revaluation", lineType: "fx_gain", accountCode: "4830" },
{ eventType: "fx.unrealized_revaluation", lineType: "fx_loss", accountCode: "7220" },
```

**Reverse-next-period:** the revaluation JE and its reversal are inserted atomically in one
outbox transaction. The reversal is dated to the first day of the next open period with debits
and credits swapped. Both periods must be `Open` at the time of posting — the reval will
dead-letter if either period is locked (explicit `Open` assertion added as fix H2).

**Idempotency:** the eventId is a deterministic UUIDv5, so a re-run raises `ConflictException`
rather than posting a second set of unrealized entries.

**Migration 0105** inserts accounts 4830 (Unrealized FX Gain, under 4000) and 7220 (Unrealized
FX Loss, under 7000) into every existing tenant's COA idempotently (insert only when the parent
exists and the code is absent). After the migration runs, the standard `BackfillAccountMappingsService`
resolves the two mapping defaults to the newly inserted rows on the next boot.

### 5c. Realized FX on the sales side (fixes C3 + C4, migration 0103)

The purchase side has had `exchangeRate` columns on `purchaseInvoices` and `supplierPayments`
since an earlier pass. Layer 4 mirrors this on the sales side.

**Migration 0103** adds `exchange_rate numeric(18,10) NOT NULL DEFAULT '1'` with a `> 0` CHECK
to both `sales_invoices` and `sales_receipt_vouchers`.

**Booking rate (C4):** `sales-invoices.service.ts` now stores `exchangeRate` at invoice creation.
For a functional-currency invoice the rate is forced to `"1"` and a non-1 input throws
`UnprocessableEntityException` (fix A from `fixes-l4-reviewfix.md`). A foreign-currency invoice
stores the supplied booking rate. The invoice-confirmed JE still books AR in functional at rate 1
(the same design as the purchase side): the invoice currency is forced to functional at create,
so no conversion is applied at posting time.

**Settlement FX (C3):** `apps/api/src/sales/receipts/receipt-fx.ts` exports
`computeReceiptFx(allocations, receiptRate)`. For each allocation:

```
cashFunctional_i    = round6(allocatedAmount_i × receiptRate)
allocatedAmountFN_i = round6(allocatedAmount_i × invoiceRate_i)
fxGainLoss_i        = cashFunctional_i − allocatedAmountFN_i
```

The sign convention is the mirror image of the purchase side:
- `receiptRate > invoiceRate` → we received more functional cash than we relieved AR → **gain** (CR 4820)
- `receiptRate < invoiceRate` → we received less functional cash than we relieved AR → **loss** (DR 7210)

Each line satisfies `cashFunctional_i = allocatedAmountFN_i + fxGainLoss_i` exactly, so
the settlement JE balances with no cross-line remainder juggling.

**Double-conversion guard:** the receipt emitter sets the JE event's `currency` to the
FUNCTIONAL currency (pre-converting all legs), not the tender currency. The tender is
preserved as `paymentCurrency` and `paymentExchangeRate` on the event and the DB row for
traceability. Without this, `journal-posting.service.ts` would look up an FX rate and
re-multiply the already-functional amounts — doubling the conversion.

**AR netting to zero in TC:** the AR control CREDIT leg carries the customer party
(satisfying the Layer 3 guard) and uses `allocatedAmountFN` — the functional equivalent at
the booking rate — as its amount. AR therefore nets to zero in functional across booking
and settlement, with the realized FX isolated in the `fx_gain`/`fx_loss` plug. The invoice's
`balance` and `paidAmount` track in transaction currency, netting to zero on full settlement.

**Functional-currency receipt rate guard (fix B):** the check for "is this a functional receipt
with a non-1 rate" now uses `!new Decimal(inputRate).equals(1)` rather than `inputRate !== "1"`,
so `"1.00"` or `"1.000000"` are correctly accepted.

---

## 6. The close checklist — order of operations enforced

The recommended close sequence maps directly to the Layer 4 gates now in code:

| Step | What must happen | Enforced by |
|------|-----------------|-------------|
| 1 | Reconcile AR/AP sub-ledgers | `reconcile_ar_ap_subledger` close task (manual attestation, gated before lock) |
| 2 | Revalue open FC monetary balances | `fx-revaluation.service.ts` (must run while period is still `Open`) |
| 3 | TB confirms balance | `trial-balance-table.tsx` out-of-balance banner |
| 4 | Soft-lock the period (optional) | `updatePeriodStatus` → `SoftLocked`; overrides require permission |
| 5 | Hard-lock the period | `updatePeriodStatus` → `HardLocked`; gated on `complete` close run |
| 6 | (Year-end only) Run the year-end close | `closeFiscalYear`; gated on every period's `complete` close run |

Step 2 must run before step 4 because the FX reval service asserts the closing period is
`Open` before posting. A period locked at step 4 or 5 would cause the reval to fail loudly
rather than dead-letter silently.

Step 5 cannot be reached until `assertPeriodCloseRunComplete` confirms a `complete` close
run exists. A complete close run requires all tasks — including the manual AR/AP subledger
reconciliation attestation — to be resolved. This creates a hard gate between "reconcile"
and "lock" that was missing before the hardening pass.

Step 6 additionally requires `assertYearCloseRunsComplete` to pass for EVERY period in the
fiscal year — not just the last one. A single unreviewed mid-year period blocks year-end close.

---

## 7. Known deferrals — what was not built

| Item | Status | Reference |
|------|--------|-----------|
| Write-off / bad-debt path | No JE path exists; flagged for founder policy decision before implementation | `fixes-l3-arap-contract.md`; unchanged in Layer 4 |
| Purchase-return inventory credit (two-JE redesign) | Reverted; needs clearing-account design so the engine owns inventory relief separately from the settlement JE | `fixes-l3-purchase.md` §PART B |
| GL-native multi-currency aging report | Layer 5 reporting scope; not started | Layer 3 / 4 scope notes |
| FX triangulation beyond USD | `resolveExactClosingRate` supports direct forward + inverse only; no synthetic cross-rate for e.g. EUR/KWD without a USD leg | `fixes-l4-fx-reval.md` note M2 |
| Deferred reval composite index | The `(is_monetary, currency, status)` query for large tenants will benefit from a composite index; deferred as a pre-scale performance concern | `fixes-l4-fx-reval.md` (noted, not built) |
| Presentation currency / CTA | Single functional currency per entity; group reporting in a second currency (IAS 21.38-42, Cumulative Translation Adjustment) is out of scope for the current entity model | Layer 5 |
| `batchLockPeriods` (bulk admin lock) | Does not go through `assertPeriodCloseRunComplete`; it is a separate bulk admin path explicitly excluded from the audit's F2/F3 scope | `fixes-l4-period.md` residual note |
| User-created accounts derivation of `isMonetary` | Accounts created via `accounts-crud.service` or onboarding import use `DEFAULT true`; `deriveIsMonetary` is not called for user-created accounts this pass | `fixes-l4-foundation.md` out-of-scope note |

---

## The mental model

> Layer 4 is the part of the accounting engine that makes the books trustworthy across time, not
> just transaction by transaction. Four mutually reinforcing guarantees hold after this hardening
> pass. First, the trial balance balances by construction — `postDirect` enforces `Σdr = Σcr`
> exactly in both currencies before inserting, a DB CHECK backstops it, and the frontend now
> surfaces any imbalance loudly rather than trusting the user to notice. Second, the books start
> from a known state — opening balances post through the same balanced-entry pipeline, are
> idempotent by construction, carry per-party AR/AP detail, and are now blocked from being
> posted after live transactions have already occurred. Third, time is divided into sealed
> intervals — soft-lock overrides require explicit policy permission AND role membership;
> hard-lock can only be applied after the close checklist is complete; the DB trigger is the
> last defence that no application bypass can circumvent. Fourth, foreign-currency balances
> are stated correctly at period end — `is_monetary` classifies every account once (at seed
> time, via `deriveIsMonetary`), the revaluation engine filters to monetary-only, revalues
> AR/AP per-party so the Layer 3 control-account guard is satisfied, posts the gain or loss
> to 4830/7220 via the mapping table, and reverses automatically in the next open period.
> The realized side mirrors the purchase model exactly: booking rate stored on the invoice,
> settlement rate on the receipt, the functional difference isolated as a 4820/7210 plug, with
> no double-conversion. Put these four together and you have a ledger that is balanced at every
> moment, started correctly, frozen in the right order, and priced in the right currency.
