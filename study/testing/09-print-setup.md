# 09 — Print Setup / Printed-Document System

Tester: fresh agent, inherited nothing. Tenant **Gulf Auto Parts** (Kuwait, KWD 3dp,
primaryLanguage `en`, secondaryLanguage `ar`, `isRtlDefault=true`, `logoUrl=null`).
Method: code breadth (`packages/shared/src/print`, `apps/web/src/features/print*`,
`apps/api/src/documents`, `apps/api/src/tenant-settings`) + SQL + authenticated curl +
a live browser rendering pass via gstack browse.

**Ledger identity gate** — before: `7.000000` on all rows (traced to ANOTHER agent's
`ZZTEST unbalanced probe 2`, a deliberate unbalanced **draft**, id
`6203133e-97af-4024-ba33-9dc85304ee25`; posted-only was `0.000000`). After: both
all-rows and posted-only are `0.000000` (that agent cleaned its probe up).
**I created no documents and wrote nothing** — this pass was entirely read-only, so
`_documents-created.md` is unchanged.

**Environment note.** The machine was saturated by concurrent agents (several parallel
`nest build`, `tsc --noEmit` and `eslint` runs). The Next dev server degraded from seconds
to `GET /en/login 200 in 19.3min`, then 10.2min, then 4.7min, and finally to empty replies
(curl exit 52); the gstack browse daemon was restarted out from under me repeatedly. This
ended the browser pass early and is the cause of every gap in §8. It is an environment
condition, not a defect in this module.

---

## 1. Document-type inventory

The canonical set is `PRINT_DOCUMENT_TYPES` (`packages/shared/src/print/document-types.ts`),
11 types, all dispatched by `TaxDocumentAssemblerService.assemble()`
(`apps/api/src/documents/tax-document-assembler.service.ts:134-163`, exhaustiveness-guarded).

| # | Document type | Renderer | Label source | Medium | Reachable from UI | Language binding verified |
|---|---|---|---|---|---|---|
| 1 | Sales invoice | `PrintedDocument` via `features/invoices/components/invoice-print-document.tsx` | `label-resolver.ts` (document language) | A4/Letter — server Chromium PDF, browser-print fallback | Yes — invoice detail, "Print" | **YES, live** (see §2) |
| 2 | Sales credit note | `PrintedDocument` via `features/invoices/components/credit-note-print-document.tsx` | same | A4/Letter | Yes — CN detail | Yes (same renderer + unit matrix) |
| 3 | Sales order | `PrintedDocument` via `features/sales-orders/print/sales-order-print-document.tsx` | same | A4/Letter | Yes — SO detail | Yes (shared path) |
| 4 | Sales quotation | `PrintedDocument` via `features/quotations/print/quotation-print-document.tsx` | same | A4/Letter | Yes — quotation detail | Yes (shared path) |
| 5 | Sales delivery order | `PrintedDocument` via `features/delivery-orders/print/delivery-order-print-document.tsx` | same | A4/Letter | Yes — DO detail panel | Yes (shared path) |
| 6 | Sales receipt (receipt voucher) | `PrintedDocument` via `features/customers/print/customer-receipt-print-document.tsx` | same | A4/Letter | Yes — customer/receipt surface | Yes (shared path) |
| 7 | Purchase bill | `PrintedDocument` via `features/purchase/print/bill-print-document.tsx` | same | A4/Letter | Yes — bill detail | Yes (shared path) |
| 8 | Purchase order | `PrintedDocument` via `features/purchase/print/order-print-document.tsx` | same | A4/Letter | Yes — `order-detail-panel.tsx:300`, non-draft only | Yes (shared path) |
| 9 | Purchase GRN | `PrintedDocument` via `features/purchase/print/grn-print-document.tsx` | same | A4/Letter | Yes — GRN detail | Yes (shared path) |
| 10 | Purchase supplier payment | `PrintedDocument` via `features/purchase/print/supplier-payment-print-document.tsx` | same | A4/Letter | Yes — payment detail | Yes (shared path) |
| 11 | Stock transfer | Server PDF: `stock-transfer.mapper.ts` → `PrintedDocument`. **Browser fallback: a SECOND hand-rolled body**, `features/inventory/components/transfers/delivery-note.tsx` | delivery-note has its OWN label layer (`inventory/print/delivery-note-labels.ts`) — still document-bound | A4 | Yes — transfer detail "Delivery note" | Yes (own label layer, verified by read) |

Additional printable surfaces **outside** the 11-type engine:

| Surface | Renderer | Label source | Medium | Reachable | Language binding |
|---|---|---|---|---|---|
| POS customer receipt (server) | `features/pos/components/receipt-document.tsx` | `pos-print-context.ts` (document language, mirrors A4 mechanism) | Browser print, thermal-width CSS | Yes — POS | Yes (own doc-language context) |
| POS offline/local receipt | `features/pos/components/local-receipt-document.tsx` | `pos-print-context.ts` | Browser print | Yes — POS offline | Yes |
| POS tax-invoice overlay | `features/pos/components/pos-tax-invoice-overlay.tsx` → `PrintedDocument` | `label-resolver.ts` | A4 | Yes — POS | Yes (shared renderer) |
| **POS Z-report** | `features/pos/components/z-report-document.tsx` | `useTranslations`/`useLocale` — **VIEWER locale** | Browser print | Yes — POS close shift | **Sanctioned exemption**, documented in the file header (cashier IS the reader) |
| POS X-report | `x-report-dialog.tsx` | viewer locale | screen/print | Yes | Same exemption class as Z-report (see FRICTION-1) |
| ZATCA QR block | `features/zatca/components/zatca-qr-image.tsx` | fallback text **threaded in as a prop** from the label layer | inline on the A4 tax invoice | KSA tenants only | Yes — regression closed, pinned by `printed-document.language-binding.test.tsx:232` |
| Public receipt page `/r/[token]` | `app/[locale]/(public)/r/[token]` | n/a | browser print | Yes — public link | Not audited (see gaps) |
| Reports PDF export | `features/reports/lib/pdf-export.ts` | reports own | PDF | Yes | Out of scope of this module |
| Labels / barcodes | `features/pos/components/receipt-barcode.tsx` only (receipt-embedded) | n/a | — | — | **No standalone item/shelf label printing exists** (see MED-3) |

Count: **11 engine document types + 8 other printable surfaces = 19 printable things.**

