# Phase E — Sales module: exports, print documents, i18n/RTL

Static code audit only. No browser used (per assignment, browser wave owned by another agent).
Tenant: Gulf Auto Parts, Kuwait, KWD 3dp, no VAT, en+ar (RTL), auto-parts pack.

DB checks run against the live Gulf Auto Parts DB via the read-only connection in
`scratchpad/gulf_db_url.txt`.

---

## PART A — EXPORTS

### Inventory of export surfaces found

| Document | Route (list page) | Client builder | Server endpoint | Pattern |
|---|---|---|---|---|
| Invoices | `invoices/components/invoices-export-dialog.tsx` | `downloadCsv` + `rewriteCsvHeader` (header-only i18n) | `GET /tenant/sales/invoices/export` (`invoice-export.service.ts`) | **Server-side streaming build** (keyset-paginated, 1000-row batches, no cap). Client only downloads the file and localizes the header row. |
| Quotations | `quotations/components/quotations-export-dialog.tsx` | same pattern | `GET .../sales/quotations/export` | Same streaming pattern (mirrors invoices per its own header comment). |
| Delivery orders | `delivery-orders/components/delivery-orders-export-dialog.tsx` | same pattern | `GET .../sales/delivery-orders/export` | Same streaming pattern. |
| Direct sales (POS-adjacent direct invoice) | `sales/components/direct/direct-sales-export-dialog.tsx` | same pattern | `GET .../sales/direct/export` | Same streaming pattern. |
| Customers directory | `customers/components/customers-list-panel.tsx` | **Fully client-side**: `buildCsv`/`downloadCsv`, pages the list endpoint itself | `GET /tenant/sales/customers` (plain list endpoint, no export route) | Client-side page-looping export, capped at `EXPORT_MAX_ROWS = 5000`, cap is **disclosed** via a toast (`exportCapped`) — not silent. |
| Credit notes | none found | — | — | **No export surface exists** (see Finding E-A1). |
| Debit notes | none found | — | — | **No export surface exists** (see Finding E-A1). |
| Sales orders | none found | — | — | **No export surface exists** (see Finding E-A1). |
| Receipt vouchers (customer receipts) | none found | — | — | **No export surface exists** (see Finding E-A1). |

For every server-streaming export (invoices/quotations/delivery-orders/direct-sales), verified end to end:
- **Which half does the work**: the API route streams CSV body rows with machine-key headers
  (`INVOICE_HEADERS`, etc.); the web dialog fetches the file, calls the SHARED
  `rewriteCsvHeader` helper to translate ONLY the first line into the caller's locale, then
  `downloadCsv` triggers the browser save. Confirmed by reading
  `apps/web/src/features/invoices/components/invoices-export-dialog.tsx:1-20,150-165` and
  `apps/api/src/sales/invoices/export/invoice-export.service.ts` header comment. This matches
  the "withdrawn finding" warning in the brief — curling the JSON/count endpoint alone would
  NOT reproduce the real file; the client's `downloadCsv` call is where the file materializes.
- **Filters respected**: every export query is built from the SAME filter object the list page
  currently has applied (customer/salesperson/status/search/date range), and the count/stream
  endpoints share ONE `invoiceWhere`/`quotationWhere`/etc. predicate builder with the list
  service, so export rows can never diverge from what the screen shows
  (`apps/api/src/sales/invoices/invoice-filters.ts:145-172`, doc comment explicitly states
  this invariant). CONFIRMED by reading the shared predicate function.
- **Branch/legal-entity scope + cost.view**: all four streaming services call
  `branchScopeCondition(...)` inside their `where` builder (confirmed via grep —
  `invoice-filters.ts`, `quotation-filters.ts`, `delivery-order-export.service.ts:283`,
  `direct-sale-export.service.ts:332`). `inventory.cost.view` is resolved server-side
  (`InvoiceExportController.canViewCost` / same in delivery-order and direct-sale
  controllers) and gates whether `LINE_COST_HEADERS` (`costAtSale`, `marginAmount`,
  `marginPercent` / `costAtDelivery`) are even included in the header row — the cost columns
  are never fetched or serialized when the caller lacks the permission, not just hidden by the
  client. Quotations have no cost concept (pre-sale, no COGS yet) and correctly have no
  cost-gated columns or `inventory.cost.view` check at all — verified this is not an omission,
  quotation lines carry no `costAtSale`.
