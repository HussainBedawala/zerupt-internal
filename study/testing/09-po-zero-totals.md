# 09 — PO zero totals on a printed purchase order (Phase F)

Investigated 2026-08-30. Source evidence: `study/testing/print-08-direct-purchase-po-no-uuid.pdf`.

---

## Verdict: PRINT-ONLY defect, not a money defect. Severity HIGH, CONFIRMED.

The books are right. The zero totals live exclusively on the hidden plumbing purchase
order that Direct Purchase creates as a structural anchor, and no money-bearing consumer
reads them.

### 1. Every failing row is a direct-purchase plumbing PO

```
 number                                  | source_type     | status   | total | sum(line_total) | qty*price-disc
 B1ALRAIMAINS-PO-00001                   | manual          | part_rec | 55.00 | 55.000000       |  55.000
 DP-22cf3812-0b72-47b5-a71c-101399ea209a | direct_purchase | received |  0.00 |  0.000000       |   7.515
 DP-34b49d49-dddf-44c0-b266-1a651c9d4cb1 | direct_purchase | received |  0.00 |  0.000000       |   7.515
 B1ALRAIMAINS-PO-00002                   | manual          | received |  3.00 |  3.000000       |   3.000
 DP-b2000a8c-6a7e-4731-a8ea-95166e76e401 | direct_purchase | received |  0.00 |  0.000000       |   2.500
 B1ALRAIMAINS-PO-00003                   | manual          | received |  2.50 |  2.500000       |   2.500
 B1ALRAIMAINS-PO-00004                   | manual          | cancelled|  8.50 |  8.500000       |   8.500
 B1ALRAIMAINS-PO-00005                   | manual          | confirmed| 10.62 | 10.625000       |  10.625
 DP-ade6388f-e627-4e60-b4b4-e07bd28945cf | direct_purchase | received |  0.00 |  0.000000       | 250.000
 DP-205df983-5adf-4c90-8e53-d3294c3c9863 | direct_purchase | received |  0.00 |  0.000000       |   6.250
```

5 of 10 fail the invariant; all 5 are `source_type='direct_purchase'`. All 5 manual POs
satisfy it exactly. The PO totals engine (`purchase-orders-totals.ts#recompute`) is not
broken - it is never called on the direct-purchase path.

This is deliberate and documented in code: `direct-purchase.service.ts` writes the PO with
`lineTotal: "0"` and a `DP-<uuid>` placeholder number, commented as

> "Hidden confirmed PO + lines - the structural anchor the GRN receives against
> (grns.purchaseOrderId / grn_lines.purchase_order_line_id are NOT NULL)."

### 2. The money legs are correct

```
grn_lines            8 rows, 0 failing (received_qty x unit_cost = line_total)
purchase_invoice_lines 10 rows, 0 failing
sales_invoice_lines   11 rows, 0 failing
```

Every direct-purchase GRN carries a real number and real recomputed line totals
(`B1ALRAIMAINS-GRN-00002` = 3 x 2.505 = 7.515). The bill is built from the GRN and the GL
ties. Ledger gate before and after this session: `0.000000`.

### 3. Consumer analysis - nothing that matters reads the zero totals

Every reader of `purchase_orders.subtotal/total` and `purchase_order_lines.line_total`
in the API (exhaustive grep, non-spec):

| Consumer | Reads | Excludes direct_purchase? |
|---|---|---|
| `purchase-orders.service.ts#list` | header totals | YES (`sourceType = 'manual'`) |
| `purchase-orders-export.service.ts` | subtotal/discount/tax/total | YES (same filter, documented) |
| `purchase-overview.service.ts` open-orders COUNT | count only | YES (`notDirectPurchaseOrder()`) |
| `purchase-overview.service.ts` recent-orders TABLE | `total x rate` | **NO - fixed in this pass** |
| `reports/open-purchase-orders.service.ts` | total, committed value | YES (`notDirectPurchaseOrder()`) |
| `purchase-orders.service.ts#confirm` | fresh total for approval gate | n/a (DP never confirms through this path) |
| `inventory/reservations/stock-availability.service.ts` | QUANTITIES only, and `OPEN_PO_STATUSES` | n/a - quantities are correct on DP lines |
| `documents/tax-document-assembler.service.ts#assemblePurchaseOrder` | ALL totals | **NO - this is the defect** |

Not affected, verified: supplier balances and AP aging derive from the party-tagged GL
control account (`ApAgingService`), never from PO totals. Three-way match / PPV runs off
GRN `unit_cost` and bill lines, which are correct. The supplier-detail "Orders" tab and
the reports drill-through both route through the filtered list / filtered report.

So: no report, no supplier balance, no aging bucket, no matching check and no commitment
figure is wrong. **The only wrong number a human can ever see is the printed page.**

### 4. But the printed page is the worst place for it

`print-08` renders, on Gulf Auto Parts letterhead:

```
PURCHASE ORDER      Purchase Order No.  -
1  ZZTEST-Brake Pad Set Front Test 2   Qty 3   KWD 2.505   Line Total KWD 0.000
                                        Subtotal KWD 0.000   Grand Total KWD 0.000
```

