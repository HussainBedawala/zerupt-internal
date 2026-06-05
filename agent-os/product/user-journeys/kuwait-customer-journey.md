# Kuwait Customer Journey — Yousef, 100% Flow Audit

> **Audited:** 2026-06-04 against branch `phase-5/DEV-387-opening-import-wizards` (including uncommitted opening-import wizard work).
> **Companion to:** `me-customer-journeys.md` (P3 profile, expanded here to full depth).
> **Purpose:** map every step Yousef takes from hearing about Zerupt → running 100 sales/day across 2 stores, with his confusion, fear, and the exact code-level gap at each step. Approval gate before any fixes are coded.
>
> Grades: 🔴 blocker (he churns or his books are wrong) · 🟡 friction (he guesses, calls support, or works around) · 🟢 polish.

---

## Part 1 — Who Yousef Is (Deep Profile)

| Attribute | Detail |
|---|---|
| Business | "Al-Noor Mobiles" — mobile phones, accessories, smart watches, some repairs |
| Locations | 2 stores: Hawally (main, with back storeroom) + Salmiya (mall-adjacent) |
| Size | ~3,000 SKUs (≈400 phone models with IMEIs, rest accessories), ~800 known customers, 3 cashiers + 1 trusted manager, ~80–120 receipts/day combined |
| Money | KWD, **3 decimal places** (1 KD = 1000 fils), **no VAT** in Kuwait. KNET debit ≈ 80% of payments, cash rest, occasional Visa/MC for tourists |
| Current stack | Pirated desktop POS (no updates, no support), Excel for stock counts and customer dues, WhatsApp for inter-store "do you have X?" |
| Language | Arabic-first; reads English; cashiers are mixed (one Arabic-only) |
| B2B side | Sells 5–20 phones at a time to 4–5 small resellers on 30-day credit; tracks their dues in a notebook |
| Buying | Local distributors (weekly), occasional Dubai imports. Pays by bank transfer and post-dated cheques |

### His Psychology

**Why he'd switch:**
- The pirated POS corrupted its database once; he lost 3 months of history. Fear of total loss is his #1 motivator.
- He cannot see Salmiya's stock from Hawally. Every inter-store query is a WhatsApp call.
- Customer dues notebook has caused 2 disputes this year.
- He suspects a cashier of skimming but has no z-report/over-short evidence.

**His fears (in order):**
1. *"Will I lose my data moving over?"* — migration anxiety dominates everything.
2. *"Can my cashiers learn it?"* — one is Arabic-only, none are tech-savvy.
3. *"What happens when the internet drops?"* — happens weekly at Salmiya.
4. *"Is my money math right?"* — fils matter; 2-decimal rounding on a 12.500 KD sale reads as broken software.
5. *"Am I paying for VAT features I don't need?"* — any VAT mention makes him suspect the product isn't for Kuwait.

**Deal-breakers (will not go live without):**
1. IMEI tracking — receive, sell, locate, warranty-lookup by IMEI
2. KNET as a first-class tender
3. Stock transfers between his 2 stores
4. Returns/exchanges at the counter
5. Customer dues (credit sales + collection) for his resellers
6. KWD 3-decimal correctness everywhere a number is shown

**Trust factors:** Arabic UI that feels native (not translated), a receipt that looks like every other Kuwaiti receipt (bilingual, no weird tax lines), and the system *visibly noticing* what he does (his first invoice should tick the checklist itself).

---

## Part 2 — The 100% Flow, Stage by Stage

### Stage 0 — Discovery → Signup → Provisioning

**What he does:** lands on zerupt.com from an Instagram ad → `/signup` → email confirm → `/setup` (name, business, country) → provisioning screen.

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 0.1 | 🟡 | **No Arabic before the wizard.** `/signup` and `/setup` have no locale switcher; an Arabic-first owner's first impression is all-English. `locale-switcher.tsx` exists but isn't wired in. | `apps/web/src/components/auth/setup-form.tsx` |
| 0.2 | 🟡 | Setup-form country list (10 entries) is out of sync with the wizard's full list (omits PH/VN) — a maintenance smell, not a Yousef issue. | `setup-form.tsx:14` |
| 0.3 | 🟢 | Provisioning steps say "Database provisioned" — jargon. He's waiting and nervous; say "Setting up your shop." | `messages/en/auth.json:109-113` |
| 0.4 | 🟢 | "14-day free trial" with no day-15 explanation. | `auth.json:21` |

**His state of mind:** cautiously hopeful, mildly alienated by English-only start.

---

### Stage 1 — Onboarding Wizard (7 steps)

