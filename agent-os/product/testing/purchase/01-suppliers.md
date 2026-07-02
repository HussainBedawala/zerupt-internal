# Purchase — Suppliers / AP Master Testing Checklist

> Persona: **purchasing clerk / shop owner** (Kuwait, KWD 3dp fils, no VAT). Test every item as that person. Verify the *invariant*, not just that the button works. At every screen ask: **"what's the dumbest thing a purchasing clerk could do here?"**

- **Route(s):** `/purchase/suppliers`, `/purchase/suppliers/new`, `/purchase/suppliers/[id]`, `/purchase/suppliers/[id]/edit`
- **Feature dir:** `apps/web/src/features/purchase/` + `apps/web/src/features/suppliers/`
- **API:** `tenant/suppliers` — `GET /` (list), `GET /:id`, `POST /` (create), `PATCH /:id` (update), `POST /:id/image`, `DELETE /:id/image`. Service `SuppliersService` (`erp/apps/api/src/suppliers/suppliers.service.ts`), balances via `SupplierApBalanceService`.
- **Depends on:** Chart of Accounts (`2111` Accounts Payable must exist), account mappings (opening-balance journal target).

---

## 0. Preconditions

- [ ] Chart of Accounts has a `2111` Accounts Payable control account.
- [ ] Logged in as a user whose role can manage suppliers; separately confirm a user without that permission cannot reach `/purchase/suppliers/new` (server-side, not just hidden in the UI).
- [ ] Know the expected supplier count and each supplier's opening AP before starting (for this dataset: 2 suppliers, opening AP totalling KWD 3,500.000) — you need a baseline to verify against.
- [ ] Fiscal period is open (or note if testing a locked-period opening-balance scenario).

---

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Supplier list

- [ ] **List loads** — shows all suppliers for the tenant; columns include code, name, phone, status, outstanding balance (`overCreditLimit` flag if over the credit limit).
  - [ ] Outstanding balance shown on the list is the SAME number as on the supplier detail (both are GL-derived — no drift between list and detail computations).
  - [ ] Empty state (no suppliers yet) is a clear prompt, not a blank/broken screen.
  - [ ] Pagination correct; navigating pages does not lose filter/search state.
- [ ] **Search** — matches by code, name, and secondary-language name (`nameAlt`), case-insensitive; reset clears and restores full list.
- [ ] **Filter by status** (active/inactive/blocked) returns the correct subset.
- [ ] **Drill-down** — clicking a row opens supplier detail; back navigation returns to the same page/scroll position.

### Create supplier

- [ ] **Code** — auto-generated as `SUP-0001`, `SUP-0002`, … (next code = highest existing auto-generated code + 1; manually-entered codes in other formats do not interfere with the sequence).
  - [ ] Manual code entry is allowed; a duplicate manual code is rejected with `DUPLICATE_SUPPLIER_CODE` (409), not a generic error.
- [ ] **Name** — required; bilingual name/secondary-name fields both save and display correctly (`dir="auto"`, hidden for monolingual tenants per `useBilingualLabels()`).
- [ ] **Duplicate name guard** — creating a supplier with a name that case-insensitively matches an existing supplier returns a 409 (`DUPLICATE_SUPPLIER_NAME`) listing up to 5 matches; the form must let the clerk explicitly confirm-and-create-anyway rather than silently splitting AP across two near-identical masters.
- [ ] **Phone** — format validated; garbage input rejected with a clear message (client + server).
- [ ] **Tax number (TRN)** — optional; duplicate tax number across suppliers rejected with `DUPLICATE_TAX_NUMBER` (409), distinct from a code clash.
- [ ] **Credit limit** — optional numeric field; saved and reflected in `overCreditLimit` once a balance exists.
- [ ] **Payment terms (days)** — optional numeric field.
- [ ] **Status on create** — defaults to `active`; creating directly as `blocked` requires a `blockedReason` (blocked with no reason is rejected, both client and server — the DB CHECK also enforces it).
- [ ] **Opening AP balance** — entering an opening balance for a new supplier posts a **balanced** opening journal that party-tags `2111` to this supplier; the balance is visible on the supplier detail immediately after save.
  - [ ] Success — supplier created, redirected to detail, success toast shown.
  - [ ] Error — API failure (e.g. duplicate name) shows a user-friendly message; entered data is NOT lost.
  - [ ] Loading — submit button disabled/debounced; double-click does not create two suppliers.
- [ ] **Image upload** — PNG/JPEG/WebP only, ≤2MB, content sniffed against magic bytes (not just the declared MIME type); rejecting a renamed `.exe` disguised as `.png` is a MUST. Upload replaces the previous image (no orphan files); delete clears it.

### Edit supplier

- [ ] Editing name/phone/email/TRN/credit limit/payment terms/notes saves and reflects immediately; a no-op submit (nothing changed) is rejected client-side and server-side (never issues a silent empty UPDATE).
- [ ] **Status transitions** are constrained: `active → inactive/blocked`, `inactive → active/blocked`, `blocked → active` only (`blocked → inactive` is explicitly disallowed — must un-block to active first). Attempting an illegal transition returns a clear 409, not a generic error.
- [ ] **Blocking** requires a reason (both on transition-to-blocked and when editing the reason of an already-blocked supplier); clearing the reason on a blocked supplier is rejected.
- [ ] **Un-blocking** (blocked → active) clears `blockedReason`/`blockedAt`.
- [ ] Editing tax number to a value already used by another supplier is rejected (`DUPLICATE_TAX_NUMBER`).

### Supplier ledger / detail view

