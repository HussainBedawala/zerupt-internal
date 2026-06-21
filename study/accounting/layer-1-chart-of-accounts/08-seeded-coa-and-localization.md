# 08 — Seeded COA and Localization

## Why Zerupt ships a pre-built chart of accounts

Most accounting software asks you to build your COA from scratch. That means the business
owner — often a retailer with no accounting training — needs to sit down and decide what
account codes to use, which types they are, how to organize them.

This doesn't work for our market. MENA, India, and SEA retail owners are not accountants.
Asking them to design a chart of accounts is like asking someone to design the electrical
wiring for their own house before they move in. It's the wrong burden to place on the user.

Zerupt's approach: **ship a correct, regionally appropriate, pre-built COA** that covers
every account the engine needs, plus the most common accounts a retailer in that country
will use. The customer gets working books from day one.

This is not just a UX decision — it's a correctness decision. A seeded COA guarantees
that the system roles are bound, the hierarchy is valid, and the types are correct before
the first transaction is posted.

## The three-layer structure: base → country overlay → industry overlay

The seeded COA is built in layers:

### Layer 1: Base template

`apps/api/src/accounts/data/coa-base-template.ts`

A universal retail COA that works for any country — the accounts every retailer needs:
Cash, Inventory, Trade Receivables, Trade Payables, Revenue, COGS, Operating Expenses,
Equity. Approximately 80 accounts across the full 5-type hierarchy.

These are the system accounts (the ones backing roles) plus the most common manually-managed
accounts. This template is topology-sorted by depth so accounts can be inserted in FK-safe
order (parent before child).

### Layer 2: Country overlays

`apps/api/src/accounts/data/coa-country-overlays.ts`

Additional accounts specific to a country's tax system, merged on top of the base:

- **GCC VAT overlay** (UAE, Saudi Arabia, Bahrain, Oman, Qatar): adds reverse-charge VAT
  sub-accounts `1162.10` (Input VAT – Reverse Charge) and `2131.10` (Output VAT – Reverse
  Charge). These exist because GCC businesses importing goods must separately report
  standard vs. reverse-charge VAT.

- **India GST overlay**: splits the base input/output tax accounts into CGST, SGST, and
  IGST — the three components of India's dual GST. Adds accounts `1162.01` (CGST input),
  `1162.02` (SGST input), `1162.03` (IGST input), and matching output accounts. The dot
  notation keeps them under their parent codes.

- **Malaysia SST / Thailand VAT / others**: similar country-specific additions.

The overlay accounts are typed, flagged as system accounts, and included in the role-binding
seed where relevant.

### Layer 3: Industry overlays

`apps/api/src/accounts/data/coa-industry-overlays.ts`

Industry-specific account additions on top of the country template. For retail, this might
include specific COGS sub-accounts per product category, or specialized expense accounts.
This layer is the thinnest — most of it is covered by the base.

## Bilingual from day one

Every account in the seeded COA has:
- `name` (English)
- `nameAlt` (Arabic — where applicable)

The UI displays both. The Arabic name is not optional metadata — it's a first-class field
used when displaying the COA to Arabic-language users, and the import engine resolves
account names using case-insensitive matching on both `name` and `nameAlt`.

This is important for our market: a retailer in Saudi Arabia or UAE may have staff who
only read Arabic. Their accountant may give you a trial balance with Arabic account names.
The import engine needs to match those names to the correct accounts. Without bilingual
support in the COA, that matching fails.

## Locked upper levels, user-extensible leaves

The seeded hierarchy has two zones:

**Locked zone (upper levels):** The root headers (`1000 Assets`, `2000 Liabilities`,
`3000 Equity`, `4000 Income`, `5000 Cost of Sales`, etc.), the main sub-headers, and all
accounts flagged `isSystemAccount = true` are protected. Users cannot:
- Delete them.
- Change their type, sub-type, or code.
- Deactivate system accounts.

This guarantees the engine always has the accounts it needs and the report structure is
always valid.

**User-extensible zone (leaves):** Users can add their own leaf accounts under the existing
headers. A retailer who wants to track "Stationery Expense" separately from general
operating expenses can add `6350 Stationery` under `6000 Operating Expenses`. The system
places no limit on user-added leaves (within the max depth constraint).

Users cannot:
- Add a new root account (new types are not allowed — the five are fixed).
- Add a header that would disrupt the type hierarchy.

They can:
- Add leaves at any depth ≤ 5.
- Name them in any language.
- Assign any valid (type, sub-type) pair that matches the parent's type.

## Relation to VAT/GST

Tax accounts in the COA are where the VAT/GST accounting connects to the ledger:

- **Input tax recoverable** (1162 and its sub-accounts): every purchase posting that
  includes recoverable input tax credits this account. It's an asset (you're owed this
  back from the tax authority, or can offset it against output tax).

- **Output tax payable** (2131 and its sub-accounts): every sale posting that collects
  VAT/GST credits this liability account. You owe this to the tax authority.

When filing a VAT return, the accountant compares the balance of 2131 (what you collected)
minus the balance of 1162 (what you paid), and remits the net amount to the tax authority.

The COA template accounts for country-specific nuances:
- UAE/KSA: standard VAT (5%), reverse-charge on imports.
- India: three-component GST (CGST/SGST for intra-state, IGST for inter-state).
- Malaysia: SST structure.
- Bahrain/Oman/Qatar: VAT similar to UAE.

## The seeding process at tenant provision time

When a new tenant provisions and completes onboarding:

1. `CoaSeedService.seedTemplate()` is called with `(tenantId, userId, { countryCode, industryType })`.
2. The builder (`coa-template-builder.ts`) merges base + country overlay + industry overlay.
3. Accounts are inserted in topological order (depth 0 first, then depth 1, etc.) to
   satisfy the `parentAccountId` FK.
4. After accounts are inserted, the system role bindings are written to `account_system_roles`.
5. The posting engine is immediately ready — all roles are bound, all system accounts exist.

The whole process is wrapped in a transaction. Either all accounts and bindings are
created, or none of them are.

## The mental model

> The seeded COA removes the hardest setup step from the user's shoulders. It ships
> correctly-typed, bilingual, region-appropriate, and engine-ready. The upper levels are
> locked for structural integrity; the leaves are user-extensible for business specifics.
> Tax accounts are part of the COA — the engine posts to them automatically and the
> accountant reads the VAT return from their balances.

Next: `09-how-zerupt-implements-layer-1.md`.
