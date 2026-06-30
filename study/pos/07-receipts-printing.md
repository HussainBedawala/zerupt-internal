# POS Layer 6 Study — Receipts & Printing

**Date:** 2026-06-30  
**Scope:** Arabic RTL bilingual quality, WhatsApp digital receipt, ZATCA QR (KSA), gift/duplicate reachability, VAT display.

---

## 1. Architecture Snapshot

### Print paths (two, not one)

| Path | Renderer | Used when |
|---|---|---|
| **Server-backed** | `ReceiptDocument` (`receipt-document.tsx`) | Synced sale — full shop/branch/tax data from API |
| **Local / offline** | `LocalReceiptDocument` (`local-receipt-document.tsx`) | Just-completed unsynced sale + queue reprints |

**Print-agent** (`ws://127.0.0.1:9723`) handles physical ESC/POS output; the web layer generates ESC/POS bytes (`apps/web/src/features/pos/print/`) and sends them over WebSocket. Browser `window.print()` is the fallback for offline path.

### Digital receipt

`receiptToken` is stored on `pos_transactions`. After sync it is registered in admin DB (`pos_receipt_token.service`). Public URL is `{NEXT_PUBLIC_APP_URL}/r/{token}`. The server-backed receipt renders a QR of this URL in the footer via `PublicReceiptQr` component (receipt-document.tsx:232). The public page lives at `apps/web/src/app/[locale]/(public)/r/[token]/page.tsx` and uses `ZatcaReceiptWrapper` → `ReceiptDocument`.

---

## 2. Arabic RTL Bilingual — Current Quality

### What's working well

- **Template system** (`classic` / `compact` / `bilingual`) — `bilingual` template stacks en+ar item names always, regardless of UI locale. `classic`/`compact` render primary name + optional `nameAlt` below it.
- **`dir="auto"` + `isolateText` (FSI/PDI bidi isolates)** — applied to all user-supplied strings (item names, cashier, customer, extra header lines). Correct approach.
- **Shop header bilingual** — `shopNameAlt` rendered with `getContentDir()` → `dir="rtl"` for Arabic names (receipt-document.tsx:431).
- **Branch `nameAlt`** — rendered with `dir="auto"` (line 437).
- **Tax invoice header** — bilingual band shows `receipt.labels["taxInvoice"]?.ar ?? "فاتورة ضريبية"` when template is `bilingual` (line 421).
- **DUPLICATE band** — already has `dir="rtl"` Arabic label (`{t("receipt.duplicateLabelAr")}`) on line 372.
- **Numerals** — `fmt()` hard-codes locale `"en"` so digits are always 0–9 on the printed receipt (line 313). Correct per spec rule #4.
- **`ReceiptLabels`** in `pos-receipt.service.ts` — full bilingual dictionary for subtotal, tax, total, cashier, customer, etc. (lines 42–54). Server drives display labels bilingually.

### Gaps

| # | Gap | Location |
|---|---|---|
| G1 | **LocalReceiptDocument has no Arabic at all** — offline receipt only renders English labels (hardcoded t() English keys), no bilingual header, no `nameAlt` on lines. `LocalReceiptLine` shape carries no `nameAlt`. | `local-receipt-document.tsx`; `local-receipt-mapping.ts` |
| G2 | **`dir="ltr"` on root `<div>`** — both `ReceiptDocument` (line 358) and `LocalReceiptDocument` (line 68) set `dir="ltr"` at the receipt root. This is correct for LTR thermal layout, but means an RTL locale user sees the receipt document forced LTR. The outer shell direction doesn't match the user's interface. Intentional (spec), but worth noting. |
| G3 | **Bilingual template not surfaced in receipt-settings-panel UI** — the template value (`classic`/`compact`/`bilingual`) is sent from settings but there is no visual call-out or Arabic quality preview in the settings panel. The live preview renders the sample receipt but a cashier configuring bilingual mode has no guidance that `nameAlt` must be populated on items for it to have effect. (Product/UX gap, not code gap.) |
| G4 | **`nameAlt` not in `LocalReceiptData`** — `mapLocalReceipt()` builds `LocalReceiptLine` from the offline queue payload. The payload does store `nameAlt` via `SyncPayloadLine`, but `mapLocalReceipt` does not map it to the local receipt line. Offline bilingual receipts are blank on the Arabic name column. | `apps/web/src/features/pos/lib/local-receipt-mapping.ts` |
| G5 | **Public receipt page has no "Share" UI** — the page at `/r/[token]` renders the receipt + a Print button only. No WhatsApp, no share link, no copy-link affordance. | `apps/web/src/app/[locale]/(public)/r/[token]/page.tsx` |
| G6 | **POS pay-surface receipt step has no WhatsApp button** — after sale completion, `LocalSaleReceipt` shows Print + New Sale only. No digital receipt share action for the cashier. | `local-sale-receipt.tsx` |

