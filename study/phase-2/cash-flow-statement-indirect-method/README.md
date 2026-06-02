# Cash Flow Statement — Indirect Method (DEV-361)

The third primary financial statement. Profit ≠ cash: a profitable business can run out of
cash (inventory build-up, slow receivables, capex), and a loss-making one can be cash-positive
(depreciation, drawing down deposits). The CFS explains the change in cash over a period.

## Why the indirect method
Two ways to present operating cash flow:
- **Direct** — list actual cash receipts/payments. Faithful but requires tagging every cash
  movement; rare in practice.
- **Indirect** — start from net profit and *reverse out* the accruals: add back non-cash
  charges, adjust for working-capital movements. This is what almost every ERP/accountant uses
  because it reconciles the P&L to the balance sheet using data you already have.

## The key insight: it foots by double-entry
The deepest idea behind the implementation. In a balanced ledger, the sum of *every* account's
movement over a period is zero (every debit has a credit). Split accounts into **cash** and
**non-cash**:

    Σ movement(all) = 0   ⟹   movement(cash) = −Σ movement(non-cash)

So the change in cash equals the negative of the movement of everything else. The CFS is just a
**reclassification** of those non-cash movements into three buckets — operating, investing,
financing. If every non-cash account is classified into exactly one bucket, the statement
*cannot* fail to foot. This is why the engine is "movement-based" rather than a hand-assembled
list of adjustments: correctness is structural, not clerical.

A corollary: P&L accounts are folded into net profit (which equals `−Σ movement(income+expense)`),
so only **balance-sheet** account movements need a cash-flow category. The depreciation "add-back"
isn't special-cased — it emerges automatically because accumulated depreciation (a balance-sheet
account, operating) moves, and its movement is the add-back.

## Classifying movements (sign convention)
All movements computed as signed debit-positive (`Σdebit − Σcredit`). Cash impact of a
non-cash account = `−movement`:
- Asset increase (debit, +movement) → cash **outflow** (you spent cash to build the asset).
- Liability increase (credit, −movement) → cash **inflow** (you deferred a payment).
A single rule (`−movement`) handles both because double-entry already encodes the direction.

## Cash & cash equivalents (IAS 7)
The "cash" bucket isn't just the bank account. IAS 7 includes short-term, highly-liquid
instruments (≤3 months). The subtle one: **bank overdrafts repayable on demand** that form part
of day-to-day cash management are treated as *negative cash*, not as financing (IAS 7.8). So an
overdraft is part of the reconciling cash balance and swings the closing-cash figure negative —
it is not a financing line. Identifying the cash set reliably needs an explicit flag, not
code-prefix guessing (a tenant can rename/recode accounts).

## Two traps that break footing (and how they're handled)
1. **Year-end closing entries.** The close zeroes P&L into retained earnings. If a report period
   contains the close, net profit appears to collapse to zero and the real profit "leaks" into an
   equity account. Fix: exclude closing entries from *both* the opening and closing snapshots.
   Because the exclusion is symmetric, accumulated prior balances still cancel in the subtraction,
   so period net profit stays correct for within-year, full-year, and multi-year ranges alike.
2. **Equity movements that aren't net income.** Dividends and capital contributions move equity
   but aren't operating. They must be classified as **financing** (via dedicated dividends-payable
   / dividends-declared accounts), while retained earnings' net-income component is already in
   operating via net profit. Anything left unclassified is surfaced on an explicit
   "unclassified" line with a `reconciles=false` flag — the statement degrades loudly, never
   silently misstates.

## Design principle that generalised
For financial reports, prefer an engine whose correctness is **guaranteed by an invariant**
(here: double-entry) over one that assembles the right answer step by step. Then add an explicit
assertion of the invariant (opening cash + net change == closing cash) and make any residual
*visible* rather than swallowed. A wrong-but-confident financial statement is worse than one that
admits it doesn't tie.
