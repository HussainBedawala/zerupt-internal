<!-- Feature catalog partition | Module: onboarding | Generated: 2026-06-11 | Source: as-built audit -->
# Onboarding — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

---

## 7-Step Onboarding Wizard

- **Status:** shipped
- **Description:** A multi-step questionnaire that collects everything needed to auto-configure a tenant's ERP. Progress is persisted at every step so the owner can close their browser and resume exactly where they left off.
- **Who it's for:** New retail business owners setting up Zerupt for the first time. Works for sole traders and multi-location chains alike.
- **Constraints / notes:** Owner-only (permission `settings.onboarding.start`). Steps 1–7 are all validated server-side via Zod schemas. Max 7 steps, min 1 step required before pipeline can run.

---

## Step 1 — Business Info

- **Status:** shipped
- **Description:** Captures legal company name, trading name, country of registration, company and tax registration numbers, industry (Fashion, Electronics, Grocery, etc.), inventory concept (Simple SKU, Serialized, Batch, Weighted), and preferred language. Country selection automatically derives currency, timezone, and RTL/LTR defaults.
- **Who it's for:** Any new owner. GCC-specific (KW, SA, AE, BH, OM, QA), plus India and Malaysia; more countries are specced but not yet in a launched market.
- **Constraints / notes:** Country selection is irreversible after the configuration pipeline runs. Tax registration number is optional for non-VAT countries (KW, QA).

---

## Step 2 — Locations (Branches & Warehouses)

- **Status:** shipped
- **Description:** Owner specifies how many stores/branches they have, names each one, and indicates whether separate warehouses exist per store and whether inter-branch stock transfers are needed. A Transit warehouse is automatically created when transfers are enabled.
- **Who it's for:** Any new owner with one or more physical locations. Particularly valuable for multi-branch GCC retailers.
- **Constraints / notes:** Maximum 50 branches and 50 warehouses enforced at import. CSV bulk upload of locations is supported in addition to the in-wizard card repeater.

---

## Step 3 — Accounting Setup

- **Status:** shipped
- **Description:** Owner sets their functional currency, whether they trade in multiple currencies, fiscal year start month, chart-of-accounts detail level (Standard, Detailed, or Custom), and whether post-dated cheques are used. A custom COA skips automated seeding entirely.
- **Who it's for:** Owners or their accountants. The "Standard" default is designed for owners who have never set up accounting software before.
- **Constraints / notes:** COA detail level cannot be changed after the pipeline runs without manual rework. Post-dated cheque support adds specific ledger accounts (PDC Receivable 1161, PDC Payable 2161).

---

## Step 4 — Tax Setup (Country-Aware)

- **Status:** shipped
- **Description:** Tax configuration is tailored to the owner's country. GCC countries get the correct VAT rate pre-filled (SA 15%, AE/OM 5%, BH 10%) or a VAT-ready zero-rated profile (KW, QA). India gets GST component setup (CGST/SGST/IGST). Malaysia gets SST. All paths include follow-up questions for zero-rated, exempt, and reverse-charge supplies.
- **Who it's for:** Owners in any supported market. The system handles country-specific rules so the owner doesn't need to know the tax law.
- **Constraints / notes:** SA has additional ZATCA registration status fields. KW/QA get a VAT-ready config (no active tax) so accounts are structured correctly for when VAT is introduced. Country fence on tax options is enforced server-side.

---

## Step 5 — Team Size

- **Status:** shipped
- **Description:** Asks how many people will use the system. This is metadata for license estimation only — no team member invitations happen here (moved to Settings post-go-live to reduce friction during free-trial evaluation).
- **Who it's for:** All new owners.
- **Constraints / notes:** Range 1–500. Deliberately minimal — the Owner role is already seeded at provisioning, so the owner can test immediately without inviting anyone.

---

## Step 6 — POS Setup

