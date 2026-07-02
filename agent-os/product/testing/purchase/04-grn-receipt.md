# Purchase — Goods Receipt Notes (GRN) Testing Checklist

> Persona: **purchasing clerk / shop owner** (Kuwait, functional currency KWD at 3dp). Test every item as that person. Verify the *invariant*, not just that the button works. At every screen ask: **"what's the dumbest thing a purchasing clerk could do here?"**

- **Route(s):** `/purchase/grns`, `/purchase/grns/new`, `/purchase/grns/[id]`
- **Feature dir:** `apps/web/src/features/purchase/`
- **API:** `tenant/purchase/grns` (`GrnsController` / `GrnsService`) — `POST /`, `GET /`, `GET /:id`, `POST /:id/lines`, `PATCH /:id/lines/:lineId`, `DELETE /:id/lines/:lineId`, `POST /:id/confirm`, `POST /:id/void`
- **Depends on:** 01 Suppliers/AP Master, 02 Purchase Orders (a GRN always receives against a confirmed or partially-received PO; there is no standalone/no-PO GRN in this codebase), items/warehouses (inventory module)

---

## 0. Preconditions

- [ ] At least one confirmed (or partially-received) Purchase Order exists with lines to receive against.
- [ ] The PO's supplier is `active` (a suspended/blocked supplier blocks new receipts).
- [ ] Logged in as a user whose role includes `purchase.grn.create` / `.update` / `.confirm`; separately confirm a user *without* that permission cannot trigger create/confirm/void (server-side check, not just hidden buttons).
- [ ] Fiscal period for the receipt date is open (or note if testing the soft-lock/hard-lock path).
- [ ] Know Al-Asala's dataset: KWD 3dp, no VAT — every GRN's `hasSupplierInvoice` / input-VAT path should be exercised knowing input VAT is not really used here.

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### GRN list

- [ ] **List loads** — shows all GRNs for this tenant; columns include GRN number (`GRN-XXXX` once confirmed; `DRAFT-<uuid>` placeholder before), receipt date, supplier, PO, status (`draft` / `confirmed` / `voided`), total.
  - [ ] Empty state (no GRNs yet) shows a helpful prompt, not a blank/broken screen.
  - [ ] Pagination correct and stable across pages; filters preserved when navigating pages.
- [ ] **Filter/search** — filter by supplier, PO, status, date range; reset clears all filters.
- [ ] **Drill-down** — clicking a row opens the GRN detail; back navigation returns to the same page/scroll position.

### Create GRN (Draft) against a PO

- [ ] **PO picker** is a searchable picker (not free-text), scoped to POs in a receivable status (`confirmed` / `partially_received`). Selecting a closed/cancelled PO is not offered.
- [ ] Supplier, branch, and currency are derived from the selected PO (read-only on the GRN, not re-enterable) — the exchange rate is frozen from the PO at draft creation.
- [ ] **Add line** — picks a PO line, receives at the PO's unit cost by default (overridable); quantity entered in the item's display/pack unit, converted and stored in base units (`resolvePackUnit`).
  - [ ] Serial-tracked items: line requires exactly `receivedQty` distinct serial numbers before it can be confirmed (validated at confirm, not silently accepted with zero/wrong count).
  - [ ] Batch-tracked items: line requires a non-empty batch number; an expiry date before the receipt date is rejected ("cannot receive already-expired stock").
  - [ ] Warehouse defaults from the PO line but is editable per line.
- [ ] **Update/remove line** — only while the GRN is `draft`; totals recompute (tax preview anchored to the receipt date, not "now").
- [ ] **hasSupplierInvoice toggle** — when the supplier's invoice is in hand at receipt (3-way match at once), input VAT lines are recognised at confirm; when off, no VAT is recognised at receipt (billed later). For Al-Asala (no VAT) this toggle should have no visible tax effect either way.
  - [ ] Loading state shown while saving; button debounced.
  - [ ] Error on save shows a user-friendly message; entered data is NOT cleared.
- [ ] **Warn before navigation** away from an unsaved/partially-filled draft (data-loss guard).

### Confirm GRN (`draft` → `confirmed`)

- [ ] **Confirm action** requires confirmation dialog: shows supplier, PO, line items with quantities and costs. Cancel returns to the draft with all data intact.
- [ ] After confirming:
  - [ ] Status changes to `confirmed`; a gapless `GRN-XXXX` number is assigned (replacing the `DRAFT-` placeholder).
  - [ ] On-hand stock increases at the receiving warehouse for every line, by `receivedQty` (base units).
  - [ ] A stock ledger entry is created per line at the line's `unitCost` (movement type `grn_receipt`), `sourceDocumentType = 'grn'`.
  - [ ] The source PO line's `receivedQty` is incremented; the PO auto-transitions: all lines fully received → `received`, some → `partially_received`.
  - [ ] Confirm button is debounced; double-click or rapid re-click does NOT confirm twice / does not create two GRN numbers.
