<!-- Zerupt internal knowledge base | Migration intake specification | Updated: 2026-09-27 -->
# Zerupt Migration Intake Specification

**This is the single source of truth for what Zerupt needs in order to take a business's data out of any other system and bring it into Zerupt.**

It is written for three readers:

1. **Us**, so we know what to build.
2. **The developer of the old system**, so they know exactly what to send us.
3. **Anyone who joins later**, so they do not have to ask.

It is deliberately **not about Merpec**. Merpec is the first system we are migrating from, and it is used as an example here and there, but everything in this document must hold true for any system: a competitor's ERP, an accounting package, or a pile of Excel files. The old system is just an adapter. The intake is ours.

---

## 1. What this document is

Think of Zerupt as a warehouse with a receiving door.

A new customer arrives with a truck full of their business: their items, their customers, what they owe, what they own, and years of paperwork. The receiving door needs a checklist. What is in the truck? Where does each box go? What do we do if a box is missing a label? How do we prove at the end that nothing fell off the truck?

**This document is that checklist.**

For every piece of data, it answers six questions:

| # | Question | Example |
|---|---|---|
| 1 | What is it called, and what does it mean? | `unit_cost` — what one piece cost us to buy |
| 2 | What type is it? | Money with 3 decimals, sent as text |
| 3 | Do we have to have it? | Required, optional, or required only sometimes |
| 4 | What values are allowed? | Only `cash`, `card`, or `credit` |
| 5 | What do we do if it is missing? | Use a default, make a placeholder, or refuse the row |
| 6 | Where does it land inside Zerupt? | Table and column |

When those six answers exist for every field, a migration stops being a guessing game and becomes ordinary work.

### What this document is not

- It is not a plan for one customer. Each customer gets their own short plan that points at this document.
- It is not a description of the old system. That belongs with the adapter for that system.
- It is not permanent. When Zerupt's data model changes, this changes with it, and the version number goes up.

---

## 2. What a migration is, and when it has worked

A migration is **not** copying data. It is rebuilding a business inside a new system.

### The three promises

A migration has worked when all three of these are true. Not two.

1. **They can work tomorrow morning.**
   The right stock, the right prices, the right balances, the right open orders. If a customer walks into their shop on Monday and cannot sell, nothing else matters.

2. **They can look up the past.**
   Find an old invoice, print it, and see why a customer's balance is what it is.

3. **The numbers match what they already believe.**
   Their trial balance, their stock value, their customer balances. Exactly.

Most migrations fail on the third one. The data is all there, but a number is different, the customer notices, and from that moment they do not trust anything else in the system. **Matching numbers is not a nice extra. It is the product.**

### The five questions

Every migration, for every customer, must have a written answer to these five:

| Question | What it decides |
|---|---|
| **Scope** | What comes across, and what openly does not |
| **Fidelity** | Do we reproduce their numbers exactly, or recalculate them? |
| **Cutover** | When do they stop using the old system, and for how long are they down? |
| **Proof** | How do we show it worked, with evidence rather than opinion? |
| **Fallback** | What happens if something is wrong on Monday morning? |

Five answers written down is a plan. Anything less is a hope.

### The four rules the machinery must follow

These are not nice to have. Break one and we pay for it every single day of the project.

1. **Repeatable.** Running the migration twice must not create anything twice. We will run it dozens of times before go-live.
2. **Traceable.** Every record inside Zerupt must be able to answer "where did you come from?" Without this, fixing a problem means digging through everything.
3. **Reversible.** We must be able to wipe a customer's data back to empty and start again. This is a feature, not an admission of failure.
4. **Loud.** Anything that cannot be brought across is reported. Never quietly dropped. Silent loss is the one mistake we cannot recover from, because nobody knows it happened.

---

## 3. The layer model

Data has to arrive in order, because each layer needs the one below it to already exist. You cannot record an invoice before the customer exists, and the customer cannot exist before the company does.

```
Layer 8   PROOF          their own numbers, to check ours against
Layer 7   PERIPHERALS    attachments, print settings, preferences
Layer 6   PEOPLE         users, roles, permissions, branch access
Layer 5   HISTORY        every past document, in date order
Layer 4   OPENING        the starting position: stock, balances, unpaid bills
Layer 3   MASTERS        items, customers, suppliers, prices, units
Layer 2   FINANCIAL      chart of accounts, currencies, tax, payment methods
Layer 1   STRUCTURE      legal entities, branches, warehouses, fiscal calendar
Layer 0   IDENTITY       the tenant itself: country, brand, modules
```

Read it from the bottom up. That is also the order we load in.

| Layer | What it holds | Why it cannot be skipped |
|---|---|---|
| **0. Identity** | The tenant, its country, its brand, which modules and packs it may use | Everything hangs off this. Wrong country means wrong tax, wrong currency, wrong wording on documents |
| **1. Structure** | Legal entities (each with its own country, currency and tax rules), branches, warehouses, zones and bins, the fiscal calendar, document number sequences | A document dated January 2024 needs a January 2024 period to sit in. New invoices need to carry on from the last old number |
| **2. Financial** | The chart of accounts, and which of their accounts plays each role for us (receivables, payables, stock, cost of sales, tax, rounding), currencies and rates, tax codes, cash and bank accounts, payment methods | Every document needs to know where to send the money. Get this wrong and every single posting is wrong |
| **3. Masters** | Units and pack sizes, categories, brands, vehicles, items with barcodes and part numbers and prices, customers and suppliers with terms and credit limits, salespeople, price lists | Nothing can be bought or sold until the thing and the person exist |
| **4. Opening** | Stock quantity **and cost** per item per warehouse, the opening trial balance, unpaid customer and supplier invoices one by one, cash and bank balances, open orders | This is the starting point of the story. Without it, every balance afterwards is wrong |
| **5. History** | Every past document with its own number, date, lines, prices, discounts, tax, **cost**, and its links (which payment settled which invoice) | This is what makes the customer feel at home instead of on a brand new system |
| **6. People** | Users, roles, what each role can do, which branches each person can see | Without it, nobody can log in on Monday. Passwords never migrate; people set new ones |
| **7. Peripherals** | Attachments, print layouts, preferences | Easy to forget, quick to do, and their absence is what makes a system feel foreign on day one |
| **8. Proof** | The old system's own reported figures, frozen at the moment we pulled the data | Not data to import. Numbers to check ourselves against |