---

## 3. WhatsApp Digital Receipt

### Current state

Zero WhatsApp code exists anywhere in the POS flow. The `apps/website/src/components/layout/whatsapp-fab.tsx` is a marketing widget — unrelated.

### Design (MVP)

**The public digital receipt URL is the asset.** It is already tokenized and unauthenticated. The MVP WhatsApp path is a `wa.me` deep link:

```
https://wa.me/<phone>?text=<encoded message with URL>
```

No WhatsApp Business API key needed. Works on any device. Opens WhatsApp with pre-filled message.

**Where the phone number comes from:**
- Customer's `phone` field from `salesCustomers` table. Already resolved in `PosReceiptService.resolveCustomer()` and available in `ReceiptResponse.customer.phone` (dto line 73). The phone is **stripped** by `PublicReceiptsService.toPublicCustomer()` (intentionally — public URL must not expose contact details). So the phone is available **server-side / in the app receipt view** but not in the public receipt page.

**Where the action should live (two surfaces):**

1. **Pay-surface receipt step** (`local-sale-receipt.tsx`) — cashier can copy the receipt URL to paste or open WhatsApp. But here we only have `LocalReceiptData` from IndexedDB (no customer phone). So the button must open the public URL only (no pre-fill).
2. **Online receipt view** (wherever `ReceiptDocument` is rendered after sync for a customer-tagged sale) — customer's phone is available from the API receipt response. A "Send WhatsApp" button with pre-filled URL is possible.
3. **Public receipt page** (`/r/[token]`) — add a "Share" action bar: copy link + WhatsApp share (navigator.share / wa.me). No phone needed — just the current page URL.

**WhatsApp Business API (richer option — deferred):** Requires Meta Business API onboarding, approved message template, outbound webhook. Far too heavy for MVP. Not needed when the URL is already embeddable.

---

## 4. ZATCA QR (KSA)

### What already exists — extremely mature

The ZATCA layer is almost completely implemented:

| Component | File | Status |
|---|---|---|
| **TLV encoder/decoder** | `packages/shared/src/zatca/qr-tlv.ts` | Complete — Phase 1 (tags 1–5) + Phase 2 (tags 6–9) |
| **KSA validator** | `packages/shared/src/zatca/ksa-validation.ts` | Complete — VAT number, postal code, building number, `isKsaTenant(countryCode)` |
| **QR helper** | `apps/web/src/features/zatca/qr.ts` | Complete — server TLV priority, Phase 1 client-side fallback |
| **QR image component** | `apps/web/src/features/zatca/components/zatca-qr-image.tsx` | Exists |
| **Receipt wrapper** | `apps/web/src/features/zatca/components/zatca-receipt-wrapper.tsx` | Complete — `isKsaTenant` gate, passes `qrDataUrl` to `ReceiptDocument` |
| **`qrDataUrl` slot** | `receipt-document.tsx:63` + `QrSlot` (line 203) | Extension point wired and labelled "Layer 7" — already rendering |
| **Public receipt page** | `/r/[token]/page.tsx` | Already uses `ZatcaReceiptWrapper` |
| **Receipt type** | `types.ts:476` | `zatca?: ZatcaReceiptFields` with `serverQrBase64` |
| **DB schema** | `packages/db/src/schema/zatca.ts` | Exists |

### What's missing for POS thermal receipt

The `ZatcaReceiptWrapper` wraps `ReceiptDocument` **only on the public receipt page** (`/r/[token]`). The thermal receipt rendered by the POS cashier after a sale (pay-surface → receipt step) uses `LocalReceiptDocument`, which has **no ZATCA QR at all**.

Furthermore, the online receipt view (when the synced receipt is loaded in the POS — if such a screen exists) would need to use `ZatcaReceiptWrapper` or pass `qrDataUrl` directly.

**Feature flag:** `isKsaTenant({ countryCode: receipt.branch.countryCode })` — already used in the wrapper. Non-KSA tenants get no QR. This is the correct gate.

