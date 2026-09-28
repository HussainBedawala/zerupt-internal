<!-- Zerupt internal knowledge base | Migration intake: Layer 2 | Updated: 2026-09-27 -->
# Layer 2: Financial foundation (the accounts and the rules of money)

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** the list of accounts, and the rules that tell every document where to send its money.

This is the layer where a migration quietly goes wrong. If it is right, thousands of documents post themselves correctly. If it is wrong, every single one is wrong in the same way.

---

## 1. Three headline findings

**1. The chart of accounts is not created when a tenant is created.** It comes later, from a separate setup step. So a migration must run that step first. If it does not, **every single posting fails** with "no account mapping found". Nothing posts at all.

**2. Nothing is ever posted to a guessed account.** If the system does not know which account a particular kind of line belongs to, it stops and complains loudly. It never picks something close, and it never skips the line. For us this is very good news: a mapping mistake shows up immediately and noisily, not six months later in a wrong balance.

**3. Customer balances and aging are not stored anywhere.** They are worked out from the ledger, using two fields on each accounting line: **which customer or supplier it belongs to**, and **when it is due**. If our migration forgets to fill those two fields, the customer's statements and aging reports will be empty even though every invoice is present.

That third point is the single most important detail in this layer.

---

## 2. How accounts work here

An account is one line in the chart of accounts, like "Trade receivables" or "Sales".

| Field | Need | Notes |
|---|---|---|
| `code` | required | Up to 30 characters. Uses dots for levels, like `1141.01`. Unique |
| `name`, `nameAlt` | required / optional | The second is the other language |
| `type` and `subType` | required | Asset, liability, income, expense, and a more detailed kind |
| `normalBalance` | required | Whether it normally sits on the debit or credit side |
| `parentAccountId`, `depth` | optional | Up to 5 levels deep |
| `currencyCode` | optional | Only if this account is held in a different currency |
| `isHeader` | required | A grouping line that cannot be posted to |
| `isControlAccount` | required | Only the system may post here, never a person |
| `isSystemAccount` | required | Created by our template. Cannot be deleted or renumbered |
| `isActive` | required | |

The database itself checks that the type, subtype and normal balance make sense together. A nonsense combination is refused before it is written.

### Can we use the customer's own account codes?

**Yes.** Three ways, and they can be combined:

1. **Keep our template accounts** and rename them to the customer's wording.
2. **Add the customer's own accounts** with their own codes and names.
3. **Point our rules at their accounts**, so postings land where they expect.

The template setup is safe to run more than once. It skips any code that already exists, so it never overwrites the customer's work.

**The one restriction:** accounts our template marks as system accounts cannot be deleted, renumbered or switched off. They can be renamed. So the customer's chart can look like theirs, while the machinery underneath keeps working.

---

## 3. How the system knows where to post

There are two mechanisms, and it helps to understand both.

### Roles: "which account is the receivables account?"

The engine never hardcodes an account code. Instead, each job has a **role**, such as receivables, payables, stock, cost of sales, tax payable, rounding, retained earnings, exchange gain and loss.

Each role is bound to exactly one account. Change the binding and every posting follows, with no code change. This is what lets a customer keep their own chart of accounts.

### Mappings: "which account does this kind of line use?"

For each type of business event, and each kind of line inside it, a mapping says which account to use. There are around 51 events in the list, and they are held in one place that is the agreed source of truth.

Mappings can be overridden at increasing levels of detail:

```
system  <  tenant  <  warehouse  <  category  <  item
```

So a customer can say "stock normally posts to 1141, except for tyres, which post to 1142". Rarely needed, good to know it exists.

### What happens if a mapping is missing

It **throws an error and stops**. It never guesses, and never skips. During the setup step, missing mappings are reported as warnings, and it separates real problems from expected ones, such as a Kuwaiti tenant having no reverse-charge tax accounts.

---

## 4. Journal entries: how a migration posts

An accounting entry has a header and at least two lines, and the debits must equal the credits. The database enforces that on anything posted. Drafts may be unbalanced; posted entries never.

| Header field | Need | Notes |
|---|---|---|
| `legalEntityId` | required | The one entity |
| `fiscalPeriodId` | required | The period must already exist. See [Layer 1](layer-1-structure.md) |
| `postingDate` | required | Backdating is not blocked here. The period lock is the real gate |
| `currency` and `exchangeRate` | required | Rate defaults to 1 |
| `status` | required | Can be created **already posted**. No draft step needed |
| `source` | required | Where it came from |
| `entryNumber` | automatic | Given at posting. Gap-free |

### The two fields that make or break statements

On each line:

| Field | Why it matters |
|---|---|
| `partyType` and `partyId` | Which customer or supplier this line belongs to. **Customer and supplier balances, statements and aging are worked out entirely from this.** There is no separate balances table |
| `dueDate` | Drives which aging bucket the amount falls into |

