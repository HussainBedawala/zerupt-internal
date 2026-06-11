<!-- Feature catalog index | Audited: 2026-06-11 -->
# Zerupt Feature Catalog — Master Index

This is the canonical catalog of every Zerupt feature, audited as-built on 2026-06-11. Marketing must only claim `shipped` features. `planned` = on the roadmap, do not advertise as available.

---

## Summary Table

| Module | Shipped | Planned | Catalog file |
|--------|--------:|--------:|-------------|
| Accounting | 33 | 2 | [accounting.md](accounting.md) |
| Settings & Administration | 27 | 4 | [settings-admin.md](settings-admin.md) |
| Inventory | 25 | 3 | [inventory.md](inventory.md) |
| POS | 22 | 4 | [pos.md](pos.md) |
| Sales | 26 | 2 | [sales.md](sales.md) |
| Purchase | 17 | 0 | [purchase.md](purchase.md) |
| Onboarding | 23 | 2 | [onboarding.md](onboarding.md) |
| Dashboard | 13 | 4 | [dashboard.md](dashboard.md) |
| Reports | 18 | 4 | [reports.md](reports.md) |
| Data Import & Migration | 24 | 3 | [import.md](import.md) |
| AI Engine (Zee / Mira / Sami) | 20 | 11 | [ai-engine.md](ai-engine.md) |
| Business Knowledge Graph | 6 | 0 | [knowledge-graph.md](knowledge-graph.md) |
| ZATCA E-Invoicing (Fatoora) | 0 | 10 | [zatca-compliance.md](zatca-compliance.md) |
| **TOTAL** | **254** | **49** | |

---

## How marketing agents should use this

Filter by the module most relevant to the audience (e.g., Inventory for fashion/grocery merchants, Accounting for finance managers, AI Engine for founders interested in automation), then confirm the feature's `**Status:** shipped` before referencing it in any copy, ad, or demo script. The `**Who it's for:**` field in each feature entry names the persona to target — use it to match feature benefits to the right buyer (e.g., the Mira migration brain targets owners who are switching from a legacy system and dread the data migration; Sami's invoice scanner targets anyone spending hours on manual supplier data entry). Never quote a `planned` feature as currently available; it is fair to describe the roadmap in a forward-looking context as long as it is clearly labeled "coming soon."

---

## Marquee Differentiators (Shipped — marketing-safe)

These are the highest-signal shipped features for brand positioning and paid copy:

1. **Mira AI Migration Brain** — Detects and repairs structural pathologies in any spreadsheet export from any legacy system, consolidates multi-file uploads into a single entity graph, and surfaces money-framed decision cards instead of error walls. No IT required.
2. **Sami AI Invoice Scanner** — Point a phone at any supplier invoice (Arabic, English, or mixed); Sami extracts every field and posts the purchase in one tap. Works on thermal prints, crumpled photos, and mixed-language PDFs.
3. **Signup to Live in Under 2 Hours** — A 7-step onboarding wizard feeds an auto-configuration pipeline that provisions the full ERP (COA, tax, locations, roles, fiscal periods, document sequences) without any manual setup.
4. **Business Knowledge Graph — Blast-Radius Analysis** — Before deleting or deactivating any entity, the system shows exactly what would break. Owners never accidentally orphan open invoices or cut a sole-supplier relationship.
5. **Business Knowledge Graph — Dormant Capital Detection** — Automatically surfaces inventory tied up with zero movement for 90+ days, with the cash amount prominently displayed on the dashboard.
6. **Offline-First POS** — Full POS operation with no internet: catalog pre-synced, sales queued, shifts closed offline. Idempotent server-side sync with totals-mismatch flagging.
7. **Multi-Currency + Realized & Unrealized FX** — Full multi-currency accounting with historical rates, auto-realized FX gain/loss on settlement, and month-end unrealized revaluation with auto-reversals.
8. **WAC / FIFO / Specific-Identification Costing** — Three costing methods in one system: weighted average for standard goods, FIFO for batch/expiry-tracked items, and exact-unit costing for serialized high-value goods (electronics, jewellery).
9. **Retroactive COGS Adjustment for Landed Costs** — When freight and customs arrive after goods are already sold, the system retroactively trues up COGS automatically.
10. **AI Column Mapping (5-Rung Resolution Ladder)** — Uploaded spreadsheets are auto-mapped to Zerupt fields using a deterministic ladder (exact → alias dictionary → content heuristics → learned cache → LLM). Arabic column headers supported. Your numbers never leave Zerupt.
11. **Cheque Lifecycle Management** — Full post-dated cheque tracking (issued, deposited, cleared, bounced) with auto journal entries at every step — critical for GCC markets where PDCs are a primary payment instrument.
12. **Immutable Audit Trail with Tamper Evidence** — Every create/update/delete/login/approval across the entire system is written to a tamper-evidenced audit log with daily chain hashes and before/after field diffs.

---

## Do NOT Yet Claim

The following high-interest items are **not shipped** as of 2026-06-11 and must not appear in marketing as available features:

- **ZATCA E-Invoicing / Fatoora compliance** — Full implementation exists on a feature branch but is NOT merged to `main`. Zero ZATCA code is in production. Do not claim KSA e-invoicing compliance until the branch is merged and verified in production.
- **Noor (Dead Stock Finder), Maya (Margin Watchdog), Tariq (Shrinkage Guard), Arjun (Stockout Predictor)** — AI money-found detector agents. Specced and named; the substrate (Money-Found Engine) is not yet built.
- **Zee Daily Digest** — UI shell only; insight delivery pipeline not built.
- **Copilot / Chat with Zee (NLQ)** — Not started; deliberately sequenced after months of earned trust data.
- **Report Builder (Custom Reports)** — No implementation found in codebase.
- **Excel Export** — Only CSV and PDF exports are shipped; `.xlsx` export is specced but not built.
- **Consolidated Financial Statements (multi-entity)** — Deferred to Phase 6.
- **Auto-Fetched Exchange Rates** — Data model exists; external provider integration not wired.