### Gap for POS thermal print

The thermal ESC/POS path (`apps/web/src/features/pos/print/escp-invoice.ts`) presumably prints from the server-backed `Receipt`. Confirm it passes the `zatca.serverQrBase64` field through. Grep shows phone being used in `escp-invoice.ts:210`, so the receipt data is available — but there is no QR rendering in the ESC/POS output for thermal print. For physical thermal print the QR must be converted to ESC/POS bitmap or printed as text (Base64 is not enough — needs raster or `GS ( k` command).

---

## 5. Gift Receipt & Duplicate Receipt

### `isGift` (gift receipt)

- **Component:** `ReceiptDocument` accepts `isGift?: boolean` (line 56). When true: hides unit prices, line totals, totals block, payment block. Shows `{t("receipt.giftReceiptLabel")}` badge (line 398).
- **Reachable from POS UI?** — **No.** Searching all non-test POS TSX files, `isGift` is only defined in `receipt-document.tsx`. It is **never passed as `true`** from any POS surface (action-bar, register-shell, pay-surface, queue-drawer). The gift receipt prop exists but is unreachable from the cashier.
- **`LocalReceiptDocument`** — no `isGift` prop at all.

### `isDuplicate` (duplicate / reprint)

- **Component:** `ReceiptDocument` accepts `isDuplicate?: boolean` (line 51). Renders a prominent `DUPLICATE` / `نسخة مكررة` band.
- **`LocalReceiptDocument`** also accepts `isDuplicate` and renders the same band.
- **Reachable?** — **Yes, partially.** `QueueReprintDialog` (queue-reprint-dialog.tsx:88) passes `isDuplicate={true}` to `LocalReceiptDocument`. This covers the queue reprint path for offline sales. However, the online receipt view (for synced sales) does not appear to use `isDuplicate` — the `ReceiptDocument` is rendered via `ZatcaReceiptWrapper` on the public page without `isDuplicate`.

---

## 6. VAT-Inclusive Display + VAT Line

**Present and correct:**

- `showTaxBreakdown` setting gates the tax breakdown block (receipt-document.tsx:553).
- Each `ReceiptTaxLine` shows `name` (e.g. "VAT 15%") + `taxAmount` + resolves `ratePercent` from the tax group component (pos-receipt.service.ts:291–328).
- `taxTotal` shown in totals block.
- `subtotal` (pre-tax) + discounts + tax lines + `grandTotal` — full GCC-compliant VAT breakdown.
- Tax registration number displayed in the header (lines 444–448).
- **GCC requirement met.**

---

## A. Study Document Complete

---

## B. Ordered Build List

### Priority legend: P0 = blocking for KSA/compliance, P1 = high value, P2 = nice

---

### BACKEND

| # | Priority | Change | Migration? | File |
|---|---|---|---|---|
| B1 | P1 | Add `phone` to `ReceiptCustomer` on the **internal** `ReceiptResponse` (it is already in dto line 73) but ensure `pos-receipt.service.ts resolveCustomer` returns it. **Already done.** Confirm it is in the response the POS app-shell fetches (not the public receipt which strips it). | No | `apps/api/src/pos/transactions/pos-receipt.service.ts:354` |
| B2 | P0 | Ensure `receipt.zatca.serverQrBase64` is populated on `posTransactions` for KSA POS sales. This requires the ZATCA signing pipeline to run at sale completion. Confirm `zatca` block is joined and returned by `PosReceiptService.build()`. Currently `build()` does NOT join the `zatca` table — it is missing from the query. The `Receipt.zatca` field in types.ts is defined but never populated by `pos-receipt.service.ts`. **Add the join.** | No | `apps/api/src/pos/transactions/pos-receipt.service.ts` — `build()` method, add `zatca` table join in `Promise.all` alongside lines/payments/org |

---

### FRONTEND

