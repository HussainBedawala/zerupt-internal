<!-- Feature catalog partition | Module: import | Generated: 2026-06-11 | Source: as-built audit -->
# Data Import & Migration — Feature Catalog

> Status legend: `shipped` = in production code as of 2026-06-11 · `planned` = specced, not yet built.

---

## Supported File Formats (CSV + XLSX)
- **Status:** shipped
- **Description:** Accepts `.csv` and `.xlsx` (Excel) files up to 25 MB. Format is detected by file extension first, then MIME type fallback; unsupported formats are rejected with a plain-language error message.
- **Who it's for:** Any shop owner uploading an export from their old system — no file conversion required before uploading.
- **Constraints / notes:** `.xls` (old binary Excel) is accepted by extension but parsed via the xlsx path. ODS, Google Sheets exports, and PDF are not accepted; user must export to CSV/XLSX first. 50,000-row hard ceiling enforced synchronously.

---

## AI Column Mapping (5-Rung Resolution Ladder)
- **Status:** shipped
- **Description:** Every column in the uploaded file is automatically matched to a Zerupt field using a five-rung ladder: exact name match → alias dictionary (English + Arabic synonyms, ~40 retail fields) → content heuristics (barcode shape, email, price, date) → learned-fingerprint cache → LLM (Claude Haiku) only for columns nothing else resolved. Each binding carries a 0–1 confidence score; columns below 0.75 are flagged for user review.
- **Who it's for:** Any shop owner uploading a product list, customer list, or supplier list — they do not need to rename columns or understand Zerupt's field names.
- **Constraints / notes:** LLM rung sees column headers and first 10 rows only — cell values are stripped before any external call ("your numbers never leave Zerupt"). LLM is skipped for any column resolved by rungs 1–4. Alias dictionary currently covers en + ar.

---

## Alias Dictionary (Multilingual Column Synonyms)
- **Status:** shipped
- **Description:** A hand-built, versioned synonym map for ~40 retail fields in English and Arabic, covering common legacy export column names (e.g. "Prod. Nm", "اسم الصنف" → name). Every alias matched here is a column that never costs an LLM call.
- **Who it's for:** Shop owners migrating from Arabic-language POS systems or any legacy spreadsheet with non-standard column names.
- **Constraints / notes:** Extendable without a code deploy. Does not yet cover Hindi/Devanagari column names.

---

## Content Heuristics (Rung 3 — Structure-Based Binding)
- **Status:** shipped
- **Description:** Automatically detects column roles from cell shapes: 13-digit numeric → barcode; `@` pattern → email; currency-shaped values (KWD, SAR, AED, INR, $, ₹, comma/underscore separators) → price; date-shaped values → date fields. Binds the column without LLM cost when the entity has exactly one field of that type.
- **Who it's for:** Shop owners whose export files have no column headers or use purely numeric headers.
- **Constraints / notes:** European comma-decimal convention (e.g. "12,50") is intentionally not matched to avoid false positives. European-format files may need the LLM rung.

---

## Learned-Fingerprint Flywheel (Mapping Cache)
- **Status:** shipped
- **Description:** When a user confirms a column mapping, the resolved mapping is stored keyed by a structural fingerprint of the file (header-set hash + detected source). The next upload with the same fingerprint pre-applies the cached mapping — the user confirms instead of re-mapping. Repeat migrations from the same legacy system trend toward zero LLM cost.
- **Who it's for:** Shop owners migrating from a common legacy system (e.g. the same POS platform another customer used); also the compounding moat as Zerupt onboards more customers from the same markets.
- **Constraints / notes:** Per-tenant at launch. Global anonymized cache (cross-tenant learning) is specced but not yet built. Fingerprint is one-way (hash) and value-free — no cell data stored.

---

## Currency String Parsing
- **Status:** shipped
- **Description:** Price and monetary fields tolerate currency symbols and codes (KWD, KD, USD, AED, SAR, INR, $, د.ك, ₹) and thousands-separator formats (comma, underscore) in the raw cell value. The parser strips the symbol/separator and extracts the numeric value cleanly.
- **Who it's for:** Shop owners whose spreadsheets have prices formatted as "KD 12.500" or "1,250 SAR" rather than plain numbers.
- **Constraints / notes:** Implemented in `import-validation.ts` (`parseCurrencyValue`). European comma-decimal (e.g. "12,50" as 12.5) is not normalized — the heuristics layer intentionally avoids this to prevent UK/US comma-thousands from being misread.

---

