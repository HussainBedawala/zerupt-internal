# Exchange Rate Management UI — Study Topics

## 1. Immutable Financial Records

Exchange rates, once recorded, must never be edited or deleted. Journal entries reference specific rates at specific dates — modifying a historical rate would retroactively change the value of every transaction that used it.

**Key principle:** In accounting systems, immutability is not a nice-to-have — it's an audit requirement. The UI enforces this by offering create-only operations with no edit or delete actions.

**Related concepts:** Audit trails, append-only ledgers, event sourcing in financial systems.

## 2. Decimal Arithmetic for Money

Floating-point numbers (`parseFloat`, `Number`) cannot represent all decimal values exactly. `0.1 + 0.2 !== 0.3` in IEEE 754. For exchange rates with up to 10 decimal places, even tiny rounding errors compound across thousands of transactions.

**Solution:** Libraries like `decimal.js` or `big.js` use string-based arbitrary-precision arithmetic. They're slower than native floats but mathematically exact.

**When to use:** Any calculation involving money, tax, exchange rates, or financial reporting. Use native numbers only for display-layer operations (chart rendering, UI layout).

## 3. Policy-Aware Validation with Dynamic Schemas

Static validation schemas can't express business rules that vary by tenant configuration. A dynamic schema factory takes policy parameters (e.g., `allowBackdatedRate`) and returns a tailored Zod schema.

```
createSchema(policy) → z.object({...}).refine(policy-specific rules)
```

**Benefits:** Validation logic lives in one place, policies are injected not hardcoded, and the same schema works for both form validation and API payload validation.

**Pattern:** Schema factories are common in multi-tenant SaaS where each tenant may have different business rules.

## 4. Translating Validation Messages (Sentinel Pattern)

Zod validation messages are strings, but i18n requires translation keys. The sentinel pattern uses fixed marker strings (`"required"`, `"mustBePositive"`) as Zod messages, then maps them to i18n keys at render time via a lookup record.

```
Zod error.message → VALIDATION_MESSAGES[message] → t(translationKey)
```

**Why not translate in the schema?** Schemas are created once (or per-policy), but the active locale can change. Deferring translation to render time keeps schemas locale-independent.

## 5. Server-Side Pagination with Optimistic UI

`keepPreviousData` (TanStack Query) shows the previous page's data while the next page loads, preventing layout shift. The server controls pagination — the client never holds all records in memory.

**Trade-off:** Client-side filtering/sorting is instant but doesn't scale. Server-side pagination scales to millions of rows but adds network latency. `keepPreviousData` bridges the UX gap.

## 6. Rate Types and Their Business Rules

| Type | Purpose | Future dates? |
|------|---------|---------------|
| Spot | Current market rate | No |
| Closing | End-of-day rate for revaluation | No |
| Average | Period average for P&L translation | No |
| Contract | Locked rate for hedging/agreements | Yes (only type allowed) |

Contract rates are the only type that may have future effective dates — they represent agreed-upon rates for future transactions.
