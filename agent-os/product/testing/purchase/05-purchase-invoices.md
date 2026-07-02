# Purchase — Purchase Invoices / Bills Testing Checklist

> Persona: **purchasing clerk / shop owner** (Kuwait, functional currency KWD at 3dp, no VAT). This is a **primary daily flow** — Al-Asala's owner mostly just records a supplier bill the moment stock arrives. Test every item as that person. Verify the *invariant*, not just that the button works. At every screen ask: **"what's the dumbest thing a purchasing clerk could do here?"**

- **Route(s):** `/purchase/invoices`, `/purchase/invoices/new`, `/purchase/invoices/[id]`
- **Feature dir:** `apps/web/src/features/purchase/`
- **API:** `tenant/purchase/invoices` (`PurchaseInvoicesService`) — create, `POST fromGrn`, add/update/remove line, `POST :id/confirm`, `POST :id/void`, list, get
- **Depends on:** 01 Suppliers/AP Master (always), 04 GRN (for 3-way match), 02 Purchase Orders (for 2-way reference via GRN)

---

## 0. Preconditions

- [ ] At least one active supplier exists (Al-Asala: S-001 Gulf Parts Distribution, S-002 Shuwaikh Auto Supply).
- [ ] At least one confirmed, unbilled GRN exists (for the "from GRN" / 3-way path) as well as a route to create a standalone bill (no GRN link — the express path).
- [ ] Logged in as a user whose role includes `purchase.bill.create/update/confirm/approve`; separately confirm a user *without* the permission cannot trigger these actions server-side.
- [ ] Fiscal period for the bill date is open (or note if testing the soft-lock/hard-lock path).
- [ ] Know Al-Asala is KWD-only, no VAT — every input-VAT field on every bill line should show blank/zero, never a stray non-zero tax.

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Bills list

- [ ] **List loads** — shows all bills; columns include bill number (`PINV-XXXX` once confirmed), supplier invoice number, supplier, status (`draft` / `confirmed` / `voided`), total, balance.
  - [ ] Empty state clear, not blank/broken.
  - [ ] Pagination correct and stable; filters preserved across pages.
- [ ] **Filter/search** by supplier, status, date range; reset clears all.
- [ ] **Drill-down** opens the bill detail; back returns to the same page/scroll.

### Create bill — standalone (express, no GRN/PO)

- [ ] **Create draft bill:** supplier picker (searchable), branch, invoice date, supplier invoice number (optional but recommended). No PO/GRN link.
- [ ] **Add item line:** item picker (searchable), quantity (pack-unit aware, converted to base units), unit price defaults to the item's reference cost (overridable), discount amount, warehouse, tax group.
- [ ] **Add expense/service line** (rent, utilities, freight, fees): no item, debits a chosen GL **expense account** directly (not Inventory 1141), quantity defaults to 1. The expense account picker only offers postable (non-header, non-control), active, expense-type accounts in the bill's legal entity.
- [ ] For Al-Asala: input VAT on every line should be blank/zero (no VAT tenant) — verify the tax group field either doesn't force a non-zero rate or is simply absent/no-op.
  - [ ] Loading state while saving; button debounced.
  - [ ] Error on save shows a user-friendly message; entered data is NOT cleared.
- [ ] **Warn before navigation** away from an unsaved/partially-filled draft.

### Create bill — from GRN (3-way match, the "record a bill on arrival" flow)

- [ ] **"Bill from GRN"** lets the clerk pick one or more confirmed, unbilled GRNs of the SAME supplier. One draft bill line is created per GRN line for the unbilled remainder (`receivedQty − returnedQty − billedQty`, clamped ≥ 0); a fully-billed GRN line is not offered again.
- [ ] Each GRN-linked line snapshots item, warehouse, tax group, and the **GRN's frozen receipt cost** as the default unit price — the clerk can edit the price (supplier's actual invoice price may legitimately differ = price variance) but **cannot add a discount** to a GRN-linked line (would under-clear the GR/IR accrual — the field should be disabled/rejected).
- [ ] **Quantity on a GRN-linked line can only be lowered**, never raised above the unbilled remainder — server rejects an over-quantity edit (422) even if the UI somehow allowed typing a bigger number.
- [ ] Selecting GRNs from **different suppliers** in one "bill from GRN" call is rejected — a bill has exactly one supplier.
- [ ] Selecting an already-fully-billed or voided GRN is rejected ("nothing left to bill").

