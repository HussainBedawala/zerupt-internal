# 02 — Opening Balances

## The problem: starting mid-life

A new accounting system rarely starts with a brand-new business. It usually starts with
a going concern — a retailer that has been trading for years, keeping books in a
spreadsheet, or in a legacy system they are migrating away from. On the go-live date, the
new system has zero entries. But the business has real assets, real liabilities, and real
equity accumulated over its life.

The process of seeding those real balances into the new system is called **entering
opening balances**. Done correctly, the new system's trial balance on day one equals the
prior system's trial balance on the last day before go-live. Done incorrectly, the new
system starts with a balance sheet that does not reflect reality, and every report
produced from it is wrong.

## The opening journal entry

Opening balances are posted as a single journal entry — or a small set of journal entries
— dated to the last day of the prior system (or the first day of the new system, depending
on convention). This entry is often called the **opening journal** or **migration journal**.

The structure is:

```
DR  [every asset account with a balance]       X
      CR  [every liability account with a balance]          X
      CR  [every equity account with a balance]             X
      CR/DR  Opening Balance Equity (3100)             [plug]
```

**Opening Balance Equity (OBE)** is a temporary clearing account in the equity section of
the COA. It exists solely to make the opening journal balance. Once the opening entry is
posted and verified, the OBE account should carry the residual — positive or negative —
that makes the equation Assets = Liabilities + Equity hold.

After verification, OBE is zeroed into **Retained Earnings (3120)** with a reclassifying
entry (or it is treated as a component of equity in reports until year-end close). It
should never carry a balance after the first period close.

## Worked opening balance example

The business: Riyadh Trading Co. Migration date: 31 December 2024 (go-live 1 January
2025). Reporting currency: SAR.

**Prior system trial balance at 31 December 2024:**

| Account | Balance | Side |
|---------|--------:|------|
| Cash in Hand (1111) | 3,000.00 | Asset |
| Bank — Al Rajhi (1121) | 45,000.00 | Asset |
| Trade Receivables (1131) | 18,500.00 | Asset |
| Merchandise Inventory (1141) | 32,000.00 | Asset |
| Furniture & Fixtures (1510) | 25,000.00 | Asset |
| Accumulated Depreciation (1511) | (8,000.00) | Contra-asset (credit) |
| Trade Payables (2111) | 22,000.00 | Liability |
| VAT Payable (2131) | 1,200.00 | Liability |
| Share Capital (3110) | 50,000.00 | Equity |
| Retained Earnings (3120) | 42,300.00 | Equity |

**Net equity check:**
Assets: 3,000 + 45,000 + 18,500 + 32,000 + 25,000 − 8,000 = 115,500.00
Liabilities: 22,000 + 1,200 = 23,200.00
Equity: 50,000 + 42,300 = 92,300.00
Check: 115,500 − 23,200 = 92,300. The prior system balances.

**Opening journal posted in the new system on 1 January 2025:**

```
DR  Cash in Hand (1111)              3,000.00
DR  Bank — Al Rajhi (1121)          45,000.00
DR  Trade Receivables (1131)        18,500.00
DR  Merchandise Inventory (1141)    32,000.00
DR  Furniture & Fixtures (1510)     25,000.00
      CR  Accumulated Depreciation (1511)          8,000.00
      CR  Trade Payables (2111)                   22,000.00
      CR  VAT Payable (2131)                       1,200.00
      CR  Share Capital (3110)                    50,000.00
      CR  Retained Earnings (3120)                42,300.00
```

Total debits: 3,000 + 45,000 + 18,500 + 32,000 + 25,000 = 123,500.00
Total credits: 8,000 + 22,000 + 1,200 + 50,000 + 42,300 = 123,500.00
Balanced. OBE is not needed here because the prior system balanced exactly and all
equity was posted directly to the correct equity accounts.

When the prior system TB does not balance (which happens with spreadsheet books or
systems that allowed unbalanced entries), OBE absorbs the difference:

```
DR  [assets]       115,500.00
      CR  [liabilities]                    23,200.00
      CR  [known equity]                   92,000.00   ← e.g., only share capital known
      CR  Opening Balance Equity (3100)       300.00   ← plug = 300 unknown equity
```

The OBE credit of SAR 300 means the prior system's known equity was understated by SAR 300
(or the assets were overstated, or the liabilities understated). The accountant investigates
and reclassifies OBE once they know where the difference belongs.

## Per-party AR and AP opening balances

A single GL entry for **Trade Receivables (1131)** at SAR 18,500 establishes the control
account balance. But the AR subledger needs the per-customer detail: which customers owe
money, on which invoices, and how old they are.

