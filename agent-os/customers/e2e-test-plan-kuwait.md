# Kuwait E2E Test Plan — 3 Personas (2026-06-15)

Full-product shakedown driven through the **gstack `/browse` skill** (founder runs first pass on
**live/prod**). Every persona = a throwaway tenant, deleted after testing. Verify each important
event **twice**: on the frontend AND in the tenant DB. Log every issue into
`erp/docs/e2e-issues-log.md` (same format as the existing entries: `ISSUE-N — title STATUS CATEGORY`,
Where / What / Impact / Root-cause direction).

## How to run
1. Founder signs up a fresh account per persona → completes onboarding → go-live.
2. Import the persona's files (in the order under each persona below), from onboarding **and** from
   in-product `/import` and the individual screens (inventory/customers/suppliers).
3. Upload images where noted (logo in settings, a couple of product/customer images).
4. Walk the **Owner Day-One flow** (§ below).
5. Note every mismatch → founder pastes findings here → Claude updates the issues log.

## Status legend (mirror the issues log)
`OPEN · IN PROGRESS · FIXED · WONTFIX · NEEDS-INFO` · Categories: `UI · BACKEND · AI · DB · ACCOUNTING · UX · POS`

---

## Owner Day-One flow (what the owner tests first — applies to every persona)
The "first 10 minutes after go-live" a real owner cares about. Script this for each persona:

1. **Lands on Dashboard** — does it render without errors? Are opening balances / counts sane
   (not zeros, not doubled)? Outstanding receivables = sum of imported customer balances?
2. **Looks up one product** — search a known SKU; confirm name, price, cost, stock, image show.
3. **Rings up a POS sale** — open shift (float), add 2–3 items (tile + barcode + search), take
   cash + KNET, complete. Confirm cart math, VAT (KSA=15% N/A here; Kuwait has no VAT — expect
   0%/none), change due, and that the sale posts to the GL.
4. **Prints/previews the receipt** — confirm the **logo** appears at top, branch header correct,
   totals match, Arabic/English render, 80mm layout sane.
5. **Checks stock moved** — the sold item's qty dropped by the quantity sold (frontend + DB).
6. **Opens a report** — P&L / balance sheet / sales summary: does AR control = subledger? Does
   inventory value tie to Σ(qty×cost)? Any "off by" surprises (cf. ISSUE-11/13)?
7. **Settings sanity** — currency KWD with 3-dp fils, fiscal year, branches, document numbering,
   users/roles, tax (Kuwait: no VAT by default).

Checkpoints to assert each step: **frontend value** vs **tenant-DB value**. Any divergence = issue.

---

## PERSONA 1 — Al-Asala Auto Parts (قطع غيار الأصالة) · SIMPLE / happy path
**Purpose:** prove the clean path end-to-end, fast. Minimal data, single shop.

- **Owner:** Bader Al-Otaibi · **Users:** 1–2 (owner + counter) · **Location:** 1 (Shuwaikh Industrial)
- **Industry:** Auto parts & accessories → **Simple SKU** (regression-guard ISSUE-2; confirm NOT serialized)
- **Currency:** KWD · **Receipt:** one 80mm thermal, logo on top · **Images:** logo + 1–2 product images
- **Data:** 150 items / 8 categories, 4 customers (incl. Walk-in), 2 suppliers, **balanced** TB.

**Files (import in this order):** `trial_balance.csv` → `products.csv` → `customers.csv` → `suppliers.csv`
**Logo:** `images/logo-asala.png` (or `.svg`). **Product images:** `images/product-1.png`, `product-2.png`.

**Script:**
1. Onboarding wizard every step (regression-watch the prior fixes: ISSUE-1 Accounting card,
   ISSUE-2 auto-parts→Simple SKU, ISSUE-3 edit-from-review, ISSUE-4 language rows, ISSUE-5 "Retry"
   false-fail, ISSUE-6 counts).
2. Import TB → confirm as-of-date card appears & must be answered (ISSUE-17), books post on that date.
3. Import products → confirm **SKUs preserved exactly** (`FLT-0001`, not `0001` — ISSUE-7), prices/cats bind.
4. Import customers + suppliers → phone/email retained even with opening balance (ISSUE-19); AR/AP
   not double-posted vs TB (ISSUE-13).
5. Upload logo (Settings) + 1–2 product images → verify storage + render in POS grid + on receipt.
6. **Owner Day-One flow** (above). This is the golden clean run — should be friction-free.

---

## PERSONA 2 — Layla Cosmetics (ليلى للتجميل) · MEDIUM / real SMB stress
**Purpose:** multi-location, RBAC, images-heavy catalog, AR aging, **unbalanced TB → OBE plug**.

- **Owner:** Layla Al-Sabah · **Users:** 6–8 (owner, 3 store managers, cashiers — exercise roles)
- **Locations:** 3 (The Avenues, Salmiya, Hawally) · per-branch receipt headers, one logo
- **Currency:** KWD · **Images:** logo + several product images (cosmetics = visual) + customer avatars
- **Data:** 780 items (brands/lines/shades, bilingual names), 12 messy AR-aging customers, 3 suppliers
  (one Arabic-named), **deliberately unbalanced** TB (~1,200 imbalance → expect OBE 3900 plug).

