<!-- Feature catalog partition | Module: ai-engine | Generated: 2026-06-11 | Source: as-built audit -->
# AI Engine (Zee, Mira, Sami) — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

---

## Zee — AI Partner Persona & Team Screen

- **Status:** shipped
- **Description:** Zee is the single customer-facing voice of the AI engine — a named, female persona who presents all agent findings to the user. The Team Screen shows the full agent roster (Mira, Sami active; others with projected unlock dates), live counters for on-the-job agents, and progress bars for agents still training.
- **Who it's for:** All users; primary audience is the business owner checking in on their AI team.
- **Constraints / notes:** Zee is a presentation layer only — she never detects or writes data herself. Sub-agents are referenced by Zee ("Noor found…"); users never converse with sub-agents directly. Copilot/chat with Zee is Phase D (planned). Agent catalogue is static metadata in `apps/web/src/features/zee/agent-catalogue.ts`; live counters for Mira and Sami come from the API. "Starts in N days" projections for Phase-B agents are static marketing copy at launch, not live backtest output.

---

## Zee Daily Digest

- **Status:** planned
- **Description:** A morning summary delivered in-app (and later push/email) in Zee's voice — 3–5 insight cards, money-first ordered, surfacing what the agent team found overnight.
- **Who it's for:** Business owner; daily check-in habit.
- **Constraints / notes:** Digest UI shell (`zee-digest-empty.tsx`) is shipped; actual insight delivery requires the Money-Found Engine substrate (Phase B). WhatsApp delivery channel is explicitly deferred post-Phase B.

---

## Mira — Migration Brain (Layer 1: Report-Pathology Detection & Repair)

- **Status:** shipped
- **Description:** Mira automatically detects and repairs universal structural pathologies in any spreadsheet or CSV export from any accounting/POS system — hierarchy rows mixed with data, duplicate headers, pivot layouts, running-total columns, footer rows, paginated exports, embedded codes, locale chaos (Arabic-Indic digits, comma decimals, date format ambiguity), and mojibake — then returns a clean table plus an audit trail of every repair applied.
- **Who it's for:** New customers migrating from any existing system; no IT knowledge required.
- **Constraints / notes:** Fully deterministic, pure code — no model on this path. Works even when the AI service is offline. Covers 11 pathology types. Code in `apps/ai/app/migration/detectors/` and `orchestrator.py`. The schema-only LLM tail runs only for genuinely ambiguous column headers (cell values are stripped before any external call — the "numbers never leave" promise holds). No vendor-specific adapters, ever; vendor knowledge accrues emergently via the fingerprint flywheel.

---

## Mira — Migration Brain (Layer 2: Cross-File Consolidation & Decision Cards)

- **Status:** shipped
- **Description:** After each file is cleaned, Mira joins claims from multiple files on natural keys (item code, party code, account code) into a single entity graph, detects conflicts (e.g., GL says inventory is 180k; stock report says 360k), and surfaces them as plain-language decision cards with the money consequence stated — never an error wall. Detects party-as-ledger COA entries and offers to convert them to customer/supplier records automatically.
- **Who it's for:** Business owners migrating with multi-file exports (stock list, trial balance, customer ledger, etc.).
- **Constraints / notes:** Deterministic, stateless, no model on this path. Feeds the existing 5-way reconciliation gate as the final arbiter. Code in `apps/ai/app/migration/consolidation.py` and `migration_consolidate.py` router. NestJS owns all actual writes; the Python service only computes the graph.

---

## Mira — Migration Brain (Anomaly Safety Net)

- **Status:** shipped
- **Description:** After the consolidation graph is built, Mira sweeps all entity nodes for costly mistakes a non-technical user would miss: items priced below cost, duplicate barcodes, zero/negative costs, and parties appearing on both sides of the books with conflicting balances. Every finding becomes an advisory decision card — never blocking.
- **Who it's for:** Business owners; catches data-quality issues before they reach the books.
- **Constraints / notes:** Pure and deterministic — same graph always produces same cards. Code in `apps/ai/app/migration/anomalies.py`.

---

## Mira — Learned Fingerprint Flywheel

