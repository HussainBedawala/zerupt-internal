<!-- Zerupt internal knowledge base | Migration intake: Layer 0 | Updated: 2026-09-27 -->
# Layer 0: Identity (the tenant itself)

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** before anything else can exist, Zerupt has to create the customer as a tenant, give them their own database, and switch them on.

---

## 1. The most important thing to know

**Creating a tenant is not an empty room. Zerupt furnishes it for you.**

When a tenant is created, the system automatically sets up a good deal of Layer 1 and Layer 2 by itself. This is the single biggest rule of Layer 0:

> **The migration must use what was auto-created. It must never create a second copy.**

Here is exactly what appears on its own, without anybody asking:

| Auto-created | Detail |
|---|---|
| The tenant's own identity record | Name, country, timezone, language, and whether the screen reads right-to-left, all worked out from the country |
| **One legal entity, coded `MAIN`** | Its currency and tax system come from the country |
| Fiscal settings for that entity | Which month the financial year starts, based on the country |
| The tenant's home currency, and the currency policy | |
| The "Owner" role, given to the first user | This role bypasses permission checks |
| Default POS payment types | Cash and card, plus KNET for Kuwait |
| System label templates | |
| One document number counter (for barcodes) | |

So for a Kuwaiti customer, a legal entity called `MAIN` already exists with KWD as its currency and Kuwait's tax rules, before we send a single row.

**What this means in practice:**

- The migration **writes into** `MAIN` (renaming it if needed), rather than creating a new entity.
- For a customer with several countries, `MAIN` becomes the first country, and the others are **added**.
- The currency question matters enormously, because of the next point.

⚠️ **A legal entity's currency locks after its first journal entry.** Choose the wrong country at signup and it cannot be fixed later without wiping the tenant and starting again. This makes country the single most important field in Layer 0.

---

## 2. What Zerupt needs from us

These are the facts a migration must supply to create a tenant. Everything else is derived or auto-created.

| Field | Type | Need | Source | If missing | Notes |
|---|---|---|---|---|---|
| `businessName` | text, max 200 | required | taken | reject | The name shown everywhere |
| `countryCode` | 2 letters | required | taken | reject | Decides currency, tax system, fiscal year start, language, timezone. **Cannot be changed after the first journal entry** |
| `currency` | 3 letters | required | taken | reject | Must be a valid combination with the country, or the request is refused |
| `brand` | `zerupt` | required | taken | `zerupt` | |
| `slug` | lowercase letters, numbers, hyphens, up to 50 | required | taken | generated from the name | Becomes their web address. Must not clash, and must not be a reserved word |
| `planSlug` | text | required | decided by us | reject | The plan must already exist in our system |
| `ownerUserId` | the login account | required | created by us | reject | A real login account, created before the tenant |
| `packs` | list | optional | decided by us | none | For example `auto_parts`. Granted as a separate record |

Everything else, such as timezone, language and right-to-left, is worked out from the country and should not be sent.

---

## 3. Where this lands

Layer 0 lives in the **central admin database**, not in the customer's own database.

| Record | What it holds |
|---|---|
| `tenants` | The main row: name, country, brand, status, plan, owner |
| `tenant_databases` | Where their database lives, and the encrypted password to reach it |
| `cells` | Which database cluster they sit on, chosen by brand |
| `subscriptions` | Their billing arrangement |
| `tenant_entitlements` | Their limits, such as how many outlets are included |
| `tenant_packs` | Industry packs, such as auto-parts |
| `provisioning_jobs` | Tracks the setup as it happens |
| `user_tenant_map` | Which login belongs to which tenant |

---

## 4. Order of work

1. A **plan** must already exist in the system.
2. A **login account** is created for the owner.
3. The tenant is created. Five records are written together in one go: the tenant, the owner link, the subscription, the setup job and the entitlements. All five or none.
4. Setup then runs in the background, in four steps:
   1. Create the customer's own database on a cluster.
   2. Apply every database migration (around 300 files).
   3. Seed the defaults listed in section 1.
   4. Mark it ready, and stamp the tenant onto the owner's login.
5. **Only after step 4 can anyone log in.** The whole thing can take several minutes, so a migration tool must wait and check, not assume.

---

## 5. Rules and traps

| Trap | What it means for us |
|---|---|
| **One login can belong to only one tenant** | Every test tenant and every dry run needs its own email address. Plan for this, because we will create the same customer many times before go-live |
| **Country locks the currency** | Getting the country wrong is only fixable by starting over |
| **The plan must exist first** | No silent fallback. The request simply fails |
| **The web address has rules** | Lowercase letters, numbers and hyphens, not a reserved word, and not already taken |
| **Brand is checked against the website it was requested from** | A script calling the system directly will always get `zerupt`. Creating a Merpec-branded tenant needs a different route. **This needs solving before we migrate a Merpec-branded customer** |
| **Setup takes minutes and runs in the background** | The migration tool must poll for readiness |
| **Only one setup job can run per tenant at a time** | A second attempt is refused while one is running |

---

## 6. What the old system must tell us

Very little, which is the point. For Layer 0, any source system only needs to supply:

- the business name
- the country
- the currency
- the owner's name and email
- how many locations and users they have, so we choose the right plan

Everything else is our decision or is automatic.

For a customer operating in more than one country, we also need **the list of countries**, because the first one becomes `MAIN` and the rest are added in Layer 1.

---

## 7. Open questions

1. **Who creates the chart of accounts?** Tenant setup explicitly does not. A comment in the code points at a separate onboarding pipeline. Domain 3 of the audit will confirm this. Until then we do not know whether a migration must supply the chart of accounts or whether one already exists.
2. **How does a script create a white-labelled tenant?** Brand is checked against the website the request came from, so a tool calling the system directly always gets the default brand. There is no internal path today. Only matters when we migrate a white-label customer.
3. **Multiple tenants per person.** One login belongs to one tenant, so a person who owns businesses in three countries cannot see all three with one login if we split them into separate tenants. This is another argument for one tenant with several legal entities.

---

## 8. Settled: one company equals one tenant

**Multi-entity is switched off for every customer today (founder decision, 2026-09-27).** So the rule for every migration is simple:

> **One company in the old system becomes one tenant in Zerupt, with its single auto-created `MAIN` legal entity.**

A customer operating in three countries becomes three separate tenants, one per country. This matches how most old systems are set up anyway, where each country is already a separate company with its own books.

What this means:

- The `MAIN` legal entity is the only one. The migration never creates a second.
- Each tenant has exactly one country, one currency and one tax system. Much simpler.
- Each tenant's data is completely separate, which is what the customer already has today.

**The cost to be aware of:** a login belongs to one tenant only, so an owner with three companies needs three logins and switches between them. Worth telling them up front. It is also worth revisiting if multi-entity is ever switched on.

## 9. Decisions this forces

| Decision | Recommendation |
|---|---|
| How many tenants | One per company in the old system. Settled above |
| Country and currency | Taken from that one company. Locks after the first journal entry, so it must be right the first time |
| Which plan | Based on the number of outlets and users. Needs deciding per customer before any migration |
| Packs | Auto-parts customers need the `auto_parts` pack granted at Layer 0, or parts features stay hidden |
| Owner logins | One email per tenant. A customer with several companies needs several logins |
