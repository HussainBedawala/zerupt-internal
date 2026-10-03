<!-- Zerupt internal knowledge base | Migration intake: Layer 3b | Updated: 2026-10-02 -->
# Layer 3b: Customers and suppliers

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** the people and businesses the customer sells to and buys from.

---

## 1. Headline findings

**1. Customers and suppliers are two separate lists, with no link between them.** A business that both buys from and sells to the same company (very common in wholesale) gets two unrelated records. Their receivable and their payable never see each other. Worth telling the customer up front, because their old system may have treated it as one record.

**2. We can keep their original codes.** Unlike document numbers, a party code can be supplied exactly as it is in the old system. Their customer `SA30000058` stays `SA30000058`. Nothing has to be built for this.

**3. Only the name is genuinely required.** Everything else is optional, so thin legacy data still imports.

**4. There is no salesperson record.** A salesperson on a document is just a pointer to a **user account**, with no checking behind it. So a business with salespeople who are not system users has nowhere proper to put them, and a wrong value is accepted silently. This is a real gap for any wholesaler who tracks sales by salesperson.

**5. There is already an import built for exactly this**, a spreadsheet that brings in the party list **and their opening balances together**. It is the right tool.

---

## 2. What a customer or supplier is

Both lists have almost the same shape.

| Field | Type | Need | Notes |
|---|---|---|---|
| `name` | text, max 300 | **required** | The only truly required field |
| `code` | text, max 50 | optional | Generated if missing. **We supply the legacy code** |
| `nameAlt` | text | optional | Arabic or second language |
| `phone` | text | optional | |
| `email` | text | optional | |
| `taxNumber` | text, max 50 | optional | **Unique** within the tenant, ignoring case and spaces |
| `defaultCurrency` | 3 letters | optional | |
| `defaultTaxGroupId` | link | optional | A default only, can be overridden per line |
| `status` | list | required | `active` by default. `blocked` is the blacklist |
| `blockedReason` | text | conditional | **Required if blocked.** The database enforces this |
| Payment terms in days | number | optional | Plain number of days |
| `creditLimit` | money | optional | Must be zero or more |
| `notes`, `imageUrl` | text | optional | |

**Customers also have:** a default price list.
**Suppliers also have:** a country code, which matters for import tax treatment.

### Contacts and addresses

Both have their own child lists:

- **Contacts:** name, role, phone, email, and a primary flag.
- **Addresses:** a label such as Billing or Shipping, address lines, city and country. Many per party. Line 1, city and country are required on each.

Note: the address country is **free text**, not a proper country code. Messy legacy values will be accepted as they are.

---

### Party fields in the replay record

The replay customer and supplier records carry, beyond name and code:

| Field | Notes |
|---|---|
| `address` | One postal address. Line 1, city and country are mandatory, never invented. Written in batches after the parties. A failed address warns `address_failed` and never rolls the party back. On a resume the address is written only if the party has none yet, so it is never duplicated |
| `status` | `active`, `inactive` or `blocked` |
| `blockedReason` | **Required when `status` is `blocked`**, checked by the record's schema and by the database |
| `creditLimit` | A money string. Zero or absent means no limit |

A party that was created by this migration has its address re-checked on resume. A party that was only linked to an existing record is left alone.

*Code: `layers/masters.runner.ts`, `masters-parties.addresses.ts`; schema in `records-masters.ts`.*

---

## 3. Codes: an important difference from documents

| | Documents | Parties |
|---|---|---|
| Can we supply the original number? | **No.** Must be built | **Yes.** Works today |

When we supply a code, it is used exactly as given and the automatic counter is not touched. If the code already exists, it is rejected loudly rather than silently changed. That is the behaviour we want.

⚠️ **One inconsistency found:** supplier codes are unique ignoring case, but customer codes are case-sensitive. So `CUST-01` and `cust-01` could both exist as customers but not as suppliers. Minor, but it means customer codes need cleaning before import while supplier codes are protected.

---

## 4. Commercial terms: simpler than most old systems

| Thing | How it works here |
|---|---|
| Payment terms | **A plain number of days.** There is no named-terms list |
| Credit limit | A number on the record. **Not enforced when a document is created** |
| Blacklist or credit hold | Status set to `blocked`, with a reason |
| Default price list | Customers only |
| Default salesperson | **Does not exist** |

So a legacy term like "30 days from end of month" or "2% discount if paid in 10 days" collapses to a plain day count. That is a real loss of detail, and it should be mentioned to the customer rather than discovered by them.

---

## 5. Opening balances are not stored on the party

There is **no opening balance field** on a customer or supplier. Balances exist only in the ledger.

The spreadsheet import does have an opening balance column per party, but behind the scenes it creates a journal entry against the party-tagged control account. The number never lands on the party record itself.

This is consistent with [Layer 2](layer-2-financial.md): balances and aging are worked out from the ledger, not stored. It also means **parties must exist before their opening balances can be posted**, which sets the order of work.

---

## 6. Salespeople: a genuine gap

There is no salesperson table anywhere. Documents carry a salesperson field that points at a **user account**, with no checking at all.

Consequences for a migration:

- If the customer's salespeople are also system users, we map them and it works.
- If they are not users, there is nowhere correct to put them. Options: create them as inactive users, or keep the name in a legacy field and lose sales-by-salesperson reporting.
- **A wrong value is accepted silently.** Nothing will complain, and the reports will quietly be wrong.

Commission: no commission table was found. A source system that calculates salesperson commission has nowhere to put it today.

**This needs a decision before migrating any customer who uses salespeople.**

---

## 7. How parties get created

| Path | Use |
|---|---|
| One at a time | Manual work. Includes a helpful warning when a name looks like a duplicate |
| **The spreadsheet import** | **What a migration uses.** Brings in parties and opening balances in one go |

The spreadsheet covers: name, second name, code, opening balance, phone, email, tax number, payment term days, credit limit, status, address fields and notes. Only the name and opening balance are required. Invalid emails are cleaned rather than rejected, and it never throws away a value.

When a name already exists, it **merges** rather than creating a duplicate.

Two things the spreadsheet does not cover: the default price list and the default tax group per party. Those need a short follow-up pass if the customer uses them.

---

## 8. What the old system must tell us

| We need | Notes |
|---|---|
| Customer list and supplier list, **separately** | Even if their system keeps one list |
| Code, name, second-language name | Codes come across as they are |
| Phone, email, address | |
| Tax registration number | Must be unique |
| Payment terms | As a number of days |
| Credit limit | |
| Blocked or blacklisted, and why | A reason is required if blocked |
| Default currency | |
| Unpaid balance, invoice by invoice | Covered in Layer 4. Not a party field |
| Salespeople, and whether they are system users | See the gap above |

---

## 9. Traps

| Trap | Consequence |
|---|---|
| The same business as both customer and supplier | Two records, no link, balances never net off |
| Duplicate tax numbers in legacy data | Refused. Must be cleaned first |
| Customer codes differing only by case | Both would be created. Suppliers are protected, customers are not |
| Expecting named payment terms | Only day counts exist |
| Expecting the credit limit to block a sale | It does not today |
| Salesperson who is not a user | Accepted silently, reporting quietly wrong |
| Expecting balances on the party record | They live in the ledger only |

---

## 10. Open questions

1. **Two import paths exist**, a books import and a unified import. Which is the live one for parties? Domain 12 resolves this.
2. Is there any check on the **format** of a tax number per country? Only uniqueness was confirmed.
3. Do supplier codes and names get the same duplicate protection as customers? Inferred from a comment, not verified.
4. Customer payment term days may be missing the range check that suppliers have. Minor, but worth a ticket.
