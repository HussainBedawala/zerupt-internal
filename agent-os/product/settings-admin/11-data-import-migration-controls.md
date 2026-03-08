# Data Import and Migration Controls

## Import Job Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `type` | enum | `Items`, `Customers`, `Suppliers`, `OpeningStock`, `COA`, `OpeningBalances`, `Users` |
| `status` | enum | `Uploaded`, `Mapping`, `Validated`, `Previewed`, `Confirmed`, `Applied`, `Failed`, `RolledBack` |
| `sourceFormat` | enum | `CSV`, `XLSX` |
| `fileRef` | string | Storage path |
| `columnMappings` | json | AI-proposed and user-confirmed column mappings. Structure: `{ sourceColumn: string, targetField: string, confidence: number, userOverride: boolean }[]` |
| `mappingConfidence` | decimal | Overall mapping confidence score (0.0–1.0). Null until AI mapping completes. |
| `submittedByUserId` | UUID | |
| `createdAt` | datetime | |

## Import Error Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `jobId` | UUID | |
| `rowNumber` | integer | |
| `columnName` | string | |
| `errorCode` | string | |
| `message` | string | |
| `severity` | enum | `Error`, `Warning` |
| `aiSuggestedFixes` | json | AI-proposed fixes. Structure: `{ description: string, fixAction: string, fixValue: any, confidence: number }[]`. Null if no AI suggestion available. |

---

## Workflow

```
Upload -> AI Column Mapping -> Validate -> Preview -> Confirm -> Apply
                                                       \-> Cancel
```

### AI Column Mapping Step

When a file is uploaded, the system invokes the FastAPI `ImportAssistPlugin` to analyse headers and sample rows:

1. **Read headers and first 10 rows** from the uploaded file.
2. **Infer entity type** if not specified (product list, customer list, supplier list, etc.).
3. **Map source columns to HSN target fields** using exact header matching, fuzzy matching, content analysis, and language detection (Arabic headers mapped to English equivalents).
4. **Return mappings with per-column confidence scores** (0.0–1.0). Scores below 0.75 are flagged for user review.
5. **User reviews the mapping** — can accept all, override individual mappings, ignore columns, or map to custom fields.
6. **Confirmed mappings are saved** to `columnMappings` on the Import Job. The aggregate confidence is saved to `mappingConfidence`.

The AI mapping step transitions the job status from `Uploaded` to `Mapping` (while AI processes) then to `Validated` after user confirmation triggers validation.

## Validation Rules

| Rule | Detail |
|------|--------|
| Schema validation | Header + type checks required |
| Reference validation | Foreign keys resolved before apply |
| Duplicate policy | Configurable per entity (`Reject`, `Merge`) |
| Financial imports | Must pass period and currency prerequisites |
| AI-suggested fixes | When validation produces errors or warnings, the AI service proposes fixes with confidence scores. Users accept or reject each fix individually. |

## Apply Rules

| Rule | Detail |
|------|--------|
| Atomicity | Per chunk transaction; failed chunk not committed |
| Idempotency | Import fingerprint prevents duplicate apply |
| Ordering | Master entities before dependent entities |
| Audit | Job lifecycle + row corrections audited |

## Rollback Rules

| Rule | Detail |
|------|--------|
| Automatic rollback | On fatal apply failure per chunk |
| Manual rollback | Allowed if no dependent posted transactions |
| Reversal strategy | If irreversible effects exist, create compensating records |

## Permissions

| Action | Required Key |
|--------|--------------|
| Upload/validate | `settings.import.create` |
| Review/confirm AI mappings | `settings.import.create` |
| Confirm/apply | `settings.import.apply` |
| Rollback | `settings.import.rollback` |
| Download templates | `settings.import.template.view` |
