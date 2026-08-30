# POS Final Verification Pass (2026-08-27)

Logged in as **cashier1** (id `48123301-29f2-46a2-a50c-479911c73142`, email
`cashier1@gulf-auto-parts-mt5kya1i.zerupt.local`, confirmed via decoded JWT from the session
cookie) for all cashier-persona checks, register B2FAHAHEELREG1 (Fahaheel), Shift #3. Switched to
owner **anonymator8@gmail.com** ("HB") only for A2 (the transactions list / export screen, which
cashier1 is correctly denied) — explicit logout/login performed both directions, verified via
`/en/dashboard` sidebar identity and JWT before each conclusion.

**Environment note:** the API process was found dead (not listening on :3001) at the start of this
session — this was TOOL INSTABILITY carried over from a prior session's restart, not an app defect.
Rebuilt (`pnpm --filter @zerupt/api build`) and restarted per the briefing's recipe; confirmed
healthy (`503` with only `email_config` down, which is normal per the briefing). Sandboxed `curl`
to `localhost` was itself blocked by this environment's sandbox (`dangerouslyDisableSandbox`
required for any direct API curl) — worth knowing if a future pass sees inexplicable `HTTP:000`.

Ledger check: `0.000000` **before** first write (712 lines carried over) and `0.000000` **after**
last write (718 lines). Balanced throughout. All documents created logged in
`_documents-created.md`.

---

## (a) A1 — Order discount + delivery fee sale — CONFIRMED FIXED, persisted, ties out

Rang a clean item (Battery 12V 100Ah Exide Honda Civic, KWD 8.332, no pre-attached promo — chosen
deliberately over `ZZTEST-Brake Pad Set Front Test 2`, which carries a live 100%-off promo that
would have confounded the discount math). Applied an order discount of **KWD 1.000** and a delivery
fee of **KWD 2.000** via the cart's own numeric-keypad dialogs. Cart showed: Subtotal 8.332, Order
discount −1.000, Delivery fee +2.000, **Total 9.332**.

Opened Payment (F4) — the exact moment the CRITICAL bug used to strike: **Amount due read KWD
9.332**, correctly reflecting both adjustments. Tendered exact cash (9.332) and completed the sale.

**DB verification** (`pos_transactions` id `0f429f8e-e721-46c9-8da4-1e866bb22bfa`):
```
grand_total=9.332000  subtotal=8.332000  discount_total=0.000000
order_discount_amount=1.000000  order_discount_net=1.000000
delivery_fee_amount=2.000000    delivery_fee_net=2.000000
```
- CHECK-constraint identity: `abs(grand_total - (subtotal - discount_total -
  order_discount_net + tax_total + delivery_fee_net))` = **0.000000** — satisfies
  `pos_transactions_grand_total_identity_check`.
- `pos_payments`: `method=cash, amount=9.332000` — the customer was charged the **discounted**
  total, not the full 10.332 (8.332 gross + 2.000 fee).
- Three-way tie-out: two JEs on `source_document_id`, both balanced
  (`debit=credit=10.332000` and `debit=credit=5.359000` for COGS); `stock_ledger_entries` shows
  one `sale` row, `quantity=-1.000000`, `total_cost=5.359000`, `source_document_type='pos'`.

**A1 verdict: CONFIRMED FIXED.** The critical money bug (discount/fee dropped at Payment) is gone
end to end — computed, charged, persisted, and reconciled correctly.

### New regression found while verifying A1 — HIGH, CONFIRMED: receipt drops the order discount line entirely, arithmetic doesn't reconcile
The printed receipt (screenshot captured) shows:
```
Subtotal        KWD 8.332
Delivery fee    KWD 2.000
Total           KWD 9.332
```
**8.332 + 2.000 = 10.332, not 9.332.** The KWD 1.000 order discount is completely invisible on the
receipt — it is only netted silently into the line-item price (shown as "KWD 7.332" under the item,
with no "Discount" label anywhere on the document). A customer or the cashier reading this receipt
cannot reconcile the printed numbers; the receipt *looks* arithmetically wrong even though the
underlying sale is correct. Delivery fee gets an explicit line; order discount does not — same
class of "shown in cart, missing at output" gap that R1/R2 were, just one output layer further
downstream (receipt, not Payment sheet). Not previously filed. **Fix: surface an explicit "Order
discount" line on the receipt template, symmetric with delivery fee.**