- **Status:** shipped
- **Description:** Every file Mira processes generates a structural fingerprint (derived from header names, column count, and column type families — never from cell values). Repeated encounters of the same export shape are recognized instantly on the next onboarding, building effective vendor-shape recognition without any hardcoded vendor adapters.
- **Who it's for:** Benefits all future onboarding customers as the tenant base grows.
- **Constraints / notes:** Fingerprints are one-way hashes, value-free — the privacy promise holds even for the cache. Code in `apps/ai/app/migration/fingerprint.py`. Cross-tenant aggregation of fingerprints is not yet wired (the per-tenant fingerprint is computed; the shared lookup store is planned).

---

## Mira — Matching UX: Create-by-Default & Bulk Accept

- **Status:** shipped
- **Description:** Unmatched COA labels, party names, and items default to "create" rather than forcing the user to manually map every entry. High-confidence matches are auto-applied with a visible "AI matched" badge; uncertain ones are shown with a best-guess pre-selected. A one-tap bulk-accept handles the entire confident batch, and an undo queue is available.
- **Who it's for:** Users importing existing charts of accounts, customer lists, or item masters.
- **Constraints / notes:** Designed explicitly to prevent the "55 accounts to match manually" wall that was validated as a real user-failure point in testing (2026-06-07). Entity matching for party names uses a fuzzy + schema-only LLM rung (Qwen3 32B on Groq for Arabic/English mixed names).

---

## Mira — Suspense Parking & Finish-Later Task Cards

- **Status:** shipped
- **Description:** Unresolved migration items never block the user from proceeding. Unassigned accounting amounts park in a suspense account; unresolved data items surface as Mira's task cards on the dashboard, framed in money terms (e.g., "3 accounts still unassigned — your P&L hides 412 KWD until then").
- **Who it's for:** Users who want to start selling immediately without completing every migration step.
- **Constraints / notes:** Tier 0 (business identity, currency) is non-negotiable. Tier 1 (opening stock, balances) is skippable with stated consequence. Tier 2 (categories, terms) is optional and inferable.

---

## Mira — Live Migration Narration

- **Status:** shipped
- **Description:** During the onboarding import, Mira narrates her work in real-time in Zee's voice ("Reading 11 files… found your trial balance… 1,471 products… built 23 categories…"). Progress is streamed via SSE so the user sees her work as it happens.
- **Who it's for:** All new customers during onboarding; the primary "wow" moment of the product.
- **Constraints / notes:** Narration copy is template-based (no LLM on this path). SSE infrastructure shared with the invoice scanner (see Job-Progress SSE). If the AI service is offline, Mira falls back to deterministic Layer 1 and manual matching; the product never blocks on the LLM rung.

---

## Mira — Layer 3: Inference of Missing Data

- **Status:** planned
- **Description:** After migration, Mira infers missing fields the user never provided — categories (from product name clustering), selling prices (from cost × learned category markup), costs (from TB allocation), payment terms (from aging-days distribution), reorder levels (from opening quantity), and account types (from COA hierarchy path). Every inferred value is badged "inferred" with provenance and confidence and lands in a review queue.
- **Who it's for:** Customers with incomplete export data who still want a functional system on day one.
- **Constraints / notes:** All inference runs on Zerupt's own infrastructure (OWN tier) — no cell data leaves. Planned for Phase B alongside the Money-Found Engine, as both share the same statistical substrate.

---

## Sami — Invoice Scanner (VLM Extraction)

- **Status:** shipped
- **Description:** Point a phone camera at any supplier invoice (or upload a PDF) and Sami extracts every field — supplier, line items, quantities, unit costs, VAT rate, and totals — using a cloud vision-language model (Gemini 2.5 Flash). Works on Arabic, English, and mixed-language invoices, including thermal-printed and crumpled photos. Target: photo to review screen in under 10 seconds.
- **Who it's for:** Any staff member receiving supplier deliveries; eliminates 2+ hours of daily data entry.
- **Constraints / notes:** Extraction is via cloud VLM (Gemini 2.5 Flash primary; Flash-Lite for clean PDFs). Invoice images are supplier documents — outside the "your numbers never leave" promise, which covers the tenant's own books/sales. This is disclosed on the privacy page. The extraction adapter is designed to be swapped to a self-hosted model with a config change (no code change). Per-field confidence is returned; low-confidence fields are visually distinct (amber) on the review screen.

---

## Sami — Invoice Matching Pipeline

