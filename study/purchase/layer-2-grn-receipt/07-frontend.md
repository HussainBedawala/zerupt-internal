# Chapter 7 — Frontend GRN UI

## Feature Location

`erp/apps/web/src/features/purchase/`

There is **no dedicated GRN feature folder**. GRN-specific frontend files are sparse:

| File | Purpose |
|------|---------|
| `print/grn-print-document.tsx` | GRN print document (render-only) |
| `components/bill-create-panel.tsx` | Bill creation (references GRN indirectly) |
| `api/purchase-queries.ts` | TanStack Query hooks (likely contains GRN queries) |

## What Exists in the UI

The GRN print document (`grn-print-document.tsx`) suggests GRN confirmation exists and is printable. The bill creation UI (`bill-create-panel.tsx`) creates standalone bills, not GRN-linked bills.

There is no visible `grn-create-panel.tsx`, `grn-detail-panel.tsx`, or `grns-list-panel.tsx` in the purchase feature folder. The formal PO→GRN flow UI appears to be **not yet built** as a standalone feature — the `grn-print-document` is the only GRN-specific UI component.

The **Direct Purchase** path likely has its own entry panel (inventory shopkeeper shortcut), but a dedicated file was not found in `features/purchase/components/`. It may live in a different feature area.

## What Definitely Exists (Confirmed by Code)

| UI Element | File | Notes |
|------------|------|-------|
| GRN print document | `print/grn-print-document.tsx` | Render-only, shows GRN header + lines |
| Bill list panel | `components/bills-list-panel.tsx` | Shows all bills; no GRN filter |
| Bill create panel | `components/bill-create-panel.tsx` | Manual bill, no GRN matching |
| Bill detail panel | `components/bill-detail-panel.tsx` | Confirm, bill-from-GRN flow |

## REQUIRES / Gaps (Frontend)

| Gap | Detail |
|-----|--------|
| GRN list screen | REQUIRES. No `grns-list-panel` found. Users cannot browse GRNs. |
| GRN draft creation UI | REQUIRES. No panel for creating a GRN draft and adding lines. |
| GRN detail / confirm UI | REQUIRES. No GRN detail panel for confirming or viewing lines. |
| Over-receipt approval UI | REQUIRES. The backend accepts `approvedBy + approvalPin` but no frontend collects them. |
| Serial number capture UI | REQUIRES. No serial number input on GRN lines in frontend. |
| Batch / expiry capture UI | REQUIRES. No batch / expiry input on GRN lines in frontend. |
| GRN vs PO matching view | REQUIRES. No "received vs ordered" summary per PO line. |
| Direct Purchase entry panel | REQUIRES or in progress. Not found in `features/purchase/components/`. |
| Soft-lock override UI | REQUIRES. No UI to enter `softLockOverrideReason` on GRN confirm. |

## Notes

The backend GRN API is fully built (`grns.controller.ts`, `grns.service.ts`). The frontend is the critical gap for Layer 2 — the entire GRN workflow (create, add lines, confirm, view) needs UI components before the PO→GRN path is usable.

The Direct Purchase (`POST /tenant/direct-purchases`) is a simpler single-call entry point that is more suitable for the inventory-only shopkeeper persona and may already be wired into a simpler UI (not visible in the purchase feature folder — may be in `features/inventory/` or `features/pos/`).