## Duplicate-Name Warning
- **Status:** shipped
- **Description:** Before applying a customer or supplier import, Zerupt checks whether any name in the file already exists in the tenant's database. Duplicate names produce a warning (not a hard error); duplicate codes produce a hard error that must be resolved. Users choose a duplicate policy (reject or merge) at apply time.
- **Who it's for:** Shop owners re-importing after a partial migration, or importing a file that was partially entered manually.
- **Constraints / notes:** SKU and barcode duplicates on product imports are also checked (SKU = hard error, barcode = configurable). The duplicate-policy setting (`reject` | `merge`) is set per import run.

---

## Chunked Import with Per-Chunk Atomicity
- **Status:** shipped
- **Description:** Large imports are split into 500-row chunks. Each chunk runs in its own database transaction — a chunk that fails rolls back cleanly, is recorded in `failedChunks`, and processing continues with the remaining chunks. A failed chunk does not block successful ones.
- **Who it's for:** Any shop owner importing a large product catalog or customer list where a subset of rows may have issues.
- **Constraints / notes:** Chunk size is 500 rows (`IMPORT_CHUNK_SIZE`). Failed-chunk IDs are returned in the API response so retries are targeted. Per-chunk progress is emitted as an update after each chunk.

---

## Resumable Import (Job State Rehydration)
- **Status:** shipped
- **Description:** An import job progresses through lifecycle states (Uploaded → Mapping → Mapped → Validated → Applying → Applied). If the user closes the browser mid-flow, the wizard detects any in-progress jobs on mount and reopens at the correct step via a `RESUME` action — no re-upload required.
- **Who it's for:** Shop owners who navigate away during a long import, or whose browser tab crashes mid-mapping.
- **Constraints / notes:** Resume-on-mount is wired in the wizard state machine but the comment in `use-import-wizard.ts` notes tab-reload recovery was the primary tested path. Confirmation step and beyond are fully resumable; file re-upload is not required.

---

## Import File Retention (Private Storage)
- **Status:** shipped
- **Description:** The raw uploaded file is stored in a private Supabase Storage bucket immediately after job creation (`fileRef` written to `import_jobs`). A signed download URL is available to admins/owners for a configurable retention window, enabling re-review of the original file without re-upload.
- **Who it's for:** Business owners and accountants who need to audit what was imported, or support staff troubleshooting a migration.
- **Constraints / notes:** Retention period defaults to 30 days (configurable via `IMPORT_FILE_RETENTION_DAYS`). File retention is best-effort — a storage upload failure is logged but never blocks the import. Requires `settings.import.read` permission to access the download URL.

---

## Mira Layer-1 Cleaning Brain (Structural Pathology Detection + Repair)
- **Status:** shipped
- **Description:** The FastAPI AI service runs nine deterministic structural detectors on each uploaded file before any LLM is involved: hierarchy/subtotal rows mixed with data; repeated/duplicate column headers; pivot layouts; running-total columns; footer/total rows; paginated exports; embedded codes in name fields; locale chaos (date format, comma-decimal, Arabic-Indic digits); mojibake (encoding corruption). Each detected pathology is repaired automatically, with an audit trail of every transform applied.
- **Who it's for:** Shop owners exporting from older POS or accounting systems that produce messy, non-normalized files (subtotal rows, pivot tables, page-break rows, etc.).
- **Constraints / notes:** Pure Python, 100% deterministic — same input always produces the same output. LLM is called only for ambiguous column headers after structural repair (schema-only, no cell values). Paginated exports may prompt the user for a re-export with specific instructions. Endpoint: `POST /ai/migration/clean`.

---

