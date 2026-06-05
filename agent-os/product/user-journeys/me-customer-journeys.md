# Middle East Customer Journeys — End-to-End Audit

> **Purpose:** Simulate 5 real Middle Eastern retail customers from signup → first 100 sales, and audit every step against the system as it exists today (June 2026). Each gap is graded: 🔴 blocker (customer churns/cannot operate), 🟡 friction (workaround exists, erodes trust), 🟢 polish.
>
> **Sources:** Codebase audit of onboarding, inventory, POS/sales, purchase, and accounting modules + ME market research (ZATCA/FTA/NBR compliance, incumbent tooling, payment norms).

---

# Part 1 — The Five Customer Profiles

## P1 · Abu Khalid — Auto Parts Trader, Riyadh, KSA 🇸🇦

| | |
|---|---|
| Business | Single-outlet auto parts retailer (Japanese/Korean parts + oils), Al-Olaya industrial district |
| Size | 1 outlet · 4 staff (owner + 2 Pakistani counter staff + driver) · 8,000–12,000 SKUs · ~400 txns/month · SAR 180k–300k/month |
| VAT regime | 15% VAT, **ZATCA Phase 2 FATOORA e-invoicing mandatory** (above SAR 1M threshold) |
| Current tools | Tally Prime + legacy FoxPro-era POS + Excel POs + WhatsApp + physical stock cards |
| Sales mix | Walk-in cash (B2C simplified invoices) + B2B credit to garages (full tax invoices, PDCs) |

**Psychology**
- **Trigger:** ZATCA enforcement wave hit his revenue tier. Accountant quoted SAR 12,000 to retrofit his old system; he googled "نظام محاسبة متوافق مع الزكاة". A prior audit scared him — he now buys compliance certainty.
- **Why switch:** SaaS at ~SAR 400/month that does FATOORA out of the box beats a SAR 12k retrofit.
- **Deal-breakers:** No Arabic UI · no offline POS (warehouse-area internet drops) · no OEM part-number search at POS · multi-week data migration · no Arabic/Urdu phone support · **no ZATCA compliance (fines up to SAR 50k)**.
- **Trust factors:** ZATCA certification badge, demo with real KSA tax invoice (Arabic header + QR), auto-parts reference customer in Riyadh, trial with his own data imported.

## P2 · Mariam — Abaya & Modest Fashion Chain, Dubai/Sharjah, UAE 🇦🇪

| | |
|---|---|
| Business | 2 boutiques (Dubai + Sharjah) + tailoring workshop; ready-made + made-to-order abayas |
| Size | 2 outlets · 10 staff (2 managers, 6 floor staff, 2 tailors) · 3,000–5,000 SKUs (color/size/fabric **variants**) · ~600 txns + 80 made-to-order/month · AED 180k–350k/month |
| VAT regime | 5% UAE VAT, FTA quarterly returns via EmaraTax; e-invoicing mandate coming 2026 |
| Current tools | Zoho Books + standalone POS + Google Sheets for custom orders + Instagram/WhatsApp CRM |

