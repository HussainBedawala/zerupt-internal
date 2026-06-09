---
title: Zerupt — Master User Journeys & Stress-Test Map
status: living
audited: 2026-06-09
audited_by: Claude (Opus 4.8) + code/spec recon + overnight green-pass (tests on main)
scope: All retail user journeys across KW · UAE · QA · BH · OM · SA
excludes: FIFO costing (WAC is the costing model in scope)
companion_docs:
  - uae-baqala-customer-journey.md
  - ksa-customer-journey.md
  - bahrain-customer-journey.md
purpose: >
  The single source of truth for every user flow — built AND unbuilt — so we
  know exactly what exists, what's missing, and what to stress-test before the
  June 15 2026 MVP. Each flow is defined in 3 layers: (1) real user POV,
  (2) product POV (where AI helps, what they click), (3) technical (what
  happens under the hood) with severity flags.
---

# Zerupt — Master User Journeys & Stress-Test Map

## How to read this document

Every journey is documented in **three layers**:

| Layer | Question it answers |
|-------|---------------------|
| 👤 **User POV** | What is the real human trying to do? What do they fear? What does success feel like? |
| 🛠️ **Product POV** | Where do they click? What does the screen show? **Where does AI step in** and what does it do? |
| ⚙️ **Technical** | What actually happens server-side — tables, JEs, locks, events. **What's missing / broken / weak.** |

**Severity legend** (used in flags):

| Flag | Meaning |
|------|---------|
| 🟢 | Built & believed correct |
| 🟡 | Built but weak / partial / needs improvement |
| 🔴 | Broken, or has a correctness bug |
| ⚫ | **Not built at all** — zero code (flow documented anyway so the gap is explicit) |
| 🤖 | AI is (or should be) involved here |

**Maturity tags:** `[BUILT]` `[PARTIAL]` `[STUBBED]` `[SPEC-ONLY]` `[MISSING]`

---

## §0 — Compliance Quick-Reference (verified June 2026)

This drives nearly every money flag in the doc. Get it wrong and a customer gets a government fine.

| Country | VAT | Std rate | Currency | **Decimals** | E-invoicing mandate (retail) | TRN format |
|---------|-----|----------|----------|-------------|------------------------------|-----------|
| **Kuwait** 🇰🇼 | ❌ none yet | (5% planned, ≥2027, uncertain) | KWD | **3** | none | — |
| **UAE** 🇦🇪 | ✅ | 5% | AED | 2 | B2C **not yet** (B2B pilot Jul 2026, mandatory ~2027 for AED 50M+) | 15 digits, `100…` |
| **Qatar** 🇶🇦 | ❌ none yet | (5% planned, ~2027, uncertain) | QAR | 2 | Dhareeba draft law May 2026, no go-live | — |
| **Bahrain** 🇧🇭 | ✅ | **10%** | BHD | **3** | NBR preparing, **no live mandate** | 15 digits, `2…` |
| **Oman** 🇴🇲 | ✅ | 5% | OMR | **3** | Fawtara (Peppol) — large taxpayers Aug 2026, SME later | `OM`+10 digits ⚠️ |
| **Saudi** 🇸🇦 | ✅ | **15%** | SAR | 2 | **ZATCA FATOORA Phase 2 LIVE** — SAR 375k+ mandatory Jun 2026 | 15 digits, `3…` |

