# Purchase — Landed Costs Testing Checklist

> Persona: **purchasing clerk / shop owner** (Kuwait, functional currency KWD at 3dp, no VAT). Al-Asala's owner **rarely uses this screen in daily reality** — freight/duty allocation is not a normal auto-parts-shop workflow — but it must be tested for completeness since it revalues stock and posts real GL entries. Test every item as that person. Verify the *invariant*, not just that the button works. At every screen ask: **"what's the dumbest thing a purchasing clerk could do here?"**

- **Route(s):** `/purchase/landed-costs`, `/purchase/landed-costs/new`, `/purchase/landed-costs/[id]`
- **Feature dir:** `apps/web/src/features/purchase/`
- **API:** `tenant/purchase/landed-costs` (`LandedCostsService`) — create, add/update/remove component, `POST :id/post`, `POST :id/reverse`, list, get
- **Depends on:** 04 GRN (a landed cost always targets one or more confirmed GRNs)

---

## 0. Preconditions

- [ ] At least one confirmed GRN exists in the target branch (landed cost targets are branch-scoped — a landed cost can only target GRNs received at its OWN branch).
- [ ] For `by_weight` allocation testing: at least one targeted item has `weightKg` populated on its item record; at least one does NOT (to test the missing-weight guard).
- [ ] Logged in as a user whose role includes `purchase.landedcost.post` / `.reverse`; separately confirm a user *without* the permission cannot trigger post/reverse server-side.
- [ ] Fiscal period for the document date is open (or note if testing the soft-lock/hard-lock path).
- [ ] Al-Asala is KWD-only — the landed cost currency must equal the branch's functional currency (KWD); there is no foreign-currency freight to test.

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Landed costs list

- [ ] **List loads** — shows all landed costs; columns include number (`LC-XXXX` once posted), document date, status (`draft` / `posted` / `reversed`), total amount.
  - [ ] Empty state clear, not blank/broken.
  - [ ] Pagination correct and stable; filters preserved.
- [ ] **Filter/search** by status, branch, date range; reset clears all.
- [ ] **Drill-down** opens the detail; back returns to the same page/scroll.

### Create landed cost (Draft)

- [ ] **Target GRN picker** — searchable, multi-select, scoped to `confirmed` GRNs in the chosen branch only. Selecting a GRN from a different branch, or a non-confirmed (draft/voided) GRN, is rejected.
- [ ] **Currency** must equal the branch's functional currency (KWD for Al-Asala) — the form should default to it and reject/disable a mismatched currency at create (422 if bypassed).
- [ ] **Add component:** description, amount, `creditAccountType` (`payable` / `bank` / `accrual`), optional `creditEntityId` (e.g. the freight forwarder as supplier when `payable`), `allocationMethod` (`by_value` / `by_quantity` / `by_weight` / `manual`).
  - [ ] `manual` allocation requires at least one manual line (`grnLineId` + `amount`) — rejected if omitted or empty.
  - [ ] Loading state while saving; button debounced; error message user-friendly; data not lost on error.
- [ ] **Update/remove component** — only while `draft`; total recomputes live as the sum of all components.
- [ ] **Warn before navigation** away from an unsaved/partially-filled draft.

### Post landed cost (`draft` → `posted`)

- [ ] **Post action** requires a confirmation dialog showing all components, total, and target GRNs. Cancel returns to the draft with data intact.
- [ ] **Manual-allocation gate:** if ANY component uses `manual` allocation, posting requires a manager PIN approval (`approvedBy` + `approvalPin`, permission `purchase.landedcost.post`) — without it, post is rejected (422).
- [ ] After posting:
  - [ ] Status → `posted`; a gapless `LC-XXXX` number is assigned.
  - [ ] **Allocation sums exactly to the component total** — for EVERY component, Σ(allocated amounts across all targeted GRN lines) = the component's `amount`, to the KWD 3dp precision, with **no rounding leak** (verify the last line absorbs the rounding remainder rather than every line independently rounding and drifting).
  - [ ] Stock is revalued: WAC recomputed per item across the item's GLOBAL on-hand pool (not just this receipt's units) — verify the new WAC = (existing on-hand value + allocated uplift) / on-hand qty.
  - [ ] If some of the receipt's own units were already sold before the landed cost posted, the allocated amount SPLITS between an inventory uplift (remaining units) and a retroactive COGS reclass JE (sold units) — verify both pieces sum exactly to the allocated delta for that line (no residual).
  - [ ] Post is debounced; double-click does NOT post twice / create two LC numbers.
