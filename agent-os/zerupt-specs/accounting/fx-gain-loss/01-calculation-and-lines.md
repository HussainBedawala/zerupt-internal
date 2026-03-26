# FX Gain/Loss — Calculation & Line Building

> Service: `apps/api/src/journal-entries/fx-gain-loss.service.ts`
> Spec: `agent-os/product/accounting/03-multi-currency.md`

## Purpose

Pure calculation helpers. No DB access. Used by payment modules to build FX gain/loss JE lines.

## Realized FX (on settlement)

When a payment settles an invoice at a different rate than it was booked:

```
Invoice: USD 10,000 at 0.307 = KWD 3,070.000
Payment: USD 10,000 at 0.310 = KWD 3,100.000
FX Gain: KWD 30.000
```

### `computeRealizedFxDifference(originalBookValueFC, settlementAmountFC)`

- Uses **actual posted book value** (not recomputed from rate) to avoid rounding residuals
- `difference = settlement - original`
- Returns `{ amount: string (6dp), isGain: boolean, isZero: boolean }`

### `buildFxLine(originalBookValueFC, settlementAmountFC, functionalCurrency)`

- Returns `null` if no FX difference (zero)
- **Gain:** `lineType: "fx_gain"`, credit in FC, maps to account 4820 (Realized FX Gain)
- **Loss:** `lineType: "fx_loss"`, debit in FC, maps to account 7210 (Realized FX Loss)
- Currency = entity's functional currency, exchangeRate = "1" (FX line is already in FC)
- Bilingual descriptions (EN + AR) auto-generated

## Unrealized FX (month-end revaluation)

**Implemented.** Full spec at `fx-revaluation/01-unrealized-revaluation.md`. Summary:

1. List all open FC balances (AR, AP, FC bank accounts) per legal entity
2. `revalued = FC_amount × closing_rate`
3. `difference = revalued - current_book_value`
4. Post entry per currency pair: DR/CR Unrealized FX Gain (4830) / Loss (7220)
5. **Auto-reverses** on first day of next period

## Account Mapping

| Line Type | Account | Direction |
|-----------|---------|-----------|
| fx_gain | 4820 Realized FX Gain | Credit (income) |
| fx_loss | 7210 Realized FX Loss | Debit (expense) |
| unrealized_fx_gain | 4830 Unrealized FX Gain | Credit (future) |
| unrealized_fx_loss | 7220 Unrealized FX Loss | Debit (future) |

## Design Decisions

- **Book value, not recomputed** — avoids rounding drift over long invoice terms
- **Pure functions** — no DB, no side effects, testable in isolation
- **FC-denominated** — FX lines are in functional currency with rate=1 (the gain/loss IS the FC amount)
