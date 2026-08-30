# Phase D (Purchase) — Final independent verification

Verifier: independent agent, wrote none of the code under test.
Date: 2026-08-27/28. Tenant: Gulf Auto Parts (Kuwait, KWD 3dp, no VAT, en+ar).
Web :3000 (hot reload), API :3001 (compiled, restarted with all backend fixes).

**Ledger integrity** — `select round(sum(debit-credit),6) from journal_entry_lines`
- BEFORE first write: `0.000000`
- AFTER last write: `0.000000`
- No unbalanced journal entry exists (`unbalanced_je=0`).

Documents created this session are logged in `_documents-created.md`
(direct purchase b0ac0164, PO-00003, GRN-00006, PINV-00006). Nothing pre-existing
was touched; the 4 opening-balance journals were not modified.

Known-and-excluded items (cost-pool gap on GAP-ELEBAT-00003, the ~0.000330 sub-fils
residual, the inventory-domain.listener spec failures, deferred multi-currency FX)
were not re-filed.

---

## Claim 1 — Permission gating on four newly-wired routes — **VERIFIED**

Tested with two denied personas and a positive control. Identity re-asserted before
every conclusion by decoding the session JWT (`email` claim) rather than trusting the UI.

### storekeeper1 (Viewer role — lacks order.create, supplier.create, supplier.update, payment.create, landedcost.create)
Identity proven: JWT `email = storekeeper1@gulf-auto-parts-mt5kya1i.zerupt.local`,
`sub = 1a997a70-3192-4cab-93d7-02e303acabc9`.
Role permissions confirmed in DB (`role_permissions` for Viewer contains only
`purchase.*.list/read`, no `create`/`update`).

| Route | Rendered | Form present? |
|---|---|---|
| `/purchase/orders/new` | "You cannot create purchase orders / You do not have permission to create purchase orders. Ask your administrator." | NO form. Only Cancel + "Back to orders". |
| `/purchase/suppliers/new` | "You cannot create suppliers / …Ask your administrator." | NO form. |
| `/purchase/suppliers/:id/edit` | "You cannot edit suppliers / …Ask your administrator." | NO form. |
| `/purchase/payments/new` | "You cannot record payments / …Ask your administrator." | NO form. |
| `/purchase/landed-costs/new` | "You cannot create landed costs / You do not have permission to record landed costs. Ask your administrator." | NO form. |

