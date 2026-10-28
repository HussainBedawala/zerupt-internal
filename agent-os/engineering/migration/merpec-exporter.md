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
| `summary.md` | Rows in against records out, transformations, observations, fields not carried, unconverted tables, unknown forms, the accounts the operator must map, every finding grouped by code (document, date, figures from the issue's structured fields), open questions |
| `problems.json` | The shared `MigrationProblemsFile`: `{formatVersion, summary, unusable, issues}`. One `MigrationIssue` per finding (section 6) |
| `raw/` | The API responses as received, reused on the next run unless `--fetch`. The `COMPANY` credential and access-right tables (`User`, `UserRole`, `Rights`, `rightsmast`, `rolemast`, `Menu`) are stripped before saving and again when a dump is read, so no password hash ever reaches disk, the report or the bundle |

---

## 2. The principle: convert, never decide

Every Merpec record becomes its Zerupt record **at face value**. The exporter never drops, filters, fixes or guesses.

- A field Zerupt cannot hold rides in the record's `extras` and is listed under "Not carried" in the summary.
- A record Zerupt will reject is **still written**. Zerupt's validator shows it on the check screen, where the operator can see it. This is the same rule as [section 6 of the main document](README.md): a difference the customer can see beats a correction they cannot.

---

## 3. The structural transformations

Only changes of shape are allowed, and each is counted in the summary.

**Masters a document names but the company's master lists lack.** Merpec's per-company dump can hold a document whose customer, supplier, item or location is not in that company's masters (company 3066's bill SB18000239 names customer SA21000070, location 306701HO and item IM21004826). Decision: import what the API returns; a document is never excluded for this. Before the lookups are built, every such code (read from the ref columns of every document kind: sales bills, returns, purchases, purchase returns, stock adjustments, transfers, journal / receipt / payment lines and their bill-adjustment rows) becomes a minimal source-shaped master row and goes through the normal converters, so a stub location is a branch + warehouse, a stub customer or supplier is an active party, and a stub item is stock-tracked (its stock can go negative). The name is the code, or for an item the line Description, else PartNo. Each stub raises one `source_value_defaulted` finding naming the code and the documents that reference it. A voucher line's `AccountCode` can be a chart account or a party, so it is not stubbed. A missing DOCUMENT ref (an invoice or bill that does not exist) is still excluded by the reference check.

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
| POS bill (POS / POSTrx / POSPayTrx / OpenDay, instead of SALESBILL) | `posSale` (Zerupt's POS module, not a sales invoice; `src/convert/pos.ts`). Terminal (POSACCOUNTSETUP) -> `register` (branch / warehouse = its LocationCode; a terminal only the OpenDay names is created, one finding); salesman -> `cashier`. registerRef = the bill's OpenDay terminal, cashierRef = SalesmanCode, completedAt = the bill Date at its keyed time. One payment per non-zero POSPayTrx row: `credit` -> `on_account`, any other row -> `paymentMethodRef` = its AccountCode (method cash for a CASH account, else card). `Amount` is what was applied; `Actual_Amount` (tendered, change given) rides in the payment extras as `MerpecActualAmount`. BillDiscount is split over the line nets by the shared residual allocator into line `discountAmount`, so lineTotal sums to NetAmount exactly. Stock lines carry `unitCost` (latest purchase Rate on or before the sale, else earliest after, else ItemMaster CostPrice; `MerpecCostSource`), none: `pos_line_cost_missing`. A POS bill is REFUSED (excluded with its dependants, reported, exit non-zero) for: tax; a SrNo shared with a SALESBILL bill; no lines; no register (OpenDay terminal) or no cashier (the bill's SalesmanCode, else its OpenDay's, counted); a tender with no account or an on-account tender with no customer; a stock line with no cost source (the replay would refuse it); payments or lines not adding up to NetAmount. Findings (not refusals): unknown/missing tender Type, Qty x Rate differing from the line Amount, no keyed time (completedAt 12:00:00), one operator mapping reminder per POS tender account (`posTender:<code>`). The source ledger rebuild books POS revenue GROSS with the discount as its own leg, like the POS journal entry. `IsDeleted` bills not carried (counted). A sales return naming a POS SrNo is NOT a credit note (Zerupt refuses a credit note against a posSale and cannot replay a POS return): it takes the existing no-line-to-credit path, a face-value journal for the money plus a `<SrNo>#STOCK` stockAdjustment putting the goods back (unitCost = latest purchase rule), one `return_not_creditable` finding per return, counted as "return against a POS bill -> face-value journal + #STOCK adjustment". A receipt BillAdjustment on a POS SrNo allocates to the posSale only when the bill has an on_account payment (the receivable the replay settles); otherwise the cash stays unallocated on the receipt (deposit), the row is kept in extras as `MerpecUnresolvedInvoices`, a `missing_ref` warning names it and the whole discount goes to the discount journal. The returns/receipt lookups read POS through `src/pos-view.ts` |
| CASHRECEIPT / BANKRECEIPT / CASHPAYMENT / BANKPAYMENT (instead of RECEIPTVOUCHER / PAYMENTVOUCHER) | The same receipt / payment records as the voucher forms (header, lines, bill adjustments mapped field for field by one table in `src/adapt/vouchers.ts`; VoucherType Cash/Bank Receipt/Payment; unmapped columns in extras). FinanceDiscount / FinanceRebate rows (shape unseen) raise one finding per row, never silently dropped |

POS, POSACCOUNTSETUP, CASHRECEIPT, BANKRECEIPT, CASHPAYMENT and BANKPAYMENT are optional forms: fetched only when GETFORMLIST lists them. The voucher forms are normalised into the classic arrays (`src/adapt/`) before masters are stubbed; POS is converted to posSale directly. A company with the classic forms is unchanged.

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

**The residual is bounded, never a plug.** What the journal sends to the discount account (Merpec total less Zerupt total, less the VAT delta) must equal the part of the document's `BillDiscount` that Zerupt does not already absorb (sales and purchase alike; 0 when sent natively; on a purchase the expenses and non-VAT capitalised tax absorb the discount first, so only `BillDiscount` beyond them rides the journal) or be rounding: at most one minor unit of the base currency per line (KWD 0.001, AED 0.01). Both may combine. The `BillDiscount` is cross-checked against Merpec's header identity, `Amount - Discount - BillDiscount + Tax = Total`, within a fixed two minor units (the header rounds once, not per line); a disagreement rejects the document. A purchase total ABOVE lines + tax + expenses beyond rounding (which would be silently capitalised as freight) is rejected too. A 0.01 source rounding gap with `BillDiscount` 0 (FP52000031) passes, a real header discount (FP52000170, 163.54) passes, and Zerupt-side drift fails. A one-time warning is raised when the `BillDiscount` column is missing from the whole table. Returns are not bounded: their residual is the credited amount itself.

A document that fails the bound is **rejected, not aborted**: it is excluded from `bundle.ndjson` together with everything that depends on it (the same cascade as `--skip-invalid`, but always on; it follows credit notes, refunds, receipt/payment allocations and journals linked to the document), listed in `excluded.ndjson` and the `summary.md` exclusion section with the full message (document, expected discount, unexplained amount), printed to stderr as `REJECTED ...`, the envelope carries `rejectedCount` (downstream must refuse a bundle with any), the bundle is flagged unusable if it still has validation problems, and the run exits **non-zero**. The rest of the export completes. The journal posts to the Merpec system accounts `SA10000014` (sales discount) and `SA10000019` (purchase discount); the exporter cannot see which tenant account is active, so the operator must map them on the mapping screen to the tenant's ACTIVE discount accounts (prod: 4300 sales, 4810 purchase; not the inactive 5031).

A spent return credit is recognised on the **receipt's date**, not the return's: between the two dates Zerupt shows the applied part as still owed. The cutover party balance, the invoice balances and the cash are Merpec's.

---

## 4. History order

Merpec has no global sequence number. So `seq` is the position after sorting by date, then a configured day order for document types (`HISTORY_DAY_ORDER` in `src/config.ts`), then Merpec's creation timestamp, then the legacy id. The envelope window runs from the day before the first event (exclusive) to the last event. A document dated after the company's own "today" (the calendar date in the company's timezone, not the machine's) is kept in the bundle with a blocking `date_in_future` issue but is left out of the window and the cutover, so one mistyped year (FP25000100 dated 2036) cannot move the cutover ten years out.

---

## 5. Open questions

Printed at the end of every `summary.md`, from `src/open-questions.ts`.

---

## 6. Findings: one issue shape

Every finding is a shared `MigrationIssue` (`@zerupt/shared`, `migration-replay/issue.ts`), built by the one `issue()` factory in `src/issues.ts`. Severity and the operator's ways out come from the shared registry, never from the exporter. Ids ride as structured fields: `entity {kind, legacyId, lineNo?, sourceForm, sourceKey}`, `docRef {number, date}`, `field`, `expected / actual / delta`, `related[]`, `params`. Nothing is parsed back out of message text, and no id is embedded in a summary key.

| Code | Severity | When |
|---|---|---|
| `date_in_future` | blocking | document dated after the company's today; kept, excluded from the window |
| `negative_stock_before_opening` | warning | replaying stock in `HISTORY_DAY_ORDER` takes an item/warehouse below zero. First negative date, shortfall, the documents involved. `Company.IsNegSellingAllow` rides in `params`. Dates are never moved |
| `currency_unresolved` / `fx_not_supported` | blocking | `PURCHASE.CurrencyCode` ("3067CAED") is resolved to ISO through `PURCHASE.Currency`; an unresolvable code, a foreign bill whose lines do not prove the conversion, or a non-numeric rate rejects that bill (excluded with its dependants). The run never aborts |
| `voucher_header_mismatch` | warning | receipt/payment header total differs from its lines (gross or net of discount), or a sales bill whose Total is not `Amount + Tax - BillDiscount` (InvoiceNo 3352, 3973), or a purchase total above lines + tax + expenses |
| `bill_discount_post_tax` | info | Merpec's post-tax round-off (`Total = Amount + Tax - BillDiscount`), held by the face-value journal |
| `face_value_adjusted` | warning | any other face-value journal of one minor unit or more; the split is in `params` |
| `face_value_rounding_summary` | info | ONE roll-up of every face-value journal below one minor unit (and purchase total gaps of 1-2 minor units), with the count and the first 100 documents in `related` |
| `vat_rate_unmapped` | blocking | a VAT-company line whose rate has no unique `ITEM.VAT` code (15 %, 30 %); one issue per line. Rates are compared by value ("5", "5.00" and "5 %" are the same rate) |
| `journal_unbalanced` | blocking | an emitted journal whose debits differ from its credits |
| `duplicate_source_key` | warning | two source rows share a natural key (SrNo, AccountCode..., sales `InvoiceNo`), or a derived id (`<SrNo>#FACEVALUE`) is emitted twice. The lookup Maps keep only the last row of a key, so repeats are collected before they can collapse |
| `schema_invalid` (source row) | warning | a row that fails its Merpec schema is excluded and reported; the run continues. Only an unreadable `COMPANY.Company` aborts |
| `document_redated` | info | a receipt/payment moved to the date of a document it allocates to; `params {from, to}` |
| `allocation_adjusted` | info | an allocation cut to the open balance or dropped (nothing open, or another party's document), or a return credit moved onto the invoice-settling journals; the referenced document is in `related` |
| `required_mapping` | blocking | a Merpec system account the journals post to (`SA100000xx`) is missing from the chart |
| `missing_ref` | warning | unresolved payment bills, a proof balance with no account, a document ref (invoice or bill) the bundle does not hold |
| `source_value_defaulted` | info | a stub master created for a customer, supplier, item or location that documents name but the masters lack; `related` lists the documents |
| `tax_in_no_tax_country` / `fidelity_mismatch` (field `IsVAT`) | warning | `Company.IsVAT` disagrees with `countryHasConsumptionTax(country)` |

`unusable` (also on the envelope) is true when a finding was aborted, or documents were rejected and the bundle still has validation problems. The envelope also carries `rejectedCount` and `requiredMappings` (every synthetic account the export invented, `MERPEC-AR-CONTROL`, `MERPEC-AP-CONTROL`, `MERPEC-*-DISCOUNT`, and every hard-wired Merpec system account the journals post to, each with its role), which the operator maps on the mappings screen.

Money rounds half-even everywhere through `src/rounding.ts`; each call site names its mode, and the CLI pins the global `Decimal` default once at entry.