- [ ] **`by_weight` allocation with a missing item weight:** *verify the guard* — a targeted GRN line whose item has no `weightKg` should either block posting with a clear message or be excluded from the weight basis in a documented, non-silent way (see Known gaps).
- [ ] **Cannot post** a landed cost with zero components (422).

### Reverse landed cost (`posted` → `reversed`)

- [ ] **Reverse action ALWAYS requires manager-PIN approval** (a DIFFERENT manager, SoD, permission `purchase.landedcost.reverse`) — unlike GRN/bill void, there is no "unapproved reversal" path at all.
- [ ] After a successful reverse:
  - [ ] GL: per-component contra JE — Dr the original credit account (payable/bank/accrual), Cr Inventory — un-capitalising the allocated amount exactly.
  - [ ] Stock: a SIGNED (negative) inventory event un-revalues WAC back toward its pre-allocation value; if the reversal would drive the on-hand pool value negative (units sold/adjusted since the forward post), the engine **clamps WAC to zero and logs a warning** rather than producing a negative WAC — verify this clamp path is visible/traceable, not a silent data corruption.
  - [ ] The retroactive COGS reclass (if any was posted on the forward allocation) is also reversed via a mirrored contra JE.
- [ ] **Double-reverse (idempotency):** reversing an already-reversed landed cost is a safe no-op (returns current state, no second contra).

---

## 2. Accounting / domain invariants

> Cross-cutting invariants are in the module `README.md`. Submodule-specific invariants below.

- [ ] **Post allocates: Dr Inventory 1141 (component amount, per GRN line share) / Cr per `creditAccountType`** — `payable` → Accounts Payable 2111 (party-tagged supplier when `creditEntityId` is set), `bank` → Bank 1121 (no party), `accrual` → **Accrued Expense / Landed Cost Accrual 2122** (no party) — **note this is a DIFFERENT account from the GRN's own receipt accrual (2121)**; confirm the two never get conflated in the chart of accounts or in reports.
- [ ] **Allocation basis correctness:**
  - `by_value`: allocated proportional to each GRN line's `receivedQty × unitCost`.
  - `by_quantity`: allocated proportional to each GRN line's `receivedQty`.
  - `by_weight`: allocated proportional to each GRN line's `receivedQty × item.weightKg`.
  - `manual`: allocated exactly per the stored manual lines (no recomputation).
  - [ ] Every allocation row's `grnLineId` genuinely belongs to one of the landed cost's targeted GRNs — an allocation to an unrelated line is rejected (422).
- [ ] **WAC uplift ties to the JE:** the inventory-listener's WAC recompute uses the SAME `allocatedCostDelta` the accounting listener capitalised — no drift between the two engines' view of "how much landed cost hit this item."
- [ ] **COGS reclass posts to `cogs_adjustment` (5100-adjacent), not silently absorbed into inventory** — when part of a receipt was already sold, that slice's landed cost is expensed retroactively via a distinct JE leg, separately visible from the on-hand uplift.
- [ ] **Reverse is the exact contra** — GL, WAC, and any COGS reclass all net to zero across post + reverse (bar the documented negative-WAC clamp edge case, which should be flagged, not silently absorbed).
- [ ] **FX / functional-currency guard:** a landed cost in a non-functional currency is rejected at BOTH create and post (422) — "enter the charge in {functionalCurrency}." Not reachable live in the Al-Asala (KWD-only) dataset; verify by code read.

---

## 3. Edge cases & defensive UX — "the dumbest thing a purchasing clerk could do here"