---

## 4. The fidelity rule

This is the most important rule in the document, so it gets its own section.

**We recompute anything that can be worked out. We accept anything that can only be stated.**

| Thing | Who decides | Why |
|---|---|---|
| Quantities and stock movements | **Zerupt computes** | Objective. 10 in, 4 out, 6 left. Both systems agree |
| Document face values (price, discount, tax, totals) | **Take theirs, as-is** | The customer has this on paper. It cannot change |
| Cost and cost of goods sold on each outgoing line | **Take theirs, as-is** | Depends on their whole history and their own corrections. Never exactly reproducible |
| Journal entries | **Zerupt computes** | This is our job, and often the old system has nothing to hand over |
| Stock on hand and average cost | **Zerupt computes, then we check** | Comes out naturally, then gets compared with their figure |
| Customer and supplier balances | **Zerupt computes, then we check** | Comes out of invoices and payments |
| Opening position | **Take theirs, as-is** | Nothing comes before it, so it can only be stated |

### Why we never recalculate the money

Take one sales invoice with three lines.

- Their system works out the tax line by line and rounds each one.
- Our system might work out the tax on the invoice total instead.

Difference: 0.001 KWD. On one invoice, nobody cares. Across 20,000 invoices, the trial balance is off by an amount nobody can explain, and the checks never pass. Worse, the customer prints an old invoice from Zerupt and it does not match the paper in their file. That single moment costs more trust than any feature can win back.

So: **their invoice is sacred. We store what it says, we do not work it out again.** Zerupt's calculation engine is for new documents from day one onward, not for rebuilding old ones.

---

## 5. Two kinds of checks: integrity and policy

Zerupt refuses bad data in two very different ways, and a migration must treat them differently.

| Kind | Examples | During migration |
|---|---|---|
| **Integrity** | A journal entry must balance. An invoice must point at a real customer. A quantity must be a number | **Always on.** These protect the data itself |
| **Policy** | Credit limit exceeded. The period is closed. You cannot sell stock you do not have. The document number must come from our counter. This needs approval | **Relaxed for migration.** These are rules for today's users, not judgements about the past |

History is not a proposal. It is a fact. If their old system let them go over a credit limit in March, that happened, and our job is to record it, not to argue with it.

---

## 6. Rules for bad data

Incoming data is always incomplete, inconsistent, and sometimes nonsense. So every defect needs a decided answer, before we start, not during.

| Problem | What we do |
|---|---|
| Points at something that does not exist (an item code with no item) | Create a clearly labelled placeholder, record it in the exceptions list |
| Numbers do not add up | Post the difference to a visible account named for exactly this, never quietly adjust |
| A field has nowhere to go in our model | Keep it on the record in a legacy details area |
| A whole concept has nowhere to go | Keep it as a read-only legacy record, or build the feature properly |
| The same thing twice under different codes | Bring both in, flag them, let the customer merge later |
| Deleted in the old system with no trace | Nothing can recover it. Write the gap down honestly |

**One principle covers all of these: a difference the customer can see beats a correction they cannot.**

---

## 7. How to read the layer sections

Each layer below is written the same way.

- **What it is**, in one or two sentences.
- **What Zerupt needs**, as a table of fields.
- **Order**, meaning what must already exist first.
- **What we do when something is missing.**
- **How we check it landed correctly.**

The field tables use these columns:

| Column | Meaning |
|---|---|
| **Field** | The name we use in the intake |
| **Type** | Text, number, money (with how many decimals), date, true/false, or one of a fixed list |
| **Need** | `required` / `optional` / `conditional` (with the condition) |
| **Source** | `taken` (we store what they send) or `computed` (Zerupt works it out) |
| **If missing** | Default, placeholder, or reject |
| **Lands in** | The Zerupt table and column |
| **Notes** | Anything that would otherwise be guessed |

---

## 8. Status

| Section | Status |
|---|---|
| Fundamentals (sections 1 to 7) | Written |
| [Layer 0: Identity](layer-0-identity.md) | Written |
| [Layer 1: Structure](layer-1-structure.md) | Written |
| [Layer 2: Financial foundation](layer-2-financial.md) | Written |
| [Layer 3a: Items](layer-3a-items.md) | Written |
| [Layer 3b: Customers and suppliers](layer-3b-parties.md) | Written |
| [Layer 4: Opening position](layer-4-opening.md) | Written |
| [Layer 5a: Sales history](layer-5a-sales.md) | Written |
| [Layer 5b: Purchase and stock movements](layer-5b-purchase-stock.md) | Written |
| [Layer 5c: Money movements](layer-5c-money.md) | Written |
| [Layer 6: People and access](layer-6-people.md) | Written |
| [Layers 7 and 8: Peripherals and proof](layer-7-8-peripherals-proof.md) | Written |
| [What already exists](existing-machinery.md) | Written |
| [What we must build](build-list.md) | Written |
| Machine-readable schemas and validator | Not started |

The layer sections are produced by auditing the actual Zerupt schema and services, module by module, rather than from memory or from existing documentation, because documentation drifts and the database does not.
