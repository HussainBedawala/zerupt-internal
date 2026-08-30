# Phase F — Accounting: AR / AP sub-ledgers, aging, party-tagged control accounts, tax config

Agent area: the seam where Sales and Purchase reconcile INTO accounting.
Method: GL-first. Every number below was derived by hand in SQL BEFORE any screen or API was
believed. Browser used only for confirmation.

## Ledger identity (status-aware gate)

```sql
SELECT round(sum(l.debit - l.credit), 6) FROM journal_entry_lines l
JOIN journal_entries je ON je.id = l.journal_entry_id
WHERE je.status IN ('posted','reversed');
```
- Before first write: `0.000000`
- After last write:  `0.000000`

## Hand-derived control-account totals vs what the product reported

```sql
-- AR = party-tagged trade_receivables 1131 (account 7f3ba491-1289-463f-88df-d5c519110e66)
-- AP = party-tagged trade_payables   2111 (account 3a2dcf19-026d-4730-aacc-47a9426d5996)
select a.code, round(sum(l.debit-l.credit),3)
from journal_entry_lines l
join journal_entries je on je.id=l.journal_entry_id
join accounts a on a.id=l.account_id
where a.code in ('1131','2111') and je.status='posted' group by 1;
```

| | Hand-derived from GL | `/tenant/reports/{ar,ap}-aging` reported | Delta |
|---|---|---|---|
| AR (debit-normal) | 588,086.541 life-to-date · **588,080.041** as-of 2026-08-30 | 588,080.041 | **0.000** |
| AP (credit-normal) | **1,346,111.843** | 1,346,111.843 | **0.000** |

The 6.500 life-to-date/as-of gap on AR is a single FUTURE-DATED posted JE
(`B1ALRAIMAINS-JRN-00087`, posting_date 2026-08-31). The as-of cutoff correctly excludes it.
Not a defect — **withdrawn**.

Both `glTieOut` blocks reported `delta 0.000000, reconciles true, unassignedFunctional 0.000000`,
and I independently confirmed those numbers. Rows sum to totals exactly.

### The highest-value defect class: money in the GL invisible to the sub-ledger — NOT PRESENT

```sql
select a.code, l.party_type is null, l.party_id is null, count(*), round(sum(l.debit-l.credit),3)
from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id
join accounts a on a.id=l.account_id
where a.code in ('1131','2111') and je.status='posted' group by 1,2,3;
--  1131 | f | f | 333 |   588086.541
--  2111 | f | f | 314 | -1346111.843
```
**ZERO** NULL-party lines on either control account. The Layer-3 party guard holds on live data.
No confirmed sales/purchase invoice is stranded outside AP/AR. Purchase's KWD-11 shape does not
exist in this tenant today.

---

# FINDINGS (ranked)

## 1. HIGH · CONFIRMED — A settlement leg carries no due date, so aging buckets IGNORE the allocation the user actually made

A receipt/payment's AR/AP settlement leg is posted with `due_date = NULL`, even though the
allocation row records exactly which invoice it settled. `settleAndBucket` then treats that
NULL-dated credit as an untargeted balance-forward credit and applies it **oldest-first**, so
the money lands in the wrong bucket.

**The team already knows this is wrong — but only fixed the REVERSE direction.**
`apps/api/src/sales/receipts/receipt-vouchers.events.ts:198-202`, on the REVERSAL builder:

> `// invoiceId -> the invoice's OWN due date. The reversal RE-OPENS each settled invoice's`
> `// obligation, so every AR debit leg must carry the due date of the invoice it re-opens or`
> `// the balance resumes ageing as "current".`

`buildReceiptPostedPayload` (the FORWARD path in the same file) has no `dueDateByInvoice`
parameter at all — `grep -n dueDate receipt-vouchers.events.ts` returns only lines 202 and 237,
both inside the reversal builder. Classic one-name-two-bodies: only one side was patched.

**Empirical repro (mine, this session).** Three ZZTEST invoices for CUST-0502, KWD 10.000 each:
due 2026-08-30 (INV-00008, `current`), due 2026-07-31 (INV-00009, `days1To30`), due 2026-07-30
(INV-00010, `days31To60`). Aging before the receipt was exactly `10 / 10 / 10`.

