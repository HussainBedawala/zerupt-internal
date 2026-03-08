# Returns & Exchanges

> How POS handles return of goods, refund method selection, and exchanges against original receipts.

## Return Transaction

A return is a transaction with `type = Return` and `originalTransactionId` linking to the original sale.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `originalTransactionId` | UUID | Yes | The completed sale being returned against |
| `originalTransactionNumber` | String | Yes | For display and receipt |
| `returnReasonCode` | String | Yes | Selected from reason code list |
| `returnReasonNote` | String | No | Free-text additional detail |

## Reason Codes

| Code | Label | Label (AR) | Requires Note |
|------|-------|------------|---------------|
| `DEFECTIVE` | Defective item | منتج معيب | No |
| `WRONG_ITEM` | Wrong item | منتج خاطئ | No |
| `WRONG_SIZE` | Wrong size/color | مقاس/لون خاطئ | No |
| `CHANGED_MIND` | Customer changed mind | تغيير رأي العميل | No |
| `NOT_AS_DESCRIBED` | Not as described | لا يطابق الوصف | No |
| `OTHER` | Other | أخرى | Yes |

1. Reason codes are configurable per tenant — above are defaults
2. At least one reason code must exist

## Return Flow

1. Cashier initiates return
2. Lookup original transaction by: transaction number, barcode scan of receipt, customer search
3. System displays original transaction lines
4. Cashier selects lines to return and enters quantities (up to original quantity minus already-returned)
5. Cashier selects reason code per line (or one reason for all)
6. System calculates refund total (original line price at time of sale, not current price)
7. Cashier selects refund method (see Refund Rules below)
8. Transaction completed with `type = Return`
9. System emits `pos.return.completed`
10. Receipt printed with "RETURN" header

## Refund Method Rules

| Original Payment | Allowed Refund Methods |
|-----------------|----------------------|
| Cash | Cash, Store Credit |
| Card | Original Card, Store Credit |
| Store Credit | Store Credit only |
| Gift Card | Gift Card (restore balance), Store Credit |
| Custom | Store Credit, Cash (manager PIN) |

### Rules

1. Default: refund to original payment method
2. Cash refund opens the cash drawer and decreases register `expectedCash`
3. Card refund: cashier processes reversal on terminal, enters reference
4. Store credit: new credit issued to customer (customer must be linked)
5. Gift card refund: original card balance restored (card must be presented)
6. Split-payment returns: refund proportionally to original methods, or manager can override
7. Manager PIN required to refund in a different method than original

## Partial Returns

1. Any subset of lines from the original transaction can be returned
2. Quantity per line can be less than original
3. Each return transaction tracks which lines/quantities were returned
4. System prevents returning more than originally sold (cumulative across returns)
5. Multiple partial returns against the same original are allowed

## Exchange Flow

An exchange = return + new sale in a single workflow.

1. Cashier initiates exchange
2. Return lines selected (same as return flow above)
3. New items scanned/added (same as sale flow)
4. Net amount calculated: `newItemsTotal - returnItemsTotal`
5. If net > 0: customer pays the difference
6. If net < 0: refund the difference (per refund method rules)
7. If net = 0: no payment needed
8. Transaction created with `type = Exchange`, linking to original
9. Two events emitted: `pos.return.completed` (for returned items) + `pos.transaction.completed` (for new items)

## Rules

1. Returns allowed only against `Completed` transactions (not `Voided`)
2. Return window: configurable per tenant (default: 30 days from original sale)
3. Returns outside the window require manager PIN
4. Serial items: serial number must match original sale
5. Batch items: returned to same batch
6. No-receipt returns: manager PIN required, refund as store credit only, item selected manually
7. Offline: returns work if original transaction is in local cache; otherwise require receipt number entry
8. Returned items: inventory receives stock back via `pos.return.completed` event (see `inventory/11-cross-module-contracts.md`)
