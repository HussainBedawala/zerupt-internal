# Chart of Accounts CRUD API

Study topics from DEV-51: Implement COA CRUD API with validation rules.

## Topics

### 1. Hierarchical Data in Relational Databases
- **Adjacency list model**: each row stores `parentAccountId` — simple writes, recursive reads
- **Depth column optimization**: precomputed `depth` avoids recursive queries for depth checks (O(1) vs O(n))
- **Recursive CTEs**: `WITH RECURSIVE` for ancestor/descendant traversal (circular reference detection, subtree depth calculation, depth cascade updates)
- **Trade-off**: denormalized depth must be kept in sync on re-parenting (cascading UPDATE via CTE)

### 2. TOCTOU (Time-of-Check-Time-of-Use) Race Conditions
- **Problem**: validating parent outside a transaction means another request could modify the parent between check and write
- **Solution**: move validation inside the transaction + `SELECT ... FOR UPDATE` to lock the parent row
- **Key insight**: any validation that depends on state that could change concurrently must happen inside the transaction boundary
- **PostgreSQL row locks**: `FOR UPDATE` blocks other transactions from modifying or locking the same row until commit

### 3. Type-Safe Template Seeding
- **Topological insertion**: group by depth level, insert depth-0 first, then depth-1, etc. — guarantees FK parent exists
- **Idempotent seeding**: check existing codes before insert, skip duplicates, return `{ created, skipped }`
- **Code-to-ID resolution**: maintain a `Map<code, id>` during insertion for parent FK resolution
- **Country overlays**: base template + additive overlays (tax accounts vary by jurisdiction)

### 4. Immutable Update Patterns in TypeScript
- **Mutation anti-pattern**: `const obj = {}; obj.field = value;` — hidden side effects, harder to debug
- **Spread pattern**: `const obj = { ...(condition && { field: value }), ...otherFields }` — creates new object
- **Conditional spreads**: `...(x !== undefined && { x })` only includes the key when the value is present
- **Why it matters**: immutable patterns prevent bugs where shared references are accidentally modified

### 5. Tenant Isolation in Multi-Tenant Systems
- **Defense in depth**: every query MUST include `tenantId` (and often `legalEntityId`) — even when the DB schema has unique constraints
- **Common miss**: child count queries, parent fetches, and cascading updates often forget the tenant filter
- **Review technique**: grep every `db.query` / `db.select` / `db.update` / `db.delete` call and verify tenant scoping

### 6. Accounting Domain: Chart of Accounts Design
- **Type → SubType hierarchy**: asset/liability/equity/revenue/expense → specific sub-types (current_asset, fixed_asset, etc.)
- **Normal balance**: derived from type + contra flag — debit types have debit normal balance, contra reverses it
- **System accounts**: immutable accounts required by the engine (e.g., Retained Earnings, Trade Receivables control)
- **Control accounts**: only the engine can post to them (AR/AP sub-ledger integration)
- **Header accounts**: grouping nodes that cannot receive journal entries directly