---

## 2. THE VERDICT ON RULE 1 (document language, never viewer locale)

**PASS — CONFIRMED, both directions.**

**Direction A (live browser, the decisive test).** Same sales invoice
`cbc740e6-d641-4118-bbb4-2daedda7a3ba` (`B1ALRAIMAINS-INV-00006`), logged in as owner,
Al Rai branch. Captured `document.querySelector('#invoice-print-root').textContent`
under `/en/...` and then under `/ar/...`:

```
⁨Gulf Auto Parts⁩⁨Al Rai⁩InvoiceInvoice No.B1ALRAIMAINS-INV-00006Issue Date29/08/2026
Due Date29/08/2026Bill To⁨Al-Sabah Workshop 18⁩...#ItemQtyUnit PriceDiscountLine Total
1⁨Lower Control Arm Valeo Mitsubishi Pajero⁩⁨مقص سفلي Valeo⁩⁨GAP-SUSARM-02659⁩
1KWD 57.916KWD 0.000KWD 57.916SubtotalKWD 57.916Delivery feeKWD 10.000
Grand TotalKWD 67.916Payment Terms⁨Due on receipt⁩Notes⁨ZZTEST delivery-fee invoice…⁩
```
`diff` of the two captures: **byte-identical.** The document stayed English under an
Arabic UI.

**Layout direction is bound too, not just text.** Under `/ar` (`document.documentElement.dir
=== "rtl"`), the printed document root reports `attr=ltr computed=ltr htmlDir=rtl`
(`#invoice-print`, set by `printed-document.tsx:199` `dir={model.direction}`). So the
printed page does not mirror to RTL just because the viewer's chrome did. This is the
part a text-only check would have missed.

**Direction B (Arabic document under an English viewer).** The web dev server became
unresponsive before I could drive the settings preview language toggle, so I proved this
from the pinned matrix instead: `npx vitest run language-binding` from `apps/web` →
**Test Files 1 passed, Tests 10 passed**. That file mocks `next-intl` so that ANY
`useTranslations`/`useLocale` call throws, and asserts among others:
- "renders IDENTICAL markup for the same document whatever the viewer's locale would have been"
- "flips to Arabic table headers, title, and tax-reg caption when the DOCUMENT's language is Arabic — not the viewer's"
- "localises the ZATCA QR fallback warning to the DOCUMENT language"

**Scoped by what renders, not by directory (rule 2).** I grepped every file in
`apps/web/src` containing `@media print`, `window.print()` or `print:block` — 23 files —
and read the `useTranslations`/`useLocale` usage in each. Every hit outside the sanctioned
Z-report/X-report is **chrome only**: the Print button label, the "sent to browser" toast,
loading/error copy. None reaches the printed tree. `features/delivery-orders/print/
delivery-order-print-document.tsx:195` even carries an explicit comment saying so.
`packages/shared/src/print/**` imports no React and no next-intl at all.

---

## 3. Scoping model of print setup

`resolve-effective-template.ts` documents and implements a **7-layer sparse-diff override
chain**, lowest to highest precedence:

1. country (`COUNTRY_TEMPLATE_DEFAULTS`, code-side)
2. brand (`BRAND_TEMPLATE_DEFAULTS`, code-side)
3. pack (position declared, **no producer yet** — see LOW-2)
4. tenant global (`branchId = null`, `documentType = "*"`)
5. tenant per-document-type (`branchId = null`, `documentType = <type>`)
6. branch, all types (`branchId = <branch>`, `documentType = "*"`)
7. branch + document type

**Verdict: coherent and long-term scalable.** Every layer is a sparse diff over the same
`document_templates` shape, so adding a level costs zero columns and zero migration.
Country and brand are deliberately code-side (a tenant must not be able to author a
country default). Pack keys are resolved server-side from active `tenant_packs` grants,
never from a caller-supplied list — the comment correctly calls the alternative a
tenant-isolation breach rather than a cosmetic bug.

**Per-user / per-device scoping does not exist and correctly should not**: a printed
document is a company artifact, not a user preference. The only per-device-ish setting is
per-POS-register receipt behaviour (`pos_registers`), which is the right home for it.

**Printer selection is NOT implemented for A4 documents** — see MED-2.

---

## 4. Findings

### CRITICAL
None.

### HIGH

**HIGH-1 — Accountant and Viewer see a "Printing & Documents" settings section that 403s
on everything inside it. The permission it needs is granted to NO role. CONFIRMED, live.**

Chain, each link verified:

1. Frontend gates the section on `settings.numbering.read`
   (`apps/web/src/lib/settings-sections.ts:191-197`).
2. **Accountant and Viewer hold that key**, so the nav entry renders for them:
   ```
   $ psql -Atc "select r.name from roles r join role_permissions rp on rp.role_id=r.id
                where rp.permission_key='settings.numbering.read' order by 1;"
   Accountant
   Viewer
   ```
3. Every endpoint the Documents tab calls requires a *different* key —
   `settings.tenant.read` (GET, GET /effective) / `settings.tenant.update`
   (PUT, POST copy-from-tenant, DELETE) — `document-templates.controller.ts:51,63,79,96,113`.
4. **No role anywhere holds `settings.tenant.*`:**
   ```
   $ psql -Atc "select count(*) from role_permissions where permission_key like 'settings.tenant%';"
   0
   ```
   The keys ARE catalogued (`packages/shared/src/permissions.ts:239-240`
   `tenantRead`/`tenantUpdate`) but appear in **zero role templates** —
   `grep "settings.tenant" packages/shared/src/role-templates.ts` returns nothing.
   So they are unreachable except through the Owner bypass
   (`apps/api/src/auth/permission.service.ts:51,68-69`).

**Live proof**, same endpoints, two identities:
```
--- accountant1 ---
  GET tenant/settings/document-templates            403 {"message":"Access denied",...}
  GET tenant/settings/document-templates/effective  403 {"message":"Access denied",...}
--- owner ---
  GET tenant/settings/document-templates            200 {"data":[]}
  GET tenant/settings/document-templates/effective  200 {"data":{"schemaVersion":1,...}}
```