- **Status:** shipped
- **Description:** Owner decides whether they need a Point of Sale. If yes: estimated terminal count, receipt printer type (thermal 80mm/58mm, A4, email-only), bilingual receipt option (Arabic + English), and accepted payment methods. Kuwait-only: K-Net is offered as a local debit payment method.
- **Who it's for:** Retail businesses that have a physical checkout counter. POS can be skipped entirely for pure wholesale or service businesses.
- **Constraints / notes:** K-Net is enforced server-side to KW tenants only — requesting it for another country returns a 400. Terminal count is a single tenant-wide estimate; per-device registration happens when a device first connects in POS settings.

---

## Step 7 — Data Sources

- **Status:** shipped
- **Description:** Owner declares which data they want to import: products, customers, suppliers, opening balances, and their current system (Excel, another ERP, paper, nothing). These flags determine which import steps are shown in the post-pipeline data import phase.
- **Who it's for:** Owners migrating from an existing system or manual records. "Nothing" is a valid answer and skips all imports.
- **Constraints / notes:** All five flags are required booleans (no ambiguous "skip"). Current system free-text (e.g. "Merpec") feeds AI column-mapping hints downstream.

---

## Configuration Pipeline (Auto-Setup)

- **Status:** shipped
- **Description:** After the questionnaire, the system automatically creates the entire tenant configuration in 2–5 minutes: tenant settings, branches/warehouses, chart of accounts, tax profiles, currency policy, fiscal periods, roles, document numbering sequences, notification defaults, and dashboard defaults. A real-time progress screen shows each step completing live.
- **Who it's for:** All new owners. The pipeline is what makes "signup to live in under 2 hours" possible — it eliminates weeks of manual ERP setup.
- **Constraints / notes:** Each pipeline step is idempotent. If the owner goes back and changes an answer, only affected steps re-run. All 10 pipeline materialize steps have their own service and test files (`materialize-*.ts`). Cannot re-run after go-live without contacting support.

---

## COA Template Seeding (Industry-Aware)

- **Status:** shipped
- **Description:** The configuration pipeline selects and seeds a chart of accounts template that matches the owner's industry and inventory concept. Electronics tenants get serial/IMEI accounts; grocery tenants get expiry/waste accounts; fashion tenants get seasonal markdown accounts. Standard retail accounts cover all other cases.
- **Who it's for:** Owners who choose "Standard" or "Detailed" COA during accounting setup.
- **Constraints / notes:** System accounts (~20) are permanently non-deletable because the posting engine references them by code. Custom COA skips seeding entirely.

---

## COA Reconciliation (Bring-Your-Own Chart)

- **Status:** shipped
- **Description:** Owners who import their own chart of accounts from a previous system can reconcile it against Zerupt's seeded template. The system matches accounts using a deterministic ladder (exact code, name aliases, content heuristics, learned cache, then AI), renames/recodes system accounts in place to match the owner's naming, creates missing accounts, and surfaces AI advisory cards for structural improvements (e.g. missing depreciation account, duplicate income accounts). The posting engine's ~20 system roles are always protected.
- **Who it's for:** Owners migrating from another accounting system who want Zerupt to use their own account names and codes, not a generic template.
- **Constraints / notes:** COA reconciliation must complete before opening balances can be imported. System accounts are never deleted, only rebound. AI suggestions are advisory only — the owner must accept each one individually. No AI is involved in the validation gate (100% deterministic to protect money posting).

---

## Opening Balance Import (Trial Balance / Balance Sheet)

- **Status:** shipped
- **Description:** Owners can upload a trial balance or balance sheet from Excel/CSV. The system maps rows to COA accounts using fuzzy name matching, creates the opening-balance journal entry, and verifies that Opening Balance Equity (account 3900) nets to zero. If it doesn't balance, the owner is offered the option to park the difference with a plain-language explanation of common causes.
- **Who it's for:** Owners migrating from an existing accounting system who need historical financial starting points in Zerupt.
- **Constraints / notes:** Requires COA reconciliation to be complete first. Balances can be "parked" (stored without applying) for later review. The endpoint is `tenant/import/opening-balances`.

---

## Opening Receivables Import (AR Opening Balances)

- **Status:** shipped
- **Description:** Owners can import their outstanding customer receivables (accounts receivable opening balances) from a CSV/Excel file. Each row maps to a customer and an outstanding amount, creating the appropriate opening-balance entries.
- **Who it's for:** Owners who had customers with outstanding invoices before going live on Zerupt.
- **Constraints / notes:** Endpoint: `tenant/import/opening-receivables`. Requires the customer import to have run first so party records exist.

