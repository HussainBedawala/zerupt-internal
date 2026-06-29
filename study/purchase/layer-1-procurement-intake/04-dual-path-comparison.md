# Chapter 4 — Dual-Path Comparison

---

## Side-by-Side

| Dimension | PO Path (formal) | Direct Purchase Path (express) |
|-----------|-----------------|-------------------------------|
| **Entry point** | `/purchase/orders` → create PO | `/purchase/direct` → one form |
| **User steps** | 3–4 separate saves (PO → GRN → Bill → Payment) | 1 save |
| **PO exists** | Yes — user-visible, gapless PO- number | Hidden `DP-<uuid>` PO, filtered from PO list |
| **PO sourceType** | `manual` | `direct_purchase` |
| **PO status on creation** | `draft` | `confirmed` (no draft phase) |
| **GRN** | Created separately by warehouse staff | Auto-created + confirmed in same tx |
| **Bill** | Created by accounts staff from GRN or manually | Auto-created + confirmed in same tx |
| **Payment** | Separate supplier payment voucher, later | Optional — same tx if `settlement.type=paid` |
| **Inventory update** | On GRN confirm (Layer 2) | On GRN confirm inside the tx (same event) |
| **AP update** | On Bill confirm (Layer 3) | On Bill confirm inside the tx (same event) |
| **Accounting JEs** | Same — emitted via outbox after each confirm | Same — outbox drained post-tx |
| **Idempotency** | No client idempotency key; PO number guards duplicates | `idempotencyKey` on `direct_purchases` |
| **Audit trail** | PO + GRN + Bill + Payment (separate documents) | Same documents + `direct_purchases` anchor linking them |
| **Amendment** | Edit draft PO lines before confirm | Not possible — everything is confirmed in one step |
| **Cancellation** | Draft: free. Confirmed: only if no GRNs | No defined reversal path (gap) |
| **Approval gate** | PO approval threshold (manager PIN) | None currently (gap — see below) |
| **Tax capture** | Per-line on PO; refrozen on confirm | Derived from item taxGroupId; computed on bill confirm |
| **Warehouse** | Per-line on PO (user-specified) | Auto-resolved to branch default (no user choice) |
| **Multi-warehouse** | Supported (each line can target different warehouse) | Not supported (all lines → same default warehouse) |

---

## Is Direct Purchase a First-Class Peer or a Shortcut?

Currently it is an **orchestrated shortcut**: it reuses the same PO/GRN/Bill/Payment tables and accounting machinery but hides the intermediate steps. The accounting outcome is identical to the full PO path. It is NOT a separate accounting engine.

However it lacks several features the PO path has:
- No approval gate
- No warehouse selection
- No amendment after entry
- No reversal / undo path
- No "on-order" signal (DP PO is confirmed without emitting `purchase.order.confirmed` — inventory `onOrder` is never incremented)

A 10-year design would make Direct Purchase a true first-class document type with its own:
- Reversal flow (auto-reverse GRN + Bill via purchase return + credit note)
- Amendment (allow adding lines before posting to accounting)
- Approval threshold (same gate as PO, especially for large cash buys)

---

## Events Emitted

| Event | PO Path | Direct Purchase Path |
|-------|---------|----------------------|
| `purchase.order.confirmed` | Yes (on PO confirm) | **No** (suppressed — no onOrder inflation) |
| `purchase.grn.confirmed` | Yes (on GRN confirm) | Yes (same event, from within tx) |
| `purchase.payment.posted` | Yes (if payment posted) | Yes (same event, from within tx if paid) |
| `purchase.order.cancelled` | Yes (if PO cancelled after confirm) | N/A |

The absence of `purchase.order.confirmed` in the DP path is intentional and correct: there was never a "we intend to buy" state, so `onOrder` qty should never be incremented.

---

## Downstream Feed

Both paths converge at the same point after the GRN confirm event:
- **Inventory** receives `purchase.grn.confirmed` → stock ledger entry, cost layer update, `onOrder` decrement (PO path only).
- **Accounting** receives `purchase.grn.confirmed` → JE posted.
- Both paths produce the same confirmed `purchase_invoices` row which feeds AP aging, supplier statement, and payment flows.
