# Sales Layer 3 — Invoice / Billing + Output VAT + AR Posting + Invoice Void

> Study date: 2026-06-30  
> Mirror of: study/purchase/layer-3 (purchase invoice + input VAT + AP post + bill void)

---

## 1. Spec vs Code Matrix

| Area | Spec | Code | Status |
|------|------|------|--------|
| Invoice create (draft) | `04-sales-invoice.md` | `sales-invoices.service.ts:183` | EXISTS |
| Add/update/remove line | `04-sales-invoice.md` | `service.ts:227,413,506` | EXISTS |
| Fiscal period gate | `04-sales-invoice.md` | `service.ts:564–592` | EXISTS (hard+soft lock) |
| Doc numbering (INV-NNNN) | `04-sales-invoice.md` | `service.ts:595` | EXISTS (gapless, reserve-then-commit) |
| Per-line tax (TaxCalcService) | tax-model | `sales-invoices-totals.ts:88` | EXISTS |
| Output VAT (direction="sale") | tax-model/output-VAT | `sales-invoices-totals.ts:94` | EXISTS |
| RC blocked on sales | `07-cross-module-contracts.md` | `tax-calc.service.ts:107–121` | EXISTS |
| Stock pre-check + WAC costAtSale | Layer 2 (deferred) | `service.ts:628–693` | EXISTS |
| Serial claim atomically at confirm | Layer 2 | `service.ts:684,1396–1441` | EXISTS |
| AR JE (DR 1131 / CR 4xxx / CR 2xxx) | accounting | `sales.listener.ts:239–273` | EXISTS |
| Credit limit gate + SoD override | Layer 0 | `service.ts:1030–1093` | EXISTS |
| SO reservation fulfill at confirm | Layer 2 | `service.ts:756–762` | EXISTS |
| **Invoice void / reversal** | Layer 3 | **MISSING** — no endpoint or service method | **GAP** |
| priceOverrideById persist | DTO comment | DTO accepted, NOT passed to service | **GAP** |
| Multi-currency invoices | Layer 3 | Hard-blocked (exchangeRate must = 1) | BY DESIGN |
| Deferred revenue | out of scope | Not implemented | BY DESIGN |

---

## 2. Output VAT JE — Balance Proof

On `sales.invoice.confirmed` the `SalesAccountingListener` (sales.listener.ts:239) builds:

```
DR  1131  Trade Receivables   = revenue + totalTax        [party-tagged: customerId]
CR  4xxx  Sales Revenue       = revenue  (= subtotal - discountTotal)
CR  2131  Output VAT Payable  = Σ taxLines[i].amount      (one line per tax component)
```

Where:
- `revenue` = `netRevenue(invoice)` = `subtotal - discountTotal` (sales-invoices-events.ts:60)
- `totalTax` = `sumTax(taxLines)` (sales.listener.ts:192)
- `receivable` = `revenue + totalTax` (sales.listener.ts:237)
- `DR = CR` because `revenue + totalTax = revenue + totalTax` ✓ balanced

### Tax direction guard
`tax-calc.service.ts:107–121` — `direction="sale"` rejects any `reverse_charge` category code
with a `BadRequestException`. Domestic standard VAT, zero-rated (rate=0, emits zero tax line
which `buildTaxLines` drops per `sales-invoices-events.ts:51`), and exempt are all handled
correctly. Zero/exempt items produce no output_tax CR line — AR = revenue only, still balanced.

### Rounding
`MONEY_SCALE = 6` (sales-invoices-totals.ts:18) throughout. `Decimal.ROUND_HALF_EVEN` for
serial costs (service.ts:1434). Per-line tax is resolved by `TaxCalcService.calculate()`;
header `taxTotal = Σ line taxes`. No separate rounding adjustment line; sub-penny errors
accumulate in `taxTotal` not corrected at header level.

---

## 3. Price / Discount

| Feature | File:Line | Notes |
|---------|-----------|-------|
| Unit price = `item.sellingPrice` (default) | `service.ts:244` | |
| `priceOverride=true + unitPrice` accepted | `service.ts:244,487` | Persisted into line |
| `priceOverrideById` field | `dto.ts:68,119` | Accepted in DTO, silently IGNORED by service — never passed to any lookup; price does NOT change |
| Line discount = explicit or promo auto-apply | `service.ts:349–372` | Pack discount additive |
| `discountAmount > gross` → 422 | `sales-invoices-totals.ts:74–79` | |
| Revenue = subtotal - discountTotal (net of discount) | `events.ts:60` | Correct: discount not expensed separately |
| Header-level discount field | schema has `discountTotal` | Derived from line discounts only; no separate header discount input |

---

## 4. Invoice Void / Reversal — DOES NOT EXIST

**The sales invoice module has no void endpoint, no void service method, and no void event.**

Evidence:
- `sales-invoices.controller.ts` — endpoints: `POST /`, `GET /`, `GET /:id`, `POST /:id/lines`,
  `PATCH /:id/lines/:lineId`, `DELETE /:id/lines/:lineId`, `GET /:id/credit-limit-check`,
  `POST /:id/confirm`, `DELETE /:id` (draft-delete only, 409 on confirmed).