### Confirm bill (`draft` → `confirmed`)

- [ ] **Confirm action** requires a confirmation dialog showing supplier, lines, totals, due date. Cancel returns to the draft with data intact.
- [ ] After confirming:
  - [ ] Status → `confirmed`; a gapless `PINV-XXXX` number is assigned.
  - [ ] `dueDate` = invoice date + the supplier's payment terms (or 30 days default if the supplier has none set).
  - [ ] GRN-linked lines: the source GRN line's `billedQty` increments; a fully-billed GRN shows no further billable remainder.
  - [ ] Confirm is debounced; double-click does NOT confirm twice / create two PINV numbers.
- [ ] **Duplicate supplier invoice number:** creating (or confirming) a second bill with the SAME `supplierInvoiceNumber` for the SAME supplier is rejected with a clear, specific error (`DUPLICATE_SUPPLIER_INVOICE`, 409) — the dumbest thing a clerk could do (enter the same paper bill twice) is blocked.
- [ ] **Cannot confirm** a bill with zero positive-quantity lines (422).
- [ ] Confirm posts the JE and reduces the linked GRN accrual — verify no double-post if the network call is retried (idempotent per the outbox eventId).

### Void bill (`confirmed` → `voided`)

- [ ] **Void action** requires manager-PIN approval (a DIFFERENT manager, SoD) via `purchase.bill.approve`.
- [ ] **Void is blocked once any amount is paid** (`paidAmount > 0`) — clear message ("reverse the supplier payment before voiding it"); this is re-checked UNDER the row lock at void time (not just the pre-check), so a payment posted in the same instant cannot slip through.
- [ ] After a successful void:
  - [ ] `payableTotal` and `balance` are zeroed on the voided bill (so AP aging never double-counts it), while the GL contra reverses the **original** `payableTotal` amount.
  - [ ] Linked GRN lines' `billedQty` is decremented (re-openable for a corrected bill) under a row lock.
  - [ ] GL: AP 2111 debited (reversing the credit), GR/IR 2121 credited (re-opening the accrual), price variance and expense/inventory lines reversed exactly.
- [ ] **Double-void (idempotency):** voiding an already-voided bill is a safe no-op, no second reversal.

---

## 2. Accounting / domain invariants

> Cross-cutting invariants are in the module `README.md`. Submodule-specific invariants below.

- [ ] **Bill confirm posts: Dr GR/IR clearing 2121 (matched-GRN portion at frozen receipt cost) + Dr Purchase Price Variance 5210 (signed, billed price ≠ receipt cost) + Dr Inventory 1141 (manual/unmatched remainder) + Dr Expense (per expense line, explicit account) + Dr Input VAT 1162 (recoverable, if any), Cr Accounts Payable 2111 (gross bill total, party-tagged supplier).** Verify the split: `inventoryAmount = accrualCleared + priceVariance + inventoryRemainder` holds exactly (no residual, no negative remainder).
- [ ] **Price variance (PPV) posts to 5210, not to inventory or COGS** — confirm a bill priced above the GRN cost debits 5210 (an expense-side variance), and below-cost credits 5210. This is the CRITICAL "3-way match" invariant — GR/IR always clears at the frozen receipt cost, never the invoice price.
- [ ] **Reconcile invariant HOLDS after confirm/void:** Σ (open bill balances per supplier) = supplier's 2111 balance, both immediately and after a void.
- [ ] **A standalone (no-GRN) bill debits Inventory 1141 directly** for its full net cost — no GR/IR clearing leg, since there was no prior receipt accrual.
- [ ] **Input VAT blank/zero for Al-Asala** — every confirmed bill in this dataset should show a zero (or absent) input VAT leg. Any non-zero VAT line on any Al-Asala bill is a bug.
- [ ] **Void is the exact contra** of confirm — GL, AP balance, and linked-GRN `billedQty` all net to zero across confirm + void.
- [ ] **FX fail-loud:** a bill with a non-1 exchange rate is rejected at create (422) — foreign-currency bills are not yet supported. Not reachable live in the Al-Asala (KWD-only) dataset; verify by code read.

---

## 3. Edge cases & defensive UX — "the dumbest thing a purchasing clerk could do here"

