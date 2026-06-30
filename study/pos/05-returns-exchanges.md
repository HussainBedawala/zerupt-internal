# POS Layer 5: Returns & Exchanges — Audit + Build Spec

**Date:** 2026-06-30  
**Status:** Pre-build audit (read-only). No code changed.

---

## 1. Current Return Flow — Confirmed State

### Backend

`createReturn` exists and is complete:
- File: `apps/api/src/pos/transactions/pos-transactions.service.ts:1152`
- Endpoint: `POST /tenant/pos/transactions/:id/return`
- Controller: `apps/api/src/pos/transactions/pos-transactions.controller.ts:221`

The flow:
1. Pre-flight: validates `original` is a `completed` `sale` in the same tenant.
2. Requires an open shift on the **original** register (`pos-transactions.service.ts:1191`).
3. Acquires `pg_advisory_xact_lock(hashtext('pos_return:<originalId>'))` (line 1227) — TOCTOU-safe.
4. Re-reads prior COMPLETED returns inside the lock (line 1236), aggregates cumulative returned qty per original line.
5. Validates requested qty does not exceed `originalQty − alreadyReturned` (lines 1280–1302).
6. Inserts return header (`type='return'`, `status='completed'`, `originalTransactionId` set).
7. Inserts return lines with **negative quantities** and proportional discount/tax allocation with residual-rounding on the exhausting partial.
8. Inserts refund payment row at `input.refundMethod` (line 1459).
9. Emits GL reversal via outbox: `pos.return.completed` → `handleReturnCompleted` in `accounting-events/listeners/pos.listener.ts:220` → posts contra JE (Dr 4200 Sales Return, Dr 2131 Output Tax, Cr 1112 Cash / 1121 Bank / 2153 Customer Deposit).
10. Emits inventory restock via outbox: `pos.return.completed.inventory` → `inventory-domain.listener.ts` → `sale_return` inbound movement at `costAtSale` (original WAC preserved on the return line).

**GL reversal is idempotent** via outbox `eventId` (deterministic per return txn id, `pos-transactions-events.ts:130`).  
**Inventory restock is at original cost** — confirmed sound (three-way tie-out holds).

### Frontend

`ReturnModal` exists at `apps/web/src/features/pos/components/return-modal.tsx`.

**Critical gap: `ReturnModal` is imported nowhere in the codebase.**  
`grep -rn "ReturnModal" apps/web/src` returns only the file itself.

The back-office transaction list (`features/pos-transactions/components/pos-transactions-list-panel.tsx`) opens a detail sheet on row click — the sheet body shows header fields, totals, lines, and payments, but **has no "Return" button** (verified: full file read, no ReturnModal import or return action).

**Verdict:** Returns exist in the backend and the modal exists, but no UI path calls them. A cashier cannot currently process any return from any surface.

---

## 2. No-Receipt Return — MISSING, Design Decision

**Confirmed MISSING:** No path supports returning without an `originalTransactionId`. `createReturn` requires:
- `original` found in DB (`NotFoundException` if not)
- `original.type === 'sale'`
- `original.status === 'completed'`

There is no manager-PIN override, no current-price basis, no store-credit issuance path.

### Design Decision: Cash Refund + Manager PIN + Flag

**Recommendation: cash refund with manager approval pin + `noReceiptFlag`, NOT store credit.**

Justification:
- `store_credit` is explicitly a stub with no balance table (`pos-transactions-payments.ts:12`): `gift_card and store_credit have stub uuid columns and no balance table — accepting them takes money with nothing charged.` Building the credit ledger is a separate unscoped epic (balance table + redemption flow + expiry). Blocking no-receipt returns on that gap is wrong.
- The MENA/India/SEA cashier persona: they handle cash. Issuing store credit as a promise on a non-existent ledger is worse than giving cash — the customer comes back and nothing is on record.
- Cash refund + manager PIN is the correct MVP: the manager takes accountability, it hits the same GL path (Cr 1112 Cash), and it stores an audit trail (`noReceiptReturn: true`, `managerApprovalId`).
- The `PinVerificationService.verifyApproval()` pattern is already proven for cash movements (`pos-cash-movements.service.ts:12`). Reuse it with permission `pos.return.approve-no-receipt`.

**No-Receipt Return Flow (MVP design):**
1. Cashier taps "No-Receipt Return" in the in-POS return lookup surface (see §4).
2. Manager enters PIN → `PinVerificationService.verifyApproval(tenantId, { pin, permission: 'pos.return.approve-no-receipt' })`.
3. Cashier manually enters items + quantities (free-form or catalog lookup — no line tie-out to a prior sale).
4. Refund method: **cash only** for no-receipt (card reversal requires original authorization reference; store credit is unbuilt).
5. Backend creates a synthetic `type='return'` transaction with `originalTransactionId: null`, `noReceiptReturn: true`, `approvedByUserId: <managerId>`.
6. GL: same posting as a receipt return (Dr 4200, Dr 2131, Cr 1112) — the only difference is quantity/cost is set to **current price and current WAC** (no original line to carry `costAtSale`).
7. Inventory: restock at current WAC.