I then posted receipt `272f0c4f-9a17-43b9-b9d6-8b5bc458a0d9` for KWD 4.000, **explicitly
allocated to INV-00008** (the `current` one). The document sub-ledger recorded it correctly:

```sql
select number,total,paid_amount,balance,due_date from sales_invoices
where customer_id='59feeae1-0649-46fd-b0dd-870a0c012112';
-- B1ALRAIMAINS-INV-00008 | 10.000 | 4.000 | 6.000 | 2026-08-30   <-- the paid one
-- B1ALRAIMAINS-INV-00009 | 10.000 | 0.000 | 10.000| 2026-07-31
-- B1ALRAIMAINS-INV-00010 | 10.000 | 0.000 | 10.000| 2026-07-30
```
But the GL leg has no due date:
```sql
select je.entry_number,l.due_date,l.debit,l.credit from journal_entry_lines l
join journal_entries je on je.id=l.journal_entry_id
where l.party_id='59feeae1-0649-46fd-b0dd-870a0c012112';
-- JRN-00090 | 2026-08-30 | 10.000 | 0.000
-- JRN-00092 | 2026-07-31 | 10.000 | 0.000
-- JRN-00094 | 2026-07-30 | 10.000 | 0.000
-- JRN-00096 |            |  0.000 | 4.000   <-- NULL due_date
```
and the aging report therefore says:
```
GET /api/v1/tenant/reports/ar-aging?legalEntityId=d67ece83-...
{'customerCode':'CUST-0502','current':'10.000000','days1To30':'10.000000',
 'days31To60':'6.000000','days61To90':'0.000000','days90Plus':'0.000000','total':'26.000000'}
```
| bucket | truth (per the allocation) | reported |
|---|---|---|
| current   | **6.000** | 10.000 |
| days1To30 | 10.000 | 10.000 |
| days31To60| **10.000** | 6.000 |

The GRAND TOTAL still ties (26.000) and `glTieOut.reconciles` is `true` — this is a
**per-bucket** misstatement, which is why no tie-out catches it. The customer statement
(`/tenant/reports/customer-statement`) reports the identical wrong split (`10/10/6`), because
both correctly share the one `settleAndBucket` primitive — the bug is upstream of it, in the
posted leg.

**Same defect on the AP side**, confirmed on live data — every payment leg is NULL-dated:
```sql
select je.source_document_type, l.due_date is null, count(*), round(sum(l.credit-l.debit),3)
from journal_entry_lines l join journal_entries je on je.id=l.journal_entry_id
where l.account_id='3a2dcf19-026d-4730-aacc-47a9426d5996' and je.status='posted' group by 1,2;
--  pay  | t | 4 | -72.530     <-- all 4 supplier payments, no due date
--  prn  | t | 2 | -22.000
--  pinv | t | 1 |  -2.000
--  ob_ap| f | 296 | 1346117.088
```
This is what put AP's `current` bucket at **-5.245** today.

**Impact.** Dunning/collections lists, the overdue-receivable scheduler's notifications, credit
decisions and "who do I chase / who do I pay first" are all driven by the bucket split, not the
total. A customer who has paid their current invoice keeps showing a current balance while an
older invoice they have NOT paid appears part-settled.

**Fix at the primitive (makes it impossible, not merely absent):** thread `dueDateByInvoice`
into `buildReceiptPostedPayload` exactly as `buildReceiptReversedPayload` already does, and
stamp `originalDueDate` on each settlement leg. `bucketFor` then puts each residual in the
right bucket with no FIFO guessing at all, and the mirror payment path in purchase gets the same
treatment. Deliberately NOT applied this session — it is a money-path change across two modules
and other agents are in the tree.

*Not fixed. No code changed.*

## 2. MEDIUM · CONFIRMED — A second AR aging implementation ages against UTC, not tenant-local (path divergence)

`/reports/ar-aging` correctly uses `resolveReportAsOf` (tenant-local calendar day; the file
header explains exactly why UTC is wrong for Kuwait UTC+3). But
`apps/api/src/accounting-subledger/customer-ar-balance.service.ts` carries a SECOND aging
implementation (`agingBuckets`, line ~282; `agingBucketTotals`, line ~357) that buckets with
Postgres `current_date`:

