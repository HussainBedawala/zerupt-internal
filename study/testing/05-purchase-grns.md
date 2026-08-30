# Phase D — Purchase GRNs (routes 75-78) — Static Audit

Scope: `/:locale/purchase/grns`, `/grns/new`, `/grns/:id`, `/grns/:id/edit`.
Method: code + DB (psql against Gulf Auto Parts tenant DB) + curl only, no browser (shared session
owned by another agent this wave). Persona under test: **storekeeper1 (receiving)**.

Balance invariant checked before/after (no writes made this session, read-only audit):
`select round(sum(debit-credit),6) from journal_entry_lines;` → `0.000000`. Holds.

---

## HIGH — storekeeper1 has NO role assignment in the Gulf Auto Parts tenant; the assigned test persona cannot complete a receipt end to end (CONFIRMED)

This blocks the specific mandate of this wave ("check the storekeeper's permission set can
actually complete a receipt end to end") at the data layer, before any UI is even reached.

**Evidence (DB, tenant `ce603a7c-9f94-4c89-8f48-8ebb84755e10`):**

```
select id, name from roles order by name;
 Accountant | Cashier | Owner | Viewer      -- only 4 roles exist. No "Storekeeper" role.

select * from user_roles;                    -- exactly 4 rows, one per role above.
select distinct user_id from user_branches;  -- exactly 2 users (the Cashier + the Viewer).
```

There is no fifth user, no fifth role, and no role named anything like "storekeeper" or
"receiving" anywhere in `roles`, `user_roles`, or `user_branches` for this tenant. Grepping the
codebase (`packages/shared/src/role-templates.ts`) confirms there is also no built-in
**Storekeeper** role template shipped with the product — only Owner, Manager, Accountant,
Cashier, Viewer, and a few narrow SoD templates (`refund-approver`, etc.). "storekeeper1" appears
only as a generic test-fixture username in unit-test files
(`apps/api/src/auth-events/failed-login-audit.service.spec.ts`,
`apps/api/src/supabase/supabase-admin.service.spec.ts`, etc.), not as seeded tenant data.

**Consequence:** if `storekeeper1` can authenticate at all (via the synthetic-email username
scheme in `packages/shared/src/synthetic-email.ts`), they land in the tenant with **zero granted
permissions** — every `@RequiresPermission` gate (`purchase.grn.create`, `.confirm`, `.list`,
`.read`, `purchase.order.list`, `.read`) denies them, so the GRN screens are entirely unusable:
the nav item is hidden (gated on `PK.purchase.grnList`), and a direct hit on `/purchase/grns/new`
would show a clean permission-denied state at best (see backend design note below — that part IS
correct) but literally cannot receive anything.

This reads as a **test-environment/seed-data gap**, not a product defect: the product's
permission bundle design for a minimal-receiving role is actually correct (see the POSITIVE
finding below) — the gap is that no such role was ever created and assigned to the storekeeper1
identity in this specific tenant. Recommend: seed a "Storekeeper"/"Receiving" role in Gulf Auto
Parts using the `purchase.create` + `purchase.confirm` bundles (see below) and assign it to
storekeeper1, so the next wave's browser-driven pass can actually exercise this persona.

## POSITIVE (non-finding) — the permission BUNDLE design correctly avoids defect pattern 3 for a hypothetical minimal receiving role

Checked `packages/shared/src/permission-bundles.ts`: the `purchase.create` bundle groups
`purchase.orderRead`, `purchase.orderList`, `purchase.grnCreate`, `purchase.grnRead`,
`purchase.grnList` together, and `purchase.confirm` carries `purchase.grnConfirm`. So a role built
from those two bundles (which is exactly how the shipped `Manager` template is composed, minus
the two SoD-restricted create keys) would have PO-list/PO-read alongside the GRN keys — the PO
picker on the create-GRN screen would not silently fail for such a role. This is the register of
defect pattern 3 (permission-gated lookup a legitimate user can't make) done right: the product
anticipated it at the bundle level. If a tenant instead hand-picks only `purchase.grnCreate` /
`purchase.grnConfirm` for a role (skipping the bundle), the PO picker (`useOrdersQuery` →
`GET tenant/purchase/orders`, gated `purchase.order.list`) would 403 and the create form would
render with an empty/broken PO dropdown — flag this as a UX guardrail worth adding (disable the
"pick a PO" step with a plain-language explanation rather than an empty select) if a tenant is
ever seen doing this, but it is not something to fix blind here (LOW/FRICTION, SUSPECTED, no
tenant currently configured this way).

---

## Backend GRN module — audit summary (code read end to end)

Files read: `apps/api/src/purchase/grn/grns.controller.ts` (423 lines), `grns.service.ts` (713
lines) plus its extracted modules (`grns.create.ts`, `grns.confirm.ts`, `grns.void.ts`,
`grns.po-consumption.ts`, `grns.guards.ts`, `grns.read.ts`, `grns.list.ts`, `grns-totals.ts`),
and the GL listener `accounting-events/listeners/purchase-accounting.listener.ts`.

### Permission gating — route AND backend parity (CONFIRMED, no findings)

Every mutation endpoint carries `@RequiresPermission` matching its stated action:
`POST /` → `purchase.grn.create`, `POST /receive` → BOTH `purchase.grn.create` AND
`purchase.grn.confirm` (composed via `assertAllPermissions`, not the default OR-semantics of
stacking two decorators — the controller has an explicit code comment explaining exactly why
stacking would be a segregation-of-duties bypass), `PATCH /:id` and `/:id/header` and line
CRUD → `purchase.grn.update`, `POST /:id/confirm` and `/:id/void` and `/:id/amend` and
`/:id/lines/:lineId/correct-cost` → `purchase.grn.confirm`. This is a genuinely good positive:
the atomic "receive" endpoint (the one the create form actually calls) explicitly guards against
the OR-decorator trap that would otherwise let `purchase.grn.create` alone post stock and a GL
entry.

### Audit coverage (CONFIRMED, no findings)

Every mutation is `@Audited("Grn")`: create, receive, updateHeader, patchHeader, addLine,
updateLine, removeLine, confirm, void, correctLineCost. `amend` is deliberately NOT
`@Audited` at the controller — the amend saga runner writes its own document-keyed audit rows at
finalize, and the controller comment explains a decorator there would double-write. This is
correct design, not a gap.

### Over-receipt tolerance (CONFIRMED via code)

`grns.po-consumption.ts` locks the parent PO row `FOR UPDATE` before any receive/confirm
(`lockOrder`), re-checks `RECEIVABLE_PO_STATUSES` under that lock (guards a PO cancelled/closed
between draft-GRN-open and confirm — labelled "H1" in the code), and the confirm path checks a
tenant-configured tolerance (`resolveOverReceiptTolerance`) before requiring a manager PIN
(`assertOverReceiptApproved`, verified via `PinVerificationService`) for any receipt exceeding it.
The over-receipt approval fields on the frontend are revealed reactively (not demanded up front)
because the tolerance is server-only knowledge — a deliberate, good UX choice documented inline in
`grn-create-panel.tsx`.

### Batch/serial capture (CONFIRMED, no findings)

`grn-receive-lines-table.tsx` conditionally renders a batch-number + expiry-date pair (for
`trackingType === "batch"`) or a `SerialEntryCell` (for `"serial"`) per line, and clears keyed
serials if the quantity changes on a serial-tracked line (correctly prevents a stale
serial-count mismatch). Serial count integrity is asserted again server-side at confirm
(mentioned in `createAndConfirm`'s inline documentation: "serial-count + batch/expiry
integrity").

### Average-cost recalculation on receipt (CONFIRMED, no findings)

Cost is tracked in `item_cost_pools` (per `(item, legal entity)`, company-wide — matches the
memory note; NOT a branch leak). `inventory/cost-pool.ts` re-derives `average_cost` from the new
`total_value` on every inbound movement, at 6dp internal precision — display formatting is via
the shared money/quantity primitives (no hand-rolled `.toFixed`), so no 2dp KWD risk was found in
the code path examined.

### GR/IR clearing + GL postings (CONFIRMED via code read of the listener)

On `purchase.grn.confirmed`: `DR Inventory 1141` (+ `DR Input Tax 1162` when recoverable) against
either `CR Trade Payables 2111` (party-tagged, when the GRN itself carries the supplier — a
matched/"has invoice" receipt) or `CR GRN Accrual 2121` (NOT a control account, correctly never
party-tagged — code comment explicitly flags this distinction). On
`purchase.invoice.confirmed`, the accrual clears: `DR GRN Accrual 2121` at the frozen receipt
cost, with any bill-vs-receipt price difference posted to `Purchase Price Variance 5210` so 2121
always clears exactly. Landed cost accrues separately to `Landed Cost Accrual 2122` (distinct
account from GRN accrual 2121 — again explicitly called out in a code comment, guarding against
exactly the kind of "are these the same account" confusion flagged as a method rule in the
briefing). `purchase.grn.voided` posts the precise contra of the receipt JE. This entire chain
reads as correctly designed and was the subject of the prior hardening pass's balance-proof
review panel (per `study/purchase/_hardening-log.md`) — I re-verified the wiring, not re-derived
it from scratch, per the addendum's instruction not to re-litigate settled design.

### Path divergence — order path is the ONLY path for the GRN screens in scope (non-finding, documented deliberately)

`createGrnSchema` / `receiveGrnSchema` require `purchaseOrderId: z.string().uuid()` (non-optional)
in `grns.dto.ts` — there is no "receive with no PO" screen inside `/purchase/grns/*`. The
"direct path" for purchase overall (per the addendum's dual-path mandate) is the SEPARATE
`/purchase/direct` module (`DirectPurchaseService`), which internally writes its own PO + GRN +
invoice rows in one orchestrated call rather than exposing a no-PO GRN form. This is consistent
with the codemap and the prior hardening log ("Dual path is the headline... direct-purchase
express AND PO→GRN→bill→payment"), so a GRN-scoped audit correctly finds only the order path
inside `/purchase/grns/*` — nothing to file here; the direct path is out of this route's scope by
design, not a hidden second GRN implementation.

---

## MEDIUM — GRN list query has no `placeholderData: keepPreviousData` (CONFIRMED, cross-cutting item, purchase's known share)

`apps/web/src/features/purchase/api/grns-queries.ts`, `useGrnsQuery` (line 38) is a bare
`useQuery({...})` with no `placeholderData`. Confirmed absent by grep (`placeholderData` /
`keepPreviousData` — zero matches in the file). `grns-list-panel.tsx` drives `page`/`pageSize`
state directly into this query. Per the addendum this is a known, already-tracked cross-cutting
gap ("~30 list panels lack `placeholderData: keepPreviousData`... Purchase's share is in scope
for this phase") — recording GRN's list as one of that set, not filing it as a new discovery.
Effect: changing page/filter unmounts to a loading skeleton instead of keeping the old rows visible
during refetch — friction, not data-correctness risk.

## POSITIVE — GRN export is server-streamed, not client-rebuilt (no "buildCsv half" risk)

`grns-export-dialog.tsx`: the CSV is generated server-side (`GET tenant/purchase/grns/export`)
with machine-key headers; the client only downloads the blob and rewrites the FIRST (header) line
into the viewer's locale via a shared `rewriteCsvHeader` helper, leaving every data row untouched.
This is the "first caller" of a shared `ExportDialog` shell per its own header comment. No
client-side data reconstruction, so the "export CSV construction, client-side buildCsv half too"
checklist item does not apply here — there is no client-side half to check.

## POSITIVE — i18n parity is complete for the GRN namespace

Compared every leaf key under `grns` in `apps/web/messages/en/purchases.json` vs
`ar/purchases.json`: 369 keys each side, zero missing on either side (script-verified, not
eyeballed).

## FRICTION — G8 (could an untrained Kuwaiti shop owner receive a delivery in under 60 seconds?)

Reading `grn-create-panel.tsx` end to end: the flow is genuinely tight for the common case —
**Step 1** pick an open/partially-received PO from a dropdown (server-resolved supplier names,
no raw IDs); **Step 2** the line table pre-fills expected quantities from the PO and the user only
adjusts what actually arrived; **one Save** ("Receive") does create+confirm atomically in a
single request (the code comment explicitly frames this as replacing a mandatory two-step
create-then-confirm flow — a real friction fix already shipped). Approval-PIN fields for
over-receipt and the soft-lock-override reason are hidden unless the server says they're needed.
Idempotency key prevents a double-tap from double-posting. Post-save screen offers Print / View /
New Entry as one-click actions rather than a bare redirect. For a receipt that matches the PO
exactly (the common case), this is close to a single click-through: pick PO → click Receive →
done. **Answer: yes, for a straightforward on-PO delivery, this looks achievable in well under 60
seconds** — no unnecessary draft stage is forced (draft still exists as an option but is not the
default path), no stacked dialogs, no repeated confirmations for an ordinary save. The one
friction point worth naming: the receipt date defaults to today (`todayIsoDate()`) and is not
hidden even though it will be correct 95%+ of the time — a minor, not-blocking, LOW/FRICTION
item, not filed as its own line since a visible-but-defaulted date field is standard and
editable-not-required behavior, not friction that stops the flow.

---

## Non-findings recorded

- Warehouse/branch scoping: GRN inherits `branchId` from its parent PO (`assertBranchAccess(order.branchId)` in `createAndConfirm`), and confirm re-asserts branch access identically to the standalone confirm path. Did not attempt to construct a live cross-branch leak scenario (no browser, no storekeeper session available this wave) — recorded as unverified rather than claimed clean beyond the code-level access-control call sites reviewed.
- FX on GRN: receipt date exchange-rate field only renders for foreign-currency orders; Kuwait tenant is single-currency KWD so this path is inert here, consistent with the addendum's ruling not to file the fail-loud FX design as a bug.
- AUDIT-002/003/004 and PERM-004 (already-open cross-cutting items from the addendum): not independently re-verified against GRN specifically in this pass; noted per instruction as "do not fix blind, just note if you see them here" — AUDIT-004 (audit_log lacking branch_id/legal_entity_id) applies to `@Audited("Grn")` rows the same as everywhere else, no GRN-specific variant found.

## Could not verify (needs a browser session + a real storekeeper role — recommend for next wave)

1. Live click-through of `/purchase/grns`, `/new`, `/:id`, `/:id/edit` as an actual storekeeper1 session (blocked by the missing role assignment above, and by this wave's no-browser restriction).
2. List screen behaviors requiring live interaction: pagination at depth, search (partial/exact/Arabic/no-results), individual+combined filters, sort both directions, empty/loading/error states as rendered (code suggests standard TanStack Query loading/error handling exists, but not screenshotted).
3. RTL logical-property correctness rendered in the browser (i18n key parity confirmed; visual RTL correctness not).
4. Responsive behavior at 375/768/1280/1920.
