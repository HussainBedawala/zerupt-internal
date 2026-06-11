# AI Import Assistant

## Overview

AI-assisted data import during onboarding. The customer uploads Excel/CSV files with their existing data, and the AI Import Agent handles column mapping, validation with fix suggestions, and guided import execution.

Uses the import infrastructure from `settings-admin/11-data-import-migration-controls.md` with the AI column mapping and suggested fixes extensions.

---

## Upload Flow (per entity)

```
Upload File → AI Column Mapping → User Review → Validation → Preview → Confirm → Apply
```

## Supported Entity Types

| Entity | Required Before | Typical Source |
|--------|----------------|----------------|
| Categories | — | Extracted from product data or separate file |
| Products / Items | Categories | Product list spreadsheet |
| Customers | — | Customer list spreadsheet |
| Suppliers | — | Supplier list spreadsheet |
| Opening Stock | Products, Branches/Warehouses | Stock count spreadsheet |
| Opening Balances | COA | Trial balance or balance sheet |

## Cross-Entity Import Ordering (Enforced)

1. Categories (extracted from product data if not a separate file)
2. Products / Items
3. Customers
4. Suppliers
5. Opening Stock (per location)
6. **Chart of Accounts reconciliation** (if the tenant imports their own COA / has a custom chart)
7. Opening Balances (accounting)

The UI enforces this order: entity imports that depend on prior entities are locked until dependencies are complete. **COA reconciliation must complete before Opening Balances** — balances cannot map correctly onto a chart that hasn't been reconciled to the customer's reality.

---

## Column Mapping — the Resolution Ladder

> **Design principle (non-negotiable): the LLM is the LAST rung, not the default.**
> Column mapping is resolved by a deterministic ladder; the LLM is only invoked for the
> columns nothing else could bind. This is what keeps import accurate, auditable, fast,
> and near-free at scale — and it is *more* AI-native, not less: the system **learns and
> gets cheaper with every import** (rung 4), the way a self-driving stack reserves its
> neural nets for genuine perception and runs deterministic control everywhere else.
> "Power shown sparingly" (brand book §10). We spend tokens only where judgment is real.

When a file is uploaded, each source column is resolved **top-down; the first confident
bind wins:**

```
1. Exact match            "Barcode" → barcode                  free, instant
2. Alias dictionary       "Prod. Nm" / "اسم الصنف" → name        free  ← the workhorse
3. Content heuristics     13-digit numeric → barcode; @ → email; free
                          currency-shaped → price; date-shaped → date
4. Learned mappings       source-fingerprint cache              free  ← the flywheel
                          ("this is a Merpec products export → apply known map")
5. ── LLM (rung 5) ──     ONLY columns rungs 1–4 couldn't bind   $, rare
```

**Rung 2 — Alias dictionary.** A hand-built, versioned synonym map for ~40 retail fields
across **en + ar** and the common legacy exports (Merpec, Tally, generic Excel/Sheets).
Extendable without a deploy. Every alias it holds is a column we never pay an LLM to infer,
ever.

**Rung 4 — Learned-mapping cache (the scaling moat).** On a confirmed import, the resolved
mapping is persisted keyed by a **source fingerprint** (header-set hash + detected source
system). The next import matching that fingerprint pre-applies the mapping — the user
confirms instead of the system re-inferring. The first migration off a given legacy system
is the only expensive one; by the tenth customer from that same system, LLM cost
approaches zero. Per-tenant at launch; optional anonymized global tier later (Phase 3, per
`agents/07-suggestion-model.md` cross-tenant learning).

**Rung 5 — LLM assist.** The FastAPI `ImportAssistPlugin` is invoked **only for the
unresolved columns**, with headers + first 10 rows + tenant context (industry, inventory
concept). It also infers entity type when not specified (product vs. customer vs. supplier
list), detects language, and returns **per-column confidence scores (0.0–1.0)**. A healthy
import of a known source should reach rung 5 for few or zero columns; heavy rung-5 traffic
signals a gap in rungs 1–4 (and is instrumented as such — see Cost Guardrails).

### Mapping Review UI

```
We detected this is a Product List (245 rows)

Your Column          → HSN Field              Confidence
--------------------------------------------------------------
"Item Name"          → Product Name           ✓ 98%
"Item Name Arabic"   → Product Name (Alt)     ✓ 95%
"Code"               → SKU                    ✓ 97%
"Barcode"            → Barcode                ✓ 99%
"Category"           → Category               ✓ 92%
"Buy Price"          → Purchase Price         ✓ 96%
"Sell Price"         → Selling Price          ✓ 96%
"Stock Qty"          → Opening Stock          ✓ 88%
"Color"              → Attribute: Color       ? 75%  [Change]
"Warehouse"          → Location               ? 70%  [Change]
"Notes"              → [Unmapped]             —      [Map to…]

Unmapped HSN fields (optional):
  - Reorder Level
  - Supplier
  - Tax Category
  - Weight/Dimensions
```

