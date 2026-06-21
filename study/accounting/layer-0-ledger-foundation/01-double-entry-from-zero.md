# 01 — Double-Entry Bookkeeping, From Zero

## The single idea

Every transaction affects your business in **at least two** ways, and we record **both**.

That's it. That's the whole idea that 500 years of accounting and every ERP on earth is built
on. It's called **double-entry** because each event creates (at least) two entries.

## Why two? A story.

You start a shop. A friend lends you 1,000.

Think about what *actually* happened. Two things, not one:

1. You now have **1,000 in cash** (something you OWN went up).
2. You now **owe your friend 1,000** (something you OWE went up).

If you only wrote down "cash +1,000", your records would say you're 1,000 richer — a lie. You're
not richer; you're holding borrowed money. The second entry ("I owe 1,000") tells the truth.

Every event is like this. Money never appears from nowhere or vanishes into nowhere. It always
*moves* — from a source to a destination. Double-entry forces you to record **both ends of the
move**.

## The balance that can never break

Because every event records both ends, the two ends always sum to the same amount:

```
Got 1,000 cash   ⇄   Owe 1,000 to friend
  (1,000)               (1,000)
```

In accounting language, one side is called **debit** and the other **credit** (next chapter
explains which is which). The unbreakable law is:

> For every transaction: total **debits** = total **credits**.

If they don't match, you didn't record both ends correctly. This single equality is the
**self-checking property** of accounting. It's like a built-in error detector that has worked
for half a millennium.

## A few more everyday examples

| Event | End 1 | End 2 |
|-------|-------|-------|
| Buy stock for 300 cash | Inventory goes up 300 | Cash goes down 300 |
| Sell goods for 500 cash | Cash goes up 500 | Sales revenue goes up 500 |
| Pay 1,000 back to friend | Cash goes down 1,000 | What you owe goes down 1,000 |
| Customer buys on credit, 500 | Customer owes you 500 (a receivable) | Sales revenue goes up 500 |

Notice every row has two ends and they're equal. There is no such thing as a one-sided
transaction in real accounting.

## Why software people sometimes get this wrong

A naive developer models a sale as "add 500 to the cash table". One write. Done. It *feels*
complete. But it silently breaks double-entry: where did the 500 come from? Revenue. If you
don't *also* record the revenue side, your books don't balance and your P&L is wrong.

Zerupt's Layer 0 exists precisely so that **no module is allowed to record just one end**. The
posting engine (Layer 2) will *reject* any entry whose two ends don't sum equal. That rejection
is the law from this chapter, enforced in code.

## The mental model to carry forever

> Money moves. Record where it came **from** and where it went **to**. The two must be equal.

Next: `02-debits-credits-and-normal-balances.md` — what "debit" and "credit" actually mean.
