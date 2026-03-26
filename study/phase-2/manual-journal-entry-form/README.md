# Manual Journal Entry Form

## Concepts

### Draft-to-Posted Workflow
Manual journal entries follow a two-phase lifecycle: **draft** (mutable, no entry number) and **posted** (immutable, numbered). This separation allows accountants to work on entries across sessions without committing to the ledger. Entry numbers are assigned at posting time — not at creation — to guarantee gap-free sequential numbering. Abandoned drafts don't consume numbers.

### Double-Entry Enforcement Layers
Balance validation (debits = credits) is enforced at three layers:
1. **Client-side** — real-time balance indicator using exact string comparison (not floating-point tolerance)
2. **Server-side** — `postDraft` re-sums from actual line data using `Decimal.js` with banker's rounding (ROUND_HALF_EVEN, precision 28)
3. **Database** — CHECK constraint on the journal_entries table ensures `total_debit = total_credit`

The critical insight: never trust denormalized header totals for the posting decision. Always re-sum from the source of truth (lines) before committing.

### Race-Safe Posting with SELECT FOR UPDATE
When two users try to post the same draft simultaneously, `SELECT ... FOR UPDATE` obtains a row-level lock inside the transaction. The second request blocks until the first commits, then finds `status != 'draft'` and throws a ConflictException. This pattern (pessimistic locking + optimistic WHERE guard) is used consistently across posting, reversal, and draft services.

### Debit/Credit XOR on Journal Lines
A single line cannot have both a debit and credit amount. This is enforced via:
- **Zod refinement** on the DTO (server rejects at validation layer)
- **Client-side UX** — entering a debit value auto-clears the credit field and vice versa
- **DB CHECK constraint** on journal_entry_lines

### Defense-in-Depth for Multi-Tenant Isolation
Every DELETE and SELECT query includes `tenantId` even when a prior ownership check already confirmed the tenant. This redundancy protects against:
- Future refactors that accidentally remove or bypass the pre-check
- Bugs in the pre-check logic
- Defense against theoretical SQL injection that bypasses the service layer

### Auto-Save with Race Condition Prevention
The form auto-saves on blur with a 2-second debounce. Key challenges solved:
- **Race with manual save**: Cancel pending auto-save timer before every manual save/post
- **Stale closure over draftId**: Use a `useRef` that stays in sync with state for synchronous access in async callbacks
- **Concurrent save guard**: A `isSavingRef` prevents overlapping save operations

### Financial Precision: String Arithmetic
Financial amounts are stored and compared as strings (e.g., "500.000000") to avoid IEEE 754 floating-point representation errors. The backend uses `Decimal.js` for all arithmetic. The frontend uses `toFixed(6)` string comparison for balance checks — matching the server's precision exactly. Never use `parseFloat` comparison for financial equality checks.

## Key Patterns Learned
- Gap-free numbering: reserve number → transaction → commit reservation (release on failure)
- Fiscal period validation: soft lock (warn + require reason), hard lock (block), backdated past lock (block)
- React Hook Form `useFieldArray` + `useWatch` for dynamic editable tables with real-time calculations
- Account picker typeahead: debounced search, keyboard navigation, filtered by entity/active/non-header