A prior hardening phase already closed the raw-uuid leak (`toPrintDocumentNumber` collapses
`DP-`/`DRAFT-` to the empty placeholder), which is why the number prints as `-`. That fix
made the document unnumbered but left it printable, and a document with no number, priced
lines and a zero grand total is exactly the artefact a merchant could email to a supplier.

---

## Decision: (b) - the synthetic PO is an internal artifact and must not be printable

Not (a). Reasons, in order of weight:

1. **A purchase order is a commitment to a supplier before the goods move.** A direct
   purchase has no such stage - the goods were already in hand when the record was created.
   Writing totals onto it would manufacture a commitment document for a commitment that
   never existed. That is a worse lie than a zero, because it looks plausible.
2. **The totals would be write-only data.** Every other consumer already excludes these
   rows by design (table above). Nothing would ever read the backfilled figures. Adding
   data that no reader consumes is pure carrying cost, and a second place for the direct
   purchase's money to drift away from the bill.
3. **The codebase has already committed to this reading, twice.** `purchase-order-number.ts`
   exists solely to keep these rows out of user-facing surfaces
   ("they are internal anchors for the Direct Purchase orchestrator, never user-facing
   orders"), and `document-number.ts` already refuses to print their number. The print
   refusal is the missing third step of a decision the codebase has already made, not a
   new policy.
4. **No backfill.** `purchase_orders` is not the ledger and carries no immutability
   trigger, so a backfill would be permitted - but it is the wrong thing to do for the
   reasons above, and it would also have to be maintained forever for every new direct
   purchase. Declined deliberately, not for safety.

---

## UI-reachable? NO for the server PDF, YES for the browser print button.

- **PO list** (`/purchase/orders`) filters to `sourceType = 'manual'` - the row is not listed.
- **Supplier detail "Orders" tab** uses that same list endpoint - not listed.
- **Reports drill-through** to `/purchase/orders/{id}` only ever emits ids from the
  Open Purchase Orders report, which excludes direct purchases.
- **Purchase overview "recent orders"** was the one place that could have surfaced it
  (its sibling COUNT applies the exclusion, the row query did not). In practice a DP PO
  is only `confirmed` for the duration of the creating transaction before the GRN confirm
  moves it to `received`, so no such row has ever been displayed - but the inconsistency
  was real and is fixed.
- **So the only way in is by pasting the uuid into `/purchase/orders/<id>`**, which the
  founder did via the API. The detail page then renders fully, INCLUDING a working
  "Print" button (`OrderPrintDocument`), because `PurchaseOrdersService.get` has no
  source-type gate (deliberately - amend numbering and audit labels need the raw row).

Severity therefore HIGH rather than CRITICAL: it takes a uuid to reach, no money is wrong
anywhere in the books, and no aggregate a user sees is affected. It is not LOW, because
once reached the output is a company-letterhead financial document stating a false figure
to a third party, with no warning of any kind.

---

## The fix

**1. The server PDF path refuses the plumbing PO** -
`apps/api/src/documents/tax-document-assembler.service.ts#assemblePurchaseOrder`.
Detected with the existing `isDirectPurchasePlaceholderNumber()` (single source of truth
for the `DP-` prefix), so there is no second copy of the rule and no DTO widening.
Message: *"This is a direct purchase, which has no purchase order to print. Print the bill
or the goods receipt instead."*

**2. The browser print path refuses it too** -
`apps/web/src/features/purchase/print/order-print-document.tsx` returns `null` for an
internal placeholder number, using the shared `isInternalDocumentNumber()`. Both the
button and the hidden print root disappear. No new copy, so no i18n gap: there is no
document here, so there is no affordance, rather than an affordance that explains itself.
Fixed at BOTH ends, because the button falls back to `window.print()` when the PDF agent
is unavailable - gating only the server would have left the fallback open.

**3. Purchase overview consistency** -
`purchase-overview.service.ts` recent-orders query now applies `notDirectPurchaseOrder()`,
matching the open-orders count directly above it.

---

## The guard: printed totals must tie to printed lines

`packages/shared/src/print/totals-tie-out.ts` (new), enforced in
`TaxDocumentAssemblerService.assemble()` - the ONE point all 11 document types funnel
through on their way to a PDF or a render token, so no type can opt out by omission.

```
grandTotal  ==  sum(line.lineTotal)  -  orderDiscountTotal  +  deliveryFee
```

This is EXACT, not approximate, and deliberately has no tolerance: every document
assembled from the tax engine sets its header `total` from `sumDocumentTotals`, which is
literally the sum of each line's `grandTotal` (the value persisted as the line's
`lineTotal`); delivery orders sum the same field explicitly. A tolerance would only hide
the class of defect the guard exists to catch. It computes money in the print package -
the only place that is allowed to, because nothing it computes is ever rendered.

Two principled carve-outs, both stated in the file with their reason:

- `sales-receipt` / `purchase-supplier-payment`: a voucher's "lines" are allocations
  against source documents, and a payment may carry an unallocated on-account portion,
  so they sum to *at most* the payment. Different document shape, not a defect.
