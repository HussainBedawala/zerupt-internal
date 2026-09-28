<!-- Zerupt internal knowledge base | Migration intake: Layers 7 and 8 | Updated: 2026-09-27 -->
# Layers 7 and 8: Peripherals and proof

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** the settings that make a migrated tenant feel finished, and the reports that prove the migration worked.

---

## 1. Headline findings

**1. All the proof tools already exist.** ✅ Trial balance, profit and loss, balance sheet, stock valuation, stock levels, receivables aging, payables aging, customer and supplier statements, sales register, purchase register, stock movement ledger and tax reports. All read-only with no side effects, so we can run them as often as we like. **Layer 8 needs almost no building, only wiring.**

**2. Both reconciliation checks exist too.** ✅ One compares stock value against the accounts, the other compares customer and supplier balances against the accounts. These are the two places a migration silently goes wrong, and both already have a detector.

**3. There is a general-purpose import run tracker we should reuse.** ✅ It records each run with its status, progress, totals, a content fingerprint for safe repeats, and a lease with a heartbeat so a crashed run can be recovered. It was built for new importers to adopt. **That is our run tracking, already built.**

**4. Two real gaps: no attachments, and nowhere to record the original document number.** ❌ There is no way to attach a scanned invoice or a supplier's PDF to anything. And there is **no field on any document for the source system's own reference**, so "this came from their invoice 100001" has nowhere to live. Both need a product decision before we can claim full parity.

**5. Settings have to be relaxed during migration and put back afterwards, by hand.** There is no migration mode. We read the tenant's current settings, relax them, run, then restore exactly what was there before.

---

## 2. Attachments ❌

There is no attachment mechanism for documents, items or parties. File storage exists, but only for tenant logos and images, and for the raw spreadsheets the import pipeline holds.

So a customer whose old system held scanned delivery notes or supplier invoices **cannot have them brought across**. This is a genuine gap, not a workaround, and it needs to be stated plainly to any customer who relies on it.

---

## 3. Print settings

Print settings resolve in layers: country, then brand, then pack, then tenant, then branch, then document type. Only the differences are stored, so most of it is automatic.

What a migration should set, so the tenant feels finished on day one:

- The company logo, uploaded to the tenant's own storage area
- Header, footer and terms text
- Branch address details
- Label templates, if they print labels

Label templates are proper named records with a default per branch, not a settings blob.

**Open question:** whether print settings are created at signup or simply resolved on demand. Either way there is nothing blocking us.

---

## 4. Settings to change during migration

There is no single switch, so we snapshot, relax and restore.

| Setting | Why relax it |
|---|---|
| **Negative stock policy** | Their history may contain sales made with no stock. Set to flexible during the replay |
| **Approval gates** (confirming purchases over a threshold, posting supplier payments, voiding bills, voiding invoices, confirming returns, amending till sales) | A replay that includes voids and amendments would otherwise stop waiting for approvals |
| POS approval gates | Per register, off by default. Only matters if they opted in |

⚠️ **Restore means putting back exactly what was there, not defaulting everything to off.** So the snapshot has to be taken before anything is touched.

---

## 5. Will the customer be emailed about three years of history?

Mostly no, and what remains can be turned off.

- **Internal notifications** can be disabled in bulk for the migration window, then re-enabled.
- **Some events are owner-locked and cannot be silenced.** They exist to protect the owner from an insider bypass. If our replay relaxes approval gates, an owner-locked alert may well fire. Better to know and warn the owner than to be surprised.
- **No automatic customer-facing invoice email was found** on document creation. Strongly suggestive, not yet proven, and it is worth proving before the first real run.

---

## 6. The reports we use as proof ✅

| Report | Shape |
|---|---|
| Trial balance | As of a date |
| Profit and loss | Date range |
| Balance sheet | As of a date |
| Stock valuation | As of a date, by warehouse. Permission-gated, since it shows cost |
| Stock levels | By warehouse and branch |
| Receivables aging, payables aging | As of a date. Control accounts resolved by role, never hardcoded |
| Customer and supplier statements | Date range, per party |
| Sales register, POS sales summary | Date range, by branch |
| Purchase register | Date range |
| Stock movement ledger | Date range, by item and warehouse |
| Tax summary, and the UAE VAT return | Where tax applies |

All read-only. Running them repeatedly triggers nothing.

**So the reconciliation report we need is a wrapper**: call each report, compare to the customer's figures, and print the differences. That is a small piece of work on top of what exists.

---

## 7. The two reconciliation detectors ✅

| Detector | What it compares |
|---|---|
| Inventory reconciliation | Stock value against the inventory account in the books |
| Subledger reconciliation | Customer and supplier balances against their control accounts |

The inventory one records each run, with states such as tied, variance or needs review, and a decision of whether to accept the stock side or keep the books side. Once resolved, a run cannot be edited; a new run supersedes it.

These two cover exactly the two failure modes we identified in [Layer 4](layer-4-opening.md) and [Layer 2](layer-2-financial.md).

---

## 8. Recording what we did ✅ and ❌

**What exists:** a general import run table with status, totals, progress, a content fingerprint used as a safety key, and a lease with a heartbeat so a crashed run can be picked up. It was explicitly built for new importers to use, and a migration is a new importer.

**What does not:** any field on a document for the source system's reference. So today, an invoice migrated from their system has our number and nothing pointing back to theirs.

Combined with the confirmed gap on document numbers in [Layer 1](layer-1-structure.md), this is the same problem seen twice:

> **A migrated document cannot carry its original identity.** Not as the number, and not as a reference.

Both are fixed by the same small build: a source reference on documents, plus the ability to set the number.

⚠️ One detail on the fingerprint: it is built from the content, so a corrected export counts as a **new** run rather than a continuation. Safe, but it means our tool must handle "the source changed" deliberately rather than assuming it can resume.

---

## 9. What the old system must tell us

| We need | For |
|---|---|
| Logo, header, footer, terms | Printing that looks like theirs |
| **Their trial balance, as of the extract moment** | Proof |
| **Their stock quantity and value per item and warehouse** | Proof |
| **Their customer and supplier balances, and aging** | Proof |
| **Their sales and purchase totals per month** | Proof |
| Their tax figures per period, where tax applies | Proof |
| Attachments, if any | Cannot be migrated today. Must be said out loud |

---

## 10. Traps

| Trap | Consequence |
|---|---|
| Restoring settings to defaults instead of what was there | The customer's own preferences are silently changed |
| Assuming total silence during replay | Owner-locked alerts still fire |
| Promising attachments | Not supported at all |
| Promising the old invoice number is visible | Nowhere to put it today |
| Comparing our reports to a **live** source system | The old system keeps moving. Figures must be frozen at extract time |

---

## 11. Open questions

1. Is there any automatic customer-facing email on document creation? Nothing found, and it must be proven before the first real run.
2. Are print settings created at signup or resolved on demand?
3. What exactly does each report take as parameters? Needed when wiring the comparison.
4. **Will we build attachments and a source reference before the migration ships, or accept both gaps?** A product decision, and the customer-facing consequences differ a lot.