**Root cause, stated in the codebase itself.** A permission-bundle recomposition pass
widened Viewer and Accountant to include `settings.numbering.read`, and
`role-templates.ts:224` and `:309` both justify it as *"harmless — the Viewer already saw
users, roles, branches, warehouses, currencies, taxes and audit read-only; seeing the
legal entity, fiscal periods and numbering scheme read-only is not a new capability
class."* That reasoning is correct about *numbering*, but the frontend **reuses that same
key to gate the Printing & Documents section**, so the widening silently unlocked a nav
entry whose contents nobody but the owner can load.

This is structurally identical to the orphaned `reports.sales.read` the Reports program
found and fixed. The fix is to grant `settings.tenant.read` to the roles that should
configure documents (and `settings.tenant.update` to those that should save), then gate
the section on the key its own endpoints require — not on `numbering`.

**Note on the two controller spec files.** `document-templates.controller.spec.ts:35-39`
and `tenant-settings.controller.spec.ts:32-40` assert the decorators carry exactly these
keys, and they pass. They pin the drift in place rather than catching it, because they
verify the decorator against itself and never against the role catalogue or the frontend
gate. This is the briefing's method rule 1 in the wild: a green test that proves nothing
about the user-facing outcome.

### MEDIUM

**MED-1 — Direct-purchase placeholder UUID reaches the printed purchase order. CONFIRMED.**
`apps/api/src/purchase/purchase-order-number.ts` exists precisely to stop this: a
direct-purchase hidden PO is numbered `DP-${randomUUID()}`, and every user-facing
projection is supposed to go through `userFacingPurchaseOrderNumber` (NULL for those) or
`isDirectPurchasePlaceholderNumber`. **The print path uses neither.**
`tax-document-assembler.service.ts:681` passes `number: order.number` raw, and line 715
builds `fileName: \`purchase-order-${order.number}.pdf\``.
Evidence:
```
$ psql -Atc "select case when number ~ '[0-9a-f]{8}-[0-9a-f]{4}-' then 'UUID-STYLE'
             else 'normal' end, status, count(*) from purchase_orders group by 1,2"
UUID-STYLE | received | 3
```
```
$ curl .../tenant/purchase/orders/006cff34-3ede-4a5e-8c52-951b196a9fe0
{"data":{"number":"DP-22cf3812-0b72-47b5-a71c-101399ea209a","status":"received",...}}
```
`order-detail-panel.tsx:300` mounts `OrderPrintDocument` for any `status !== "draft"`, and
these are `received`. So a printed PO would show `DP-22cf3812-0b72-47b5-a71c-101399ea209a`
where a document number belongs, and the PDF would be saved under that name. This is
exactly the SAL-PRINT-001 class the codebase already knows about — only the fix was
applied at the export/report call sites and not at the print primitive.
*Reachability caveat, stated honestly*: the PO **list** excludes direct-purchase rows
(`notDirectPurchaseOrder()`), so a user reaches this detail page only by a direct link or
a cross-reference, not by browsing. That is why this is MEDIUM and not HIGH. The right
fix is at the primitive (make the placeholder unrepresentable in a `PrintDocument`), not a
filter in the assembler.

**MED-2 — There is no printer selection anywhere, and no thermal medium.
CONFIRMED.**
The task brief describes "printer-select everywhere" as established architecture. It is
not implemented. `dispatch-print.ts` has exactly two outcomes: `pdf-tab` (fetch the server
PDF, `window.open`) or `browser` (`window.print()` and the OS dialog). There is no printer
registry table (`information_schema`: the only related tables are `pos_registers` and
`document_templates`), and `PrintersPanel` is explicitly informational — its own header
comment reads *"Printers tab — HARDWARE ONLY … receipt printing goes through the
computer's normal print dialog (no separate agent/pairing step)"*.
Separately, the print codemap records that the ESC/POS + ESC/P thermal stack
(`apps/print-agent/`) was **deleted** and the Phase 13 thermal rebuild is **not built**.
So "thermal" is a CSS width on a browser-printed page, not a medium.
This is a defensible interim state and the UI is honest about it, but it must not be
described as done. A Kuwaiti shop with a counter thermal printer and a back-office A4
printer has no way to say which document goes where.

**MED-3 — No standalone label / barcode / shelf-tag printing exists. CONFIRMED.**
The only barcode renderer is `features/pos/components/receipt-barcode.tsx`, embedded in
the POS receipt. There is no item-label, shelf-tag, or price-gun document type in
`PRINT_DOCUMENT_TYPES` and no label-printer medium. For an auto-parts retailer with 5,000
SKUs this is a real gap, not a cosmetic one. Flagging it as inventory rather than a defect
in what was built.

**MED-4 — Server Chromium PDF render fails in this environment; every print silently
falls back to the browser dialog. CONFIRMED locally, SUSPECTED to be dev-only.**
```
$ curl .../tenant/documents/sales-invoice/<id>/pdf
{"message":"Chromium PDF render failed: Navigation timeout of 20000 ms exceeded",
 "error":"Service Unavailable","statusCode":503}
```
Reproduced on three document types. Not a token or route problem: I warmed
`http://localhost:3000/en/print/render` directly (404 in 5.6s, which is the correct
no-token `notFound()`), and the renderer's own code would have thrown
`"Print route returned 404"` rather than a timeout had navigation completed. The likely
cause is `page.goto(..., { waitUntil: "networkidle0" })`
(`chromium-pdf-renderer.ts:465-468`) never settling against the Next dev server, whose HMR
socket keeps a connection open. I could not prove that from a production build, so this is
marked SUSPECTED as to whether it affects prod.
The **behaviour** is nonetheless confirmed and worth stating: when the PDF path fails,
`dispatchDocumentPrint` degrades to `window.print()` and shows an info toast
(`tPrint("sentToBrowser")`). That is a correct, non-silent fallback — but it means A4
geometry, multi-copy expansion and the everyPage footer are produced by the user's browser
rather than the engine, and nobody is alerted that the primary path is down.

