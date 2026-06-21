# 07 — Account Lifecycle and Integrity

## The four stages of an account's life

Every account in the COA goes through a lifecycle:

```
  ┌─────────┐     activate      ┌────────┐     deactivate     ┌──────────────┐
  │ Created  │ ───────────────► │ Active │ ─────────────────► │ Deactivated  │
  └─────────┘                   └────────┘                     └──────────────┘
                                     │                                │
                                     │ (no transactions)              │ (can reactivate)
                                     ▼                                │
                               ┌──────────┐                          │
                               │ Deleted  │ ◄────────────────────────┘
                               │ (only if │   (only if still
                               │ unused)  │    no transactions)
                               └──────────┘
```

### Create

An account is created with a code, name, type, sub-type, normal balance, parent,
`isHeader`, `isContra`, and other flags. Creation enforces:
- The (type, sub-type) pair is valid.
- The normal balance is consistent with type (unless `isContra = true`).
- The code is unique per legal entity within the tenant.
- The parent account has the same type (if a parent is specified).
- The depth is ≤ 5.

All of these are enforced by DB constraints *and* the service layer. Two independent
guards — the DB is the last line of defense.

### Active

The normal operating state. The account appears in dropdowns, pickers, and reports.
Journal entries can be posted to it (if it's a leaf, and not a control account for
manual entries).

### Deactivated

When an account is no longer needed for new transactions, it can be **deactivated**
(`isActive = false`, `deactivatedAt = now()`). A deactivated account:
- No longer appears in dropdowns or account pickers (so no new transactions can target it).
- Still appears in **historical reports** — its past postings remain visible.
- Can be **reactivated** if needed.

Deactivation is the graceful way to "retire" an account without destroying history.

### Deleted (hard delete)

Hard deletion is only permitted if the account has **never had any transaction posted to
it**. If there are journal lines referencing the account, deletion is rejected. The error
is clear: "Cannot delete an account with existing postings."

This rule is critical. Deleting an account that has postings would leave orphaned journal
lines referencing a non-existent account ID. Reports would break. History would be
corrupted.

The DB enforces this via the foreign key from `journalEntryLines.accountId → accounts.id`
with `onDelete: restrict` — the database will refuse to delete an account that is still
referenced by any journal line.

### Never hard-delete a used account

This is the most important rule in account lifecycle management. Once a transaction has
touched an account, that account is permanent in the data model (you can only deactivate
it). If you find yourself wanting to delete a used account, the right move is:

1. Deactivate it (hide from new use).
2. If you need to "merge" it into another account, create a manual correcting journal
   entry to move the balance to the correct account.
3. Leave the original account visible in history.

## Code uniqueness per legal entity

An account code must be **unique per legal entity** within a tenant. The constraint is:

```
  UNIQUE (tenantId, legalEntityId, code)
```

This means the same code can exist in two different legal entities of the same tenant
(e.g., entity A and entity B both have a `1111 Petty Cash`). But within a single entity,
you can't have two accounts with the same code.

This allows multi-entity businesses to run separate, independently-coded COAs per entity
— standard practice when each entity files its own accounts.

## What "multi-entity" means for the COA

Zerupt's tenants can have **multiple legal entities** (e.g., a holding company with
separate entities for retail vs. logistics). Each entity has its own COA instance, seeded
from the same template but independently editable:

- The same account code (`1131`) can exist in entity A and entity B, pointing at
  different UUID accounts.
- The system role bindings are per-entity: the `trade_receivables` role binds to
  entity A's `1131` account and separately to entity B's `1131` account.
- Journal entries always carry a `legalEntityId` so the right COA is used.
- Cross-entity consolidation is a Layer 4+ concern.

There is no cross-entity FK on accounts. Accounts in entity A cannot reference accounts
in entity B.

## Why you can't change the type of an existing account

If an account has been used in journal entries with type `asset`, and you change its type
to `liability`, every historical entry that posted to it would retroactively be
"wrong" — the report that showed it as an asset would now show it as a liability. The
books would not tell the truth about what happened.

For system accounts (`isSystemAccount = true`), type changes are rejected outright by the
service layer. For user accounts, type changes should only be allowed if no transactions
have been posted. In practice, this is rare enough that the safest default is: once typed
and used, the type is permanent. If you made a mistake, deactivate the wrong account,
create a correct new one, and post a correcting journal to move the balance.

## The integrity rules, summarized

| Rule | Where enforced | What it prevents |
|------|---------------|-----------------|
| Cannot delete an account with journal lines | DB FK `restrict` | Orphaned ledger history |
| Code unique per entity | DB unique constraint | Ambiguous resolution by code |
| Depth ≤ 5 | DB check constraint | Runaway hierarchies |
| Type ↔ sub-type valid | DB check constraint | Nonsensical classifications |
| Normal balance consistent with type (non-contra) | DB check constraint | Silent mis-postings |
| Cannot delete parent with children | DB FK `restrict` on `parentAccountId` | Dangling references |
| Control account cannot be deactivated | Service layer | Engine posting failures |
| System account type/code locked | Service layer | Seeded COA corruption |

## The mental model

> Account lifecycle is a one-way gate: create → activate → deactivate. Hard deletion only
> works before any transactions exist. Once transactions exist, the account is permanent
> in the data model — only deactivation is possible. Every integrity rule exists because
> breaking it would silently corrupt either the books or the reports.

Next: `08-seeded-coa-and-localization.md`.
