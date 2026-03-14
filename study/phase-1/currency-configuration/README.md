# Currency Configuration

Study topics from DEV-43 — Implement currency configuration.

---

## 1. ISO 4217 Currency Standard

**What:** The international standard for 3-letter currency codes, maintained by the ISO.

**Why it matters:** Zerupt stores all currency references as ISO 4217 codes (AED, KWD, USD). Using the standard ensures interoperability with banks, payment gateways, and accounting systems worldwide.

**Key concepts:**
- Codes are always 3 uppercase letters (e.g., `AED` = UAE Dirham)
- Each currency has a defined number of decimal places (minor units): USD = 2, KWD = 3, JPY = 0
- Some currencies use 3 decimal places (KWD, BHD, OMR) — this is critical for MENA markets
- The standard also defines numeric codes (784 = AED) but text codes are more common in APIs

**Resources:**
- [ISO 4217 Wikipedia](https://en.wikipedia.org/wiki/ISO_4217)
- [ISO 4217 Currency Code List](https://www.iso.org/iso-4217-currency-codes.html)

---

## 2. Functional Currency vs Transaction Currency

**What:** Functional currency is the currency a legal entity uses for its financial statements. Transaction currency is the currency used in individual business transactions.

**Why it matters:** A UAE company (functional currency: AED) might sell goods priced in USD (transaction currency). The accounting engine must convert USD transactions to AED for financial reporting using exchange rates.

**How it works:**
```
LegalEntity: Acme UAE LLC
  functionalCurrency: AED           ← financial statements in AED
  Branch: Dubai Store
    currencyCode: null               ← inherits AED from entity
  Branch: Export Division
    currencyCode: USD                ← daily transactions in USD

When Export Division records a $1000 sale:
  Transaction: $1000 USD
  Journal Entry: recorded at AED equivalent (using exchange rate)
  Financial Statement: shows AED amount
```

**Key rule:** Functional currency is immutable after the first journal entry is posted (`functionalCurrencyLockedAt`). This prevents retroactive recalculation of all posted entries.

**Resources:**
- [IAS 21 — The Effects of Changes in Foreign Exchange Rates](https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/)

---

## 3. Banker's Rounding vs Half-Up Rounding

**What:** Two strategies for rounding currency amounts when the digit to be rounded is exactly 5.

**Why it matters:** Over thousands of transactions, rounding bias accumulates. Financial regulations in some jurisdictions require specific rounding modes.

**How it works:**
```
Half-Up (standard):
  2.5 → 3    (always round 5 up)
  3.5 → 4
  4.5 → 5

Banker's Rounding (round-half-to-even):
  2.5 → 2    (round to nearest even)
  3.5 → 4    (round to nearest even)
  4.5 → 4    (round to nearest even)
```

Banker's rounding eliminates systematic upward bias. Over large datasets, it produces a more accurate total because approximately half the "5" digits round up and half round down.

**Resources:**
- [IEEE 754 Rounding Rules](https://en.wikipedia.org/wiki/IEEE_754#Rounding_rules)

---

## 4. Singleton Pattern in Multi-Tenant Databases

**What:** A design pattern where exactly one row exists per tenant for a configuration table, using `tenantId` as the primary key.

**Why it matters:** `CurrencyPolicy` is a singleton — one row per tenant. Using `tenantId` as the PK enforces this at the database level (no unique constraint needed, it's the PK).

**How it works:**
```sql
CREATE TABLE currency_policies (
  tenant_id UUID PRIMARY KEY,  -- PK = exactly one row per tenant
  rounding_mode rounding_mode NOT NULL DEFAULT 'half_up',
  ...
);
```

**Lazy singleton creation:** Instead of requiring a provisioning step, use `upsert` on first access:
```typescript
const policy = await prisma.currencyPolicy.upsert({
  where: { tenantId },
  create: { tenantId },  // creates with defaults if missing
  update: {},             // no-op if exists
});
```

This eliminates the failure mode where a tenant exists but its policy row is missing.

---

## 5. Referential Integrity Without Foreign Keys

**What:** Enforcing data relationships through application-level checks rather than database-level foreign keys.

**Why it matters:** `TenantCurrency` has no FK to `LegalEntity.functionalCurrency` or `Branch.currencyCode` because those are `String` fields, not FK references. The integrity is enforced in the service layer before delete/deactivate operations.

**How it works:**
```typescript
// Before deleting a currency, check all references:
const entityCount = await tx.legalEntity.count({
  where: { tenantId, functionalCurrency: currency.currencyCode },
});
if (entityCount > 0) throw new ConflictException(...);

const branchCount = await tx.branch.count({
  where: { tenantId, currencyCode: currency.currencyCode },
});
if (branchCount > 0) throw new ConflictException(...);
```

**Trade-off:** Database FKs are stronger (can't be bypassed), but they require the referenced column to be a proper FK column type. When the relationship is code-to-code (string matching), application-level checks in a transaction are the pragmatic choice.

**Resources:**
- [Prisma Relations Documentation](https://www.prisma.io/docs/concepts/components/prisma-schema/relations)