- [ ] **Over-receipt tolerance:** receiving beyond the ordered qty × (1 + tolerance%) requires a manager PIN approval (`approvedBy` + `approvalPin`, a DIFFERENT user via SoD, permission `purchase.grn.confirm`). Without it, confirm is rejected (422) with a clear message. With a valid approval, confirm succeeds and the over-receipt is recorded.
- [ ] **Cannot confirm** a GRN with zero lines (422, clear message).
- [ ] **Cannot confirm against a no-longer-receivable PO** — if the underlying PO was cancelled/closed after the draft GRN was opened, confirm is rejected (422), not silently posted.
- [ ] Confirm is rate-limited (tight per-IP throttle, since it verifies a PIN inline) — verify a burst of confirm attempts doesn't bypass the throttle or duplicate postings.

### Void GRN (`confirmed` → `voided`)

- [ ] **Void action** requires manager-PIN approval (a DIFFERENT manager, SoD) with a reason.
- [ ] **Void is blocked once any line has been billed** (`billedQty > 0`) — the UI surfaces a server-computed `canVoid` flag so the Void button is never offered on a billed GRN; server also rejects it directly (409) with "use a purchase return to reverse billed receipts."
- [ ] After a successful void:
  - [ ] Stock at the receiving warehouse decreases back to the pre-receipt level (compensating reversal, not a hard delete of the original ledger row).
  - [ ] The PO line's `receivedQty` is decremented; the PO reopens (`confirmed` / `partially_received`) as appropriate — never driven negative.
  - [ ] Any serial units created by this GRN are released (deleted, so the same serial number can be re-received on a corrected GRN) — UNLESS a unit was already sold/transferred, in which case the void is rejected outright (never a partial/corrupted void).
  - [ ] GL: the receipt JE (Dr Inventory / Cr GR/IR or AP) is exactly reversed — net-zero across confirm + void.
- [ ] **Double-void (idempotency):** voiding an already-voided GRN is a safe no-op (same response, no second reversal, no duplicate JE).
- [ ] **The "receive twice" double-submit guard:** two browser tabs confirming the same draft GRN simultaneously — only one confirm succeeds; the second gets a clear "no longer draft" / conflict error, never a double stock increase.

---

## 2. Accounting / domain invariants

> Cross-cutting invariants are in the module `README.md`. Submodule-specific invariants below.

