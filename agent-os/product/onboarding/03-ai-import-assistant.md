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
6. Opening Balances (accounting)

The UI enforces this order: entity imports that depend on prior entities are locked until dependencies are complete.

---

## AI Column Mapping

When a file is uploaded, the FastAPI `ImportAssistPlugin` is invoked:

1. **Read headers and first 10 rows** from the uploaded file.
2. **Infer entity type** if not explicitly specified (product list vs. customer list vs. supplier list — based on header patterns and content).
3. **Map source columns to HSN target fields** using:
   - Exact header matching (`Product Name` → `name`)
   - Fuzzy matching (`Prod. Nm` → `name`, `Barcode #` → `barcode`)
   - Content analysis (13-digit number column → barcode, email column → `email`)
   - Language detection (Arabic headers mapped to English equivalents)
   - Tenant context (inventory concept, industry) to prioritise relevant fields
4. **Return mappings with per-column confidence scores** (0.0–1.0).

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

### Opening Balance Import (Special Case)

The most complex import. The AI assists by:

1. Accepting a trial balance or balance sheet from Excel
2. Mapping rows to COA accounts (fuzzy matching account names to the COA created during configuration)
3. Creating the `OpeningBalance` journal entry
4. Verifying that Opening Balance Equity (3900) nets to zero
5. If it doesn't net: "Your opening balances are off by X. Common causes: forgot bank balance, forgot inventory value, or rounding difference. Park the difference in Opening Balance Equity for now?" [Yes] [Show details]

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| AI service unavailable | Fall back to manual column mapping UI (dropdown per column). Validation runs without AI fix suggestions. |
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
