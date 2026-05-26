# India GST: Nil-rated vs Exempt vs Zero-rated (and the slab structure)

> Why a "0% tax code" is not just one thing in Indian GST — and why miscategorising it produces wrong returns.

## The three kinds of 0%

All three result in the customer paying 0% GST, but they differ in **Input Tax Credit (ITC)** treatment and **where they report on the GST return** — which is what the accounting system must get right.

| Category | Example | ITC on inputs | GST return |
|---|---|---|---|
| **Zero-rated** (IGST Act s.16) | Exports, supplies to SEZ | **Retained** — supplier can claim a refund of ITC | Export/zero-rated section |
| **Nil-rated** | Goods taxed at 0% by notification (fresh veg, bread) | **Blocked** (s.17(2) CGST) | GSTR-1 **Table 8** (nil/exempt) |
| **Exempt** (CGST s.11 / IGST s.6) | Healthcare, education | **Blocked** | GSTR-1 **Table 8** |

Key insight: **zero-rated is the generous one** — you charge nothing *and* keep your input credits (with a refund). Nil-rated and exempt both **block ITC** and require proportionate reversal (Rule 42 CGST). For a system's `TaxCategory` model, nil-rated and exempt behave identically (ITC blocked, same return box), so a single `Exempt` category covers both; `ZeroRated` must be reserved for exports.

**The bug this prevents:** seeding a domestic 0% supply as `ZeroRated` would (a) map it to the wrong GL accounts, (b) skip ITC-reversal logic, and (c) populate the export section of GSTR-1 instead of Table 8 — silently wrong returns.

## The slab structure (CGST + SGST vs IGST)

GST is **dual** for intra-state and **single** for inter-state:

- **Intra-state** (buyer & seller same state): tax splits into **CGST (centre) + SGST (state)**, each half the slab. A 12% slab = CGST 6% + SGST 6%.
- **Inter-state** (different states, or import): a single **IGST** at the full slab. 12% slab = IGST 12%.

Standard slabs: **0 / 5 / 12 / 18 / 28%** (plus compensation **cess** on sin/luxury goods, charged *on top* and compound — calculated on base + CGST + SGST). The CGST/SGST components are **parallel, non-compound**; cess is the compound one.

## Document types this connects to

Retail accounting needs distinct numbered documents whose gap policy matters for audit:
- **Credit Note (CN)** — issued on a sales return / price reduction; reverses an invoice. Financial → **strict** gap policy (no missing numbers).
- **Receipt Voucher (RV)** — money received (e.g. advance). Distinct from "receive goods" (GRN). Also financial/strict.

"Strict gap policy" = the sequence may not skip numbers (tax authorities require contiguous invoice/credit-note numbering); released reservations decrement the counter to reclaim the number.

## Takeaway

A "0% rate" is a reporting/ITC decision, not just a number. In a multi-country tax engine, the **category** carries the legal meaning; get it wrong and the arithmetic is right while the compliance is wrong.