---

## Opening Payables Import (AP Opening Balances)

- **Status:** shipped
- **Description:** Owners can import outstanding supplier payables (accounts payable opening balances) from a CSV/Excel file, mirroring the AR import for the payables side.
- **Who it's for:** Owners who had outstanding supplier bills before going live on Zerupt.
- **Constraints / notes:** Endpoint: `tenant/import/opening-payables`. Requires supplier import to have run first.

---

## Opening Stock Import

- **Status:** shipped
- **Description:** Owners can import their current physical stock levels from a spreadsheet. Each row maps to a product and a warehouse/branch location. The import seeds the inventory with correct opening quantities and costs.
- **Who it's for:** Owners who have physical inventory they want visible in Zerupt from day one.
- **Constraints / notes:** Products and branches must be imported/created first (dependency enforced in the UI). Endpoint: `tenant/import/opening-stock`.

---

## Mira AI Migration Matching

- **Status:** shipped
- **Description:** When an owner imports their existing chart of accounts from a legacy system, Mira (the AI migration agent) assists by automatically matching source accounts to Zerupt accounts. Matches are classified into three confidence bands — auto-accept, needs review, and suggest-only — so the owner spends time only on uncertain cases. Bulk-accept, undo, and suspense-parking are supported.
- **Who it's for:** Owners migrating from another ERP or accounting package (e.g. Merpec, Tally, QuickBooks export).
- **Constraints / notes:** Migration sessions tracked in `migration_sessions` table. Matching uses a 5-rung resolution ladder (exact → alias → heuristics → learned cache → LLM) — LLM is only invoked for columns nothing else resolves. Learned decisions are persisted for future tenants on the same source system.

---

## AI Column Mapping (5-Rung Resolution Ladder)

- **Status:** shipped
- **Description:** When any spreadsheet is uploaded during onboarding imports, the system automatically maps source column headers to Zerupt fields using a deterministic ladder: exact match first, then a hand-built alias dictionary (40+ retail fields in English and Arabic), content heuristics (13-digit = barcode, @-sign = email, etc.), a learned-mapping cache keyed to the source system fingerprint, and finally LLM inference only for columns nothing else could bind. Confidence scores (0–100%) are shown per column and flagged for review below 75%.
- **Who it's for:** Any owner uploading data from Excel, Google Sheets, or another ERP export.
- **Constraints / notes:** Alias dictionary covers Arabic and English column names. Learned mappings mean the second customer from the same legacy system has near-zero LLM cost. Per-onboarding token budget ~$1; breach is instrumented as a ladder gap, not expected spend.

---

## Validation with AI Fix Suggestions

- **Status:** shipped
- **Description:** After column mapping, every row is validated. The AI service proposes concrete fixes for common errors: duplicate barcodes, selling price below purchase price, unknown categories, missing required fields, and format mismatches. Fixes above 90% confidence can be bulk-approved; lower-confidence fixes require individual review. Valid rows proceed to a 20-row preview before final confirmation.
- **Who it's for:** Any owner uploading messy spreadsheet data — especially common when migrating from paper records or basic Excel sheets.
- **Constraints / notes:** Import is never blocked by AI service unavailability — rungs 1–4 resolve without the LLM and the UI falls back to a manual mapping dropdown. Partial import failures are per-chunk; failed chunks can be retried independently.

---

## Go-Live Readiness Check

- **Status:** shipped
- **Description:** Before the "Go Live" button is unlocked, the system runs a comprehensive readiness report across all modules: branch exists, COA is seeded, tax profile is configured, at least one fiscal period is open, roles exist, and all declared data imports are complete or explicitly skipped. Hard blockers prevent go-live; warnings (e.g. opening balances not imported) require explicit acknowledgement before proceeding.
- **Who it's for:** All new owners. It acts as a final checklist so no owner accidentally goes live with a misconfigured system.
- **Constraints / notes:** Readiness check is re-evaluated server-side at the moment of go-live submission (never trusts a cached client report). Opening balances warning requires the `acknowledgedWarnings` field in the go-live request body.