- **Status:** shipped
- **Description:** After extraction, Sami runs a deterministic matching pipeline: supplier matched by TRN → name exact → fuzzy (or create-new draft); products matched by barcode → SKU → supplier-item-code cache → name fuzzy → new product draft; VAT rate validated against the tenant's tax profile; line totals reconciled against extracted grand total. Any mismatch is flagged explicitly.
- **Who it's for:** Users reviewing extracted invoices before posting.
- **Constraints / notes:** Matching reuses the same import-ladder pattern as the data importer. Supplier-item-code cache improves accuracy on repeat invoices from the same supplier. A total-reconciliation mismatch blocks the Approve button until resolved. Code in `apps/api/src/scanner/scanner-matching.ts`.

---

## Sami — Invoice Review Screen & 1-Tap Post

- **Status:** shipped
- **Description:** The review screen shows the drafted purchase with GL preview, per-field confidence styling, and inline new-product drafts. One tap approves and posts the purchase — updating stock, posting the journal entry, and tagging the record with `origin: 'zee/sami'` for the audit log.
- **Who it's for:** The person who processes supplier deliveries (owner or receiving staff).
- **Constraints / notes:** Blurry/unreadable photos show a "Retake" prompt with the problem region highlighted — never a silent wrong guess. The GL preview is shown before posting so accountants can verify the journal. Code in `apps/web/src/features/sami/components/`.

---

## AI Corrections & Learning Loop

- **Status:** shipped
- **Description:** Every user edit on a Sami review screen (or import mapping confirmation) is captured as a correction record — storing what the AI extracted, what the user changed it to, the extraction confidence, and the model version. These corrections feed a supplier-item-code cache that makes repeat invoices near-perfect, and accumulate as a training dataset for a future self-hosted extraction model.
- **Who it's for:** Benefits all users automatically over time; no action required.
- **Constraints / notes:** DB table: `ai_corrections`. Service: `apps/api/src/ai-corrections/ai-corrections.service.ts`. The correction replay is live; the fine-tuned model training is Phase E (planned). Telemetry tracks fields-extracted vs fields-corrected per supplier/format from week 1 as a real accuracy metric.

---

## Job-Progress SSE (Real-Time AI Job Streaming)

- **Status:** shipped
- **Description:** Long-running AI jobs (invoice extraction, import processing, migration cleaning) stream real-time progress updates to the browser via Server-Sent Events so users see live status without polling.
- **Who it's for:** Any user running an AI-assisted operation (scan, import, migration).
- **Constraints / notes:** EventSource auth uses a JWT query parameter (browser EventSource API does not support custom headers). Tenant isolation is enforced — only events for the authenticated tenant's jobs are streamed. Code in `apps/api/src/ai/job-progress/`. SSE backpressure handled by NestJS platform-express adapter.

---

## AI Health Check & Degradation Handling

- **Status:** shipped
- **Description:** The AI service health is checked before starting any AI-assisted flow. Users see "Mira is on the job ✓" or "Mira is offline — manual mode" — never silent degradation. When the AI service is down, Mira falls back to deterministic Layer 1 rules; import mapping falls back to manual; the product never blocks on the LLM.
- **Who it's for:** All users; prevents the frustration of a broken-looking product.
- **Constraints / notes:** `AiHealthService` (`apps/api/src/ai/ai-health.service.ts`) checks FastAPI reachability. Health status is exposed via `GET /tenant/ai` status controller. Telemetry event `ai.health.degraded` is emitted when degradation is detected during a flow.

---

## AI Telemetry

- **Status:** shipped
- **Description:** Structured telemetry events are captured for every AI-assisted action — import mapping confirmed (source: AI vs manual), health degradation events — enabling measurement of AI accuracy and adoption from week 1.
- **Who it's for:** Founder/ops — internal visibility into AI performance.
- **Constraints / notes:** In development: structured JSON to console. In production: Sentry breadcrumbs on the request trace (zero new infra). Designed to never throw and never affect the happy path. Code in `apps/api/src/ai/telemetry.service.ts`.

---

## Per-Agent Configuration (Agent Settings)

- **Status:** shipped
- **Description:** Each AI agent can be enabled, disabled, or configured per-tenant (model preference, alert thresholds, scan intervals) without code changes. Settings persist to the `ai_agent_settings` table and are editable via the agent settings API.
- **Who it's for:** Tenants who want to pause or tune individual agents; admins managing tenant onboarding.
- **Constraints / notes:** Validated `agentKey` values are enforced in the DTO. Default configs exist for legacy agent keys; Mira and Sami use the new named-team schema. Code in `apps/api/src/ai-agent-settings/`.

