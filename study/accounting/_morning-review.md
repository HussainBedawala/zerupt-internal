# Accounting Module — Founder Morning Review (2026-06-21)

The entire accounting module, Layers 0–5, is now hardened and merged to main.
This is the full overnight summary for every layer. Read top-to-bottom or jump to
the ACTION LIST at the bottom.

---

## Addendum (2026-06-22) — systemic soft-lock override fix (merged d95f69eb)

While finishing the Layer-5 backlog a CRITICAL systemic gap was found and fixed:
**8 user posting flows** (sales invoice / receipt / credit-note; purchase invoice /
payment / return / GRN / landed-cost) accepted a `softLockOverrideReason` to post into a
**soft-locked** period but never (a) verified the override was *permitted* (so the soft
lock was bypassable by any user just by typing a reason) nor (b) threaded the override to
the posting engine (so the JE silently **dead-lettered** while the document showed posted).
All now call `assertSoftLockOverrideAllowed` (owner/policy gated) before any side effect and
thread `softLockOverride` through to the engine so the JE actually posts. The **inventory
accounting leg** (COGS / COGS-reversal / purchase-return 1192→1141 relief), fired via a
second event, had the same hole (its domain-event Zod schema stripped the field) — fixed end
to end so BOTH JEs post. `journal-reversal` was already correct. Closes the systemic item
flagged at the end of the Layer-5 review. No migration; verified by 1838 tests + clean boot.

---

## Layer 0 — Ledger Foundation (merged bcfc9cd5)

**What it is:** The single posting primitive. Every economic event becomes one balanced,
immutable, atomically-written, idempotent journal entry.

**What was hardened:**
- `postDirect()` — the one chokepoint. Checks `Σdr = Σcr` in BOTH functional and TC before
  insert; DB `CHECK` constraint backstops.
- `postFromEvent` delegates to `postDirect`; no second path exists.
- Year-end, opening-balance, inventory-recon, reversal, manual-draft all route through
  `postDirect` via `W2` and `W3` waves.
- Transactional outbox for fire-and-forget events (COGS, FX, POS, cheques); poller
  marks complete only on success.
- Migrations 0097 (CHECKs on type/normal_balance/cost_centers) + 0098 (totals-sync trigger +
  fiscal hard-lock DB trigger).

**Key correctness fix:** 4 failing unit tests (`accountId override`, rounding) fixed; DI cycle
in JournalPosting↔FiscalPeriod↔YearEnd resolved with `forwardRef`; verified by real `node
dist/main` boot (metadata test alone is insufficient).

---

## Layer 1 — Chart of Accounts (merged a8becbff)

**What it is:** Every posting and report keys off correct account typing. The COA is the
schema for the whole accounting model.

**What was hardened:**
- DB CHECKs on `type`, `subType`, `normalBalance` — mis-seeded COA now rejected at DB level.
- System-role binding table: 21 roles, none hardcoded in posting logic.
- `deriveIsMonetary` classification function (non-monetary: inventory subtree 1140, PPE subtree
  1200, prepayments header 1160; monetary: everything else including 1162 Input Tax Recoverable).
- Seed pipeline derives `isMonetary` at seed time; user-created accounts default `true`.
- Multi-region COA overlays; bilingual (AR + EN) account names verified.

---

## Layer 2 — Posting Pipeline (merged 293610b4)

**What it is:** The bridge from business events (POS sale, invoice, payment, return) to
journal entries. One audited code path, not five.

**What was hardened:**
- All listeners (POS, sales, purchase, inventory, cheque) route through the outbox → `postFromEvent`.
- `buildJePayload` enforces balance before emitting; dead-letter lifecycle for failed events.
- POS: cash/card/mixed tender, VAT, COGS, return, void, shift close — all balanced.
- Purchase: GRN accrual, invoice, recoverable/non-recoverable/reverse-charge VAT, payment,
  advance, return, landed costs.
- Cheque: full lifecycle (received/deposited/cleared/bounced/cancelled, in/out).
- DI cycle (`JournalPosting↔FiscalPeriod↔YearEnd forwardRef`) resolved; verified by real boot.

---

## Layer 3 — Sub-ledgers & Valuation (merged 9acf650c)

