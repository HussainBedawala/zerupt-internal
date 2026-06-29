# 05 — Dual Path: Direct Purchase vs PO Chain

## The Two Paths

Zerupt serves two distinct buyer archetypes:

| Archetype | Path | Description |
|-----------|------|-------------|
| Inventory-only shopkeeper | **Direct Purchase** | No PO. Supplier delivers → shopkeeper enters bill directly. Common in MENA/India small retail. |
| Full-process buyer | **PO Chain** | PO → GRN → Bill from GRN. Proper procurement controls. |

Both paths must be first-class. The foundation (Layer 0) must not privilege either path.

---

## How the Foundation Serves Both Paths

### Supplier master

The same `suppliers` table serves both paths. No path-specific columns. Correct.

### AP subledger

Both paths write `purchase_invoices` rows:

| Path | `source_grn_ids` | `is_opening` | Comment |
|------|-----------------|-------------|---------|
| Direct purchase | NULL | false | Manually entered bill, no GRN |
| PO chain | `[grn_uuid, ...]` | false | Bill generated from GRN |
| Opening balance | NULL | true | Carry-forward stub |

The `source_grn_ids` jsonb column (`purchase.ts` line 252) is the only distinguishing mark. A CHECK constraint enforces it is a JSON array when present (`purchase_invoices_source_grn_ids_is_array_check`, line 283).

### GL posting

Both paths post DR Inventory / CR 2111 via the accounting module. The event differs:
- Direct: `purchase.invoice.confirmed` (or equivalent; exact event name to verify in Layer 3)
- PO chain: `purchase.grn.confirmed` → bill creation → `purchase.invoice.confirmed`

---

## Foundation Gaps for Dual Path

### 1. No enforcement that direct bills can't have GRN ids

`source_grn_ids` is nullable jsonb — any combination is allowed. A bill can claim `source_grn_ids` while bypassing GRN receiving. For the direct-purchase path this is intentional (null = no GRN). For the PO-chain path the service should enforce that only GRN-sourced lines appear.

**REQUIRES:** Service-layer guard at bill confirmation: if `source_grn_ids` is present, all lines must have `grn_line_id` set; if absent, lines may be free-form. This is Layer 3 work but documented here as a foundation contract.

### 2. No `direct_purchase` flag distinguishing the path

There is no boolean distinguishing "this was a direct purchase" from "this came from a GRN with source_grn_ids erroneously null." Analytics and reports will conflate the two.

**REQUIRES:** Either a `purchase_path enum('direct', 'po_chain')` column, or enforce: `direct = (source_grn_ids IS NULL AND grn_line_id columns are all null)`. Document the convention so reports don't invent ad-hoc queries.

### 3. Period control applies to both paths

`validatePeriod(invoiceDate)` is called before bill confirmation regardless of path. Correct — the accounting period locks both.

### 4. Status lifecycle applies equally

`draft → confirmed` (no cancel; corrections via purchase return) applies to both paths. Opening of blocked suppliers must guard both paths — the service's `createPurchaseInvoice` should check `supplier.status !== 'blocked'`. This is a Layer 3 guard but the supplier status design (Layer 0) must support it.

---

## What the Foundation Must Lock In for Both Paths

| Requirement | Current state | Status |
|------------|--------------|--------|
| Same `suppliers` table for both | YES | OK |
| Same `purchase_invoices` for both | YES | OK |
| `source_grn_ids` distinguishes path | Partial (null = direct or opening) | GAP |
| AP balance aggregate is path-agnostic | YES (`SUM(balance WHERE status='confirmed')`) | OK |
| Blocked supplier guard at invoice creation | NOT in service yet | GAP (Layer 3) |
| Inactive supplier guard at invoice creation | NOT in service yet | GAP (Layer 3) |