**MED-5 — POS receipt money formatting bypasses the print engine's precision guards.
CONFIRMED.**
`receipt-document.tsx:392-400` and `local-receipt-document.tsx:89-97` both do:
```ts
const num = Number(value);
return formatCurrency(num, "en", currency);
```
Two divergences from the A4 contract, which the codemap states as an architecture
invariant ("money is never computed in the print layer … passes server-supplied decimal
strings through verbatim"):
1. The decimal **string is coerced to a JS `Number`**, so the `exceedsSafePrecision` /
   `isZeroDecimalString` guards in `packages/shared/src/print/format/decimal-string.ts`
   never run on this path.
2. Locale is hardcoded `"en"`. The comment says why ("digits are 0-9 on every printed
   receipt"), which is a *reasonable* thermal-hardware call — but the A4 engine has a real
   `numerals.ts` seam supporting `arab`, so a tenant who configures Arabic-Indic numerals
   gets them on the invoice and not on the receipt, with no setting explaining the split.
KWD 3dp is still correct here (it comes from the currency, not a hardcoded count).

### LOW

**LOW-1 — `#invoice-print-root` wrapper inherits the viewer's RTL. CONFIRMED, cosmetic.**
Under `/ar`, `getComputedStyle(document.querySelector('#invoice-print-root')).direction`
is `rtl` (inherited from `<html dir=rtl>`); only the inner `#invoice-print` sets
`dir="ltr"`. The wrapper's scoped print CSS uses `inset-inline-start: 0` with
`width: 100%`, so under RTL it resolves to `right: 0` and the visual result is unchanged.
No user impact today. It is a latent trap: the wrapper is the one element in the printed
stack whose direction is viewer-derived, and every sibling document root
(`bill-print-document`, `order-print-document`, …) copies the same pattern. Setting
`dir` on the wrapper from the document model would close it at the pattern level.

**LOW-2 — Pack layer of the template chain is declared but has no producer.**
`resolve-effective-template.ts:29-40` reserves precedence level 3 for packs and correctly
notes that no pack today defines any template diff. Honest and documented; recorded here
so an audit does not mistake it for wiring that exists. The auto-parts pack is active on
this tenant and contributes nothing to print.

### FRICTION

**FRICTION-1 — The POS X-report shares the Z-report's exemption without the Z-report's
written justification.** `z-report-document.tsx:3-13` carries a careful,
re-litigate-before-changing rationale for binding to the viewer's locale. `x-report-dialog.tsx`
uses `useTranslations` too and carries no equivalent note. Same reasoning almost certainly
applies (mid-shift report, cashier is the reader), but "exactly ONE sanctioned exemption"
is now two in practice. One comment closes it.

---

## 5. Rules checked and found CLEAN

- **Rule 4 (no em dashes).** `grep -rn "—"` over `apps/web/messages/` returns exactly one
  hit, in `CONVENTIONS.md` prose. `en/print.json` and `ar/print.json`: **0**. The shared
  formatters are clean — `EMPTY_VALUE_PLACEHOLDER` is `"-"` (hyphen,
  `packages/shared/src/format/empty-value.ts:15`), not the em dash that caused RPT-052.
  Every `—` under `packages/shared/src/print/` is inside a code comment. **No regression
  of the primitive.**
- **Rule 6 (canonical money/quantity primitives).** `format/money.ts` delegates to
  `formatMoneyAmount`/`formatMoneyWithSymbol`; `format/quantity.ts` to `formatQuantity`.
  No hardcoded decimal count anywhere in the print tree — the only `toFixed` calls are
  `toFixed(1)` on a display-only tax-rate *percent* (`shared-mapping.ts:141`),
  `toFixed(scale)` where `scale` is currency-derived (`shared-mapping.ts:224`), and
  `toFixed(4)` on a rem font-scale (`printed-document.print.css.ts:63`). KWD rendered
  3dp live: `KWD 57.916`, `KWD 0.000`, `KWD 67.916`. Only exception: MED-5 above.
- **Rule 7 (path divergence).** Grepped every renderer/label/format helper name for a
  second exported body: `buildPrintFormatContext`, `formatPrintMoney`, `resolveTemplate`,
  `buildSampleTaxDocumentData`, `printDocumentToTaxDocument`, `isSafePrintImageUrl` —
  **all single-sourced in `packages/shared/src/print/`**, consumed identically by
  `apps/web` (preview) and `apps/api` (Chromium PDF). The one genuine second body is the
  stock-transfer delivery note (inventory table row 11); it has its own label layer and is
  still document-bound, so it is a maintenance risk, not a correctness bug.
- **CSS logical properties only.** Grepped `margin-left|margin-right|padding-left|
  padding-right|text-align:left|text-align:right|ml-N|mr-N|pl-N|pr-N|text-left|text-right|
  left:|right:` across `features/print/**`, `receipt-document.tsx`, `delivery-note.tsx` —
  **zero hits.** `layout/geometry.ts` expands one `marginMm` into four logical sides.
- **Brand is config-driven; no hardcoded "Zerupt" in a printed tree.** `lib/brand.ts` is
  `resolveBrand(process.env.NEXT_PUBLIC_BRAND)`, which throws on unset/unknown rather than
  defaulting. The only `Zerupt` strings under `packages/shared/src/print/` are in comments.
  The Chromium renderer resolves its render target from `resolveBrand(getTenantContext()
  .brand).appUrl` specifically so a Merpec invoice cannot be printed with Zerupt styling
  (`chromium-pdf-renderer.ts:442-455`), with `WEB_URL` demoted to a localhost-only dev
  override. Correct.
- **Audit capture on print setup changes.** All three mutating template endpoints carry
  `@Audited("DocumentTemplate")` (`document-templates.controller.ts:80,97,114`) and all
  five tenant-identity mutations carry `@Audited("TenantIdentity")`. DB confirms the
  mechanism works — `audit_log` holds `TenantIdentity|update|4`. Zero `DocumentTemplate`
  rows only because this tenant has never saved a template (`select count(*) from
  document_templates` → `0`).
- **Permission gating on the PDF endpoint.** `document-pdf.controller.ts` gates
  dynamically per `:documentType` via `assertCanRead`, requiring the same read permission
  as that document's own detail route. Correct — a static decorator would have been wrong
  here. (This is the PDF *render* endpoint and is unaffected by HIGH-1, which is about the
  template *settings* endpoints.)
- **Image / SSRF gate.** `isSafePrintImageUrl` resolves via `new URL(url, SENTINEL_ORIGIN)`
  and compares `.origin` — not a string prefix, which is the fix for the `//evil.com` and
  `/\evil.com` bypasses. Companion write-boundary `assertLetterheadUrlsAreStorageOrigin`
  rejects any letterhead URL whose origin is not the tenant-assets Supabase origin. Matches
  the "validate with the real parser" principle.
- **Logo defensive limits.** 2 MB cap enforced **both** client-side
  (`letterhead-background-upload.tsx:23,73`) and server-side
  (`tenant-settings.service.ts:30`), with a server spec covering the 2MB+1 case.
  `logoUrl` is `null` on this tenant and the invoice rendered correctly without one.
- **Pop-up blocked / no-PDF defensive path.** `dispatch-print.ts:103-106` checks the
  `window.open` return and falls back to `window.print()` with a reason, rather than
  silently doing nothing.
- **en/ar parity.** `en/print.json` vs `ar/print.json`: 185 keys, **0 en-only, 0 ar-only**.
  `ls en` vs `ls ar` identical.
- **FX fails loud.** `isFxRateSuspect()` and `PrintFxReasonCode = "fx.rate_unavailable"`
  exist so a missing rate surfaces as a reason code, never a silent `1`. Callers that
  genuinely have no booking rate (order-like, purchase order) pass `"1"` explicitly and
  say so in a comment.

---

## 6. Withdrawn after investigation

- **"The entire print-settings feature is unreachable."** My first grep for importers of
  `@/features/print-settings` looked only in `app/` and `features/settings/`. It is
  mounted at `components/settings/printing-documents-panel.tsx:5` and reachable at
  `/en/settings/printing`. Confirmed live — the page renders three tabs
  (Documents / Printers / Receipts).
- **"Template and settings mutations are not audited."** My grep was against the
  *services*; the `@Audited` decorators are on the *controllers*. Audit is present on
  every mutation and verified working in `audit_log`.
- **"Invoice and credit-note print documents violate rule 1 (they call
  `useTranslations`)."** They do call it — for the Print button label and the failure
  toast only. Neither `t` value is passed into `PrintedDocument`; the printed tree takes
  `data` and `suppressPrintStyle` only. Verified by reading both files end to end and by
  the live en/ar byte-identical capture.
- **"Ledger identity gate is broken (7.000000)."** Traced to another agent's deliberate
  `ZZTEST unbalanced probe 2` **draft** journal. Posted-only was `0.000000` throughout,
  and by end of session both gates read `0.000000`.
- **"`formatCurrency(num,'en',...)` on POS receipts hardcodes 2 decimals."** It does not;
  precision comes from the currency, and KWD renders 3dp. The real issue there is the
  `Number()` coercion and the numeral-system split (MED-5), which is narrower.

---

## 7. Founder's standard — could an untrained Kuwaiti shop owner do this?

**Configure the invoice template: YES.** Settings → Printing → Documents. The screen
opens on a working default with a live preview already rendered; nothing is required
before you see output. Copy is plain language throughout and I found **no jargon and no
internal parameter names** in it — measured examples, verbatim from the live page:
- "Company logo — This is the logo itself. Upload or replace it here; the settings below only control how it prints."
- "Accent color — Used for the document title underline and the grand total figure."
- "Logo position — Where the logo sits in the document header." (options: *Start of the page / Centered / End of the page* — logical, not left/right, and readable)
- "Preview language — Shows this document, and its text direction, in your other configured language. This only changes the preview, never your saved settings."
- "Document language — The default language A4 documents print in. This is a default only. It does not stop a document from being produced in the other language when needed."

That last pair is unusually good: it pre-empts the exact fear a bilingual Kuwaiti owner
has ("if I pick English, can I still send an Arabic invoice?") and answers it in the hint
text instead of a help article. The live preview is labelled *"This is the real printed
document, rendered by the same engine that prints it, not an approximation"* — which is
true, and it is the right claim to make.

**Clicks to configure and print: 3 to reach the setting (Settings → Printing → Documents,
which is the default tab), 1 to Save. Zero forced fields.** Everything ships with a
working default. No stacked dialogs, no confirmation on save, no dead ends. Defaults over
questions is genuinely honoured here.

**Print an invoice: 2 clicks** (open invoice → "Print"). Verified live on
`B1ALRAIMAINS-INV-00006`.

**Under 60 seconds, first try: yes — for the OWNER.** This is the best-designed settings
surface I have tested in this programme.

**Caveat that I got wrong at first and must state plainly:** my entire browser session ran
as the owner, and the owner bypasses every permission check
(`permission.service.ts:51,68-69`). So the smooth experience above is an owner-only
observation. Per HIGH-1, an Accountant or Viewer sees this same section in the nav and
gets 403 on every request inside it. The briefing's method rule 2 — assert who you are
logged in as before every conclusion — is exactly what caught this, and only because I
checked the role catalogue in SQL rather than trusting the screen.

**What still stops them, in order:**
0. If they are not the owner, they cannot open the screen at all (HIGH-1).
1. They cannot choose a printer (MED-2). A shop with a counter thermal printer and a
   back-office A4 printer must pick the right one in the OS dialog every single time, and
   nothing in the product remembers.
2. They cannot print item or shelf labels at all (MED-3).
3. If the server PDF is down (MED-4) they get a browser-printed page that may paginate
   differently, and the toast that says so does not explain what changed.

---

## 8. Honest verification gaps

1. **No Arabic-document render captured in a live browser.** The Arabic direction of rule 1
   is proven by the pinned unit matrix (10/10, with next-intl mocked to throw), not by my
   own screenshot. The `Preview language → العربية` toggle in the settings panel is the
   right surface for it; I located it (`@e60` combobox, options "English (your default)" /
   "العربية") and clicked through to Arabic, but the gstack browse daemon was being
   restarted by concurrent agents and the capture came back blank. Shortly after, the Next
   dev server stopped answering `/en/login` within 120s and the browser pass ended. **This
   is the single highest-value thing for the next agent to re-run**, and it is one click
   from the settings screen.
2. **No screenshots survived.** Everything I captured with a *relative* path went to the
   browse daemon's own cwd, and every absolute-path capture landed after the daemon had
   restarted to `about:blank`. The DOM/`textContent` evidence in §2 is verbatim and is the
   real proof, but there is no image deliverable in `study/testing/`. Stale blank files
   `print-05-settings-documents-en.png` and `print-06-…png` should be deleted or overwritten.
3. **MED-4 is unproven against a production build.** I could not rule out that the
   `networkidle0` timeout is purely a Next-dev-server artifact.
4. **HIGH-1's UI failure mode is unverified.** The 403s are proven at the API with an
   `accountant1` token, and the role catalogue is proven in SQL. What I could NOT check is
   how the Documents tab *behaves* on those 403s — clean empty/error state, or a crash /
   infinite spinner — because the web dev server stopped responding before I could log in
   as a non-owner. Worth 2 minutes once the machine is quiet.
5. **Worst-case-country shapes (rule 5) checked in code, not rendered.** The tenant is
   Kuwait (KWD 3dp, no tax), so the Saudi VAT+ZATCA+Arabic and Indian GST (more columns,
   2dp) shapes were verified only by reading `matrix-tier1-precision.test.tsx` and the
   codemap. The codemap itself names the remaining hole: **the India dual-tax
   (CGST+SGST) two-row tax-summary cell is never combined with multi-page pagination
   carry-forward in any test.** That is the 96px-column-floor class of bug, still open.
6. **Not exercised at all:** the public receipt page `/r/[token]`, multi-copy expansion
   (`copies.ts`, "Original / Accounts Copy / Delivery Copy"), letterhead background upload
   and its three modes, per-document-type overrides, branch-level template overrides, the
   40-line / 0-line / huge-logo / very-long-tenant-name / 15-char-Arabic-item-name
   defensive cases, and the 375/768/1280/1920 responsive pass on the settings screen.
7. **`packages/shared` print coverage gate not run** (100/100/100/100 is glob-scoped to
   `src/print/format/**` in `vitest.config.ts`); I ran only the one language-binding file,
   per the no-full-suite rule.

---

## Fixes applied

Phase F remediation agent. Inherited nothing; re-read the briefing, this file and
`erp/docs/CODEMAPS/print.md` before touching anything.

**Ledger identity gate (status-aware form)** — before first change: `0.000000`.
After the API rebuild and restart, and after the last verification: `0.000000`.
I created **no documents** (`_documents-created.md` unchanged) and ran no destructive git.

---

### PRINT-001 — ruling and fix

**Ruling: the Printing & Documents section is NOT readable by Accountant or Viewer.
The frontend gate moves to the key the endpoints already require. No permission is
widened, no role template is changed, no migration is needed.**

Reasoning, in the order I settled it:

1. **What the screen actually is.** It is document *branding and layout configuration*:
   logo, letterhead background, accent colour, page geometry, per-document-type template
   overrides, POS receipt behaviour. It is not a place you read or print a document.
2. **The persona test cuts the other way once you separate the two capabilities.** A
   Kuwaiti shop owner's bookkeeper does need to see and print documents. She already can:
   printing is gated per document type by `document-pdf.controller.ts`'s dynamic
   `assertCanRead`, which asks for the same read permission as that document's own detail
   route. Nothing in this fix touches that path, and I verified the Accountant still prints.
   What she does not need is to restyle the company's invoices.
3. **Read and update do not split usefully here.** `settings.tenant.read` and
   `settings.tenant.update` both live in the single `settings.system` bundle
   (`permission-bundles.ts:690-691`), which is the unit the role editor grants. Splitting
   them in the gate would change nothing today, and the panel has no per-action gate, so a
   read-only holder would meet a Save button that 403s. Recorded, not built.
4. **The capability class is already decided elsewhere in the same file.** The Company
   section (`settings-sections.ts:107`) is gated on `PK.settings.tenantRead`. Printing &
   Documents is the same tenant-identity configuration family and now shares that gate.
   One capability, one key.
5. **Widening was the wrong move and is what caused this.** `role-templates.ts:224,309`
   widened Viewer and Accountant to `settings.numbering.read`, correctly reasoning that
   *numbering* is harmless to read. The frontend then reused that same key to gate a
   different screen. Granting `settings.system` to those roles to make the screen work
   would have handed them API keys, webhooks and security settings read access to fix a
   render bug. Rejected.

**Change:** `apps/web/src/lib/settings-sections.ts` — the `printing` section's
`requiresPermission` moves from `PK.settings.numberingRead` to `PK.settings.tenantRead`,
with the reasoning written in place.

**Live evidence, same identity, before and after.** Logged in as `accountant1` at
`http://gulf-auto-parts.localhost:3000/en/login`; identity asserted from
`/en/settings/profile` (shows `accountant1`, not the owner).

*Before* (gate reverted to `numberingRead` to reproduce):
```
settings nav: approval-pins, currencies, fiscal, account-mappings, pricing,
              numbering, printing, data-import, audit, profile
/en/settings/printing body:
  "Printing & Documents ... Documents Printers Receipts Failed to load print settings."
```
*After*:
```
settings nav: approval-pins, currencies, fiscal, account-mappings, pricing,
              numbering, data-import, audit, profile          <- printing gone
/en/settings/printing (direct nav) -> clean SectionGate denial, not a crash,
  not a "Failed to load" dead end
```
Endpoints are unchanged and still deny, as they always did:
```
GET tenant/settings/document-templates            403
GET tenant/settings/document-templates/effective  403
GET tenant/settings                               403
```
Owner still sees and loads the section (verified as `Hussain Bedawala`, All branches,
full Documents/Printers/Receipts panel with a live preview).

**Two observations left as findings, not fixed (out of this phase's scope):**
- `DEFAULT_SETTINGS_SECTION` is `"company"`, which Accountant/Viewer cannot read, so
  `/settings` lands them on a denied page before they click anything. LOW, pre-existing,
  independent of this fix.
- The SectionGate's denial copy reads "Not available for your current plan or country
  configuration" even when the cause is RBAC. Misleading but shared across every gated
  section; changing it is a settings-wide copy decision, not a print fix. LOW.

---

### PRINT-001 — the guard, and proof it can fail

The two specs that pinned the drift compared each decorator against itself. They now
carry a real cross-check, and a full per-section sweep was added on the web side.

**New: `apps/web/src/lib/__tests__/settings-sections-backend-parity.test.ts`** (49 tests),
modelled on the existing `components/shell/__tests__/route-permissions-backend-parity.test.ts`.
Two independent halves, both reading live source from disk rather than comparing constants
to themselves:

1. **Backend parity.** Every key any settings section is gated on is mapped to the
   controller that serves it, and the test re-reads that controller and asserts the key
   appears inside a `@RequiresPermission(...)` call (multi-key "any of" form handled). A
   gate key with no mapping fails too, so a new section cannot be added ungoverned.
2. **Grantability.** Every gate key must appear in a permission bundle or a role template.
   This is the orphan check the Reports programme's `reports.sales.read` fix taught, and it
   reads `packages/shared/src/permission-bundles.ts` and `role-templates.ts` as **source
   text**. That detail matters: `apps/web` resolves `@zerupt/shared` to `packages/shared/dist`,
   so an assertion against the imported constants would keep passing against a stale build.
   That would have been another guard that could never fail.

Plus a regression pin naming this exact drift: the printing section is gated on
`settings.tenantRead`, shares the Company section's gate, and that key is declared by
both `document-templates.controller.ts` and `tenant-settings.controller.ts`.

**API side.** `document-templates.controller.spec.ts` and `tenant-settings.controller.spec.ts`
each gained a `permission parity with the settings UI` block that reads the live frontend
gate out of `apps/web/src/lib/settings-sections.ts` and the live grant source out of
`packages/shared`, pinned next to the decorators they guard.

**PROOF THE GUARDS FAIL. Three separate breakages, each reverted after.**

*(a) revert the gate to `numberingRead`:*
```
apps/web:  Tests  3 failed | 46 passed (49)
  x is gated on the key its own endpoints require, not on numbering
      expected 'settings.numbering.read' to be 'settings.tenant.read'
  x shares the Company section's gate
  x is gated on a key both of its controllers actually declare
      expected false to be true          <- the structural half, not a literal compare
apps/api:  Tests  1 failed, 6 passed
  x DocumentTemplatesController permission parity with the settings UI
      Expected: "settings.tenantRead"   Received: "settings.numberingRead"
```
*(b) orphan the key by deleting `settings.tenantRead` from the `settings.system` bundle:*
```
x settings.tenant.read is granted by a bundle or a role template
  AssertionError: orphaned gate key (no bundle, no role template): settings.tenant.read
```
*(c) an earlier draft of the grantability check asserted against the imported
`SETTINGS_PERMISSION_BUNDLES`. Breaking the bundle left it GREEN (stale `dist`). That is
how the source-reading version above came to exist: the first version of my own guard
could not fail, and I only found out by trying to break it.*

Restored and green: `apps/web` 49/49, `apps/api` 19/19 across both controller specs.

---

### PRINT-002 — raw UUID on a printed document. FIXED at the primitive.

The audit found `DP-<uuid>` reaching the printed purchase order and its PDF filename.
Investigating the "does the placeholder convention leak anywhere else" question first
changed the shape of the fix: **`DP-` is not the only convention.** `DRAFT-${randomUUID()}`
is minted by sales invoices, credit notes, debit notes, quotations, delivery orders,
consolidated delivery orders, receipt vouchers and direct sales
(9 call sites in `apps/api/src/sales/**`). Every one of those document types is printable,
and eleven hand-built filename templates in the assembler each interpolated a raw `number`
column. So this was a print-engine defect, not a purchase defect.

**Fix (SAL-PRINT-001 shape: make it unrepresentable, not merely absent).**
New primitive `packages/shared/src/print/document-number.ts`:
- `PrintDocumentNumber` is a **branded string**; `toPrintDocumentNumber()` is its only
  constructor. `PrintDocument.documentNumber` is now typed `PrintDocumentNumber`, so
  passing a raw column value is a **compile error**. A placeholder cannot be represented
  in a `PrintDocument` at all.
- `INTERNAL_DOCUMENT_NUMBER_PREFIXES = ["DP-", "DRAFT-"]` in one place. A new convention
  extends that list, never a call site.
- Placeholders and blanks collapse to the shared `EMPTY_VALUE_PLACEHOLDER` (`-`), the same
  affordance every other absent printed field uses.
- `printDocumentFileName(type, number, suffix?)` replaces the eleven template strings,
  degrades to the document type alone when there is no printable number, and sanitises
  characters unsafe in a filename.

The brand immediately caught a **second live leak the audit had not found**: the web
typecheck failed on `apps/web/src/features/pos/print/receipt-to-tax-document.ts:140`,
which passed `receipt.transactionNumber` straight onto the POS tax-invoice overlay. Fixed
in the same pass. Nine mapper sites in `packages/shared/src/print/mappers/**` plus the
sample document and two fixtures now route through the constructor.

**Live evidence.** API rebuilt once and restarted; freshness confirmed by grepping the
compiled service (`dist/documents/tax-document-assembler.service.js` -> 11 occurrences of
`printDocumentFileName`) and the compiled mapper, not `dist/main.js`.

Affected order `006cff34-3ede-4a5e-8c52-951b196a9fe0`, `number = DP-22cf3812-0b72-47b5-a71c-101399ea209a`,
status `received`:
```
GET tenant/documents/purchase-order/006cff34.../pdf
  HTTP/1.1 200 OK
  content-disposition: inline; filename="purchase-order.pdf"     <- was purchase-order-DP-<uuid>.pdf
  rendered page: "Purchase Order No.  -"                          <- was the raw uuid
```
Negative control, a real PO (`B1ALRAIMAINS-PO-00004`):
```
  content-disposition: inline; filename="purchase-order-B1ALRAIMAINS-PO-00004.pdf"
  rendered page: the real number
```
Evidence PDF: `study/testing/print-08-direct-purchase-po-no-uuid.pdf`.
New spec: `packages/shared/src/print/__tests__/document-number.spec.ts`, 14 tests,
including one that asserts the mapper cannot emit the `DP-` uuid and one that asserts no
filename ever matches a uuid pattern.

---

### PRINT-006 — POS receipts bypass the money primitives. FIXED.

`receipt-document.tsx` and `local-receipt-document.tsx` both did
`formatCurrency(Number(value), "en", currency)`. Both now call the print engine's canonical
`formatPrintMoneySymbol({ amount, currency }, printContext)`, the same formatter the A4
documents use.

What this actually changes:
- The `Number()` coercion is gone, so the engine's `exceedsSafePrecision` guard runs. An
  amount carrying more significant digits than IEEE-754 holds now prints the server's own
  string verbatim instead of being silently rewritten on a receipt.
- Locale comes from the document's own language facts (`buildPosPrintFormatContext`,
  already built in both files) instead of a hardcoded `"en"`, which puts the receipt on the
  same `numerals.ts` seam as the invoice. Digits stay 0-9 today because the canonical
  formatters pin `numberingSystem: "latn"`; flipping that seam is now one change for both
  media instead of two.
- **No hardcoded decimal count anywhere.** Precision is derived from the ISO 4217 code:
  KWD 3dp, SAR/AED/INR 2dp. I did not encode 3. Verified against the worst case rather than
  the launch customer: the Indian GST path (2dp, more columns) and the Kuwaiti path (3dp,
  no tax) both go through the same currency-derived precision.
- Blank-string input now returns the empty placeholder instead of `Number("") === 0`.

`npx vitest run receipt` from `apps/web`: **12 files, 156 tests, all pass.**

---

### PRINT-007 — wrapper inherits viewer RTL. FIXED at the pattern level.

New `printedDocumentDirection(doc)` in `apps/web/src/features/print/document/document-model.ts`
derives the base direction from the **document's** language facts via the same
`buildPrintFormatContextFromLanguageFacts` the model uses, returning `"ltr"` when there is
no document yet (still loading or blocked) rather than a viewer-derived guess.

`dir={printedDocumentDirection(data)}` is now set on **all ten** scoped print wrappers, not
just `#invoice-print-root`: invoice, credit note, sales order, quotation, delivery order,
customer receipt, purchase bill, purchase order, GRN, supplier payment. The latent trap
(the one element in the printed stack whose direction was viewer-derived, copied by every
new document root) is closed at the pattern, which is what made it worth fixing.

---

### Verdicts on the do-not-attempt items

**PRINT-003 (no printer selection, no thermal medium) — finding is ACCURATELY STATED.
Unbuilt feature, not a defect. Not attempted.** Confirmed by re-reading:
`dispatch-print.ts` has exactly two outcomes (`pdf-tab` / `browser`), there is no printer
registry table, `PrintersPanel`'s own header says it is informational, and the print codemap
records the ESC/POS + ESC/P stack as deleted with the Phase 13 thermal rebuild "not yet
built". The UI is honest about it. The gap is real for a shop with a counter thermal printer
and a back-office A4 printer, and it is Phase 13 work.

**PRINT-004 (no label / shelf-tag printing) — finding is ACCURATELY STATED. Unbuilt
feature. Not attempted.** The only barcode renderer is `receipt-barcode.tsx`, embedded in
the POS receipt; no label document type exists in `PRINT_DOCUMENT_TYPES`.

**PRINT-005 (server Chromium PDF 503s) — ENVIRONMENT-ONLY. Not a code defect. Not chased.**
Determined from live network evidence rather than inference. Three consecutive
`POST /tenant/documents/preview-pdf` calls in one session:
```
503 (21720ms, 128B)        <- exceeded the 20s navigation timeout under load
201 (13656ms, 39968B)      <- same payload class, succeeded
201 ( 7758ms, 85176B)      <- succeeded
```
and the purchase-order PDF endpoint returned `200` with a fully rendered page during the
PRINT-002 verification. The failure is `page.goto(..., waitUntil: "networkidle0")` racing a
20s timeout against a loaded Next **dev** server, exactly as the audit suspected: it is
latency, not logic, and it succeeds whenever the dev server answers in time. The degradation
path is correct and non-silent (`window.print()` plus an info toast). Worth keeping as a
production observability item (nobody is alerted when the primary path is down), not as a
bug to fix here.

---

### The Arabic print evidence the previous pass could not get

Captured, and it turned out to be stronger than a screenshot. Owner identity asserted first
(`/en/settings/profile` -> `Hussain Bedawala`), then Settings -> Printing ->
**Preview language -> العربية**, under an **English** UI at `/en/...`.

The live preview is a server-rendered PDF in a blob iframe, which headless Chromium paints
blank (no PDF plugin), so the page screenshot alone would have proved nothing. I hooked
`window.fetch`, captured the actual `preview-pdf` response bytes and read the PDF:

- `study/testing/print-07-arabic-document-under-EN-UI.pdf` / `.png` — the printed document,
  fully Arabic and RTL under an English UI: `فاتورة`, `رقم الفاتورة`, `الصنف / الكمية /
  سعر الوحدة / الخصم / إجمالي السطر`, `المجموع الفرعي`, `الإجمالي`. Money renders
  **KWD at 3 decimals** (`100.000`, `2.500`, `122.500`) in Western digits, and the table
  mirrors correctly.
- `study/testing/print-06-arabic-preview-under-EN-UI.png` — the settings screen with
  Preview language set to العربية (page context for the capture).

**This closes Direction B of the document-language rule with live evidence**, where the
previous pass could only cite the pinned vitest matrix. Direction A (English document under
an Arabic UI, byte-identical) was already proven live in section 2.

A control was run rather than trusting one observation (method rule 5): with the preview
language flipped back to English on the same document type, the request payload carried
`primaryLanguage: "en"` and the response was a different render of a different size. An
earlier capture of mine appeared to show Arabic returning an English page; forcing a genuine
cache miss showed the request correctly carries `{"documentLanguageMode":"primary",
"primaryLanguage":"ar","secondaryLanguage":"en"}` and returns the Arabic render. **The
apparent bug was a race in my own capture hook, not in the product.** Recording it so nobody
re-raises it.

---

### Gates

| Gate | Result |
|---|---|
| `pnpm --filter @zerupt/web typecheck` | **pass** |
| `pnpm --filter @zerupt/web i18n:check` | **pass** ("All locales are in sync") |
| `pnpm --filter @zerupt/api typecheck` | **pass** |
| `pnpm --filter @zerupt/shared typecheck` + `build` | **pass** |
| `apps/web` `npx vitest run settings-sections-backend-parity` | 49/49 |
| `apps/web` `npx vitest run receipt` | 12 files, 156 tests |
| `apps/web` `npx vitest run language-binding settings-sections print-document` | 5 files, 93 tests |
| `packages/shared` `npx vitest run document-number` | 14/14 |
| `apps/api` `npx jest tax-document-assembler document-pdf tenant-settings` | 8 suites, 113 tests |
| Ledger identity (status-aware), before and after | `0.000000` |

**Pre-existing failures I did NOT cause and did NOT touch:** `packages/shared`
`print-document-to-tax-document.spec.ts` and `resolve-template.spec.ts` fail on a
`totals.orderDiscountTotal` field added by another session's uncommitted work
(`print-document-to-tax-document.ts` +1 line, `registry/core-fields/totals-fields.ts` +16
lines, neither edited by me). 584 of 586 shared print tests pass.

The API was rebuilt **once** and restarted **once**. `/health` reports `migration_drift
behindCount: 1` from another session's pending migration; I created no migration.