- **Filename pattern**: `${brandId}-invoices-${dateFrom}-to-${dateTo}${-lines suffix}.csv` (or
  `all-time` when no range) — no raw brand name hardcoded, uses the resolved Brand's `id`.
  Same convention across the four export controllers.
- **Value formatting**: money is formatted via `currencyDecimals(header.currency)` (never a
  hardcoded 2dp), so a KWD row prints at 3dp. Prices print at their stored 6-decimal scale
  (documented deliberately, `PRICE_SCALE`), which is a DIFFERENT precision from money totals —
  this is intentional per the code comment, not a bug, but worth the browser wave actually
  opening a downloaded KWD CSV and confirming `subtotal`/`total`/etc. columns read `123.456`
  (3dp) and NOT `123.46`/`123.450000`.
  Dates are formatted in the resolving branch's IANA timezone. Internal enum values
  (`invoice`/`posCreditSale` in the `source` column) are DELIBERATELY left as untranslated
  machine tokens — documented and justified (a CSV contract must not shift columns, and the
  header for that column IS translated) — not a finding.
- **No raw UUIDs**: salesperson id is intentionally a separate column alongside the resolved
  name (`salespersonId` + `salespersonName`) — the id column is documented API surface, not a
  leak, and the name resolves via a batched admin-DB lookup with an empty-string fallback
  (never a raw id in the *name* cell).

### Findings

**[HIGH] [CONFIRMED] E-A2 — Delivery fee is completely absent from every sales CSV export, even though it is a real monetary field the printed documents already surface.**
`sales_invoices`, `sales_orders` (schema) carry `delivery_fee_amount` / `delivery_fee_net` /
`delivery_fee_tax` with CHECK constraints tying them into the document total
(`packages/db/src/schema/sales.ts:324-491`: `total = subtotal − discountTotal + taxTotal +
deliveryFeeNet` (+tax)). None of the four export services
(`invoice-export.service.ts` `INVOICE_HEADERS`, `quotation-export.service.ts`
`QUOTATION_HEADERS`, `delivery-order-export.service.ts` `ORDER_HEADERS`,
`direct-sale-export.service.ts` `SALE_HEADERS`) include any delivery-fee column, while
`discountTotal` IS present in all four. This means: (a) a user cannot see WHY an exported
invoice's `total` doesn't reconcile to `subtotal − discountTotal + taxTotal` whenever a
delivery fee is charged, and (b) the shared print-document layer already has a
`totals.deliveryFee` row (`apps/web/src/features/print/document/sections/closing-sections.tsx:53`)
that the CSV counterpart never got — printed documents are correct, exports are not. This is
the exact class of gap named in the task brief ("an export omitting order-level discount and
delivery fee") — discount was fixed, delivery fee was not.
Current DB check: `select count(*) from sales_invoices where delivery_fee_amount > 0;` → `0`,
and same for `sales_orders` → `0`. So this is NOT currently visible in Gulf Auto Parts' live
data (no delivery fees have been charged yet), but it is a live code defect that will silently
under-document any invoice/order the moment a delivery fee is used — auto-parts delivery is a
plausible feature to turn on for this tenant.
Evidence: `apps/api/src/sales/invoices/export/invoice-export.service.ts:48-63` (headers),
`packages/db/src/schema/sales.ts:324-333`.

**[LOW] [CONFIRMED] E-A1 — No export exists for credit notes, debit notes, sales orders, or receipt vouchers.**
Verified by directory listing: `apps/web/src/features/{credit-notes,debit-notes,sales-orders,receipts}`
contain no `*-export-dialog.tsx`, and `apps/api/src/sales` has no `export/` subfolder under
`sales-orders/` (only under `direct/`, `invoices/`, `delivery-orders/`, `quotations/`). Credit
notes are reachable today only via the invoices export's cost-column decision (they are a
separate document type, not folded into the invoice CSV). Not necessarily a bug — may be an
intentional scope decision — but flagging since invoices/quotations/delivery-orders/direct-sales
all got the same "server-streaming + count preview" export UX and these four document types did
not, which is an inconsistent user experience for a document-heavy sales back office.

**[LOW] [FRICTION] Customers export cap (5,000 rows) is disclosed, not silent** — confirmed correct
behavior, listed here only so the browser wave doesn't waste time re-verifying it: toast copy
is `customers.list.exportCapped`, fires when `exportTotal > EXPORT_MAX_ROWS`
(`customers-list-panel.tsx:284-291`). Not a finding.

---

## PART B — PRINT DOCUMENTS

### Inventory

