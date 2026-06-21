# 05 — Hierarchy, Headers, and Leaves

## Why a flat list isn't enough

You could have a COA that's just a list of 150 accounts. No grouping, no structure. But
then your reports would be 150-line dumps and impossible to read. A retailer looking at
their finances needs to see sections: Current Assets in one block, Non-Current Assets in
another, Cost of Sales vs Operating Expenses separated, etc.

The **account hierarchy** — a parent/child tree structure — provides that grouping. It
also enables *roll-up balances*: the balance of a parent is the sum of all its children.
"Total Current Assets" isn't stored anywhere; it's always calculated by summing its leaf
descendants.

## Headers and leaves

Every account is one of two structural kinds:

**Header accounts** (also called parent or summary accounts):
- Exist solely to group and label a section of the COA.
- They have children (other accounts underneath them).
- They **cannot receive journal entry postings** — you never post directly to a header.
- Their "balance" is purely derived: sum of all descendants.
- Example: `1100 Current Assets`, `5000 Cost of Sales`, `6000 Operating Expenses`.

**Leaf accounts** (also called detail or postable accounts):
- Have no children.
- **All journal entries post to leaf accounts.** Only leaves.
- Their balance is the sum of all journal lines posted to them.
- Example: `1111 Petty Cash`, `1131 Trade Receivables`, `4110 Product Sales`.

```
  1000  Assets                [HEADER — cannot post here]
    1100  Current Assets      [HEADER — cannot post here]
      1111  Petty Cash        [LEAF — post here ✓]
      1112  Cash Register     [LEAF — post here ✓]
    1200  Non-Current Assets  [HEADER — cannot post here]
      1211  Equipment         [LEAF — post here ✓]
```

If you tried to post a journal line to `1000 Assets`, you would be saying "I'm adding
money to *all assets simultaneously in an unspecified way*." That's meaningless. You must
always be specific: which account, exactly.

Zerupt enforces this with the `isHeader` flag. The posting engine checks it on every
draft manual entry (and the auto-path also has the flag available for validation).

## The roll-up

The value of the hierarchy is roll-up reporting. When the Balance Sheet renders "Total
Current Assets", it recursively sums all leaf descendants of `1100 Current Assets`:

```
  1100  Current Assets
    1111  Petty Cash                2,500
    1112  Cash Register             8,000
    1131  Trade Receivables        45,000
    1141  Merchandise Inventory   120,000
    1162  Input VAT Recoverable     3,200
  ──────────────────────────────────────
  Total Current Assets            178,700
```

That total is never stored — it's computed on demand from the leaf balances. This means:
- Adding a new leaf under Current Assets automatically includes it in the total.
- Moving a leaf to a different parent moves its contribution with it.
- The report is always correct as long as the hierarchy is correct.

## The rules of the hierarchy

### 1. Parent/child must share the same account type

You cannot put a liability account as a child of an asset header. The type consistency
rule is enforced in the service layer (and described in the schema comment):

```
  ✓  Asset parent → Asset child
  ✗  Asset parent → Liability child  ← rejected
```

This matters because the roll-up of a header derives its balance across all descendants.
A mixed-type roll-up would sum apples and oranges into a meaningless total.

### 2. No cycles

The hierarchy must be a tree, not a network. Account A cannot be an ancestor of account B
if B is also an ancestor of A. A cycle would make roll-up calculation infinite.

Cycles are prevented by the design (the parent reference is a UUID foreign key to the
same table with `onDelete: restrict`), and the application must validate that the target
parent is not itself a descendant of the account being re-parented.

### 3. Max depth

Zerupt enforces a maximum depth of 5 (0 = root, 4 = deepest leaf for the seeded template,
5 as the absolute limit). Deeper trees are operationally unwieldy. The `depth` column is
denormalized for performance — stored, not calculated on every query — and the DB enforces
`depth >= 0 AND depth <= 5`.

### 4. Root accounts have no parent

Top-level headers (`1000 Assets`, `2000 Liabilities`, `3000 Equity`, `4000 Income`,
`5000 Cost of Sales`, etc.) have `parentAccountId = null`. They are the roots of their
respective subtrees.

## Account codes and numbering conventions

Account **codes** (like `1131`, `4110`) are human-readable identifiers that:
- Encode the account type by first digit: `1xxx` = assets, `2xxx` = liabilities,
  `3xxx` = equity, `4xxx` = income, `5xxx–9xxx` = expenses.
- Encode the depth by digit count (roughly): `1000` = depth 0, `1100` = depth 1,
  `1110` = depth 2, `1111` = depth 3.
- Are unique per legal entity within a tenant. The DB enforces this with a unique
  constraint on `(tenantId, legalEntityId, code)`.
- Dot notation is allowed for sub-accounts: `1162.01` (India CGST input tax),
  `1162.10` (GCC reverse-charge VAT), keeping the parent code's namespace.

**The code is a human convenience, not the source of truth.** The database ID (UUID) is
the real identifier. The code can theoretically be renamed (though usually locked on system
accounts). The *type* column is what drives behavior — not the first digit of the code.

When the engine resolves "give me the COGS account", it does NOT do `code LIKE '5%'`. It
looks up the `cogs` system role binding. Codes only exist for humans to read.

## The `isHeader` flag and why it exists separately from "has children"

You might think: "Why store `isHeader`? Just check if the account has children."

Two reasons:

1. **Performance.** A query to "check if this account has children" requires a join or
   subquery. The `isHeader` flag is a column on the account itself — a constant-time read.
2. **Intent vs. state.** An account *intended* to be a header should behave as a header
   even before it has any children. Marking it up-front locks its role.

The trade-off is that `isHeader` must be kept consistent when children are added or removed,
which the application handles.

## The mental model

> The hierarchy is a tree of headers (summary, non-postable) and leaves (detail, postable).
> Every journal entry posts to a leaf. Headers exist only to group children for roll-up
> reporting. The tree must be type-consistent (parent type = child type), acyclic, and
> bounded in depth. Account codes are human labels — the UUID and the `type` column are
> what the system actually uses.

Next: `06-system-accounts-and-roles.md`.
