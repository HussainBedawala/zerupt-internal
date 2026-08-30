# Documents created during testing

Every document written into the live tenant, so nothing is a mystery later.

| Date | Module | Doc type | Doc number | Amount | Notes |
|------|--------|----------|------------|--------|-------|
| 2026-08-26 | Inventory | Item | ZZTEST-SKU-0001 | selling 12.345 KWD | id ce4915ed-f88b-4bdb-8885-77e9b9cef882. Test item, no stock. |
| 2026-08-26 | Settings | Role | Cashier / Accountant / Viewer | - | created via UI for permission testing |
| 2026-08-26 | Settings | User | cashier1 / accountant1 / storekeeper1 | - | username-route logins, pw Zerupt.Test@2026 |

## Session: inventory batches + serial-numbers screens (2026-08-26)
- Item `ZZTESTBA-FC132987` (ZZTEST-Batch Tracked Oil Filter) — trackingType=batch, id 8daa1632-92af-48b8-bd34-8a389fa18304
- Item `ZZTESTSE-3A2B0ED2` (ZZTEST-Serial Tracked Alternator) — trackingType=serial, id 1af2cca0-b3fc-44e6-bbb6-745ee762df89
- Adjustment B1ALRAIMAINS-ADJ-00010 — Found +50 ZZTESTBA-FC132987 batch ZZTEST-LOT-A exp 2027-06-01 @ Al Rai Main Showroom
- Adjustment B1ALRAIMAINS-ADJ-00011 — Found +20 ZZTESTBA-FC132987 batch ZZTEST-LOT-EXPIRED exp 2026-01-01 @ Al Rai Main Showroom
- Adjustment B1ALRAIMAINS-ADJ-00012 — Found +3 ZZTESTSE-3A2B0ED2 serials ZZTEST-SN-001/002/003 @ Al Rai Main Showroom

## Session: 01-inventory-pricing-promos-transfer-edit (2026-08-26)
| Type | ID / Name | Notes |
|---|---|---|
| price_list_items row | Wholesale price list x ZZTEST-SKU-0001 | unit_price 15.777 KWD (3dp), added via UI Add Item dialog |
| promotions row | 634c7cea-2e18-4fbd-b032-6221be69272a `ZZTEST Boundary Promo` | percent_off 100 (boundary), target = ZZTEST-SKU-0001, created via UI to test negative/below-cost price guard |
| stock_transfers row | 5aa0ee56-5678-43ec-81d3-5b7a919fd82d (B1ALRAIMAINS-TRF-?) | draft, Al Rai Main Showroom -> Jahra Branch, 1 line ZZTEST-SKU-0001 qty 3, notes "ZZTEST transfer edit screen test", to exercise the /edit screen |
| 2026-08-26 | Vehicle | ZZTEST-Model 2020-2024 (edited to 2025, then deleted) | id 7186ce55-91ed-44ef-a4a6-ab49c181a655 | inventory-browser-wave agent | create/edit/delete round trip test, audit confirmed for all 3 actions, then deleted |

## Session: 04-pos-registers-shifts (2026-08-26)
| Type | ID / Name | Notes |
|---|---|---|
| pos_shifts row | 604d707b-8c81-4dfa-9bab-56d0569b7048, Shift #1, Register B2FAHAHEELREG1 | opened by cashier1, opening_float 25.500 KWD (3dp), left OPEN at end of session (see findings — currency-resolve crash blocked closing as cashier1; closed by owner, see below) |
| pos_transactions row | B2FAHAHEELBR-POS-B2FAHAHEELREG1-1-00001 | 1x "Brake Disc Rear ACDelco Hyundai Tucson" @ KWD 47.161, cash tender, completed. Real (non-ZZTEST) catalog item used deliberately — a trivial cash sale to exercise shift-close, per scope note (not exploring selling UX). Three-way tie-out confirmed (sale JE + COGS JE both balanced 0.000000). |
| pos_cash_movements rows | pay-in ZZTEST test note + pay-out (reason code) | see findings for amounts/approver |
| pos_shifts close | shift 604d707b closed by owner via denomination blind-close | see findings for expected/actual/variance |

## Session: 04-pos-sale-flow (2026-08-26)
| Type | ID / Number | Notes |
|---|---|---|
| pos_shifts row | Register B1ALRAIMAIREG1, Shift #1, opened by owner, opening_float 50.000 KWD | left open at end of session for further testing |
| pos_transactions row | B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00001 | 2x Brake Disc Front KYB Ford Explorer @ KWD 29.291 = 58.582, cash tender, completed. Three-way tie-out confirmed (sale JE DR Cash 58.582/CR Sales 58.582; COGS JE DR COGS 35.760/CR Inventory 35.760; stock_ledger_entries -2 qty, 35.760 total_cost). Real (non-ZZTEST) catalog item used deliberately for selling-flow exercise per prior session's convention. |
| pos_transactions row | B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00002 | 1x Spark Plug Platinum NGK Kia Cerato @ KWD 3.583, KNET/Card tender, ref ZZTEST-REF-001, completed. Tie-out confirmed (JE Sales 3.583/Bank 3.583; COGS 2.799/Inventory 2.799; stock -1 qty). |
| pos_transactions row | B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00003 | RETURN of 1 unit from transaction -00001 (partial return, qty 1 of 2), cash refund, reason "Defective item". Tie-out confirmed (JE DR Sales Returns 29.291/CR Cash 29.291; DR Inventory 17.880/CR COGS 17.880; stock +1 qty). |
| pos_transactions row | B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00004 | 1x Battery 12V 80Ah Aisin Kia Cerato @ KWD 27.105, cash tender, completed. Used to test double-click Complete Sale debounce (confirmed: only ONE transaction row created despite simultaneous double-click). |
| ATTEMPTED, NOT CREATED | ZZTEST-SKU-0001 zero-amount sale (100%-off leftover promo) | Confirm-zero-amount dialog accepted, then "Complete anyway" always fails client-side (assertSalePayable throws "Cannot complete a sale with no payments") — see finding in 04-pos-sale-flow.md. No DB row created (sale never completed). |