The opening AR detail is entered as a list of open customer invoices aged to the migration
date:

| Customer | Invoice # | Invoice Date | Amount (SAR) |
|----------|-----------|:------------:|-------------:|
| Al Faris Trading | INV-2024-0231 | 15 Nov 2024 | 4,200.00 |
| Al Faris Trading | INV-2024-0267 | 10 Dec 2024 | 3,100.00 |
| Nadia Retail | INV-2024-0244 | 2 Dec 2024 | 6,800.00 |
| Gulf Stars | INV-2024-0255 | 18 Dec 2024 | 4,400.00 |
| **Total** | | | **18,500.00** |

The total must match the GL entry for 1131 exactly. This proves the subledger is
complete. The aged data also seeds the AR aging report from day one.

AP opening balances follow the same pattern: list every open supplier bill, match the
total to the 2111 GL entry.

## Inventory opening balance: quantity × WAC

**Merchandise Inventory (1141)** at SAR 32,000 in the GL is derived from the stock
subledger: for every item at every location, the opening quantity times the opening
weighted average cost must sum to SAR 32,000.

| SKU | Description | Qty | WAC (SAR) | Value (SAR) |
|-----|-------------|----:|----------:|------------:|
| SKU-A | Coffee Bags 1kg | 250 | 28.0000 | 7,000.00 |
| SKU-B | Tea Boxes 200g | 400 | 12.5000 | 5,000.00 |
| SKU-C | Sugar 2kg | 800 | 7.5000 | 6,000.00 |
| SKU-D | Cardamom 100g | 300 | 46.6667 | 14,000.00 |
| **Total** | | | | **32,000.00** |

The total ties to the GL. WAC is established at the migration date for each SKU — this
becomes the starting point for the moving-average calculation going forward.

A common mistake: importing opening quantities but estimating the WAC incorrectly. If
SKU-D's WAC is entered as 46.00 instead of 46.6667, the inventory subledger shows
300 × 46.00 = SAR 13,800 but the GL entry is SAR 32,000. The mismatch is SAR 200. The
stock valuation report will show a difference on the first day of operations. Fix: match
the WAC import to whatever cost the prior system carried, to 4+ decimal places.

## Dating: the opening period

Opening journal entries must be dated carefully. The convention is:

**Option A — Date to the last day of the prior period:** the opening entry is dated
31 December 2024. In the new system, 31 December 2024 is a special "opening period"
that contains only this one entry. Period 1 (January 2025) starts from a known state.

**Option B — Date to the first day of the new period:** the opening entry is dated
1 January 2025 and the new system's first period begins. This is simpler but means
January's TB includes both the opening balances and January's transactions together —
harder to isolate if something goes wrong.

Option A is preferable. It separates the opening data from operating data, making the
migration easier to audit and any subsequent corrections easier to scope.

## Idempotency: the re-import danger

Opening balance imports are often run multiple times — the accountant finds an error,
corrects the spreadsheet, and re-imports. If the system is not idempotent — if it appends
a new opening journal every time rather than replacing the previous one — the second
import doubles every balance. The GL shows SAR 37,000 in AR instead of SAR 18,500. Every
report is wrong, and the TB still balances (both sides doubled), making the error
invisible to the balance check.

The correct design:

1. Assign the opening journal a stable, known reference (e.g., `OPENING-2024`).
2. Before writing the new opening journal, delete (or reverse) any prior entry with that
   reference.
3. Write the new journal.

Or equivalently: the opening import is a single upsert, not an append. The idempotency
key is the migration date + the account. Re-running the import with corrected amounts
produces the same number of journal entries, not more.

## The danger of setting openings after transactions

If operational transactions are posted before opening balances are established, the
system is in an incorrect state from the start:

- Sales invoices have been posted, debiting AR, but AR has no opening balance — the AR
  balance is understated.
- Inventory purchases have been posted, but inventory has no opening stock — COGS will
  be overstated from the first sale.

The discipline: **no operational transaction may be posted until the opening balances
are imported and the opening TB has been verified.** This is enforced by locking the
opening period until the balances are confirmed, and by requiring the first period TB to
be reviewed and signed off before ordinary use begins.

## The mental model

> Opening balances are the claim that "on this date, the books start from this known true
> state." The opening journal is the one entry that seeds every account with its correct
> starting value. OBE is the honest plug for anything you cannot yet classify. Per-party
> AR/AP and per-SKU inventory detail must tie to the GL entries exactly — control account
> equals subledger sum, from day one. The import must be idempotent: re-running with
> corrections replaces the prior entry, never doubles it. And no operating transaction
> should ever be posted into a system whose opening balances have not been verified.

Next: `03-fiscal-periods-and-locking.md`.