The wizard is genuinely strong: save-as-you-go indicator, plain-language descriptions + InfoTips (f4b7700), complete natural Arabic, Kuwait-correct branch placeholder ("Salmiya Main"). But:

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 1.1 | 🔴 | **Country preview shows "Tax: VAT" for Kuwait.** `countries.ts` has `taxRegime: "vat", taxLabel: "VAT"` for KW; the preview renders it raw. Step 4's transform correctly treats KW as no-tax (hardcoded `NO_TAX_COUNTRIES`), so the product *behaves* right but *announces* wrong. This is the first Kuwait-specific thing he sees, and it's false. Instant trust damage. | `features/onboarding/data/countries.ts:47-48`, `country-preview.tsx:36`, `step4-transform.ts:9` |
| 1.2 | 🔴 | **Bilingual receipts default OFF for Kuwait.** Nearly every Kuwaiti retail receipt is ar/en. If he misses this toggle, day-1 receipts are monolingual. Should default `true` for GCC. | `step6-transform.ts:70` |
| 1.3 | 🟡 | **Default payment methods = `["cash"]` for Kuwait.** KNET is the dominant rail; default should be `["cash","knet"]`. KNET checkbox also has zero description ("KNET" bare label). | `step6-transform.ts:71`, `en/onboarding.json:489` |
| 1.4 | 🟡 | Roadmap + Step-1 subtitle promise tax setup ("Tax: VAT, GST, or SST for your country"; Arabic: "أساسيات الضريبة") — dread for a no-tax user. Step 4's "No tax to set up" card is good but doesn't address "I heard VAT is coming to Kuwait — am I covered?" | `en/onboarding.json:64-65`, `ar/onboarding.json:96`, `:371-373` |
| 1.5 | 🟡 | **"Does each branch keep its own stock?" InfoTip is internally contradictory** ("If No — each branch has its own stock" vs. the question's framing). His most consequential structural answer, and the help text disagrees with itself. | `en/onboarding.json:240-241` |
| 1.6 | 🟡 | **PDC question defaults `false`** — PDCs are routine Kuwaiti B2B practice; he must discover and flip it. | `step3-transform.ts` |
| 1.7 | 🟡 | **Truth-in-funnel: industry auto-recommends "Serialized"** for electronics_mobile — collecting an answer to a feature that is 0% built (see Stage 6). The wizard sets the expectation that IMEI tracking exists. | step1 + `items.dto.ts:82` |
| 1.8 | 🟡 | Step 7 "current system" options have no "legacy/offline POS" choice; the product import description never mentions IMEIs; skipping opening balances carries no consequence warning ("your reports start at zero"). | `en/onboarding.json:521-525` |
| 1.9 | 🟢 | Currency shows bare "KWD" (no "Kuwaiti Dinar"); COA choice has no preview ("what accounts will I get?"); inventory-concept "change later" hint doesn't say where; Step 5 team count doesn't reassure about roles/pricing. | various |

---

### Stage 2 — Data Migration (Import Hub + DEV-387 wizards)

**What he does:** exports Excel from the old POS → hub: categories → products → customers → suppliers → opening stock → opening balances.

**What's strong:** lock-ordered hub cards; LLM column mapping; chunked 500-row apply with poll fallback; UTF-8 BOM + semicolon handling for Arabic Excel; per-branch opening stock works for his 2 stores; opening-balance date enforced server-side; control-account confirmation gates; OBE residual disclosed; Arabic account-name (`nameAlt`) resolution.

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 2.1 | 🔴 | **No IMEI/serial anywhere in import.** Product fields and opening-stock fields (`sku, warehouse, quantity, unitCost`) have no serial column. His 400 phone models import as bare quantities; individual IMEIs have no landing place (and no destination table exists — Stage 6). | `entity-fields.ts:38-51`, `opening-import-types.ts:60` |
| 2.2 | 🔴 | **No per-customer/supplier opening balances.** Customer import has no balance field; opening balances import an aggregate AR (1131) / AP (2111) lump only. His 800 customers' individual dues — the notebook he's escaping — cannot come over. AR aging starts useless. | `entity-fields.ts:52-71`, `opening-balance-import.dto.ts` |
| 2.3 | 🔴 | **No undo for any import.** A wrong unitCost permanently seeds wrong WAC → wrong COGS forever. "Reimport" *adds* stock rather than replacing, with no warning. | hub + apply services |
| 2.4 | 🔴 | **Windows-1256 CSVs garble Arabic.** `parseCsv` assumes UTF-8; Arabic Excel CSV exports in Kuwait are commonly cp1256. XLSX is safe — but nothing tells him to prefer XLSX. | `import-file-parser.ts:113-115` |
| 2.5 | 🔴 | **No download templates** for product/customer/supplier imports (locations import has one). He must guess column headers. | vs `step2-csv-import.tsx:104` |
| 2.6 | 🟡 | **WAC trap:** products imported without opening stock have `averageCost = 0` → first sale posts zero/failing COGS. Hub never warns "every stocked item needs an opening-stock row or a cost." | `import-apply.service.ts:449`, `stock-adjustments.service.ts:483-486` |
| 2.7 | 🟡 | Duplicate policy is silent reject-only (no per-row "which SKUs were skipped" view); opening-stock errors block the whole file with no partial-skip; same-account duplicate rows error surprisingly ("Cash-Main" + "Cash-Branch" → same COA account). | `apply-step.tsx:209-217`, mappers |
| 2.8 | 🟡 | **Reconciliation tie-out service exists with no UI** — the one screen that would answer his #1 fear ("did everything come over correctly?") is API-only. No "what's your AR total from your old system?" prompt. | `reconciliation.service.ts/.controller.ts` |
| 2.9 | 🟡 | Hub has no pre-flight checklist ("have ready: item list with costs, fiscal year set…"), no progress %, fiscal-year-missing surfaces as a 409 dead-end. zero-customer businesses can never unlock opening balances (lock requires customers AND suppliers). | `import-hub.tsx:29-44,116-117` |
| 2.10 | 🟡 | Opening wizard amounts render via `formatMoney` (max 4dp, no currency symbol) — KWD 3dp not respected, bare numbers. | `opening/lib/format-money.ts:13-14` |

**His state of mind:** this is the highest-anxiety stage. The pipeline is technically sound but communicates almost nothing about safety, order, or completeness — exactly where "never guess" matters most.

---

### Stage 3 — Go-Live

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 3.1 | 🟡 | "You can't undo this" with no explanation of what going live *changes*. His fear: "can I still fix mistakes after?" | `en/onboarding.json:667` |
| 3.2 | 🟡 | Readiness `data_imports` "Fix this" routes to Step 7 (the intent question), not the Import Hub (where the work happens). | `go-live-screen.tsx:72` |
| 3.3 | 🟢 | Reconciliation panel says "tie-out", "parked balancing entry" — accountant jargon. He needs "your numbers match ✓". | `en/onboarding.json:650-661` |
| 3.4 | 🟡 | Import screen footer: "Skip for now" and "Continue to go-live" do the identical thing; no confirmation that imports were captured. | `import-screen.tsx:37-46` |

---

### Stage 4 — First Login & Orientation

**What's strong:** first-login cluster (welcome banner, walkthrough video, 5-item quick-start checklist with deep links) exists and auto-dismisses.

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 4.1 | 🔴 | **Checklist completion is manual ("Mark done"), not event-driven.** He creates his first invoice; the app doesn't notice. Breaks the core trust loop the checklist exists to build. The code comment admits the gap. | `quick-start-checklist.tsx` |
| 4.2 | 🔴 | **No help/support entry point anywhere in the shell.** No "?" icon, no docs link, no WhatsApp/chat. A confused user's only option is to leave the app. | `user-menu.tsx`, `nav-items.ts` |
| 4.3 | 🔴 | **Settings placeholder panels show "This panel will be built in a future issue."** — internal sprint copy rendered to paying customers. | `placeholder-panel.tsx:32` |
| 4.4 | 🟡 | Dashboard KPIs show zeros with no orientation of what they mean or what populates them. | dashboard |

---

### Stage 5 — Team Setup (manager + 3 cashiers)

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 5.1 | 🔴 | *(Carried from prior audit — re-verify on this branch)* Invite dialog lacks branch scoping; fail-closed `userBranches` means an invited cashier may see nothing. | users module |
| 5.2 | 🔴 | **Any cashier can void a completed sale with no manager PIN** (DEV-335 deferred). For a man who suspects skimming, this is the exact hole he's trying to close. Voids need approval or at least prominent owner-visible reporting. | `void-dialog.tsx:61` |
| 5.3 | 🟡 | Onboarding never tells him roles exist ("you'll assign roles later" missing); no Arabic-only-cashier setup guidance. | step5 |

---

### Stage 6 — Inventory Reality: IMEI, Transfers, Stock

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 6.1 | 🔴 | **Serial/IMEI: 0% built.** `trackingType` column + enum exist; create DTO literally rejects anything but `none` (`z.literal(TrackingType.None)`); no `serial_numbers` table; no GRN serial entry; no POS serial picker; no IMEI search; nothing on receipts. Spec (`inventory/06-serial-batch.md`) is complete; implementation is zero. **Deal-breaker #1, unmet.** | `items.dto.ts:82`, `inventory-items.ts:148-149` |
| 6.2 | 🔴 | **Transfers: 0% built** (confirmed on this branch). Scaffolding everywhere — transit warehouses materialized by onboarding, accounting listener for `inventory.transfer.completed` fully implemented, doc-number slot `TRF`, permission key — but no table, no API, no UI, no emitter. His only workaround: a Lost adjustment in Hawally + Found in Salmiya = **phantom expense + phantom income in his P&L, daily.** Deal-breaker #3, unmet. | `inventory-accounting.listener.ts:134`, `materialize-locations.ts:63-67` |
| 6.3 | 🟡 | **Branch vs warehouse confusion.** He named "Salmiya" in onboarding; stock screens show only warehouses ("MAIN") with no branch grouping and no explanation of the hierarchy. Stock-levels API filters by `warehouseId` only — no `branchId`. | `stock-levels.dto.ts:24` |
| 6.4 | 🟡 | `costPrice` (static, item card) vs `averageCost` (live WAC, drives COGS) diverge after every purchase with zero explanation anywhere. | item form + stock levels |
| 6.5 | 🟡 | No stock-count workflow (spec `08-stock-counting.md` unbuilt); reorder levels are global, not per-warehouse; adjustments irreversible without explicit "cannot be undone" copy or a reverse path. | adjustments module |
| 6.6 | 🟡 | No bulk reprice — phone prices drop weekly; editing 50 items one-by-one. | items PATCH only |

---

### Stage 7 — Selling: Sales 1 → 100

**What's strong:** server-authoritative cart math (Decimal.js, ROUND_HALF_EVEN, `numeric(19,6)`); `CURRENCY_DECIMALS.KWD = 3` with 0.005 cash-rounding advisory; hold/recall (max 5, F2/F3); void with reason + two-step confirm; bilingual 80mm receipt with forced Western digits; z-report with over-short; held carts block shift close.

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 7.1 | 🔴 | **No KNET tender.** Payment modal = Cash and Card tabs only. 80% of his transactions get lumped into generic "card" → z-report payment breakdown can't reconcile against the KNET terminal settlement. Onboarding *asked* about KNET; POS ignores the answer. | `payment-modal.tsx` |
| 7.2 | 🔴 | **No returns/exchanges.** Schema enums + `originalTransactionId` FK exist; no endpoint, no UI. A next-day phone return — guaranteed within his first week — has no path. Deal-breaker #4, unmet. | pos module |
| 7.3 | 🔴 | **"TAX INVOICE / فاتورة ضريبية" hardcoded on every receipt** — unconditional render; wrong for `taxSystem=none`. Plus zero-amount tax breakdown lines can appear. Kuwaiti customers will ask "what tax?" | `receipt-document.tsx:90-92`, `pos-receipt.service.ts:205-218` |
| 7.4 | 🔴 | **POS customer / credit sales unwired.** `customerId` column exists but no customer lookup in POS UI, no charge-to-account, no collection flow from the register. His resellers (deal-breaker #5) can't buy on credit. | codemap + pos components |
| 7.5 | 🔴 | **Cash pay-in/pay-out: schema only.** No API/UI; z-report always shows payIns/payOuts = 0 → expectedCash wrong whenever he drops cash to the safe mid-shift. Undermines his anti-skimming goal. | `pos_cash_movements` |
| 7.6 | 🔴 | **Zero offline resilience.** Every line-add is an API round-trip; connectivity blip = frozen register mid-queue. Salmiya's internet drops weekly. | architecture |
| 7.7 | 🟡 | `step="0.01"` on cash inputs blocks valid 3dp entries (12.505); change-due preview computed with IEEE floats (display-only; server is authoritative). | `payment-modal.tsx:47-49,133`, `shift-close-panel.tsx:152` |
| 7.8 | 🟡 | IMEI on receipt: `serialNumber` exists in `pos_transaction_lines` + AddLineInput but is absent from the ReceiptLine DTO and template — warranty receipts impossible even once serials exist. | receipt DTO |
| 7.9 | 🟡 | Split tender (cash+KNET) supported by `validatePayments` but not exposed in the modal — common for phone purchases. | payment modal |
| 7.10 | 🟡 | Payment/void failures surface as generic toasts ("Payment failed") with no actionable cause for the cashier. | catch blocks |

---

### Stage 8 — Restocking: Suppliers & Purchasing

**What's strong:** supplier CRUD with auto codes + payment terms; bill→confirm posts stock + WAC + GL atomically; partial payments with allocation validation; clean 0-tax purchase JEs.

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 8.1 | 🟡 | **No PO layer, no partial receipts** ("the bill IS the receipt"). Receiving 15 of 20 iPhones forces bill-splitting gymnastics. Acceptable MVP simplification *if explained* — it isn't. | `purchase.md`, invoices service |
| 8.2 | 🟡 | Confirm-bill dialog doesn't say it simultaneously receives stock AND posts to the GL — the single most consequential click in purchasing. | `confirm-bill-dialog.tsx:26` |
| 8.3 | 🟡 | "Bill" vs "Invoice" terminology mixed across routes/components/i18n. | `/purchase/invoices` + `BillsListPanel` |
| 8.4 | 🔴 | **KWD displayed at 2dp** — `displayMoney()` hardcodes `min/maximumFractionDigits: 2` in inventory AND purchase libs. A 1.250 KD accessory shows as "1.25"; up to 10-fils display error per line. (POS's own `formatCurrency` does it right via Intl currency style.) | `features/inventory/lib/display.ts:16`, `features/purchase/lib/display.ts:16` |
| 8.5 | 🔴 | No PDC handling anywhere despite onboarding asking — his supplier payments by post-dated cheque have no representation. | step3 + payments |

---

### Stage 9 — Money Truth: Accounting & Reports

**What's strong (genuinely):** DEV-330 has landed — credit-sale AR/Revenue JE posts; POS cash/card, customer receipts (incl. FX/advance/overpayment), purchase bills + supplier payments all auto-post; 0-tax flows are clean (empty taxLines); KW COA correctly keeps generic non-VAT names; opening-balance wizard posts GL atomically; AR aging is excellent (5 buckets, branch filter); cash-flow statement exists.

| # | Grade | Finding | Evidence |
|---|---|---|---|
| 9.1 | 🔴 | **Reports `formatMoney()` hardcoded 2dp** — same KWD truncation as 8.4, across P&L, trial balance, AR aging, everything. Three separate hardcoded formatters now (reports, inventory, purchase) = no single currency-aware money formatter. | `features/reports/lib/format.ts:35-36` |
| 9.2 | 🔴 | **No per-branch P&L.** "Is Salmiya profitable?" is THE question a 2-store owner asks; the DTO has no `branchId`. (AR aging and GL have it.) | `profit-and-loss.dto.ts:19-39` |
| 9.3 | 🔴 | **No AP aging at all, no Balance Sheet at all.** "Who do I owe" has no report; his quarterly accountant will ask for a balance sheet on day one. | reports registry (9 entries) |
| 9.4 | 🔴 | **No expense entry for non-accountants.** Rent/salary = manual journal entry with DR/CR account picker. No `expense` event, no simple form. He will simply not record expenses → P&L fiction. | `accounting-events.constants.ts` |
| 9.5 | 🔴 | **Purchase returns / landed cost post no JEs** — event constants declared, handlers absent. Returning defective phones to the distributor silently skips the books. | `purchase-accounting.listener.ts` (only 2 @OnEvent) |
| 9.6 | 🟡 | Dead-letter queue: API + retry exist, **zero UI** (`grep deadLetter apps/web → nothing`). Failed postings = silently incomplete books, invisible to everyone. | `dead-letter.controller.ts` |
| 9.7 | 🟡 | Kuwait COA noise: dormant VAT sub-accounts 1162.10/2131.10 still seeded for KW; Tax Summary report card shown to no-tax tenants. | `coa-country-overlays.ts:162`, `report-registry.ts:83` |
| 9.8 | 🟡 | No "cash today" view (buried in trial balance); owner drawings only exists as "Dividends Declared" (corporate label, wrong for a Kuwaiti SME); month-end checklist written in accountant-ese ("FX revaluation" for a single-currency tenant). | COA + `close-defaults.ts` |

---

### Stage 10 — Month-End & The Accountant Visit

His quarterly accountant asks for: trial balance ✅, GL ✅, P&L ✅ (entity-level only), **balance sheet ❌, AP aging ❌**, expense ledger (**empty**, see 9.4). Verdict from the accountant — "the books are half-real" — is the moment Yousef churns, ~90 days in.

---

## Part 3 — The "Never Guess" Gap Analysis

Zerupt's motto is *the customer never has to guess*. Inventory of what exists vs. what's missing:

### What exists (the guidance assets)
- Onboarding: InfoTips + 2-line descriptions on every question, save indicator, full ar/en parity (477/477 keys)
- Dashboard: first-login cluster (banner, video, checklist), `DashboardEmptyState` with CTA, error states with retry
- Confirm dialogs with "cannot be undone" on adjustments/bills/payments/deletes
- Toasts: specific success messages; `ApiError.message` surfaced
- Item form: dirty-state guard dialog

### The 7 systemic guidance gaps (ranked by leverage)

| # | Gap | Today | Fix shape |
|---|---|---|---|
| G1 | **Empty-state dead-ends** | ~15 list pages (items, invoices, bills, suppliers, customers, payments, stock…) render dashed-box text with **no CTA** — the strings ("Add your first supplier…") already exist in both languages, unwired | One shared `GuidedEmptyState` (title/hint/CTA/icon) + wiring |
| G2 | **App notices nothing** | Quick-start "Mark done" is manual; creating an invoice doesn't tick `create_invoice` | Auto-complete in mutation `onSuccess` (short-term), events later |
| G3 | **No help anywhere** | No "?" icon, docs link, or support channel in the entire shell; placeholder panels leak "will be built in a future issue" | Help entry (even WhatsApp link) + replace dev copy |
| G4 | **Silent prerequisite blocks** | Invoice create with no customers = greyed button, no explanation (`noCustomers` is already computed!); same for bills/no-supplier; POS opens on an empty catalog with no warning | Prerequisite callouts with "Add customer →" links |
| G5 | **Field help stops at onboarding** | Item form's `valuationMethod` (irreversible accounting consequence!), reorderLevel, taxGroup, invoice due date/terms — zero InfoTips, while onboarding tooltips simpler concepts | Extend existing `InfoTip` to the 3 high-consequence forms |
| G6 | **Consequence-blind moments** | Confirm-bill doesn't say "this receives stock + posts to your books"; skipping opening balances doesn't say "reports start at zero"; "Reimport" doesn't say "this ADDS"; go-live doesn't say what changes | Consequence lines in existing dialogs |
| G7 | **Jargon at trust moments** | "Database provisioned", "tie-out", "parked balancing entry", "transit location", "FX revaluation" — all at high-anxiety moments | Plain-language pass on ~10 strings |

Inconsistent smaller items: journal-entry + customer forms lack dirty guards (item form has one); most submit buttons disable without spinners; reports empty states say "No data to display." with no "post your first invoice →" hint.

---

## Part 4 — Verdict & Prioritized Fix Plan

### Can Yousef go live today?
**No.** Of his 6 deal-breakers: KWD math is correct server-side (display broken), and that's the only one fully green. IMEI (0%), KNET tender (0%), transfers (0%), returns (0%), POS credit sales (0%).

### Tier 0 — Trust & correctness one-liners (days, do first)
1. Kuwait "Tax: VAT" preview → `taxRegime/taxLabel: none` for KW/QA (1.1)
2. "TAX INVOICE" header conditional on `taxSystem !== "none"` + suppress zero tax lines (7.3)
3. **One shared currency-aware money formatter** (KWD 3dp) replacing the three hardcoded 2dp copies + `step="0.001"` inputs + decimal-safe change preview (8.4, 9.1, 7.7, 2.10)
4. Kuwait defaults: bilingual receipts `true`, payments `["cash","knet"]`, KNET description, PDC nudge (1.2, 1.3, 1.6)
5. Replace placeholder-panel dev copy; fix the contradictory branch-stock InfoTip; jargon pass (4.3, 1.5, G7)

### Tier 1 — Universal blockers (Yousef + every ME customer)
6. **POS returns/exchanges** (7.2)
7. **KNET tender** in payment modal + z-report breakdown (+ split tender) (7.1, 7.9)
8. **Stock transfers** — table + API + UI; accounting listener already done (6.2)
9. **POS customer attach + credit sale + collection** (7.4)
10. Cash pay-in/pay-out API + UI (7.5)
11. Manager PIN on completed-sale voids (5.2) + invite branch scoping (5.1)
12. **Expense quick-entry** form (9.4) + AP aging + Balance Sheet + per-branch P&L (9.2, 9.3)
13. Import safety: templates, cp1256 detection (or "use XLSX" guard), WAC-zero warning, undo/replace mode, reconciliation UI (2.3–2.8)

### Tier 2 — The guidance layer ("never guess" as a system)
14. GuidedEmptyState rollout (G1) · event-driven checklist (G2) · help entry (G3) · prerequisite callouts (G4) · field-help on item/invoice/bill forms (G5) · consequence copy (G6)
15. Branch/warehouse orientation: branch grouping in stock filters + one explainer (6.3); per-customer/supplier opening balances (2.2)

### Tier 3 — The vertical unlock (Kuwait electronics)
16. **Serial/IMEI end-to-end:** `serial_numbers` table → GRN entry → POS picker → IMEI search → receipt line → warranty lookup (6.1, 2.1, 7.8). Spec already written (`inventory/06-serial-batch.md`).
17. Offline POS resilience (7.6) — at minimum: connection-loss banner, cart re-hydration, queued line-adds
18. Purchase-return + landed-cost JE handlers (9.5); dead-letter UI/alerting (9.6); stock counts; bulk reprice; PDC handling (8.5)

### What must be 100% before HIS go-live
- Every fils correct on every screen (one formatter, tested for KWD)
- Receipt indistinguishable from Kuwaiti norms: bilingual, no tax language, IMEI line
- Migration provably complete: reconciliation screen he can show his accountant
- A cashier can't lose a sale to a connection blip, and can't void without the owner knowing
- His books survive the accountant's quarterly visit (balance sheet + AP aging + expenses recorded)

---

## Part 5 — Live Test Plan: Sub-Flows (any agent can execute these)

> Goal: simulate Yousef live, in a **headed Playwright browser** the founder can watch, while verifying every state change in **Supabase** (auth) and **Neon** (admin + tenant DBs). Test against `main` (PR #138 merged the DEV-387 wizards).

### 5.0 Environment & conventions

| Thing | Value |
|---|---|
| Web | `http://localhost:3000` — `pnpm --filter @zerupt/web dev` (from `erp/`) |
| API | `http://localhost:3001` — `pnpm --filter @zerupt/api dev` |
| Supabase project | `vvctlopwozfhqxlvcpky` (Auth + Storage) — verify users/claims via Supabase MCP |
| Neon admin DB | `zerupt_admin` on `ep-fancy-king-a11gw110` (ap-southeast-1) — tenant registry |
| Neon tenant DB | created per signup (check `tenants` table in admin DB for the db name) — query via Neon MCP `run_sql` |
| Test identity | `yousef.test+<n>@zerupt-e2e.com` — create via Supabase admin API with `email_confirm: true` (no confirm-email loop). One fresh user per full run; never reuse a tenant across runs. |
| Test data | `agent-os/product/user-journeys/test-data/yousef/` (9 CSVs, deterministic, see its README) |
| Headed browser | drive via a Playwright script run with `--headed` (e.g. adapt `apps/web/e2e/onboarding/onboarding-import-fresh.spec.ts`, which already encodes the KW fresh-tenant path), or an ad-hoc `node` Playwright script with `headless: false`, `slowMo: 150` |
| Artifacts | screenshot every layer boundary + every failure → `apps/web/e2e/.artifacts/yousef-live/` |
| Rule | a sub-flow PASSES only if UI **and** DB agree. UI success with wrong/missing rows = FAIL. Log findings; do not fix code mid-run. |

### 5.1 Layer map

| Layer | Sub-flow | Test data | Exercises audit findings |
|---|---|---|---|
| L1 | Signup → provisioning | — | Stage 0 |
| L2 | Onboarding wizard (KW, 7 steps) | — | Stage 1, Tier 0 (Tax: VAT, defaults) |
| L3 | Import: categories + products | 01, 02 | Stage 2 (dup SKUs, KD prefix, empty rows, serial flag) |
| L4 | Import: customers + suppliers | 03, 04, 09 | Stage 2 (Arabic, balances, parenthesis credits, cp1256) |
| L5 | Import: opening stock + trial balance | 05, 06, 08 | DEV-387 wizards (orphans, dup pairs, plug accounts) |
| L6 | Reconciliation + go-live | all | Stage 3 (readiness gating, one-way transition) |
| L7 | First operations (POS sale, KWD 3dp) | imported data | Stage 7, deal-breakers 2/6 |
| L8 | Books truth (TB, P&L, JE audit) | all | Stage 9, 100%-financial bar |

### 5.2 Sub-flow specs

**L1 — Signup → provisioning**
1. Create fresh Supabase user (admin API, confirmed). Sign in at `/` → expect redirect to `/setup` or onboarding.
2. Verify — Supabase: user exists, `app_metadata.tenant_id` set after provisioning (JWT claim via `custom_access_token_hook`; see memory `project_auth_jwt_tenant_claim`). Neon admin: row in `tenants` with status + tenant db name. Neon: tenant DB exists and is migrated (has `__drizzle_migrations` / core tables).
3. Watch for: provisioning spinner stuck, errors swallowed, partial tenant (admin row without DB).

**L2 — Onboarding wizard (Kuwait)**
1. Business: name "Al-Deera Mobile Center", country **KW**. ⚠️ Expect Tier-0 bug: review may show "Tax: VAT" (`countries.ts:47-48`) — screenshot it.
2. Complete all steps; choose 2 branches if wizard allows (Hawally, Salmiya) else 1 + add second later; toggle importProducts/importCustomers = true.
3. Verify — tenant DB: `company`, `branches`, `warehouses`, settings rows; currency KWD, decimals 3; payment methods (expect bug: cash-only default, no KNET — `step6-transform.ts:70-71`); bilingual receipts flag (expect `false`).
4. Watch for: jargon, missing field help, no-VAT path correctness.

**L3 — Import: categories + products**
1. Import hub → categories (`01-categories.csv`, 25 rows) → expect 25 created.
2. Products (`02-products.csv`, 3,000 rows). Known mess: ~10 dup SKUs, ~15 empty purchase rates, ~5 `KD `-prefixed prices, ~8 missing barcodes, 2 blank rows.
3. Verify — UI count vs `SELECT count(*) FROM items`. Dup SKUs: skipped silently or surfaced? `KD 12.500` cells: rejected with row-level error or imported as 0/NaN? `Track Serial=Yes` (400 phones): expect **dropped** (`items.dto.ts:82` forces tracking None) — confirm in DB (`tracking_type`).
4. Pricing: spot-check 10 phones — selling price must keep 3 dp exactly (`.750` not `.75`); screenshot list page (client formatters hardcode 2dp — Tier 0).

**L4 — Import: customers + suppliers**
1. Customers (`03-customers.csv`, 800): verify Arabic names stored + rendered RTL; mobiles preserved across the 3 formats; **37 opening balances** — do they import at all (audit: entity-fields has no balance field)? If yes: AR control + per-customer balance JE in `journal_entries`/`journal_lines`; parenthesis credits `(320.750)` must become negative, not parse-fail.
2. Suppliers (`04-suppliers.csv`, 18): same for AP.
3. cp1256 (`09-customers-windows1256.csv`, 50): expect garbled Arabic (`import-file-parser.ts:113-115` UTF-8 only). Document exact behavior: garbage import vs preview warning vs crash. Screenshot.
4. Verify — counts, encoding round-trip of 5 sampled Arabic names via SQL.

**L5 — Opening stock + opening balances (DEV-387 wizards)**
1. Opening stock Hawally (`05`, ~2,206) then Salmiya (`06`, ~1,406). Warehouse names in file ("Hawally Main") won't exactly match — observe mapping UX.
2. Mess: 6 orphan SKUs, 4 zero-qty rows, 2 dup (SKU, warehouse) pairs — row-level errors or silent drops?
3. Verify — `stock_levels` sums per warehouse; opening-stock JE: Inventory Dr / Opening Balance Equity Cr, value = Σ(qty×cost) of accepted rows; WAC seeded.
4. Trial balance (`08`, 12 rows): Tally names ("Sundry Debtors"), 2 Arabic-only accounts, thousands separators, Owner Capital 1,752,982.690 + Retained Earnings 185,420.350. Verify mapping flow, posted JE debits == credits exactly (KWD 3 dp, no rounding loss), and interaction with already-imported AR/AP/inventory (double-count risk: TB Sundry Debtors vs L4 customer balances).

**L6 — Reconciliation + go-live**
1. Compare what Yousef can SEE: does any screen prove "3,000 sent → N imported → M failed, here's why"? (Audit: import safety, Tier 1.)
2. Go-live: readiness checklist states, warnings for skipped imports, one-way transition. Verify go-live state flag in tenant DB; confirm wizard is no longer re-enterable.

**L7 — First operations**
1. POS: sell 1 phone + 1 accessory. Expect: no IMEI prompt (deal-breaker 1 missing), tender shows cash only (no KNET).
2. Verify — sale row, stock decrement on correct warehouse, JE (DEV-330 landed: COGS/Revenue/AR-Cash), every amount 3 dp in DB **and** on receipt; receipt header: expect wrong "TAX INVOICE" (`receipt-document.tsx:90-92`) — screenshot.

**L8 — Books truth**
1. Reports: trial balance in-app vs source `08` file + sale from L7. P&L shows the sale's margin (WAC from opening stock). Check missing reports (balance sheet, AP aging — audit Tier 1).
2. SQL: `SELECT sum(debit), sum(credit) FROM journal_lines` — must be equal; no journal line with >3 dp; every mutation has an audit log row.

### 5.3 Reporting

Each layer produces a results block appended to a run log (`test-data/yousef/RUN-<date>.md`): sub-flow ID, PASS/FAIL/BLOCKED, evidence (screenshot path + SQL output), and which audit finding it confirms or refutes. Findings feed the Tier 0–3 fix plan above — no fixes during the run.

---

*Sources: 6 parallel code audits (2026-06-04) on `phase-5/DEV-387-opening-import-wizards` — onboarding, import/DEV-387 wizards, POS/sales, inventory/purchasing, accounting/reports, guidance layer. File:line evidence inline above.*
