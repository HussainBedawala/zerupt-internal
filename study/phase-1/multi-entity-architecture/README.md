# Multi-Entity Architecture — DEV-195, DEV-197, DEV-198

## 1. Partial Unique Indexes in PostgreSQL

**What:** A unique index that only enforces uniqueness for rows matching a `WHERE` predicate.

**Why it matters:** Zerupt uses this to guarantee exactly one default legal entity per tenant. A regular unique index on `(tenant_id, is_default)` would prevent having multiple non-default entities. The partial index only constrains rows where `is_default = true`.

**How it works:**
```sql
CREATE UNIQUE INDEX legal_entities_one_default_per_tenant
  ON legal_entities (tenant_id)
  WHERE (is_default = true);
```
- PostgreSQL only indexes rows where the predicate is true
- Two rows with `is_default = false` for the same tenant: allowed
- Two rows with `is_default = true` for the same tenant: rejected
- Swapping the default requires clearing the old one first (within a transaction)

**Prisma syntax:**
```prisma
@@unique([tenantId], where: raw("\"is_default\" = true"))
```
Requires `previewFeatures = ["partialIndexes"]` in the generator block.

**Resources:**
- [PostgreSQL Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Prisma Partial Indexes](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes#partial-indexes)

## 2. Data Migration with Non-Nullable FK Addition

**What:** Adding a required (NOT NULL) foreign key column to an existing table that already has rows.

**Why it matters:** If you add a NOT NULL column without a default, the migration fails on any table with existing data. This pattern comes up every time you introduce a new parent entity (like LegalEntity) that existing children (branches) must reference.

**How it works:**
```sql
-- Step 1: Add column as NULLABLE
ALTER TABLE branches ADD COLUMN legal_entity_id UUID;

-- Step 2: Backfill from known data
UPDATE branches b
SET legal_entity_id = le.id
FROM legal_entities le
WHERE le.tenant_id = b.tenant_id AND le.is_default = true;

-- Step 3: Now enforce NOT NULL
ALTER TABLE branches ALTER COLUMN legal_entity_id SET NOT NULL;

-- Step 4: Add FK constraint
ALTER TABLE branches ADD CONSTRAINT branches_legal_entity_id_fkey
  FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id)
  ON DELETE RESTRICT;
```

**Key insight:** Prisma generates the column as NOT NULL in one step. You must use `--create-only` to generate the migration, then hand-edit the SQL to split it into the 4-step pattern above.

**Resources:**
- [Prisma Migrate: Customizing Migrations](https://www.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)

## 3. CHECK Constraints for Domain Validation

**What:** Database-level constraints that validate column values beyond type/length (e.g., regex patterns, non-empty strings).

**Why it matters:** Application-level validation can be bypassed (direct DB access, migrations, seeds). CHECK constraints are defense-in-depth — they guarantee data integrity regardless of how data enters the database.

**How it works:**
```sql
ALTER TABLE legal_entities
  ADD CONSTRAINT legal_entities_code_format
    CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
  ADD CONSTRAINT legal_entities_country_code_format
    CHECK (country_code ~ '^[A-Z]{2}$');
```

**Key insight:** Prisma doesn't generate CHECK constraints — you must add them manually in the migration SQL. They survive schema changes as long as you don't drop/recreate the table.

**Resources:**
- [PostgreSQL CHECK Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS)

## 4. Immutability Patterns in Financial Systems

**What:** Certain fields become immutable after a business event (e.g., first posted journal entry), not at creation time.

**Why it matters:** In Zerupt, `functionalCurrency` and `countryCode` on a legal entity can be changed freely during setup. But once the accounting engine posts the first journal entry, these fields lock permanently — changing them would invalidate all posted financial data.

**How it works:**
- `functionalCurrencyLockedAt` is `NULL` initially
- Accounting engine sets it to `NOW()` when posting the first JE
- Settings module checks: if `functionalCurrencyLockedAt IS NOT NULL`, reject updates to `functionalCurrency` and `countryCode`
- The lock is a timestamp (not a boolean) for audit trail — you know exactly when it locked

**Pattern name:** "Soft immutability" or "event-driven field locking" — the field is mutable until a domain event makes it immutable.

## 5. Shadow Database in Prisma Migrate

**What:** A temporary database that Prisma uses to validate that all migrations can replay from scratch.

**Why it matters:** Without a shadow DB, `prisma migrate dev` tries to auto-create one (needs DB superuser privileges) or fails. In Docker-based dev setups, you should pre-create it.

**How it works:**
- Prisma drops the shadow DB, recreates it, replays all migrations in order
- If any migration fails on the shadow DB, Prisma reports the error before touching your real DB
- Configured via `shadowDatabaseUrl` in `prisma.config.ts` or `SHADOW_DATABASE_URL` env var

**Resources:**
- [Prisma Shadow Database](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database)

## 6. Intl.DisplayNames for Locale-Aware Display

**What:** A built-in browser API that provides translated display names for regions, languages, currencies, and scripts.

**Why it matters:** Zerupt's legal entity UI needs to show country names in the user's locale (e.g., "الإمارات العربية المتحدة" in Arabic, "United Arab Emirates" in English) without bundling a translation database. `Intl.DisplayNames` ships with the runtime — zero bytes added to the bundle.

**How it works:**
```ts
const dn = new Intl.DisplayNames(["ar"], { type: "region" });
dn.of("AE"); // "الإمارات العربية المتحدة"

const dnEn = new Intl.DisplayNames(["en"], { type: "region" });
dnEn.of("AE"); // "United Arab Emirates"
```

**Key concepts:**
- `type: "region"` for countries (ISO 3166-1), `"currency"` for currencies (ISO 4217), `"language"` for languages
- First argument is a locale array — falls back down the list if the first locale isn't available
- Cache instances per locale to avoid re-creation on every render
- Works in all modern browsers and Node.js 12+

**Resources:**
- [MDN Intl.DisplayNames](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames)

## 7. Emoji Flags from ISO Country Codes

**What:** Converting ISO 3166-1 alpha-2 country codes to emoji flags using Unicode Regional Indicator Symbols.

**Why it matters:** Showing a flag emoji next to country names gives instant visual recognition without loading image assets. Works everywhere emoji renders — no flag sprite sheets needed.

**How it works:**
```ts
function getCountryFlag(code: string): string {
  const codePoints = [...code.toUpperCase()].map(
    (char) => 0x1F1E6 + char.charCodeAt(0) - 65
  );
  return String.fromCodePoint(...codePoints);
}
getCountryFlag("AE"); // 🇦🇪
```

**Key concept:** Each letter A-Z maps to a Regional Indicator Symbol (U+1F1E6 to U+1F1FF). Two consecutive regional indicators render as a flag emoji. "A" = U+1F1E6, "E" = U+1F1EA → 🇦🇪.

**Caveat:** Windows renders some flags as two-letter codes instead of flag images. This is a Windows limitation, not a code bug.

## 8. Combobox Accessibility (ARIA Roles)

**What:** The ARIA pattern for a searchable dropdown (combobox) — combining a text input with a filterable list.

**Why it matters:** Custom dropdown pickers (country, currency) must be keyboard-navigable and announce state changes to screen readers. Without proper ARIA roles, the picker is invisible to assistive technology.

**Key roles and attributes:**
```html
<input
  role="combobox"
  aria-expanded="true"        <!-- list is visible -->
  aria-controls="listbox-id"  <!-- points to the list -->
  aria-autocomplete="list"    <!-- typing filters the list -->
/>
<div id="listbox-id" role="listbox">
  <button role="option" aria-selected="true">UAE</button>
  <button role="option" aria-selected="false">Saudi Arabia</button>
</div>
```

**Also important:**
- `aria-invalid` + `aria-describedby` on inputs with validation errors — screen readers announce the error message
- `aria-label` on icon-only buttons and indicators (like the lock icon)

**Resources:**
- [WAI-ARIA Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)

## 9. Separate Mutation Instances in TanStack Query

**What:** Using multiple instances of the same `useMutation` hook to track independent operations separately.

**Why it matters:** When a single component triggers multiple types of mutations (edit, deactivate, reactivate), sharing one `useMutation` instance means `isPending` is `true` for ALL actions when ANY action is in-flight. This produces wrong loading states — e.g., showing "Deactivating..." when an edit is saving.

**How it works:**
```tsx
// BAD: shared mutation — isPending is ambiguous
const updateMutation = useUpdateMutation();

// GOOD: separate instances — each tracks its own state
const editMutation = useUpdateMutation();
const deactivateMutation = useUpdateMutation();
const reactivateMutation = useUpdateMutation();
```

Each instance has its own `isPending`, `isError`, `isSuccess` state. They all share the same `mutationFn` and invalidation logic (defined in the hook), but their lifecycle is independent.

**Resources:**
- [TanStack Query Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations)

## 10. TOCTOU Race Conditions in Check-Then-Act Patterns

**What:** Time-of-check to time-of-use (TOCTOU) — a class of race condition where the state checked in one query changes before the dependent write executes.

**Why it matters:** In DEV-198, the branch service validates that a legal entity is active, then creates a branch referencing it. Without a transaction, a concurrent request could deactivate the entity between those two queries, violating the business rule.

**How it works / Key concepts:**

```typescript
// TOCTOU vulnerable: two separate round trips
const entity = await prisma.legalEntity.findFirst({ where: { id, tenantId } });
if (!entity.isActive) throw new ConflictException("...");
await prisma.branch.create({ data: { legalEntityId: id, ... } });

// Fixed: atomic transaction
await prisma.$transaction(async (tx) => {
  const entity = await tx.legalEntity.findFirst({ where: { id, tenantId } });
  if (!entity.isActive) throw new ConflictException("...");
  return tx.branch.create({ data: { legalEntityId: id, ... } });
});
```

**When transactions are overkill:** If the database can enforce the invariant via a CHECK constraint or FK, prefer that — it's simpler and performs better. Use application-level transactions only when the invariant involves cross-table logic (like checking `isActive` on a related record).

**Resources:**
- [TOCTOU (Wikipedia)](https://en.wikipedia.org/wiki/Time-of-check_to_time-of-use)
- [Prisma Interactive Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions#interactive-transactions)

## 11. Zod `.refine()` Gotcha with Optional Fields

**What:** A subtle bug in Zod's `.refine()` when checking if "at least one field" is present in a PATCH schema where all fields are `.optional()`.

**Why it matters:** The naive guard `Object.keys(v).length > 0` passes when a client sends `{ "name": undefined }` — Zod retains the key with an `undefined` value. This allows no-op PATCH requests that write empty `data: {}` to the database.

**How it works:**

```typescript
// BUG: Object.keys({ name: undefined }) returns ["name"] → length is 1
.refine((v) => Object.keys(v).length > 0, { message: "..." });

// FIX: Check for at least one defined value
.refine(
  (v) => Object.values(v).some((val) => val !== undefined),
  { message: "At least one field must be provided" }
);
```

**Resources:**
- [Zod Refinements](https://zod.dev/?id=refine)

## 12. Multi-Currency Strategy in ERP Design

**What:** The distinction between functional, transaction, and presentation currencies — and when to validate currency assignments in an ERP.

**Why it matters:** Zerupt targets multi-currency markets (UAE free zones transacting in USD under AED entities, tourism retailers accepting EUR/GBP). Enforcing strict currency matching too early blocks legitimate use cases. The right time for currency validation is when the accounting engine introduces exchange rate tables.

**Key concepts:**
- **Functional currency:** Financial reporting currency, tied to the legal entity's primary economic environment (IAS 21)
- **Transaction currency:** The currency of a specific business document (invoice, PO, payment)
- **Branch default currency:** Optional override — when null, inherits entity's functional currency
- **Validation strategy:** Format-only validation (ISO 4217) at the API boundary; business-level compatibility deferred to the accounting module

**Resources:**
- [IAS 21 — Effects of Changes in Foreign Exchange Rates](https://www.ifrs.org/issued-standards/list-of-standards/ias-21-the-effects-of-changes-in-foreign-exchange-rates/)