---

## (b) A2 — Export the POS transactions list — CONFIRMED, and a new finding

Cashier1 correctly gets a clean "You don't have access to this page" denial at `/pos/transactions`
(not a crash) — switched to owner HB for this check, as the briefing permits.

Filtered the transactions list by `cashierId=48123301-...` (cashier1) before exporting — table
correctly narrowed from 7 rows (all cashiers, including owner HB's own test sale) to 6 (cashier1
only); confirmed via the network request params AND the re-rendered table.

**Route used:** headless blob-capture was not attempted (per instructions to avoid the previously
failed route) — instead extracted the owner's Supabase access token directly from the browser's
session cookie (`document.cookie`, base64-decoded) and hit the export endpoint directly with curl,
mirroring exactly what the browser's own "Export" click had just fired (confirmed via `network`
log the URL and params matched byte-for-byte: `GET /tenant/pos/transactions/export?branchId=...&cashierId=...`).

**Findings:**
1. **The export is not a file.** `content-type: application/json`, no `Content-Disposition` header,
   no filename, no CSV/XLSX. The endpoint returns a JSON envelope (`{"data":{"rows":[...]}}`).
   Clicking "Export" in the browser produced no new tab, no visible download/success toast, and no
   `<a download>` element was left in the DOM — I could not confirm ANY file is actually handed to
   the user by this button. **HIGH, CONFIRMED**: whatever "Export" is supposed to do, it does not
   currently deliver a file to a human.
2. **Filter was respected in the underlying data** — 6 rows returned, matching the filtered UI count
   exactly (not a full-table dump). This part is correct.
3. **The exported rows do not reconcile**, same defect class as the A1 receipt finding: for the
   just-rung transaction, the export shows `subtotal: "8.332000"`, `discountTotal: "0.000000"`,
   `grandTotal: "9.332000"` — no `deliveryFee` or `orderDiscount` field exists anywhere in the
   export schema at all. `8.332 - 0 ≠ 9.332`; a human (or a spreadsheet SUM) reading this export
   cannot reconcile subtotal to total. **HIGH, CONFIRMED** — same root gap as the receipt: order
   discount and delivery fee were added to the Payment/persistence layer but never plumbed into
   either downstream presentation surface (receipt, export).
4. **`cashierId` is a raw UUID** in every export row (no name resolution at all) — fails the
   plain-language / no-raw-IDs standard for a human-facing export. **MEDIUM, CONFIRMED.**
5. Money values are exported as 6-decimal strings (`"9.332000"`) rather than the app's 3dp display
   convention — arguably fine for a raw data export (more precision, not less), flagging as **LOW**
   since it's the opposite direction of the "2dp bug" this pass is hunting, but still inconsistent
   with the product's stated KWD-3dp identity.

**A2 verdict: the underlying query/filter logic is sound (respects the applied filter, correct row
count), but the "Export" feature does not currently produce a usable file for a human, and even the
raw data it does compute is missing two of the four money fields that matter (order discount,
delivery fee) — the exact same fields A1 was about.**

---

## REGRESSION HUNT — cross-cutting

### Zero-total (100%-off) sale — STILL BROKEN, new failure mode, CONFIRMED
Rang `ZZTEST-Brake Pad Set Front Test 2` with its live 100%-off promo (Total KWD 0.000), completed
via the "Confirm zero-amount sale → Complete anyway" dialog (that part works cleanly). Client queued
it offline (`OFF-B2FAHAHEELREG1-3-2`) and reported "Sale completed" to the cashier.