**What it is:** AR/AP control vs sub-ledger (party), inventory WAC→COGS, VAT/GST.

**What was hardened:**
- **AR/AP party slot (CRITICAL):** Every live AR/AP control line was posting `party_id = NULL` —
  the GL party sub-ledger was structurally empty. Plumbed `partyType`/`partyId` end-to-end
  through all listeners. DB trigger (migration 0100) rejects party-less control lines.
- `postDirect` guards: control⇒party, party⇒control, party existence check, manual JEs blocked
  from control accounts.
- New `SubledgerReconciliationService`: 3-way tie-out (GL control vs Σ GL-party vs Σ
  invoices.balance) + `reconcile_ar_ap_subledger` close checklist task.
- Inventory `decrementOutbound` now recomputes `total_value = on_hand × WAC` (was subtractive →
  drifted); negative-stock COGS true-up on next receipt.
- POS return now carries `taxLines[]` with `taxCodeId` (was silently dropped from VAT output).
- Migration 0101 (party enum value); migration 0100 (trigger).

**Key correctness fix (reviewer-caught):** Reconciliation used `status IN ('confirmed','overdue')`
but `'overdue'` is not in the enum → Postgres THROWS at runtime. The 12 unit tests passed
(mocked query builder). Always validate against real Postgres.

---

## Layer 4 — Period & Balance Integrity (merged 5d4a006f)

**What it is:** Integrity over time — trial balance, opening balances, period close, year-end,
FX revaluation (IAS 21).

**What was hardened:**

| Area | What changed |
|------|-------------|
| **Unrealized FX revaluation** | Was dead-lettering (JE lines had no accountId). Now posts correctly: offset leg carries the revalued account directly; gain/loss via mapping 4830/7220 (migration 0105). Revalues ONLY monetary FC balances (`is_monetary`, migration 0104). AR/AP revalued per-party (satisfies Layer-3 control⇒party guard). Reverse-next-period + idempotent; fails loud on missing closing rate. |
| **Sales-side realized FX** | `exchangeRate` added to salesInvoices + salesReceiptVouchers (migration 0103). Per-allocation realized FX: `cashFunctional − allocatedAmountFN = gain/loss`. AR nets to zero. |
| **Soft-lock override** | Now requires policy `allowSoftLockOverride = true` AND role membership (or Owner). Was overridable by any user with a free-text reason. |
| **Year-end hard-close** | Gated on complete close runs across EVERY period in the FY (not just the last). Reopen restores each period's prior status (migration 0102 `status_before_close`). |
| **TB & reconciliation** | Both recon services now use `BALANCE_AFFECTING_JE_STATUSES = ['posted','reversed']`, matching the TB. Reversed control lines no longer cause false tie-out mismatches. |
| **Opening balance guard** | Rejected if live (non-opening) transactions already exist on/after the opening date. |
| **Frontend TB** | Out-of-balance banner (loud, role="alert") + informational note for branch-scoped views. |

---

## Layer 5 — Reporting (merged layer-5-closeouts)

**What it is:** P&L, Balance Sheet, Cash Flow Statement, AR/AP Aging — pure derivation from
the ledger.

**What was hardened:**

### P&L
- **Closing-JE exclusion (HIGH):** Year-end closing sweep excluded via `NOT IN (closing_entry_id
  subquery)`. Without this, P&L on a closed FY shows zero net profit.
- Date column aligned to `journalEntryLines.postingDate` (matches TB).

### Balance Sheet
- **Contra-asset sign (HIGH):** `closingBalance()` was `normalBalance`-driven. Accumulated
  Depreciation (type=asset, normalBalance=credit) was presented as a positive addition to
  assets — overstating total assets by 2× accumulated depreciation. Fixed: sign now
  type-driven (`debit − credit` for asset/expense, `credit − debit` for liab/equity/income).

### Cash Flow Statement
- **IAS 7 `effectOfFxOnCash` (MEDIUM):** FX revaluation on foreign cash was folded into
  operating. Now extracted as a separate reconciling line. Footing unchanged.
- **BS↔CFS cash pin (MEDIUM):** Pinning test proves `closingCash = cash-assets − overdraft`
  (IAS 7-correct; overdraft is in both cash pools).