- `service.ts:1292–1311` — `remove()` throws 409 if status !== 'draft'.
- No `void()`, `reverse()`, or `cancel()` method in the service.
- No `sales.invoice.voided` event in `accounting-events.constants.ts`.
- Frontend: `apps/web/src/app/[locale]/(app)/sales/invoices/[id]/page.tsx` — no void action found.

**Current correction path:** Credit Note only (Layer 2, spec `05-credit-notes.md`).

A credit note is NOT an invoice void. It:
- Creates a new document (CN-NNNN)
- Reverses revenue + VAT via `sales.creditNote.confirmed` (sales.listener.ts:281)
- Reverses stock+COGS via `inventory.sale_return` (separate inventory path)
- Does NOT reverse the original invoice's AR/JE atomically — it creates an offsetting entry

What a true void REQUIRES (per purchase gold pattern):
- Read-only immutable contra JE reversing EXACTLY: DR revenue, DR output VAT, CR AR (party),
  DR inventory (stock return), CR COGS — net-zero to the original
- Idempotent (once-voided guard)
- Period validated (cannot void into a closed period)
- Blocked once paid (paidAmount > 0 or balance < total → 409)
- Blocked once credit-noted (creditedQty > 0 on any line → 409)
- PIN + SoD (requires distinct `sales.invoice.void` permission above confirm)
- Stock + COGS reversal atomically with the financial reversal
- `status = "voided"` on the invoice row

---

## 5. Revenue Recognition Timing

Revenue is recognized at `confirm()` (point-of-sale). `confirmedAt` is either:
- `input.occurredAt` (orchestrator-supplied, e.g. POS recording a past sale)
- `new Date()` (HTTP standalone confirm)

No deferred-revenue mechanism exists. For retail ERP with immediate-delivery goods, point-of-sale
recognition is correct per IFRS 15 (performance obligation satisfied on delivery). Subscriptions
or bill-in-advance scenarios are out of scope for MVP.

---

## 6. Period Validation

`fiscalPeriod.validatePeriod(tenantId, legalEntityId, confirmedAt)` at service.ts:564.
- `HardLocked` → 422 unconditional block
- `SoftLocked` → 422 unless `softLockOverrideReason` + user has `PERMISSION_KEYS` override + `assertSoftLockOverrideAllowed` passes
- `Open` → proceed

Same gate runs in both `confirm()` (service.ts:564) and `confirmComposed()` (service.ts:845). ✓

---

## 7. Multi-Currency

Hard-blocked at create. service.ts:205–213 — if `exchangeRate !== 1`, throws 422:
> "A functional-currency (${ctx.currency}) invoice must have exchangeRate 1"

The `totalFn` / `balanceFn` GENERATED columns still exist (schema line 288–295) as
`total * COALESCE(exchange_rate, 1)` but the rate is always 1 today. True FX invoices
(foreign currency customers) are explicitly deferred (comment: "Layer 4").

---

## 8. Duplicate Invoice Guard

No application-level dup guard. The only unique constraint is on `number` (schema line 366):
`unique("sales_invoices_tenant_id_number_key").on(tenantId, number)`. Since draft invoices use
`DRAFT-<uuid>` as the number placeholder, multiple drafts for the same customer on the same day
are freely allowed. No ref/PO number uniqueness check (unlike purchase dup-bill normalized check).

---

## 9. Frontend Summary

- `apps/web/src/app/[locale]/(app)/sales/invoices/page.tsx` — list with status/search filters
- `apps/web/src/app/[locale]/(app)/sales/invoices/new/page.tsx` — create draft + add lines
- `apps/web/src/app/[locale]/(app)/sales/invoices/[id]/page.tsx` — detail: confirm, line edits, related receipts/CNs
- No void button/modal exists anywhere in the frontend.
- Tax display: per-line `taxAmount` returned in `InvoiceLineResponse`; header `taxTotal`.
- Discount entry: `discountAmount` per line; `priceOverride` flag + `unitPrice`.
- VAT line details not broken out per tax code in the UI (only aggregate `taxTotal` shown).

---

## Layer 3 GAP CANDIDATES

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| G1 | **Invoice void / reversal does not exist** | CRITICAL | No endpoint, no event, no contra JE, no stock reversal. Only workaround is credit note (different semantics — not a true void). Confirmed-and-unpaid invoices cannot be cancelled. | 
| G2 | **`priceOverrideById` silently ignored** | MEDIUM | DTO accepts it, service never uses it. Price does not change. No error surfaced to caller. Should either implement price-list lookup or reject the field. |
| G3 | **No per-tax-code VAT breakdown in UI** | LOW | `taxTotal` is aggregate. Tax filing needs per-code breakdown. API returns it in events but detail page does not surface it. |
| G4 | **No header-level invoice discount input** | LOW | Only line discounts. Spec may allow header discount; currently not supported. |
| G5 | **Rounding: no correction line at header** | LOW | Sub-penny accumulated rounding in taxTotal. No "tax rounding adjustment" line posted. May cause VAT return reconciliation issues at scale. |
| G6 | **Dup invoice guard absent** | LOW | Two drafts for same customer + same day freely allowed. No application-level check on external reference / PO number (unlike purchase bill guard). |
| G7 | **Multi-currency hard-blocked (by design, but undocumented for user)** | INFO | Non-1 exchange rate returns 422 with internal message. No user-friendly "foreign currency invoicing not yet supported" message. |