```ts
const age = sql`case when ${salesInvoices.dueDate} is null then -1
                else (current_date - ${salesInvoices.dueDate}) end`;
```
and the connection's timezone is UTC:
```
psql "$G" -Atc "show timezone; select current_date, now();"
-- GMT
-- 2026-08-30|2026-08-30 03:02:21.868788+00
```
Consumers: `sales/overview/sales-overview.service.ts:248` (the Sales overview aging KPIs) and
`sales/customers/overdue-receivable-scheduler.service.ts:112` (which SENDS overdue
notifications). Between 21:00 and 24:00 UTC — i.e. 00:00-03:00 Kuwait, the first three hours of
the merchant's calendar day — `current_date` is still yesterday, so every bucket boundary shifts
by one day and a just-due invoice is reported as not-yet-due. It also derives from the
denormalized `sales_invoices.balance` rather than the GL, which the module's own doctrine
forbids.

**Currently they agree**, which is why nothing has surfaced yet — I verified numerically:
```sql
select case when due_date is null then 'current(null)'
            when (current_date-due_date)<=0 then 'current'
            when (current_date-due_date)<=30 then '1-30' ... end bkt,
       count(*), round(sum(coalesce(balance_fn, balance*exchange_rate)),3)
from sales_invoices where status='confirmed' and balance>0 group by 1;
--  1-30    | 317 | 587946.773
--  current |   1 |    133.268   -> total 588080.041
```
identical to the GL-native report's `current 133.268 / days1To30 587946.773 / total 588080.041`.
No drift TODAY; the divergence is structural and time-of-day dependent.
Fix: route both through `resolveReportAsOf`, and delete the invoice-derived copy in favour of
the GL-native one.

*Not fixed.*

## 3. MEDIUM · CONFIRMED — Multi-currency AR aging CSV export loses the currency dimension

Each aging row is a `(customer, currency)` pair. On screen this is safe: every cell renders via
`formatMoney(v, { currency: r.currency })` and shows the code. The CSV does not — there is no
currency column, and `formatCsvMoneyCell` deliberately emits a bare unlocalised number with no
symbol (`packages/shared/src/format/csv-money.ts:65`).

Live proof, the tenant's AED customer:
```
{'customerCode':'CUST-0042','currency':'AED','days1To30':'1000.000000',
 'total':'1000.000000','totalFunctional':'83.500000'}
```
In `ar-aging-2026-08-30.csv` that row's total cell reads `1000.00` next to 317 KWD rows, with
nothing marking it as AED and no totals row. An accountant summing the column in Excel gets
**588,996.541**, versus the report's true functional total **588,080.041** — a 916.500
overstatement, entirely from one un-flagged foreign-currency row. (I derived both sums myself
from the API payload; column widths and the on-screen numbers are correct.)

Fix: add a `currency` column to both the table and the CSV (the data is already on every row),
and emit the functional-total footer the screen already shows.
AP is unaffected today only because purchase forbids foreign currency by design.

*Not fixed.*

## 4. LOW · CONFIRMED — A raw UUID where a document number belongs, in one of two sibling error messages

Same file, same feature, two error paths:
```
POST /tenant/sales/receipt-vouchers   (duplicate allocation, draft-time)
  -> "Duplicate allocation to invoice 12d22eaf-92ed-4c63-85bc-48ea2caa8bc0"     <-- raw UUID

POST /tenant/sales/receipt-vouchers/:id/post   (over-allocation, post-time)
  -> "Allocation (20.000000) exceeds invoice B1ALRAIMAINS-INV-00008 outstanding
      balance (10.000000)"                                                       <-- correct
```
The draft-time guard has the invoice row available; it just prints the id. A Kuwaiti bookkeeper
cannot act on the first message.

*Not fixed.*

## 5. LOW / FRICTION · CONFIRMED — Aging reports are unbounded

`/tenant/reports/ar-aging` returned all **318** customer rows in one ~200 KB response; AP
returned **297**. No `limit`, no cursor, no pagination in the DTO. Fine at this size; at 10k
customers it is an unbounded payload on a report every merchant opens. Statement timeout is
applied (`withReportStatementTimeout`), so it degrades to an error rather than a hang.
Noted, not a defect today.

---

# CONFIRMED-CORRECT (things I tried hard to break and could not)