| Document | File | Uses `useTranslations`/`useLocale`? | Where |
|---|---|---|---|
| Sales invoice | `invoices/components/invoice-print-document.tsx` | Yes, but only for the **print button label + toast**, both OUTSIDE `#invoice-print-root`. Document content is built via `invoiceToPrintDocument` → `printDocumentToTaxDocument`, resolved through `useCustomerMap`/`useItemMap` and the shared print-label layer. **CLEAN — verified independently.** |
| Credit note | `invoices/components/credit-note-print-document.tsx` | Same pattern as invoice: `t`/`tInv`/`tPrint`/`tCn` only used for button/toast text, never inside the print root. **CLEAN — verified independently.** |
| Quotation | `quotations/print/quotation-print-document.tsx` | Same pattern. **CLEAN.** |
| Sales order | `sales-orders/print/sales-order-print-document.tsx` | Same pattern. **CLEAN.** |
| Customer receipt voucher | `customers/print/customer-receipt-print-document.tsx` | Same pattern for the translation hooks. **BUT see Finding E-B1 — a different, worse defect.** |
| Delivery order | `delivery-orders/print/delivery-order-print-document.tsx` | **VIOLATION — see Finding E-B2.** |
| Debit note | none exists | — | Debit notes have no dedicated print document at all (`features/debit-notes` has no `print/` dir and no print component anywhere in the repo) — could not audit what doesn't exist; flagged as a gap. |

The earlier wave's claim ("5 sales print documents reported clean, use
`useCustomerMap`/`useItemMap`, anti-regression comment") is **independently re-verified as
TRUE for invoice, credit note, quotation, sales order, and receipt voucher's translation-hook
usage** — in every one of those, `useTranslations` output only reaches the print button/toast,
never the `#...-print-root` DOM subtree, and buyer/customer/item names are resolved through
`useCustomerMap`/`useItemMap` with documented never-fall-back-to-raw-id behavior
(`invoices/lib/use-lookups.ts:16-36,72-90`). However, the earlier wave apparently did not cover
**delivery orders**, which DOES violate the rule, and did not catch the **receipt voucher's
raw-UUID leak**, which is a different bug class than the language-binding rule.

### Findings