- [ ] **GRN confirm posts Dr Inventory 1141 (at cost) / Cr GR/IR clearing** — the credit leg is **Accounts Payable 2111 (party-tagged supplier)** when `hasSupplierInvoice = true`, else **GRN Accrual 2121 (no party — it is NOT a control account)**. Confirm this split is correct for both toggles.
- [ ] **Input VAT is only recognised at receipt when `hasSupplierInvoice = true`.** With it off, the GRN posts net cost only (no VAT lines) — the VAT is picked up later when the bill confirms. For Al-Asala (no VAT tenant) both paths should show zero/blank input VAT.
- [ ] **Stock ledger entry at receipt cost** ties exactly to the JE's inventory debit amount (no rounding drift between the ledger and the GL, at KWD 3dp).
- [ ] **Over-receipt is measured net of returns**: cumulative = (PO line's `receivedQty` − `returnedQty`) + this GRN's qty, compared against `orderedQty × (1 + tolerance%)`. A prior purchase return correctly re-opens headroom for a new receipt.
- [ ] **Void is the exact compensating contra** of confirm: inventory, PO received-qty, and GL all net to zero across confirm + void — never a silent partial reversal.
- [ ] **Void is blocked once billed** — this is the CRITICAL invariant protecting AP: a GRN that has fed a confirmed bill can never be voided directly (would orphan AP against reversed stock); it must go through a purchase return.
- [ ] **FX fail-loud:** a GRN in a non-functional currency with no positive frozen exchange rate is rejected at confirm (422) rather than posting an un-converted cost into WAC + the JE. Not reachable in the Al-Asala dataset (KWD-only) — verify the guard exists in code even if untestable live.

---

## 3. Edge cases & defensive UX — "the dumbest thing a purchasing clerk could do here"

- [ ] **Receive against a fully-received / closed / cancelled PO.** Blocked at create (`requireReceivableOrder`) and re-checked under lock at confirm (H1) — a PO cancelled *after* the draft GRN was opened must still block the confirm.
- [ ] **Receive from a suspended supplier.** Blocked at draft create (`requireActiveSupplier`); a supplier suspended after a confirmed-but-unbilled receipt does not retroactively break the existing GRN.
- [ ] **Serial item received with the wrong count of serial numbers** (too few, too many, duplicates). Rejected at confirm with a specific count-mismatch message — never silently truncated or padded.
- [ ] **Batch item received with no batch number, or an expiry date in the past.** Rejected at confirm — never silently receives unlabeled or already-expired stock.
- [ ] **Confirm an empty GRN (no lines).** Blocked (422).
- [ ] **Double-confirm race (two tabs).** Only one wins; the second gets a clean conflict, no double stock post.
- [ ] **Void a billed GRN.** Blocked outright — Void button hidden (server-computed `canVoid`) and the API independently rejects it (409) if called directly.
- [ ] **Void twice.** Idempotent no-op, not a double reversal.
- [ ] **Over-receive by a hair over tolerance, no PIN provided.** Rejected (422) with a clear message telling the clerk approval is needed — never silently receives the excess.
- [ ] **RTL / Arabic UI:** all labels, supplier/item names, and status text render correctly in RTL. Quantity/cost inputs stay LTR.
- [ ] **Currency display:** all cost fields at KWD 3dp via the shared currency-precision util — never hardcoded 2dp/USD.
- [ ] **Client + server validation both reject bad input** — try submitting a negative quantity or unit cost directly against the API (bypassing the client) and confirm the server rejects it.

---

## 4. Cross-module / integration

- [ ] **Stock levels (`/inventory/stock`)** update at the receiving warehouse immediately after confirm — no stale on-hand shown.
- [ ] **Stock ledger** entry has `source_document_type = 'grn'` and `source_document_id` resolving to the correct GRN; drill-down from the ledger opens the right GRN record.
- [ ] **GL drill-down:** navigating from the journal entry's source link opens the correct GRN — no 404.
- [ ] **Bill-from-GRN (05):** a confirmed, unbilled GRN line appears as billable remainder on the "create bill from GRN" flow; the remainder decreases correctly as partial bills are matched, and a fully-billed line no longer offers itself for billing.
- [ ] **Landed cost (06):** a confirmed GRN is a valid target for a landed-cost allocation; the GRN's lines are the allocation basis (by value / by weight / manual).
- [ ] **PO detail (02):** the PO shows this GRN in its receipt history, with the correct received quantity per line and the correct auto-transitioned status.
- [ ] **Permissions:** a user with `purchase.grn.read`/`list` only can view but not create/confirm/void — buttons hidden AND API rejects with 403.

---

## 5. Known gaps (from recon — verify or track)

- **No standalone / no-PO GRN path** (LOW, by design): unlike the checklist prompt's mention of "standalone GRN," the current `GrnsService.create` REQUIRES a receivable Purchase Order (`requireReceivableOrder`) — there is no PO-less receipt flow at the GRN layer. The PO-less flow for Al-Asala's "just record a bill on arrival" reality lives entirely in **Direct Purchase (03)**, which composes a GRN+bill in one transaction. Confirm this is the intended architecture (it matches the module README's "dual-path" framing) rather than a missing feature.
- **Over-receipt tolerance is tenant-global**, not per-supplier or per-item (HIGH to verify): `resolveOverReceiptTolerance` reads a single `grnOverReceiptTolerancePercent` from `tenant_identity`. Confirm the tenant setting screen surfaces this clearly, since a generous global tolerance could quietly let over-receipts through without approval.
- **Serial/batch validation only runs at confirm, not at add-line time** (MEDIUM): a clerk can build out an entire draft with wrong/missing serials and only find out at confirm. Verify the frontend surfaces a live per-line validation hint before the clerk hits Confirm, to avoid a late, confusing rejection.
- **FX fail-loud guard is untestable in the Al-Asala dataset** (LOW): KWD-only tenant, so the `resolveFrozenRate` 422 path cannot be exercised live; verified by code read only.

---

## Sign-off — CLOSED 2026-07-02

Closed by founder decision. State at close:

- [x] **Findings logged + fixed:** #04-1 (receive-lines UI clarity — hide batch/expiry/serial for non-tracked items, plain-language ⓘ hints) FIXED live (`8de2d9ee`, `4dfc9d51`). This was the only defect surfaced.
- [x] **Accounting/void/over-receipt invariants verified by CODE-READ (recon), balance-proofed against as-built logic** — NOT yet live-clicked on a confirmed PO:
  - Confirm posts Dr Inventory 1141 / Cr GR-IR, credit leg = AP 2111 (party-tagged) when `hasSupplierInvoice`, else GRN Accrual 2121 (no party). Confirmed at `purchase-accounting.listener.ts:714-727`.
  - Stock ledger (`grn_receipt`, at line unitCost) ties to the JE inventory debit (shared 6dp source). PO `receivedQty` increment + auto-transition. Gapless GRN- numbering under `FOR UPDATE`.
  - Void = exact compensating reversal (stock + PO qty + GL net-zero, never hard-delete); billed GRN can NEVER be voided — server rejects 409 independent of the hidden button (`grns.service.ts:766-772`). Double-void idempotent.
  - Over-receipt net-of-returns → different-manager PIN (SoD, `purchase.grn.confirm`), else 422. FX fail-loud 422 guard present (untestable on KWD-only).
- [ ] **DEFERRED to founder:** the full live two-track click-through (receive full/partial/over, void unbilled, void-after-bill 409, double-confirm race) against a real confirmed PO. Two-track guide is written and ready if you want to run it later.

> Net: 04-GRN closed on code-read verification + the one live UI fix. No wrong-number or broken-invariant defects found. Live exercise of the confirm/void GL path on a real PO remains the one open item, folded into the purchase hardening program's existing "verify a full purchase cycle end-to-end on a real dev tenant" go-live TODO.