---

## Go-Live One-Way Transition

- **Status:** shipped
- **Description:** Pressing Go Live freezes the onboarding wizard state (read-only for audit), records `onboardingCompletedAt`, seeds the first-login experience, and emits a `tenant.went-live` event. The transition is idempotent — a second go-live call is a no-op.
- **Who it's for:** All new owners completing setup.
- **Constraints / notes:** Owner-only permission (`tenant.onboarding.goLive`). Onboarding state is retained indefinitely for audit and analytics. The `tenant.went-live` event is wired for future Onboarding Coach agent activation (Phase 7, not yet built).

---

## First-Login Experience (Welcome Dashboard)

- **Status:** shipped
- **Description:** After go-live the owner lands on their configured dashboard with a dismissable welcome banner and a 4–5 item quick-start checklist ("Create your first invoice", "Open the POS", "Check your dashboard", "Invite team members" — plus "Finish data import" if imports are still pending). Each checklist item tracks completion individually. The checklist auto-dismisses after all items are done or after 7 days.
- **Who it's for:** All newly live owners, especially first-time ERP users who need orientation without a training session.
- **Constraints / notes:** First-login state is stored in `onboardingState` JSONB. The 7-day TTL and item completion are enforced server-side. Walkthrough video URL is configurable per deployment.

---

## Personalised Welcome Voice Greeting (ElevenLabs)

- **Status:** shipped
- **Description:** The onboarding welcome screen plays a personalised spoken greeting — "Hi [FirstName], welcome to Zerupt — your smart business partner" — synthesised at runtime via ElevenLabs TTS in the owner's language (English or Arabic). A static generic MP3 ships as fallback; the personalised audio is a delighter, never a blocker.
- **Who it's for:** All new owners. Arabic script ("مرحباً يا [الاسم]…") is used automatically for Arabic-locale tenants.
- **Constraints / notes:** Requires `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` env vars. Falls back to static MP3 silently on any failure (no key, timeout, unsafe name, etc.). Per-user daily call budget of 10 to prevent wallet exposure. In-memory LRU cache (200 entries) so repeat visits for the same name cost zero. Names are validated to letters/marks/spaces/hyphens only (no injection risk).

---

## Onboarding Coach Agent Activation

- **Status:** planned
- **Description:** On go-live, an Onboarding Coach AI agent will activate and monitor feature adoption, configuration completeness, and data completeness for 60 days — surfacing suggestions the morning after go-live (not immediately) to avoid overwhelming new owners. Auto-deactivates when adoption score hits 80%.
- **Who it's for:** All new owners post-go-live.
- **Constraints / notes:** The `tenant.went-live` event emission is already wired in the go-live service, but no listener/agent is built yet. Planned for Phase 7 (AI engine). Spec: `agent-os/product/ai-engine/`.

---

## Team Invitation Sending at Go-Live

- **Status:** planned
- **Description:** If team members were pre-queued during onboarding, go-live would send all invitations at once (email with role assignment, branch assignment, and a 7-day signup link). Currently team invitations are done manually from Settings → Users post-go-live.
- **Who it's for:** Owners who want to onboard staff immediately at launch.
- **Constraints / notes:** The spec describes queued `Invitation` entities sent at go-live, but Step 5 was de-scoped to team-size only (no invitation entry in wizard). This feature is not built; invitations are handled in the Settings → Users module.

---

## Idempotent Re-Configuration (Go-Back and Change Answers)

- **Status:** shipped
- **Description:** If an owner goes back during onboarding and changes a questionnaire answer, the pipeline computes a diff and re-executes only the affected steps. Unchanged entities are left untouched; updated entities are changed in place; orphaned entities are soft-deleted. No data is lost.
- **Who it's for:** Owners who realize mid-setup that an answer was wrong (e.g. wrong country, added a branch).
- **Constraints / notes:** Re-configuration is blocked after go-live. The diff logic covers country changes (settings, tax, currency, numbering), branch changes (locations, numbering), COA depth changes, role changes, and POS toggles.
