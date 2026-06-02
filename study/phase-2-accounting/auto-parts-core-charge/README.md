# Auto-Parts "Core Charge" — a refundable deposit, not revenue (IFRS 15.106)

**Context:** DEV-362 scoped the launch COA to 5 WAC-native retail templates. Of the
five, only auto-parts needed a sector-specific overlay account: `2157 Core Charge
Liability`. The others (hardware, general merchandise, stationery) run on the base
retail template — over-adding accounts is its own kind of error.

## What a "core charge" is

In auto-parts retail, many components (alternators, brake calipers, batteries) are
remanufacturable. The shop sells the new/reman part **plus** a refundable deposit —
the *core charge* — on the customer's old, returnable unit (the "core"). When the
customer brings the old core back, the deposit is refunded.

So the cash collected at point of sale has two very different natures:
- the **part price** — earned revenue (a performance obligation satisfied on sale);
- the **core charge** — a deposit the seller expects to pay back.

## Why it is a liability, not revenue

Under **IFRS 15.106**, consideration received that the entity expects to refund is
a **refund liability**, not revenue. The seller has no right to keep the core
charge while the customer can still return the core. Recognising it as revenue
would:
- overstate sales and gross margin in the period of sale;
- understate liabilities;
- create a later "negative sale" when the refund is paid.

Revenue is recognised **only if the customer forfeits the core** (never returns it).
At that point the liability is derecognised and reclassified to income.

## How it's modelled in Zerupt

`2157 Core Charge Liability`:
- type `liability`, subType `current_liability`, normal balance **credit**
- parent `2100` (Current Liabilities), depth 2 — sibling to warranty/deferred items
- `isContra: false`, `isControlAccount: false`, cash-flow `operating`

Typical postings:
- **Sale w/ core charge:** Dr Cash | Cr Sales (part) | Cr 2157 (deposit) | Cr VAT
- **Core returned:** Dr 2157 | Cr Cash (refund)
- **Core forfeited:** Dr 2157 | Cr Income (deposit becomes earned)

## The transferable lesson

Any "deposit you expect to give back" — core charges, bottle deposits, returnable
pallets/crates, key/equipment deposits — is a **refund liability** at collection,
not revenue. The revenue (if any) only crystallises when the obligation to refund
lapses. Modelling it as a credit-balance current liability keeps both the P&L and
the balance sheet honest until then.

Cash-flow note (IAS 7): movements in customer refundable deposits are **operating**
cash flows, which is why `2157` carries `cashFlowCategory: operating`.