---

## Business Knowledge Graph

- **Status:** shipped
- **Description:** A typed relationship graph is built and maintained per tenant, seeded from accounts, items, customers, and suppliers at migration. The graph powers three user-visible features: blast-radius analysis (what accounts/items would be affected by a change), dormant capital detection (capital tied up in slow-moving or unlinked assets), and both-sides party detection (a party that appears on both the receivables and payables ledger).
- **Who it's for:** Business owners and accountants reviewing financial structure and risk.
- **Constraints / notes:** Graph edges stored in `graph_edges` table with typed edge types and confidence scores. Seeding is born-from-migration: the graph populates automatically as data is imported. Zee, Mira, and Sami all have access to query the graph. The Copilot NLQ use case (querying the graph conversationally) is Phase D (planned). Code in `apps/api/src/graph/`.

---

## LiteLLM Multi-Provider Model Router

- **Status:** shipped
- **Description:** All LLM calls in the AI service are routed through a single LiteLLM router with per-task model assignments defined by environment variables — column mapping, COA classification (EN and AR variants), schema inference, entity/party matching, and invoice VLM extraction each get the best-fit model with a defined fallback chain. Switching models requires no code changes.
- **Who it's for:** Internal — governs AI cost, quality, and privacy compliance.
- **Constraints / notes:** Task routes: column-mapper → Gemini 2.5 Flash-Lite; coa-classifier-en → DeepSeek V4-Flash; coa-classifier-ar → Qwen3 32B on Groq; schema-infer → DeepSeek V4-Flash (1M ctx); entity-matcher → Qwen3 32B on Groq; invoice-vlm → Gemini 2.5 Flash. Fallbacks defined for each. Structured JSON output (`response_format: json_schema`) is enforced globally. DeepSeek direct is only used for schema/header strings — never PII. Gemini 2.0 Flash is banned (deprecated June 2026).

---

## AI DB Credentials Vending

- **Status:** shipped
- **Description:** The NestJS API securely vends read-only Neon database credentials to the FastAPI AI service on demand, scoped to the requesting tenant. This lets the AI service read tenant data directly (for feature pipelines) without storing long-lived credentials.
- **Who it's for:** Internal — AI service infrastructure.
- **Constraints / notes:** Guarded by `AiDbCredentialsGuard`. Code in `apps/api/src/ai/ai-db-credentials.controller.ts`. Credential scope: read-only, per-tenant.

---

## AI Scheduler (Recurring AI Jobs)

- **Status:** shipped
- **Description:** Recurring AI jobs (nightly scoring, health checks, model registry updates) are scheduled and managed by the NestJS AI scheduler, which registers job types and dispatches them on cadence.
- **Who it's for:** Internal — ensures AI insights stay fresh without manual triggers.
- **Constraints / notes:** `AiSchedulerService` + `AiJobsRegistry` in `apps/api/src/ai/`. The nightly scoring jobs that produce insight cards are the Phase B dependency (money-found detectors not yet built).

---

## Money-Found Engine Substrate (Insight Cards, Feed, Model Registry)

- **Status:** planned
- **Description:** The shared infrastructure for all four money-found detectors: a per-tenant feature pipeline (daily sales per SKU, stock levels, void events, aging), a model registry with quality gates (the "starting in N days" mechanic), nightly scoring jobs, deduped `insight_cards` delivery, and an in-app insights feed showing "Zee's team found X KWD this month."
- **Who it's for:** All tenants; unlocks progressively as transaction data accumulates.
- **Constraints / notes:** This substrate is the Phase B foundation (~1.5 weeks of build). All four detectors are plugins on top of it. Model quality gates are what determine each agent's unlock date (honest, data-driven, can accelerate with data imports).

---

## Noor — Dead Stock Finder

- **Status:** planned
- **Description:** Finds cash trapped in non-moving or overstocked inventory. Headline: "X KWD sitting idle." Uses per-SKU/location sales velocity with recency weighting to score items as slow, dead, or seasonal leftover. Suggests discounting, transfers, bundling, or supplier returns.
- **Who it's for:** Business owners with inventory; most valuable in fashion, electronics, auto-parts, and any category with fast obsolescence.
- **Constraints / notes:** Statistics only — no LLM. Per-category thresholds learned from the tenant's own velocity distribution. Needs 2–4 weeks of sales data (or instant with historical sales import). Built first among the four detectors — validated as strongest pain point in a 2026-06-07 retail owner interview. Phase B.