- **Bucket boundaries — verified EMPIRICALLY, not by reading.** I created three real invoices at
  the exact edges. Due today (age 0) -> `current`. Due EXACTLY 30 days ago -> `days1To30`. Due
  EXACTLY 31 days ago -> `days31To60`. Endpoints are inclusive-upper and there is no gap or
  overlap (`bucketFor` in `apps/api/src/reports/shared/aging-buckets.ts`: `<=0 / <=30 / <=60 /
  <=90 / else`). Buckets summed to the total to the fils in every run.
- **`asOf` is tenant-local** in both aging reports (`resolveReportAsOf` -> `todayInZone` off
  `tenant_identity.timezone`), and `assertNotFutureDated` rejects a future as-of server-side.
  The POS UTC-day bug is NOT present in `/reports/{ar,ap}-aging`.
- **Path divergence between AR and AP aging: DOES NOT EXIST.** I diffed both services and both
  React components with the AR/AP vocabulary normalised away. `settleAndBucket`, `bucketFor`,
  `BUCKET_KEYS`, `zeroBuckets` are ONE shared primitive in `reports/shared/aging-buckets.ts`,
  imported by ar-aging, ap-aging, customer-statement and supplier-statement. The two 268-line
  components differ only in i18n keys and query hook. The only asymmetries are documented and
  correct (AP is credit-normal; AP additionally exposes `functionalBySupplier` for the purchase
  overview, which reuses the SAME `fetchGlGroupRows`). This is the cleanest shared-primitive
  story I have seen in the codebase.
- **Branch scoping** — no leak. AR/AP control lines exist only on Al Rai + NULL branch;
  `postedLineConditions` admits NULL-branch lines under an explicit `branchId` filter with an
  explicit comment about the trial-balance money bug that policy mismatch used to cause.
  Aggregates obey the same predicate as rows (`sumControlAccountMovement` takes `...lineScope`).
  The response honestly echoes `branchScope: "restricted"` and the UI renders
  `arAging.partialScopeWarning`.
- **GL tie-out is honest.** Both reports compute an INDEPENDENT party-unfiltered control-account
  movement and a separate untagged slice, and `withUnassigned` refuses to claim the untagged
  movement explains the delta unless it actually does. No gross-vs-net asymmetry: both sides of
  the tie-out are `sum(debit-credit)` over the same account set and the same
  `postedLineConditions` scope. I re-derived both sides in SQL; both were exact.
- **Allocation guards hold.** Duplicate allocation to the same invoice in one payload -> 422 at
  draft time. Over-allocation (20 vs a 10 balance) -> 422 at post time, with the invoice row
  taken `FOR UPDATE` in a canonical sorted order (deadlock-safe) and re-read per allocation so a
  same-transaction second allocation sees the reduced balance. Sum-of-allocations <= receipt
  total is re-checked against the durable rows at post, not just at create. Cross-currency
  settlement is refused loudly rather than mis-netted. Replaying a post -> 409 `Only a draft
  receipt voucher can be posted`.
- **No document commits before its GL posts** on the paths I exercised: the receipt post writes
  its outbox payload in the same transaction and the JE is built by the durable listener. After
  every write the status-aware ledger identity was `0.000000`.
- **Tax configuration is correct and Kuwait is genuinely tax-free.** The tenant has exactly one
  tax code, `NO-TAX-KW / out_of_scope / 0.0000`, zero `tax_group_components` beyond it, and
  **zero** journal lines with a `tax_code_id` or non-zero `tax_amount`. Visibility is derived,
  not hardcoded: `tax-config/tax-presentation.ts` classifies from the resolved components and
  returns `"none"`, and its header explicitly forbids gating on `legal_entities.tax_system`
  because `legal-entities.service.ts` hardcodes `'vat'` on create regardless of country — a trap
  they found and documented. `defaultTaxGroupId` came back `null` on the customer I created; no
  tax field was forced anywhere in the invoice flow.
- **The config layer DOES express KSA VAT and Indian GST.** 14 seeded country profiles
  (AE/SA/BH/OM/QA/KW/EG/JO/SG/MY/ID/TH/**IN**/BN), each derived from the single
  `COUNTRY_TAX_REGIME` table, never hand-typed. India is complete: CGST/SGST pairs at
  2.5/6/9/14, matching IGST at 5/12/18/28, nil-rated, export-zero-rated, and Compensation Cess
  at 5% and 12% — correctly `isCompound: false`, since Indian cess is levied on the taxable
  value, not on the GST. Intra-state groups carry two components with `sortOrder` 0/1.
