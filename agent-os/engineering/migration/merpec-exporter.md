<!-- Zerupt internal knowledge base | Migration intake: the Merpec exporter | Updated: 2026-10-02 -->
# The Merpec exporter

Part of the [Zerupt Migration Intake Specification](README.md).

**In one line:** the first adapter. One command line tool that turns any Merpec company's data into the bundle the replay engine accepts.

The rest of this specification is deliberately not about Merpec. This page is the exception, because Merpec is the first real source and the exporter shows what an adapter looks like. A different source system gets a different exporter that produces the same bundle. The intake stays ours.

Where it lives: `erp/tools/merpec-export/` (workspace package `@zerupt/merpec-export`). Its own `README.md` has the commands.

---

## 1. What it does

**One tool for every Merpec company.** Nothing in the code is specific to a company. You give it a company id, it fetches that company's forms from the Merpec API (or reads a saved dump with `--in`, no network) and writes the bundle.

| Item | Detail |
|---|---|
| Fetch | Needs `MERPEC_API_URL` (or `--api-url`). There is no built-in host. With neither set, a fetch stops with a clear message. Converting a saved dump needs no URL |
| Country | Read from the company address, or given with `--country` when the address names none |
| Output folder | `<out>/<CompanyId>-<YYYYMMDD>/` |
| `bundle.ndjson` | The envelope line, then records by layer: structure, financial, masters, history in `seq` order, proof |
| `summary.md` | Rows in against records out, transformations, observations, fields not carried, unconverted tables, unknown forms, validation problems, open questions |
| `problems.json` | Every schema problem found by Zerupt's own shared schemas, with the NDJSON line number |
| `raw/` | The API responses as received, reused on the next run unless `--fetch` |

---

## 2. The principle: convert, never decide

Every Merpec record becomes its Zerupt record **at face value**. The exporter never drops, filters, fixes or guesses.

- A field Zerupt cannot hold rides in the record's `extras` and is listed under "Not carried" in the summary.
- A record Zerupt will reject is **still written**. Zerupt's validator shows it on the check screen, where the operator can see it. This is the same rule as [section 6 of the main document](README.md): a difference the customer can see beats a correction they cannot.

---

## 3. The structural transformations

Only changes of shape are allowed, and each is counted in the summary.

