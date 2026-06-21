# 02 — Account Mapping and Roles

## The problem: connecting intentions to accounts

When a listener says "this leg is a `revenue` credit," the posting engine needs to know
*which account* is the revenue account for this tenant and legal entity. It cannot
hardcode `4110` (a renumbered COA would break it). It cannot ask the user to configure
it ad hoc (misconfiguration would post to wrong accounts silently).

Layer 2 uses two complementary resolution mechanisms:

1. **System roles** (from Layer 1) — for the 21 engine-critical accounts like AR, AP,
   inventory, output tax. These are bound at COA setup and guaranteed to exist.
2. **Account mappings** — a table that maps `(eventType, lineType)` to an `accountId`,
   with an override hierarchy that lets tenants and even individual items have different
   revenue accounts.

## What a line type is

Every JE line in the payload has a `lineType` — a semantic name that describes *what the
money is*. Examples:

| lineType | What it means |
|----------|--------------|
| `cash` | Cash at the POS register (1112) |
| `bank` | Bank account (1121) |
| `receivable` | Trade receivables — AR control (1131) |
| `inventory` | Merchandise inventory control (1141) |
| `payable` | Trade payables — AP control (2111) |
| `output_tax` | VAT / GST collected on sales (2131) |
| `input_tax` | Recoverable VAT paid on purchases (1162) |
| `revenue` | Product sales revenue (4110) |
| `cogs` | Cost of goods sold (5100) |
| `sales_return` | Sales returns / credit note contra (4200) |
| `grn_accrual` | GRN accrual — goods received, bill pending (2121) |
| `fx_gain` | Realized foreign-exchange gain (4820) |
| `fx_loss` | Realized foreign-exchange loss (7210) |

The listener writes the intention (`lineType`). The posting service resolves the
intention to a real account ID via `AccountMappingService`.

## The account mapping table

The `account_mappings` table has rows of the form:

```
(tenantId, legalEntityId, eventType, lineType, scope, scopeId) → accountId
```

The **scope** is the override level. From least to most specific:

| Scope | What it covers | Priority |
|-------|---------------|----------|
| `system` | Default for all tenants (seeded) | Lowest |
| `tenant` | Override for this whole tenant | 1 |
| `warehouse` | Override for a specific warehouse / location | 2 |
| `category` | Override for a product category | 3 |
| `item` | Override for a specific item | Highest |

The service fetches all matching rows for the `(eventType, lineType)` pair and picks the
one with the highest-priority scope that is active. The `system` rows are seeded at COA
setup (matching the 21 system roles). Tenant rows let the business say "our `revenue`
account for the Food category is 4115, not 4110."

This override hierarchy is what makes Zerupt flexible for real retailers without becoming
unconfigurable. The system default always works; overrides let sophisticated customers
route revenue by category or location without anyone touching the engine code.

## System roles vs account mappings — what's the difference?

They solve the same problem (find the right account) but in different contexts:

**System roles** (Layer 1 concept) are the source of truth for which account *plays* a
given role in the COA. The role binding says "account 1131 is the trade receivables
account for this legal entity." You can't have two accounts claiming the same role.

**Account mappings** (Layer 2 concept) are the lookup table the posting engine uses at
runtime to find which account to use for each line. System-scope mappings are seeded to
point at the system-role accounts. So the mapping for `(sales.invoice.confirmed,
receivable)` → `1131` was seeded from the `trade_receivables` system role binding.

The round-trip:
```
System role binding:  trade_receivables → account ID for account 1131
                           │
Seeding step:              ▼
Account mapping:  (sales.invoice.confirmed, receivable, scope=system) → same account ID
                           │
Runtime step:              ▼
Posting service:  resolves lineType="receivable" → account ID → posts to 1131
```

## Per-line account override

There is also a per-line escape hatch: a listener can set `accountId` directly on a JE
line input, bypassing the mapping lookup entirely. This is used for the bank-account
override (ISSUE-72): when a user specifies a specific bank GL account for a bank transfer
receipt or payment, the line's `accountId` is set explicitly. The posting service uses
the provided `accountId` instead of calling the mapping service for that line.

This is a deliberate exception, narrow in scope. Most lines should go through the mapping
table, not use explicit IDs, because hardcoding bypasses the multi-entity and COA-change
safeguards.

## What fails if a mapping is missing

If `AccountMappingService.resolveAccount` finds no active mapping for a given
`(eventType, lineType)`, it throws a `NotFoundException`. The outbox poller catches this
and moves the row to `dead_letter` (because it is non-retryable — retrying won't fix a
missing mapping). The dead-letter queue surfaces it for human review. This is the safe
failure mode: the entry doesn't post silently to a wrong account, and doesn't silently
disappear. It sits in the dead-letter queue with a clear error: "No account mapping found
for event=..., lineType=...".

## The mental model

> A line type is an accounting intention. Account mappings translate intentions to real
> accounts, with an override hierarchy so specific items or categories can route
> differently. System roles seed the defaults. The posting service is the consumer; the
> mapping table is its directory. A missing mapping is a loud, recoverable failure — not
> a silent one.

Next: `03-pos-sale-accounting.md`.
