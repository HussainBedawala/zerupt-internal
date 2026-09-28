<!-- Zerupt internal knowledge base | Migration intake: Layer 6 | Updated: 2026-09-27 -->
# Layer 6: People and access

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** the staff, what they are allowed to do, and which branches they can see.

---

## 1. Headline findings

**1. Staff can be created silently, with no emails.** ✅ There is a username mode where the owner sets a password directly. The account is **active immediately**, with no invitation to accept and **no email sent**. That is exactly what a migration needs: nobody wants 15 staff members receiving surprise emails at 2am during a cutover.

**2. Only the Owner role exists at the start.** Every other job title has to be created. There is no ready-made "Cashier" or "Accountant" role waiting to be used. What does exist is a library of about 55 permission bundles, each one a meaningful capability such as "ring up a sale" or "manage the team". **So we assemble each legacy job title from bundles**, once per customer, by hand.

**3. Every staff member must be given branch access, or the account cannot be created.** It fails rather than defaulting to nothing or everything, which is the right choice. So the legacy branch-to-branch mapping must be worked out before any user is created.

**4. The cashier on a till sale must be a real user.** It cannot be left empty. A salesperson can be left empty, but if we put an unknown value there it will display as "Unknown user" forever. So the staff list has to be decided before POS history is loaded.

**5. There is a standard "system" identity for unknown authors.** A fixed value used across the system for things done by the system itself. A migration can safely stamp it on records whose original creator is unknown, and nothing needs creating first.

---

## 2. Where a user lives

A user is three things in three places:

| Place | What it holds |
|---|---|
| The login service | The actual account and password |
| The central registry | Their name, username, status, language, timezone, and which tenant they belong to |
| The customer's own database | Their roles and their branch access |

A migration creates all three, in that order, for every staff member.

---

## 3. Creating staff without emailing anyone ✅

Two ways to create a user:

| Mode | What happens | Use for migration? |
|---|---|---|
| **Username mode** | Owner supplies username, full name and a password. Account is **active immediately**. **No email** | **Yes** |
| Email mode | A real invitation email goes out. Account stays pending until accepted | No |

Username mode needs: username, password (at least 8 characters with a capital and a number), full name, a role, and branch access.

There is no bulk user import, so it is one call per person. For 10 or 15 staff that is nothing.

---

## 4. Roles

| Fact | Detail |
|---|---|
| Created automatically | **Owner only** |
| Everything else | We create it |
| Priority | Lower number means more senior. Owner is 0 |
| Names | Must be unique within the tenant, ignoring case |
| Per user | One role at creation. More can be added afterwards |
| Owner role | Can only be given by another owner |

**Permissions** are keys shaped like `module.thing.action`, grouped into about 55 **bundles** that represent real capabilities. A role holds bundles, which expand into the underlying permissions.

So mapping a legacy role list looks like this:

| Their role | Becomes |
|---|---|
| Cashier | A role holding the till bundles |
| Accountant | A role holding the accounting and financial reporting bundles |
| Store Manager | A role holding stock, sales and some settings bundles |
| Auditor | A role holding view-only bundles |

**There is no automatic mapping from a legacy role name to bundles.** It is a one-time human decision per customer, and it should be reviewed with the owner because it decides who can do what.

⚠️ **One limit:** whoever creates roles cannot grant more than they themselves hold. So the migration must run as the owner.

---

## 5. Branch access

| Setting | Meaning |
|---|---|
| All branches | Includes any branch created in future |
| Specific branches | A list |

**One of the two must be supplied for every non-owner.** The creation call fails otherwise. Owners always have everything, with nothing to set.

---

## 6. Salespeople and cashiers who are not users

| Field | Rule |
|---|---|
| Cashier on a till sale | **Required.** Must be a real user |
| Salesperson on an invoice | Optional, and unchecked |

There is **no staff record for people who do not log in**. So:

- Anyone who appears as a cashier in history must exist as a user. Either a real account, or a deliberately created placeholder such as "Former staff".
- A salesperson who never used the system can be left empty, at the cost of losing sales-by-salesperson reporting.
- Putting a made-up value in the salesperson field is possible, because nothing checks it, but it will show as "Unknown user" wherever it appears. **Not recommended.**

This connects to the gap already recorded in [Layer 3b](layer-3b-parties.md). It is the same missing concept seen from the other side.

---

## 7. Who did it: the audit trail

| Fact | Detail |
|---|---|
| Documents mostly have no "created by" column | Authorship lives in the audit log instead |
| The audit log requires a user on every entry | But it is not checked against a real account |
| A standard system identity exists for automatic actions | Safe for unknown legacy authors |
| The audit log cannot be changed or deleted | Enforced by the database |

⚠️ **Important for us:** the audit log is normally written automatically when something goes through the application. **If a migration writes records directly to the database, no audit entry is created.** So either we go through the proper services, which we are doing anyway, or we write the audit entries ourselves. This is a good reason to keep using the real service methods for every document.

---

## 8. What would reject legacy data

| Check | Note |
|---|---|
| **Seat limit from the plan** | Check the plan before creating staff |
| Username already used in this tenant | Must be lowercase and unique |
| **Email already used anywhere in Zerupt** | Rejected outright. One email, one tenant, across the whole platform |
| No branch access supplied | The account is refused |
| Weak password | At least 8 characters, one capital, one number |
| Trying to create an owner as a non-owner | Refused |

That third row is worth remembering: **an email that already exists in another Zerupt tenant cannot be reused.** For a customer with several companies, each one needs different email addresses.

---

## 9. What the old system must tell us

| We need | Notes |
|---|---|
| The staff list: name, username, email if any | Passwords never come across |
| Their job title or role | Becomes a role we build from bundles |
| Which branches each person works at | Required |
| Who is still active | Leavers do not need accounts, unless they appear as a cashier in history |
| Which staff appear as cashiers in history | These must exist as users |
| Which appear as salespeople | Optional, but decide before loading sales |
| Their role and permission list, if we can get it | Helps us build the right bundles |

---

## 10. Traps

| Trap | Consequence |
|---|---|
| Using email mode by mistake | 15 staff get surprise emails, and nobody can log in until they accept |
| Forgetting branch access | The account is refused |
| A cashier in history who is not a user | Those documents cannot be created |
| Made-up salesperson values | "Unknown user" appears forever |
| Reusing an email across tenants | Rejected platform-wide |
| Hitting the seat limit halfway through | Half the staff created |
| Writing records straight to the database | No audit trail at all |

---

## 11. Open questions

1. Is there a bulk user import anywhere? None found, and it hardly matters at this scale.
2. Is there a second built-in role beyond Owner? A name exists in the code, but nothing appears to create it.
3. **Is there a recommended way to handle a cashier who is not a real person any more?** Nothing in the code says. A placeholder account seems the practical answer, and it deserves a decision rather than an improvisation.
