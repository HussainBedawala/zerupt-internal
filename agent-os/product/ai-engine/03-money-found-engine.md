# The Money-Found Engine (retention core, built immediately post-MVP)

> The renewal driver: Zerupt continuously watches the tenant's own data and surfaces **money** — trapped, leaking, or about to be lost. Headline framing is always an amount: "Noor found 6,200 KWD." Pain validated 2026-06-07 (retail owner interview: dead stock = strongest angle).

All four detectors share one substrate (features → per-tenant models → scored insights → cards). Build the substrate once; detectors are plugins on it.

## Shared Substrate (`apps/ai/engine/`)

1. **Feature pipeline** — per-tenant SQL → frames: daily sales per SKU/location, stock levels + age, purchase costs, void/refund/discount events per cashier, count variances, price lists vs realized prices, receivables aging.
2. **Model registry** — per-tenant artifacts, versioned, with backtest metrics. A detector only goes live for a tenant when its backtest passes a quality gate (this gate IS the "joining in N days" mechanic).
3. **Scoring jobs** — nightly: score → insights JSON → NestJS `insight_cards` (dedup, rate-limit, deliver).
4. **Evidence discipline** — every card carries the math (`contextData`): the SKUs, the days-of-supply, the baseline vs observed. Zee never says "trust me."

## The Four Detectors

### Noor — Dead Stock Finder ⭐ (build first — validated pain)
- **Finds:** cash trapped in non-moving/overstocked inventory. Headline: "X KWD sitting idle."
- **Method:** sales-velocity per SKU/location (with recency weighting) → days-of-supply and time-since-last-sale → tiered scoring (slow / dead / seasonal-leftover). Statistics, not LLM. Per-category thresholds learned from the tenant's own velocity distribution — a perfume shop's "slow" ≠ a grocery's.
- **Actions:** discount suggestion · transfer to faster location · bundle flag · return-to-supplier note.
- **Baseline needed:** ~2–4 weeks of sales (or instant if historical sales were imported — imports accelerate hiring, a reason to import history!).

### Arjun — Stockout Predictor
- **Finds:** lost sales before they happen: "Galaxy S24 runs out Thursday; it sells 40/week."
- **Method:** per-SKU/location demand forecast — intermittent-demand-aware (Croston/TSB for sparse sellers, ETS/lightGBM for fast movers), reorder point vs forecast + supplier lead time. Same forecasting core later powers reorder quantities (the "employee" stage drafting POs).
- **Actions:** 1-tap draft PO (qty suggested) · transfer from overstocked location (pairs beautifully with Noor).
- **Baseline:** ~4–8 weeks of sales history.

### Tariq — Shrinkage Guard
- **Finds:** voids/refunds/discount abuse per cashier vs peer+self baseline; count variances per location vs history. "Cashier #2 voided 6 sales yesterday — 3× their normal."
- **Method:** statistical process control (per-cashier baselines, z-scores/control charts) — no training data needed beyond the tenant's own 2–4 weeks of POS activity. Emotionally explosive; tone is careful: *patterns flagged for review*, never accusations.
- **Actions:** view evidence timeline · start a count · acknowledge.

### Maya — Margin Watchdog
- **Finds:** quiet bleeding: items selling below intended margin, price-list drift vs cost changes, customers exceeding credit terms, aging receivables risk-scored.
- **Method:** mostly deterministic rules + simple scoring on accounting/sales data (fastest to ship of the four; lowest model risk).
- **Actions:** price update draft · credit-hold suggestion · payment-reminder draft.

## Delivery Surfaces (v1 = simple, locked)

1. **Insights feed** in-app — the workbench: filter by agent/severity/status, money totals at top ("Zee's team found 14,600 KWD this month").
2. **Daily digest** — morning summary (in-app + push/email), Zee's voice, 3–5 cards max, money-first ordering.
3. **Channel abstraction** so WhatsApp Business API is "add a channel" later (real GCC value, deliberate v1 deferral — API verification, template approval, per-message cost).

## Build Order (post-June-15)

1. Substrate (features + registry + scoring jobs + insight cards + feed UI + unlock screen) — ~1.5 weeks
2. Noor (validated, simplest real model, biggest headline number)
3. Maya (fast, rules-based — fills the feed while baselines accrue)
4. Tariq (2–4 wk baseline aligns with first tenants' data age by then)
5. Arjun (needs longest history; forecasting core doubles as future PO-drafting brain)

## Honest-Number Discipline

The headline ("found 8,400 KWD") must survive an accountant's scrutiny: dead stock = cost value of flagged stock (not retail), prevented stockout = forecast lost sales with stated assumptions, shrinkage = variance value. Methodology page linked from every card. Overstated numbers would kill trust permanently in a word-of-mouth market.