- [ ] **Outstanding balance** shown is a **read of party-tagged `2111` ledger lines**, never a separately-maintained/cached counter that can drift from the GL.
- [ ] **Outstanding by currency** breakdown (`outstandingByCurrency`) is present even for a KWD-only tenant (single-currency array); for this dataset every entry must be KWD.
- [ ] Supplier ledger/statement view lists the underlying bills/payments/returns that make up the balance, each drilling down to its source document.

### Deactivate / block supplier

- [ ] **Cannot delete** a supplier with an open balance or any transaction history — there is no hard-delete path in the API; the only lifecycle exit is `inactive`/`blocked`. Confirm the UI does not offer a delete action, or if it does, it is rejected server-side.
- [ ] Blocking a supplier with an open balance is allowed (blocking ≠ writing off the debt) but the UI should surface a warning that the supplier still has an outstanding balance.

---

## 2. Domain invariants

> Cross-cutting invariants are in `README.md`. Submodule-specific invariants below.

- [ ] **AP = party-tagged 2111 ledger**, always. `supplier.outstandingBalance` (functional currency) equals the sum of that supplier's party-tagged `2111` journal lines — verified independently by reading the GL, not just trusting the API response.
- [ ] **Reconcile invariant holds after supplier CRUD:** creating/editing/blocking a supplier never itself posts to the GL (only the opening-balance action does); Σ open bills per supplier = supplier's 2111 balance must still hold before and after any supplier master edit.
- [ ] **Opening AP journal is balanced** and ties to the trial balance: Dr (offset/equity or suspense per opening-import design) = Cr `2111` (party-tagged to the supplier) for the opening amount.
- [ ] **Total 2111 opening across all suppliers reconciles** to the trial-balance opening figure for `2111` (for this dataset: KWD 3,500.000 = 2,400.000 + 1,100.000).
- [ ] **Code and tax-number uniqueness enforced at the DB level** (unique constraints), not just in application code — confirm via the constraint name surfaced in the 409 (`suppliers_tenant_tax_number_uniq`).
- [ ] **Status transitions server-enforced**, not just disabled buttons in the UI — attempt an illegal transition via direct API call and confirm rejection.

---

## 3. Edge cases & defensive UX — "the dumbest thing a purchasing clerk could do here"

- [ ] **Clerk creates a supplier named identically to an existing one** (different case/whitespace) — duplicate-name guard fires; clerk must explicitly confirm before two AP masters for the same real supplier are created.
- [ ] **Clerk tries to block a supplier with no reason typed.** Blocked client- and server-side.
- [ ] **Clerk tries `blocked → inactive` directly.** Rejected; must go through `active` first.
- [ ] **Clerk double-clicks Save on create.** Only one supplier created (submit debounced; server-side uniqueness is the final backstop).
- [ ] **Clerk uploads a 10MB image.** Rejected client-side before upload starts, and server-side regardless (2MB cap).
- [ ] **Clerk renames a `.exe` to `photo.png` and uploads it.** Rejected — magic-byte content check fails even though the extension/MIME header claims PNG.
- [ ] **Clerk enters a negative or zero credit limit.** Either blocked or treated as "no limit" consistently — confirm which, and that it's not silently misinterpreted.
- [ ] **Clerk tries to delete a supplier with an open balance.** No delete path exists; confirm this is true at the API, not just hidden in the UI.
- [ ] **Two clerks create a supplier with the same manually-typed code simultaneously.** Second request gets a clean 409, not a crash or silent overwrite.
- [ ] **RTL (Arabic) + LTR:** supplier name/nameAlt render correctly in RTL; phone numbers, codes, and balance amounts stay LTR with correct KWD grouping (KWD 1,234.500 not 1.234,500).
- [ ] **Currency precision:** all balance and credit-limit figures show 3dp for this KWD tenant — never hardcoded 2dp or a USD/SAR sign.

---

## 4. Cross-module / integration

- [ ] Opening AP balance posts a real journal entry visible in the accounting module (`/accounting/journal`), with the supplier as the tagged party on the `2111` line.
- [ ] Supplier detail's outstanding balance updates immediately after any purchase-module action affecting that supplier (new bill, payment, return) — no stale cache.
- [ ] Blocking a supplier is enforced downstream: direct-purchase and PO creation for a blocked/inactive supplier must be rejected server-side (`requireActiveSupplier` check in `PurchaseOrdersService` / `DirectPurchaseService`), not just hidden in the picker.
- [ ] AP aging report (`09-ap-aging-overview`) reflects this supplier's balance and matches the supplier detail figure exactly.
- [ ] Drill-down from a GL journal line's party tag resolves to the correct supplier detail page.

---

## 5. Known gaps (from recon — verify or track)

- **Opening-balance journal mechanics not read in this pass** (MEDIUM): confirm which endpoint/flow posts the opening AP journal for a newly created supplier (likely part of the onboarding/import path, not `suppliers.service.ts` itself) and that it is atomic with supplier creation — a supplier record with no matching opening journal would break the reconcile invariant.
- **`overCreditLimit` uses float-scaled-integer comparison** (LOW): `isOverLimit` scales to 6dp integers to avoid float rounding; spot-check a credit limit exactly equal to the balance is NOT flagged over-limit (boundary case).
- **Duplicate-name guard is soft (confirm-to-override)** (LOW, by design): confirm the override path (`confirmDuplicateName`) is not accidentally exposed as a default-checked checkbox that defeats the guard's purpose.
- **Image storage best-effort delete** (LOW): `deleteImage` swallows storage removal failures and nulls the DB column anyway — confirm this doesn't leave orphaned files silently (acceptable per code comment, but worth knowing for storage-cost audits).

---

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Total outstanding across both suppliers reconciles to KWD 3,500.000 (opening) plus/minus any transactions run during this test pass.
- [ ] Findings logged in `_findings.md`.
