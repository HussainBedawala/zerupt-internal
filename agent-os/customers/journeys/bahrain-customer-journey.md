# Bahrain Customer Journey — Dr. Ahmed, 100% Flow Audit

**Audited:** 2026-06-08, on `main` (post PR #138) · **Companion docs:** `me-customer-journeys.md` (P4), `kuwait-customer-journey.md`, `uae-customer-journey.md` — shared findings inherited, not repeated. **Test data:** `test-data/legacy-raw/p4-dr-ahmed-bhr/` (QuickBooks-flavored: items, batch/expiry whiteboard, customers, suppliers, TB, opening stock, AR aging, supplier PDC register).
**Purpose:** map 100% of a Bahraini community pharmacist's flow, fears, gaps; feed the fix plan. Grading: 🟢 works · 🟡 risky · 🔴 missing/wrong · ⚫ trust-killer.

**The one-line difference:** Yousef = 3dp display; Mariam = VAT precision; Abu Khalid = ZATCA. Dr. Ahmed = **two things at once that nobody else needs together** — (1) a *mixed-rate basket* (0% prescription + 10% OTC in one sale) and (2) *batch/expiry FEFO* on 4,500 regulated SKUs. He was fined BHD 500 for VAT miscategorization and wrote off BHD 2,000 of expired stock. He buys *correctness*. And BHD is **3 decimal places** — so he inherits Yousef's entire fils-truncation surface.

---

## Part 1 — Who Dr. Ahmed Is (Deep Profile)

| Attribute | Detail |
|---|---|
| Business | Single community pharmacy + health/beauty store; owner is the pharmacist |
| Size | 1 outlet · 5 staff · ~4,500 SKUs (**all batch/expiry tracked, FIFO/FEFO regulatory**) · ~800 txns/month · BHD 18k–30k/month |
| Money | **BHD = 3 decimal places** (1 dinar = 1000 fils) — same truncation risk surface as Kuwait |
| Tax reality | **10% Bahrain VAT (NBR)** with **mixed rates in one basket**: prescription drugs 0% zero-rated, OTC/cosmetics 10% standard |
| Stack | QuickBooks Online + legacy pharmacy POS + whiteboard expiry tracking + Excel supplier PDCs (60–90 day terms) |
| Language | Arabic/English |

### His Psychology
**Trigger:** NBR auditor questioned his VAT-return methodology; once fined BHD 500 for miscategorization. Wrote off BHD 2,000 of expired stock because the whiteboard wasn't updated.
**Why switch:** auto zero-rated/standard split on the VAT return; near-expiry alerts that pay for the software by themselves.

**Fears, ranked:**
1. **"Will the 0%/10% split be right on the return?"** — the fine already happened once.
2. **"Will I sell expired stock / write off again?"** — needs FEFO + near-expiry alerts.
3. **"Will every fils be correct?"** — BHD 3dp on receipts and reports.
4. **"Will POS and books finally be one system?"** — they're separate today.
5. **"Will my 60–90 day supplier cheques be tracked?"**

**Deal-breakers (P4):** can't mix 0% + 10% in one transaction · no batch/expiry tracking · POS and accounting not integrated · price above ~BHD 80/month · no supplier PDC management.
**Trust factors:** demo of a dual-rate receipt with correct NBR split, expiry-alert walkthrough, Bahrain pharmacy reference.

---

## Part 2 — The 100% Flow, Stage by Stage

> Shared findings (returns, transfers, balance sheet, guidance gaps, import undo/encoding) = Kuwait/UAE docs. BHD 3dp truncation = same three files as Kuwait. Below: Bahrain-specific.

### Stage 1 — Onboarding

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 1.1 | 🟢 | BH config correct: BHD, **decimals 3**, vat; `VAT-BH-10` 10% + `VAT-BH-0` 0% seeded | `countries.ts:75-80`, `currency.ts:18`, `tax-config.seed.ts:117-155` |
| 1.2 | 🔴 | **Zero-rated tax GROUP not auto-seeded for BH** — only the *code* `VAT-BH-0` exists, not a group wrapping it. If he doesn't hand-create it, every item gets 10% and his Rx lines are miscategorized — the exact fine he's already paid | `tax-config.seed.ts:137-155` |
| 1.3 | 🟢 | POS-GL auto-posting built (DEV-330): sale/return/void/shift-close all post journals — answers "POS and books are separate" | `pos.listener.ts:113,192,268,366` |

### Stage 2 — Migration
Shared mechanics. Bahrain note: `02-batch-expiry-whiteboard.csv` (his whiteboard digitized) and `08-supplier-pdc-register.csv` have **no import destinations** (no batch table, no PDC table — see 6.x/8.x). 🔴

### Stage 6 — Inventory: Batch / Expiry / FEFO (his core)

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 6.1 | 🟡 | FIFO costing **is** built: `inventory_cost_layers` per inbound GRN batch, `remainingQty`, FIFO consumption index | `inventory-costing.ts:196-304` |
| 6.2 | 🟡 | GRN receipt lines **capture** `batchNumber` + `expiryDate` at receipt | `purchase.ts:821-824` |
| 6.3 | 🔴 | **But expiry isn't enforced or usable.** `trackingType` defaults `"none"` ("serial/batch reserved for future"); **no `batches` table** (`cost_layers.batchId` is a nullable UUID with "TECH DEBT: add FK once batches table exists"); **expiryDate is NOT propagated to cost layers** → cannot do FEFO (nearest-expiry-first); **no near-expiry alert, no `shelf_life_days`**; nothing stops a cashier selling expired stock | `inventory-items.ts:156-157`, `inventory-costing.ts:232` |
| 6.4 | ⚫ | Net effect: **his #2 deal-breaker (batch/expiry) is effectively unbuilt** for pharmacy use. Data goes in at GRN and is invisible thereafter — the BHD 2,000 write-off recurs | derived |

### Stage 7 — Selling: the mixed-rate till (his #1)

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 7.1 | 🟢 | **Mixed-rate basket works at the engine level.** `calculateTax` is per-line: each line carries its own `taxCodeId`/rate/category; one basket can hold a `VAT-BH-0` line and a `VAT-BH-10` line; summary separates by code. `pos_transaction_lines.tax_group_id` is per-line | `pos-money/tax-engine.ts`, `pos.ts:448-449` |
| 7.2 | 🔴 | **Conditional on 1.2** — without the seeded zero-rated group there's nothing to tag Rx with, so in practice the basket isn't mixed-rate out of the box | `tax-config.seed.ts:137-155` |
| 7.3 | 🟡 | Dual-rate **receipt** split not confirmed at the POS print template (tax-summary report splits correctly; the printed receipt's per-rate breakdown needs a template check) | `tax-summary.service.ts:20-21` |
| 7.4 | 🔴 | **BHD 3dp display broken** — same three formatters as Kuwait: `reports/lib/format.ts:37`, `inventory/lib/display.ts:13-16`, `purchase/lib/display.ts:13-16` all hardcode 2dp. A `displayMoney3` exists in purchase but is **never called**. BHD 5.123 shows as 5.12 on AP, stock, and reports | those files |

### Stage 8 — Supplier PDCs (60–90 day)

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 8.1 | 🟢 | PDC flag defaults **ON** for BH; COA has cheques-in-transit/in-hand/issued sub-types | `onboarding-country-defaults.ts:59-60`, `enums.ts:549,553,559` |
| 8.2 | 🔴 | **No PDC workflow:** no `supplier_pdcs` table, no maturity tracking, no due-date alerts, no auto bank-posting on clearance; purchase `cheque` method "deferred". He tracks 60–90 day cheques in Excel still | `enums.ts:446`, schema |

### Stage 9 — Money Truth: the NBR return

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 9.1 | 🟢 | **NBR split is built** — tax-summary groups output/input tax by category (standard 10% vs zero_rated 0%); legacy-gap handling present | `tax-summary.service.ts:76,127,281-287` |
| 9.2 | 🔴 | **Conditional on correct item tagging** (1.2/7.2): if Rx items aren't on a zero-rated group, the split is wrong — reproducing his original fine | derived |
| 9.3 | 🟡 | COGS reversal on returns/voids is emitted by the inventory engine, not the POS listener — confirm wired or returns lose COGS | `pos.listener.ts:242,418` |
| 9.4 | 🔴 | Shared: no balance sheet, AP aging, expense entry | Kuwait doc |

### Stage 10 — The NBR Audit
What the auditor checks: that 10% was charged on OTC and 0% on Rx, return-by-return. The engine can produce this **if and only if** every SKU is correctly grouped — and the zero-rated group isn't seeded, so the default path miscategorizes. Add the unenforced expiry and he's exposed on both fronts he switched to fix. **Churn/fine risk peaks at his first NBR return.**

---

## Part 3 — Gap Analysis: Bahrain-Specific

| Gap | Severity | Shape of fix |
|---|---|---|
| Zero-rated tax group not seeded for BH | ⚫ (causes the exact fine) | Seed a "Bahrain VAT Zero-Rated" group on BH onboarding; same for other 0%-line countries |
| Batch/expiry FEFO + near-expiry alerts | ⚫ (his core need, unbuilt) | `batches` table + FK; propagate `expiryDate` to cost layers; FEFO consumption; near-expiry report/alert; block expired sale. Spec exists (`inventory/06-serial-batch.md`) — implement |
| BHD 3dp display (3 formatters) | 🔴 | One shared currency formatter reading decimals from settings (shared fix with KWD) — and wire the existing `displayMoney3` |
| Dual-rate receipt print split | 🟡 | Per-rate breakdown on the POS receipt template |
| Supplier PDC module | 🔴 | `supplier_pdcs` table + maturity/alerts/clearance posting (shared with KSA) |
| COGS reversal on returns | 🟡 | Confirm inventory-engine reversal is wired |

---

## Part 4 — Verdict & Fix Plan

### Can Dr. Ahmed go live today?
**No.** Both of his deal-breakers fail in practice: the mixed-rate basket has the engine but not the seeded group, and batch/expiry is capture-only with no FEFO/alerts.

| Deal-breaker | Status |
|---|---|
| Mix 0% + 10% in one txn | 🟡 engine yes / 🔴 zero-rated group not seeded |
| Batch/expiry tracking | ⚫ capture-only, no FEFO/alerts/enforcement |
| POS + accounting integrated | 🟢 built (DEV-330) |
| Price ≤ ~BHD 80/month | (pricing decision — not a code gap) |
| Supplier PDC management | 🔴 0% workflow |

### Tier 0 (days)
1. Seed the BH zero-rated tax group (turns the engine's latent capability on for him) — highest leverage, smallest fix.
2. Shared BHD/KWD currency formatter; wire `displayMoney3`.

### Tier 1 — BH go-live blockers
3. Batch/expiry FEFO + near-expiry alerts + block-expired-sale
4. Supplier PDC module (shared with KSA)
5. Dual-rate receipt split; confirm COGS-on-returns
6. Shared Tier 1: returns, balance sheet, AP aging

### What must be 100% before HIS go-live
- Rx rings at 0%, OTC at 10%, in one basket, on the receipt and the NBR return
- The system warns before expiry and refuses to sell expired stock
- Every fils correct (BHD 3dp) everywhere
- Supplier PDCs tracked to maturity

---

## Part 5 — Live Test Plan: Bahrain Sub-Flows
Same harness/conventions as `kuwait-customer-journey.md` §5.0/§5.3 — fresh tenant `ahmed.test+<n>@zerupt-e2e.com`, country **BH**, data from `test-data/legacy-raw/p4-dr-ahmed-bhr/`.

| Layer | Bahrain delta |
|---|---|
| L2 Onboarding | Verify BHD decimals=3 in tenant settings; check whether a zero-rated tax **group** exists post-seed (expect only the code, not a group). |
| L3 Products | Import `01-items-quickbooks.csv`: tag some Rx items zero-rated → if no group exists, observe they fall to 10%. Import `02-batch-expiry-whiteboard.csv` → verify no batch destination. |
| L5 Opening balances | `08-supplier-pdc-register.csv` → no PDC destination; TB cheque accounts empty. |
| L7 First sale | **The money shot:** one basket = 1 Rx (expect 0%) + 1 OTC (expect 10%); verify per-line VAT in DB + receipt; verify all amounts render 3dp (expect 2dp bug). Attempt to sell an expired batch → expect no block. |
| L8 Books | Tax summary standard vs zero-rated split — hand-check vs SQL on 2131/`VAT-BH-*`; verify return-ready split only if items tagged. |

---

*Sources: parallel audit (2026-06-08) on `main` — mixed-rate engine, batch/expiry/FIFO, NBR split, BHD 3dp, PDC, POS-GL. Shared findings inherited from Kuwait + UAE audits. File:line inline.*