| # | Priority | Change | Migration? | File |
|---|---|---|---|---|
| F1 | P0 | **Wire `ZatcaReceiptWrapper` in the POS app-shell online receipt view** — wherever the synced receipt (`Receipt` type) is displayed to the cashier after sync, replace bare `ReceiptDocument` with `ZatcaReceiptWrapper`. Confirm the register action-bar "Reprint" path also uses it. | No | `apps/web/src/features/pos/components/` — action-bar or wherever reprint opens for synced sales |
| F2 | P1 | **Gift receipt button in POS UI** — add a "Gift Receipt" button on the pay-surface receipt step (next to "Print"). When clicked, open a print dialog with `<ReceiptDocument ... isGift={true} />`. Requires that the synced receipt is available (online path). For offline path: gift receipt is out of scope (LocalReceiptDocument has no `isGift`). | No | `apps/web/src/features/pos/components/local-sale-receipt.tsx` (or a new `GiftReceiptDialog`) |
| F3 | P1 | **WhatsApp share button on public receipt page** — add to the action bar on `/r/[token]/page.tsx`. Deep link: `https://wa.me/?text=${encodeURIComponent(window.location.href)}`. Also add `navigator.share()` with fallback. No phone pre-fill needed (page is already the receipt). Add `MessageCircle` icon button labeled "Share". | No | `apps/web/src/app/[locale]/(public)/r/[token]/page.tsx` |
| F4 | P1 | **WhatsApp send on pay-surface receipt step (cashier-facing)** — after sale syncs and `receiptToken` is known, render a "Send WhatsApp" button that opens `https://wa.me/?text=${encodeURIComponent(publicReceiptUrl)}`. Cashier can hand device to customer. Only show when `receiptToken` is available (post-sync). | No | `apps/web/src/features/pos/components/local-sale-receipt.tsx` — add after the Print button in the button row (line 104) |
| F5 | P2 | **Arabic nameAlt on LocalReceiptDocument** — `LocalReceiptData.lines` should carry `nameAlt`. Update `LocalReceiptLine` type and `mapLocalReceipt()` to map `nameAlt` from the offline queue payload. Then render it in `LocalReceiptDocument` as a secondary line (like `ReceiptDocument` classic template). | No | `apps/web/src/features/pos/lib/local-receipt-mapping.ts` (add `nameAlt` to `LocalReceiptLine`) + `local-receipt-document.tsx` (render secondary) |
| F6 | P2 | **i18n: add WhatsApp share keys** — add `pos.receipt.shareWhatsApp`, `pos.publicReceipt.share`, `pos.publicReceipt.shareCaption` to `messages/en/pos.json` and `messages/ar/pos.json`. | No | `apps/web/messages/en/pos.json`, `messages/ar/pos.json` |

---

### PRINT-AGENT / ESC/POS

| # | Priority | Change | Migration? | File |
|---|---|---|---|---|
| PA1 | P0 | **ZATCA QR on thermal receipt (ESC/POS)** — add ZATCA QR bitmap printing to `apps/web/src/features/pos/print/escp-invoice.ts`. Gate on `isKsaTenant(receipt.branch.countryCode)`. Use `buildZatcaTlv()` from `@zerupt/shared` to get the Base64 TLV (or use `receipt.zatca.serverQrBase64` if present). Convert TLV to a raster QR using `qrcode` npm package (already used for `generateQrDataUrl`). Send as ESC/POS `GS ( k` / stored graphics command or print as JPEG. This is the only print-agent item needed for ZATCA. Non-KSA: no change. | No | `apps/web/src/features/pos/print/escp-invoice.ts` |
| PA2 | P1 | **Duplicate band in ESC/POS thermal reprint** — when reprinting via the print-agent path (not browser print), the ESC/POS output should include the DUPLICATE / نسخة مكررة band. Confirm `escp-invoice.ts` accepts and renders an `isDuplicate` flag. | No | `apps/web/src/features/pos/print/escp-invoice.ts` |

---

### SUMMARY: REUSE vs BUILD for ZATCA

| Item | Reuse | Build |
|---|---|---|
| TLV encoder | `packages/shared/src/zatca/qr-tlv.ts` — full Phase 1+2 | Nothing |
| KSA country gate | `isKsaTenant()` from `@zerupt/shared` | Nothing |
| QR helper | `features/zatca/qr.ts` — server/client priority | Nothing |
| QR image component | `features/zatca/components/zatca-receipt-wrapper.tsx` | Wire into POS synced-receipt view (F1) |
| `qrDataUrl` slot | `ReceiptDocument.qrDataUrl` prop — already wired | Nothing |
| ESC/POS QR raster | Nothing exists | PA1: add raster QR to escp-invoice.ts |
| Backend `zatca` join | Missing from `pos-receipt.service.ts build()` | B2: add join |

**Feature flag:** `isKsaTenant({ countryCode: receipt.branch.countryCode })` — use everywhere. No new flag infrastructure needed.
