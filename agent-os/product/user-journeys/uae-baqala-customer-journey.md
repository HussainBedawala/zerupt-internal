# UAE Baqala Customer Journey — Imran, 100% Flow Audit

**Audited:** 2026-06-08, on `main` (post PR #138) · **Companion docs:** `me-customer-journeys.md` (P5), `uae-customer-journey.md` (Mariam — shares all UAE-VAT findings, not repeated), `kuwait-customer-journey.md`. **Test data:** `test-data/legacy-raw/p5-imran-uae/` (Tally + Windows-POS export: items, customers, suppliers, TB, location-wise stock, physical stock book, AR/AP aging).
**Purpose:** map 100% of a 5-store Dubai baqala chain owner's flow, fears, gaps; feed the fix plan. Grading: 🟢 works · 🟡 risky · 🔴 missing/wrong · ⚫ trust-killer.

**The one-line difference:** Mariam is the *compliance-precision* UAE customer; Imran is the *scale-and-operations* UAE customer. Same 5% VAT engine, but his pain is **5 stores, 12,000 txns/month, 22 Urdu/Hindi staff, >40% cash, and an AED 8,000 cash hole he found a month too late.** He's the closest fit of the five personas — and not price-sensitive if ROI is clear — but still blocked on day-1 operational items.

---

## Part 1 — Who Imran Is (Deep Profile)

| Attribute | Detail |
|---|---|
| Business | 5 baqalas across Dubai (Al Quoz, Deira, Jumeirah, International City, Discovery Gardens); 6th opening |
| Size | 5 outlets · 22 staff (all South-Asian managers/cashiers) · ~15,000 SKUs (food expiry + FMCG barcodes) · ~12,000 txns/month, AED 20–80 ticket · AED 450k–700k/month |
| Money | AED = 2dp (formatters safe) |
| Tax reality | 5% UAE VAT with **SKU-level zero-rated basic foods vs standard split** (same FTA surface as Mariam — see `uae-customer-journey.md`) |
| Stack | 6-year-old Windows POS + part-time Tally accountant (books 2 weeks stale) + physical stock books + verbal/WhatsApp purchasing + **>40% cash** |
| Language | All staff Urdu/Hindi |

### His Psychology
**Trigger:** found an AED 8,000 cash discrepancy at International City only at month-end. A competitor "manages everything from his phone while in Pakistan" — that story stuck.
**Why switch:** mobile owner dashboard across all stores; cash/shift variance alerts; current setup can't scale to store #6. Not price-sensitive if ROI is clear ("AED 5,000/month shrinkage stops = pays for itself").

**Fears, ranked:**
1. **"Can I watch all 5 stores from my phone?"** — the competitor envy.
2. **"Will I catch cash theft same-day, not month-end?"** — the AED 8k.
3. **"Will the POS keep up at 400–500 txns/day without lag or going down?"**
4. **"Can my Urdu/Hindi staff actually use it?"**
5. **"Will 15,000 SKUs import from my old POS?"**

**Deal-breakers (P5):** no mobile dashboard · POS lag at 400–500 txns/day · no cash management/till reconciliation · onboarding needing a consultant · English-only UI for Urdu/Hindi staff · no offline mode.
**Trust factors:** live 5-outlet dashboard demo, shift reconciliation walkthrough, "5 stores live in one day", SKU import from his POS export.

---

## Part 2 — The 100% Flow, Stage by Stage

> UAE-VAT findings (inclusive-pricing default ⚫, TRN validation, tax-group import silent-exempt, full/simplified invoice, emirate dimension for Box 1) are identical to `uae-customer-journey.md` — for a baqala the inclusive-pricing bug is **acute** (shelf prices are king). Shared findings (returns, transfers) from Kuwait doc. Below: his scale/ops-specific.

### Stage 1 — Onboarding & Scale

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 1.1 | 🟢 | Org model scales: unlimited `branches` per legal entity, `user_branches` per-user access, warehouse-per-branch with one-default constraint, registers scoped to branch+warehouse | `org-structure.ts:59,124`, `pos.ts` |
| 1.2 | ⚫ | UAE VAT seeded **Exclusive** — baqala shelf prices are VAT-inclusive by law; till adds 5% on top → customer dispute at AED 20–80 tickets all day (inherited from Mariam 7.1) | `tax-config.seed.ts:51` |
| 1.3 | 🟡 | "Onboarding needing a consultant" is his deal-breaker; 15k SKUs + 5 stores is the hardest self-serve case — guidance-layer gaps (Kuwait G1–G7) bite hardest here | Kuwait doc Part 3 |

### Stage 2 — Migration at 15,000 rows

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 2.1 | 🟢 | Import handles his volume: 50k-row cap, 500-row atomic chunks (15k = 30 chunks, partial-failure isolated), CSV+Excel, barcode dedup (intra-file + cross-tenant), 5-rung column resolver (en+ar aliases + LLM) | `import.types.ts:22`, `import-apply.service.ts:16`, `import-validation.ts:32,271`, `import-column-aliases.ts` |
| 2.2 | 🟡 | Column aliases are en+ar only — his Windows-POS headers ("Item Code", "MRP", "HSN") need the LLM rung + a human mapping review; not silent auto-import | `resolver/data/import-column-aliases.ts` |
| 2.3 | 🟢 | Zero-rated basic-food vs standard split is SKU-level (`items.taxGroupId`), survives import → sale → VAT return (same mechanism as Bahrain/Mariam) | `inventory-items.ts:139-141`, `tax.ts:93` |

### Stage 3–6 — Multi-store ops
Shared go-live/team/inventory findings. Multi-store deltas:

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 6.1 | 🔴 | **Per-branch P&L missing** — `/reports/profit-and-loss` accepts `legalEntityId` only; GL JEs aren't branch-tagged. He cannot answer "how much did Store 3 make?" — fundamental for a 6-store chain | `profit-and-loss.service.ts:138` |
| 6.2 | 🟢 | Consolidated + per-branch dashboard/daily-sales/top-sellers via `branchId` filter (null = tenant rollup) | `daily-sales.service.ts:106-191` |
| 6.3 | 🔴 | Transfers 0% built — moving stock between 5 stores is manual (shared Kuwait 6.x) | Kuwait doc |

### Stage 7 — Selling at volume + cash control (his core)

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 7.1 | 🟢 | **POS performs at his volume:** barcode lookup is O(1) IndexedDB primary-key get (no server call when synced); search debounced 300ms, min-2-char, local-first filter — no per-keystroke N+1; offline-first engine with reconnect replay + e2e | `catalog-repo.ts:110-119`, `catalog-panel.tsx:39`, `pos/offline/*` |
| 7.2 | 🟡 | No service worker → "offline" needs the tab to stay open; a fresh load while offline can't fetch the app shell | (absent) |
| 7.3 | 🟢 | Shift close computes `expectedCash = openingFloat + cashSales − refunds − payOuts + payIns`, `cashOverShort = actual − expected`, persisted + auto-posted to GL; Z-report endpoint built | `pos-shifts.service.ts:325-326`, `pos.listener.ts` |
| 7.4 | ⚫ | **But pay-in/pay-out API is missing** (codemap: "cash-movements API still pending"). No mid-shift cash-drop/top-up entry, no UI, no denomination count screen. `payIns`/`payOuts` are always 0 → **`expectedCash` is systematically overstated** for any store doing cash lifts → the AED 8,000 variance he switched to catch is computed wrong | `pos.ts` (table only), codemap |

### Stage 8–9 — Books & the mobile dashboard

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 8.1 | 🟡 | **Mobile dashboard = responsive web, not native.** KPI cards stack on phone (`grid-cols-1 sm:grid-cols-3`); PWA manifest exists but **no service worker** (decorative); 60s `staleTime`, no push, no WebSocket, no `/mobile` route. He *can* see all-store KPIs in a phone browser via branch filter — but no push alert for a cash variance, no real-time | `kpi-cards.tsx:22`, `manifest.ts` |
| 8.2 | 🟢 | DEV-330 auto-posts sales/returns/voids/shift-close to GL — kills his "books 2 weeks stale" pain | `pos.listener.ts` |
| 8.3 | 🔴 | Shared: no balance sheet, AP aging; per-branch P&L (6.1) is the acute one | Kuwait doc |

### Stage — Staff language

| # | Grade | Finding | Evidence |
|---|---|---|---|
| L.1 | 🔴 | **i18n hard-coded to `["en","ar"]`** — no Urdu/Hindi. All 22 staff must use English or Arabic. Adding Urdu (RTL) or Hindi (LTR) = 20+ namespace JSON files + routing/RTL config; architecture allows it, content doesn't exist | `i18n/routing.ts:10,16`, `messages/` |

### Stage 10 — Scaling to Store #6
What he wants: open the app on his phone in Pakistan, see today's cash and variance per store, get pinged when a till is short. What exists: a responsive web dashboard (good), correct variance math (good) — undermined by missing pay-in/out (variance wrong), no push, no per-branch P&L, no Urdu. **He's the closest to live, but the cash-variance promise — his whole reason — is silently inaccurate until cash-movements ships.**

---

## Part 3 — Gap Analysis: Baqala-Specific

| Gap | Severity | Shape of fix |
|---|---|---|
| Pay-in/pay-out cash-movements API + UI | ⚫ (breaks his core promise) | `POST /pos/cash-movements`, mid-shift entry + denomination count screen; makes `expectedCash` correct |
| UAE inclusive-pricing default | ⚫ | Inclusive seed + onboarding question (shared with Mariam) |
| Per-branch P&L | 🔴 | Branch-tag GL JEs; `branchId` param on P&L |
| Urdu/Hindi UI | 🔴 | Add locales + 20+ namespace translations + RTL for Urdu |
| Mobile: push + real-time + service worker | 🟡 | Push for variance/daily-close; WebSocket or shorter poll; SW for app-shell offline |
| Transfers (5-store) | 🔴 | Shared Kuwait fix |
| Import header aliases for SA POS exports | 🟡 | Extend alias dictionary; keep mapping-review step |

---

## Part 4 — Verdict & Fix Plan

### Can Imran go live today?
**Closest of the five — but no.** His POS scales, import handles 15k, books auto-post — but his three headline asks each have a hole: cash variance is miscomputed (no pay-in/out), the dashboard isn't truly mobile (no push/real-time), and staff have no Urdu.

| Deal-breaker | Status |
|---|---|
| Mobile dashboard | 🟡 responsive web; no push/real-time/native |
| POS lag at volume | 🟢 well-engineered |
| Cash management / till recon | ⚫ math built but pay-in/out missing → variance wrong |
| Onboarding without consultant | 🟡 import strong; guidance-layer gaps hurt at his scale |
| Urdu/Hindi UI | 🔴 en/ar only |
| Offline mode | 🟡 IndexedDB yes; no service-worker shell |

### Tier 0 (days)
1. Ship pay-in/pay-out cash-movements API + UI (makes his core metric truthful).
2. UAE inclusive-pricing default (shared with Mariam).

### Tier 1 — Baqala go-live blockers
3. Per-branch P&L (branch-tagged JEs)
4. Mobile push + real-time for variance/daily-close
5. Urdu UI (Hindi follow-on)
6. Transfers; shared Tier 1 (returns)

### Tier 2 — Scale polish
Service-worker app-shell offline; denomination-count close screen; import alias coverage for legacy POS headers.

### What must be 100% before HIS go-live
- Cash variance is correct same-day, per store, with a phone alert when a till is short
- He can see per-store profit, not just company-wide
- Staff operate the POS in their language
- 15k SKUs import in one pass with a single mapping review

---

## Part 5 — Live Test Plan: Baqala Sub-Flows
Same harness/conventions as `kuwait-customer-journey.md` §5.0/§5.3 — fresh tenant `imran.test+<n>@zerupt-e2e.com`, country **AE**, **5 branches**, data from `test-data/legacy-raw/p5-imran-uae/`.

| Layer | Baqala delta |
|---|---|
| L2 Onboarding | Create 5 branches; verify org model holds; confirm VAT seeded Exclusive (the ⚫). |
| L3 Products | Import `01-items-pos-export.csv` (15k rows) → verify chunked apply, mapping-review step, barcode dedup, zero-rated food tagging survives. |
| L5 Opening stock | `05-location-wise-stock.csv` across 5 warehouses → verify per-warehouse stock sums. |
| L7 Operations | Run a shift: cash sales + a mid-shift cash drop → verify **no pay-in/out entry exists**, so `expectedCash` ignores the drop and variance is wrong (the ⚫). Close shift, check `cashOverShort` JE. Barcode-scan throughput sanity at speed. |
| L8 Dashboard/books | Open dashboard on a mobile viewport (Playwright device emulation): verify per-branch + consolidated KPIs render; confirm **no push, no per-branch P&L** (`/reports/profit-and-loss` rejects `branchId`). Switch UI locale → confirm only en/ar available. |

---

*Sources: parallel audit (2026-06-08) on `main` — multi-outlet scale, mobile dashboard, cash/shift reconciliation, POS performance/offline, zero-rated split, i18n, 15k import. UAE-VAT findings inherited from Mariam (3-agent) audit; shared findings from Kuwait (6-agent). File:line inline.*