User actions:
- Accept all mappings (one click)
- Override individual mappings (dropdown of HSN fields)
- Ignore columns (exclude from import)
- Map to custom fields

Columns with confidence below 0.75 are visually flagged for review.

---

## Validation with AI-Suggested Fixes

After mapping confirmation, the system validates all rows. The AI service analyses errors and proposes fixes.

### Validation Results UI

```
Validating 245 products...

Results:
  ✓ 231 products ready to import
  ⚠ 12 products have warnings (fixable)
  ✗ 2 products have errors (must fix)
```

### AI Fix Suggestions

| Error Type | AI Suggestion |
|------------|---------------|
| Duplicate barcode | "Row 45 and Row 12 share barcode X. Keep row 12 and skip row 45?" |
| Price anomaly | "Row 189: Selling price (15 KWD) below purchase price (22 KWD). Fix selling price to 22 KWD?" |
| Unknown category | Groups all unmapped categories, suggests creating new categories or mapping to existing |
| Missing required field | Suggests defaults based on industry and data patterns |
| Format mismatch | "Column 'Price' has text values in rows 5, 18. Remove non-numeric characters?" |

Each fix has a confidence score. Fixes above 0.90 confidence can be auto-applied with user's bulk approval. Lower-confidence fixes require individual review.

---

## Preview

After validation passes (all errors resolved, warnings accepted or fixed):

- Show first 20 rows as they will appear in the system
- Highlight any rows that had fixes applied
- Row-level approve/reject toggle for edge cases
- Summary counts: total rows, rows to import, rows skipped

## Import Execution

Uses the existing import pipeline from `settings-admin/11-data-import-migration-controls.md`:

- Atomic per-chunk transactions
- Idempotency via import fingerprint
- Master entities before dependent entities

### Chart of Accounts Reconciliation (Special Case)

Configuration (`02-configuration-pipeline.md` Step 3) seeds a template COA. But the customer
has their *own* chart — different codes, names, language, and structure. Reconciliation makes
the seeded chart match the customer's reality **without breaking the posting engine**, and
adds expert-accountant advice on what to fix. This is what separates Zerupt from a tool that
dumps your balances into the wrong accounts.

**The hard constraint.** ~20 accounts are `isSystemAccount` (non-deletable) because the
posting engine hard-codes them (`accounting/04` + `06-account-mappings.md`): COGS posts to
`5100`, AR to `1131`, Opening Balance Equity to `3900`, etc. So we do **not** replace our
chart with theirs. Instead:

> The customer's chart becomes the **visible source of truth** (their codes, names,
> hierarchy). Our system accounts survive underneath as **semantic roles**, each bound to
> whichever account plays that role.

**Two-layer model:**
- **Layer 1 — System Roles** (deterministic, locked, ~20): identified by *role* not code —
  "the account COGS posts to", "the AR control account". Must always resolve to exactly one
  account. Never deleted.
- **Layer 2 — The customer's chart** (imported): the source of truth for what the owner sees
  and uses.

**Reconciliation runs as: deterministic core, AI advisory shell.** AI proposes, deterministic
code validates, human confirms anything touching a control account.

```
A. MATCH (AI-assisted, deterministic-scored via the resolution ladder)
   Match each customer account to a template account using code proximity,
   name fuzzy/alias match (en+ar), type + normalBalance, and resembled role.
   Confidence 0.0–1.0 per match.

B. CLASSIFY into 3 buckets (deterministic)
   ① MATCHED       → customer account adopts a system role. We RENAME/RECODE
                     our system account IN PLACE to the customer's code+name
                     (immutable update, not delete+recreate; full audit). Role
                     binding preserved.
   ② CUSTOMER-ONLY → account we don't have → CREATE and keep it.
   ③ TEMPLATE-ONLY → our seeded account they didn't import:
                       · isSystemAccount → KEEP (engine needs it), hide-until-used,
                         AI explains why it stays.
                       · non-system       → candidate to deactivate; AI advises.

C. VALIDATE (deterministic GATE — cannot be skipped, NO AI)
   Every one of the ~20 system roles MUST be bound to exactly one account with
   correct type/normalBalance. If a role is unbound (e.g. customer has no COGS
   account), KEEP our account for that role and flag it. This invariant is what
   protects the posting engine.

D. EXPERT SUGGESTIONS (advisory; surfaced as suggestion cards, never auto-applied)
   Known finite patterns → deterministic rules (cheap, auditable, instant):
     · VAT-registered but no input-VAT account → "I kept 1162; map your input tax here."
     · fixed assets but no Accumulated Depreciation → "Add 1220?"
     · account named 'Drawings' typed as Expense → "Reclassify to Equity?"
     · 3 near-duplicate 'Misc Income' accounts → "Merge?"
   The genuinely-weird tail → LLM (Sonnet). Owner approves each via a suggestion card.
```