**[CRITICAL] [CONFIRMED] E-B1 — Raw internal UUID (`sourceDocumentId`) prints as the "item name" on the customer receipt voucher, and is also shown raw on the receipt detail screen.**
`packages/shared/src/print/mappers/payment-voucher.mapper.ts:66-83` (`buildAllocationLines`)
sets `itemName: a.sourceDocumentId` verbatim for every allocation row — no lookup to the
invoice/credit-note's human-readable number. `CustomerReceiptAllocation.sourceDocumentId`
(`apps/web/src/features/customers/types.ts:326-331`) is the raw foreign-key id of the invoice
or credit note the payment was allocated against (`sourceDocumentType: "invoice" | "credit_note"`),
with no accompanying resolved-number field anywhere in the DTO.
`customer-receipt-print-document.tsx:51-56` (`buildAllocations`) passes `a.sourceDocumentId`
straight through into the shared mapper with no resolution step, and
`receipt-detail-panel.tsx:94-95` passes `receiptQuery.data` (the raw API response) directly
into `<CustomerReceiptPrintDocument receipt={...}>` — there is no intermediate id→number
lookup anywhere in this flow.
This means a printed/emailed customer receipt voucher literally lists the paid-off invoice as
its database UUID instead of its invoice number (e.g. "INV-1042"), on a document handed to the
customer. This mapper (`paymentVoucherToPrintDocument`) is ALSO used by
`apps/api`'s server-side chromium PDF assembly per its own doc comment ("the exact same mapper
apps/api's server-side chromium PDF assembly uses ... client preview and the emailed/downloaded
PDF are byte-for-byte identical") — so the emailed/downloaded PDF customers actually receive
carries the same defect, not just the in-app preview. The same mapper is shared with
`purchase-supplier-payment` print (out of this audit's scope, but almost certainly affected
too — worth a follow-up note to whoever owns Purchase).
This matches the exact bug class named in the brief ("A prior incident leaked a UUID onto eight
purchase print documents") — same defect, different document family.

**[CONFIRMED] E-B1b (same root cause, screen surface) — `receipt-detail-panel.tsx:261` also
renders the raw `sourceDocumentId` UUID in the on-screen "Allocated documents" table**
(`<TableCell className="font-mono text-xs">{a.sourceDocumentId}</TableCell>`), one line above
where the print document consumes the same unresolved field. Fixing the print doc alone
without fixing this table would leave the back-office screen showing the same raw UUID to
staff. Both surfaces need the invoice/credit-note number resolved (e.g. via
`useInvoiceMap`, already used elsewhere in this feature area for the analogous problem, though
note that helper's own doc comment says it "falls back to the raw id" on a failed lookup —
that fallback would ALSO need addressing for full defence-in-depth, since the exact hazard
this finding names is a raw id reaching a customer document).

**[HIGH] [CONFIRMED] E-B2 — Delivery order print document violates the "printed documents bind to the document's language" rule.**
`apps/web/src/features/delivery-orders/print/delivery-order-print-document.tsx:119`
(`const t = useTranslations("sales.deliveryOrders")`) is bound to the **viewer's active UI
locale** (next-intl's ambient locale context), not the document's own configured language. Its
output is then rendered DIRECTLY INSIDE the printed document root at lines 212-213 and
216-217:
```
<span className="text-muted-foreground">{t("print.deliveredBy")}</span>
<div className="border-foreground/40 border-t pt-1">{t("print.signature")}</div>
...
<span className="text-muted-foreground">{t("print.receivedBy")}</span>
<div className="border-foreground/40 border-t pt-1">{t("print.signature")}</div>
```
inside `<div id="delivery-order-print-root" className="hidden print:block">` (line 205),
i.e. this is the "driver-signable acknowledgement block" that DOES print. Every other label on
this same document (seller/buyer, line items, totals) correctly goes through the shared
label-pair/document-language layer via `PrintedDocument`/`orderLikeToPrintDocument` — only this
one added-on block bypasses it. If a delivery order's configured document language differs from
the printing staff member's UI locale (e.g. staff has switched their own UI to Arabic while the
document itself is set to print in English, or vice versa), "Delivered by" / "Received by" /
"Signature" will print in the WRONG language relative to the rest of the same physical page.
Fix direction: thread these three strings through the same label-pair mechanism
(`PrintLabel`/`model.fieldLabel`) the rest of the document uses, or add them as a proper block
in the shared print-document model, rather than a raw `useTranslations` call.

**[FRICTION] E-B3 — Debit notes have no print document at all.**
Grep across the whole `apps/web/src` tree for any debit-note print component returns nothing;
`features/debit-notes` has no `print/` directory. Credit notes, invoices, quotations, sales
orders, delivery orders, and receipt vouchers all have one. If debit notes are a live document
type on this tenant (they are — `debitNotes.detail.summary.subtotal` exists in messages and the
feature has a full detail panel), a customer/supplier-facing debit note that cannot be printed
or PDF'd is a gap the browser wave should confirm by opening a debit note detail page and
checking for the absence of a Print button.

**Tax-row suppression verified correct (not a finding):** the shared print-document template
resolver strips every `taxRelated`-flagged field wholesale for a no-tax country via
`documentShowsTax(doc.taxSystem, doc.countryCode)`
(`packages/shared/src/print/resolve-template.ts:195-196,227,249`) — this is declarative and
data-driven, not per-document conditionals, so Kuwait invoices/quotations/orders correctly print
with NO tax row and NO tax label at all. Verified by reading the gate, not just trusting the
doc comment.

---

## PART C — i18n / RTL

**[MEDIUM] [CONFIRMED] E-C1 — Quotation line-editor subtotal labels say "(excl. tax)" even in the no-tax Kuwait/Qatar tenant, where the sibling tax ROW is correctly suppressed.**
`apps/web/src/features/quotations/components/quotation-create-line-editor.tsx`:
- Line 474: `{t("form.lines.grossSubtotal")}` → en: `"Subtotal (excl. tax)"`, ar:
  `"المجموع الفرعي (قبل الضريبة)"` ("Subtotal (before tax)") — rendered **unconditionally**,
  not gated by `taxMode`/`showTaxRow`.
- Line 513: falls back to `{t("form.lines.estimatedSubtotal")}` → en: `"Estimated subtotal
  (excl. tax)"`, ar: `"الإجمالي الفرعي التقديري (غير شامل الضريبة)"` — also unconditional,
  used whenever `preview === null`.
- Compare: the actual tax AMOUNT row two lines below (line 503, `{showTaxRow && (...)}`) IS
  correctly gated: `taxMode === "exclusive"` only, with an explicit code comment
  ("`taxMode === 'none'` (Kuwait, Qatar) renders NOTHING here: no row, no label, no VAT/GST
  concept at all, per the founder ruling in tax-presentation.ts").
- The label text was never updated to match that ruling: on this tenant, a user creating a
  quotation line will see "Subtotal (excl. tax)" / "Estimated subtotal (excl. tax)" as
  permanent UI copy, introducing the concept of tax into a country that the founder's own
  standard says must never see it. This directly matches the project's own written rule
  ("Hide tax in no-tax countries — no VAT/GST UI in Kuwait/Qatar; visibility derived from
  country/brand config, never hardcoded").
- Fix direction: these two message keys need a tax-mode-aware variant (a plain "Subtotal" /
  "Estimated subtotal" string for `taxMode === "none"`), same pattern `showTaxRow` already uses
  to gate the row itself.

**i18n key parity** — verified programmatically (parsed both JSON trees, flattened all leaf
paths): `apps/web/messages/en/sales.json` and `apps/web/messages/ar/sales.json` have **0 keys
missing on either side** — full parity confirmed independently of `i18n:check` (which per the
brief cannot catch a key missing from BOTH locales — I did not find any such case either, based
on cross-referencing every `t("...")` call site checked above against both files).

**Em dashes** — grepped both `en/sales.json` and `ar/sales.json` for `—`: zero occurrences.
Clean.

**Jargon/internal terms** — grepped both message files for `reverse-charge`, `contra`,
`hard block(s)`, `Auto:` : one unrelated hit (`AMEND_ADAPTER_CONTRACT` — this is a message KEY
name, not user-facing text; its VALUE is plain language: "This invoice carries an unsupported
exchange rate and cannot be edited this way." / Arabic equivalent, both fine). No jargon leaks
found in the sales namespace.

**Empty-value placeholders** — grepped the whole sales feature surface for hardcoded `"N/A"`,
`"—"`, `"-"` literals used as placeholders: none found outside of one comment describing the
intended (correct) behavior. `EMPTY_VALUE_PLACEHOLDER` usage confirmed in
`invoice-print-document.tsx:98` for the buyer name fallback.

**RTL / physical CSS** — grepped the entire sales feature tree (invoices, credit-notes,
debit-notes, receipts, customers, quotations, sales-orders, delivery-orders, sales,
sales-overview) for `margin-left`, `margin-right`, `padding-left`, `padding-right`,
`text-align: left/right`, and Tailwind `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-` utility classes:
**zero matches**. Every directional style in scope uses logical properties/utilities (`ms-`,
`me-`, `ps-`, `pe-`, `inset-inline-start`, etc. — confirmed present in the print-style blocks
read above, e.g. `inset-block-start`/`inset-inline-start` in every print document's
`PRINT_STYLES` constant).

**Arabic mistranslation check (money terms)** — checked every `subtotal`-adjacent key across
both locale files for the specific hazard named in the brief ("Subtotal" mistranslated as
"total before tax"). All 15 `subtotal` keys in ar/sales.json read either "المجموع الفرعي" or
"الإجمالي الفرعي" (both = "subtotal"), consistent with en. The two keys flagged in E-C1 DO carry
tax wording in both languages consistently (not a mistranslation — both languages agree, the
underlying English label itself is wrong for this country), so this is filed as an i18n/UX
finding (E-C1), not a translation-accuracy finding.

---

## Summary table

| ID | Area | Severity | Status | One-line |
|---|---|---|---|---|
| E-B1 | Print (receipt voucher) | CRITICAL | CONFIRMED | Raw invoice/credit-note UUID prints as line-item name on customer receipt voucher (client preview AND server PDF) |
| E-B1b | Screen (receipt detail) | HIGH | CONFIRMED | Same raw UUID shown on-screen in the allocations table |
| E-B2 | Print (delivery order) | HIGH | CONFIRMED | Driver signature block bound to viewer UI locale, not document language |
| E-A2 | Export (all 4 streaming exports) | HIGH | CONFIRMED (code defect; 0 live rows affected today) | Delivery fee column missing from every sales CSV export; total won't reconcile once used |
| E-C1 | i18n (quotation line editor) | MEDIUM | CONFIRMED | "Subtotal (excl. tax)" / "Estimated subtotal (excl. tax)" shown unconditionally in no-tax Kuwait tenant |
| E-A1 | Export (credit/debit notes, sales orders, receipts) | LOW | CONFIRMED | No export UI exists for 4 of 8 sales document types |
| E-B3 | Print (debit notes) | FRICTION | CONFIRMED | No print/PDF surface exists for debit notes at all |
| — | Customers export cap | — | Not a finding | 5,000-row cap is disclosed via toast, not silent |
| — | Tax-row suppression | — | Not a finding | Verified declarative, data-driven, correct for no-VAT tenant |
| — | i18n parity / em dashes / jargon / RTL CSS | — | Not a finding | All clean on independent verification |

---

## VERIFY-IN-BROWSER CHECKLIST (for the next agent)

Login as owner `anonymator8@gmail.com` at `http://gulf-auto-parts.localhost:3000/en/login`
first — assert who you are before drawing conclusions (rule 2 in the briefing).

1. **E-B1 / E-B1b (CRITICAL — do this first).**
   - Go to a customer with at least one posted receipt allocated against an invoice
     (`/en/customers` → pick one with an "outstanding" or paid history → Payments tab → open a
     receipt). If none exist, create one: post a `ZZTEST` invoice, then record a `ZZTEST`
     payment against it (a receipt voucher), then open that receipt's detail panel.
   - On the receipt detail screen, check the "Allocated documents" table — the left column
     should show the invoice/credit-note NUMBER (e.g. `INV-1234`), not a UUID like
     `a1b2c3d4-....`. Screenshot whatever you see.
   - Click Print on that receipt (or trigger the download/email PDF path if reachable) and
     inspect the rendered document's line item / allocation row — same check: number, not UUID.
   - If you can also reach a supplier-payment print/PDF (Purchase module, out of this audit's
     scope but shares the same mapper), spot-check it too since the defect is in shared code.

2. **E-B2.** Open `/en/delivery-orders`, open or create a `ZZTEST` delivery order, click Print.
   Inspect the two-column signature block at the bottom ("Delivered by" / "Received by" /
   "Signature" lines). Then: (a) switch your own UI to `/ar/...` while the delivery order's
   OWN print-language setting (Settings → Print → Document Language, if per-document) is set to
   English, print again, and confirm the signature-block text still switches with YOUR UI
   locale instead of staying English like the rest of the document. If there's no easy way to
   decouple document language from UI language in this environment, at minimum confirm by code
   inspection cross-reference (already done above) and note in your report that the live
   repro requires a document-language override to be exercised.

3. **E-A2.** Create a `ZZTEST` sales order or invoice with a non-zero delivery fee (check
   whether the create form even exposes a delivery-fee field for this auto-parts/no-tax
   tenant — if it doesn't, this finding may be moot for THIS tenant's UI even though the
   backend supports it, worth noting). If a delivery fee can be entered: confirm it appears on
   the PRINTED document (it should, per `totals.deliveryFee` in the shared print layer), then
   export that same invoice/order to CSV and confirm the delivery fee column is genuinely
   absent and that `subtotal − discountTotal + taxTotal ≠ total` in the downloaded file.

4. **E-C1.** Open `/en/quotations/new` (or the create-line-editor for a `ZZTEST` quotation),
   add a line, and read the running-totals panel at the bottom: confirm "Subtotal (excl. tax)"
   / "Estimated subtotal (excl. tax)" is visible with NO other tax mention anywhere else on the
   page (i.e. the tax AMOUNT row is correctly absent, but these two labels still say "tax").
   Repeat in `/ar/...` and confirm the Arabic wording carries the same "(قبل الضريبة)" /
   "(غير شامل الضريبة)" phrasing.

5. **Export mechanics sanity (all four streaming exports).** For invoices, quotations, delivery
   orders, and direct sales: apply a non-trivial filter combination on the list page (e.g.
   status=confirmed + a date range + a customer), open the Export dialog, confirm the filter
   chips shown match what's applied, download, and open the CSV. Check: (a) row count matches
   the dialog's live count preview, (b) money columns read at 3dp with no currency symbol
   glued on (KWD is a separate column), (c) the `source` column on invoices reads `invoice` or
   `posCreditSale` (never blank, never a raw event-type string), (d) log every in this
   directory in with an `inventory.cost.view`-lacking user (e.g. `cashier1`) to confirm the
   `costAtSale`/`marginAmount`/`marginPercent` columns are ABSENT from the header row entirely
   (not just blank cells) — this is the strongest server-side proof of E-A2's sibling claim
   that cost stripping is real and not just client-side hiding.

6. **Customers export cap.** If the tenant's customer count is under 5,000 this can't be
   directly triggered — skip unless the DB is seeded past that threshold.

7. **Debit note print (E-B3).** Open a debit note detail page and confirm there is genuinely no
   Print/PDF button anywhere on the screen, to rule out it being reachable via a route this
   audit didn't find (e.g. a shared action inherited from a generic document toolbar).