**Schema addition required:** `noReceiptReturn boolean default false`, `approvedByUserId uuid nullable` on `posTransactions`. Migration required.

---

## 3. Returns-Through-Main-Cart vs Modal — Recommendation

**Current state:** Separate `ReturnModal` opened from a transaction detail. The main cart has no concept of negative lines.

**Assessment against L2 phase model:** L2 introduces a `build | settle` phase in `pay-surface.tsx` and `pos-store.ts`. The cart is a `build`-phase construct; payment is `settle`. A negative-line return-in-cart would need to:
- Allow negative line totals in the cart (currently blocked by `lineTotal >= 0` display assumptions and the payment-gate that requires `grandTotal > 0`).
- Mix return lines with new sale lines in one transaction (exchange pattern).
- Handle the mixed refund/charge split-tender at settle time.

**Recommendation: Keep the modal for pure returns; add negative-line exchange support to the cart in Layer 5 phase 2.**

The modal is the right UX for "process a standalone return":
- It shows the original receipt lines, already-returned quantities, and produces a clean `type='return'` transaction.
- Adding receipt lookup (by transaction number or QR scan) to the modal entry point is all that's needed.

Negative-line cart support is needed only for exchanges (return + new purchase in one). That is a larger scope (mixed `type`, mixed payment direction, L2 phase model extension). Defer exchange to a follow-on; ship return modal access first.

---

## 4. In-POS Return Entry — MISSING, Design

**Confirmed MISSING:** `action-bar.tsx` has Void but no Return action (grep confirmed, line 74–84 shows Void only). No "Return" button in the register shell.

**Design — In-POS Return Lookup:**

A "Return" action button in `action-bar.tsx` opens a `ReturnLookupDrawer` (new component):

```
[Return] button in action-bar
  → opens ReturnLookupDrawer
     ├── Input: "Enter transaction number" (text field, numeric keyboard)
     ├── OR: "Scan receipt QR" (camera button → parse QR → populate field)
     ├── [No Receipt] button → triggers manager PIN flow → opens NoReceiptReturnModal
     └── On submit: GET /tenant/pos/transactions?search=<number>&type=sale&status=completed
         → shows matched sale summary
         → [Process Return] → opens existing ReturnModal with that transaction
```

The QR on printed receipts already encodes the transaction number (confirmed in `receipt-barcode.tsx`). The lookup just needs a text field + QR parse (browser `BarcodeDetector` API or a library fallback).

---

## 5. Exchange Flow — MISSING

**Confirmed MISSING:** The type `exchange` appears in the DB schema and in `TYPE_TONES` in the back-office list panel (`pos-transactions-list-panel.tsx:56`), but:
- No `createExchange` endpoint exists in the controller or service.
- No exchange UI exists in the POS register.
- The type is only visible as a display label in the back-office view.

The schema anticipates exchange but it is entirely unimplemented.

**Recommendation for MVP:** Defer exchange as a separate feature. Document the intended flow:
- Exchange = return lines (type='return') + new sale lines processed as a single session, net payment/refund at settle.
- This requires negative-line cart support (see §3) and a new `type='exchange'` transaction or a linked return + sale pair.
- Not required for launch; a cashier can manually do a return then a new sale.

---

## 6. Reversal Tie-Out — Re-Confirmed

| Check | Result |
|-------|--------|
| GL reversal atomic with return insert | PASS — outbox insert is in the same DB transaction (line 1493–1498) |
| Idempotent GL | PASS — deterministic eventId per return txn id (pos-transactions-events.ts:130) |
| Inventory restock at original cost | PASS — `costAtSale` carried from original line onto return line; `buildPosInventoryReturnPayload` (line 1504) feeds it to the `sale_return` inbound movement |
| Voided prior returns excluded from qty guard | PASS — line 1234 comment + filter `status='completed'` only |
| Advisory lock closes TOCTOU | PASS — `pg_advisory_xact_lock` on `pos_return:<originalId>` covers re-read + insert |
| `store_credit` on refundMethod | RISK — refundMethod=store_credit creates a payment row pointing to an unbuilt balance ledger (line 1459 does not validate method against ALLOWED_PAYMENT_METHODS). The payment rows land with `method='store_credit'` but no credit is actually issued to any customer balance table. **Block store_credit as refundMethod until the credit ledger is built.** |

---

## A. Gaps Summary