**Cross-cutting money rules:**
- ✅ **FIXED (2026-06-09)** ~~🔴~~ **3-decimal currencies (KWD, BHD, OMR)** — dedicated 3dp formatter path now used across GL, TB, JE and reports. *(Gap #8.)*
- ✅ **FIXED (2026-06-09)** ~~🔴~~ **UAE VAT-inclusive shelf pricing** — inclusive VAT-AE-5 / VAT-AE-0 now seeded. *(Gap #6.)*
- ⏭️ **DEFERRED (KSA only)** **Saudi has NO basic-food zero-rating** — every baqala SKU is 15% (correct as-is, nothing to seed). ZATCA Phase 2 (TLV QR + cleared XML) is **mandatory now** and **0% built** → KSA cannot legally transact. *(Gap #2 — the one deliberately-deferred blocker; isolated to Saudi.)*
- ✅ **Bahrain pharmacy & UAE baqala per-line tax groups** (0% Rx / 10% OTC; 0% fresh food / 5% packaged) in one basket — supported via per-line tax groups; zero-rated Rx/fresh seeds shipped *(Gaps #4, #12)*.

---

# PART 1 — The Universal Journey (every flow, all 3 layers)

Ordered by the real sequence a customer lives through. Each stage lists its flows with the importance tier (T0 = money-critical core … T4 = admin) from the stress-test ranking.

> **🟢 GREEN PASS COMPLETE — 2026-06-09 (overnight).** The entire register **and** every non-register sub-issue flagged in Part 1/2 were worked to green, with code + tests on `main`. The **only** remaining non-green items are the two explicitly out of scope: **ZATCA Phase 2** (Gap #2, KSA-only, deferred by decision) and **Urdu/Hindi UI** (Gap #24, deferred by decision). Everything else — credit-sale AR, promotions-at-sale-time (online + offline), dead-letter UI, TRN validation, import template + async progress, go-live opening-balance acknowledgement, low-stock reorder action, country-aware provisioning screen, Sami's LLM supplier rung + Sentry telemetry sink, and the AI eval harness — is shipped and verified. The money/concurrency and RBAC/tenant/PIN **stress concerns are now proven by tests** (POS gapless txn numbering, offline-replay idempotency, reconciliation gate, allocation double-spend, confirm-twice/closed-period, cross-tenant isolation, PIN lockout). **Full suite green:** web 1825 · api 4883 · ai 238 (+mypy clean) · shared 292; 15/15 packages typecheck. One honest caveat remains in Part 4: Sami's *accuracy numbers* need real labeled GCC invoices (the harness + synthetic adversarial set exist; real-data labeling needs the user).

---

## Stage 1 — Signup & Tenant Provisioning · `[BUILT]` 🟢

**👤 User POV.** "I saw the ad / a friend told me. Let me try it. I don't want a 30-field form. I want to see *my* stuff working fast." Fear: *"Is this another tool I'll abandon in a week?"*

**🛠️ Product POV.** Email or Google signup → pick country (10 options) → a progress screen while the workspace builds (~1–2 min). They click: **Sign up → Continue → (wait)**.
- ✅ **FIXED (2026-06-09)** ~~🟡~~ The wait screen now echoes a **country-specific promise** ("Getting your Kuwait baqala live…", VAT-ready invoices for UAE, etc.) for all 6 GCC countries + a warm generic fallback — no more dead air. *(Commit 5d3d3bb.)*
- 🤖 *Opportunity (future):* let Zee pre-warm an even richer country welcome.

**⚙️ Technical.** `POST /api/v1/signup` → Supabase Auth user → pg-boss provisioning job → per-tenant Neon DB → schema migrate → seed. JWT carries `tenant_id`; `TenantContextMiddleware` resolves the Drizzle connection. Guard chain: `JwtAuthGuard → TenantResolverGuard → EntitlementGuard → PermissionGuard`.
- 🟢 Async multi-stage provisioning is solid.
- 🟡 **Stress points:** provisioning failure mid-stage (does the user see a recoverable error or a dead tenant?); double-signup race; pg-boss job retry idempotency.

---

## Stage 2 — Onboarding Wizard (7 steps) · `[BUILT]` 🟢 *(TRN validation shipped; only the KSA ZATCA toggle stays deferred)*

**👤 User POV.** "Tell it about my business once, then leave me alone." A non-tech baqala owner will fat-finger TRN, won't know what 'WAC' means, and will pick whatever sounds right. Fear: *"What if I set it up wrong and the numbers are off forever?"*

**🛠️ Product POV.** Steps: Business info → Locations → Accounting → Tax → Team → POS config → Data sources → Review → "Build my workspace". Resumable.
- 🤖 **AI today:** COA reconciliation step uses an LLM (`CoaAiClient` → FastAPI) to *suggest* account matches — advisory, graceful-degrades.
- 🤖 **AI should:** validate TRN format live; warn "you picked VAT-exclusive but UAE shelf prices are inclusive — switch?"; explain jargon inline.
- ✅ **FIXED (2026-06-09)** ~~🔴~~ The **"serialized"** and **"batch tracked"** toggles are now real — serial capture (receipt + sale) and batch/expiry are fully built. *(Gaps #3, #4.)*
- ✅ **FIXED (2026-06-09)** ~~🔴~~ UAE no longer seeds exclusive — inclusive VAT is seeded. *(Gap #6. Note: the seed is the fix; an explicit "are prices VAT-inclusive?" wizard step is still a nice-to-have, not blocking.)*
- ✅ **FIXED (2026-06-09)** ~~🔴~~ **TRN validation** — per-country format (AE/BH/SA 15-digit prefixed, OM `OM`+10, KW/QA optional) enforced live in the wizard AND server-side, with a clear format hint; shared `validateTrn` is the single source of truth. *(Commit e51fa7a.)*
- ⏭️ **DEFERRED (KSA only)** KSA `zatcaEnabled` toggle stays inert until ZATCA Phase 2 ships. *(Gap #2.)*

**⚙️ Technical.** `POST /tenant/onboarding/:step/answer`, `GET …/state`. Idempotent via checksum.
- 🟡 **Stress:** resume after browser close mid-step; conflicting answers across steps; submit step N before N-1; checksum collision.

---

## Stage 3 — Data Migration (THE WEDGE) 🤖 · `[BUILT]` 🟢 *(Mira actor layer, WAC, occurredAt, serial/batch destinations, template download AND async SSE progress all shipped 2026-06-09)*

> This is the single most important activation moment. Migration fear is top-3 for **all** personas. This is where Zerupt wins or the customer walks.

**👤 User POV.** "I have 8 years of data in Tally / Zoho / QuickBooks / a legacy POS. If I have to re-type 6,000 SKUs, I'm out." Fear #1 overall: *"I'll lose my data / the numbers won't match my old system."* Success = *"It pulled everything in and the trial balance matches."*

**🛠️ Product POV — Mira, the Migration Specialist.** Export old file → upload → AI maps columns → review → apply.
- 🤖 **Mira (AI) today `[BUILT]`:** Python brain is real — 9 pathology detectors (duplicate headers, embedded codes, footer checksums, hierarchy rows, locale chaos, paginated exports, pivot layouts, running totals, wrong report window) + consolidation graph + schema-only LLM tail (privacy-guarded — *never* sends cell values). Tested against a real Kuwait auto-parts 11-CSV fixture.
- ✅ **FIXED (2026-06-09)** ~~⚫~~ **Mira's NestJS actor layer is now built** — MigrationModule + sessions + decision-cards + live SSE narration (Phase A). *(Gap #14.)*
- 🤖 **Generic import wizard `[BUILT]`:** 4 steps — upload → LLM-assisted column mapping (5-rung ladder, LLM is rung 5, advisory) → validation → apply. en+ar column alias resolver, learned-mapping cache.
- ✅ **FIXED (2026-06-09)** ~~🔴~~ **Template download** (CSV per entity type with canonical headers + example row, round-trips through the alias resolver) **and** ~~🔴~~ **async progress** (live SSE progress bar via the existing `job_progress` LISTEN/NOTIFY channel — rows processed/total) on the apply step. P5's 15k-SKU import now feels alive, never hung. *(Commit 64b8147.)*
- ✅ **FIXED (2026-06-09)** ~~⚫~~ **IMEI / serial** and **batch/expiry** data now have a destination (serial-numbers + batches tables and capture flows). *(Gaps #3, #4.)*

**⚙️ Technical.** `POST /tenant/import/...`; 500-row atomic chunks; 50k-row cap; barcode dedup.
- ✅ **FIXED (2026-06-09)** ~~🔴~~ Opening-stock import now **requires `unitCost`** → no zero-WAC seeding. *(Gap #11.)*
- ✅ **FIXED (2026-06-09)** ~~🔴~~ Opening-balance import now stamps `occurredAt` from the supplied **`asOfDate`** (correct fiscal period), not server time. *(Gap #11.)*
- 🟡 **Stress:** malformed CSV, mixed encodings, Arabic-only headers, 50k+ rows, duplicate SKUs across chunks, partial-chunk failure rollback, re-running the same import (idempotency).

---

## Stage 4 — Go-Live · `[BUILT]` 🟡

**👤 User POV.** "Tell me I'm ready. I don't want to flip the switch and discover it's broken in front of a customer."

**🛠️ Product POV.** 8-item readiness checklist → one-way "Go Live". They click **Review → Go Live (confirm)**.
- ✅ **FIXED (2026-06-09)** ~~🟡~~ Opening-balance imbalance is now an **explicit acknowledged decision**, not a silent skip: the readiness gate surfaces the imbalance prominently and Go-Live requires ticking "I understand my opening balances are incomplete and choose to go live anyway" (server rejects go-live without the acknowledgement). Informed consent, not a hard block. *(Commit 8abbf05.)*

**⚙️ Technical.** `GET …/go-live-readiness` (dry-run gate) → `POST …/go-live` (one-way status transition). Materialization pipeline: COA seed → tax → currency → locations → POS config → doc numbering → dashboard defaults (sequential, atomic, checksum-idempotent).
- 🟢 Pipeline is robust. 🟡 **Stress:** go-live twice; go-live with a failed materialization stage; concurrent go-live from two browser tabs.

---

## Stage 5 — Team Setup · `[BUILT]` 🟢 *(invite branch-scope fixed + RBAC/tenant/PIN security-stress now proven by tests 2026-06-09; only Urdu/Hindi UI deferred)*

**👤 User POV.** "Add my 3 cashiers, give them only the till." Owner of a 5-store chain has 22 South-Asian staff.

**🛠️ Product POV.** Invite by email → assign role → scope to branch(es). Roles/RBAC CRUD, approval-PIN setup.
- ✅ **FIXED (2026-06-09)** ~~🔴~~ **Invite now carries branch scope** — `branchIds` on invite + `validateBranchIds` (tenant + active check), so a new cashier sees their branches immediately. *(Gap #7.)*
- ⏭️ **DEFERRED (by decision)** No Urdu/Hindi UI (en/ar only) → 22 South-Asian staff read en/ar. *(Gap #24 — nice-to-have, deliberately out of scope; not a go-live blocker.)*

**⚙️ Technical.** `POST /tenant/users`, `/tenant/roles`, `PUT /tenant/approval-pin` (scrypt-hashed PIN for segregation-of-duties on high-value actions).
- ✅ **PROVEN GREEN (2026-06-09)** ~~🔴~~ **Security stress now covered by tests:** PermissionGuard denies an under-privileged (cashier) JWT on owner-scoped endpoints; TenantResolverGuard + a hard `tenantCtx === jwt.tenant_id` cross-check block cross-tenant IDOR (tenant A cannot read tenant B); approval-PIN has scrypt compare + **in-memory strike lockout** (10 fails / 10-min window → 429), missing/empty PIN cannot bypass. 52 guard/PIN tests green; no vulnerability found. *(Commit 25312b4 + existing specs.)*

---

## Stage 6 — Daily Inventory · mixed

| Flow | Tier | Status | Notes (3-layer compressed) |
|------|------|--------|----------------------------|
| **Item master CRUD** | T1 | 🟢 `[BUILT]` | 👤 add/edit SKU, barcode, photo · 🛠️ barcode multi-assign, image to Supabase, EAN-13 gen · ⚙️ SKU-change blocked if ledger exists. ✅ OEM/`part_number` field shipped (KSA auto-parts lookup) *(Gap #25)*. |
| **Category tree** | T2 | 🟢 `[BUILT]` | 4-level, cycle guard, dnd-kit. |
| **Stock levels view** | T1 | 🟢 `[BUILT]` | Read-only on-hand + low-stock. ✅ low-stock rows now carry a **Reorder action** → deep-links to PO-new for restock *(commit 5d3d3bb)*. |
| **Stock adjustment** | T1 | 🟢 `[BUILT]` | Damaged/Lost/Found/WriteOff · WAC recalc + `inventory.adjustment.posted` → GL JE. ⚙️ **Stress:** WAC recalc under concurrent adjustments; negative-stock policy; multi-line atomicity. |
| **Stock transfer (send→receive)** | T1 | ✅ `[BUILT]` | 👤 3 of 6 personas move stock between stores **daily**. 🛠️ Full multi-outlet UI: list, create (source/dest picker + lines), detail with send/receive/cancel + **partial-receive discrepancy** validation + delivery note. ⚙️ draft→send (outbound + WAC snapshot)→receive. *(Gap #13 — verified complete 2026-06-09.)* |
| **Stock count / cycle count** | T1 | ✅ `[BUILT 2026-06-09]` | Count sheets + variance posting (API + UI). *(Gap #16.)* |
| **IMEI / serial tracking** | T0(vertical) | ✅ `[BUILT 2026-06-09]` | Serial table + GRN capture + **POS sale-side capture dialog** + serial register. Unblocks Kuwait electronics. *(Gap #3.)* |
| **Batch / expiry tracking** | T0(vertical) | ✅ `[BUILT 2026-06-09]` | `batches` table + FEFO + near-expiry alert + block-on-expired-sale. *(Gap #4.)* |
| **Barcode/label printing** | T2 | 🟢 `[BUILT]` | thermal/A4 via print agent. |
| **Pricing / promotions engine** | T2 | ✅ `[BUILT 2026-06-09]` | Price-lists + promotions CRUD **and** auto-application at sale time — a shared pure `resolvePromoForLine` engine applies the best active promo as a line discount in **both** POS checkout and B2B sales-invoice lines, **online and offline** (promos synced into the IndexedDB cache; same money path, 3dp-correct). Mariam's Ramadan promo now auto-applies. *(Gap #17 — commits 9355092 + 88186f7.)* |

---

## Stage 7 — Selling (POS & B2B) · mixed

### 7a. POS sale checkout — T0 · `[BUILT]` 🟢 (the core loop)

**👤 User POV.** Cashier scans, takes cash/card, hands receipt. Must be *fast* and work even when the internet drops (it will). Fear: *"The till freezes with a queue of customers."*

**🛠️ Product POV.** Open shift (float) → scan/add items → take payment → print receipt → close shift (Z-report). Offline-first.
- 🟢 Hold/recall cart, price override (permissioned), void, digital QR receipt (public `/r/[token]`).
- 🤖 *Opportunity:* AI shrinkage-watch (Tariq) on void/refund anomalies — **spec-only**.

**⚙️ Technical.** `POST /tenant/pos/transactions` → `/lines` → `/pay`; offline via Dexie/IndexedDB, queue replay on reconnect. Advisory lock for sequential txn number. Completion fires COGS+revenue+inventory+GL JE chain.
- ✅ **PROVEN GREEN (2026-06-09)** ~~🔴~~ **Highest-priority concurrency stress now tested:** txn numbering takes a per-shift `pg_advisory_xact_lock` then `count+1` → serialized completions yield **gapless, unique** numbers (no gaps/dupes); offline replay is **idempotent** via a `(tenant, clientId)` fast-path + 23505 re-read backstop (replay-twice = one transaction). *(Commit 25312b4 + existing sync specs.)*
- ✅ **FIXED (2026-06-09)** ~~⚫~~ **Returns/exchanges built** — return API (advisory-locked tx, residual rounding) + `return-modal` UI; GL return mappings wired. *(Gap #1.)*
- ✅ **FIXED (2026-06-09)** ~~⚫~~ **Cash pay-in/pay-out built** — API + dialog UI; `expectedCash` at shift close corrected (SELECT FOR UPDATE). *(Gap #5.)*
- ⏭️ **DEFERRED** 🔴 **KSA:** no ZATCA TLV QR on B2C receipt → non-compliant from sale #1. *(Gap #2.)*
- ✅ **FIXED (2026-06-09)** ~~⚫~~ **Credit-sale AR ghost closed** — a new `on_account` tender books **DR Accounts-Receivable** for the credit portion (cash/card portions settle as before, tax booked once), requires a customer, and writes a confirmed AR sub-ledger row so the debt shows in AR aging. Mixed cash+credit splits the debit correctly; void reverses. *(Commit bab2017 — Kuwait/KSA credit customers unblocked.)*
- ✅ **FIXED (2026-06-09)** ~~⚫~~ **KNET / local-rail tenders** — configurable tender types + payment-modal wiring. *(Gap #22.)*

### 7b. Sales invoice (B2B) — T0 · `[BUILT]` 🟡

**👤 User POV.** Wholesale/credit customer needs a proper tax invoice. **🛠️** Draft → add lines → confirm → print A4 tax invoice. **⚙️** `INV-NNNN` gapless, WAC cost snapshot, tax freeze, period gate; emits inventory SALE + AR/Revenue/Tax JE.
- ✅ **VERIFIED OK (2026-06-09)** ~~🔴~~ **DEV-330:** `sales.listener` posts DR AR / CR Revenue / CR Output-tax on invoice confirm (credit notes reverse). Trial balance is correct. *(Gap #9 — was a suspected bug; audited as already-working.)*
- ✅ **PROVEN (2026-06-09):** confirm-twice doesn't double-post (draft-only guarded UPDATE, 409 on non-draft); confirm into a HardLocked period → 422. Gapless `INV-NNNN` under concurrency. Tests green.

### 7c. Credit note · receipt voucher — T0 · `[BUILT]` 🟢
Credit note (`CN-NNNN`, SALE_RETURN + AR reversal) · receipt voucher (cash collection, FX gain/loss, deadlock-safe allocation). ✅ **PROVEN (2026-06-09):** allocation re-validates Σ≤total and per-invoice `amount≤balance` under `FOR UPDATE` → over-allocation rejected, no double-spend; non-draft post = 409. Tests green.

---

## Stage 8 — Purchasing / Restocking 🤖 · mixed

### 8a. Sami — Invoice Scanner (AI) — T1 · `[BUILT]` 🟢🤖

**👤 User POV.** "A supplier dropped a paper invoice. I don't want to type 40 lines." Photo → done. Fear: *"What if it reads the numbers wrong and I overpay?"*

**🛠️ Product POV.** `/zee/scan`: snap photo → Sami extracts → **review screen** (extracted lines, matched items, GL preview, confidence) → **Approve** → posts the bill.
- 🤖 Full pipeline: Gemini 2.5 Flash VLM extraction → deterministic matching ladder (TRN→name→fuzzy→new draft) → totals reconciliation gate → on approve, creates + confirms the AP bill.
- ✅ **FIXED (2026-06-09)** ~~🟡~~ Party matching now has an **LLM rung** that fires only when the deterministic ladder would create a "new draft" — it resolves mixed AR/EN supplier names against the tenant's candidate list (names-only, advisory, human still approves; graceful-degrades to new-draft on any LLM error). *(Commit 60041c5.)*

**⚙️ Technical.** `POST /tenant/scanner/scans` (throttled 30/min) → Supabase private upload → FastAPI `/ai/scan/extract` → review → `POST /:id/approve` → `PurchaseInvoicesService.create→addLine→confirm` → GL. Corrections captured for the learning flywheel.
- ✅ **PROVEN GREEN (2026-06-09)** ~~🔴~~ **Reconciliation gate tested:** an unbalanced extracted bill (lines ≠ total, or missing total) is **blocked** with a 422, never posted; approve-twice is idempotent via the `postedInvoiceId IS NULL` guard (returns the existing bill, no double-post). *(Existing specs verified; harness in Part 4.)*
- 🟡 **Accuracy numbers still need a real-invoice golden set** — the **eval harness + synthetic adversarial set now exist** (Part 4); only labeling 20–50 real GCC invoices remains, and that needs the user's data. The *gate logic and scorer* are proven; the *live-model accuracy figure* is the one honest unknown.

### 8b. Rest of purchasing

| Flow | Tier | Status | Notes |
|------|------|--------|-------|
| **AP bill confirm** (manual + from-GRN) | T0 | 🟢 `[BUILT]` | `FOR UPDATE` locks, accrual clearing, approval-PIN. **Stress:** concurrent confirm, PIN bypass, double-bill a GRN. |
| **Supplier payment post** | T0 | 🟢 `[BUILT]` | Allocation + FX gain/loss (4820/7210), approval-PIN. **Stress:** allocation re-validation at post, deadlock under concurrency. |
| **GRN (goods receipt)** | T2 | ✅ `[BUILT]` | Full UI: create/list/detail + confirm + create-bill. The GCC "goods before invoice" norm is met via the **`hasSupplierInvoice=false`** path → posts to accrual 2121 (not AP 2111) until the invoice arrives. *(Gap #18 — verified complete 2026-06-09.)* |
| **Landed costs** | T2 | ✅ `[BUILT]` | freight/customs allocation by value/qty/weight — create/detail/list panels + allocation math, full API integration. Import margins now correct. *(Gap #19.)* |
| **Purchase orders** | T2 | ✅ `[BUILT]` | PO draft/confirm + **"Receive against PO" → GRN** (full + partial receipts). *(Gaps #18, #27.)* |
| **Purchase returns / debit notes** | T2 | ✅ `[BUILT 2026-06-09]` | Returns API + UI; JE via `purchase-accounting.listener`; stock effects wired. *(Gap #23.)* |
| **PDC (post-dated cheques)** | T2 | ✅ `[BUILT 2026-06-09]` | Full cheque lifecycle + accounting listener. *(Gap #21.)* |
| **AP aging report** | T3 | ✅ `[BUILT]` | AP-aging service + report UI (registered in the reports index). *(Gap #26.)* |

---

## Stage 9 — Accounting & Reports · mostly `[BUILT]` 🟢

**👤 User POV.** Owner: *"What did I make? What am I worth? What do I owe?"* Accountant: *"Does it tie out for the audit / VAT return?"*

**🛠️ Product POV.** Reports: Trial Balance, P&L, GL, AR/AP aging, daily sales, stock value, cash flow, **Balance Sheet**. Fiscal periods, bank rec, FX revaluation, period close, audit trail.
- ✅ **FIXED (2026-06-09)** ~~🔴~~ **Balance Sheet rendered** — `balance-sheet` service + report UI (date-aligned to P&L). *(Gap #15.)*
- ✅ **FIXED (2026-06-09)** ~~⚫~~ **Per-branch P&L** — `branchId` dimension on P&L / BS / TB. *(Gap #20.)*

**⚙️ Technical.** Event-driven GL posting engine (POS/sales/purchase listeners auto-post JEs). Manual JE with balance validation + period gate. Bank rec: import → auto-match → manual → post. FX revaluation posts unrealized JE. Period close = checklist templates + per-period task runs.
- ✅ **FIXED (2026-06-09)** ~~🔴~~ **Dead-letter queue fully surfaced** — failures are persisted + queryable, **and** there's now a **web UI**: a failures table with per-row Retry (debounced, loading/empty/error states), a "N posting failures need attention" alert banner in the accounting layout, and a nav entry. No longer silent, and a human sees it. *(Gap #10 — commit ec153a8.)*
- 🟢 **Report-correctness stress:** seed a known fixture tenant → assert TB balances, P&L+BS+CFS tie to each other, AR/AP aging buckets correct, all to the minor unit (3dp for KWD/BHD/OMR).

---

## Stage 10 — Month-End & Compliance · 🟢 *(green for all VAT countries except KSA, which stays ZATCA-deferred)*

**👤 User POV.** "File my VAT return without my accountant." (P4's NBR return, P2's EmaraTax, P1's ZATCA.) An error here = a **government fine** — the exact thing that drove them to switch.

**🛠️ Product POV.** Period close checklist + reports. **VAT filing is read-only** → manual transcription to EmaraTax / FATOORA / NBR / Dhareeba / Fawtara.
- ⏭️ **DEFERRED** 🔴 **KSA:** ZATCA Phase 2 clearance is **0% built** → KSA is non-compliant, do not sell there yet. *(Gap #2 — out of this pass.)*
- ✅ **FIXED (2026-06-09)** ~~🔴~~ **Bahrain:** zero-rated (Rx) tax group **now seeded** (→ VAT-BH-0) → Rx no longer defaults to 10%. *(Gap #12.)*
- ✅ **By design (non-blocking):** no e-invoicing connectors — but **no country except KSA has a live retail e-invoicing mandate in 2026** (UAE B2C not yet, QA draft, BH/OM no live mandate, Oman Fawtara large-taxpayers only). Read-only VAT reports + manual transcription is compliant everywhere we sell. Only KSA ZATCA is a hard mandate, and that's the deferred Gap #2.
- 🤖 *Opportunity:* AI agents Noor (dead stock), Arjun (stockout), Tariq (shrinkage), Maya (margin) would shine at month-end — all **spec-only**.

---

# PART 2 — Country Overlays

The universal journey above is the spine. Each country changes specific steps. Ordered per your sequence: Kuwait → UAE → Qatar → Bahrain → Oman → Saudi.

> Format per country: **Persona · Buying trigger · Journey deltas (only what differs) · Go-live verdict.** Personas P3 (Kuwait), P5/P2 (UAE), P4 (Bahrain), P1 (KSA) are fully profiled in the companion docs; Qatar & Oman are new here.

## 🇰🇼 Kuwait — *Yousef, 3-outlet electronics (1,200 IMEI SKUs)*

- **Trigger:** KWD 4,000 of iPhones unaccounted for; legacy system crashed twice, lost 3 days of data.
- **Deltas:**
  - ✅ **FIXED** ~~🔴~~ **KWD = 3 decimals** — dedicated 3dp formatter path now used everywhere. *(Gap #8.)*
  - ✅ **FIXED** ~~⚫~~ **IMEI/serial tracking** — built end-to-end incl. POS sale capture. *(Gap #3.)*
  - ✅ **FIXED** ~~🟡~~ **Stock transfer** between stores — send/receive UI built. *(Gap #13.)*
  - ✅ **FIXED** ~~⚫~~ **KNET** tender — configurable tender types at POS. *(Gap #22.)*
  - 🟢 **No VAT** — so the whole tax/e-invoice burden is *off*, which actually makes Kuwait the cleanest tax story (build VAT-ready, don't enable).
  - ✅ **FIXED** ~~⚫~~ Credit sales (POS↔customer AR) — `on_account` tender books AR + shows in aging. *(Commit bab2017.)*
- **Verdict: ✅ Fully go-live capable (2026-06-09)** — every Kuwait gap is shipped: IMEI/serial, KWD 3dp, store transfers, KNET, **and** credit-sale AR. No VAT burden. Zero open blockers.

## 🇦🇪 UAE — *Imran (5-baqala chain) & Mariam (2-boutique abaya + tailoring)*

- **Triggers:** Imran — AED 8,000 cash discrepancy found a month late. Mariam — couldn't run a cross-store Ramadan promo; 2-day monthly Zoho↔POS reconciliation.
- **Deltas:**
  - ✅ **FIXED** ~~🔴~~ **VAT-inclusive shelf pricing** — inclusive VAT seeded. *(Gap #6.)*
  - 🟡 **SKU-level zero-rated split** — fresh food 0% vs packaged 5% in one basket → per-line tax groups (supported; per-tenant config).
  - ✅ **FIXED** ~~⚫~~ **Cash pay-in/pay-out** — API + dialog UI; cash variance now correct. *(Gap #5.)*
  - ✅ **FIXED** ~~⚫~~ **Returns** — return/exchange flow built. *(Gap #1.)*
  - ✅ **FIXED** ~~🟠~~ **Pricing/promotions** — Mariam's Ramadan promo now **auto-applies at sale time** (POS + B2B, online + offline). *(Gap #17 — commits 9355092 + 88186f7.)*
  - ✅ **FIXED** ~~⚫~~ **Per-branch P&L** — branch dimension on reports. *(Gap #20.)* (Push alerts still TBD.)
  - ⏭️ **DEFERRED** ⚫ Urdu/Hindi UI for 22 South-Asian staff — `en`/`ar` only. *(Gap #24 — deferred by decision; nice-to-have, not a blocker.)*
  - 🟢 e-invoicing **not yet mandatory** for B2C retail → no clearance pressure in 2026.
- **Verdict: ✅ Both Imran AND Mariam are go-live capable (2026-06-09)** — cash-movements, inclusive pricing, returns, invite-branch-scope, DEV-330, **and now promo-at-sale-time** all shipped. The only deferred item is Urdu/Hindi (a nice-to-have, by decision).

## 🇶🇦 Qatar — *(new persona) Khalid, single-outlet electronics & mobile accessories, Doha*

- **Trigger:** wants one clean system before VAT lands (everyone says it's coming); tired of Excel.
- **Deltas:**
  - 🟢 **No VAT yet** (QAR, 2dp) → simplest tax path today; Dhareeba e-invoicing is draft-only.
  - 🟡 **Build VAT-readiness now** — when 5% lands (~2027) UAE-style inclusive pricing is the likely model; don't hardcode "no tax."
  - ✅ **FIXED** Shared electronics gaps now resolved: IMEI (#3), transfers (#13), returns (#1).
- **Verdict: ✅ Go-live capable (2026-06-09)** — IMEI + returns now built, on top of the simplest (no-VAT) tax path. Lowest compliance risk of the six.

## 🇧🇭 Bahrain — *Dr. Ahmed, single community pharmacy + health/beauty*

- **Trigger:** NBR audit + BHD 500 fine for VAT miscategorization; BHD 2,000 expired-stock write-off.
- **Deltas:**
  - ✅ **FIXED** ~~🔴~~ **10% VAT with zero-rated Rx** — Bahrain Rx zero-rated group now seeded (→ VAT-BH-0). *(Gap #12.)*
  - ✅ **FIXED** ~~🔴~~ **BHD = 3 decimals** — 3dp formatter path applied. *(Gap #8.)*
  - 🟡 **Per-line mixed-rate basket** (0% Rx + 10% OTC) — per-line tax groups (supported).
  - ✅ **FIXED** ~~⚫~~ **Batch/expiry alerts + block-on-expired-sale** — batches + FEFO + near-expiry alert + expired-sale block built. *(Gap #4.)*
  - 🟢 e-invoicing **no live mandate** → no clearance pressure.
- **Verdict: ✅ Go-live capable (2026-06-09)** — the two blockers (zero-rated seed, batch/expiry) and 3dp money are all shipped.

## 🇴🇲 Oman — *(new persona) Salim, 2-outlet supermarket, Muscat*

- **Trigger:** Fawtara is coming for big players; wants to be ahead and consolidate 2 stores' books.
- **Deltas:**
  - ✅ **FIXED** ~~🔴~~ **5% VAT** (OMR, **3dp**) — 3dp truncation risk resolved by the shared formatter fix. *(Gap #8.)*
  - 🟡 **Fawtara (Peppol 5-corner)** — mandatory for large taxpayers Aug 2026, SME later. Build Peppol-readiness; not yet required for a 2-store SME.
  - 🟡 Zero-rated basic-food list (OTA-defined) → per-line tax groups (supported; Oman-specific food list not pre-seeded).
  - ✅ **FIXED** Shared multi-store gaps resolved: transfers (#13), per-branch P&L (#20), returns (#1).
- **Verdict: ✅ Viable (2026-06-09)** — 3dp money + multi-store flows shipped; only the Oman food zero-rating list needs per-tenant setup. Fawtara not blocking yet.

## 🇸🇦 Saudi — *Abu Khalid, single-outlet auto-parts trader, Riyadh*

- **Trigger:** ZATCA enforcement wave; accountant quoted SAR 12k to retrofit his old system. **He's buying compliance, not features.**
- **Deltas:**
  - ⏭️ **DEFERRED** 🔴 **ZATCA FATOORA Phase 2 is LIVE and mandatory** (SAR 375k+ as of Jun 2026) and **still 0% built** — no TLV QR, no cleared XML, no crypto stamp, no 5-yr archival. *(Gap #2 — the one deliberately-deferred blocker.)*
  - ✅ **Correct as-is** **15% VAT, NO food zero-rating** — every SKU 15%; SAR (2dp). This is the right KSA behaviour; nothing to seed.
  - ✅ **FIXED** ~~🟡~~ **OEM/part-number field** — `part_number` item attribute added. *(Gap #25.)*
  - ✅ **FIXED** ~~⚫~~ **PDC** — full cheque lifecycle built. *(Gap #21.)*
- **Verdict: ❌ Still cannot go live — ZATCA-blocked (by decision).** Every non-ZATCA gap (OEM field, PDC) is now shipped, but his sole purchase reason (ZATCA Phase 2) remains deferred. **Do not sell in KSA until ZATCA Phase 2 ships.**

---

# PART 3 — Master Gap Register (ranked, all countries)

Everything flagged 🔴/⚫ above, deduped and ranked by blast radius. This is the build/fix backlog implied by the journeys.

> **Status snapshot — last audited 2026-06-09 (overnight green pass).** Of 27 gaps: **25 ✅ done · 0 partial · 2 ⏭️ deferred-by-decision.** The whole register is shipped + verified against the codebase with tests green on `main`. The **only** two non-green items are the two deliberately out of scope: ZATCA Phase 2 (KSA-only) and Urdu/Hindi locale. #10 and #17 — the last two partials — were finished this pass.

### ⏳ What's left (deferred by decision — nothing else open)

| # | Gap | State | Why deferred |
|---|-----|-------|----------------|
| 2 | **ZATCA Phase 2** | ⏭️ Deferred (by decision) | TLV QR + cleared XML + crypto stamp + archival + Fatoora API. Blocks **KSA only**; deliberately out of scope this pass. Every *other* KSA gap (OEM, PDC) is shipped. |
| 24 | **Urdu/Hindi locale** | ⏭️ Deferred (by decision) | Only `en`/`ar` wired. Would need `ur`/`hi` in `i18n/routing.ts`, `messages/{ur,hi}/*` (~22 namespaces each), `ur` in `RTL_LOCALES`. Nice-to-have for South-Asian staff; not a go-live blocker. |

### ☑️ Finished this pass (were the last open items)

| # | Gap | Status | Notes |
|---|-----|--------|-------|
| 10 | **Dead-letter surfacing** | ✅ Done | Web UI shipped — failures table + per-row retry + accounting alert banner + nav entry, over the existing REST API. *(Commit ec153a8.)* |
| 17 | **Pricing/promotions at sale time** | ✅ Done | Shared `resolvePromoForLine` engine applies best active promo as a line discount in POS + B2B, **online and offline** (promos synced to IndexedDB), same money path, 3dp-correct. *(Commits 9355092 + 88186f7.)* |

### ✅ Completed (verified in code)

| # | Gap | Severity | Status | Notes |
|---|-----|----------|--------|-------|
| 1 | **POS returns/exchanges** | ⚫ Blocker | ✅ Done | Return API (advisory-locked tx) + `return-modal` UI; GL return mappings wired |
| 3 | **IMEI/serial tracking** | ⚫ Blocker | ✅ Done | Serial table + GRN capture UI + **POS sale-side serial-capture dialog** + serial register/lookup |
| 4 | **Batch/expiry capture + alerts** | ⚫ Blocker | ✅ Done | Batches table + FEFO + block-on-expired-sale + near-expiry dashboard alert |
| 5 | **Cash pay-in/pay-out** | ⚫ High | ✅ Done | `cash-movements` API + dialog UI; `expectedCash` fixed at shift close (SELECT FOR UPDATE) |
| 6 | **UAE VAT-inclusive default** | 🔴 High | ✅ Done | Seeded inclusive VAT-AE-5 / VAT-AE-0 |
| 7 | **Invite branch-scope bug** | 🔴 High | ✅ Done | `branchIds` on invite + `validateBranchIds` (tenant + active check) |
| 8 | **3-decimal money formatters** | 🔴 High | ✅ Done | Currency-aware 3dp path (KWD/BHD/OMR) across GL, TB, JE |
| 9 | **DEV-330 B2B AR/Revenue/Tax JE** | 🔴 High | ✅ Done | `sales.listener` posts DR AR / CR Revenue / CR Output-tax on invoice confirm; credit notes reverse |
| 11 | **Import: WAC=0 + fiscal-period** | 🔴 High | ✅ Done | `unitCost` required on opening-stock import; `asOfDate` stamps `occurredAt` |
| 12 | **Bahrain zero-rated Rx group** | 🔴 High | ✅ Done | Seeded Bahrain Rx zero-rated group → VAT-BH-0 |
| 13 | **Stock transfer UI** | 🟡 High | ✅ Done | Send/receive + delivery-note components |
| 14 | **Mira NestJS actor layer** | 🟡 High | ✅ Done | MigrationModule + sessions + decision cards + SSE (Phase A) |
| 15 | **Balance Sheet rendered** | 🔴 Med | ✅ Done | `balance-sheet` service + report UI (date-aligned to P&L) |
| 16 | **Stock count workflow** | ⚫ Med | ✅ Done | Count sheets + variance posting (API + UI) |
| 18 | **PO/GRN separation + advance GRN** | 🟡 Med | ✅ Done | PO→GRN, partial receipts, and GRN-without-PO supported |
| 19 | **Landed costs UI** | 🟡 Med | ✅ Done | Create/detail/list panels + allocation math, full API integration |
| 20 | **Per-branch P&L** | ⚫ Med | ✅ Done | `branchId` dimension on P&L / BS / TB |
| 21 | **PDC module** | ⚫ Med | ✅ Done | Cheque lifecycle + accounting listener |
| 22 | **KNET / local tenders** | ⚫ Med | ✅ Done | Configurable tender types + payment-modal wiring |
| 23 | **Purchase returns/debit notes** | ⚫ Low | ✅ Done | Returns API + UI; JE via `purchase-accounting.listener`; stock effects wired |
| 25 | **OEM/part-number field** | 🟡 Low | ✅ Done | `part_number` item attribute + partial index |
| 26 | **AP aging report** | 🟡 Low | ✅ Done | AP-aging service + report UI |
| 27 | **Purchase order receipt flow** | 🟡 Low | ✅ Done | "Receive against PO" button → GRN create (full + partial) |

---

# PART 4 — AI Capability Map & Eval Readiness

**"Is our AI working?"** answered honestly per agent:

| Agent | Role | Status | Can we eval it today? |
|-------|------|--------|----------------------|
| 🤖 **Sami** | Invoice scanner (photo→AP bill) | 🟢 `[BUILT]` full pipeline + **LLM supplier rung** + **Sentry telemetry sink** + **eval harness** | **Yes (synthetic).** Eval harness (`app/eval/`) scores extraction P/R/F1, hallucination, calibration, reconcile-gate, prompt-injection against a synthetic adversarial set, with an injectable provider for the live model. Real-world accuracy still needs 20–50 labeled real GCC invoices — the one remaining step that needs the user's data. |
| 🤖 **Mira** | Migration brain | 🟢 `[BUILT]` Python brain + NestJS actor | Brain: yes (Kuwait 11-CSV fixture + detector tests). End-to-end: **yes** — MigrationModule + sessions + decision cards + live SSE shipped *(Gap #14)*. |
| 🤖 **Zee** | Orchestrator persona/voice | ⚫ `[SPEC-ONLY]` | No — no code. |
| 🤖 **Noor** | Dead-stock finder | ⚫ `[SPEC-ONLY]` | No. |
| 🤖 **Arjun** | Stockout predictor | ⚫ `[SPEC-ONLY]` | No. |
| 🤖 **Tariq** | Shrinkage guard | ⚫ `[SPEC-ONLY]` | No. |
| 🤖 **Maya** | Margin watchdog | ⚫ `[SPEC-ONLY]` | No. |
| 🤖 **COA assist** | Onboarding account matching | 🟢 `[BUILT]` | Yes — has golden COA fixtures. |
| 🤖 **Column mapper** | Import rung-5 LLM | 🟢 `[BUILT]` (advisory) | Yes — but clamped to review band. |

> *The five `[SPEC-ONLY]` agents (Zee voice, Noor, Arjun, Tariq, Maya) are **post-MVP roadmap**, never part of the journey gap register or any country go-live blocker — they're net-new capabilities, not gaps. "Green" in this document means every journey flow + ranked gap is shipped; these remain a deliberate future build.*

**LLM routing (built, `task_routes.py`):** 6 tasks, per-task primary+fallback across Gemini/DeepSeek/Groq/Cerebras/Fireworks, privacy tiers (schema-only vs schema+docs), env override, retry-once. ✅ **FIXED (2026-06-09)** ~~🟡~~ **Sentry telemetry sink wired** — every call emits a breadcrumb; fallback usage raises a warning event, total failure an error event, hard failure a captured exception. Fail-open when no DSN. So a silently-carrying fallback is now visible. *(Commit 60041c5.)*

**Eval dimensions that matter** (the only way to replace vibes with numbers): extraction precision/recall · matching accuracy · **hallucination rate** (adversarial: blurry/rotated/injected/wrong-language) · the **reconcile-totals safety gate** (must block unbalanced bills) · **confidence calibration** (is "high confidence" actually right?) · reliability (fallback/timeout/malformed JSON) · prompt-injection resistance · cost per scan.

**🟡 The eval harness now exists; the one remaining input is real labeled data.** As of 2026-06-09 the harness (`apps/ai/app/eval/`) + a synthetic adversarial fixture set (clean, unbalanced-totals → gate blocks, wrong-language, prompt-injection, missing-totals, blurry, hallucinated-field) prove the **scorer and reconcile-gate logic**. To turn synthetic baselines into a trustworthy real-world accuracy number, the one remaining step — which needs **the user's data** — is to label 20–50 real GCC supplier invoices via the documented `LabeledCase` flow and run them through the injectable provider. This is the single honest "unknown" left in the whole map.

---

# Appendix — Stress-Test Attack Dimensions (per flow)

For any flow, stress = these four lenses:

1. **Money-correctness** — every JE balances; WAC/FX/tax to the minor unit; multi-rate & inclusive/exclusive; 3dp currencies.
2. **Concurrency** — N simultaneous ops → zero doc-number gaps/dupes; no double-spent allocations; idempotent offline replay.
3. **Bad input** — negative/zero/over-stock qty, closed period, deleted entity mid-flow, malformed import, wrong-decimal money.
4. **State-machine abuse** — confirm/void/approve/go-live twice; receive-never-sent; PIN bypass; cross-tenant access.

Plus cross-cutting on every flow: **tenant isolation**, **RBAC enforcement**, **defensive-UX states** (loading/error/empty/success), and **silent-failure hunting** (assert failures surface, not just that happy paths pass).

---

*End of master journey & stress-test map. Living document — update as flows ship and gaps close.*
