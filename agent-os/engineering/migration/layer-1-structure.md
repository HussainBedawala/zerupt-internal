<!-- Zerupt internal knowledge base | Migration intake: Layer 1 | Updated: 2026-09-27 -->
# Layer 1: Structure (places and calendar)

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** the shops, the stock rooms, the financial calendar, and the counters that give documents their numbers.

Since [Layer 0](layer-0-identity.md) already creates the one legal entity (`MAIN`), this layer is about what sits underneath it: branches, warehouses, the calendar, and numbering.

---

## 1. The headline finding

> **Zerupt cannot be told to use a specific document number. Every number comes from its own counter.**

This was checked across every place a document is created: sales invoices, purchase invoices, delivery notes, refunds, quotations, stock adjustments, transfers, journal entries and more. Not one of them accepts a number from the caller. It is deliberate, and there is a comment in the code explaining that no request should ever be able to ask for a particular number.

That is good design for daily use and a direct problem for migration, because **a customer's old invoice numbers must survive**. If their invoice 100001 becomes our invoice 1, then their paper, their WhatsApp messages and their customer conversations all stop matching the system.

**So this becomes a required build:** a migration-only way to write a document with a number supplied by us. It is on the product gap list.

**The related good news:** the counters can be set. There is a proper, supported way to tell a counter "start from 21906 from now on", including tools designed for exactly the case where records arrived in the database without going through the counter. So once history is loaded, the next real invoice continues correctly. That part we do not need to build.

---

## 2. What exists already, and what we must create

| Thing | Who creates it |
|---|---|
| The one legal entity `MAIN` | Automatic at signup |
| Its fiscal settings (which month the year starts) | Automatic at signup |
| Home currency and currency policy | Automatic at signup |
| POS payment types | Automatic at signup |
| One counter, for barcodes | Automatic at signup |
| **Branches** | **We create** |
| **Warehouses** | One default warehouse comes free with each branch. Extra ones we create |
| **Financial years and their months** | **We create**, for every year of history |
| **All other counters** (invoice, journal, purchase order, and so on) | **We create**, or they quietly start themselves at 1 on first use |

That last line matters. If we do nothing, a counter creates itself the first time it is needed and starts at 1. So counters must be set **before** the first document of that type is created, or numbering will be wrong from the start.

---

## 3. Branches

A branch is a shop, an outlet or an office.

| Field | Type | Need | Notes |
|---|---|---|---|
| `code` | text, max 50 | required | Unique within the tenant |
| `name` | text, max 200 | required | |
| `nameAlt` | text | optional | Second language |
| `timezone` | text | required | Defaults to UTC, so set it properly |
| `currencyCode` | 3 letters | optional | Leave empty. It defaults to the entity's currency |
| Address, country, emirate | text | optional | Emirate only matters for the UAE |

**Rules:**

- Every branch belongs to the one legal entity.
- **The number of branches is capped by the plan.** A five-branch customer needs a plan that allows five. Check this before starting.
- Creating a branch **automatically creates its default warehouse**, so never create that warehouse yourself.
- A branch cannot be deleted while things point at it.

---

## 4. Warehouses

Where stock physically sits. Warehouses can optionally be divided into zones and then bins, but that is not required.

| Field | Need | Notes |
|---|---|---|
| `branchId` | required | Every warehouse belongs to a branch |
| `code` | required | Unique within its branch |
| `type` | required | Defaults to "store" |
| `isDefault` | required | Exactly one default per branch |

**Open question:** whether stock movements need only a warehouse, or a zone and bin too. Domain 6 of the audit will confirm.

---

## 5. The financial calendar

To record an invoice dated March 2024, a March 2024 period has to exist. **Financial years are not created automatically**, so a migration must create every year of history before loading anything into it.

How it works:

- A **financial year** is created for a calendar year, for the legal entity.
- Creating it produces its **periods**, normally twelve months.
- Each period has one of three states:

| State | What it means | Enforced by |
|---|---|---|
| **Open** | Anything can be posted into it | |
| **Soft locked** | Blocked in the app, but certain roles can override | App only, not the database |
| **Hard locked** | Blocked completely. The database itself refuses | A database rule. No way around it |

There is also a proper way to create a year as **already closed, for imported history**. It exists precisely for businesses bringing in past years, and it does not require a real year-end close.

**The order this forces on us:**

1. Create each historical year with its periods **open**.
2. Load that year's documents.
3. Check the numbers.
4. Then lock the year.

If a year is created as closed, its periods are hard locked and the database will refuse every document. So we lock at the end, never at the start.

⚠️ **Two details worth knowing:**
- The database checks not only that the period is unlocked, but that the document's date actually falls inside that period. Wrong date, refused.
- There is a field in the database meant to mark a year as imported history that is never actually filled in. Do not rely on it. The system works out "this was imported" a different way.

---

## 6. Document numbering

| Question | Answer |
|---|---|
| Can we supply our own document number? | **No.** Not anywhere today. Must be built |
| Can we set where a counter starts? | **Yes.** Properly supported |
| Can we fix a counter after records arrived another way? | **Yes.** There are tools that scan what is already there and push the counter past it |
| What happens if we do nothing? | The counter creates itself at 1 on first use |

Counters are held per document type and per branch, with a prefix, padding and a reset rule (for example, restart each year).

**What the migration must do:**

1. Load history with the original numbers (needs the build above).
2. Set each counter to continue from the highest number used.
3. Confirm the next real document gets the expected number.

---

## 7. What the old system must tell us

| We need | Why |
|---|---|
| The list of branches, with code, name and timezone | They become our branches |
| The list of warehouses or stock locations, and which branch each belongs to | Stock has to live somewhere |
| The first date of their history | Tells us how many financial years to create |
| Which month their financial year starts | Usually January, but not always |
| For each document type: the **highest number used**, and the format | So counters continue correctly |

---

## 8. Rules and traps

| Trap | What it means |
|---|---|
| Branch count is capped by the plan | Check the plan before starting, not halfway through |
| A default warehouse is created with every branch | Never create it twice |
| Financial years are not automatic | Every year of history must be created first |
| Hard locked is enforced by the database | Lock at the end, not the beginning |
| Counters start at 1 if ignored | Set them before the first document |
| Leave branch currency empty | It defaults to the entity currency, which is what we want |

---

## 9. Noted for later: multiple legal entities

Multi-entity is switched off for every customer today, so this does not affect us now. Two facts are worth recording for whenever it is switched on:

1. It sits behind a switch that is off by default.
2. Even switched on, **all legal entities in one tenant must share the same currency**. A Kuwait entity in KWD alongside a UAE entity in AED is refused outright. The reason given in the code is that pricing features resolve currency against the tenant's default entity, so mixed currencies would silently break them.

This is why "one company equals one tenant" is the right rule today, and it would still be the right rule for multi-country customers even if the switch were turned on.

---

## 10. Open questions

1. Do stock movements need a zone and bin, or is a warehouse enough? Domain 6.
2. What exactly is the path to reopen a hard-locked period, and who is allowed to do it? We need this for fixing a mistake after a year has been locked.
3. If a second legal entity is ever created, are its fiscal settings created automatically? The code comment points at something the auditor could not find. Only matters when multi-entity is switched on.