| Gap | Severity |
|-----|----------|
| ReturnModal not wired to any UI | CRITICAL — returns are invisible to cashiers |
| No in-POS return entry (action-bar) | CRITICAL |
| No receipt lookup (by txn # or QR) | CRITICAL |
| No-receipt return path missing | HIGH |
| Exchange flow missing | MEDIUM (defer post-launch) |
| `store_credit` as refundMethod writes a payment row against no ledger | HIGH — block it at DTO validation until ledger exists |

---

## B. Ordered Build List

### BACKEND

| # | Priority | File:Line | Change | Migration |
|---|----------|-----------|--------|-----------|
| B1 | CRITICAL | `pos/transactions/pos-transactions.dto.ts:262` | Remove `store_credit` from `refundMethod` enum until credit ledger exists. Change `z.enum(["cash", "card", "store_credit"])` → `z.enum(["cash", "card"])`. | No |
| B2 | HIGH | `packages/db/src/schema/pos-transactions.ts` | Add `noReceiptReturn boolean default false` + `approvedByUserId uuid nullable FK → users` to `posTransactions`. | Yes |
| B3 | HIGH | `pos/transactions/pos-transactions.service.ts` | Add `createNoReceiptReturn` method: takes manager PIN + free-form lines + `refundMethod: 'cash'` only. Calls `PinVerificationService.verifyApproval` with permission `'pos.return.approve-no-receipt'`. Sets `originalTransactionId: null`, `noReceiptReturn: true`, `approvedByUserId`. Costs at current WAC. Emits same `pos.return.completed` + `pos.return.completed.inventory` events. | No (beyond B2 migration) |
| B4 | HIGH | `pos/transactions/pos-transactions.controller.ts` | Add `POST /tenant/pos/transactions/return/no-receipt` endpoint calling `createNoReceiptReturn`. Add `@RequiresPermission('pos.return.approve')` on the normal return endpoint if not already present; `pos.return.approve-no-receipt` on new endpoint. | No |
| B5 | MEDIUM | `auth/permissions.ts` (or wherever permission keys are registered) | Register `pos.return.approve-no-receipt` permission. | No |

### FRONTEND

| # | Priority | File:Line | Change | Migration |
|---|----------|-----------|--------|-----------|
| F1 | CRITICAL | `features/pos/components/action-bar.tsx:74` area | Add "Return" action button next to Void. Opens `ReturnLookupDrawer`. | No |
| F2 | CRITICAL | `features/pos/components/` (new file) | Create `ReturnLookupDrawer`: transaction number text field + QR scan button + "No Receipt" button. On txn lookup: fetches transaction and opens `ReturnModal`. | No |
| F3 | CRITICAL | `features/pos-transactions/components/pos-transactions-list-panel.tsx` | Wire `ReturnModal` into the back-office detail sheet: import ReturnModal, add "Process Return" button visible when `tx.type === 'sale' && tx.status === 'completed'`, load existing returns from query for `existingReturns` prop. | No |
| F4 | HIGH | `features/pos/components/return-modal.tsx:170` | Remove `store_credit` from `REFUND_METHODS` display (import `REFUND_METHODS` from types.ts and filter, or edit types.ts directly) until B1 + credit ledger are shipped. | No |
| F5 | HIGH | `features/pos/components/` (new file) | Create `NoReceiptReturnModal`: PIN entry (reuse `PinEntryDialog` pattern from cash movements), free-form line entry (catalog search or manual sku+qty+price), refund method fixed to cash. Calls `POST /tenant/pos/transactions/return/no-receipt`. | No |
| F6 | MEDIUM | `features/pos-transactions/components/pos-transactions-list-panel.tsx` | Add return transactions to the detail sheet: when `tx.type === 'return'`, show `originalTransactionId` link. Currently the sheet shows nothing special for returns. | No |

### Build Order

1. **B1** (block store_credit refund — quick, prevents data corruption)
2. **F4** (remove store_credit from UI dropdown — matches B1)
3. **F3** (wire ReturnModal into back-office detail — uses existing modal, zero new backend)
4. **B2 + B3 + B4 + B5** (no-receipt return backend — migration + service + controller)
5. **F1 + F2** (in-POS return entry — action-bar + lookup drawer)
6. **F5** (no-receipt return modal — depends on B3/B4)
7. **F6** (back-office return detail polish)
8. Exchange — defer post-launch

### Decisions Locked

- **No-receipt refund target:** Cash + manager PIN + `noReceiptReturn` flag. NOT store credit (unbuilt ledger). NOT card (no original auth reference). Justified above (§2).
- **Returns-in-cart vs modal:** Keep modal for standalone returns. Negative-line cart only for exchange, deferred. (§3)
- **Exchange:** Defer. Schema type stub exists; no backend or frontend. Post-launch. (§5)