- [ ] **Bill the same GRN twice.** The remainder-based "from GRN" flow makes a second full bill of an already-fully-billed GRN return "nothing left to bill" — never double-bills the same receipt.
- [ ] **Duplicate supplier invoice number** (typo re-entry, or genuinely re-scanning the same paper bill). Rejected with a specific, friendly duplicate error — not a generic 500.
- [ ] **Bill more than was received** (a standalone/manual line with a huge quantity, no GRN link). *Verify whether the system guards this* — manual item lines are NOT anchored to a GRN remainder, so there is no automatic "can't exceed received qty" check outside the GRN-linked path. Confirm this is intentional (the express/manual path trusts the clerk's physical count) and flag if it should warn.
- [ ] **Discount on a GRN-linked line.** Blocked at the API (422) — a discount would under-clear the 2121 accrual; the UI should disable the discount field entirely for GRN-linked lines, not just silently ignore it.
- [ ] **Void a paid bill.** Blocked outright (409), even if the payment amount is tiny (partial payment still blocks void).
- [ ] **Void twice.** Idempotent no-op.
- [ ] **Confirm with zero lines.** Blocked (422).
- [ ] **Expense line pointed at a header/control/inactive/wrong-legal-entity account.** Rejected with a specific message identifying which constraint failed — never silently posts to the wrong account.
- [ ] **Double-confirm race (two tabs).** Only one wins; second gets a clean conflict.
- [ ] **RTL / Arabic UI:** all labels, supplier/item names render correctly in RTL; currency/quantity stay LTR.
- [ ] **Currency display:** KWD at 3dp everywhere via the shared precision util.
- [ ] **Client + server validation both reject bad input** — try a negative price/quantity directly against the API.

---

## 4. Cross-module / integration

- [ ] **AP aging / supplier balance (09)** reflects a confirmed bill's `payableTotal` immediately, and drops it to zero immediately after a void.
- [ ] **GRN detail (04)**: after billing, the source GRN's `canVoid` flag correctly flips to false once any line is billed (`billedQty > 0`); after a bill void, `canVoid` correctly flips back if fully unbilled.
- [ ] **Supplier payments (07)**: a confirmed bill appears as payable/open; after full payment its balance reaches exactly zero (never negative); after a partial payment, a void is correctly blocked.
- [ ] **Purchase returns (08)**: a return against a billed GRN correctly reduces the GRN's billable/billed state without needing to void the bill.
- [ ] **GL drill-down:** clicking through from the journal entry's source link opens the correct bill — no 404.
- [ ] **Permissions:** a user with `purchase.bill.read/list` only can view but not create/confirm/void — hidden AND API 403s.

---

## 5. Known gaps (from recon — verify or track)

- **No automatic over-billing guard on manual/standalone lines** (HIGH to verify): `addItemLine` for a manual (non-GRN-linked) bill line has no ceiling check against anything received — the guard only exists for `grnLineId`-linked lines (`updateLine`'s remainder check). A clerk fat-fingering a quantity on a standalone bill has no server-side backstop. Confirm this is accepted risk for the express path (the clerk IS the receiving control) or flag for a soft warning.
- **Duplicate-invoice-number uniqueness is scoped to (tenant, supplier, invoiceNumber)** (MEDIUM to verify): confirm the unique constraint is truly per-supplier (so two different suppliers can coincidentally share an invoice number "1001") and not accidentally tenant-global, which would produce false-positive duplicate rejections.
- **FX fail-loud is untestable in the Al-Asala dataset** (LOW): KWD-only tenant; verified by code read only (`assertSupportedExchangeRate`).
- **Expense-line account validation is TOCTOU-guarded inside the transaction** (LOW, confirmed safe in code) — worth a live check that deactivating an expense account mid-session and then adding a line against it is rejected, not silently posted.

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Full bill-from-GRN → confirm → void recon verified: GR/IR clears and re-opens correctly, AP nets to zero, GRN billedQty round-trips to its pre-bill value.
- [ ] Duplicate supplier-invoice-number rejection confirmed live.
- [ ] Price variance (bill price ≠ GRN cost) posted to 5210 and verified in the trial balance, not buried in inventory or COGS.
- [ ] Input VAT confirmed blank/zero on every Al-Asala bill.
- [ ] Findings logged in `_findings.md`.
