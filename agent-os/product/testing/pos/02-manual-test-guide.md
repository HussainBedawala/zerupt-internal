# POS 02 — Transaction Lifecycle — Manual Test Guide (founder run)

> **Tenant:** Al Asala Auto Parts (Kuwait, **KWD = 3 decimal places**). Prod-test DB.
> **Persona:** counter cashier ringing fast with a customer waiting.
> Run these on a register with an **open shift**. Real items + exact values below (verified live 2026-07-04).
> After each completing/void/return step, the three-way tie-out (POS ↔ GL ↔ stock) is auto-checked by recon — you just drive the UI and confirm the on-screen numbers match the **Expected** column.

## Items to use (real, in stock)

| Item | SKU | Price (KWD) | Tracking | On-hand |
|------|-----|-------------|----------|---------|
| Coolant 1 | OIL-0049 | 2.440 | none | 116 |
| Air Filter 4 | FLT-0007 | 29.530 | none | 118 |
| Brake Fluid 6 | OIL-0060 | 15.710 | none | 119 |
| Brake Pad Front 5 | BRK-0023 | 42.550 | none | 113 |
| Battery 70AH 2 | BAT-0070 | 8.730 | none (has a **pack** unit ×6) | 109 |
| ECU Test Unit | — | 5.000 (test) | **serial** | (serial pool) |
| Test Battery (Batch tracked) | — | 65.000 | **batch** | depleted-ish — use for oversell test |

---

## A. Cart build & complete (happy path)

1. Open `/pos`, confirm the cart shell renders (not a blank screen) with the open shift shown.
2. Search "Air Filter", add **Air Filter 4** ×2 → line total **59.060**.
3. Search "Brake Fluid", add **Brake Fluid 6** ×1 → line total **15.710**.
4. Confirm cart: **Subtotal 74.770 · Tax 0.000 · Discount 0.000 · Grand Total 74.770** (all KWD 3dp).
5. Pay → Cash → tender **80.000** → **Change Due 5.230** (single change-due display, no triplicate).
6. Complete. Expect: receipt screen shows, cart resets, `transactionNumber` assigned (B1SHUWAIKHREG1-<shift>-N), receipt titled **RECEIPT** (not "TAX INVOICE" — zero-tax tenant).
   - **Expected tie-out:** DR Cash 74.770 / CR Sales 74.770; DR COGS / CR Inventory per line; stock −2 Air Filter, −1 Brake Fluid.

## B. Line edits & states

7. New cart, add **Brake Pad Front 5** ×1. Increase qty to 3 → line total **127.650**, grand total updates instantly.
8. Set qty to **0** → line is removed or you're prompted to remove; **no zero-qty line is saved**.
9. Try qty **−1** → rejected (client + server).
10. Remove the last line → cart returns to a clean **empty state** (not a crash).
11. On the empty cart, tap **Pay** → clear "add an item first" message, **not** a 500 / zero-total completion.

## C. Discount (matches existing real precedent)

12. New cart, add **Coolant 1** ×1 (2.440). Apply a **25% line discount** → discount **0.610**, line total **1.830**.
13. Grand total **1.830** = 2.440 − 0.610. Complete with exact cash 1.830 → change 0.000.
    - (This reproduces real tx B1SHUWAIKHREG1-1-9/-10, both already tie out.)

## D. Pack-unit sale (the regression path — commit 728b6406)

14. New cart, add **Battery 70AH 2** and choose the **pack of 6** unit → 1 pack.
15. Confirm: line reads **1 × 52.380 = 52.380** (pack price = 6 × 8.730), **not** "1 × 8.730".
16. Complete with cash 52.380.
    - **Expected tie-out:** stock relief **−6 base units** (NOT −1 pack); COGS **28.620** (= 6 × 4.770 cost); revenue 52.380. ✅ Verified live on B1SHUWAIKHREG1-2-1.

## E. Hold & recall (no live data yet — create some)

17. Build a cart (add 2 items), tap **Hold** (optionally label it "Mr Ali"). Cart parks; you can start a new sale immediately.
18. Recall via the **held list** — parked sale shows label + total; selecting restores the exact cart.
19. **Held is not revenue:** while parked, the sale must NOT appear in shift totals / X-report.
20. Try to recall the **same held sale twice** quickly (two taps) → second attempt rejected cleanly ("Only a held transaction can be recalled").
21. Fill the register to the held limit and try one more hold → blocked with a clear "maximum held" message.

## F. Void of a completed sale (no live data yet — create one)

22. Complete a small cash sale (e.g. Coolant 1 ×1 = 2.440). Then **Void** it.
23. **Void reason is mandatory** — leave it blank → rejected.
24. Enter a reason, confirm. Expect: `voidedAt`, `voidedBy`, `voidReason` all set; sale is **immutable** (no re-edit, no second void).
25. Try to void it **again** → "already voided".
    - **Expected tie-out (auto-checked):** a **full reversal** — reversing GL entry (net-zero revenue + COGS) **and** stock restored (+ the sold qty). Net financial + inventory effect = zero.
26. Try to void a sale that already has a **return** against it → blocked ("use a Return for the remaining amount").

## G. Defensive UX — "dumbest thing a cashier could do"

27. **Double-tap Pay** on a valid cart → only **one** completion; the second tap is a no-op / returns the same completed sale (no duplicate transaction, no double stock relief).
28. **Batch oversell:** add **Test Battery (Batch tracked)** with a qty above available lots → blocked at completion with "only N in stock" **before** cash is taken (guard `assertBatchLotsAttributable`, shipped for finding #17).
29. **Serial item:** add **ECU Test Unit** → qty locked to **1** (can't type 2); the specific serial is recorded on the line.
30. **Very large qty** (e.g. 9999 on a stocked item) → total displays clearly; accepted only if stock allows.
31. **RTL (Arabic):** switch to Arabic — item names, amounts, totals, and payment breakdown render RTL; **transaction number stays LTR**.

## H. Back-office list & detail

32. Open the back-office transaction list. Filter by **status** (completed / voided / held / return) and by **shift**; search by transaction number.
33. Open a completed sale's **detail** — lines, payments, receipt link, shift ref, cashier all present.
34. Confirm pagination is stable (no duplicate rows).

---

## What "pass" looks like

- Every completing sale/return/void updates the on-screen totals to the **Expected** values at KWD 3dp.
- Header identity holds: **grandTotal = subtotal + taxTotal − discountTotal** exactly.
- No duplicate transactions from double-taps; empty-cart pay is blocked cleanly.
- Held sales never count as revenue; voids fully reverse.
- Recon (auto) reports **12/12 (+ your new ones) tie out** with zero JE imbalance.

Report anything that diverges — I'll log it in `_findings.md` and fix CRITICAL/HIGH the same session.
