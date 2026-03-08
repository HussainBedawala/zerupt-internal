# Document Numbering

## Sequence Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `tenantId` | UUID | |
| `documentType` | enum | `POS`, `SO`, `INV`, `PO`, `GRN`, `PRN`, `PAY`, `RCV`, `ADJ`, `TRF`, `JRN` |
| `branchId` | UUID | nullable for tenant-wide |
| `prefix` | string | |
| `suffix` | string | nullable |
| `padding` | integer | 1-10 |
| `nextNumber` | integer | >= 1 |
| `resetPolicy` | enum | `Never`, `Yearly`, `Monthly` |
| `isActive` | boolean | |

## Reservation Entity

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | |
| `sequenceId` | UUID | |
| `reservedNumber` | string | Generated document number |
| `reservedAt` | datetime | |
| `status` | enum | `Reserved`, `Committed`, `Released` |
| `sourceDocumentId` | UUID | nullable |

---

## Generation Rules

| Rule | Detail |
|------|--------|
| Format | `{prefix}{zeroPad(nextNumber,padding)}{suffix}` |
| Scope | Branch-specific sequence overrides tenant sequence |
| Concurrency | Atomic increment per sequence row lock |
| Offline POS | Temporary local IDs, remapped on sync by policy |

## Edit and Lock Rules

| Rule | Detail |
|------|--------|
| Prefix/suffix edit | Allowed any time, audited |
| Padding edit | Allowed if no conflict with existing numbers |
| nextNumber decrease | Block unless owner override + reason |
| sequence deactivation | Block when pending reservations exist |

## Gap Policy

| Policy | Behavior |
|--------|----------|
| Strict | No gaps allowed; failed issue retries same number |
| Tolerant | Gaps allowed with audit reason |
| Default | `Tolerant` for POS, `Strict` for financial documents |

## Cross-Reference

| Reference Scope | Alignment |
|-----------------|-----------|
| Module document flows | Numbering consumption aligns with each module spec |
| Financial documents | Numbering controls align with accounting period and audit rules |