---

## Maya — Margin Watchdog

- **Status:** planned
- **Description:** Finds quiet margin bleeding: items selling below intended margin, price-list drift vs cost changes, customers exceeding credit terms, and aging receivables risk-scored. Drafts price-update suggestions and credit-hold recommendations.
- **Who it's for:** Business owners focused on profitability; accountants managing receivables.
- **Constraints / notes:** Mostly deterministic rules + simple scoring — fastest of the four to ship. No model baseline needed. Phase B, built after Noor.

---

## Tariq — Shrinkage Guard

- **Status:** planned
- **Description:** Detects voids, refunds, and discount patterns per cashier compared to their own baseline and peer group. "Cashier #2 voided 6 sales yesterday — 3× their normal." Presents the evidence timeline; never makes accusations, only flags patterns for review.
- **Who it's for:** Business owners and managers at POS-heavy retail locations.
- **Constraints / notes:** Statistical process control (per-cashier z-scores/control charts) — no ML training data needed beyond 2–4 weeks of POS activity. Tone guidelines are strict: patterns flagged for review, never accusatory language. Phase B.

---

## Arjun — Stockout Predictor

- **Status:** planned
- **Description:** Forecasts demand per SKU per location and flags items that will run out before the next reorder, with a suggested 1-tap draft PO. Pairs with Noor for transfer suggestions from overstocked locations.
- **Who it's for:** Purchasing managers and business owners managing replenishment.
- **Constraints / notes:** Intermittent-demand-aware forecasting (Croston/TSB for sparse sellers, ETS/LightGBM for fast movers). Needs 4–8 weeks of sales history — longest baseline requirement of all four agents. The forecasting core is deliberately designed to also power future auto-drafted POs (Phase C). Phase B (built last).

---

## Copilot / Chat with Zee (NLQ)

- **Status:** planned
- **Description:** Conversational interface to ask Zee questions in plain language ("What were my top 5 items last month?"). The LLM writes a query plan; Zerupt's own server executes it; numbers never leave Zerupt's infrastructure. Results are rendered locally.
- **Who it's for:** Business owners who want answers without navigating reports.
- **Constraints / notes:** Deliberately Phase D (last) — sequenced after months of earned trust and a corpus of real questions to evaluate against. LLM sees query structure, not the data values.

---

## Autonomy Dial (Auto-Post on Track Record)

- **Status:** planned
- **Description:** After a configurable number of clean approvals from a specific supplier (e.g., 50 clean invoice approvals), the tenant can unlock automatic posting for that supplier's invoices — no review screen required. Off by default; unlocked per-capability per-tenant.
- **Who it's for:** High-volume tenants with trusted, consistent supplier invoices.
- **Constraints / notes:** Phase C. Requires Sami's track-record data (correction rate per supplier) as the unlock criterion.

---

## Fine-Tuned Self-Hosted Extraction Model

- **Status:** planned
- **Description:** Once enough scan correction data accumulates (target: ~100+ tenants of corrections), train a fine-tuned small VLM on Zerupt's own GPU infrastructure. Replaces the cloud VLM for invoice extraction — eliminating per-invoice cost, closing the last privacy gap (supplier images would also stay on Zerupt's infra), and improving accuracy on GCC invoice formats.
- **Who it's for:** All Sami users; transparent upgrade with no UX change.
- **Constraints / notes:** Phase E. The extraction adapter in `apps/ai/app/extraction/` is already designed for this swap (config, not code). Serverless GPU (pay-per-second, $0 idle) is the target infra.

---

## Import-Mapping SLM & COA Classifier (Fine-Tuned)

- **Status:** planned
- **Description:** Small language models trained on accumulated import-mapping corrections and COA classification decisions across all tenants — replacing the current LLM-rung calls with a self-hosted, zero-marginal-cost model that knows retail accounting across MENA/India/SEA.
- **Who it's for:** All customers during onboarding; improvement is invisible to the user.
- **Constraints / notes:** Phase E. Requires ~100 tenants of correction data. Cross-tenant priors (anonymized aggregates) also unlock better cold-start defaults per industry and region at this stage.