## Session: 04-pos-display-rtl-export (2026-08-26)
| Type | ID / Number | Notes |
|---|---|---|
| pos_transactions row | B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00005 | 2x ZZTEST-Batch Tracked Oil Filter @ KWD 7.500 = 15.000, cash tender KWD 20.000, change due KWD 5.000, completed (offline path). Used to mirror cart on the customer display in a second tab. |
| pos_transactions row | B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00006 | 1x ZZTEST-Batch Tracked Oil Filter @ KWD 7.500, cash tender KWD 10.000, change due KWD 2.500, completed (offline path). Repeated the change-due display test to confirm it reproduces (BroadcastChannel logging used, see findings). |
| ATTEMPTED, cart only, NOT completed | 1x ZZTEST-Brake Pad Set Front Test 2 (ZZTEST-SKU-0001) | Added to cart, auto-applied pre-existing leftover 100%-off "ZZTEST Boundary Promo" (same known finding as prior session), then "Cancel sale" used to clear before any payment attempt — no DB row created. |
| No new writes for gap 2 (ar/en parity) or gap 3 (export) | — | Both gaps used pre-existing data (the sales above + prior sessions' transactions); export is a read-only GET. |

## 2026-08-26 POS fix verification (04-pos-fix-verification.md)
- Shift #3 (id ec522ecf-7947-4b2e-bbf5-8b2956bc3c73) opened by cashier1 on register B2FAHAHEELREG1 (via UI login redirect).
- Draft pos_transaction b4872b2e-d3a2-4a4c-96b7-159de4a04d27 — created accidentally via a manual curl POST to /tenant/pos/transactions while diagnosing item 6 (zero-total sale). status=draft, grandTotal=0, no lines, no JE. Harmless artifact, left in place (draft, no ledger impact).
- Offline sale attempt OFF-B2FAHAHEELREG1-3-1 (ZZTEST-Brake Pad Set Front Test 2, 100% ZZTEST Boundary Promo discount, zero total) — FAILED to sync server-side (Request validation failed / payments.min(1) rejects zero-payment zero-total sale). Left in the failed-sync queue (Void is disabled for cashier1, by design/gap under test — item 10). No DB row created (rejected before insert), no ledger impact.
- pos_transaction ebab5c11-0227-4575-9abf-b4f36854ba7b (B2FAHAHEELBR-POS-B2FAHAHEELREG1-3-00003) — cash sale, Battery 12V 100Ah Exide Honda Civic, KWD 8.332, 5-fils cash rounding tested. Three-way tie-out verified (JE + stock relief).
- pos_transaction 801f4bc6-b156-48c0-a995-7c0c3f430d6a (B2FAHAHEELBR-POS-B2FAHAHEELREG1-3-00004) — KNET sale, Water Pump Mann Mitsubishi Pajero + KWD 3.000 delivery fee added in cart. BUG: delivery fee silently dropped at payment step; completed for KWD 126.266 (fee lost). Evidence for item 14 STILL BROKEN.
- pos_transaction 5f8f407a-c59a-45b7-a09d-447ff1014a1e (B2FAHAHEELBR-POS-B2FAHAHEELREG1-3-00005) — cash sale, Cabin Air Filter KYB Honda CR-V + Floor Mat Set Nissan, KWD 70.000 order discount added in cart (intended total KWD 13.504). BUG: order discount silently dropped at payment step; completed for full KWD 83.504 (customer overcharged KWD 70.000). CRITICAL finding, same root cause as delivery-fee drop.
- ZZTEST-Brake Pad Set Front Test 2 (ce4915ed-f88b-4bdb-8885-77e9b9cef882, pre-existing 100%-off ZZTEST Boundary Promo) used again for qty-stepper keyboard-shortcut check (item 15) alongside Floor Mat Set line; both lines' qty incremented together on one ArrowUp press — SUSPECTED cross-line bug, not fully isolated.
| 2026-08-27 | pos_transactions | 0f429f8e-e721-46c9-8da4-1e866bb22bfa | ZZTEST order-discount+delivery-fee sale, cashier1, B2FAHAHEELREG1 shift #3, cash KWD 9.332 (subtotal 8.332, order discount -1.000, delivery fee +2.000) | A1 verification |
| 2026-08-27 | pos_transactions (attempted, never persisted) | OFF-B2FAHAHEELREG1-3-2 | ZZTEST zero-total sale (100%-off promo on ZZTEST-Brake Pad Set Front Test 2), cashier1, B2FAHAHEELREG1 shift #3 — server 500s on sync (pos-sync.service.ts:1052 empty .values()), never lands as a real row | B1/zero-total re-verification |
- pos_transactions B2FAHAHEELBR-POS-B2FAHAHEELREG1-3-00007 (id fff6ae71-d713-475b-ae2d-2cef8ffb312b) — ZZTEST-Brake Pad Set Front Test 2, zero-total (100%-off) sale, cashier1, register B2FAHAHEELREG1 shift #3. Created to verify DEFECT 1 fix (empty payments array insert crash). 0 payment rows (correct), stock relieved -1, 2 balanced JEs posted.
- pos_transactions B2FAHAHEELBR-POS-B2FAHAHEELREG1-3-00008 (id 2a52b40a-5839-4645-9bc8-02023933ce29) — Battery 12V 100Ah Exide Honda Civic, order discount KWD 2.000 + delivery fee KWD 1.000, card payment ref ZZTEST-REF-001, cashier1 register B2FAHAHEELREG1 shift #3. Created to verify DEFECT 2 fix (receipt now shows explicit Order discount row; Subtotal 8.332 - 2.000 + 1.000 = 7.332 reconciles on the printed/local receipt).
| 2026-08-27 | pos_transactions | 0bfa4e4e-bab1-4b57-a0de-33f9983e3a88 | ZZTEST-Brake Pad Set Front Test 2, single-line 100%-off zero-total sale, cashier1, register B2FAHAHEELREG1 shift #3 | closing-sweep agent |
| 2026-08-27 | pos_transactions | 8c530a29-171e-4048-8b46-403cce49d00a | Battery 12V 100Ah Exide, order discount 1.000 + delivery fee 8.000, cashier1, register B2FAHAHEELREG1 shift #3 | closing-sweep agent |

## 04-pos-tooltip-and-gaps (2026-08-27)
- POS offline sale, receipt `OFF-B2FAHAHEELREG1-3-1`, register B2FAHAHEELREG1, Shift #3, cashier1, cash tender KWD 365.602 (5 lines: Battery 12V 100Ah ACDelco Toyota Corolla, Alternator 90A Valeo Ford Explorer, Timing Belt Toyota Genuine Kia Sportage, Cabin Air Filter ACDelco Nissan X-Trail, Brake Disc Rear ACDelco Hyundai Tucson). Created while offline-mode UI was showing (API briefly flapped during test). Will sync automatically.
- Cash drawer movement: Pay In KWD 10.500, reason "ZZTEST float top-up", Shift #3, register B2FAHAHEELREG1, cashier1.
- Cash drawer movement: Pay Out KWD 5.250 ATTEMPTED, NOT completed — register B2FAHAHEELREG1 has manager-approval-for-payout enabled; cashier1 cannot supply a manager PIN, so the dialog was cancelled before Confirm. No DB row created.

## 04-pos-cashier-close-verification (2026-08-27)
- pos_transaction d427d944-b2d6-43fe-bde7-2df6b4edb5cc — Floor Mat Set Nissan Genuine Hyundai Sonata x2, cash KWD 12.626, cashier1, register B2FAHAHEELREG1, Shift #3 (id ec522ecf-7947-4b2e-bbf5-8b2956bc3c73). Two balanced JEs (inventory.sale + pos.transaction.completed), stock relieved.
- Cash drawer movement: Pay In KWD 5.500, reason "ZZTEST float top-up", Shift #3, cashier1.
- Cash drawer movement: Pay Out KWD 3.250 ATTEMPTED, NOT completed — register requires manager approval for payouts; cashier1 has no manager PIN. Dialog cancelled before Confirm, no DB row created.
- Shift #3 (id ec522ecf-7947-4b2e-bbf5-8b2956bc3c73) CLOSED by cashier1 — opening_float 50.000, expected_cash 592.833, counted (actual) cash entered 77.500 (deliberately mismatched to exercise variance calc), cash_over_short -515.333 (Short). This is the primary object of the verification: cashier1 closed the shift with NO owner/manager involvement.
- Z-report for this shift viewed and rendered successfully at /en/pos/shifts/ec522ecf-7947-4b2e-bbf5-8b2956bc3c73/z-report (previously 409'd forever per task brief).
- supplier 9151cc3f-785c-47d5-85fb-7736cf91f97c SUP-0001 'ZZTEST Auto Parts Supplier' — created via UI as owner, Al Rai branch. Name-only required, code auto-assigned SUP-0001.

## Session: 05-purchase-live-cycle order path (2026-08-27)
| Type | ID / Number | Notes |
|---|---|---|
| purchase_orders row | eaa85434-8fd2-4729-b177-f33f0e3be20b, B1ALRAIMAINS-PO-00001 | Supplier ZZTEST Auto Parts Supplier (SUP-0001), Al Rai Main Showroom, 1 line Battery 12V 80Ah Aisin Kia Cerato qty 10 @ KWD 5.500 = KWD 55.000, confirmed by owner (HB). No manager approval required. |
| grns row | 9cf24e76-89e0-49b0-a9cb-c402e0ac4a23, B1ALRAIMAINS-GRN-00001 | First GRN ever in this tenant. Against PO B1ALRAIMAINS-PO-00001, supplier SUP-0001, Al Rai. Qty 10 @ 5.500 = KWD 55.000, status confirmed. JE B1ALRAIMAINS-JRN-00023: Dr 1141 Merchandise Inventory 55.000 / Cr 2121 GRN Accrual 55.000. Created by owner (HB). |
| purchase_invoices row | 6c405e11-df85-46ae-90e5-302414e1558b, B1ALRAIMAINS-PINV-00001 | First supplier bill ever. Created from GRN-00001 via "Create bill", confirmed by owner. KWD 55.000. JE B1ALRAIMAINS-JRN-00024: Dr 2121 GRN Accrual 55.000 / Cr 2111 Trade Payables 55.000 (party-tagged). |
| landed_costs row | 99718bde-987a-4523-9a0f-63a549c7e105, B1ALRAIMAINS-LC-00001 | First landed cost ever. Component "ZZTEST Freight" KWD 10.005, by_value, credit Accounts payable, supplier SUP-0001. Target GRN-00001. Posted. JE B1ALRAIMAINS-JRN-00025: Dr 1141 10.005 / Cr 2111 10.005. Cost pool for item 68a447c3 -> on_hand 36, total_value 553.987, avg 15.388528. |
| supplier_payments row | 0ecfeb3d-a9fc-4423-aeaf-446a58df4582, B1ALRAIMAINS-PAY-00001 | First supplier payment ever. Cash KWD 55.000 against PINV-00001, posted immediately (no draft). JE B1ALRAIMAINS-JRN-00026: Dr 2111 Trade Payables 55.000 (party-tagged) / Cr 1112 Cash Register 55.000. |
| direct_purchases row | 6afa5f52-764a-4a6e-a182-4c401561a873, B1ALRAIMAINS-DPU-00001 | First direct purchase ever. ZZTEST-SKU-0001 qty 3 @ KWD 2.505 = 7.515, paid now cash. Atomically created GRN e3517703 (JRN-00027), bill 1ee537be / B1ALRAIMAINS-PINV-00002 (JRN-00028) and payment 0df30d64 (JRN-00029). Status paid. |
| purchase_returns row | 03f6a690-0cb3-4067-9763-e179015cb66b, B1ALRAIMAINS-PR-00001 | First purchase return ever. Against GRN-00001, qty 2 @ 5.500 = KWD 11.000, reason "ZZTEST damaged on arrival", confirmed. JRN-00030: Dr 2121 GRN Accrual 11.000 / Cr 1192 Purchase Return Clearing 11.000. JRN-00031: Dr 5210 Purchase Price Variance 19.777 + Dr 1192 11.000 / Cr 1141 Merchandise Inventory 30.777. Cost pool -> on_hand 34, total_value 523.209944. |
| purchase_returns VOID (authorised remediation) | 03f6a690-0cb3-4067-9763-e179015cb66b, B1ALRAIMAINS-PR-00001 | Voided by owner via UI (POST .../void -> 200), reason "ZZTEST verify money fix - re-raise after void". Legacy fallback posted JRN-00032: Dr 1192 11.000 / Cr 2121 11.000 (exact contra of JRN-00030). JRN-00033: Dr 1141 30.777 / Cr 1192 11.000 / Cr 5210 19.777. Stock re-received 2 units BUT at GRN unit cost 5.500 (total 11.000), not 15.388528 -> GL 1141 and item_cost_pools now differ by 19.777. |
| purchase_returns row | 0ccefa5f-b1b0-42af-b10b-6d117bf15164, B1ALRAIMAINS-PR-00002 | Re-raised return against GRN-00001 line, qty 2 @ 5.500 = KWD 11.000. POST /purchase/returns -> 201. Money fix VERIFIED: JRN-00034 Dr 2111 Trade Payables 11.000 / Cr 1192 11.000; refundable_amount 11.000000; matched_breakdown {line: "1.000000"} (fully matched). JRN-00035: Dr 1192 11.000 + Dr 5210 18.678 / Cr 1141 29.678. |
| supplier_payments row | bf0bb3fc-2699-41b1-8fb2-b2cf8433be39, B1ALRAIMAINS-PAY-00003 | Created by accountant1 via UI (POST -> 201) to prove the accountant can now post a payment. Advance, cash, KWD 1.234, ref "ZZTEST accountant advance". JRN-00036: Dr 1161 Supplier Advances 1.234 / Cr 1112 Cash Register 1.234. |
| direct_purchases row | 404a2880-820a-47f6-a14e-7affeb912d79 | ZZTEST regression direct path. ZZTEST-SKU-0001 qty 3 @ KWD 2.505 = 7.515, paid now cash. JRN-00037 Dr 1141 7.515 / Cr 2121 7.515; JRN-00039 Dr 2121 7.515 / Cr 2111 7.515; JRN-00038 Dr 2111 7.515 / Cr 1112 7.515. Identical to DPU-00001 -> no regression. |
| purchase_orders row | 97d871af-dddb-4825-9808-78e20ae988a9, B1ALRAIMAINS-PO-00002 | ZZTEST regression order path. ZZTEST-SKU-0001 qty 3 @ KWD 1.000 = 3.000. Created (201) then confirmed (200). No GL at PO stage (correct). |
| grns row | 27105fcb-ab64-4ff1-98d7-1ee9eae6c04d, B1ALRAIMAINS-GRN-00004 | Receipt of PO-00002, qty 3 @ 1.000. JRN-00040: Dr 1141 Merchandise Inventory 3.000 / Cr 2121 GRN Accrual 3.000. Balanced, matches pre-fix order-path pattern -> no regression. |
| purchase_invoices row | 53e1293a-fc94-495d-b4d2-acae640c9481, B1ALRAIMAINS-PINV-00004 (was DRAFT-04c0171f-873f-44a6-aab0-787aec15b0ad) | Bill created from GRN-00004 via "Create bill" (lands as a DRAFT whose visible number is a raw UUID), then confirmed (200). JRN-00041: Dr 2121 GRN Accrual 3.000 / Cr 2111 Trade Payables 3.000. A 6dp unit-cost edit (0.999889) typed into the line was silently discarded; the bill posted at 1.000000. |
| grns row (side effect) | 342a82f6-4ec2-4dbd-80ec-8df643b8ba37, B1ALRAIMAINS-GRN-00003 | Auto-created by direct purchase 404a2880 (atomic direct path). Not created directly. |

## Session: 05-purchase-final-verification (2026-08-28)
| Type | ID / Number | Notes |
|---|---|---|
| direct_purchases row | b0ac0164-674d-4ed8-bf66-bc67426c2630 | ZZTEST dup-trap probe. ZZTEST-SKU-0001 qty 2 @ KWD 1.250 = 2.500, paid now cash. idempotencyKey 203dc898-82f9-4176-b149-5c8126035b52. First POST 201 in 86.4s; identical replay POST returned 200 `replayed:true` with the SAME ids. Exactly 1 DB row. Atomic children: GRN-00005, PINV-00005, PAY-00004. JRN-00042 Dr 1141 2.500 / Cr 2121 2.500; JRN-00043 Dr 2121 2.500 / Cr 2111 2.500; JRN-00044 Dr 2111 2.500 / Cr 1112 2.500. |
| purchase_orders row | 893bf149-82c3-4b79-8427-11cc1aeb27d8, B1ALRAIMAINS-PO-00003 | ZZTEST final-verify order path. ZZTEST-SKU-0001 qty 2 @ KWD 1.250. Created draft (201) then confirmed (200). No GL at PO stage. |
| grns row | fdadce97-48d1-406e-b954-9dc225b678fc, B1ALRAIMAINS-GRN-00006 | Receipt of PO-00003 created through the UI. Save receipt pressed TWICE while the first POST was still in flight (buttons are not disabled during a pending mutation) -> second POST replayed on the same idempotency key, exactly ONE grns row. JRN-00045: Dr 1141 2.500 / Cr 2121 2.500. |
| purchase_invoices row | e5ff947b-b7e5-49ca-9f1c-c51c73f2ee80, B1ALRAIMAINS-PINV-00006 | Bill from GRN-00006 via "Create bill" (lands as DRAFT-1dbc2dae...). Unit cost edited to 6dp 0.999889 -> rounded to 1.000 with a visible "Rounded to KWD 1.000" notice; stored unit_price 1.000000. Confirmed (200). JRN-00046: Dr 2121 2.500 / Cr 2111 2.000 / Cr 5210 PPV 0.500. |
| 2026-08-28 | purchase_return | B1ALRAIMAINS-PR-00008 | aedc33de-8e18-4c92-9031-1c3917278571 | bill-linked return vs PINV-00001, qty 2, 11.000, refundExcess path | 05-purchase-closing-pass-2 |
| 2026-08-28 | supplier_refund_receipt | B1ALRAIMAINS-SRR-00001 | 49456d7d-cd61-4c5a-83ab-e80a116b95f2 | FIRST EVER supplier refund receipt. 11.000 cash vs PR-00008. JRN-00049: DR 1111 Petty Cash 11.000 / CR 2111 Trade Payables 11.000 (party-tagged). | 05-purchase-closing-pass-2 |
| 2026-08-28 | grn_cost_correction | c1da2041-bf7a-4cb2-b7ce-71f075a75a83 | GRN-00006 line, 1.250 -> 1.375, reason "ZZTEST forced failure check". Landed server-side (201) but the UI showed "Could not save this correction" because the client aborted at 30s. | 05-purchase-closing-pass-2 |
| 2026-08-28 | supplier | ZZTEST F3 Supplier Busy | b5dc9162-b0c0-4ca4-b1e9-d3dc63b21a82 | created to exercise F3 submit-busy on supplier create | 05-purchase-closing-pass-2 |
| 2026-08-28 | supplier | ZZTEST F3 Supplier Busy2 | 4aa2ef16-1e34-4ed4-b0e8-d6316704a75f | second supplier create, F3 timing probe | 05-purchase-closing-pass-2 |
| 2026-08-28 | purchase_invoice (auto) | B1ALRAIMAINS-PINV-00007 | issued automatically by the GRN cost-correction amend saga; PINV-00006 voided. JRN-00051 void, JRN-00052 correction delta 0.250, JRN-00053 new bill 2.750. | | 05-purchase-closing-pass-2 |
| 2026-08-28 | purchase_order | B1ALRAIMAINS-PO-00004 | b33e7119-c074-46e2-a868-f95d9a71fc8b | ZZTEST PO, ZZTEST-SKU-0001 qty 4 @ 2.125 = 8.500. Created + confirmed as owner to unblock route 88 (/purchase/orders/:id/edit). CANCELLED by the amend below. | phase-D-closeout |
| 2026-08-28 | purchase_order | B1ALRAIMAINS-PO-00005 | cc817c39-d6b5-4517-95bc-61caaf0c518f | replacement order issued by the route-88 amend saga (qty 4 -> 5, 10.625), confirmed. Amend emitted a `document.amended` outbox row that dead-lettered (see PUR-064). | phase-D-closeout |
| 2026-08-28 | purchase_invoice | B1ALRAIMAINS-PINV-00008 | 99af93df-27a9-4b43-a80d-12e4aeeb6489 | ZZTEST direct bill, 1 line 1.000. Created as draft to browser-verify PUR-034 F2: 6dp 0.999889 -> "Rounded to KWD 1.000" notice shown, then confirmed in a second tab so the stale tab's next line edit failed server-side. | phase-D-closeout |
| 2026-08-28 | sales_customers | ZZTEST Live Cycle Customer (CUST-0501) | 1de0e028-4587-45b9-bcdb-18b49f2155fc | sales live-cycle test (wave E) |
| 2026-08-28 | sales_invoices (direct sale) | B1ALRAIMAINS-INV-00001 | 666ae8b7-c8c5-4a90-9d23-2e1f1d6a50d4 | ZZTEST direct/express sale, ZZTEST Live Cycle Customer, 1x ZZTEST-SKU-0001 @ 12.345 KWD paid cash. Verified: JRN-00056 (AR/rev), JRN-00057 (COGS/inv) both posted+balanced, stock relief -1 qty, receipt RV-00001 posted. |
| 2026-08-28 | sales_receipt_vouchers | B1ALRAIMAINS-RV-00001 | ccebabb9-8794-4bce-bb79-0a8ccbf1e7d0 | auto-created by the direct sale above (paid now / cash) |
| 2026-08-28 | sales_orders | B1ALRAIMAINS-SO-00001 | 191f9ac1-221b-4ba0-a9ec-5bf990319c28 | ZZTEST SO chain test, ZZTEST Live Cycle Customer, 1x ZZTEST-SKU-0001 @ 12.345. Created draft, confirmed. |
| 2026-08-28 | sales_invoices (SO chain) | B1ALRAIMAINS-INV-00002 | 7fad4cb0-6add-4f3e-8a75-70829d76e7b3 | converted from SO-00001, confirmed. JRN-00058 (AR/rev) + JRN-00059 (COGS/inv) posted+balanced. Stock relief -1 qty. |
| 2026-08-28 | sales_receipt_vouchers | B1ALRAIMAINS-RV-00002 | 8fef730d-8f9f-439d-9a4b-59b39af64265 | payment against INV-00002, full balance, cash, posted |
| 2026-08-28 | sales_receipt_vouchers (DRAFT, never posted) | DRAFT-… | f6696e82-b7a2-4a66-ac5f-061fa85ea992 | ZZTEST SAL-01 quantisation proof: posted 6dp amounts (total 10.0035, allocation 5.0015) via API; persisted quantised to KWD 3dp (10.004 / 5.002). Left as a DRAFT — no GL impact, no discard endpoint exposed. Ledger identity re-checked 0.000000. |
| 2026-08-28 | sales_orders | B1ALRAIMAINS-SO-00002 | 1a355d73-c0a5-4f26-893a-1bcf67e0a6c8 | fix-verification for HIGH-1/MEDIUM-1: customer Ahmad Al Mutairi 1, 1x ZZTEST-SKU-0001 @ 12.345. Created, confirmed, converted to invoice. |
| 2026-08-28 | sales_invoices | B1ALRAIMAINS-INV-00003 | 501dd91f-77c0-430c-a4fd-9a8e6386e3d2 | converted from SO-00002, confirmed. Used to verify MEDIUM-1 draft-title/breadcrumb fix and HIGH-1 post-payment live-refresh fix (no manual reload). |
| 2026-08-28 | sales_receipt_vouchers | B1ALRAIMAINS-RV-00003 | 83835c08-af29-4cfc-b5a3-5045a94a005b | payment against INV-00003, full balance 12.345, cash, posted. HIGH-1 verification: invoice detail page updated to Paid 12.345/Balance 0.000 and the receipt row without a manual reload. |
| 2026-08-28 | sales_credit_notes (DRAFT, unconfirmed, no GL/stock impact) | DRAFT-… | 95e69123-59d8-4823-9733-7018f93a2a33 | goods return against INV-00003, 1x ZZTEST-SKU-0001, reason "ZZTEST test". Left as a draft (never confirmed — no manager PIN available). Used to verify MEDIUM-1 (breadcrumb/title show "New credit note", not the raw DRAFT-uuid) and to re-confirm HIGH-2 (approver picker still shows "Team member" x3 — frontend code already correctly wired to the names-only directory, root cause traced to the directory response itself, out of this session's file boundary). |

## Session: 06-sales-fix-verification (2026-08-28)
| Type | ID / Number | Notes |
|---|---|---|
| sales_orders | 5d194c53-9dc1-447d-8bd2-7dda59a2608f, confirmed as B1ALRAIMAINS-SO-00003 | ZZTEST order created by owner (1x ZZTEST-SKU-0001 @ 12.345), confirmed, used to reach the sales-order EDIT permission gate as accountant1 (VERIFY 1). Left confirmed, not edited/cancelled. |
| sales_receipt_vouchers | 02873e15-85c4-4e72-812a-346686b96757, B1ALRAIMAINS-RV-00004 | Real payment (not ZZTEST — collecting against a genuine opening-balance AR invoice, not editing/voiding it) against opening-balance invoice OB-OB_AR-0001-176 (customer Mohammed Al Fadhli 280), cash, KWD 31.601, posted by owner. Used to verify SAL-01 receipt-quantisation fix (VERIFY 3): allocation 31.601000, invoice balance movement 31.601000, JE B1ALRAIMAINS-JRN-00064 both legs 31.601000 — all agree to 3dp; ledger identity re-confirmed 0.000000 before and after. |
| sales_customers (bulk deactivate) | CUST-0182 (Al-Mutairi Car Care 182), CUST-0410 (Mohammed Al Shammari 410) → inactive | Deactivated via bulk "Set status" alongside CUST-0454 (blocked). Real customers, status-only change, no other field edited. Used to verify VERIFY 4 (customer bulk-deactivate blast-radius guard, partial-success). |
| sales_customers (blocked, unchanged) | CUST-0454 (Abdullah Al Ajmi 454) | Bulk deactivate correctly refused (1 open unpaid invoice, KWD 3,390.748) — stayed Active in DB. Also re-tested via single-customer "Deactivate" action on the detail page (same block, same guard). |
| sales_invoices (DRAFT, never confirmed) | eb875afe-a541-4510-9f31-df662677339e, DRAFT-4953bb68-70b7-4ed5-85a1-87cb0da887d1 | ZZTEST draft invoice, Ahmad Al Mutairi 1, 1x ZZTEST-SKU-0001 @ 12.345. Created by owner to verify VERIFY 5 (draft invoice title/breadcrumb show "Draft invoice" / "مسودة فاتورة" — fixed) but the invoices LIST ROW still shows the raw DRAFT-uuid as the invoice number (NOT fixed there). Left as an unconfirmed draft, no GL/stock impact. |
| B1ALRAIMAINS-DSL-00002 / INV-00004 | direct sale + invoice | 2026-08-29 | accountant1 | ZZTEST Live Cycle Customer, 12.345 KWD on credit, Al Rai | reserved for VOID test |
| B1ALRAIMAINS-DSL-00003 / invoice df467cdc-87de-486b-8f73-083d8eb4c50c | direct sale + invoice | 2026-08-29 | accountant1 | ZZTEST Live Cycle Customer, qty 2 x 12.345, 24.690 KWD on credit, Al Rai | reserved for partial credit-note test |
| CN 6290aefa-d4b2-4976-abe1-a53788c682b1 | credit note (goods return, partial, qty 1 of 2) | 2026-08-29 | owner | against B1ALRAIMAINS-INV-00005, 12.345 KWD | reversal-path test |

## Session: 06-sales-closing-verification-2 (2026-08-29)
| Type | ID / Number | Notes |
|---|---|---|
| sales_receipt_vouchers | d3165b68-2059-4c49-9338-16616d0026e3, B1ALRAIMAINS-RV-00005 | Payment against ZZTEST invoice B1ALRAIMAINS-INV-00005 (customer ZZTEST Live Cycle Customer), full remaining balance 12.345 KWD, cash, posted as owner. Used to verify item 6 (DRAFT-uuid sweep) on the Receipts panel and item 2/HIGH-1 live-refresh. Ledger identity 0.000000 before/after. |
| sales_receipt_vouchers (DRAFT, not posted, kept for item 8 test) | 5f8839c2-7f1f-4142-8a00-b7e90a2b9e28 | Real partial payment (not ZZTEST — collecting 1.000 KWD against genuine opening-balance AR invoice OB-OB_AR-0001-205, customer Al-Dosari Auto Center 323, CUST-0323), cash, Al Rai branch, created via standalone /sales/payments/new as owner. Left as DRAFT deliberately to verify item 6 (toast "Payment Draft recorded" clean, no raw uuid; page title "New payment (draft)" clean) and item 8 (Discard button negative-case testing: cashier1 must not see it; must disappear once posted/reversed). Not posted yet as of creation.

## Session: 06-sales-browser-verify-cashier-print (2026-08-29)
| Type | ID / Number | Notes |
|---|---|---|
| user_approval_pins row | cashier1, PIN 1234 | First-ever PIN set for cashier1 via UI self-service (Settings > Approval PINs). No GL impact. Used to verify item 1 (PIN self-service reachability + overwrite guard). Ledger identity re-confirmed 0.000000 before and after. |

## Session: 08-reports-live-gap-closure (2026-08-29)
Purpose: create the rows that were missing from this tenant so the Reports-phase money fixes
RPT-019 / RPT-023 / RPT-026 / RPT-020-021-021b could be proven against LIVE data instead of code.
Ledger identity `round(sum(debit-credit),6)` = 0.000000 BEFORE (868 lines) and AFTER (889 lines).
No pre-existing document was voided, deleted or edited. Opening-balance journals untouched.

| Type | ID / Number | Notes |
|---|---|---|
| pos_transactions | `B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00007` (4f90dd77-a016-4fb8-a338-ec53e8efeaa8) | GAP 1. ZZTEST cash sale, 1x Water Pump Monroe Honda Accord @ KWD 36.804, owner cashier, shift 39eda92f (B1ALRAIMAIREG1 #1), created via POST /tenant/pos/sync/transactions. **Then VOIDED by me** (reason "ZZTEST void for RPT-019 live verification"). First voided POS transaction in the tenant. notes carry ZZTEST. |
| pos_transactions | `B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00008` (6bb80913-b660-48ce-a6db-1f4b8383b4a4) | GAP 2. ZZTEST **on-account** POS sale, 2x Spark Plug Platinum Denso Chevrolet Tahoe @ KWD 66.634 = 133.268, customer CUST-0015 Jassim Al Rashid 15. Left COMPLETED on purpose — voiding it would destroy the mirror-invoice row the programme needs. Adds KWD 133.268 to that customer's AR. |
| sales_invoices (POS AR mirror) | `POS-AR-B1ALRAIMAINS-POS-B1ALRAIMAIREG1-1-00008` (cc729831-a45e-4b7f-99ca-c9e766f6fa10) | GAP 2, auto-created by the on-account sale above. First and only row with `pos_transaction_id IS NOT NULL` in the tenant. Not created directly by me. |
| sales_invoices | `B1ALRAIMAINS-INV-00006` (cbc740e6-d641-4118-bbb4-2daedda7a3ba) | GAP 3. ZZTEST invoice WITH a delivery fee: 1x Lower Control Arm Valeo Mitsubishi Pajero KWD 57.916 + delivery_fee_net KWD 10.000 = total 67.916, salesperson 48123301 (cashier1), customer CUST-0018. Confirmed. First non-zero `delivery_fee_net` in the tenant. |
| sales_invoices | `B1ALRAIMAINS-INV-00007` (0073ab40-44e1-40a9-95a8-ca02db060187) | GAP 4. ZZTEST **foreign-currency** invoice: AED 1000.00 @ exchange_rate 0.0835 -> total_fn KWD 83.500, 1x Alternator 90A Exide Toyota Prado (price override), salesperson bfdf55a3, customer CUST-0042. Confirmed. First non-1 exchange rate in the tenant. Multi-currency was ALREADY enabled on `currency_policies` (AED + SAR already active in `tenant_currencies`) — no config change was made. |

Not created / not touched: no shift was opened or closed (shift 39eda92f left OPEN exactly as found —
closing it would have written a cash-variance JE against a pre-existing shift).
- ZZTEST accounts 1699.01, 1699.02 (Account, code, tenant gulf-auto-parts) — created via POST /tenant/accounts/bulk to verify AUDIT-002 (before/after fix). No GL postings, no journal lines. Phase F (accounting coa/mappings).
| 2026-08-30T02:54:23Z | cheque | ZZTEST-CHQ-0001 | f3a930d0-de71-4534-b4a1-67ef8950a236 | incoming, 50.000 KWD, testing lifecycle+bounce | accounting agent |
| 2026-08-30 | ExchangeRate | AED/KWD closing 0.0900 @ 2026-08-31 (id 17731d33-db7e-48e3-bc7d-d3bcc1dc5ce3) | FX agent (Phase F) | created via API to exercise revaluation; tenant had zero rates |
| 2026-08-30 | JournalEntry | B1ALRAIMAINS-JRN-00087 (event_id 7b4316b6-eab9-547a-b0cc-eaaddb8be4ed), FX revaluation 2026-08-31 | FX agent (Phase F) | 4 lines. AR 1131 gain 6.500 correct; ALSO contains SPURIOUS 4110 credit 6.500 + 7220 debit 6.500 (CRITICAL-2). Its auto-reversal DEAD-LETTERED (CRITICAL-1) so it will never reverse. EXCLUDE this event_id from revenue tie-outs. |
| 2026-08-30T03:03Z | bank_statement | ZZTEST dup-match repro line X | 76efb261-c81a-436f-b37b-40d9c151a12f | draft, KWD 3.583, holds live double-match repro (line 4dd16648) — LEAVE IN PLACE as evidence for finding #2 | accounting agent |
| 2026-08-30T03:03Z | bank_statement | ZZTEST dup-match repro line Y | 6c065fd6-04b1-4afa-a2e0-41a2e5c90ee4 | draft, KWD 3.583, holds live double-match repro (line a061226a) — LEAVE IN PLACE as evidence for finding #2 | accounting agent |

## Phase F — Accounting journals/reversals (agent: journals-reversals)
| Doc | Id | State | Note |
|---|---|---|---|
| JE draft "ZZTEST unbalanced probe" | (rolled back) | never created | 500 from DB CHECK jel_amount_required_check; tx rolled back, no orphan |
| JE draft "ZZTEST unbalanced probe 2" | 6203133e-97af-4024-ba33-9dc85304ee25 | DELETED by me | deliberately unbalanced 10 vs 3; post refused by DB CHECK; draft deleted |
| JE B1ALRAIMAINS-JRN-00085 "ZZTEST maker-checker probe" | cd73749e-c29f-4a2b-b145-49823c336630 | reversed | 12.345 KWD rent/petty cash; created+posted by accountant1 alone |
| JE B1ALRAIMAINS-JRN-00086 (reversal of 00085) | f16c1ffb-0a27-48c7-abf6-740baa035435 | posted | exact mirror, nets to zero |
| JE B1ALRAIMAINS-JRN-00088 "ZZTEST branch visibility probe" | 84ef32bd-8409-45a9-9726-c70fd20efddb | posted | 33.333 KWD rent; LEFT POSTED as evidence for ACC-JE-001 |
| 2026-08-30T03:05:02Z | cheque | ZZTEST-CHQ-0002 | cb7cff7e-bc1e-4823-949b-df476af7b493 | incoming, 25.000 KWD, on_account settlementMode, testing deposit+bounce blast radius | accounting agent |
| 2026-08-30 | Accounting (periods/closing agent) | Manual JE | JRN-00001 (f6d3c88b-2832-4be9-88d1-af701871b4c5) | Dr 1111 / Cr 1112 1.500 KWD, dated 2026-07-15 | posted then REVERSED by JRN-00002. Baseline for the period-gate probes. |
| 2026-08-30 | Accounting (periods/closing agent) | Manual JE (reversal) | JRN-00002 (082c6872-2f88-4b30-84d0-654d92cf5770) | 1.500 KWD, dated 2026-08-30 | reversal of JRN-00001; nets to zero |
| 2026-08-30 | Accounting (periods/closing agent) | Manual JE drafts x4 | 3f31ab15-540f-4847-be11-0cf77848b30e, 3b99273d-f204-448d-8726-7b0eeecfa7e6, 0504b749-3da3-4b49-b9ba-340043f4bc8d, 52dc86ed-bee9-4b6f-b67d-eee05df52541 | 1.500 KWD each, dated 2026-07-16/17/18 and 2026-06-10 | LEFT AS DRAFTS on purpose: they are the fixtures every soft/hard-lock posting probe was fired at. Never posted, zero GL impact. Safe to delete. |
| 2026-08-30 | Accounting (periods/closing agent) | Close checklist template | 298efc86-ca86-4403-a8fc-05a56066c0f5 | - | "Monthly Close" default, seeded via API. DUPLICATE of the one below (finding F-02: seed-default is not idempotent). Shadowed by the newer one. |
| 2026-08-30 | Accounting (periods/closing agent) | Close checklist template | 3184ddb4-8f2d-44d1-8a54-44a2474261cb | - | "Monthly Close" default, second seed. This is the ACTIVE one run generation resolves. |
| 2026-08-30 | Accounting (periods/closing agent) | Close run (Jul 2026) | 95253a96-30cf-4c19-8f23-e4f904b0527d | - | status COMPLETE. 7 tasks completed by accountant1, 3 review-required tasks approved by owner. Left complete: it is the evidence for the maker-checker verification (F-V2). |
| 2026-08-30 | Accounting (periods/closing agent) | Opening-balance import runs (staged, never applied) | 55227b33-56f8-46a5-9de0-e4a64a44f2c0, 4e86b878-2efb-4f70-bb49-282d9085070e | - | upload+validate only, apply never called. Zero GL impact. |

**Period state left exactly as found:** all 24 fiscal periods `open`, `status_before_close`
NULL, FY2025 and FY2026 both `is_closed = f`. Jul 2026 was soft-locked then hard-locked then
unlocked during testing and is back to `open`. Ledger identity 0.000000 before and after.

### Phase F — Accounting AR/AP/tax agent (2026-08-30)

| Date | Module | Doc type | Doc number | Amount | Notes |
|------|--------|----------|------------|--------|-------|
| 2026-08-30 | Accounting AR/AP | Customer | CUST-0502 "ZZTEST AR Seam Customer" (59feeae1-0649-46fd-b0dd-870a0c012112) | - | aging bucket-boundary probe |
| 2026-08-30 | Accounting AR/AP | Sales invoice | B1ALRAIMAINS-INV-00008 | KWD 10.000 | due 2026-08-30 (age 0) → `current` |
| 2026-08-30 | Accounting AR/AP | Sales invoice | B1ALRAIMAINS-INV-00009 | KWD 10.000 | due 2026-07-31 (age 30) → `days1To30` |
| 2026-08-30 | Accounting AR/AP | Sales invoice | B1ALRAIMAINS-INV-00010 | KWD 10.000 | due 2026-07-30 (age 31) → `days31To60` |
| 2026-08-30 | Accounting AR/AP | Receipt voucher (DRAFT, never posted) | eabd376e-96b0-42cb-94c5-a5fcbf0572eb | KWD 20.000 | deliberate over-allocation; post REJECTED 422. Left as draft, zero GL impact |
| 2026-08-30 | Accounting AR/AP | Receipt voucher (posted) | 272f0c4f-9a17-43b9-b9d6-8b5bc458a0d9 | KWD 4.000 | allocated to INV-00008; JE B1ALRAIMAINS-JRN-00096 |

| 2026-08-30 | Accounting Cheques (Phase F fix) | Cheque ZZTEST-CHQ-0003 (received to deposited to bounced) | 77310dff-0502-4369-98c9-551e93163cff | KWD 50.000 | on_account; verifies BUG A fix. JEs JRN-00097/98/99 all posted and balanced, lifecycle nets to zero |
| 2026-08-30 | Accounting Bank Rec (Phase F fix) | Bank statement "ZZTEST dup-match refusal probe Z" | bcabdbe3-9c26-46cd-9589-4415c52f4221 | KWD 3.583 | verifies BUG B fix: duplicate match refused 409 BANK_JEL_ALREADY_MATCHED; control match against a free JEL returned 200 |

| 2026-08-30 | Accounting Journals (Phase F fix) | Manual JE B1ALRAIMAINS-JRN-00100 (posted) | ac40b227-2ada-4f76-9ec3-99b71567d194 | KWD 20.000 | verifies BUG A fix: FIRST manual JE whose LINES carry the header branch (Al Rai). Moved the Al Rai-filtered P&L rent from -12.345 to +7.655, delta exactly 20.000 |
| 2026-08-30 | Accounting Journals (Phase F fix) | Manual JE (DRAFT, never posted) "ZZTEST unbalanced post gate" | 1d9928d9-a504-4dd1-8dea-601d486ff8d8 | KWD 10.000 vs 3.000 | deliberate 10-vs-3. Draft creation still ALLOWED (autosave); POST now refused 400 JOURNAL_UNBALANCED_TRANSACTION_CURRENCY instead of a bare 500. Accounts for the draft-bucket imbalance of 7.000000 |
| 2026-08-30 | Accounting Journals (Phase F fix) | Manual JE B1ALRAIMAINS-JRN-00101 (posted, then reversed) | dab16f5b-d6f9-4894-afad-88b22b69dffe | KWD 5.000 | verifies BUG C fix: the ORIGINAL now carries create -> update(post) -> update(posted->reversed) |
| 2026-08-30 | Accounting Journals (Phase F fix) | Reversal JE B1ALRAIMAINS-JRN-00102 | 68c735cc-f87e-4fb9-9070-5f27449bc963 | KWD 5.000 | reversal of JRN-00101; nets to zero. Verifies BUG D: reverse/amend blocks now return code IS_A_REVERSAL, not code:null |

Ledger identity (status-aware) 0.000000 before first write and after last write.
Nothing pre-existing was voided, edited or reversed. The 4 OB journals untouched.

### Phase F — lead agent live fix-verification (2026-08-30, post-rebuild)

| Date | Module | Doc type | Doc number | Amount | Notes |
|------|--------|----------|------------|--------|-------|
| 2026-08-30 | Settings/RBAC | Role | "ZZTEST Audit Probe 1788061862" (836e1cfd-c97e-4fc1-b0e8-90df27cacc07) | - | verifies the audit-interceptor fix writes a real entity_id + actor. Audit row confirmed. |
| 2026-08-30 | Sales AR | Receipt voucher (posted) | B1ALRAIMAINS-RV-00008 (15547240-aac1-4c7a-8347-c0bea6f1c4ac) | KWD 1.000 | allocated to INV-00008 (due 2026-08-30). **Verifies ACC-ARAP-001**: settlement leg on 1131 now carries due_date 2026-08-30; cash leg 1112 correctly NULL. JE B1ALRAIMAINS-JRN-00103. |

Posted-ledger identity 0.000000 before and after. The 4 OB journals untouched (verified pristine:
created_at = updated_at, all still posted).
| 2026-08-30 | Accounting/Cheques | Cheque (on_account, incoming) | ZZTEST-CHQ-VERIFY-075753 (b2cc02d2-e57c-443e-b3d7-e556290503b3) | KWD 7.500 | **Verifies ACC-CHQ-001 fix live**: outbox event `completed` (was dead_letter forever); JE B1ALRAIMAINS-JRN-00104 now exists, DR 1134 / CR 2151, and 2151 correctly carries NO party. |
| 2026-08-30 | Accounting/FX | Exchange rate (closing) | AED/KWD 2026-08-30 @ 0.0870000000 (9ad7040a-9ba2-4172-a641-aa4936e8009d) | - | ZZTEST rate created to drive a FRESH revaluation end to end after the reversal account-mapping fix. |
| 2026-08-30 | Accounting/FX | FX revaluation JE | B1ALRAIMAINS-JRN-00106 (posted 2026-08-30) | KWD 3.500 | Unrealized gain: AR 1000 AED, book 83.500 @ 0.0835, revalued 87.000 @ 0.0870. DR 1131 (party-tagged) / CR 4830. |
| 2026-08-30 | Accounting/FX | FX revaluation REVERSAL JE | B1ALRAIMAINS-JRN-00107 (posted 2026-09-01) | KWD 3.500 | **Verifies the reversal mapping fix live**: auto-reversal now POSTS instead of dead-lettering. CR 1131 (party tag preserved) / DR 4830 - same account, uncrossed. Dated first day of the next period. |
| 2026-08-30 | Accounting/FX | FX reversal JE (dead-letter retry) | B1ALRAIMAINS-JRN-00105 (posted 2026-09-01) | KWD 6.500 | Stranded dead letter f701928d retried THROUGH THE PRODUCT (POST /dead-letters/:id/retry) - no hand-written correcting entry. Reverses the pre-migration-0314 revaluation JRN-00087 exactly. |
| 2026-08-30 | Accounting/Journals | Manual journal entry (posted) | B1ALRAIMAINS-JRN-00108 (7bf7b83c-f599-4fc1-98ed-78111fa6e2ac) | KWD 2.500 | **Verifies ACC-JRN-001 fix live**: both lines carry branch_id = Al Rai (was NULL, which made manual JEs invisible to branch-filtered P&L while their reversals appeared). DR 6110 / CR 1112. |
| 2026-08-30 | Accounting/Bank recon | No document created (state toggled and restored) | Bank statement 6c065fd6 line a061226a "ZZTEST dup-match repro line Y" | - | Phase F closeout: proved the reconciliation maker path live as accountant1 (auto-match 200, no-match 200, unmatch 200, reconcile still 403). Line left exactly as found: match_status = unmatched, no_match_reason NULL. No journal touched; ledger 0.000000 before and after. |
| 2026-08-30 | Purchase/Direct | Supplier | ZZTEST AED Supplier FX (SUP-0004, ed3b67c5-3f45-40d2-8397-d895e6635675) | - | AED-trading supplier created to exercise the new multi-currency quick purchase end to end (a KWD-configured supplier is correctly refused an AED document by the shared supplier-currency guard). |
| 2026-08-30 | Purchase/Direct | Foreign-currency direct purchase | B1ALRAIMAINS-DPU-00004 / GRN-00007 / PINV-00009 (cef72a21-5177-4b7a-a66b-172ead0c5e1b) | AED 250.000 = KWD 21.750 | **Verifies multi-currency quick purchase live**: currency AED + rate 0.0870000000 frozen on the hidden PO, the GRN and the bill; total_fn/balance_fn 21.750000 KWD (= 250 x 0.087, hand-derived first); GL JRN-00109 DR 1141 / CR 2121 21.750, JRN-00110 DR 2121 / CR 2111 21.750 party-tagged to the supplier; due_date 2026-09-29 (terms 30); cost pool last_cost 2.175000 KWD in KWD. |
| 2026-08-30 | Purchase/Direct | Functional-currency direct purchase (regression control) | B1ALRAIMAINS-GRN-00008 / PINV-00010 (f28fbd51-9149-468e-9fc9-3feb9eec1007) | KWD 6.250 | Negative control: no currency, no rate stated. Stored KWD at rate 1, total_fn = total, KWD 3dp intact. Proves the single-currency path is unchanged. |
| 2026-08-30 | Accounting/Journals | Manual journal entry (posted) | B1ALRAIMAINS-JRN-00113 (0e799850-7094-4d75-8144-8b888e8295a0) | KWD 1.000 | ACC-JRN-003 BASELINE: posted by accountant1 alone with `requireJournalApproval` OFF (the launch-customer default). DR 5200 / CR 1111. Proves the solo bookkeeper path is unchanged. |
| 2026-08-30 | Accounting/Journals | Manual journal entry (posted) | B1ALRAIMAINS-JRN-00114 (3a36018d-a25c-4e41-8c91-268c434b31d4) | KWD 1.000 | ACC-JRN-003 GATE: accountant1's solo post of this draft was REFUSED (400 SECOND_APPROVER_REQUIRED) with the flag ON; self-approval (approvedBy = self) and a bad PIN were both refused with the generic 422. Finally posted by the OWNER escape hatch, and the audit row records `selfApproved` in its reason. |
| 2026-08-30 | Accounting/Journals | Manual journal entry (posted) | B1ALRAIMAINS-JRN-00115 (8dcef807-59fb-4e03-a799-4ccaa2ed45e6) | KWD 1.000 | ACC-JRN-003 RESTORE CONTROL: posted by accountant1 alone after the flag was switched back OFF. Confirms the tenant was left exactly as found (`requireJournalApproval` = false). |
| 2026-08-30 | Accounting/Periods | No document created (state toggled and restored) | Fiscal period Jan 2025 (7a35384c-1fcf-404a-be7e-8cc6a42af154) | - | ACC-PER-001 negative control: soft-locked and soft-unlocked by accountant1 alone, both 200. Proves the soft path stays an ordinary operational guard. Period left `open`, status_before_close NULL, both fiscal years still not closed. |
| 2026-08-30 | Reports/Exports | No document created (audit rows only) | AuditLog action='export' x4: TrialBalanceExport, ArAgingExport, GeneralLedgerExport, JournalEntryExport | - | AUDIT-003 + AUDIT-004: each export by accountant1 wrote ONE `export` row naming who, which export, the applied filter set, and the new branch_id / legal_entity_id scope. The plain trial-balance report GET wrote nothing, so the GET/audit split still holds. |

| 2026-08-30 | GL Account | ZZTEST Account One (9991) | created via POST /tenant/accounts/bulk, then deleted via DELETE /tenant/accounts/:id (cleanup) | AUDIT-002 verification |
| 2026-08-30 | GL Account | ZZTEST Account Two (9992) | created via POST /tenant/accounts/bulk, then deleted via DELETE /tenant/accounts/:id (cleanup) | AUDIT-002 verification |
| 2026-08-30 | GL Account | ZZTEST Account Three (9993) | created via POST /tenant/accounts/bulk, then deleted via DELETE /tenant/accounts/:id (cleanup) | AUDIT-002 verification |

## 2026-08-30 — settings approvals/notifications/numbering (agent 10)
| Artifact | Where | Status |
|---|---|---|
| Document sequence `ZZTEST-DSL-` (DSL @ B2_FAHAHEEL_BRANCH), id 557a9dde-7033-450a-9f47-ba51e8fa7cb8 | `document_sequences` | CREATED then HARD-DELETED (row count back to 79) |
| 10 sequence reservations ZZTEST-DSL-00001..00010 | `sequence_reservations` | CREATED then HARD-DELETED |
| `tenant_identity.require_bill_approval` flipped true -> false | `tenant_identity` | RESTORED to original `false`, verified by SQL |
| Audit rows for the above (DocumentSequence create/update, SequenceReservation create) | `audit_log` | LEFT IN PLACE (audit log is immutable by design) |
| Session (settings-packs-audit-branding, resumed pass) | ZZTEST-logo.png (1x1 PNG) uploaded via `POST /tenant/settings/logo` to Gulf Auto Parts tenant_identity.logoUrl | Restored via `DELETE /tenant/settings/logo` in the same session; verified `logo_url` back to empty via SQL (`select logo_url from tenant_identity where id='ce603a7c-9f94-4c89-8f48-8ebb84755e10'` -> empty) | Purpose: confirm logo flows into a real printed invoice PDF (founder's acceptance test). Confirmed via `/tenant/documents/sales-invoice/{id}/pdf` — PDF's embedded XObject Image was `/Width 1 /Height 1`, matching the 1x1 test PNG exactly. |

## 2026-08-30 — residual accounting fixes (Task 10 agent)
| Date | Module | Doc type | Doc number | Amount | Notes |
|------|--------|----------|------------|--------|-------|
| 2026-08-30 | Reports/Exports | No document created (audit rows only) | AuditLog action='export': TrialBalanceExport (0d0d8e58-ffb1-4344-bb76-ad50f3d1e388, 08:38:08 UTC), ArAgingExport (8ff567f5-6abb-48d6-8967-4b6205411719, 09:27:23 UTC) | - | Verifies TASK 1 fix live: the Trial Balance and AR Aging CSV export buttons now call the server `@AuditedExport` routes (previously built CSV client-side from the unaudited view query, writing no audit row). No test data created — existing tenant data used read-only. |

## 2026-08-30 — Store Manager role-template gap closure (RBAC agent)
| Date | Module | Doc type | Doc number | Amount | Notes |
|------|--------|----------|------------|--------|-------|
| 2026-08-30 | Settings/RBAC | Role (seeded by migration 0318, not app UI) | "Store Manager" (5e549c47-c2ae-452f-b5a0-a7a06d20725c), 31 role_permissions rows | - | Closes the confirmed gap: zero non-owner role held pos.tenderType.manage/read (pos.configure bundle). LEFT IN PLACE — this is the shipped fix, not test scaffolding, so it is NOT prefixed ZZTEST and NOT cleaned up. |
| 2026-08-30 | Settings/RBAC | User (username-mode invite) | "zztest-storemgr" / "ZZTEST Store Manager Probe" (7fc973f5-7c22-4152-91b8-3c1d0f3dd682) | - | Created via POST /tenant/users/invite with roleId=Store Manager, allBranches=true, to prove live: GET /tenant/pos/tender-types 200, GET /tenant/accounts 403, GET /tenant/roles 403, GET /tenant/sales/invoices 403, GET /tenant/purchase/orders 403, GET /tenant/items 200. CLEANED UP: deactivated via API (confirmed 403 on reuse of the same JWT), user_roles row deleted (tenant DB), user_tenant_map row deleted (admin DB), Supabase auth user hard-deleted via admin API (confirmed: re-login now returns invalid_credentials). Zero trace remains. |

## 2026-08-30 — AUDIT-011 fix + FIX 2 notification catalog sync (implementation agent)
| Date | Module | Doc type | Doc number | Amount | Notes |
|------|--------|----------|------------|--------|-------|
| 2026-08-30 | Settings/Notifications | Data fix, not a document | `notification_event_policies` row (tenant_id=ce603a7c-9f94-4c89-8f48-8ebb84755e10, event_key=inventory.lowStock) | channel_email true -> false | Applied via new CLI `pnpm --filter @zerupt/api sync:notification-catalog-defaults --event=inventory.lowStock --previous=true --tenant=<id> --apply`. This is the shipped fix (deliberate correction), NOT test scaffolding — LEFT IN PLACE, not restored, per task instructions. Original value (true) recorded above before the change. Idempotency re-verified: a second `--apply` run reports "already false" (no-op). |
| 2026-08-30 | Settings/Audit | No document created — audit_log rows only, all pre-existing from earlier sessions | FiscalPeriod rows dated 2026-08-30 05:51-10:59 UTC (accountant1 actions) | - | AUDIT-011 fix verification only, read-only against existing data. No new audit rows created for this fix; two pre-existing rows (`created_at` 07:59:39.923614 / 07:59:42.236276) were confirmed via SQL to carry the raw UUID `bfdf55a3-51fe-4192-ba44-9fd28c24f71c` as `user_email` (the historical bug), and the audit screen (en+ar, timeline+table) plus the CSV export both display "accountant1" for these rows post-fix, never the raw UUID. |

## 2026-08-30 — Currency whitelist + posted-GL deactivation guard + tax-rate PIN gate (implementation agent)
| Date | Module | Doc type | Doc number | Amount | Notes |
|------|--------|----------|------------|--------|-------|
| 2026-08-30 | Accounting/Journal Entries | Manual JE, DRAFT only, never posted | id `ab6fb704-8ff3-448a-a3c9-ec4b1106f29c` (description prefixed `ZZTEST`) | KWD 10.000000 (Cash 1111 debit / Product Sales 4110 credit) | Created via `POST /tenant/journal-entries` to prove an ENABLED currency (KWD) still books end-to-end after the new `tenant_currencies` whitelist gate. Deleted immediately after via `DELETE /tenant/journal-entries/:id` (200, `{"deleted":true}`) — draft only, never touched the GL, no restore needed. |
