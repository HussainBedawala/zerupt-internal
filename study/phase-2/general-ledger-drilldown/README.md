# General Ledger Drill-Down — Study Topics

## 1. Running Balance Computation in Accounting Reports

A general ledger shows every transaction for a single account with a **running balance** — the cumulative sum after each line. The key formula:

```
running_balance[n] = opening_balance + Σ(debit[i] - credit[i]) for i = 1..n
```

**Opening balance** = sum of all posted debits minus credits for the account *before* the report's start date. This represents the account's state at the beginning of the period.

**Closing balance** = opening + net movement across the entire period (not just the current page).

### Why debit minus credit?

In double-entry accounting, the sign convention is:
- Positive result = debit balance (normal for assets, expenses)
- Negative result = credit balance (normal for liabilities, equity, income)

The `balanceDirection` field tells the UI whether to show "Dr" or "Cr" — the actual interpretation depends on the account's `normalBalance` type.

## 2. Pagination + Running Balance Interaction

The tricky part: page 2's first running balance must account for all lines on page 1. Two approaches:

**Approach A (chosen):** Separate query sums all lines before the current page's offset:
```sql
SELECT SUM(debit - credit) FROM (
  SELECT debit, credit FROM lines
  WHERE ... ORDER BY posting_date, created_at, id
  LIMIT <offset>
) sub
```

**Approach B (alternative):** SQL window function computes running balance across all matching rows, then paginate the result. More elegant but harder to integrate with Drizzle ORM.

**Critical requirement:** Both the main query and the offset subquery MUST use identical `ORDER BY` clauses — including a tiebreaker column (`id`) for deterministic ordering. Otherwise page boundaries shift between queries, producing wrong balances.

## 3. React Key Pattern for State Reset

When a component needs to "reset" its internal state in response to prop changes, React 19 discourages `useEffect` + `setState` (the `react-hooks/set-state-in-effect` rule).

The **recommended pattern**: the parent passes a `key` prop derived from the values that should trigger a reset. When the key changes, React unmounts the old instance and mounts a fresh one with clean initial state.

```tsx
// Parent
<GeneralLedgerPanel key={`${accountId}-${fromDate}-${toDate}`} ... />

// Child — just uses useState(initialProp) normally
const [fromDate, setFromDate] = useState(initialFromDate);
```

Reference: [react.dev — Resetting state with a key](https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes)

## 4. Tenant Isolation Defense-in-Depth

Even though each tenant has their own database, every financial query should filter by `tenantId` on **both** the parent table (journal_entries) and the child table (journal_entry_lines). This prevents data leaks if:
- A UUID collision occurs across tenants
- The multi-tenant architecture is later consolidated into a shared DB
- A bug in the tenant resolver middleware passes the wrong connection

The principle: **never rely on a single layer of isolation**.

## 5. Bidi Text Isolation in Mixed-Script UIs

In bilingual (Arabic/English) UIs, user-generated text with unknown direction can corrupt surrounding layout through Unicode bidi algorithm bleed-through. The fix: wrap user content with **First-Strong Isolate** (U+2068) and **Pop Directional Isolate** (U+2069) characters.

Zerupt's `isolateText()` utility handles this. Always use it for:
- Journal entry descriptions
- Account names entered by users
- Any text field where the direction is unknown at render time