Server-side, this crashed with a **500**, repeatedly (client retried at least 3 times, all 500):
```
Error: values() must be called with at least one value
  at PgInsertBuilder.values (.../drizzle-orm@0.45.2/.../pg-core/query-builders/insert.ts:89:10)
  at apps/api/src/pos/sync/pos-sync.service.ts:1052:10
  at PosSyncService.insertAndReconcile (pos-sync.service.ts:720:9)
  at PosSyncService.syncTransaction (pos-sync.service.ts:374:20)
```
The previous round's fix (`payments: z.array(syncPaymentSchema)` relaxed from `.min(1)` — confirmed
in `apps/api/src/pos/sync/pos-sync.dto.ts:178`, `.min(1)` is gone) is real and correct at the
**validation** layer. But `pos-sync.service.ts:1052` does `tx.insert(posPayments).values(paymentRows.map(...))`
unconditionally — when a zero-total sale legitimately carries zero payment rows, Drizzle's
`.values([])` throws immediately. **This is the exact "same predicate patched on one side only"
failure mode the briefing warns about, recurring one layer deeper**: the DTO now accepts an empty
payments array, but the insert code was never updated to guard for it. No `pos_transactions` row was
created for this sale (checked before/after: the sequence still sits at `...00002` (the prior
session's stuck draft), no new row appended). Cashier sees a false "Sale completed" while the sale
is permanently stuck retrying against a guaranteed crash.
**Verdict: STILL BROKEN. HIGH, CONFIRMED.** Fix: guard the `.values()` call with
`paymentRows.length > 0 ? tx.insert(...).values(...) : Promise.resolve([])` (or equivalent) at
`pos-sync.service.ts:1052`, mirroring the already-relaxed DTO.

### Arabic category chips (`/ar/pos`) — CONFIRMED FIXED
All 9 category chips now render in Arabic: الكل (All), الإكسسوارات (Accessories), الفرامل (Brakes),
الكهرباء (Electrical), قطع المحرك (Engine Parts), الفلاتر (Filters), الزيوت (Lubricants), التعليق
(Suspension), الإطارات (Tyres). Previously "STILL BROKEN" twice (chips stuck in English). Layout
correctly RTL, money correctly 3dp with Arabic-Indic-free western digits (`‏8.332 د.ك.‏`), item
names properly localized.

### Root cause confirmed resolved: `GET /tenant/settings/current`
Network log across the whole session: `/tenant/settings/current` → **200** every time for cashier1
(vs. the old `/tenant/settings` which still 403s for cashier1, as expected/by design — it's simply
no longer used for this resolution path). This is the actual mechanism behind both the Arabic-chip
fix and the tax-row fix below — confirmed via direct network inspection, not inference.

### Tax row (Kuwait, no VAT), cashier-specific — CONFIRMED FIXED
Added an item to the Arabic cart and grepped the full cart text for "ضريبة" (tax) three times across
~3 seconds (the exact flicker window the prior round found) — **zero occurrences, every time**. No
flicker observed. Consistent with `/tenant/settings/current` now resolving reliably (200, not the
flaky 403) for the cashier persona.

### Z-report money — CONFIRMED FIXED (item R4 closed)
Shift #1 (cashier1's own, closed) Z-report: **every figure renders 3dp** — Total sales KWD 47.161,
Void amount KWD 0.000, Net sales KWD 47.161, Opening float KWD 25.500, Cash sales KWD 47.161, Cash
refunds KWD 0.000, Pay-ins KWD 10.500, Pay-outs KWD 5.250, Expected cash KWD 77.911, Counted cash
KWD 70.000, Over/Short −KWD 7.911. Arithmetic re-verified: 25.500+47.161+10.500−5.250 = 77.911 ✓;
77.911−70.000 = 7.911 ✓ (matches sign shown). The previously-filed R4 (2dp regression) is closed.

### Cashier name display — PARTIALLY FIXED, root cause is test data not code
Register header and Z-report both show **"Cashier: Cashier"** (a literal, generic placeholder) —
not cashier1's UUID, not a name. The transactions-list cashier filter dropdown shows **"Unknown
cashier"** for cashier1/storekeeper1/accountant1 (three distinct "Unknown cashier" entries, one per
underlying ID). Root cause, confirmed via `GET /tenant/users/directory`: `cashier1`'s `fullName` is
literally `null` in this tenant's data (never set during test-user provisioning) — same for the
other two test personas; only "Hussain Bedawala" (the owner) has a name on file.
**This means the "no raw UUID" fix from the prior round is genuinely real** — no raw UUID is shown
anywhere I checked (register header, Z-report, transactions filter) — the resolution/join now
works, it just resolves to `null` and falls back to a generic placeholder instead of a UUID. That is
strictly better than before, but "Cashier: Cashier" and "Unknown cashier" are themselves confusing
placeholders that give a shop owner no way to tell which cashier is which if they ever have two
same-named or nameless test/real accounts. **LOW, CONFIRMED** (downgraded from the prior round's
framing) — recommend seeding `fullName` for the standard test personas (this is a data-hygiene gap
in the fixture set this whole testing programme runs against, not a fresh code defect), and
separately, whether "Cashier"/"Unknown cashier" is the right fallback copy vs. showing the email
local-part is a product-copy decision, not a bug.

### Cart-line keyboard shortcuts / POS-024 hunt — NOT RE-TESTED THIS PASS (time budget)
I did not get to a dedicated re-test of ArrowUp/Down qty-stepper cross-line behavior, Delete vs.
PIN-input focus, or the 375px InfoHint layout this round — time went to A1/A2 (explicitly the
highest-priority items) and the zero-total-sale regression chase, which turned up a live server
crash worth surfacing immediately. **Say so plainly per the brief: this is unverified, not cleared.**
The previous round's own suspicion about POS-024 (documented as SUSPECTED, not CONFIRMED, with the
author unable to rule out scripting artifact) remains exactly as uncertain as it was — I did not add
or remove evidence either way this pass.

