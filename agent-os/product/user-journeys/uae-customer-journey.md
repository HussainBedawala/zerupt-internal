# UAE Customer Journey — Mariam, 100% Flow Audit

**Audited:** 2026-06-05, on `main` (post PR #138 — import wizards merged) · **Companion docs:** `me-customer-journeys.md` (P2 = Mariam, P5 = Imran), `kuwait-customer-journey.md` (Yousef — shares all country-independent findings; this doc does NOT repeat them in full, it cross-references)
**Purpose:** map 100% of a UAE customer's flow, fears, and confusions; identify every gap; feed the prioritized fix plan. Same grading as the Kuwait doc: 🟢 works · 🟡 works-but-confusing/risky · 🔴 missing/wrong · ⚫ trust-killer.

**The one-line difference from Kuwait:** Yousef's risk is *money display* (KWD 3dp) and *missing rails* (KNET, IMEI). Mariam's risk is *the taxman*. UAE has a real, audit-happy tax authority (FTA, EmaraTax, AED 10k+ penalties, e-invoicing mandate 2026). Every gap below is weighted by "what happens when the FTA looks at her books."

---

## Part 1 — Who Mariam Is (Deep Profile)

| Attribute | Detail |
|---|---|
| Business | Abaya & modest-fashion boutiques — ready-made + made-to-order (15% of revenue) |
| Locations | Dubai (Jumeirah) + Sharjah (Al Majaz) + tailoring workshop — **two emirates** (this matters: VAT 201 Box 1 is per-emirate) |
| Size | 10 staff (2 managers, 6 floor, 2 tailors) · 3,000–5,000 SKUs in color/size/fabric **variants** · ~600 txns + 80 custom orders/month |
| Money | AED 180k–350k/month · AED = 2dp (system's hardcoded 2dp formatters are coincidentally safe for her) |
| Tax reality | **VAT-registered, 5%**, quarterly returns via EmaraTax · TRN on every tax invoice · retail prices legally **VAT-inclusive** (Consumer Protection Law) · corporate tax 9% above AED 375k profit · e-invoicing mandate phasing in 2026 |
| Current stack | Zoho Books + standalone POS + Google Sheets (custom orders) + Instagram/WhatsApp CRM |
| Language | Arabic-first owner, English-fluent; staff mixed; UAE invoices conventionally English-first bilingual |
| Payments | Heavily card (Visa/MC) · **Tabby/Tamara BNPL** is table-stakes in Dubai fashion retail · WhatsApp payment links for custom-order deposits |
| Trigger | Couldn't run a Ramadan promo across both outlets — no combined stock view; month-end Zoho↔POS reconciliation takes 2 days and AED 1,500/month in accountant fees |

### Her Psychology

**Why she'd switch:** one system = no reconciliation; cross-outlet stock visibility (losing sales when Dubai can't see Sharjah stock); stop paying the accountant to glue two systems together.

**Fears, ranked:**
1. **"Will my VAT history survive migration?"** — she has 3+ years of filed returns in Zoho. If opening balances don't tie to her last VAT 201, an FTA audit becomes her problem, not the software's. (Biggest fear per `me-customer-journeys.md`.)
2. **"Will a customer dispute a price?"** — her shelf price IS the final price (VAT-inclusive by law). Any system that adds 5% at the till creates a shop-floor argument and a Consumer Protection complaint.
3. **"Will my accountant accept the output?"** — quarterly VAT 201 filing; if the system can't produce the boxes, she's back to paying AED 1,500/month.
4. **"Will made-to-order break?"** — deposits, partial payments, delivery dates; 15% of revenue lives in Google Sheets today.
5. **"Can my staff use it?"** — bilingual UI, simple POS, managers per-branch.

**Deal-breakers (from P2):** no made-to-order/deposit workflow · no multi-outlet · no Arabic receipts · enterprise pricing · VAT history breaking in migration.

**Trust factors:** peer social proof (Dubai entrepreneur Instagram), bilingual UI, WhatsApp support in Arabic.

---

## Part 2 — The 100% Flow, Stage by Stage

> Country-independent findings (returns 🔴, transfers 🔴, offline POS 🔴, stock counts 🔴, guidance gaps G1–G7, empty-state dead-ends, placeholder dev copy, quick-start not event-driven, no help entry) are identical to Kuwait — see `kuwait-customer-journey.md` Parts 2–3. Below: UAE-specific findings only, plus shared blockers re-weighted for her.

### Stage 0 — Discovery → Signup → Provisioning
Same as Kuwait Stage 0. One UAE-specific note: the marketing site says "ZATCA e-invoicing and GCC VAT built in" (`apps/website/messages/en/home.json:101`) — ZATCA is Saudi-only in code. For a UAE buyer reading "e-invoicing built in" with the 2026 FTA mandate on her mind, this is an over-claim. 🟡

### Stage 1 — Onboarding Wizard (7 steps)

Materially better for UAE than for Kuwait — the VAT path is the designed-for path.

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 1.1 | 🟢 | AE country config correct: AED, 2dp, `taxRegime: "vat"`, label "VAT" | `countries.ts:63-74` |
| 1.2 | 🟢 | Step 4 shows real VAT machinery: registration toggle, zero-rated/exempt/reverse-charge toggles | `step4-tax.tsx`, `step4-transform.ts:36` |
| 1.3 | 🔴 | **TRN not validated.** UAE TRN is exactly 15 digits; schema accepts up to 30 chars, any charset, "intentionally NOT per-country" — a typo'd TRN prints on every tax invoice = FTA violation | `onboarding.dto.ts:453-463` |
| 1.4 | 🔴 | **No "are your prices VAT-inclusive?" question.** This is the single most consequential setting for a UAE retailer and it's never asked (see 7.1 — seed defaults to Exclusive) | step 4 schema |
| 1.5 | 🔴 | No VAT filing-period question (UAE standard = quarterly). No system notion of her return period exists at all | step 4 schema |
| 1.6 | 🟡 | SA gets a ZATCA e-invoicing toggle; AE gets nothing analogous despite the 2026 FTA mandate | `step4-tax.tsx:293` |
| 1.7 | 🟢 | Bilingual receipts default **ON** for AE (unlike the KW bug); payment defaults `["cash","visa_mc"]` are right | `onboarding-country-defaults.ts:34`, `getDefaultBilingualReceipts` |
| 1.8 | 🟡 | No emirate field when creating branches — `state` is a free-text varchar. Dubai + Sharjah branches are indistinguishable for tax purposes (feeds 9.2) | `org-structure.ts:79-84` |
| 1.9 | 🟡 | Truth-in-funnel (shared): wizard asks about transfers/serialized/PDCs that don't exist — for Mariam the sting is variants & made-to-order, which aren't even asked about | Kuwait doc 1.x |

### Stage 2 — Data Migration (Import Hub + wizards)

Her #1 fear lives here. The mechanics are mostly there; the *VAT continuity proof* is not.

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 2.1 | 🟢 | TRN importable on customers AND suppliers (`taxNumber` field exists in entity fields + schema) | `entity-fields.ts:58,68`, `sales.ts:82`, `purchase.ts:84` |
| 2.2 | 🟢 | Item `taxGroup` importable — her 5% vs zero-rated split can survive migration | `entity-fields.ts:48` |
| 2.3 | 🔴 | **Tax-group name mismatch silently nulls the item's tax group → item sells VAT-exempt.** A Zoho export saying "Standard Rate 5%" that doesn't string-match the seeded group = under-collected VAT on every sale of that item. Warning exists (`UNKNOWN_TAX_GROUP`) but the failure mode is silent at sale time | `import-validation.ts` |
| 2.4 | 🟡 | Opening VAT balance (her Zoho "VAT payable" as of cutover) imports only as a generic GL line via the opening-balance wizard — no dedicated VAT-balance field, no tie-out against her last filed VAT 201 | `opening-balance-import.service.ts` |
| 2.5 | 🔴 | **No reconciliation proof for VAT continuity** — nothing she can show the FTA/her accountant saying "closing Zoho VAT position = opening Zerupt VAT position." This is her stated biggest fear, unaddressed | (absent) |
| 2.6 | 🔴 | **No product variants.** 3,000–5,000 SKUs are color/size/fabric variants; the item model is flat. Her catalog imports as thousands of unrelated items — Ramadan repricing of "this abaya in all colors" is impossible | items schema |
| 2.7 | 🟡 | Shared import gaps apply: no undo, UTF-8-only parser, dup handling, no templates (Kuwait Stage 2) | Kuwait doc |

### Stage 3–5 — Go-Live, Orientation, Team
Identical to Kuwait Stages 3–5 (go-live irreversibility messaging, no help entry, placeholder copy, cashier-void-without-PIN). UAE delta: none found. Branch-scoped manager roles matter doubly for her (Dubai manager shouldn't touch Sharjah) — same finding as Kuwait 5.1.

### Stage 6 — Inventory Reality: Variants, Transfers, Custom Orders

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 6.1 | 🔴 | **Transfers 0% built** — her literal buying trigger (cross-outlet stock + moving abayas Dubai↔Sharjah for a promo) doesn't exist. Accounting listener is ready; the feature isn't | Kuwait doc 6.x |
| 6.2 | 🔴 | **No variants** (see 2.6) — matrix view, variant-level stock, bulk reprice across a style. Without it, her catalog is unmanageable at 5,000 SKUs | items schema |
| 6.3 | 🔴 | **No made-to-order / deposit workflow** — 15% of revenue: customer order, deposit (often via WhatsApp payment link), tailoring status, balance on delivery. Zero code for sales orders/quotations/deposits | (absent) |
| 6.4 | 🟡 | No stock count, no bulk reprice — shared (Kuwait 6.x); bulk reprice is acute for her at Ramadan promo time | Kuwait doc |

### Stage 7 — Selling: the VAT-inclusive till

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 7.1 | ⚫ | **AE VAT seeded as `Exclusive` — POS adds 5% on top of the entered price.** UAE retail prices are VAT-inclusive by law. She enters her shelf price AED 100 → customer is charged AED 105 → shop-floor dispute + Consumer Protection violation. The engine fully supports Inclusive (back-calculation built & tested) — it's one seed value + one onboarding question away | `tax-config.seed.ts:51`, `tax-calc.engine.ts:121-128` |
| 7.2 | 🟢 | VAT line in cart totals; receipt tax breakdown; "TAX INVOICE / فاتورة ضريبية" header — for UAE this header is *correct* (the same hardcoded header that's a ⚫ for Kuwait) | `cart-totals.tsx:43-47`, `receipt-document.tsx:90-92,192-198` |
| 7.3 | 🟢 | Seller TRN prints on receipt when set; bilingual labels follow locale; LTR layout matches UAE practice | `receipt-document.tsx:110-116` |
| 7.4 | 🔴 | **No full vs simplified tax-invoice distinction.** B2B sale > AED 10,000 requires a full tax invoice with buyer TRN; POS receipt has no buyer-TRN field, no per-line VAT amounts, no threshold logic. Her B2B buyers (hotels, event planners) can't recover input VAT from her receipts | `receipt-document.tsx`, `tax-document-types.ts:32` (sales invoice has buyer TRN; POS doesn't) |
| 7.5 | 🔴 | **No BNPL tenders (Tabby/Tamara)** — table-stakes in Dubai fashion retail. POS enum: cash/card/store_credit/gift_card only. Also no payment links (her custom-order deposits) and no bank transfer | `enums.ts:351-357`, `pos-transactions.dto.ts:113` |
| 7.6 | 🟡 | Card is one undifferentiated `"card"` bucket — Visa vs MC vs Amex acquirer reconciliation impossible (cardType/cardLast4 fields exist but tender doesn't split) | `pos-transactions.dto.ts:26,113,117-118` |
| 7.7 | 🟡 | Onboarding label `visa_mc` ≠ POS tender enum `card` — label mismatch between what she configured and what the till shows | `onboarding-country-defaults.ts:34` vs `enums.ts:351` |
| 7.8 | 🔴 | Shared blockers, re-weighted: **returns** (fashion = highest return rate of any vertical — more acute than for Yousef), offline POS, cash pay-in/out, void PIN | Kuwait doc Stage 7 |
| 7.9 | 🟢 | AED 2dp math: server reads decimals from settings (`country-currency.ts:22`, `pos-rounding.ts:16` — incl. correct AED 0.25 cash rounding); the three hardcoded-2dp client formatters are coincidentally safe for AED (still fix once for KWD) | audit §1 |

### Stage 8 — Restocking & Imports

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 8.1 | 🟢 | Input VAT on purchases posts to 1162; reverse-charge import accounts seeded (1162.10/2131.10) with correct chargedToCustomer=0 self-assessment | `coa-country-overlays.ts:8-46`, `tax-calc.engine.ts:163-165` |
| 8.2 | 🟡 | RCM (reverse charge on imports) has tax codes but **no workflow/guidance** — she imports fabric from Turkey/India; nothing tells her when/how to apply `VAT-AE-RC5` | `tax-config.seed.ts:72-82` |
| 8.3 | 🟡 | Shared: no PO layer, terminology drift, confirm-bill consequences unstated | Kuwait doc Stage 8 |

### Stage 9 — Money Truth: the FTA lens

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 9.1 | 🟢 | **VAT plumbing is genuinely built**: AE COA overlay (Input/Output VAT accounts, settlement account), per-line banker's rounding, zero-rated/exempt/RC categories seeded, tax-summary report with Box 9 non-recoverable disclosure | `coa-country-overlays.ts:157,177`, `tax-summary.service.ts`, `tax-summary.dto.ts:70-113` |
| 9.2 | 🔴 | **No emirate dimension anywhere** → VAT 201 **Box 1 (standard-rated supplies per emirate) cannot be produced**. With Dubai + Sharjah branches she literally cannot fill in her return from Zerupt output | `org-structure.ts:79-84`, `tax-summary.dto.ts` (legalEntityId scope only) |
| 9.3 | 🔴 | **No VAT 201 box mapping** — tax summary rows must be hand-mapped to the 16-box form every quarter; that's exactly the accountant dependency she's paying AED 1,500/month to escape | `tax-summary.dto.ts` |
| 9.4 | 🔴 | **No FTA Audit File (FAF) export** — an FTA electronic audit request cannot be answered | (absent) |
| 9.5 | 🔴 | **No e-invoicing scaffolding for UAE** (Peppol/BIS, FTA portal) — zero references; only SA/ZATCA exists. 2026 mandate is live risk within the product's launch year | codebase-wide search |
| 9.6 | 🟡 | No out-of-scope tax category seeded for AE — out-of-scope supplies miscoded as exempt distort Box 1 turnover | `tax-config.seed.ts:17` |
| 9.7 | 🟡 | Corporate tax 9% (> AED 375k profit): no CT module, no CT accounts. She's likely above threshold across two boutiques. Document as known limitation, not a launch blocker | (absent) |
| 9.8 | 🔴 | Shared: no balance sheet, no AP aging, no per-branch P&L (per-branch P&L is acute — two boutiques), no expense entry UX, dead-letter invisible | Kuwait doc Stage 9 |

### Stage 10 — Quarter-End & the EmaraTax Filing
The Kuwait Stage 10 was "the accountant visits quarterly." Mariam's is harder: **a legal filing deadline with penalties** (AED 1,000 first late return, escalating). What she needs on day 28 after quarter-end: Box-1-per-emirate, Box 3/4 zero-rated & exempt totals, Box 6/7 RCM, Box 9 adjustments, net payable — and confidence that opening VAT balances from Zoho tied out. Today she gets: an aggregate tax summary (good), no emirate split (fatal for Box 1), no box mapping, no FAF. **Prediction: she keeps her accountant AND the AED 1,500/month — which deletes half the switching ROI.** Churn risk peaks at her first quarter-end, ~90 days in, same as Yousef but with a statutory trigger.

---

## Part 3 — Gap Analysis: What's UAE-Specific vs Shared

**Shared with Kuwait (fix once, both win):** returns, transfers, offline POS, cash mgmt, void PIN, guidance layer G1–G7, import safety/undo/encoding, balance sheet, AP aging, per-branch P&L, expense entry, one shared currency formatter.

**UAE-specific (new work):**

| Gap | Severity | Shape of fix |
|---|---|---|
| VAT-inclusive pricing default | ⚫ trust-killer | Seed AE `VAT-AE-5` as Inclusive for retail + step-4 question "Do your shelf prices include VAT?" (default yes for retail) |
| TRN 15-digit validation | 🔴 | Per-country regex in `taxRegistrationNumberSchema` (AE: `^\d{15}$`), reusable for SA (15) / BH (9+) later |
| Emirate on branch + sale | 🔴 | `emirate` enum on branch; stamp on transactions; group tax summary Box 1 by it |
| VAT 201 box mapping | 🔴 | Report view mapping existing tax-summary categories → boxes 1–16; emirate split feeds Box 1 |
| Full vs simplified tax invoice | 🔴 | Buyer-TRN capture at POS for B2B; auto-switch to full format > AED 10,000; per-line VAT on full invoices |
| Tax-group import mismatch → silent exempt | 🔴 | Block (not warn) items with unresolvable tax group in VAT countries; or map-assist UI |
| VAT continuity reconciliation | 🔴 | Cutover screen: "Zoho closing VAT position → Zerupt opening VAT balance" tie-out she can print |
| BNPL (Tabby/Tamara) + payment links | 🔴 (vertical) | New tender types; Tabby/Tamara are settlement-level integrations later, tender labels now |
| Filing-period setting | 🟡 | Step-4 quarterly/monthly; powers return-period framing in tax summary |
| FAF export | 🟡 | CSV/XML per FTA spec — needed before first real audit, not before go-live |
| e-invoicing scaffolding | 🟡 (2026) | Settings flag + architecture note now; Peppol later. Also soften the website claim |
| RCM workflow guidance | 🟡 | Purchase-bill flow: "overseas supplier?" → apply RC code with explanation |
| Out-of-scope tax code | 🟡 | Add `VAT-AE-OOS` seed |
| Variants + made-to-order/deposits | 🔴 (vertical) | Her deal-breakers; big features — schedule consciously, don't pretend |
| Corporate tax 9% | 🟡 (document) | Out of scope for MVP; say so explicitly |

---

## Part 4 — Verdict & Prioritized Fix Plan

### Can Mariam go live today?
**No — but she's closer than Yousef.** Scorecard against her deal-breakers:

| Deal-breaker | Status |
|---|---|
| Multi-outlet | 🟡 branches exist; transfers + combined-stock view + per-branch P&L missing |
| Arabic receipts | 🟢 bilingual default ON for AE |
| VAT history surviving migration | 🔴 imports as a blind GL line; no tie-out proof |
| Made-to-order / deposits | 🔴 0% |
| Price-as-displayed (VAT-inclusive) | ⚫ actively wrong by default |
| Quarterly filing without accountant | 🔴 no Box 1 split, no box mapping |

The deep difference vs Kuwait: **the accounting engine is ready for her** (VAT calc, COA, RC, tax summary — all real). What's missing is the last compliance mile (inclusive pricing, TRN, emirate, boxes) and her vertical (variants, custom orders). Kuwait's gaps were rails; UAE's gaps are precision.

### Tier 0 — Trust & correctness one-liners (days)
1. **AE inclusive-pricing default** + step-4 question (⚫ 7.1) — single highest-leverage UAE fix
2. **TRN regex** for AE in onboarding + entity import (1.3)
3. Soften website "e-invoicing built in" claim or scope it to SA (Stage 0)
4. (Shared Tier 0 from Kuwait doc applies: one currency formatter, KW tax label, etc.)

### Tier 1 — Compliance blockers before any UAE go-live
5. Emirate on branch + transaction; Box-1-per-emirate in tax summary (9.2)
6. VAT 201 box-mapped report view (9.3)
7. Tax-group import: block/assist instead of silent-exempt (2.3)
8. VAT continuity tie-out screen in opening-balance wizard (2.5)
9. Full vs simplified tax invoice + buyer TRN at POS (7.4)
10. (Shared Tier 1: returns, transfers, offline, cash mgmt, per-branch P&L — all hit her too)

### Tier 2 — Guidance layer
Same as Kuwait Tier 2, plus: RCM purchase guidance (8.2), filing-period awareness ("your Q2 return covers Apr–Jun; 14 days left").

### Tier 3 — The vertical unlock (UAE fashion)
11. Product variants (matrix, variant stock, bulk reprice) (2.6/6.2)
12. Made-to-order: sales orders + deposits + status (6.3)
13. BNPL tenders + payment links (7.5)
14. FAF export (9.4); e-invoicing scaffolding ahead of 2026 (9.5)

### What must be 100% before HER go-live
- Till charges exactly the shelf price, VAT embedded and shown
- Her TRN — validated, on every document; buyer TRN on B2B over 10k
- Quarter-end: she opens one report and fills EmaraTax box-by-box, including Box 1 per emirate
- Migration ends with a printable "your VAT position carried over intact" proof
- Two boutiques: combined stock view, transfer, per-branch P&L

---

## Part 5 — Live Test Plan: UAE Sub-Flows

Same harness, environment, conventions, and reporting as `kuwait-customer-journey.md` Part 5 (§5.0, §5.3) — headed Playwright + Supabase + Neon verification, fresh tenant per run (`mariam.test+<n>@zerupt-e2e.com`, country **AE**). **Test data for Mariam does not exist yet** — generate a Zoho-Books-flavored set (mirror of `test-data/yousef/`, but: AED 2dp, TRN columns, item tax groups "Standard Rate"/"Zero Rate", variants-as-flat-SKUs, customer list with B2B TRNs, opening TB including a VAT Payable balance) before running L3–L5.

| Layer | UAE delta on top of the Kuwait layer |
|---|---|
| L1 Signup | Same. |
| L2 Onboarding | Country AE. Verify: step 4 VAT toggles; enter a **14-digit TRN** → expect it to be wrongly accepted (1.3); bilingual receipts default true; payment defaults cash+visa_mc; DB: tax codes seeded with `VAT-AE-5` and note its `type` (expect Exclusive — the ⚫). |
| L3 Products | Import items with `taxGroup` column where 10 rows have a non-matching name → verify they land with NULL tax group (2.3) and confirm a sale of one charges 0 VAT. |
| L4 Customers/Suppliers | TRN column round-trips to `tax_number` in DB; B2B customers flagged. |
| L5 Opening balances | TB includes "VAT Payable 12,345.67" → verify which account it maps to and that nothing ties it to a return period (2.4/2.5). |
| L6 Go-live | Same. |
| L7 First sale | **The money shot:** item priced AED 100 → verify till total (expect 105 = bug 7.1, screenshot); receipt shows TAX INVOICE + seller TRN + tax breakdown (expect 🟢); attempt B2B sale AED 12,000 → no buyer-TRN prompt (7.4). DB: JE posts Output VAT to 2131; banker's-rounded per line. |
| L8 Books truth | Tax summary report: output/input/net for the period; verify no emirate dimension (9.2) and hand-check its numbers vs SQL `journal_lines` on 2131/1162. |

---

*Sources: 3 parallel audits (2026-06-05) on `main` — VAT engine & compliance, AED/payments/POS/import operations, persona source (`me-customer-journeys.md` P2/P5). Country-independent findings inherited from the 6-agent Kuwait audit (2026-06-04). File:line evidence inline.*