**Psychology**
- **Trigger:** Wanted a Ramadan promotion across both outlets — realized she couldn't see combined stock or set a discount without manual coordination. Month-end reconciliation between Zoho + POS takes 2 days; accountant charges AED 1,500/month for it.
- **Why switch:** One system = no reconciliation; cross-outlet stock visibility (she's losing sales when Dubai can't see Sharjah's stock).
- **Deal-breakers:** No made-to-order/deposit workflow (15% of revenue) · no multi-outlet · no Arabic receipts · enterprise pricing · VAT history breaking in migration (FTA audit fear).
- **Trust factors:** Peer social proof (Dubai entrepreneur Instagram), bilingual UI, WhatsApp support in Arabic.

## P3 · Yousef — Mobile Phone & Electronics Retailer, Kuwait 🇰🇼

| | |
|---|---|
| Business | 3 outlets (Salmiya, Avenues kiosk, Farwaniya); independent, 12 years operating |
| Size | 3 outlets · 18 staff · ~6,000 SKUs (~1,200 **IMEI-serialized**) · ~1,200 txns/month · KWD 80k–150k/month |
| VAT regime | None today (preparing for eventual VAT). KWD = 3 decimal places. **KNET is >60% of payments** |
| Current tools | 8-year-old legacy desktop ERP (crashed twice last year, lost 3 days of data) + giant IMEI Excel + WhatsApp transfer requests + KWD 150/month IT-shop maintenance |

**Psychology**
- **Trigger:** KWD 4,000 of iPhones unaccounted for at the Avenues kiosk — suspects theft, can't prove it. Legacy system data loss is existential.
- **Why switch:** Cloud + audit trail + real-time multi-outlet stock; "Kuwait will get VAT eventually, I want to be ready."
- **Deal-breakers:** **No IMEI/serial tracking (table stakes)** · no KNET · cloud-only with no offline (mall internet is spotty) · migration fear (IMEI + warranty history) · no inter-store transfer paper trail.
- **Trust factors:** IMEI scan demo, loss-prevention/audit-trail demo, "your 6,000 SKUs + IMEI history imported in 2 hours."

## P4 · Dr. Ahmed — Community Pharmacy, Manama, Bahrain 🇧🇭

| | |
|---|---|
| Business | Single pharmacy + health/beauty store; owner is the pharmacist |
| Size | 1 outlet · 5 staff · ~4,500 SKUs (**all batch/expiry tracked, FIFO regulatory**) · ~800 txns/month · BHD 18k–30k/month |
| VAT regime | 10% Bahrain VAT (NBR). **Mixed rates in one basket: prescription drugs 0%, OTC/cosmetics 10%** |
| Current tools | QuickBooks Online + legacy pharmacy POS + whiteboard expiry tracking + Excel supplier PDCs (60–90 day terms) |

**Psychology**
- **Trigger:** NBR auditor questioned his VAT return methodology; he was once fined BHD 500 for miscategorization. Wrote off BHD 2,000 of expired stock last year because the whiteboard wasn't updated.
- **Why switch:** Auto zero-rated/standard split on the VAT return; near-expiry alerts pay for the software by themselves.
- **Deal-breakers:** **Can't mix 0% + 10% lines in one transaction** · **no batch/expiry tracking** · POS and accounting not integrated · price above ~BHD 80/month · no supplier PDC management.
- **Trust factors:** Demo of a dual-rate receipt with correct NBR return split, expiry alert walkthrough, Bahrain pharmacy reference.

## P5 · Imran — Baqala Mini-Mart Chain (5 stores), Dubai, UAE 🇦🇪

| | |
|---|---|
| Business | 5 baqalas across Dubai (Al Quoz, Deira, Jumeirah, International City, Discovery Gardens); 6th store opening |
| Size | 5 outlets · 22 staff (all South Asian managers/cashiers) · ~15,000 SKUs (food expiry + FMCG barcodes) · ~12,000 txns/month, AED 20–80 avg ticket · AED 450k–700k/month |
| VAT regime | 5% UAE VAT with **SKU-level zero-rated (basic foods) vs standard split** |
| Current tools | 6-year-old Windows POS + part-time Tally accountant (2 visits/month, books always 2 weeks stale) + physical stock books + verbal/WhatsApp purchasing + >40% cash |

**Psychology**
- **Trigger:** Found an AED 8,000 cash discrepancy at International City only at month-end. A competitor switched to cloud POS and "manages everything from his phone while in Pakistan" — that story stuck.
- **Why switch:** Mobile owner dashboard across all stores; cash/shift variance alerts; current setup physically can't scale to store #6. Not price-sensitive if ROI is clear ("AED 5,000/month shrinkage stops = pays for itself").
- **Deal-breakers:** No mobile dashboard · POS lag at 400–500 txns/day · no cash management/till reconciliation · onboarding needing a consultant · English-only UI for Urdu/Hindi staff · no offline mode.
- **Trust factors:** Live 5-outlet dashboard demo, shift reconciliation walkthrough, "5 stores live in one day, not one month", SKU import from his POS export.

## Cross-Profile Pattern Table

| Factor | P1 Auto KSA | P2 Abaya UAE | P3 Electronics KWT | P4 Pharmacy BHR | P5 Baqala UAE |
|---|---|---|---|---|---|
| Primary trigger | Compliance deadline | Multi-outlet ops chaos | Data loss + shrinkage | Audit penalty | Visibility gap |
| Feature gate | ZATCA e-invoice | Variants + multi-outlet + custom orders | IMEI + KNET + transfers | Mixed VAT + batch/expiry | Mobile dashboard + cash mgmt |
| Biggest fear | Fine/audit | FTA history loss | IMEI history loss | NBR penalty repeat | POS speed regression |
| Payments | Cash + PDCs (B2B) | Card | KNET dominant | Cash + supplier PDCs | Heavy cash + card |
| Incumbent | Tally + legacy POS | Zoho + standalone POS | Legacy desktop | QuickBooks + pharma POS | Legacy POS + Tally |

---

# Part 2 — The End-to-End Journey × Live Audit

Journey stages: **Signup → Onboarding wizard → Data migration → Go-live → Team setup → Restocking → Selling (sales 1–100) → Transfers → Money & accounting → Month-end**. Each stage: what the customer does, what they're thinking, what the system does today, and where it breaks.

---

## Stage 1 — Signup & Provisioning

**Customer does:** Signs up (email or Google), enters owner name, business name, country. Waits for tenant provisioning.

**What works today:** Signup form with validation + password strength, 10-country select covers all 5 profiles, BullMQ 4-step provisioning with progress polling, existing-tenant redirect. ✅ Solid.

**Audit findings:**
- 🟡 **No expectation-setting on landing in /setup.** Abu Khalid (P1) arrived because of ZATCA fear — nothing on the setup screen confirms "ZATCA-ready" (and we're not, see Stage 7). The promise that brought him here is never echoed back. P5's Imran needs "5 stores in one day" reassurance up front.
- 🟢 Provisioning failure path: verify retry messaging is non-technical and in Arabic.

**Be 100% sure of:** provisioning never strands a tenant in a half-created state; signup works flawlessly on mobile (Imran will sign up from his phone).

---

## Stage 2 — Onboarding Wizard (Steps 1–7)

**Customer does:** Business info → locations → accounting → tax → team count → POS config → data sources.

**What works today:** All 7 steps + review + materialization pipeline (COA seed/reconcile, tax, currency, locations, POS, doc numbering, dashboard) exist end-to-end. Country-driven tax modes (none/vat/sa/gst/sst), KNET fenced to Kuwait, language-switch dialog, CSV shortcut on locations, resume-from-server. Go-live readiness gating exists. Genuinely strong relative to competitors.

**Audit findings per profile:**

| # | Finding | Hits | Grade |
|---|---|---|---|
| 2.1 | **Country change doesn't cascade-invalidate downstream answers.** Change KW→SA after filling Steps 3–4 → silently materializes inconsistent tax/currency config. | All | 🔴 (data integrity) |
| 2.2 | **Store vs warehouse distinction unexplained in Step 2.** Imran has 5 front counters + back rooms; Yousef has a kiosk drawing from another store's back room. No tooltip explains store/warehouse/transit. They will configure this wrong, and stock will live in the wrong place. | P3, P5 | 🔴 |
| 2.3 | **Arabic branch name (`nameAlt`) missing from Step 2** (exists only in Settings later). Abu Khalid sets up in Arabic and can't name branches in Arabic during onboarding. | P1 | 🟡 |
| 2.4 | **TRN field has no placeholder/example** (KSA TRN = 15 digits). Server rejection is the only feedback. Abu Khalid types his CR number instead and gets a cryptic error. | P1, P2, P4, P5 | 🟡 |
| 2.5 | **Inventory concept selector offers `serialized`/`batch_tracked` but the product doesn't implement them** (see Stage 6). Yousef picks "serialized," Dr. Ahmed picks "batch tracked" — and the system accepts a promise it can't keep. **This is the single most dangerous mismatch in the funnel: it converts a deal-breaker into a post-payment discovery.** | P3, P4 | 🔴 |
| 2.6 | Step 6 payment methods: no mada (KSA), no KNET-for-POS-UI followup explanation, no "why isn't my local rail here." | P1, P3 | 🟡 |
| 2.7 | No "skip for now / decide later" path on non-critical required fields (usePOS is hard-required). Contradicts our own spec UX principle. | All | 🟡 |
| 2.8 | Free-text city + raw IANA timezone names ("Asia/Riyadh") — inconsistent data + opaque to non-technical owners. | All | 🟢 |
| 2.9 | Step 5 (Team) is a lone number stepper — feels broken after 4 rich steps. No preview of roles/invites. | All | 🟢 |
| 2.10 | Pipeline failure surfaces COA role keys (`trade_receivables`) — accounting jargon to a shopkeeper. Custom-COA reconciliation gate requires understanding double-entry. | All | 🟡 |
| 2.11 | KW/QA "no VAT" screen gives no guidance on KWD 3-decimal handling or future-VAT readiness — Yousef's explicit buying motive. | P3 | 🟢 |

**Improve:** cascade-reset on country change; store/warehouse explainer with retail-language examples ("front counter where you sell" / "back room where stock sits"); honest capability flags on inventory-concept cards ("Serial tracking: coming Q3" or block selection); per-country TRN placeholders; add `nameAlt` to Step 2.

**Be 100% sure of:** materialization is idempotent and never half-seeds COA roles (silent dead-letter posting failures later trace back to this); review screen accurately reflects everything in Arabic.

---

## Stage 3 — Data Migration (the make-or-break moment)

**Customer does:** Exports items/customers/suppliers from Tally/Zoho/Excel/legacy POS, imports into Zerupt, loads opening stock and opening balances.

**What works today:** 4-stage import wizard (upload → LLM-assisted column mapping → validation → apply) for products/categories/customers/suppliers; CSV+Excel, 50k row cap, dup detection, opening-stock import posting adjustments; opening-balance import with COA tie-out + park-residual. This is our wedge — and it's substantially built. ✅

**Audit findings:**

| # | Finding | Hits | Grade |
|---|---|---|---|
| 3.1 | **No template download.** Every profile exports a differently-shaped file; a downloadable template with required/optional columns is the cheapest de-risker. Specced, not built. | All | 🟡 |
| 3.2 | **Synchronous apply with no row-level progress.** Imran's 15,000 SKUs or Abu Khalid's 10,000 over shop Wi-Fi → page appears hung at the most trust-sensitive moment of the entire journey. (BullMQ streaming acknowledged as tech debt.) | P1, P3, P5 | 🔴 |
| 3.3 | **No import job history.** "Imported 1,847, skipped 23" disappears after the session. The owner can never verify what made it in. | All | 🟡 |
| 3.4 | **`costPrice` vs WAC trap.** Importing items without simultaneous opening stock → WAC = 0 → first sales post zero/garbage COGS silently. No warning. | All | 🔴 (financial) |
| 3.5 | **Unit is free-text varchar** — "pcs"/"Pcs"/"PCS"/"kg" chaos at import; no UOM master. Imran's groceries (weight items) suffer most. | P5, P4 | 🟡 |
| 3.6 | **No brand/description/images/weight fields on items** — specced, absent from DB. Mariam's fashion catalog and Yousef's phone listings feel skeletal. | P2, P3 | 🟡 |
| 3.7 | **No IMEI/batch import targets** — Yousef's IMEI Excel and Dr. Ahmed's batch/expiry data have nowhere to land (blocked on Stage 6 features). | P3, P4 | 🔴 |
| 3.8 | Supplier contacts import likely drops contact data on the floor (`supplier_contacts` is a dead table — no API/UI). | All | 🟢 |
| 3.9 | Opening balances flow assumes a semi-technical user (CSV + account mapping). Dr. Ahmed's accountant can do it; Imran can't. A simple typed wizard ("bank balance, what customers owe you, stock value") is missing. | P5 | 🟡 |
| 3.10 | Opening-balance import passing wrong/missing `occurredAt` → GL entries at server time → fiscal-period misassignment at go-live. Buried conditional in `StockAdjustmentsService`. | All | 🔴 (financial) |

**Be 100% sure of:** import never partially applies without a clear report; opening stock + opening balances reconcile to the old system's trial balance — this is the moment migration fear (every profile's top-3 deal-breaker) is either cured or confirmed.

---

## Stage 4 — Go-Live & First Login

**What works today:** 8-item readiness checklist (gating vs advisory), one-way go-live with server-side 422 on gate failures, COA tie-out panel, welcome banner + quick-start checklist on first dashboard. ✅ Well designed.

**Audit findings:**
- 🟡 4.1 "Opening balances balanced" is **advisory, not gating** — Imran says "yes I have opening balances" in Step 7, skips the import, goes live with incomplete financials, and his first VAT return is wrong. Should gate (or require explicit "go live without balances" acknowledgment in plain language).
- 🟡 4.2 Checklist language is accountant-speak ("OBE acknowledged", "tie-out") in English. Rewrite for shopkeepers, in both languages.
- 🟢 4.3 Walkthrough video skeleton exists but `walkthroughVideoUrl` is always null — produce the 2-minute video (Arabic + English); it's the cheapest support deflection we have.
- 🟢 4.4 Wizard screen state in localStorage → device switch mid-wizard resets navigation to "welcome" (server answers survive). Confusing, not data-losing.

---

## Stage 5 — Team Setup

**Customer does:** Invites cashiers/managers, assigns roles, scopes them to branches.

**What works today:** Invite dialog (email + role), users table with lifecycle actions, role CRUD + permission matrix, branch assignment endpoint. ✅

**Audit findings:**
- 🔴 5.1 **Invite dialog has no branch scope, and `userBranches` is fail-closed.** Imran invites 5 cashiers → every one of them logs in and sees *nothing* → "the invite is broken" → support call ×5. Add branch selector to the invite dialog or a post-invite prompt. Highest-frequency support ticket waiting to happen.
- 🟡 5.2 Expat staff language: UI is ar/en only. P3/P5 staff are Urdu/Hindi-first. Not MVP-blocking (most read English POS screens) but a stated deal-breaker for Imran — at minimum the POS surface should be icon-heavy and text-light.
- 🟢 5.3 No per-user locale/timezone overrides; invitation expiry hardcoded 7 days; MFA specced not built. Acceptable for now.
- 🟡 5.4 Role templates expose permissions for modules that don't exist (`purchase.return.*`, `purchase.order.*`) — admins configure ghost permissions.

---

## Stage 6 — Stock & Inventory Daily Ops

**Customer does:** Receives stock, adjusts damages, counts shelves, watches low-stock, prints barcode labels.

**What works today:** Item CRUD + barcodes + categories (4-level tree), stock levels with low/out badges, multi-line adjustments with negative-stock policy + GL posting, WAC/FIFO engines (Decimal.js, banker's rounding), bulk activate/deactivate. ✅ Core is solid.

**Audit findings:**

| # | Finding | Hits | Grade |
|---|---|---|---|
| 6.1 | **Stock transfers: zero code.** Spec complete (transit warehouse, two-step inter-branch, discrepancy write-down) — nothing built. Yousef moves iPhones between 3 stores *daily* via WhatsApp; Mariam shuttles abayas Dubai↔Sharjah; Imran rebalances 5 baqalas. Workaround = paired manual adjustments with no linkage, no in-transit state, no audit trail — recreating the exact loss-visibility problem Yousef is fleeing. The onboarding Step 2 even asks about inter-branch transfers and creates a transit warehouse that nothing uses. | P2, P3, P5 | 🔴 |
| 6.2 | **Serial/IMEI tracking: enum only, no implementation.** Yousef cannot use the product. Period. | P3 | 🔴 (vertical blocker) |
| 6.3 | **Batch/expiry tracking: enum only.** No expiry storage, no FEFO, no near-expiry alerts. Dr. Ahmed cannot use the product (regulatory) — and Imran's perishables go unmanaged. | P4, P5 | 🔴 (vertical blocker) |
| 6.4 | **Stock counting: zero code.** No freeze/count/variance/post workflow. Imran's shrinkage hunt — his #1 buying motive — has no tool. Year-end counts done on paper against a system that promised to end paper. | P5, all | 🔴 |
| 6.5 | **Low-stock badges with no action.** `/low-stock` endpoint exists but no notification delivery, no reorder qty, no suggested PO. The badge says "low" and offers nothing. | All | 🟡 |
| 6.6 | **No barcode label printing.** Abu Khalid's unbarcoded parts and Imran's loose items can't get labels from the system. | P1, P5 | 🟡 |
| 6.7 | Inventory value (WAC × qty) not surfaced in stock UI — owner can't answer "what is my stock worth." | All | 🟡 |
| 6.8 | No adjustment approval threshold (specced) — any cashier with adjustment permission can write off unlimited value. Anti-shrinkage product with a shrinkage hole. | P3, P5 | 🟡 |
| 6.9 | Matrix variants: schema stubs only. Mariam's color/size/fabric abayas become hundreds of flat SKUs — manageable but ugly; promo pricing per parent impossible. | P2 | 🟡 |
| 6.10 | Negative-stock WAC anomaly (flexible mode) can produce nonsense costs with no flag. | All | 🟢 |
| 6.11 | **Pricing engine: zero code.** Single flat `sellingPrice`. No price lists, no promotions. Mariam's Ramadan promotion — her literal trigger for buying — cannot be executed except by manually editing thousands of prices and reverting after Eid. | P2, all | 🔴 |

---

## Stage 7 — Selling: Sales 1 → 100 (POS + B2B)

**Customer does:** Opens shift → scans/searches → takes payment → prints receipt → handles a return by sale ~20 → closes shift and counts cash → (B2B) issues invoices on credit and collects.

**What works today:** Full POS state machine (draft/hold/recall/complete/void), shift open/close with expected-cash reconciliation, z-report (80mm/A4), bilingual Arabic-first thermal receipt with per-component tax breakdown and TRN, barcode scan + search + categories, F-key shortcuts, line discounts, GL auto-posting on completion. B2B: customers + invoices (gapless INV numbering, fiscal-period validation, WAC COGS snapshot) + credit notes + receipt vouchers with multi-invoice allocation. ✅ The happy path is genuinely good.

**Audit findings:**

| # | Finding | Hits | Grade |
|---|---|---|---|
| 7.1 | **Returns/exchanges: zero API, zero UI.** DB types and event contracts exist; nothing else. Statistically a return happens within the first ~30 sales. The cashier has *no path at all* — and void is same-shift-only, with the error message literally saying "use a Return" for a feature that doesn't exist. Worst possible first-week moment: customer at the counter, cashier stuck, owner called. | All | 🔴 (universal day-1 blocker) |
| 7.2 | **Offline mode: zero implementation.** Every POS action is a server round-trip (4+ calls per sale). One internet drop stops the till. Explicit deal-breaker for P1, P3, P5; latency risk for Imran's 400–500 txns/day stores even when online. | P1, P3, P5 | 🔴 |
| 7.3 | **ZATCA: zero readiness.** No QR (TLV), no UUID, no XML/UBL, no clearance API. Abu Khalid is non-compliant from sale #1 — SAR 1,000/invoice penalties. **We cannot sell in KSA until this exists**; marketing must not imply otherwise. | P1 | 🔴 (market blocker) |
| 7.4 | **No buyer-TRN on B2B receipts/invoices** — UAE/KSA require buyer TRN on full tax invoices when the customer is VAT-registered. Abu Khalid's garage customers need it to reclaim input VAT; they will refuse non-compliant invoices. | P1, P2 | 🔴 |
| 7.5 | **POS↔customer FK is a ghost** (plain UUID, no AR effect). A credit customer at the till creates no receivable. Abu Khalid's garage walk-ins on account = the system loses the debt. Credit limits don't exist anywhere. | P1, P3 | 🔴 |
| 7.6 | **Cash pay-in/pay-out: DB exists, no API/UI.** Petty cash, float drops, manager pulls can't be recorded — yet z-report formula includes them (always zero). Imran's till variance investigations — his buying motive — are structurally incomplete. | P5, all | 🔴 |
| 7.7 | **Split tender UI missing** (API supports it; UI = cash/card tabs only). Part-cash-part-KNET is everyday Kuwait. KNET appears in onboarding but not as a POS tender path. | P3, all | 🟡 |
| 7.8 | **PDCs: nowhere.** Spec'd, enum missing, no service, no UI. Post-dated cheques are the GCC B2B norm (P1 receives from garages, P4 issues to pharma distributors). Onboarding *asks about PDCs in Step 3* and then the product has nothing. | P1, P4 | 🔴 (B2B blocker) |
| 7.9 | **Sales AR/Revenue/Tax JE not posted** (DEV-330 pending): COGS and inventory move, receivables and revenue never post → **trial balance wrong for every confirmed invoice**. | All B2B | 🔴 (financial integrity) |
| 7.10 | Payment terms hardcoded +30d; no quotations or sales orders (zero code) — GCC B2B trade runs on quote→PO→invoice. | P1, P2 | 🟡 |
| 7.11 | Manager-PIN void is a UI dead-end (no backend). Cashier clicks it, nothing happens. | All | 🟡 |
| 7.12 | Credit-note UI lets users over-credit then fails at server with 422 (client "remaining" knowingly wrong). | All | 🟢 |
| 7.13 | No AR aging UI/statement for customers despite index existing — wait, AR aging report IS built (see Stage 9); but per-customer *statements* (a thing GCC traders hand to customers monthly) are missing. | P1 | 🟡 |

**Be 100% sure of (first-100-sales contract):** sale → receipt → GL → stock decrement is atomic and correct under concurrency at 2+ registers; cash reconciliation matches drawer to the fils across a full shift including refunds; Arabic receipt renders correctly on real 80mm thermal hardware.

---

## Stage 8 — Restocking & Purchasing

**Customer does:** Orders from suppliers (verbal/WhatsApp), receives goods (often before invoice), enters bills, pays on terms, imports shipments with freight + customs.

**What works today:** Supplier CRUD (bilingual, TRN, Net-N terms), purchase bills draft→confirm with dup-bill guard, confirm = stock-in (GRN) + GL (DR Inventory/Input VAT, CR Payables), supplier payments with allocations + posting. ✅ Minimal but coherent.

**Audit findings:**

| # | Finding | Hits | Grade |
|---|---|---|---|
| 8.1 | **Bill = GRN, and that's the only path.** No PO, no GRN doc. Goods arriving before the supplier invoice (the normal case in GCC import trade) cannot be received. Stock sits on the shelf, sellable in reality, invisible in the system → either they sell-at-negative-stock or wait for paper. | All | 🔴 |
| 8.2 | **Landed cost: zero code** (inventory-side listener stub waits for an emitter that doesn't exist). Abu Khalid's Jordan/UAE part imports and Yousef's phone shipments carry freight + customs that never reach COGS → gross margin overstated from day 1. | P1, P3 | 🔴 (financial) |
| 8.3 | No partial-receipt tracking (no PO → no open-order state). Supplier ships 80/100; remaining 20 untracked. | All | 🟡 |
| 8.4 | No AP aging report (AR exists, AP doesn't). "Who do I owe and how overdue" — undoable. Supplier PDC tracking (P4's 60–90 day terms) absent. | P4, all | 🟡 |
| 8.5 | No advance/cash-purchase shortcut: pay-and-receive in one step needs two workflows; no `bankAccountId` on payments → can't say which till/bank was debited. | P5, P1 | 🟡 |
| 8.6 | Posted-payment errors require a reversing payment, but no reversal doc/flow exists — AP confusion guaranteed on first user mistake. | All | 🟡 |
| 8.7 | Silent `dueDate = +30d` default when supplier terms unset — owner can't distinguish real terms from a guess. | All | 🟢 |
| 8.8 | Ghost account mappings for `purchase.grn.confirmed` (event never emitted) — future migration landmine when PO/GRN ships. | — | 🟢 (internal) |

---## Stage 9 — Accounting, VAT & Reports (the invisible engine)

**What works today:** This is our strongest module. 5-level bilingual COA + 20 semantic system roles (rename-safe posting), transactional outbox + dead-letter with retry, auto-posting listeners for POS/sales/purchase/inventory, reverse-charge VAT sub-accounts with VAT201 box mapping, date-ranged tax rates, 9 reports built (GL, TB, P&L, AR aging, tax summary, daily sales, top sellers, stock levels, cash flow) with CSV export, dashboard (today's sales, MTD margin, low stock, AR), fiscal periods with soft/hard lock, close checklists, year-end roll-up, multi-currency with FX realized/unrealized + 3-decimal KWD/BHD, bank reconciliation, full audit trail UI. ✅✅

**Audit findings:**

| # | Finding | Hits | Grade |
|---|---|---|---|
| 9.1 | **No Balance Sheet.** The single most-expected owner report ("what am I worth"). Derivable from TB, not rendered. Noticed in every demo. | All | 🔴 (demo killer) |
| 9.2 | **Dead-letter queue is silent.** Posting failure → books quietly incomplete; no alert, no owner-visible signal. For a product whose pitch is "accounting happens invisibly and correctly," a silent failure mode is the worst kind. Needs alerting + an owner-readable "books health" indicator. | All | 🔴 (trust) |
| 9.3 | **Cheque lifecycle: constants defined, zero listeners.** Cheques-in-hand/in-transit never post. Combined with 7.8 (no PDC module) the GCC cheque economy is unhandled end-to-end. | P1, P4 | 🔴 |
| 9.4 | VAT return is a read screen, not a workflow — no "mark filed," no filing lock, manual transcription to EmaraTax/FATOORA/NBR portals. Dr. Ahmed's mixed-rate split *will compute correctly* (tax engine handles 0%+10% in one txn ✅) but he must hand-carry numbers. | P2, P4, P5 | 🟡 |
| 9.5 | `LEGACY_ZERO_RATED_TURNOVER_MISSING` warning may not surface in UI → silent under-declaration of zero-rated box. Verify frontend renders it loudly. | P4, P5 | 🟡 |
| 9.6 | FX revaluation manual, not in close checklist — will be forgotten. | Multi-currency tenants | 🟡 |
| 9.7 | No re-validation of COA system-role bindings after edits → user edits COA → posting breaks at runtime into the (silent) dead-letter queue. Compound failure with 9.2. | All | 🟡 |
| 9.8 | India TDS config visible to GCC tenants — confusing noise; meanwhile no Saudi WHT. Hide by country. | P1 | 🟢 |
| 9.9 | Dashboard is per-web-session; the **owner mobile experience** (Imran's literal buying trigger: "manage from my phone in Pakistan") is unaudited — responsive dashboard ≠ designed mobile owner view with per-store cards + variance alerts. | P5 | 🟡 |
| 9.10 | Banking transfer event defined, no listener — inter-account cash moves (till → bank deposit, the daily baqala ritual) need manual JEs. | P5, all | 🟡 |

---

## Stage 10 — Month-End

**Customer does:** Counts stock, reconciles bank, files VAT, reviews profit, pays suppliers.

**Composite picture:** Bank rec ✅ · close checklist ✅ · P&L ✅ · tax summary ✅ — but stock count 🔴 (6.4), balance sheet 🔴 (9.1), AP aging 🟡 (8.4), VAT filing workflow 🟡 (9.4), and the trial balance is **wrong** if any B2B invoices were confirmed (7.9). Month one ends with the accountant Mariam wanted to stop paying still being needed.

---

# Part 3 — Synthesis

## 3.1 Blocker Rollup — what stops each customer cold

| Profile | Can they go live today? | Hard blockers (in order hit) |
|---|---|---|
| P1 Auto KSA | **No** | ZATCA (7.3) → buyer TRN (7.4) → returns (7.1) → POS credit/AR (7.5) → PDC (7.8) → offline (7.2) → landed cost (8.2) |
| P2 Abaya UAE | **Barely** | Returns (7.1) → pricing/promos (6.11) → transfers (6.1) → AR JE (7.9) → buyer TRN (7.4); made-to-order/deposits = unmet vertical need |
| P3 Electronics KWT | **No** | IMEI (6.2) → transfers (6.1) → KNET split tender (7.7) → offline (7.2) → returns (7.1) |
| P4 Pharmacy BHR | **No** | Batch/expiry (6.3) → returns (7.1) → supplier PDC (7.8/8.4); mixed VAT rates ✅ already work |
| P5 Baqala UAE | **Closest fit** | Returns (7.1) → cash pay-in/out (7.6) → stock count (6.4) → offline (7.2) → transfers (6.1) → mobile dashboard (9.9) |

**Honest read:** today's system best serves a *single-outlet, simple-SKU, online-always, cash/card, UAE/no-VAT-complexity* retailer — i.e., a simpler cousin of P5. The serialized (P3) and batch (P4) verticals are fully blocked; KSA (P1) is market-blocked by ZATCA.

## 3.2 Universal fixes ranked by (journey-stage reach × profiles hit)

**Tier 1 — every customer hits these in week 1:**
1. **POS returns/exchanges** (7.1) — universal day-1 blocker; void's own error message points at it.
2. **Sales AR/Revenue/Tax JE — DEV-330** (7.9) — books are wrong until shipped; 100%-coverage financial item.
3. **Stock transfers** (6.1) — 3 of 5 profiles are multi-outlet; onboarding already promises it.
4. **Invite branch scope** (5.1) — every multi-staff tenant's first support ticket.
5. **Async import with progress + template download + job history** (3.1–3.3) — the wedge moment.
6. **Cash pay-in/pay-out API+UI** (7.6) — completes shift reconciliation, the anti-shrinkage pitch.
7. **Balance sheet** (9.1) + **dead-letter alerting/books-health** (9.2) — demo credibility + trust.

**Tier 2 — unblocks specific deals:**
8. Offline-tolerant POS (7.2) — even a degraded queue-and-sync beats hard failure.
9. PDC module + cheque listeners (7.8 + 9.3) — unlocks GCC B2B.
10. Buyer TRN on tax invoices (7.4) — small change, compliance-critical.
11. Stock counting (6.4) · pricing/promotions (6.11) · onboarding cascade-reset + store/warehouse explainer (2.1, 2.2).

**Tier 3 — vertical/market unlocks (strategic, scoped projects):**
12. ZATCA Phase 2 (opens KSA — the largest GCC market; until then, target UAE/KW/BH and say so).
13. Batch/expiry + FEFO (opens pharmacy/grocery-fresh).
14. Serial/IMEI (opens electronics).
15. PO/GRN separation + landed cost (opens import-heavy trade).

## 3.3 Truth-in-funnel rule (do immediately, costs ~nothing)

Onboarding currently *collects answers for capabilities that don't exist*: serialized/batch inventory concepts (2.5), PDC toggle (Step 3), inter-branch transfers toggle (Step 2 → transit warehouse nothing uses), KNET (no POS tender UI). Every one converts a pre-sale deal-breaker into a post-payment betrayal — the most expensive possible place to disappoint. Either build the feature, gate the option ("coming soon" + waitlist flag we can mine for demand data), or remove the question.

## 3.4 What we must be 100% sure of (non-negotiables)

1. **Money math:** sale → tax → GL → COGS correct to the fils/halala, including 3-decimal KWD/BHD, under concurrent registers.
2. **Migration fidelity:** imported stock + balances tie out to the old system's trial balance, with a report the owner can hold.
3. **No silent financial failure:** every posting failure is loud (9.2) — "invisible accounting" must mean invisible *work*, never invisible *errors*.
4. **Arabic correctness end-to-end:** RTL, bidi-isolated mixed content, real thermal-printer output — tested on hardware, not just the browser.
5. **VAT category integrity:** the SKU-level zero-rated/standard split (P4, P5) survives import, sale, and tax summary — an error here is a government fine, not a UX bug.
6. **One-way states (go-live, confirm, post) never strand a tenant** — every gate failure has a plain-language recovery path.

## 3.5 Suggested journey instrumentation

Track per-tenant funnel: signup→wizard-complete time · import row counts + error rates · time-to-first-sale · sale #N at first return attempt (validates 7.1 urgency) · shift-close variance frequency · dead-letter occurrences per tenant. These five profiles become five test tenants — seed each as an E2E persona and run the full journey in CI.

---

*Compiled 2026-06-04 from parallel codebase audits (onboarding/settings, inventory, POS/sales, purchase, accounting) + ME market research. Re-audit after Tier 1 ships.*