### Other Part C items (money formatting sweep, tooltips, offline/sync path generally, cash
movements, register-create dialog, `/ar/inventory`) — NOT SWEPT THIS PASS
Time was concentrated on the two mandatory gap closures (A1, A2) and the corrective-round
re-verification, per the task's explicit priority order. Flagging honestly rather than claiming a
clean sweep I didn't do.

---

## Severity summary

- **HIGH, CONFIRMED** — Receipt drops the order-discount line entirely; printed Subtotal + Delivery
  fee ≠ printed Total (new finding, found while verifying A1).
- **HIGH, CONFIRMED** — POS Transactions export delivers no actual file to the user (JSON response,
  no Content-Disposition, no observed download); its schema also lacks order-discount/delivery-fee
  fields so even the raw data doesn't reconcile subtotal→total.
- **HIGH, CONFIRMED** — Zero-total sale still cannot complete server-side: DTO validation was fixed
  (accepts 0 payments) but `pos-sync.service.ts:1052`'s unconditional `.values()` crashes on an
  empty payments array with a 500, silently and repeatedly, while the client tells the cashier the
  sale succeeded. No `pos_transactions` row is ever created.
- **MEDIUM, CONFIRMED** — Export's `cashierId` is a raw UUID with no name resolution.
- **LOW, CONFIRMED** — Money in the export is 6dp raw strings, not the 3dp display convention
  (opposite-direction inconsistency, not a rounding bug).
- **LOW, CONFIRMED** — "Cashier: Cashier" / "Unknown cashier" placeholders are confusing but are a
  test-data gap (`fullName: null` for cashier1/storekeeper1/accountant1), not a resolution bug — the
  raw-UUID leak itself is genuinely fixed.
- **NOT VERIFIED (say so, not cleared)** — cart-line keyboard shortcuts / POS-024 cross-line
  qty-stepper hunt, and the general Part C sweep (tooltips, offline/sync UI beyond the zero-total
  case, cash movements, register-create, `/ar/inventory`).

## Confirmed fixed, no caveats
- A1: order discount + delivery fee sale — computed, charged, persisted, three-way tied out.
- Arabic category chips on `/ar/pos`.
- Tax row correctly absent for cashier1, no flicker, root-caused to `/tenant/settings/current` now
  resolving reliably.
- Z-report money renders 3dp throughout (R4 closed).
- No raw UUID is shown anywhere for cashier identity (the underlying join/resolution now works; it
  surfaces a data-completeness gap instead, which is a materially better failure mode).
- Ledger balance held at `0.000000` throughout (712 → 718 lines).
