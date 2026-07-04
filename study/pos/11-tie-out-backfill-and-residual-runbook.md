# POS Tie-Out Remediation + Residual Monitoring Runbook

**Created:** 2026-07-04 · **Author:** Claude (Opus 4.8) · **Context:** POS submodule-02 testing → finding #17 (CRITICAL three-way tie-out break). Code fix shipped to `main` (erp `f48888ca`). This runbook covers (1) the prod **data backfill** for the two pre-fix casualties, and (2) the **monitoring/reconciliation** procedures for the two accepted residuals.

> **Prod target:** Neon project `restless-hill-33464873`, branch `br-red-term-a1vs9ndl`, DB `zerupt_tenant_al_asala_auto_parts_mqy1wpk2` (Al Asala Auto Parts, KWD 3dp).
> Warehouse `e7a800a2-9bd1-47b7-9bf4-03617e389536` · Shift `b61dfe82`.
> Accounts: COGS `5100` = `0fec6647-66a0-45cf-a640-0d34b1d90170` · Inventory `1141` = `59f3f6d5-0efa-4a1a-87b3-401456f52125`.

---

## Part 1 — Data backfill (two pre-fix casualties)

Both transactions completed **2026-07-01**, before the durable-outbox hardening (#168/#169) and this fix, so their inventory fan-out silently no-op'd: revenue posted, but no COGS journal and no stock movement. They will **not** self-heal.

### State snapshot (verified 2026-07-04)

| Item | tx | Line | Missing | Notes |
|---|---|---|---|---|
| Test Battery (batch) `d9f94c90` | tx-8 `ec78893f` (B1SHUWAIKHREG1-1-8) | `2c41d732…`, qty 11, cost_at_sale 13.0 | `inventory.sale` JE + `stock_ledger` −11 | Item WAC drifted 13.0 → **27.230769**; materialized on_hand **13** (overstated by 11). No valid FEFO lot: lots are `expired`(5) / `exhausted`(8) / `active`-but-0. |
| ECU Test Unit (serial) `07cae22b` | tx-5 `9909384f` (B1SHUWAIKHREG1-1-5, type=return, orig tx-4) | `e2c64a3e…`, qty −1, cost 99.0, serial `SN-AAA-099` | `inventory.sale_return` JE + `stock_ledger` +1 + serial→available | Serial `SN-AAA-099` (`1a25fafe…`) still `status='sold'`, acq cost 99.0. Specific-ID → no pool-WAC drift. Clean. |

### tx-8 cost-basis decision (REQUIRED before executing)

The 11 units left 2026-07-01 but stayed in the pool; later purchases blended WAC up. You cannot relieve now and keep **both** period-accurate COGS **and** GL↔valuation tie.

- **Option A — snapshot 143.0 (period-accurate):** DR 5100 143.0 / CR 1141 143.0 (11×13.0). Matches the 2026-07-01 revenue + the line's `cost_at_sale`. Leaves a ~156 GL-vs-materialized-valuation gap → needs a follow-up inventory revaluation. Residual WAC on the 2 remaining units approximate.
- **Option B — current WAC 299.5 (RECOMMENDED):** DR 5100 299.5 / CR 1141 299.5 (11×27.230769). Exactly what the engine posts on a today relief; GL↔inventory↔ledger stay fully tied, **no follow-up entry**. Overstates COGS by ~156 vs the historical ideal (drift absorbed as a catch-up expense now). Standard "late-relief catch-up at current cost" treatment.
- **Option C — full WAC recompute from 2026-07-01:** most correct (COGS, inventory, remaining WAC all exact); most work — a scripted reconciliation over all intervening battery movements.

**Recommendation: Option B** (self-consistent, single balanced entry, matches engine, no loose ends). tx-5 is unaffected by this choice (specific-ID at 99.0).

### Preferred mechanism — ENGINE RE-DRIVE (not hand-forged SQL)

Re-driving the existing outbox events through the inventory engine is far safer than hand-inserting `journal_entries` — the engine owns numbering, balance, cost layers, materialized levels, serial state, and WAC. **Option B == what the engine produces**, so re-drive is the natural fit.

Two payload edits are required first (the stored payloads predate the emitter fixes):

```sql
-- tx-8: inject a batchId so attribution uses the explicit-lot path (skips the FEFO
-- throw on the now-invalid lots). Attribute the corrective relief to the lot that
-- physically held the stock. qty 11 > that lot's balance is fine (negative lot, flagged).
UPDATE accounting_event_outbox
SET payload = jsonb_set(payload::jsonb, '{lineItems,0,batchId}',
      '"3b50c6d3-8ba4-406b-a327-d0f0db180ba7"'::jsonb)::text,
    status = 'pending', attempts = 0, processed_at = NULL, last_error = NULL
WHERE event_type = 'pos.transaction.completed.inventory'
  AND (payload::jsonb)->>'sourceDocumentId' = 'ec78893f-724c-410c-98aa-d38ab55df493';

-- tx-5: set the return LINE's serial + inject serialNumbers into the payload so the
-- engine restocks the specific unit.
UPDATE pos_transaction_lines SET serial_number = 'SN-AAA-099'
WHERE id = 'e2c64a3e-e6de-44d6-af2e-a8d1f689ad70';

UPDATE accounting_event_outbox
SET payload = jsonb_set(payload::jsonb, '{lineItems,0,serialNumbers}',
      '["SN-AAA-099"]'::jsonb)::text,
    status = 'pending', attempts = 0, processed_at = NULL, last_error = NULL
WHERE event_type = 'pos.return.completed.inventory'
  AND (payload::jsonb)->>'sourceDocumentId' = '9909384f-52b4-4648-a2d0-0a8276c2e514';
```

Then let the OutboxPoller re-emit (or trigger a drain). The engine, per line:
- tx-8 → `applyOutbound`: writes `stock_ledger` sale −11 (@ current WAC), COGS JE DR 5100 / CR 1141 299.5, decrements materialized on_hand 13→2.
- tx-5 → `applyInbound`: writes `stock_ledger` sale_return +1 (@ serial specific 99.0), COGS-reversal JE DR 1141 / CR 5100 99.0, materialized on_hand 2→3, and (already handled in current code) the serial is flipped to `available` by the POS-return path — **verify** `SN-AAA-099` status post-run; if still `sold`, flip it:
  `UPDATE item_serial_numbers SET status='available', sale_doc_type=NULL, sale_doc_id=NULL WHERE id='1a25fafe-9719-48ee-b05e-858b8ce040e8';`

> If the poller does NOT pick up the reset rows within a few minutes (prod worker cadence uncertain), fall back to the hand-forged atomic SQL in the collapsed section below — but prefer the engine path.

### Verification (run after)

```sql
-- both transactions must now have their inventory JE + stock movement
SELECT je.description, SUM(jel.debit) dr, SUM(jel.credit) cr
FROM journal_entries je JOIN journal_entry_lines jel ON jel.journal_entry_id=je.id
WHERE je.source_document_type='pos'
  AND je.source_document_id IN ('ec78893f-724c-410c-98aa-d38ab55df493','9909384f-52b4-4648-a2d0-0a8276c2e514')
GROUP BY je.id, je.description;         -- expect inventory.sale (tx-8) + inventory.sale_return (tx-5), each balanced

SELECT source_document_id, movement_type, quantity, total_cost
FROM stock_ledger_entries
WHERE source_document_id IN ('ec78893f-724c-410c-98aa-d38ab55df493','9909384f-52b4-4648-a2d0-0a8276c2e514');
-- expect: tx-8 sale -11; tx-5 sale_return +1

-- serial must be sellable again
SELECT serial_no, status FROM item_serial_numbers WHERE id='1a25fafe-9719-48ee-b05e-858b8ce040e8';  -- available
```

Then re-run the full submodule-02 tie-out recon (all 11 tx) — expect **11/11 tie out**.

### Rollback
Each re-drive is one atomic engine transaction. If a run dead-letters, no partial state is committed (durable-gate guarantee); fix the cause and re-drive. The payload/line edits above are reversible (revert `batch_id`/`serialNumbers`/`serial_number`).

---

## Part 2 — Residual monitoring & reconciliation runbook

The shipped fix (erp `f48888ca`) blocks the common single-transaction batch/serial oversell at completion. Two residuals remain **by design** and now fail **loudly** (dead-letter) rather than silently — they need monitoring, not code, for MVP.

### Residual R1 — concurrent same-lot completions within the async fan-out window
Two sales of the same batch item from **different registers** completing within the outbox-relief window can both pass the guard (the just-completed sale's stock relief hasn't posted to the ledger yet). The loser's fan-out then dead-letters. **Impossible on Al Asala (single register); narrow on multi-register stores.** Full close needs synchronous in-tx batch reservation — tracked follow-up, not MVP-blocking.

### Residual R2 — offline-synced oversell
An already-paid offline device sale that oversells a batch/serial item is intentionally NOT rejected at sync (never lose a paid sale) → its fan-out dead-letters for manual reconciliation.

### Daily monitoring query (both residuals surface the same way — a dead-lettered POS inventory event)

```sql
SELECT id, event_type, status, attempts, last_error, created_at,
       (payload::jsonb)->>'sourceDocumentId' AS tx_id
FROM accounting_event_outbox
WHERE status IN ('failed','dead_letter')
  AND event_type LIKE 'pos.%.inventory'
ORDER BY created_at DESC;
```
Also alert on the structured log line `ACCOUNTING_DEAD_LETTER` / `pos.*.inventory handler failed` (Sentry/log sink), and watch for any completed POS transaction with no matching `stock_ledger_entries` row:

```sql
SELECT t.transaction_number, t.id
FROM pos_transactions t
JOIN pos_transaction_lines l ON l.transaction_id = t.id
JOIN items i ON i.id = l.item_id AND i.tracking_type <> 'none'
WHERE t.status='completed'
  AND NOT EXISTS (SELECT 1 FROM stock_ledger_entries s WHERE s.source_document_id = t.id AND s.source_document_line_id = l.id)
GROUP BY t.id, t.transaction_number;   -- expect ZERO rows in steady state
```

### Reconciliation procedure for a dead-lettered POS inventory event
1. Identify the tx and line from the dead-letter payload.
2. Confirm physical stock reality (did the goods actually leave / return?).
3. Ensure the lot/serial exists (receive stock or correct the lot state if needed).
4. Re-drive via the accounting dead-letter retry (`POST /tenant/accounting/dead-letters/:id/retry`) once the underlying stock can attribute — the engine then posts COGS + relief idempotently.
5. Verify the tx ties out (JE + stock_ledger present, balanced).

### Follow-up (tracked, not MVP)
- **DEV-TODO:** synchronous in-tx batch reservation for POS batch lines to fully close R1 (guard reads a reservation-aware availability, decrement reserved qty in the same tx as completion). Also removes the async double-sell window for all channels.
- Consider a scheduled job asserting the "completed tx with no stock movement" query returns zero and alerting otherwise (a durable backstop for R1/R2 and any future silent-gap regression).