Server-side, as the same user (curl with that user's bearer token):

```
POST  /tenant/purchase/orders                 -> 403 {"message":"Access denied"}
POST  /tenant/suppliers                       -> 403
PATCH /tenant/suppliers/9151cc3f-…            -> 403
POST  /tenant/purchase/payments               -> 403
POST  /tenant/purchase/landed-costs           -> 403
```

Nothing was created or mutated: `select count(*) from suppliers where name ilike '%denied%' or name ilike '%hacked%'` = 0;
the probed supplier still reads `ZZTEST Auto Parts Supplier` with `updated_at` unchanged
(2026-08-27 16:36:37+00, i.e. before this session); `purchase_orders`=4, `supplier_payments`=4,
`landed_costs`=1 — all pre-existing counts.

**Next action works, no dead end.** Each banner's action was clicked and navigated:
`landed-costs/new` -> `/purchase/landed-costs`; `orders/new` -> `/purchase/orders`;
`suppliers/new` and `suppliers/:id/edit` -> `/purchase/suppliers`;
`payments/new` -> `/purchase/payments`. All five reached their list.

### accountant1 (has payment.create + landedcost.create; lacks order.create + supplier master data)
Identity proven: JWT `email = accountant1@gulf-auto-parts-mt5kya1i.zerupt.local`.

- `/purchase/orders/new` — denial banner (correct).
- `/purchase/suppliers/new` — denial banner (correct).
- `/purchase/suppliers/:id/edit` — denial banner (correct).
- `/purchase/payments/new` — **NO denial**, full form rendered (6 enabled inputs) — correct positive control.
- `/purchase/landed-costs/new` — **NO denial**, full form rendered (6 enabled inputs) — correct positive control.

Server, as accountant1: `POST /purchase/orders` 403, `POST /suppliers` 403,
`PATCH /suppliers/:id` 403.

This is the class of fix that failed four times before in this programme. It did not fail here:
the gate is real on the client, the server still refuses, nothing is created, and the banner is
not a dead end. The shared component (`features/purchase/components/shared/permission-denied-alert.tsx`)
is genuinely wired into all five call sites (`order-create-panel`, `supplier-form-panel` — which
serves both create and edit, `payment-create-panel`, `landed-cost-create-panel`, plus `bill-create-panel`
and `grn-create-panel`).

---

## Claim 2 — Tax UI on a no-VAT tenant — **VERIFIED**

The tenant has exactly one tax group, `No Tax`, and **zero rows in `tax_rates`** — the exact
shape that used to make the old `hasTaxGroups = tax_groups.length > 0` predicate always true.

**Direct purchase CREATE with a line actually added** (the specific regression): item
`ZZTEST-SKU-0001` added to `/en/purchase/direct/new`. The totals block reads
`Subtotal / Discount / Total` only. Programmatic scrape of the rendered page:
`{"tax":[],"beforeTax":false,"vat":false}` — no "+KWD 0.000 tax", no tax column, no note.
Screenshot: `scratchpad/shots/dp-new-en.png`.

Sweep of every named surface (page text scraped for `tax|Tax|VAT|ضريبة`):

| Surface | en | ar |
|---|---|---|
| Order create (`/purchase/orders/new`) | no tax UI (gated by `anyTaxGroupHasTaxableRate`, false here) | same |
| Order detail | `tax:[]`, `Subtotal` | `tax:[]`, `المجموع الفرعي` |
| GRN create (`/purchase/grns/new`) | "Goods value / Total" only, no tax | — |
| GRN detail | `tax:[]`, `Subtotal` | `tax:[]`, `المجموع الفرعي` |
| Bill create (draft panel) | `Subtotal / Total / Paid / Balance`, no tax | — |
| Bill detail | `tax:[]`, `Subtotal` | `tax:[]`, `المجموع الفرعي` |
| Direct purchase create | `tax:[]` (with a line added) | — |
| Direct purchase detail | `tax:[]`, `Subtotal` | `tax:[]` |
| Return detail | `tax:[]` | `tax:[]` |

The fix is structurally sound, not per-screen patching: one module
`features/purchase/lib/tax-visibility.ts` exposes `showsPurchaseTax` (server-resolved
`taxMode`, falling back to the document's own posted tax total) and
`anyTaxGroupHasTaxableRate` (order-create only, because orders carry no `taxMode`).
Every purchase surface calls it — order create/detail, GRN detail, bill create + summary,
direct create (`use-direct-purchase-totals`) + detail, return detail. No second copy exists.

`messages/*/purchases.json` still defines `totals.beforeTax` and `totals.taxNote`, but both are
reachable only behind `hasTaxGroups`, which is false for this tenant. Correct: those strings must
survive for Saudi/India tenants.

---

## Claim 3 — Arabic "Subtotal" wording — **VERIFIED**

Verified in the running RTL UI, not only in the JSON.

- ar PO detail (`/ar/purchase/orders/893bf149-…`, reached via the in-app `ع` switcher,
  `document.documentElement.dir === "rtl"`): `sub: ["المجموع الفرعي"]`, `tax: []`.
- ar GRN detail (`/ar/purchase/grns/…`, `dir=rtl`): `sub: ["المجموع الفرعي"]`, `tax: []`.
- ar bill detail: `sub: ["المجموع الفرعي"]`.

Grep of `messages/ar/purchases.json` confirms the string `"المجموع قبل الضريبة"` does not exist
anywhere in the file. The only surviving `قبل الضريبة` string in ar/purchases.json is
`totals.beforeTax = "الإجمالي (قبل الضريبة)"`, which is gated off for this tenant (see Claim 2).

Negative control repeated (briefing rule 5): a direct `/ar/...` deep link with the NEXT_LOCALE
cookie set to `en` rendered ar/RTL correctly; a `/en/...` deep link with the cookie set to `ar`
rendered en/LTR correctly. No locale-resolution bug.

---

## Claim 4 — Unit-cost rounding notice on bill create — **VERIFIED**

On bill `e5ff947b-…` (created from GRN-00006 through the real "Create bill" button),
the GRN-linked line's Unit cost was typed as `0.999889` and blurred.

- Input normalised to `1.000`.
- A visible notice rendered next to the field: **"Rounded to KWD 1.000"** (`role="status"`).
- `PATCH /purchase/invoices/e5ff947b-…/lines/90e06ad4-…` -> **200**.
- DB: `purchase_invoice_lines.unit_price = 1.000000`, `line_total = 2.000000`.
- Bill header recomputed to `2.000000`; on confirm the GL posted
  `Dr 2121 GRN Accrual 2.500 / Cr 2111 Trade Payables 2.000 / Cr 5210 PPV 0.500`.

**The stored value matches exactly what the notice says.** The 6dp entry no longer vanishes
silently. Implementation is `MoneyInput`'s `onRounded` callback wired into
`bill-lines-table.tsx` (`priceRoundedTo` state, cleared on the next keystroke) — the shared
primitive, not a hand-rolled copy.

One caveat found while doing this — see finding **F2** below: on the *first* attempt the PATCH
returned 503 (tenant-resolution timeout, an infrastructure event), the field silently reverted
to `1.250` with **no error shown**, while the "Rounded to KWD 1.000" notice stayed on screen
next to the reverted value.

---

## Claim 5 — Suspected duplicate-document trap — **RESOLVED: NON-FINDING**

A user **cannot** create a duplicate this way. Proven twice, on both write paths, including a
genuinely slow write.

**Direct purchase (API-level, deterministic).**
`POST /purchase/direct-purchases` with `idempotencyKey = 203dc898-…`:
- 1st call: **201** in **86.4 s** (this reproduces the reported slow write exactly).
- 2nd call, byte-identical payload and the same key: **200**, body
  `"replayed": true`, and the **same** `directPurchaseId`, `billId`, `grnNumber`, `paymentId`.
- DB: `select count(*) from direct_purchases where idempotency_key='203dc898-…'` = **1**.

**GRN receive (in the real browser, the reported scenario).**
On `/purchase/grns/new?purchaseOrderId=893bf149-…` I pressed **Save receipt**, waited until the
`POST /purchase/grns/receive` was confirmed in flight (`pending`), then pressed **Save receipt a
second time** while it was still pending. Two concurrent POSTs were observed in the network log.
Result: the second returned **200** in 9.8 s (a replay) and the DB holds exactly **one** row —
`grns` for PO-00003 = `fdadce97-…` / `B1ALRAIMAINS-GRN-00006`, single `idempotency_key`
`19b90dc3-…`. One journal entry (JRN-00045), ledger still `0.000000`.

Why it is safe by construction:
- Both endpoints require a client `idempotencyKey` (uuid) in the DTO.
- Both frontends mint the key **once per form instance** and hold it stable
  (`direct-purchase-panel.tsx` line 111 `useState(() => crypto.randomUUID())`, refreshed only in
  `handleNewEntry()`; `grn-create-panel.tsx` line 172 `const [idempotencyKey] = useState(...)`).
  A second Save from the same form therefore replays rather than creating.
- The database enforces it independently:
  `CREATE UNIQUE INDEX direct_purchases_tenant_idempotency_key ON direct_purchases (tenant_id, idempotency_key)`
  and `grns_tenant_idempotency_key ON grns (tenant_id, idempotency_key)`.
  The services also catch the unique violation and re-read the prior row.

The 45–86 s writes are latency, not a correctness defect. This machine measures ~700–900 ms RTT
to Neon and a warm `GET /tenant/me/branches` took 7.9 s via plain curl in the same window, so the
API itself is the slow layer here, not the browser. **Close this as a non-finding.**

The one real (small) issue it exposed is finding **F3** below: the Save buttons are not disabled
while the create mutation is pending, so a user *can* fire duplicate requests — harmless only
because idempotency catches them.

---

## Claim 6 — Regression sweep, both paths — **VERIFIED**

**Direct path** — direct purchase `b0ac0164-…`, ZZTEST-SKU-0001 qty 2 @ KWD 1.250 = 2.500, paid now cash:

```
JRN-00042  Dr 1141 Merchandise Inventory   2.500 / Cr 2121 GRN Accrual        2.500
JRN-00043  Dr 2121 GRN Accrual             2.500 / Cr 2111 Trade Payables     2.500
JRN-00044  Dr 2111 Trade Payables          2.500 / Cr 1112 Cash Register      2.500
```

**Order path** — PO-00003 (2 @ 1.250) -> GRN-00006 -> PINV-00006:

```
JRN-00045  Dr 1141 Merchandise Inventory   2.500 / Cr 2121 GRN Accrual        2.500
JRN-00046  Dr 2121 GRN Accrual             2.500 / Cr 2111 Trade Payables     2.000
                                                 / Cr 5210 Purchase Price Var 0.500
```

The **receipt leg is byte-identical across the two paths** (JRN-00042 == JRN-00045). The bill leg
differs only by the KWD 0.500 favourable PPV that I deliberately induced when testing Claim 4
(billed at 1.000 against a 1.250 receipt) — that is the correct posting for a price variance, not
a divergence. Every entry balances; whole-ledger sum is `0.000000`; no unbalanced JE exists.
All amounts are 3dp KWD throughout the posted rows.

No PO-stage GL was created (correct — commitment only).

---

## Claim 7 — Route coverage, 31 routes (screens 70–100) — **PARTIAL**

Every route was exercised. All 31 return **HTTP 200** authenticated (owner cookie) and a
non-existent sibling path (`/en/purchase/does-not-exist`) returns **404**, so the 200s are real
routing, not a catch-all. Unauthenticated, all 31 return **307 to /login** — route-level auth gate
present on every one. Nothing 404s, 500s, or renders a raw error.

`Render` column: **full** = page content confirmed in the browser this session; **shell** = the app
shell/branch gate rendered (route resolves and mounts) but I did not get past the gate before the
browser harness became unusable; **http** = HTTP 200 + 307-when-anonymous only.

| # | Route | HTTP (auth) | Anon | Render | Notes |
|---|---|---|---|---|---|
| 70 | `/purchase` | 200 | 307 | full | Hub: recent documents, AP aging, "New direct purchase"/"New purchase order". |
| 71 | `/purchase/direct` | 200 | 307 | full | List + status/supplier/date filters, Import, Export. Empty/loading states fine. |
| 72 | `/purchase/direct/:id` | 200 | 307 | full | DPU-00001. No tax row. Edit / Cancel actions. |
| 73 | `/purchase/direct/:id/edit` | 200 | 307 | full | "Correcting purchase … keeps the same number; a new bill is issued underneath." |
| 74 | `/purchase/direct/new` | 200 | 307 | full | Line added; no tax UI; branch locked to viewing branch with an explanation. |
| 75 | `/purchase/grns` | 200 | 307 | full | List + status/supplier/PO/date filters, Export. |
| 76 | `/purchase/grns/:id` | 200 | 307 | full | GRN-00006. Print preview, Create bill, Correct quantities, Void. |
| 77 | `/purchase/grns/:id/edit` | 200 | 307 | full | "Correct received…" panel. |
| 78 | `/purchase/grns/new` | 200 | 307 | full | Receive form pre-filled from `?purchaseOrderId`. Goods value / Total, no tax. |
| 79 | `/purchase/invoices` | 200 | 307 | shell | |
| 80 | `/purchase/invoices/:id` | 200 | 307 | full | Draft and confirmed states both seen. |
| 81 | `/purchase/invoices/:id/edit` | 200 | 307 | shell | |
| 82 | `/purchase/invoices/new` | 200 | 307 | shell | |
| 83 | `/purchase/landed-costs` | 200 | 307 | full | Reached by the denial banner's back action. |
| 84 | `/purchase/landed-costs/:id` | 200 | 307 | http | **Not visually exercised this phase.** |
| 85 | `/purchase/landed-costs/new` | 200 | 307 | full | Denial for Viewer; full form for Accountant. |
| 86 | `/purchase/orders` | 200 | 307 | full | Reached by the denial banner's back action. |
| 87 | `/purchase/orders/:id` | 200 | 307 | full | en + ar. Subtotal only, no tax. |
| 88 | `/purchase/orders/:id/edit` | 200 | 307 | http | **Not visually exercised this phase.** |
| 89 | `/purchase/orders/new` | 200 | 307 | full | Denial for Viewer and Accountant. Owner's full form not re-exercised here. |
| 90 | `/purchase/payments` | 200 | 307 | full | Reached by the denial banner's back action. |
| 91 | `/purchase/payments/:id` | 200 | 307 | http | **Not visually exercised this phase.** |
| 92 | `/purchase/payments/new` | 200 | 307 | full | Denial for Viewer; full form (6 inputs) for Accountant. |
| 93 | `/purchase/refund-receipts/:id` | 200 | 307 | http | `supplier_refund_receipts` is EMPTY in this tenant, so only the not-found path is reachable. **Never exercised with real data in any phase.** |
| 94 | `/purchase/returns` | 200 | 307 | http | **Not visually exercised this phase.** |
| 95 | `/purchase/returns/:id` | 200 | 307 | full | PR-00002, en + ar. No tax row. |
| 96 | `/purchase/returns/new` | 200 | 307 | http | **Not visually exercised this phase.** |
| 97 | `/purchase/suppliers` | 200 | 307 | full | Reached by the denial banner's back action. |
| 98 | `/purchase/suppliers/:id` | 200 | 307 | http | **Not visually exercised this phase.** |
| 99 | `/purchase/suppliers/:id/edit` | 200 | 307 | full | Denial for Viewer and Accountant. |
| 100 | `/purchase/suppliers/new` | 200 | 307 | full | Denial for Viewer and Accountant. |

**Routes I could not fully exercise, and why:** 84, 88, 91, 93, 94, 96, 98 (and the shell-only
79/81/82). The gstack browse daemon crashed or wedged repeatedly under this session's load
(losing the session each time and forcing a fresh login + branch pick), and each cold route
navigation cost 40–90 s because of API latency. These seven are the honest completeness gap in
this phase. Route 93 in particular can never be meaningfully tested until a supplier refund
receipt exists in the tenant.

---

## New findings

### F1 — MEDIUM, CONFIRMED — Money renders at 2 decimals for several seconds on the bill screen before the currency resolves
On first paint of `/purchase/invoices/e5ff947b-…` the totals block read
`Subtotal 2.50 · Total 2.50 · Paid 0.00 · Balance 2.50` and the line total read `2.50`.
After ~25 s (once the branch/entity currency resolved) the same nodes re-rendered as
`KWD 2.500 / KWD 0.000`. This is a 3-decimal KWD tenant, so the transient state shows the wrong
money precision on a money screen. The root cause is the documented pattern in
`bill-lines-table.tsx` ("currencyCode participates so price re-seeds at the right precision if the
tenant currency resolves from the store after this row first mounts") — the component renders
with an *unknown* currency rather than withholding the amount until it is known.
Repro: hard-load a bill detail page cold and read the totals within the first ~20 s.

### F2 — MEDIUM, CONFIRMED — A failed line-price save reverts silently and leaves a notice that now lies
First attempt at the Claim 4 edit: `PATCH …/lines/90e06ad4-…` returned **503** after 12 s
(API log: `[TenantResolverGuard] Tenant resolution timed out, timeoutMs: 12000` — the 503 itself
is infrastructure and is not the finding). The product behaviour on that failure is:
- No error toast, no inline error, nothing at all shown to the user.
- The Unit cost field silently reverted from `1.000` to the server value `1.250`.
- The **"Rounded to KWD 1.000" notice remained on screen**, next to a field reading `1.250`.
So the screen actively asserted a value that was never saved. A user who typed a price, saw
"Rounded to KWD 1.000", and walked away would believe the bill was priced at 1.000. The notice
should clear on mutation error, and the mutation error must surface.
Evidence: browser network log `PATCH … -> 503 (12015ms)`; page scrape immediately after:
`{"v":"1.250","notice":["Rounded to KWD 1.000"],"err":[]}`; DB `unit_price = 1.250000`.

### F3 — LOW / FRICTION, CONFIRMED — Create buttons are not disabled while the write is in flight
On `/purchase/grns/new`, with `POST /purchase/grns/receive` confirmed pending, both
**Save as draft** and **Save receipt** reported `disabled: false`. I clicked Save receipt again
and a second concurrent POST went out. No harm resulted (idempotency, see Claim 5), but this
violates the house "debounce buttons" rule and it is the mechanism that made the duplicate-trap
suspicion plausible in the first place. Disabling on `mutation.isPending` would also give the user
the missing "we are working on it" feedback during an 86-second write.

### F4 — LOW, CONFIRMED — Raw item UUID visible in the GRN printed-document item column while data loads
On first paint of `/purchase/grns/fdadce97-…` the print preview's Item column rendered
`⁨ce4915ed-f88b-4bdb-8885-77e9b9cef882⁩` and the lower Lines table rendered `Line #1`; both
resolved to `ZZTEST-Brake Pad Set Front Test 2` about 20 s later. A raw UUID must never reach a
user-facing surface, least of all a printed document. Same class as F1: an unknown value rendered
as if it were known.

---

## Verdict

| Claim | Result |
|---|---|
| 1 — Permission gating on four newly-wired routes | **VERIFIED** |
| 2 — No tax UI on any purchase surface, en + ar | **VERIFIED** |
| 3 — Arabic "المجموع الفرعي" on PO and GRN detail | **VERIFIED** |
| 4 — Unit-cost rounding notice + stored value match | **VERIFIED** |
| 5 — Duplicate-document trap | **RESOLVED — non-finding (latency only, no duplicate possible)** |
| 6 — Regression on both paths, GL correct and balanced | **VERIFIED** |
| 7 — Route coverage, 31 routes | **PARTIAL** — all 31 load and are auth-gated; 7 never visually exercised |

No claimed fix failed. The four permission gates, the tax-visibility rework, the Arabic wording
and the rounding notice all do what they say, in the running product, with the server refusing
independently. The residual work is the seven un-exercised routes (Claim 7) and the four small
findings above, none of which is a money or isolation defect.
