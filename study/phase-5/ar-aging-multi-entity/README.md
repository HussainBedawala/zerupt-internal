# AR Aging Multi-Entity Scoping via Branch Join (DEV-341)

**Phase:** 5 — Onboarding & Core Accounting
**Topic:** How legal entity boundaries propagate into AR aging reports through the branch join

---

## 1. Why Legal Entity Scoping Matters for AR Aging

In single-entity retail, AR aging is straightforward: who owes what, and how old is the debt. In multi-entity retail, the question has a mandatory prefix — *which legal entity is owed?*

Three forces make this non-negotiable:

**Collections accountability.** A collections team operating under Entity A has no authority to pursue receivables booked under Entity B. Mixing entities in one aging report would show the team a number they cannot act on, eroding trust in the report.

**Audit and statutory compliance.** Each legal entity files its own financial statements and is subject to its own tax jurisdiction. Regulators expect receivables to be traceable to a single entity. A report that leaks cross-entity balances is an audit finding, not a rounding error.

**Inter-company elimination.** When Entity A sells to Entity B within the same tenant, that receivable must appear in Entity A's aging but be eliminated in consolidated statements. Correct scoping is the precondition for elimination — you cannot eliminate what you cannot isolate.

---

## 2. The Org Hierarchy and Why Branch Is the Right Join Point

The Zerupt data model forms a strict containment hierarchy:

```
tenant → legal entities → branches → invoices
```

Each level is a progressively narrower scope:

- **Tenant** is the top-level isolation boundary — all data for a merchant group lives under one tenant.
- **Legal entity** is the statutory boundary — a registered company, VAT number, trade license.
- **Branch** is the operational boundary — a physical store or warehouse.
- **Invoice** is the transactional leaf — a specific sale to a specific customer.

Invoices are created at the branch level. A branch belongs to exactly one legal entity (NOT NULL FK). Therefore, the legal entity of any invoice is *derivable* from its branch — you do not need to write `legal_entity_id` onto every invoice row; you need only join through the branch.

This makes the branch the natural join point. It is the lowest level in the hierarchy that carries legal entity membership, and it sits exactly one hop above the invoice. Joining through branch to filter by legal entity is a single join — cheap, correct, and semantically meaningful.

---

## 3. Trade-Offs: Query-Time Join vs. Denormalization

These are two valid designs with different cost profiles.

### Query-time join

At query time, the AR aging query joins invoices → branches → legal entities to apply the `legal_entity_id` filter.

**Correct when:**
- Legal entity filters are sparse — not every report needs entity scoping.
- The schema is still stabilizing — denormalizing prematurely locks in a decision that is expensive to undo.
- The join is indexed — a FK join on a B-tree index is fast enough for interactive reporting at retail invoice volumes (tens of thousands, not billions).
- Migration simplicity matters — adding a column to invoices requires a backfill; adding a join requires none.

### Denormalization (writing `legal_entity_id` onto every invoice)

Copy `legal_entity_id` from the branch into the invoice row at insert time.

**Correct when:**
- Legal entity is a *high-frequency* filter — nearly every query includes it, and the join cost compounds across many concurrent users.
- Aggregations span millions of rows — at that scale, eliminating one join per row is meaningful.
- The hierarchy is stable — legal entity membership of a branch rarely changes, so the denormalized value stays accurate without complex update cascades.

**The Zerupt call (DEV-341):** Join-time is the right choice at current scale. Branch volumes are small, the FK is indexed, and the migration surface stays minimal. Denormalization is the right *future* move if the analytics layer graduates to a columnar store where denormalization is standard practice anyway.

---

## 4. The Inner Join Safety Guarantee

The branch FK on invoices is NOT NULL. This is a correctness guarantee, not a convention.

An INNER JOIN between invoices and branches will never silently drop a row — there is no invoice without a branch, and there is no branch that fails to resolve. Every invoice maps to exactly one branch, every branch maps to exactly one legal entity.

This matters for financial reports. A LEFT JOIN would be appropriate if rows could legitimately lack a branch (e.g., draft invoices, system-generated adjustments). For posted AR invoices in Zerupt, a missing branch is a data integrity violation, not a valid state. Using INNER JOIN encodes that assumption in the query — if it ever returns fewer rows than expected, the discrepancy surfaces immediately rather than hiding as a NULL in an aggregation.

The practical rule: use INNER JOIN when the FK is NOT NULL and the absence of a match is a bug. Use LEFT JOIN when absence is a valid state your report must represent.

---

## 5. Additive Filtering: Layered Isolation Pattern

Every AR aging query carries `tenant_id` unconditionally. This is the outermost isolation layer — it is structurally enforced by the multi-tenant architecture and never optional.

`legal_entity_id` is additive on top of that. When present, it narrows the result to a single entity's receivables. When absent, the result spans all entities within the tenant — the correct view for a group-level controller.

This is the layered isolation pattern:

```
tenant_id (always)
  └─ legal_entity_id (when entity-scoped)
       └─ branch_id (when branch-scoped)
```

Each layer is additive, never substitutive. You cannot skip tenant scoping and filter only by legal entity — that would be incorrect in a multi-tenant system. You can skip entity scoping and see all entities within the tenant — that is a valid, intentional query.

The pattern generalizes: whenever a new dimension (branch, warehouse, cost center) needs to filter AR aging, it slots in as an additive layer below entity, never as a replacement for any outer layer. The outermost layer is always the hardest boundary.

---

## Key Concepts

| Concept | Principle |
|---|---|
| Branch as join point | Lowest level carrying legal entity membership; one hop above invoice |
| Join vs. denormalize | Join = migration simplicity + correct for sparse filters; denormalize = correct for high-frequency cross-entity aggregations at scale |
| INNER JOIN guarantee | NOT NULL FK → no silent row drops; absence = data bug, not valid state |
| Layered isolation | `tenant_id` always present; `legal_entity_id` is additive, never substitutive |
| Entity scoping purpose | Collections authority, audit traceability, inter-company elimination |