**Files (order):** `trial_balance.csv` → `products.csv` → `stock_by_branch.csv` (3-warehouse columns)
→ `customers_aging.csv` (messy balances) → `suppliers.csv`
**Logo:** `images/logo-layla.svg`. **Product images:** `product-3.png` (+ reuse others). **Avatars:** `avatar-2.png`.

**Script:**
1. Onboarding with **3 branches** → confirm each branch + auto MAIN warehouse (ISSUE-6 count logic).
2. Import unbalanced TB → confirm **OBE plug** posts the difference, reconciliation reads honestly
   (not a scary "off by" — ISSUE-11), as-of date forced consistently (ISSUE-17).
3. Import `stock_by_branch.csv` → stock lands per branch; confirm Mira maps 3 warehouse columns.
4. Import `customers_aging.csv` → **messy numbers parse correctly**: `234,93` (euro) vs `319.13`,
   Arabic `٢٧١`, `800.82 KWD`, `-`/blank. Confirm per-customer AR + control tie-out.
5. Multi-image upload — several product images, a customer avatar, the **SVG logo**; verify SVG
   logo renders on receipts (only logo accepts SVG).
6. **RBAC:** create a cashier + store-manager user; confirm permissions (cashier can't see cost?).
7. **Owner Day-One flow**, plus: switch active branch, ring a sale at a non-default branch, confirm
   the receipt shows that branch's header.

---

## PERSONA 3 — Gulf Hardware & Tools Co. (شركة الخليج للأدوات) · LARGE / scale + import stress
**Purpose:** volume — thousands of items/customers, 5 warehouses, big imports, list/search perf.

- **Owner/GM:** Mishari Al-Rashid · **Users:** 20–30 · **Locations:** 4 stores + Central Warehouse
- **Currency:** KWD · **Print setups:** retail 80mm receipt, A4 B2B invoice, warehouse picking
- **Data:** **8,500 items** (12 categories, pack/UOM units: Each/Box/Pack/Dozen/Roll/Set/Bag),
  **4,200 customers** (contractors on credit, messy AR), 180 suppliers, large TB.

**Files (order):** `trial_balance.xlsx` → `item_master.xlsx` → `opening_stock_by_warehouse.csv`
(5 warehouse columns) → `customers.csv` (4,200 rows) → `suppliers.csv`
**Note:** xlsx used here on purpose — exercises ExcelJS multi-sheet parsing (ISSUE-16) and the 5 MB
import cap. If a file exceeds 5 MB, split or confirm the cap behaviour is graceful (not silent loss).

**Script:**
1. **Import performance** — time each import; watch for timeouts, partial commits, memory. Confirm
   the commit summary counts match DB row counts exactly (no silent truncation/sampling — the AI
   only samples ~10 rows for comprehension then applies deterministically to ALL; verify the tail).
2. **Pack/UOM** — items carry Box/Dozen/etc.; confirm base-unit conversion (resolvePackUnit) holds
   through POS/sales/purchase/stock (cf. pack-units wave).
3. **5-warehouse stock** — confirm all 5 columns map and stock distributes per warehouse.
4. **4,200 customers** — list pagination, search, and AR control = Σ subledger (no doubling at scale).
5. **List/search UX at volume** — items list, customer list, POS product search: latency, virtualized
   scroll, filters. The "dumbest thing a user could do" at 8.5k items (cf. defensive-UX rule).
6. **Reports at scale** — balance sheet / inventory valuation tie-out with large numbers (rounding,
   fils precision, no overflow).
7. **Owner Day-One flow** on a heavy tenant — does the dashboard still load fast and correct?

---

## Cross-cutting things to watch (all personas)
- **Regression guard:** every FIXED issue in `e2e-issues-log.md` (1–19) has an "E2E TESTING NEEDED"
  note — this run is where they get confirmed live. Re-verify them as you hit each area.
- **Money path is sacred:** AR/AP control = subledger, TB posts once on the conversion date, OBE plug
  only for genuine imbalance. Any "off by" on a clean import = high-severity.
- **Defensive UX:** loading/empty/error/success states everywhere; destructive actions confirm;
  nothing silently dropped; messy input absorbed, never dead-ended (founder's "assume dumb customers").
- **i18n/RTL:** Arabic names render correctly, receipts bidi-safe, no hardcoded language.
- **No data loss, ever:** if Mira can't read something, it must say so and keep the data — never a
  silent success on garbage (ISSUE-14/15).

## Logging issues
Append to `erp/docs/e2e-issues-log.md` as `ISSUE-N` continuing the existing numbering, with:
`Where` (exact screen/step) · `What` (observed vs expected) · `Impact` · `Root-cause direction` ·
DB proof where relevant (tenant name + the query/result). Founder pastes raw findings; Claude
structures them and, when fixing, follows the same FIX-block convention already in the log.