| Merpec shape | Zerupt shape |
|---|---|
| A location (selling site and stock site in one) | A **branch plus a warehouse** under it, both with the location code. If the tenant already has a branch for that site (for example the onboarding head office), the operator links the location to it at mapping; the exporter never decides this, and a duplicate create is refused. See [Layer 1](layer-1-structure.md) |
| A voucher with several lines | One record per line, numbered `<SrNo>#<Sr>`. A one-line voucher keeps its own number |
| A stock adjustment mixing ADD and LESS | One record per type, `<SrNo>#ADD` and `<SrNo>#LESS` |
| A cash or bank sales return | A credit note plus a customer refund |
| A return line on an item sold across several invoice lines | Split across those lines in order, never past each line's sold quantity |
| A purchase return with no `PurchaseSrNo` ("Invoice Not Available") | A **free-standing** `purchaseReturn`: no `billRef`, `supplierRef` = `SupplierCode`, and each line `itemRef` = `ItemCode`, `warehouseRef` = the header `LocationCode` (the same warehouse ref purchases use), `unitPrice` = `Rate`. Stock leaves at Zerupt's weighted average cost, not at `Rate`, and the gap posts to price variance. See [Layer 5b](layer-5b-purchase-stock.md) |
| A purchase return whose bill belongs to **another supplier**, or with quantity no remaining bill line can take (PRV5000001) | The return document's `SupplierCode` is the fact: the same **free-standing** `purchaseReturn` for its own supplier, no `billRef` (the contract forbids mixed line types). `PurchaseSrNo` stays in `extras` as `MerpecPurchaseSrNo`, warned `return_not_creditable`. The bill's lines are not consumed |
| A sales bill's `BillDiscount` on a bill with **no tax** (no taxed line, no Merpec tax: every Kuwait/Qatar bill) | Zerupt's **native** `billDiscount` (the direct sale's order discount, pro-rated into the lines by the sales totals engine). Merpec takes it after tax and Zerupt before tax, which is the same figure only on an untaxed bill. No journal |
| A purchase total below line nets + tax (Merpec's purchase `BillDiscount`, FP40000028) on an untaxed bill | **Native line discounts**: the header discount pro-rated over the line nets at the currency's decimals by the shared `allocateProportionalWithResidual`, exactly how DirectPurchase applies a header discount (net method, so item cost and AP are net of it). The `purchaseInvoice` contract has no header discount field; this posts the same thing. Each line keeps `MerpecDiscount` and `BillDiscountShare` in `extras` |
| A receipt's **negative** bill adjustment (it spends a sales return's credit: RV40000021 `CRV5000038 -10`) | Netted out of the positive allocations in row order (only the receipt's own customer's invoices), so the receipt carries **cash only**. For each invoice the credit landed on, one `journal` `<receipt>#RETURNCREDIT-<n>` right after the receipt: Dr sales return / Cr AR control (customer), `linkedInvoiceRef` = that invoice, so the replay settles the invoice through its one settlement writer. The same amount is taken off the return's own face-value journal (dropped at 0), so the customer's GL total is unchanged |
| A journal line on a customer or supplier code | A **synthetic AR or AP control account** plus the party. The due date is the journal date, because Merpec has none and the posting engine requires one on every receivable or payable line |
| A payment line on a **customer** code, or a receipt line on a **supplier** code | Cash paid to a customer or received from a supplier with no document to refund. Zerupt's `customerRefund` needs a credit note or receipt and `supplierRefund` a purchase return, which Merpec does not name, so it is a **journal** on the AR/AP control account with the party: Dr AR (customer) / Cr cash-bank, or Dr cash-bank / Cr AP (supplier), due on the voucher date |
| A payment bill adjustment's supplier invoice number | `billRef` is the purchase with that invoice number. Merpec lets a user retype a purchase's InvoiceNo after it was paid (ALDAR PV50000009 / PV50000011), so with no match the purchase is found by **supplier + BillDate + TotalAmount = BillAmount**, never claiming a purchase an exact match took; identical rows pair with exactly as many identical bills in order (interchangeable for settlement), any other count stays unresolved. An unresolved row is **never a dangling ref**: its cash stays unallocated on the payment (the replay books it as a supplier advance to apply by hand), kept in extras as `MerpecUnresolvedBills` with a `missing_ref` warning, and the line's Discount goes to the `#DISCOUNT` journal (an advance cannot carry one) |
| The cost of a returned item put back by `<SrNo>#STOCK` | The replay requires a positive `unitCost` on a stock increase and never defaults it. First real source: the item's latest purchase Rate on or before the return, else its earliest purchase after it, else ItemMaster `CostPrice` when > 0 (`MerpecCostSource` in line extras). None of them: no `unitCost` and a `return_stock_uncosted` warning, never a zero |
| A voucher line with a Discount | Receipt or payment `amount` and tender equal the **cash** (line amount minus Discount). Allocations keep Merpec's gross bill amounts. Each allocation carries its share as `discount`, plus the header `discount`. No generated journal and no synthetic discount account. See [Layer 5c](layer-5c-money.md) |
| The discount on one voucher line | Shared **pro rata over the bills** it cleared, floored at the finest scale in play, with the rounding remainder handed out in row order up to each bill's headroom. Deterministic. A discount larger than the allocations is capped and the shortfall is counted |
| `StockItem` | `"0"` is stock, `"1"` is non-stock. Any other value defaults to stock, with the raw value kept in `extras` and counted |
| Customer `PaymentTerm` | It is a **credit limit**, not days. `creditLimit`, with `0` or blank meaning no limit (omitted) |
| Sales and purchase lines | Renumbered 1 to n, which Zerupt requires. Merpec's `Sr` stays in `extras` |
| A transfer | Sent and received at the same instant (local midnight, company timezone) |

Two accounting choices follow the replay rules:

- **Sales lines carry no `unitCost`.** Zerupt costs them at the live company-wide average during replay. See [Layer 5a](layer-5a-sales.md).
- **Purchase freight and, for a company not registered for VAT, the purchase tax are capitalised** through `freightOnInvoice`. A VAT company's lines carry `taxCodeRef` instead. See [Layer 5b](layer-5b-purchase-stock.md).

### Face value: native first, journal last

Merpec's document total (what the party owes) and its recorded VAT are the customer's figures. Each document is sent as **Zerupt will post it** and Zerupt's own logic produces the books. A `<doc>#FACEVALUE` journal (party leg, cash leg, VAT leg, residual to Merpec's discount or sales-return account) follows a document **only where Zerupt has no native representation**:

| Case | Why a journal |
|---|---|
| Post-tax `BillDiscount` on a **taxed** bill, or a header `TaxAmount` that differs from Zerupt's per-line tax | Zerupt's bill discount is pre-tax; sending it would rewrite the VAT Merpec filed |
| A purchase total below lines + tax on a **taxed** bill, or below the line nets themselves | Same VAT reason; no line can carry a discount above its net |
| A sales return with **no invoice line to credit** (no `SalesSrNo`, or its items are not on the invoice) | Zerupt has **no invoice-less credit note**: the contract requires `creditNote.invoiceRef`, `CreditNotesService` requires an invoice, and a receipt cannot apply a credit note. The money is the journal (Cr AR customer / Dr sales return), the goods come back through `<SrNo>#STOCK` |

When the journal relieves an invoice or bill (Merpec below Zerupt) it names it (`linkedInvoiceRef` / `linkedBillRef`) and the replay settles that document. The receipt and payment caps walk counts that relief when it measures what is still open.

A spent return credit is recognised on the **receipt's date**, not the return's: between the two dates Zerupt shows the applied part as still owed. The cutover party balance, the invoice balances and the cash are Merpec's.

---

## 4. History order

Merpec has no global sequence number. So `seq` is the position after sorting by date, then a configured day order for document types (`HISTORY_DAY_ORDER` in `src/config.ts`), then Merpec's creation timestamp, then the legacy id. The envelope window runs from the day before the first event (exclusive) to the last event.

---

## 5. Open questions

Printed at the end of every `summary.md`, from `src/open-questions.ts`.