- Documents that print no line table: there is nothing on the page for the total to
  contradict.

Validated against every priced document in the live tenant. The single header-vs-lines
divergence in 21 documents is `B1ALRAIMAINS-INV-00006` (total 67.916, lines 57.916,
delivery fee 10.000) - which the formula models correctly and passes.

### Proof the guard can fail

| step | result |
|---|---|
| `npx vitest run totals-tie-out` (12 tests) | **12 passed** |
| replaced `if (grandTotal.equals(expected))` with `if (true)` | **3 failed, 8 passed** |
| restored | **12 passed** |
| `npx vitest run src/features/purchase/print` (2 tests) | **2 passed** |
| neutered `if (isPlumbingOrder) return null` to `if (false && ...)` | **1 failed, 1 passed** |
| restored | **2 passed** |

Tests added:
- `packages/shared/src/print/__tests__/totals-tie-out.spec.ts` - 12 cases, including the
  exact direct-purchase shape (`Qty 3 x 2.505`, grand total `0.000`), an off-by-0.001
  case, the delivery-fee and POS order-discount header rows, both voucher exemptions, and
  scale insensitivity (`7.5150000` == `7.515`).
- `apps/api/src/documents/tax-document-assembler.service.spec.ts` - 3 cases: an ordinary
  PO prints; a `DP-<uuid>` PO is refused; and, independently of the direct-purchase rule,
  ANY purchase order whose grand total contradicts its lines is refused by the funnel gate
  (verified by the logged `Refusing to render purchase-order po-1: grand total 0.000000
  does not tie to its lines (7.515)`).
- `apps/web/src/features/purchase/print/order-print-document.test.tsx` - 2 cases.

No existing assertion was changed, rewritten, or regenerated. All 23 pre-existing
assembler assertions still pass unmodified (26/26 total).

---

## Direct SALE: does not share the shape. CONFIRMED clear.

`apps/api/src/sales/direct/direct-sale.service.ts` inserts into exactly two tables:
`salesInvoices` (+ lines) and `directSales`. There is no synthetic sales order, no shadow
delivery order, no plumbing anchor of any kind - the invoice IS the document, created
directly with real totals. Confirmed in data: 11 sales invoice lines, 0 failing the
`qty x price - discount + tax = line_total` invariant, and every sales invoice with lines
ties to its lines except the one carrying a legitimate delivery fee.

The direct-purchase chain needs the anchor only because `grns.purchase_order_id` and
`grn_lines.purchase_order_line_id` are NOT NULL. Sales has no equivalent NOT NULL
back-reference, so it never needed one.

### Any other printed document that can disagree with its own lines?

Not any more, by construction: the tie-out gate runs on every document type at the single
assembly funnel. That is the point of putting it there rather than in the purchase-order
mapper - this defect class is now impossible to reintroduce by adding a new document type
and forgetting.

---

## Verification status and known-unrelated failures

- **Ledger gate (status-aware): `0.000000`** before and after. No documents were created
  this session, so `_documents-created.md` is unchanged.
- `pnpm --filter @zerupt/web typecheck`: the ONLY failing file is
  `src/features/organisation/components/controls-section.test.tsx`
  (`requireJournalApproval` / `onChangeJournalApproval` missing) - the approval/audit
  agent's in-flight work, untouched by this pass.
- `pnpm --filter @zerupt/api typecheck`: the ONLY failing file is
  `src/__tests__/integration/trial-balance.integration.spec.ts` (`isMonetary` missing on
  `accounts` inserts) - another agent's in-flight schema change, untouched by this pass.
- `pnpm --filter @zerupt/api build` is blocked by that same `isMonetary` error, so **the
  API could not be rebuilt or restarted and the fix was NOT verified against the running
  server.** It is verified through the real `TaxDocumentAssemblerService` in unit tests
  (26 passing) and through the real React component in jsdom (2 passing). The running API
  on :3001 still serves the old code; re-run
  `pnpm --filter @zerupt/api build` once the `isMonetary` spec is fixed by its owner.
- `npx vitest run src/print` in `packages/shared`: 596/598 pass. The 2 failures are
  `print-document-to-tax-document.spec.ts` and `resolve-template.spec.ts`, whose subject
  files (`print-document-to-tax-document.ts`, `document-template-types.ts`) both carry
  another session's uncommitted modifications. Pre-existing, not caused by this pass.

## Files changed

```
packages/shared/src/print/totals-tie-out.ts                          NEW
packages/shared/src/print/__tests__/totals-tie-out.spec.ts           NEW
packages/shared/src/index.ts                                         export added
apps/api/src/documents/tax-document-assembler.service.ts             DP refusal + funnel gate
apps/api/src/documents/tax-document-assembler.service.spec.ts        3 tests added
apps/api/src/purchase/overview/purchase-overview.service.ts          recent-orders exclusion
apps/web/src/features/purchase/print/order-print-document.tsx        DP print affordance removed
apps/web/src/features/purchase/print/order-print-document.test.tsx   NEW
```