## Mira Layer-2 Cross-File Consolidation Graph
- **Status:** shipped
- **Description:** Accepts multiple files and joins their claims about the same entities (products, parties, accounts) on natural keys (item code, party code/name, account code) into a single consolidation graph. Conflicts become money-framed advisory decision cards rather than error walls — e.g. "Your GL says inventory is 180k; your stock report values it at 360k. Which do you trust?"
- **Who it's for:** Shop owners who export several separate reports from their old system (stock report, customer list, trial balance, etc.) and need Zerupt to reconcile them into one coherent dataset.
- **Constraints / notes:** Endpoint: `POST /ai/migration/consolidate`. The UI for presenting decision cards to the user is specced and the backend produces them, but the full multi-file drop-zone UI flow (Mira's "workspace") is part of the Mira v1 build slice — the consolidation engine is shipped, the wizard integration that surfaces all decision cards in sequence is in progress.

---

## Anomaly Detection (Layer-2 Safety Net)
- **Status:** shipped
- **Description:** After the consolidation graph is built, a deterministic sweep flags four classes of costly silent mistakes: items priced below their own cost price; duplicate barcodes shared by different items; zero or negative costs/quantities; parties that appear on both the customer and supplier sides with conflicting balances. Each finding becomes an advisory decision card framed in plain money terms — never a blocking error.
- **Who it's for:** Shop owners who may not notice these issues in a raw spreadsheet — a non-technical retailer who sets a selling price lower than cost because of a data entry error in their old system.
- **Constraints / notes:** Module: `apps/ai/app/migration/anomalies.py`. Purely advisory — the owner can proceed without resolving anomaly cards. All cards are warm, first-person, and money-denominated (no jargon).

---

## Party-as-Ledger Detection
- **Status:** shipped
- **Description:** Detects when a chart of accounts contains individual customer or supplier accounts as sub-ledger entries (a common pattern in older accounting systems). Automatically proposes converting those entries into proper customer/supplier records and collapsing them into a single AR/AP control account, with a plain-language card explaining the conversion.
- **Who it's for:** Shop owners migrating from a manual or legacy accounting system where customer balances were tracked as individual COA lines rather than in a dedicated AR/AP module.
- **Constraints / notes:** Part of the Layer-2 consolidation graph. The conversion is proposed as a decision card — it is never auto-applied without user confirmation.

---

## Decision Cards (Money-Framed Conflict Resolution)
- **Status:** shipped
- **Description:** Every conflict, anomaly, or ambiguity surfaced during import is presented as a decision card with the financial consequence stated in plain money terms and 2–3 pre-populated resolution options. There are no manual-match walls — the default option is always pre-selected by Mira and can be bulk-accepted.
- **Who it's for:** Non-technical shop owners who need to resolve data conflicts without understanding accounting or database concepts.
- **Constraints / notes:** Decision cards are produced by the consolidation and anomaly modules (Python). The NestJS orchestration layer surfaces them in the import job response. Full bulk-accept UX across all card types is part of the Mira v1 wizard integration build.

---

## Structural File Fingerprinting
- **Status:** shipped
- **Description:** A structural fingerprint (one-way hash of column names and detected shapes, never cell values) is computed for every uploaded file after Layer-1 cleaning. Used as the key for the learned-mapping cache and to recognize previously seen file shapes instantly.
- **Who it's for:** Transparent infrastructure feature — benefits all users by making each subsequent import from a known file shape faster and cheaper.
- **Constraints / notes:** Module: `apps/ai/app/migration/fingerprint.py`. Value-free by design — the hash can never be reversed to expose business data.

---

## AI-Suggested Fixes (Validation Repair Proposals)
- **Status:** shipped
- **Description:** After column mapping is confirmed, rows are validated. For clusters of similar errors (e.g. multiple rows with a price format issue), the AI service proposes a repair — "Remove non-numeric characters from 4 price cells?" — with a confidence score. Fixes above 0.90 confidence can be bulk-approved; lower-confidence fixes require individual review.
- **Who it's for:** Shop owners whose export files have formatting inconsistencies (currency symbols in price columns, mixed date formats) that would otherwise require manual row-by-row fixes.
- **Constraints / notes:** Powered by `apps/ai/app/llm/fixes.py`. Deduplication of error types happens in `import-validation.service.ts` before the AI call to avoid sending redundant rows. Each fix proposal is logged in the audit trail.

---

## Supported Entity Types
- **Status:** shipped
- **Description:** Import supports eight entity types: products/items, customers, suppliers, categories, opening stock (per location), opening balances (trial balance → journal entry), opening receivables (per-customer AR), and opening payables (per-supplier AP). Each type has a canonical field set and a downloadable CSV template.
- **Who it's for:** Any shop owner migrating from another system — covers the full data set needed to go live: inventory, parties, and books.
- **Constraints / notes:** Opening stock, receivables, and payables use a separate upload/validate/apply pipeline from the main entity import (they are excluded from the entity-import apply service). Import ordering is enforced: categories before products, products before opening stock, COA before opening balances.

---

## Import Hub Status
- **Status:** shipped
- **Description:** A hub-status endpoint reports how many records have been successfully imported for each entity type, giving the onboarding wizard a real-time progress summary ("3 of 5 import steps complete").
- **Who it's for:** Shop owners working through the onboarding checklist who want to see at a glance what has been loaded and what remains.
- **Constraints / notes:** Endpoint: `GET /tenant/imports/hub-status`. Used to gate go-live readiness checks.

---

## CSV Template Download
- **Status:** shipped
- **Description:** For each supported entity type, a correctly-formatted CSV template is available for download with all required and optional column headers. Gives shop owners a clean starting point if their current system can't produce a usable export.
- **Who it's for:** Shop owners who need to manually prepare data or whose legacy system has no export function.
- **Constraints / notes:** Endpoint: `GET /tenant/imports/template?entityType=...`. Requires `settings.import.read`. Template generation is deterministic (no DB needed).

---

## LLM Telemetry + Cost Guardrails
- **Status:** shipped
- **Description:** Every rung-5 LLM call is counted and its token cost accumulated in-memory per import job. A soft budget alert fires (via Nest Logger) if a single import exceeds ~$1 in LLM cost — signalling a gap in the deterministic rungs, not expected spend. Metrics are available for export to Sentry/PostHog.
- **Who it's for:** Internal — Zerupt engineering and the founder, to keep import AI cost observable and bounded.
- **Constraints / notes:** Service: `import-telemetry.service.ts`. External sink (Sentry/PostHog) is wired as a comment placeholder — currently Logger only. Counter is cleared on import finalization; importId must be a UUID for tenant-safe isolation.

---

## COA Reconciliation Import (AI-Assisted)
- **Status:** shipped (engine) / `planned` (full wizard UI)
- **Description:** When a customer imports their own chart of accounts, Mira matches each customer account to the seeded template using code proximity, fuzzy name matching (en + ar), account type, and normal balance. Matched accounts are renamed/recoded in place; customer-only accounts are created; template-only non-system accounts are candidates for deactivation. A deterministic gate validates that all ~20 system roles remain bound before any changes are committed. AI provides advisory "expert suggestion" cards for known structural patterns (missing VAT account, near-duplicate accounts, etc.).
- **Who it's for:** Shop owners migrating from a system with a custom chart of accounts — avoids the manual horror of mapping 50+ accounts one by one.
- **Constraints / notes:** System role binding is 100% deterministic — the LLM never decides whether COGS has an account. Advisory suggestions are cards, never auto-applied. Full wizard integration and the matching-UX bulk-accept flow are part of the Mira v1 build.

---

## Opening Balance Import (Trial Balance → Journal Entry)
- **Status:** shipped
- **Description:** Accepts a trial balance or balance sheet from Excel, fuzzy-matches account names to the tenant's COA, and creates the opening balance journal entry. Verifies that Opening Balance Equity nets to zero and offers a guided resolution if it does not (with common-cause suggestions).
- **Who it's for:** Business owners and accountants migrating their books into Zerupt — eliminating the manual double-entry process of recreating opening balances.
- **Constraints / notes:** Requires COA reconciliation to be completed first. AR/AP opening balances per-party use a dedicated endpoint that is separate from the trial balance flow.

---

## AI Service Degradation Handling (Offline Fallback)
- **Status:** shipped
- **Description:** If the FastAPI AI service is unavailable, import is never blocked. Rungs 1–4 of the column mapping ladder (exact match, alias, heuristics, learned cache) continue to operate; unresolved columns fall back to a manual mapping dropdown. Validation runs without AI fix suggestions. Mira Layer-1 cleaning requires the AI service but a health-check status is shown at onboarding start.
- **Who it's for:** All users — ensures that an AI service outage does not prevent customers from completing their migration.
- **Constraints / notes:** Visible status indicator ("Mira is on the job ✓" / "Mira is offline — manual mode") is specced in the Mira migration brain spec; the NestJS fallback paths are implemented.

---

## Layer-3 Inference (Missing Data from Context)
- **Status:** planned
- **Description:** When a customer's files are missing data (no selling prices, no categories, no reorder levels), Mira will infer plausible values from the data that is present — categories from product name clustering, selling prices from cost × learned category markup, reorder levels from opening quantity, account types from COA hierarchy path. Every inferred value carries a provenance badge and lands in a review queue, never silently entering the books.
- **Who it's for:** Shop owners with very sparse legacy data who want to go live quickly without manually filling in every blank.
- **Constraints / notes:** Specced as Phase B in the Mira migration brain spec. All inference runs on Zerupt's own infrastructure (no cell data leaves). Not yet built.

---

## Notebook / Photo Import Path
- **Status:** planned
- **Description:** A camera-based path that lets a shop owner photograph a paper ledger or handwritten stock list; Mira's VLM extraction adapter (shared with the Sami invoice scanner) extracts structured data from the image and feeds it into the import pipeline.
- **Who it's for:** Shop owners who have no digital records at all — their inventory and accounts exist only on paper.
- **Constraints / notes:** Specced as Phase B in the Mira migration brain spec. The VLM extraction adapter (`apps/ai/extraction/`) is built for Sami and available for reuse; the import-path integration is not yet built.

---

## Global Cross-Tenant Learned-Mapping Cache
- **Status:** planned
- **Description:** An anonymized, opt-in tier of the learned-fingerprint flywheel that shares structural shape knowledge across tenants. The first customer to migrate from a given legacy system trains the cache; all subsequent customers from that same system get zero-cost instant mapping.
- **Who it's for:** All future customers — the compounding network effect that makes Zerupt's import progressively more powerful with scale.
- **Constraints / notes:** Per-tenant cache is shipped. Global tier is specced in `03-ai-import-assistant.md` (Phase 3, agents spec). Not yet built.