Both must be filled on every receivables and payables line we create. The database checks that party type and party id are either both present or both absent, but it cannot know that we forgot them entirely.

### Tax on a line is stored, not recalculated ✅

Lines carry the tax amount and the taxable amount, and they are **stored exactly as supplied**. There is even a comment in the code explaining why: so that a tax report stays correct even if rates change later.

This matches our fidelity rule perfectly. The customer's tax figures come across untouched.

### The posting method itself

There is one low-level method that every posting path in the whole system goes through. It takes lines that are already worked out and writes them. It does not look up exchange rates, does not compute tax, and does not decide accounts. It checks the rules: at least two lines, each either a debit or a credit, debits equal credits, and every account is real, active and postable.

**This is exactly the door a migration should use.** We arrive with the customer's numbers already decided, and the system checks our arithmetic without second-guessing our figures.

The trade-off is real and worth stating plainly: **we own the correctness of what we send.** The engine will confirm it balances. It will not confirm it is right.

---

## 5. Currencies and exchange rates

| Question | Answer |
|---|---|
| Must an exchange rate exist in the system to post a foreign-currency document? | **Not on the path a migration uses.** We supply the document's own rate |
| What about the normal manual path? | It requires a rate, and **fails loudly** if one is missing. It never silently assumes 1 |
| Where are a currency's decimals defined? | Per currency, per tenant. KWD 3, AED 2 |
| How is money held internally? | With 6 decimals, then rounded to the currency's real decimals in code |

So a purchase made in AED by a Kuwaiti company keeps its own rate, exactly as the old system recorded it. Which is what our fidelity rule requires.

---

## 6. Tax

| Thing | What it is |
|---|---|
| `tax_codes` | A rate, whether it is included in the price or added, and its category (standard, zero, exempt, reverse charge) |
| `tax_rates` | Rate history over time, so old documents keep old rates |
| `tax_groups` | Several taxes combined, for places like India |

**For a no-tax country such as Kuwait:** nothing is needed. No tax codes, no tax accounts. Lines simply carry no tax, and the tax interface is hidden.

**For a VAT country:** every rate and category the customer ever used must exist before the documents that reference it are loaded, each pointing at the right tax accounts.

---

## 7. Payments, bank and cash

- Payment types (cash, card, and KNET for Kuwait) **are created automatically** at signup.
- The accounting behaviour follows the payment **method**, not its name. Renaming a tender changes nothing in the books.
- Bank and cash **accounts** are not automatic. They come from the chart of accounts.
- A tender can optionally point at a specific account, but normally it does not need to.

So before loading any payments, every payment method the customer historically used needs a real cash or bank account behind it.

---

## 8. Order of work for this layer

1. **Create the chart of accounts.** Either our template, or the customer's own, or both.
2. **Make sure every role has an account bound to it.** There is a safe, repeatable step that fills in anything missing.
3. **Create the account mappings.** Defaults first, then any customer-specific overrides.
4. **Create tax codes and rates**, if the country has tax.
5. **Check every payment method has a cash or bank account behind it.**
6. Only now can a single document be loaded.

⚠️ If a migration writes accounts straight into the database instead of going through the proper step, the follow-up that fills in mappings for those new accounts **will not run**. Use the provided steps.

---

## 9. What the old system must tell us

| We need | Why |
|---|---|
| Their full chart of accounts: code, name, type | So their reports look like their reports |
| **Which of their accounts is receivables, payables, stock, cost of sales, tax, cash, bank, retained earnings** | This is the mapping table. Roughly 20 to 30 decisions. **This cannot be guessed** |
| Their tax codes and rates, with dates | So old documents keep the right rate |
| Their payment methods, and the account each settles into | So payments land in the right place |
| Currency decimals if unusual | Usually standard |

The second row is the one that needs a human. It is a short conversation with the customer's accountant, once, and it decides the correctness of everything that follows.

---

## 10. Traps

| Trap | Consequence |
|---|---|
| Chart of accounts not set up before loading | **Nothing posts at all.** Every document fails |
| Party not tagged on receivables and payables lines | Statements and aging come out empty, even though the invoices are there |
| Due date not set | Everything lands in the wrong aging bucket |
| Accounts written directly instead of through the proper step | Mappings for those accounts never get created |
| Customer account codes clashing with our system account codes | Refused, because system accounts cannot be renumbered |
| Assuming the engine checks our figures | It checks the entry balances. It does not check it is right |

---

## 11. Open questions

1. Is posting into a **closed** period blocked in the service layer as well as by the database rule? Layer 1 confirmed the database rule. Worth pinning down the exact reopen path.
2. The full list of role names (receivables, payables, and so on) was not written out. Needed before we build the mapping table, and it is a five-minute lookup.
3. What happens if a posting fails mid-replay because of a missing mapping? There is a dead-letter mechanism. We need to know whether it retries, so a replay can be resumed safely.