- **`isCompound` is NOT a dead field** (I suspected it was — `apps/api/src/tax-calc/` is a 5-line
  re-export). The real engine is `packages/shared/src/pos-money/tax-engine.ts`, which computes
  `baseAmount = roundedNet + cumulativeNonCompoundTax` for compound components and FAILS LOUD on
  compound+inclusive, mixed exclusive/inclusive, and reverse-charge+inclusive rather than
  guessing. Rounding is banker's at the currency's own decimals (`dp`), so KWD 3dp and INR/SAR
  2dp are both honoured; `out_of_scope` components are excluded from the return-box summary map
  entirely, which is exactly right for Kuwait.
- **i18n parity** on my screens: `arAging` 18/18 en/ar, `apAging` 18/18, no missing keys, no
  untranslated Arabic values, **no em dashes** in any of the 36 strings.

---

# WITHDRAWN AFTER INVESTIGATION

- **"AR is 6.500 short of the GL."** It is a single future-dated posted JE
  (`B1ALRAIMAINS-JRN-00087`, 2026-08-31) correctly excluded by the as-of cutoff. Working as
  designed.
- **"317 confirmed sales invoices and 296 purchase invoices have NO journal entry."** True
  literally (`not exists (select 1 from journal_entries je where je.source_document_id=si.id)`)
  but not a defect: the tenant has only 16 `inv` and 9 `pinv` JEs because almost all of these
  are OPEN ITEMS created by the opening-balance import, whose AR/AP legs live on `OB_AR-0001`
  and `OB_AP-0001`. That is exactly why those journals are untouchable. Both control totals tie
  to the fils, which they could not if money were missing.
- **AUDIT-002 (`POST /tenant/accounts/bulk` has no audit path).** **ALREADY CLOSED.** The
  missing `@Audited("Account")` decorator is deliberate, not an oversight —
  `accounts-crud.service.ts:~695` writes one full-snapshot audit row PER created account inside
  the same transaction, with a comment naming AUDIT-002 and explaining that the
  single-entity-per-request interceptor cannot cover a bulk call. Adding the decorator would
  make it WORSE: it would append one extra row with `entityId: "unknown"` (the response is
  `{ created: number }`) and log a resolver warning. **Recommend marking AUDIT-002 closed.**
  I changed nothing.
- **"Tax config cannot express Indian GST."** It can, in full. See above.
- **"`isCompound` is a collected field with no consequence."** It has one.
- **"AR and AP aging are hand-copied and have drifted."** They have not; one shared primitive.

---

# VERIFICATION GAPS (honest)

- **Nothing was fixed.** Every finding above is reported, not repaired. Finding 1 is a money-path
  change spanning sales receipts and purchase payments, with other agents live in the tree.
- **No browser pass.** The API was restarted out from under me three times by concurrent agents
  (two total outages of 45s+ and 3min). I confirmed RTL/en-ar by reading the message catalogues
  and the components rather than by rendering them, so RTL layout, responsive breakpoints
  (375/768/1280/1920), loading/empty/error states and the actual downloaded CSV/PDF files are
  **unverified visually**. Finding 3's CSV contents are derived from reading
  `handleExport` + `formatCsvMoneyCell` + the live API payload, not from opening a file.
- **Permission gating not exercised as a non-owner.** I scanned all 76 undecorated controller
  routes repo-wide; none in the AR/AP/tax lane is ungated (`/reports/{ar,ap}-aging` both require
  `reports.financial.view`; every `accounts` route is gated). But I did not attempt the calls as
  `cashier1`/`storekeeper1` to confirm a clean 403 rather than a crash.
- **Audit rows for my writes not checked in the DB.** I verified the bulk-account audit path by
  code read only.
- **Aging tested at 0/30/31 days only.** The 60/61 and 90/91 edges are covered by the same three
  lines of `bucketFor` and by symmetry, but I did not create invoices at those dates.
- **Multi-entity / consolidated scope untested** — this tenant has exactly one legal entity, so
  `resolveFunctionalCurrency` returning `null` for a mixed-currency consolidated scope (and
  `functionalBySupplier` correctly refusing to blend) is code-read only.
- **Period-close bypass and maker-checker** were left to the periods/closing agent.
