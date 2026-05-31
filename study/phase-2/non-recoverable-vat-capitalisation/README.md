# Non-Recoverable VAT: Capitalisation vs Recovery

**Phase:** 2 (Accounting) · **Source issue:** [DEV-337](https://linear.app/zerupt/issue/DEV-337) · **Spec:** `agent-os/product/accounting/02-tax-model.md`

## The concept in one sentence

When a business pays VAT on a purchase that the tax authority does **not** let it claim back, that VAT is not a recoverable asset — it's a real cost of acquiring the thing, and accounting must treat it as such.

## Why this matters

The default VAT treatment most operators know is the recoverable case:

```
Buy inventory for 100, pay 5 VAT.
DR  Inventory                 100   ← cost of the thing
DR  Input Tax Recoverable       5   ← I will reclaim this from the tax authority
CR  Accounts Payable          105
```

That 5 in Input Tax Recoverable sits on the balance sheet as an asset (account 1162 in our default COA). At quarter-end the business files a VAT return, nets recoverable input against output VAT collected on sales, and the resulting balance is either paid to or refunded by the tax authority.

But some VAT amounts can **never** be reclaimed. Examples:

| Jurisdiction | Non-recoverable example | Reason |
|--------------|-------------------------|--------|
| UAE | VAT on entertainment expenses (client lunches, gifts) | Federal Tax Authority Cabinet Decision 52, Article 53 |
| India | Blocked credits under GST §17(5) — motor vehicles, food/beverage for personal use, club memberships | Central GST Act |
| KSA | VAT on personal-use vehicles, entertainment | Implementing Regulations Article 50 |
| Generic | Exempt-supply allocation of mixed-use input VAT | Partial-exemption rules |

For these, treating the VAT as a "recoverable asset" is **false accounting** — the asset can never be realised. The VAT must be added to the cost of the underlying item: capitalised into inventory, or expensed if it's an overhead.

## The two correct postings

**Inventory purchase with non-recoverable VAT:**

```
Buy inventory for 100, pay 5 non-recoverable VAT.
DR  Inventory                 105   ← cost INCLUDES the unrecoverable VAT
CR  Accounts Payable          105
```

The inventory carrying value goes up by 5. When the goods sell, that 5 flows through COGS — economically correct, because the business genuinely paid 105 to acquire something worth 105 to it.

**Service expense with non-recoverable VAT:**

```
Buy entertainment service for 100, pay 5 non-recoverable VAT.
DR  Entertainment Expense     105   ← cost INCLUDES the unrecoverable VAT
CR  Accounts Payable          105
```

The P&L hit is the full economic cost.

In both cases the recoverable-input-tax asset account is **not touched**. There is nothing to reclaim from the tax authority.

## Why this is structurally a routing problem, not a calculation problem

The tax-calc engine doesn't change. The 5 of VAT is still calculated the same way: rate × net base. What changes is the **destination account** for the debit.

That's why our implementation flows through three layers:

1. **Tax setup** — `TaxCode.category` enum carries the routing intent: `standard`, `zero_rated`, `exempt`, `reverse_charge`, `non_recoverable`.
2. **Engine output** — `ComponentSummaryEntry.category` propagates that intent into the per-document tax summary.
3. **Event payload** — `EventTaxLine.isRecoverable` is a derived boolean (`category !== "non_recoverable"`). The accounting listener uses it as the routing key.

The accounting listener is the only place that knows which GL account corresponds to "recoverable input tax" vs "capitalised into the source line's debit". Everything upstream is concerned only with the *amount* and the *category*, not the *account*.

## The reporting subtlety

A recoverable-input-tax JE line carries the `taxCodeId` of the tax component that produced it. That's how the VAT-return builder later asks "show me everything I can reclaim this quarter": SQL JOIN over `journal_entry_lines.tax_code_id` → `tax_codes` → group by jurisdiction.

A capitalised-non-recoverable JE line **drops** the `taxCodeId`. The VAT is no longer tax for accounting purposes — it's cost. If the VAT-return query accidentally swept this up, the business would over-claim recoverable VAT and become liable for back-taxes + penalties.

But this creates a separate reporting gap: most VAT regimes still require the *gross value* of non-recoverable purchases to be disclosed on the return (e.g. UAE VAT return Box 9, "Total value of supplies not eligible for input tax recovery"). With `taxCodeId` dropped, there's no JE-level hook to rebuild that disclosure. That's a separate column / event / shadow-table problem, tracked as a follow-up.

## The reverse-charge cousin

Reverse charge is a different but related routing case: the buyer self-assesses VAT instead of the supplier collecting it.

```
Import service from a foreign supplier. Bill 100, RC VAT @ 5%.
DR  Input Tax Recoverable       5   ← I can reclaim this
CR  Output Tax Payable          5   ← but I also owe it to the authority
                                    (net zero, but both legs go on the VAT return)
```

The supplier never charges the VAT; the buyer books both sides of it internally. From a routing perspective, reverse-charge VAT is *recoverable* (so `isRecoverable: true`), but the JE shape is fundamentally different from a normal recoverable input — it needs **both** a DR and a CR. That's why our event payload carries `isReverseCharge` as a second, orthogonal flag.

The routing matrix the listener implements:

| `isReverseCharge` | `isRecoverable` | JE shape |
|-------------------|-----------------|----------|
| false | true  | DR `input_tax` (carries `taxCodeId`) |
| false | false | DR `inventory`/`expense` (no `taxCodeId`) |
| true  | true  | DR `input_tax` + CR `output_tax` (both carry `taxCodeId`) |
| true  | false | same as RC + recoverable (current MENA assumption — partial-exemption RC is a future problem) |

`isReverseCharge` takes precedence — once a line is reverse-charged, it always gets the self-assessment DR/CR pair regardless of recovery status.

## When this routing actually fires in our MVP

For Pacific Co (Kuwait, our first tenant): never. Kuwait has no VAT, so no `TaxCode` has any non-zero rate, and the entire routing tree degenerates to "no tax lines at all".

For UAE / KSA / India tenants: every purchase invoice the operator categorises against an entertainment/blocked-input/etc. tax code will route through the non-recoverable branch and capitalise the VAT into stock cost. Audit-trail-wise, the `journal_entry_lines` row will show the inflated inventory debit; the underlying `TaxCode` category will tell future-you why.

## What the bug was, before DEV-337

Before DEV-337 (and its sibling DEV-354, DEV-355), the listener posted *all* VAT to recoverable input tax regardless of category. The `TaxCode.category` field existed in the schema and was set correctly by the tax-setup UI, but the AP listener never read it. So a UAE tenant booking an entertainment-VAT bill would over-state Input Tax Recoverable by the non-rec amount and under-state inventory/expense by the same.

The fix isn't algorithmically hard — it's a one-line conditional in the listener. The hard part was discipline: making sure the category survives from `TaxCode` all the way to the accounting event payload through three type boundaries, and writing tests that pin the routing matrix so it can't silently regress.

## Concepts to internalise

- **VAT is sometimes a cost, not an asset.** Recoverability is a property of the tax code, not the transaction type.
- **Routing keys live on the data, not in the listener.** The listener is a pure switch over `(isReverseCharge, isRecoverable)`. Add a new tax-treatment regime → add a new flag, don't add a new listener branch with hidden assumptions.
- **`taxCodeId` is a signal, not just a foreign key.** Its presence on a JE line tells reporting layers "this amount is claimable VAT". Its absence is structurally meaningful.
- **Event payloads cross trust boundaries even inside one process.** Zod validation at the listener boundary catches the case where an emitter forgets to populate a newly-required field. With NestJS EventEmitter2 the emitter and listener can compile against the same TypeScript interface, but Zod is the contract that survives refactors.

## Further reading

- IAS 2 (Inventories), §11: "purchase price, including … taxes other than those subsequently recoverable by the entity from the taxing authorities".
- UAE FTA Cabinet Decision 52 of 2017, Article 53 — blocked-input-VAT cases.
- India CGST Act §17(5) — blocked credits.
- Internal: `agent-os/product/accounting/02-tax-model.md` §Journal Entry Flow → Purchases.