### AR/AP Aging — complete rewrite
- **Was:** reads `invoices.balance` (denormalized, functional-only, misses opening-import items,
  cannot tie to TB). Two CRITICAL findings.
- **Now:** GL-native. Derives from `journal_entry_lines` on the system-role-resolved control
  account. `grandTotalFunctional` = TB AR/AP control balance by construction.
- `due_date` added to JE lines (migration 0106); backfill from invoice tables; threading through
  all listeners and `postDirect`.
- Multi-currency: one row per `(party, currency)` in TC; functional for grand total.
- FIFO settlement: credits applied to oldest charges first.
- Opening-import items included automatically.

### Three new features completing Layer 3/4 deferrals

| Feature | JE | Key design |
|---------|----|------------|
| **AR write-off** | DR 6430 Impairment Loss / CR 1131 AR control (party) | Owner-gated, `@Audited`, idempotent, open-balance guard. Migration 0108. |
| **Purchase-return two-JE clearing** | AP-side: DR payable/CR clearing (doc cost) ± variance. Inventory-side: DR clearing/CR inventory (WAC) ± variance. | Clears to zero; inventory at WAC not doc cost; variance to 5210 not COGS 5100. Migration 0109. |
| **FX on cash (IAS 7)** | No new JE — reclassifies reval offset legs that land on cash accounts | `effectOfFxOnCash` extracted from operating into its own line. Zero for single-ccy tenants. |

### Performance indexes
Migration 0107: `jel_control_party_aging_idx` (partial composite for aging) + 3 supporting indexes.

---

## DECISIONS / ITEMS FOR FOUNDER

Priority ordered. Items marked ✅ are DONE this session.

### Ops — do before going live

| # | Item | Action |
|---|------|--------|
| **A** | **Prod migrations 0106-0109** | Merge `layer-5-closeouts` → Railway pre-deploy hook applies them automatically. MUST happen before any tenant uses reporting or the new features. |
| **B** | **Commit hash for layer-5-closeouts** | Log it in `_hardening-log.md` layer-5 row (founder's session, after merge). |

### Accounting module — closed items (no action needed)

| Item | Status |
|------|--------|
| Write-off / bad-debt path | ✅ DR 6430/CR 1131, Owner-gated, migration 0108 |
| Purchase-return inventory at WAC | ✅ Two-JE clearing, migration 0109 |
| GL-native multi-currency aging | ✅ Migration 0106, full rewrite |
| Sales-side realized FX | ✅ Done in Layer 4 (migration 0103) |
| Reval composite / report indexes | ✅ Migration 0107 |

### Open accounting decisions

| # | Item | Decision needed |
|---|------|----------------|
| **1** | **FX triangulation beyond USD** (DEV-427) | Reval + realized FX assume a direct forward rate or USD pivot. EUR/KWD cross-rate without USD leg requires synthetic triangulation. Deferred by founder decision. Schedule when a multi-pivot tenant arrives. |
| **2** | **`batchLockPeriods` close-run gate** | Bulk admin lock path does NOT check close-run completion. It is explicitly excluded from the hardening scope (it is an admin emergency tool, not the normal close flow). Confirm this is intentional or add the gate. |

### Minor / cosmetic (no decision blocking go-live)

| # | Item |
|---|------|
| C | `Owner` bare-string constant — extract a shared `SYSTEM_OWNER_ROLE` constant from fiscal-period + permission.service when convenient. No correctness impact. |
| D | Aging per-row functional bucket values not exposed (rows show TC; totals show functional) — a foot-gun for report UI code. Add `funcCurrent` etc. to `ArAgingRow` before building the frontend aging table. |
| E | User-created accounts always default `isMonetary = true`; `deriveIsMonetary` not called for user-created accounts. Conservative and safe for MVP. |

---

## The one sentence

> The accounting module is now Layers 0–5 hardened: every economic event posts through one
> balanced chokepoint, the COA is enum-constrained and correctly classified, all business
> flows route through the outbox, AR/AP control lines carry party by DB-enforced invariant,
> period close is gated and ordered, FX is stated correctly at period end, and every financial
> report derives from the same ledger rows the trial balance uses — tying to the cent by
> construction, with no second source of truth.
