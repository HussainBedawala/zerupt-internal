# 07 — Cheques and FX Accounting

## Why cheques need their own accounting

In GCC and South Asia, post-dated cheques (PDCs) are a major payment instrument.
A business might receive a cheque dated three months in the future as "payment" for an
invoice. The cheque is not cash yet — the bank hasn't cleared it, and it could bounce.
Accounting must track the cheque through its lifecycle, with each status change producing
its own journal entry.

There are two directions:
- **Incoming** — we receive a cheque from a customer (linked to our AR)
- **Outgoing** — we issue a cheque to a supplier (linked to our AP)

## Incoming cheque lifecycle

### Received: DR PDC Receivable / CR AR

A customer gives us a post-dated cheque for SAR 1,050 to settle their invoice.

```
DR  PDC Receivable (1134)        1,050.00
      CR  Trade Receivables (1131)          1,050.00
```

- **DR PDC Receivable (1134):** The cheque is a near-cash asset, but it's not bank money
  yet. It lives in a separate "cheques in hand" account.
- **CR Trade Receivables (1131):** The customer's AR balance is cleared — they've handed
  over a cheque.

From the customer's perspective, they've paid. From our accounting perspective, we've
traded a receivable for a different kind of receivable.

### Deposited: DR Cheques in Transit / CR PDC Receivable

We take the cheque to the bank and deposit it. The bank doesn't credit our account
immediately — it takes a few days to clear.

```
DR  Cheques in Transit (1129)    1,050.00
      CR  PDC Receivable (1134)             1,050.00
```

The cheque moves from "in hand" to "in transit" — it's at the bank being processed.

### Cleared: DR Bank / CR Cheques in Transit

The bank clears the cheque and credits our account.

```
DR  Bank (1121)                  1,050.00
      CR  Cheques in Transit (1129)         1,050.00
```

The cheque lifecycle is complete. From start to finish, the chain was:
`AR → PDC Receivable → In Transit → Bank`. Cash has arrived.

### Bounced: DR AR / CR Cheques in Transit + bank fees

The cheque bounces (insufficient funds). We need to re-open the AR (the customer still
owes us) and clear the transit account:

```
DR  Trade Receivables (1131)     1,050.00
      CR  Cheques in Transit (1129)         1,050.00
```

We also get hit with a bank fee (say SAR 50):

```
DR  Bank Charges (7130)             50.00
      CR  Bank (1121)                          50.00
```

If we choose to re-bill the bounce fee to the customer:

```
DR  Trade Receivables (1131)        50.00
      CR  Fee Income (4910)                    50.00
```

After a bounce, the customer's AR is re-opened at the original amount, plus they now owe
the bounce fee if we choose to re-bill.

### Cancelled: DR AR / CR PDC Receivable

A cheque is cancelled before deposit (e.g., the customer asks for it back and we return
it, instead accepting a bank transfer):

```
DR  Trade Receivables (1131)     1,050.00
      CR  PDC Receivable (1134)             1,050.00
```

The PDC is reversed; AR is re-opened. The customer still owes us.

## Outgoing cheque lifecycle

### Issued: DR AP / CR PDC Payable

We write and hand a cheque to our supplier for SAR 5,250:

```
DR  Trade Payables (2111)        5,250.00
      CR  PDC Payable (2145)               5,250.00
```

- **DR Trade Payables:** AP is cleared — we've "paid" the supplier (from their
  perspective, they're holding our cheque).
- **CR PDC Payable (2145):** But we haven't lost the cash yet. This liability account
  says "we have a cheque outstanding that will be presented to the bank."

### Presented: DR PDC Payable / CR Cheques in Transit

The supplier presents the cheque to their bank, which contacts our bank:

```
DR  PDC Payable (2145)           5,250.00
      CR  Cheques in Transit (1129)         5,250.00
```

The obligation moves from "cheque issued" to "cheque being processed at the bank."

### Cleared: DR Cheques in Transit / CR Bank

Our bank clears the cheque — the money leaves our account:

```
DR  Cheques in Transit (1129)    5,250.00
      CR  Bank (1121)                       5,250.00
```

Cash has left. The chain: `AP → PDC Payable → In Transit → Bank paid out`.

### Bounced: DR Cheques in Transit / CR AP (re-open)

Our issued cheque bounces (rare, means we had insufficient funds — very bad):

```
DR  Cheques in Transit (1129)    5,250.00
      CR  Trade Payables (2111)             5,250.00
```

The transit is cleared; AP is re-opened. We still owe the supplier, plus now we have a
damaged relationship to manage.

## Foreign-currency transactions and FX accounting

A business in UAE (reporting currency: AED) might buy from a European supplier in EUR.
The exchange rate at the invoice date might be 1 EUR = 4.00 AED. The exchange rate at
the payment date might be 1 EUR = 4.10 AED.

### Invoice date (rate 4.00)

Suppose the invoice is EUR 1,000:

```
DR  Merchandise Inventory (1141)  4,000.00 AED
      CR  Trade Payables (2111)            4,000.00 AED
```

The AP is booked at 4.00 × 1,000 = AED 4,000.

### Payment date (rate 4.10)

When we pay the EUR 1,000, it costs us AED 4,100 (the rate moved against us):

```
DR  Trade Payables (2111)         4,000.00 AED   ← clears at the original rate
DR  FX Loss (7210)                  100.00 AED   ← the extra cost
      CR  Bank (1121)                      4,100.00 AED   ← actual AED paid
```

The AP is cleared at the rate it was originally booked (4,000 AED). The extra 100 AED
is the **realized FX loss** — real money that left the business due to exchange rate
movement. It's an expense (7210).

If the rate had moved in our favor (rate dropped to 3.90), we'd pay only AED 3,900:

```
DR  Trade Payables (2111)         4,000.00 AED
      CR  Bank (1121)                      3,900.00 AED
      CR  FX Gain (4820)                     100.00 AED
```

The FX gain is income — we paid less than we owed.

### Unrealized FX (period-end revaluation)

At the end of a reporting period, any open AR or AP balances denominated in foreign
currencies are revalued to the current exchange rate. The difference between the
original booking rate and the current rate is an **unrealized FX gain/loss**. Unrealized
because the cash hasn't settled yet — the rate could move back before payment.

This revaluation is a Layer 4 concern (period close), but the accounting is identical
in structure: DR/CR between the AR or AP account and an unrealized FX account. When the
item is eventually settled, the unrealized entry is reversed and the realized entry is
posted in its place.

## The mental model

> A cheque is not cash — it's a paper obligation in transit. Each status transition (received,
> deposited, cleared, bounced, cancelled) produces its own JE that moves the cheque from
> one account to another along its lifecycle. FX transactions split the debit/credit
> between the functional-currency amount (at the original rate) and the FX gain/loss (the
> rate difference). Realized FX hits P&L on settlement; unrealized FX is revalued at
> period end and reversed when settled.

Next: `08-reliability-and-correctness.md`.
