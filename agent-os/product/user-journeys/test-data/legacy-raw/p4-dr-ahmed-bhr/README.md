# P4 · Dr. Ahmed — Legacy Data Dump
**Bahrain community pharmacy + health/beauty, Manama. Single outlet ~4,500 SKUs. ~BHD 18k-30k/month.**

Data represents a QuickBooks Online export combined with a manually-transcribed whiteboard/Excel batch register. Reflects the real state of a small pharmacy migrating to a modern ERP with no prior data hygiene.

---

## Mess categories injected — and what each stresses in Zerupt

| # | Mess Pattern | File(s) | Zerupt Edge Case |
|---|---|---|---|
| 1 | **Duplicate SKUs** — same drug entered twice under brand + generic, sometimes different suppliers | 01, 06 | Dedup wizard required at import; WAC merge ambiguity |
| 2 | **Zero-cost WAC trap** — ~15 items have Cost = 0.000 in QBO | 01, 06 | COGS = 0 silently; inventory valuation understated; must block or warn |
| 3 | **Unit chaos** — "Strip" / "pcs" / "box" / "Pcs" / "btl" / "Btl" mixed case | 01, 06 | Unit normalisation on import; BOM conversion needed |
| 4 | **Missing barcodes** — ~40% of rows blank | 01 | Cannot scan-to-receive without barcode; import must not reject |
| 5 | **Mixed VAT categorisation (CRITICAL)** — 0% Rx vs 10% OTC/cosmetics per item; 7 items deliberately miscategorized (cosmetic as 0%, Rx as 10%) | 01 | **NBR fine risk**: mixed basket tax calculation must use per-line rate, not basket rate; miscategorised items must be flaggable post-import |
| 6 | **Batch/expiry on whiteboard only** — no structured field in QBO | 02 | No batch/expiry import target in Zerupt today — data has nowhere to land; requires new import path or manual re-entry |
| 7 | **Mixed expiry date formats** — "01/2026", "15/03/2026", "Mar-26", "Jan-27", blank | 02 | Parser must handle ≥4 date formats; blank = reject or flag |
| 8 | **Expired stock still in inventory** — 8 expired batches still listed with qty > 0 | 02, 06 | FIFO pick must skip expired; opening stock value inflated; quarantine workflow needed |
| 9 | **Near-expiry stock mixed in** — salbutamol, insulin, codeine, paracetamol all expiring <6 months | 02 | Expiry alert threshold; sell-through prioritisation |
| 10 | **Blank batch numbers** — ~20 rows have no batch despite being batch-tracked drugs | 02, 06 | Regulatory NHRA compliance: batch is mandatory for Rx; import must flag, not silently accept |
| 11 | **Batch file ↔ stock file mismatch** — several SKUs appear in stock but not in batch file and vice versa | 02, 06 | Reconciliation step required; cannot auto-merge by SKU alone |
| 12 | **Negative stock** — MED-066 Cefuroxime qty = -5 | 06 | Negative opening stock must be blocked or flagged; sign of system counting error |
| 13 | **Cold-chain items mixed in general stock** — insulin listed with expired batch in Fridge | 02, 06 | Storage location + cold chain flag required; expired cold-chain = discard not quarantine |
| 14 | **Controlled drugs mixed in same batch file** — Tramadol, Codeine, Diazepam, Alprazolam | 01, 02 | Controlled drug register is separate regulatory requirement; must not auto-dispense |
| 15 | **Customer "Cash Customer" as single record** — all walk-in cash pooled | 03 | No per-transaction customer; loyalty/analytics impossible; need to split at import or flag |
| 16 | **Blank customer mobiles** — ~50% missing | 03 | Cannot send SMS/WhatsApp reminders; bulk outreach blocked post-import |
| 17 | **Negative customer balance** — Misc Insurance Refund -45.000 | 03 | Credit memo must be importable; AR aging must handle negatives |
| 18 | **Insurance accounts with large outstanding** — Al Wefaq 1250 BHD, Bupa 680.5 BHD | 03, 07 | Insurance claim workflow; payment terms differ from cash |
| 19 | **Supplier PDC register — bounced cheque** — MedGulf HSBC-BH-002225 bounced, reissued | 08 | PDC status tracking; bounced = fee + reissue; cash flow forecasting must reflect both |
| 20 | **PDC with missing amount** — HSBC-BH-002240 Apex Medical amount blank | 08 | Cannot post a cheque without amount; import must reject/flag |
| 21 | **90-day supplier terms** — MedGulf standard; some 60/45/30 mixed | 04, 08 | Payment terms must survive import and drive PDC due-date calculation |
| 22 | **Supplier with no contact info** — National Pharma, Baby World, United Pharma personal email | 04 | Supplier portal / comms broken; onboarding checklist must surface gaps |
| 23 | **VAT control accounts in QBO TB** — Input VAT 10%, Output VAT 10%, Suspense account for miscategorised | 05 | CoA must map to Zerupt's VAT accounts; suspense balance (280 BHD) = unresolved items |
| 24 | **Three-decimal BHD throughout** — 0.420, 3.478, 845.600 | All | BHD requires 3-decimal precision everywhere; rounding at 2 = NBR filing error |
| 25 | **Abbreviations + mixed case + Arabic creep** (anticipated) — "PARACETAMOL 500MG TAB 20S" vs "Panadol Extra 24 tab" | 01 | Search/dedup must be case-insensitive, normalise strength/form variants |
