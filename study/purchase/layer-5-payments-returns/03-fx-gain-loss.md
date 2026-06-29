# FX Gain/Loss on Settlement (F3)

## When FX Realizes

| Event | FX realizes? | File |
|-------|-------------|------|
| Standard payment post | YES — at settlement date | `supplier-payment-fx.ts:54` |
| Advance payment post | NO — no allocation yet (zero output) | `supplier-payment-fx.ts:53` |
| Advance application (allocateAdvance) | YES — at allocation date | `service.ts:1011` |

## Math (supplier-payment-fx.ts)

For each allocation:
```
payableRaw  += (allocatedAmount + discountAmount) × invoiceRate
cashRaw     += allocatedAmount × paymentRate
discountRaw += discountAmount × invoiceRate    ← always invoice rate, never payment rate
```

After summation (one rounding each):
```
payableFunctional = round(payableRaw)
cashFunctional    = round(cashRaw)
discountFunctional = round(discountRaw)
fxGainLoss        = payableFunctional − cashFunctional − discountFunctional
```

This is a **single-difference plug** — rounding applied after full summation, not per-allocation. Guarantees the settlement JE balances to the cent (`payable DR = cash CR + discount CR + fx CR/DR`).

### Sign convention

| fx | Direction | JE leg |
|----|-----------|--------|
| `> 0` | Paid less in functional than bill booked at → **gain** | CR 4820 fx_gain |
| `< 0` | Paid more in functional → **loss** | DR 7210 fx_loss |
| `= 0` | Single-currency or rates identical | No leg |

## JE Construction (purchase-accounting.listener.ts)

`pushFxLine(lines, fx)` — `listener.ts:227`:

```typescript
if (fx.isZero()) return;
if (fx.isPositive()) lines.push({ lineType: "fx_gain", creditTC: fx.toFixed(6) });
else                 lines.push({ lineType: "fx_loss", debitTC: fx.abs().toFixed(6) });
```

### Standard settlement JE (listener.ts:1204)

```
DR 2111 Trade Payables     [cashFunctional + discountFunctional + fxGainLoss]  ← gross AP relieved
CR cash/bank               [cashFunctional]
CR 4810 Discount Income    [discountFunctional]   (if discount > 0)
CR 4820 fx_gain / DR 7210  [|fxGainLoss|]         (if fx ≠ 0)
```

### Advance application JE (listener.ts:1298)

```
DR 2111 Trade Payables     [appliedTotal]           ← at bill's invoice rate
CR 1161 Supplier Prepay    [appliedTotal − fx]      ← at advance rate
CR 4820 / DR 7210          [|fx|]
```

Note: the 1161 credit = `appliedTotal − fx`, not `appliedTotal`. Prior implementation silently over/under-relieved AP — fixed per listener comment at line 1285.

## Multi-Currency Fields in Schema

The `supplier_payments` table carries `currency` and `exchangeRate` columns. `totalAmount` is in transaction currency. `cashFunctional` / `discountFunctional` / `fxGainLoss` are **not persisted** — they are computed at post time and flow into the outbox payload for the JE only.

## EXISTS vs REQUIRES

| Feature | Status |
|---------|--------|
| FX computation (single-difference plug) | EXISTS |
| FX on standard settlement | EXISTS |
| FX on advance application | EXISTS |
| Discount valued at invoice rate (no FX leakage) | EXISTS |
| FX persisted to `supplier_payments` row | REQUIRES — fxGainLoss not stored; can't report historical realized FX without querying JE lines |
| Unrealized FX revaluation (period-end AP revaluation) | REQUIRES — no revaluation service exists |
