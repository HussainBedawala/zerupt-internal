# Multi-Entity Consolidation — Design

> Status: **Not implemented.** P3 priority — future phase.
> Route: `/accounting/consolidation`
> Prerequisite: Legal entity management, exchange rate management, financial statements.

## Purpose

Produce consolidated financial statements across multiple legal entities under one tenant. A retailer with entities in UAE, Saudi, and India needs a group-level P&L and balance sheet in one functional currency.

---

## Scope & Constraints

### In Scope

- Consolidation of trial balance / P&L / balance sheet across legal entities
- Currency translation (each entity's functional currency → group reporting currency)
- Elimination of inter-entity balances (AR/AP between entities)
- Consolidation adjustments (manual JEs at group level)

### Out of Scope (explicitly deferred)

- Partial ownership / minority interest (Zerupt = single-owner retail, not holding companies)
- Equity method investments
- Goodwill / purchase price allocation
- Segment reporting

---

## Currency Translation Method

Per IAS 21 (The Effects of Changes in Foreign Exchange Rates):

| Statement Item | Rate Used | Source |
|---------------|-----------|--------|
| Assets & liabilities | Closing rate (period end) | `exchange_rates` table, latest for period end date |
| Income & expenses | Average rate for period | Computed: average of daily rates in period, or monthly average |
| Equity (share capital, opening RE) | Historical rate | Rate at date of investment / incorporation |
| Current year earnings | Derived | Translated P&L net income |

### Translation Difference

The difference between net assets translated at closing rate vs. historical equity + translated P&L goes to **Currency Translation Reserve** (equity account, auto-created per entity in group COA).

---

## Data Model

### No Separate Table for Consolidated Balances

Consolidation is **computed at report time**, not stored. Reasons:
- Avoids sync issues when source JEs change
- Keeps single source of truth (JE lines)
- Acceptable performance for SME scale (< 10 entities, < 1M JE lines)

### Configuration: `consolidation_groups`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | no | PK |
| tenantId | uuid | no | |
| name | varchar(200) | no | e.g. "Al-Noor Retail Group" |
| reportingCurrency | varchar(3) | no | ISO 4217 — group functional currency |
| createdBy / updatedBy | uuid | no/yes | |

### Configuration: `consolidation_group_entities`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| consolidationGroupId | uuid | no | FK → consolidationGroups CASCADE |
| legalEntityId | uuid | no | FK → legalEntities RESTRICT |

Composite PK: `(consolidation_group_id, legal_entity_id)`.

### Manual Adjustments: `consolidation_adjustments`

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | uuid | no | PK |
| consolidationGroupId | uuid | no | FK → consolidationGroups CASCADE |
| fiscalPeriodId | uuid | no | FK → fiscalPeriods RESTRICT |
| description | varchar(500) | no | |
| accountId | uuid | no | FK → accounts (group-level COA) |
| debit / credit | numeric(19,6) | no | In reporting currency |
| adjustmentType | enum | no | `elimination`, `translation`, `other` |
| createdBy | uuid | no | |

---

## Consolidation Query Flow

```
1. For each entity in group:
   a. Fetch trial balance for the period (posted JEs only)
   b. Translate each account balance:
      - B/S accounts → closing rate
      - P&L accounts → average rate
      - Equity accounts → historical rate
   c. Compute translation difference → Currency Translation Reserve

2. Sum translated balances across all entities (by account code mapping)

3. Apply elimination entries:
   - Auto-detect: inter-entity AR/AP where counterparty is another group entity
   - Auto-generate elimination: DR inter-entity AP, CR inter-entity AR
   - User reviews and confirms (not fully automatic — edge cases exist)

4. Apply manual consolidation adjustments

5. Return consolidated trial balance / financial statements
```

### Account Code Mapping

Entities may have different COA structures. Consolidation requires mapping:

| Entity Account | Group Account | Rule |
|---------------|---------------|------|
| Same code exists in all entities | Direct sum | Default behavior |
| Entity uses different codes | Manual mapping table | `consolidation_account_mappings(entity_account_id → group_account_id)` |
| Entity has account with no group equivalent | Excluded or mapped to "Other" | User decision |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/accounting/consolidation/groups` | List consolidation groups |
| POST | `/accounting/consolidation/groups` | Create group (name, currency, entities) |
| PATCH | `/accounting/consolidation/groups/:id` | Update group |
| GET | `/accounting/consolidation/groups/:id/trial-balance` | Consolidated trial balance. Query: `fiscalPeriodId` |
| GET | `/accounting/consolidation/groups/:id/income-statement` | Consolidated P&L |
| GET | `/accounting/consolidation/groups/:id/balance-sheet` | Consolidated balance sheet |
| GET | `/accounting/consolidation/groups/:id/adjustments` | List manual adjustments for period |
| POST | `/accounting/consolidation/groups/:id/adjustments` | Add manual adjustment |
| POST | `/accounting/consolidation/groups/:id/eliminate` | Auto-detect and propose inter-entity eliminations |

---

## Inter-Entity Elimination

### Detection Logic

```
For each entity pair (A, B) in the group:
  1. Find JE lines in entity A where:
     - Account is mapped to "Inter-Entity Receivable" or "Due From [B]"
     - sourceDocumentType indicates inter-entity transaction
  2. Find matching JE lines in entity B where:
     - Account is mapped to "Inter-Entity Payable" or "Due To [A]"
     - Same sourceDocumentId or correlationId
  3. Compute net balance between A→B
  4. Propose elimination entry:
     DR Inter-Entity Payable (B's translated amount)
     CR Inter-Entity Receivable (A's translated amount)
     DR/CR FX difference (if translated amounts differ)
```

### Prerequisite

Inter-entity transactions must use designated accounts tagged with `isInterEntity = true` in COA. This tag is added during COA setup.

---

## UI Components

| Component | Notes |
|-----------|-------|
| ConsolidationGroupSetup | Select entities, reporting currency, account mappings |
| ConsolidatedTrialBalance | Columns: Account, Entity A, Entity B, ..., Eliminations, Consolidated |
| ConsolidatedStatements | Reuse financial statement components with consolidated data source |
| EliminationReview | Proposed eliminations with approve/reject per entry |
| TranslationRateOverview | Show rates used per entity per period for transparency |

---

## Performance Notes

- For < 10 entities and < 100K JE lines per entity, compute-on-read is acceptable
- If performance degrades: consider materialized view refreshed on demand (`REFRESH MATERIALIZED VIEW consolidated_tb`)
- Translation rate lookups should be batched (fetch all rates for period in one query)
- Index on `exchange_rates(from_currency, to_currency, effective_date)` is critical