**Hierarchy depth — their structure wins for what they see, our roles win for what posts.**
The COA schema is unbounded (`parentAccountId` chain; no level cap). The seeded template runs
~2–4 levels deep; the engine cares only about **roles bound to leaf (postable) accounts**, not
about depth.
- **More levels** (customer splits Sales › Mobiles › iPhone): adopt their deeper hierarchy
  as-is; bind roles to *their* leaf accounts. No flattening, no loss.
- **Fewer / flat levels** (flat list, no grouping): keep it flat; bind roles directly. The
  expert layer *may* suggest grouping — suggest-only, owner decides. Never force our structure.
- **Customer posts to a parent/header account** (the real edge case): the VALIDATE gate
  requires every system role to bind to exactly one **postable leaf**. Resolve by treating the
  account as a leaf or by creating a child (e.g. "Sales – General") to carry the balance, with
  an audit entry. A control account (`isControlAccount`, e.g. `1131`) is always engine-posted
  only and must remain a leaf.

**Engine split (the reliability contract):**

| Job | Engine | Why |
|-----|--------|-----|
| Match customer accounts → template | AI + deterministic score | fuzzy/multilingual names need the LLM; <0.90 on a control account needs human confirm |
| Bind system roles / the validation gate | **100% deterministic** | protects money posting — an LLM must never decide whether COGS has an account |
| Rename/recode in place | deterministic | immutable update, full audit |
| Expert "add/remove" advice | rules for the ~20 known patterns; LLM for the tail | known patterns are finite + auditable; reserve tokens for genuine novelty |

### Opening Balance Import (Special Case)

The most complex import. The AI assists by:

1. Accepting a trial balance or balance sheet from Excel
2. Mapping rows to COA accounts (fuzzy matching account names to the COA created during configuration)
3. Creating the `OpeningBalance` journal entry
4. Verifying that Opening Balance Equity (3900) nets to zero
5. If it doesn't net: "Your opening balances are off by X. Common causes: forgot bank balance, forgot inventory value, or rounding difference. Park the difference in Opening Balance Equity for now?" [Yes] [Show details]

---

## Cost Guardrails

The resolution ladder is the cost strategy; these make it observable and enforce it.

| Guardrail | Behaviour |
|-----------|-----------|
| Per-import LLM telemetry | LLM-call count + token cost logged per import (Sentry/PostHog). A known-source import should make a handful of calls at most. |
| Soft per-onboarding budget | ~$1 token budget per onboarding. Breach logs/alerts — it signals a **ladder gap** (missing alias, cold cache), not expected spend. |
| Model routing | Mapping/fixes (extraction) → low-cost model (Claude Haiku). Reserve reasoning models (Sonnet) for genuine judgment (COA advice, Copilot). Never run a reasoning model on what a regex resolves. See `tech-stack.md §6`. |
| Cache-first | Rung 4 is checked before any LLM call. Repeat migrations off the same legacy system trend toward zero LLM cost. |

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| AI service unavailable | Rungs 1–4 (exact, alias, heuristics, cache) keep resolving with no AI. Unresolved columns fall back to manual mapping UI (dropdown per column). Validation runs without AI fix suggestions. Import is never blocked by LLM availability. |
| File too large (>50,000 rows) | Process in background with progress updates via WebSocket (Socket.io). |
| Partial import failure | Failed chunk is not committed. User can retry the failed chunk or skip it. |
| Entity dependency missing | UI blocks the import with a message: "Import Products before Opening Stock." |

## Permissions

| Action | Required Key |
|--------|--------------|
| Upload file | `settings.import.create` |
| Review/confirm AI mappings | `settings.import.create` |
| Accept AI-suggested fixes | `settings.import.create` |
| Confirm and apply import | `settings.import.apply` |

## Cross-Module Contracts

| Contract | Target |
|----------|--------|
| Completed imports → Go-Live | `04-go-live.md` checks import status for go-live readiness |
| AI mapping confidence data → ImportAssistPlugin | Feedback improves future mapping accuracy |
| Import errors → audit log | All errors, fixes, and user decisions are audited |
