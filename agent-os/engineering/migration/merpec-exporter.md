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
| A location (selling site and stock site in one) | A **branch plus a warehouse** under it, both with the location code |
| A voucher with several lines | One record per line, numbered `<SrNo>#<Sr>`. A one-line voucher keeps its own number |
| A stock adjustment mixing ADD and LESS | One record per type, `<SrNo>#ADD` and `<SrNo>#LESS` |
| A cash or bank sales return | A credit note plus a customer refund |
| A return line on an item sold across several invoice lines | Split across those lines in order, never past each line's sold quantity |
| A journal line on a customer or supplier code | A **synthetic AR or AP control account** plus the party. The due date is the journal date, because Merpec has none and the posting engine requires one on every receivable or payable line |
| A voucher line with a Discount | Receipt or payment `amount` and tender equal the **cash** (line amount minus Discount). Allocations keep Merpec's gross bill amounts. Each allocation carries its share as `discount`, plus the header `discount`. No generated journal and no synthetic discount account. See [Layer 5c](layer-5c-money.md) |
| The discount on one voucher line | Shared **pro rata over the bills** it cleared, floored at the finest scale in play, with the rounding remainder handed out in row order up to each bill's headroom. Deterministic. A discount larger than the allocations is capped and the shortfall is counted |
| `StockItem` | `"0"` is stock, `"1"` is non-stock. Any other value defaults to stock, with the raw value kept in `extras` and counted |
| Customer `PaymentTerm` | It is a **credit limit**, not days. `creditLimit`, with `0` or blank meaning no limit (omitted) |
| Sales and purchase lines | Renumbered 1 to n, which Zerupt requires. Merpec's `Sr` stays in `extras` |
| A transfer | Sent and received at the same instant (local midnight, company timezone) |

Two accounting choices follow the replay rules:

- **Sales lines carry no `unitCost`.** Zerupt costs them at the live company-wide average during replay. See [Layer 5a](layer-5a-sales.md).
- **Purchase freight and, for a company not registered for VAT, the purchase tax are capitalised** through `freightOnInvoice`. A VAT company's lines carry `taxCodeRef` instead. See [Layer 5b](layer-5b-purchase-stock.md).

---

## 4. History order

Merpec has no global sequence number. So `seq` is the position after sorting by date, then a configured day order for document types (`HISTORY_DAY_ORDER` in `src/config.ts`), then Merpec's creation timestamp, then the legacy id. The envelope window runs from the day before the first event (exclusive) to the last event.

---

## 5. Open questions

Printed at the end of every `summary.md`, from `src/open-questions.ts`.