- [ ] **Target a GRN from a different branch.** Rejected at create (422) — cross-branch cost capitalisation is blocked.
- [ ] **Target a draft or voided GRN.** Rejected ("only confirmed GRNs can be targeted").
- [ ] **Post with a `manual` component but no PIN approval.** Rejected (422), clear message.
- [ ] **Post with a `manual` component whose manual lines reference a GRN line NOT among the targeted GRNs.** Rejected (422).
- [ ] **`by_weight` allocation where every targeted item has zero/missing weight.** *Verify the guard fires* rather than silently allocating zero to every line (see Known gaps).
- [ ] **Double-post race (two tabs).** Only one wins; second gets a clean conflict, no double capitalisation.
- [ ] **Reverse without PIN.** Always rejected — there is no unapproved reversal path for landed costs (stricter than GRN/bill void).
- [ ] **Reverse a draft (never-posted) landed cost.** Rejected (409, "only a posted landed cost can be reversed").
- [ ] **Reverse twice.** Idempotent no-op.
- [ ] **Reversal that would drive WAC negative** (units sold since the forward post). Clamped to zero with a logged warning — verify this doesn't silently corrupt future COGS; flag it as visible to an accountant/founder, not buried in logs only.
- [ ] **RTL / Arabic UI:** all labels, descriptions render correctly in RTL.
- [ ] **Currency display:** KWD at 3dp via the shared precision util.
- [ ] **Client + server validation both reject bad input** — negative component amount, zero total, malformed manual-line data submitted directly against the API.

---

## 4. Cross-module / integration

- [ ] **GRN detail (04):** a posted landed cost is visible from the targeted GRN's detail (or at least discoverable) so a clerk can see why a receipt's stock value changed after the fact.
- [ ] **Stock levels (`/inventory/stock`):** on-hand value at the affected warehouse updates immediately after post (new WAC reflected) and after reverse (WAC un-revalued).
- [ ] **Valuation report (`/reports/inventory-valuation`):** total inventory value increases by exactly the posted landed cost total (on-hand uplift portion) and reflects the COGS reclass correctly for the sold portion — no value created or destroyed net of both legs.
- [ ] **GL drill-down:** clicking through from a journal entry's source link opens the correct landed cost record — no 404.
- [ ] **Supplier payments / AP aging (07/09):** when `creditAccountType = payable`, the landed cost's AP credit appears correctly against the freight-forwarder supplier's balance, distinct from the goods supplier's balance.
- [ ] **Permissions:** a user with read-only access can view but not add components/post/reverse — hidden AND API 403s.

---

## 5. Known gaps (from recon — verify or track)

- **`by_weight` allocation with a missing item weight — behavior not confirmed from a read of `landed-costs-allocation.math.ts`** (HIGH to verify): the service passes `weightKg ?? null` into the allocation basis; whether `allocateByWeight` throws, skips zero-weight lines, or silently divides by a zero/undefined weight was not directly inspected in this pass. **Test this explicitly**: target a GRN with a mix of weighted and unweighted items on a `by_weight` component and confirm the system either (a) rejects post with a clear "item X has no weight" message, or (b) documents and correctly handles a partial-weight basis. A silent zero-division or mis-allocation here is a real financial bug.
- **Landed Cost Accrual (2122) vs GRN Accrual (2121) — easy to confuse in reporting** (MEDIUM): these are deliberately DIFFERENT accounts (freight-pending-bill vs goods-pending-bill). Verify the chart of accounts / trial balance clearly labels both so a founder reviewing the books doesn't conflate them.
- **Negative-WAC clamp on reversal is a logged warning only, not a user-facing alert** (MEDIUM): `LandedCostListener.handleLandedCost` logs a warning but does not appear to surface anything to the UI/founder when the clamp fires. Confirm whether this should raise a visible flag (e.g. a data-quality alert) rather than being buried in server logs only.
- **FX / functional-currency guard untestable in the Al-Asala dataset** (LOW): KWD-only tenant; verified by code read only (`assertFunctionalCurrency`).
- **Not part of Al-Asala's daily reality** (LOW, by design per persona note): this submodule is tested for completeness, not because the shop uses it regularly — treat any MEDIUM/LOW findings here as lower urgency than the primary-flow submodules (03/04/05).

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Full post → reverse recon verified: allocation sums exactly to component totals (no rounding leak), WAC round-trips correctly, GL nets to zero.
- [ ] `by_weight` missing-weight behavior explicitly tested and documented (not assumed).
- [ ] Manual-allocation PIN-approval gate exercised live.
- [ ] Findings logged in `_findings.md`.
