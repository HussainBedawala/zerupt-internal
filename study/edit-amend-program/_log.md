# Universal Edit/Amend Program — Log

> STATUS 2026-07-23: ALL 14 DOCUMENTS COMPLETE. Every document passed 2+ review waves with all
> findings fixed. Final sweep green: api+web typecheck clean, db build clean, migration journal
> integral (213 entries, no orphans/dups; program migrations 0206/0208/0209/0210), amend jest
> sweep 77 suites / 1970 tests green, amend+OB vitest 45/45, i18n clean for ALL program keys
> (remaining i18n failures belong to other sessions: locations feature + pre-existing addExpense).
> impactPreview i18n keys added program-wide (11 adapters, en+ar). NOTHING COMMITTED — awaiting
> founder review; per-document commits to main on founder instruction.

Goal: every user-created document gets a proper edit/amend flow. Posted docs = amend saga
(reverse dependents -> void original -> recreate corrected -> reapply), modeled on the GRN
correct-cost saga. Draft docs keep plain edit. Brand/locale aware (Zerupt + Merpec inherit
via next-intl + brand.ts, zero per-brand code).

Founder decisions (2026-07-22):
- Phase 0 primitive design APPROVED (AmendSagaRunner + document_amendments + adapters + shared AmendDocumentDialog)
- Opening Balances: delta-correction JE flow, NOT void+recreate (guards stay)
- User-facing terminology: "Edit" (saga invisible); also "Cancel" as lighter verb (BC-style)
- Process: NO commits until founder review at end; two reviewer waves per layer

Industry/regulatory corrections folded into design (validation agent, 2026-07-22):
1. correlationId threads the whole saga (amendment row, contras, void, new doc, re-payments)
2. mode: 'cancel' | 'edit' — one runner, cancel skips recreate/reapply
3. assertAmendable hook: AMEND_STOCK_CONSUMED (reverse at original cost only; block if consumed
   downstream), AMEND_UNAPPLY_PAYMENT_FIRST (bank-reconciled / multi-doc allocations never
   auto-reversed — Dynamics BC posture)
4. isExternallyReported gate -> AMEND_EXTERNALLY_REPORTED 422 (India GST e-invoice >24h after
   IRN, KSA ZATCA-cleared, UAE-transmitted docs legally CANNOT be void+recreated; credit/debit
   note path only). Hook default false today; wire real flags when e-invoicing ships.
5. Gapless numbering: original keeps number visible-as-voided; replacement gets new number,
   linked (amended_from pattern, matches ERPNext/BC/SAP). No change needed.

## Status

| Layer | Status | Commit |
|---|---|---|
| Phase 0 backend primitive (AmendSagaRunner, AmendAdapter, mig 0206_even_justin_hammer, 29 tests) | wave 1 + wave 2 findings ALL fixed (finalize retry + AMEND_FINALIZE_FAILED, resolved_manually exit + resolveFailedAmendment, deterministic unresolved lookup, NOT NULL idem key, FX pair assert, verifyAmendNetZero helper, 23505 discrimination); document-keyed audit entries + GET /amendments/document/:id in progress | pending founder review |
| Phase 0 frontend primitive (features/amend + EditGrnCostDialog migrated onto it, 33 tests) | COMPLETE: wave 1 fixed, wave 2 APPROVE (0 C/H/M, 2 accepted LOW) | pending founder review |
| Pilot: Sales Credit Note (Class C #1) | ✅ COMPLETE: wave 1 fixed, wave 2 SHIP, edit-mode UI + 29 adapter tests + replacement-link banner (86 CN tests) | |
| Audit-trail wiring verification (founder req: who-did-what visible in activity log forever) | recon in progress | |
| Direct Sale (C2) | ✅ COMPLETE: backend SHIP wave 1; list+detail routes, shared cancel dialog, invoice hint, nav; wave 2 re-run SHIP (0 C/H/M, 66 tests) | |
| Stock Adjustment (C3) | ✅ COMPLETE: wave 1 fixed (BUG#56 amend guard, correlationId e2e, race 409, dual period gate), wave 2 SHIP (0 C/H/M) | |
| Stock Transfer received-state reverse (C4) | ✅ COMPLETE: 133 tests + Edit UI + reason-through-saga (bespoke endpoint retired); wave 2 SHIP; follow-ups fixed (in-tx locked consumption guard, cancel-payload refine, blockReason codes, panel ReferenceError; 118 tests) | |
| POS Cash Movement, shift-open only (C5) | ✅ COMPLETE: wave 1 fixed (row lock + SHIFT_CORRECTION_STALE optimistic concurrency), wave 2 SHIP (0 C/H/M) | |
| POS Shift reopen/re-close variance (C6) | ✅ COMPLETE: same cycle, wave 2 SHIP; LOW noted (reclosedAt not in ZReportResponse DTO) | |
| Batch write-off (C7) | ✅ COMPLETE: wave 1 fixed (batchNumber pinning root-cause, mismatch defense, canUndoWriteOff flag), wave 2 SHIP; cross-feature hole closed (WriteOff blocked from generic amend + batch-pinning threaded, 194 tests) | |
| Opening Balance delta-correction (C8) | ✅ COMPLETE: wave 1 fixed (advisory locks, write-once reversal guard, control-account pinning, AR/AP UI + stub sync), wave 2 criticals fixed (eventId lockKey scoping, entity-scoped stubs), wave 3 SHIP (239 tests) | |
| Class B: Sales Order | ✅ COMPLETE: wave 1 fixed (atomic createWithLines + self-compensating confirm + ATP pre-check), wave 2 SHIP, createWithLines direct coverage backfilled (92 tests) | |
| Class B: Purchase Bill amend | ✅ COMPLETE: wave 1 fixed (FIFO order, createWithLines + markOrphanedDraft, canEdit preview split, blockReason codes), wave 2 SHIP (171 tests) | |
| Class B: Supplier Payment + Receipt Voucher | ✅ COMPLETE: wave 1 fixed (KERNEL compensation-audit + traceable compensation docs, previewBlockReason shared helper, discountShare threading, discount/rate UI, receipt discardDraft), wave 2 SHIP (537 tests) | |
| Class B: Manual JE amend | ✅ COMPLETE: wave 1 CRIT fixed (both legs on ORIGINAL date via ReverseEntryOptions — period-bound reports net exactly; standalone reverse unchanged), wave 2 SHIP with 0 findings (373 tests) | |
| Class B: Sales Invoice amend | ✅ COMPLETE: wave 1 fixed (createWithLines + draft-delete self-comp, FIFO, shared guard predicate, ATP pre-check), wave 2 SHIP (180 api + 202 web tests) | |
| Class B: Purchase Return amend | ✅ COMPLETE: wave 1 fixed (createWithLines + discardDraft + bill-status guard), wave 2 SHIP with 0 findings (122 tests) | |
| Class B: Supplier Payment / Receipt Voucher corrected-recreate | queued | |
| Class A | verified done (all 7 masters have full PATCH) | n/a |

## Wave 1 review outcomes (Phase 0 primitive)

Backend (code-reviewer BLOCK + accounting + nestjs + database):
- CRIT: replayIfSeen not bound to originalDocumentId (cross-doc replay hijack); unguarded
  post-completion audit append (500-after-success invites unsafe retry) -> fix: single finalize tx
  (completed flip + audit exec + outbox in-tx)
- HIGH: no unresolved-amendment guard on same doc (+ DB partial unique (tenant,original_doc)
  WHERE pending + 23505->409); gate order PIN-before-permissions = PIN oracle (reorder to match
  GRN saga); stepsCompleted crash-recovery overclaim (honest docs, manual-reconcile ceiling)
- MED: trigger legal status transitions (0091 style); 23505 mapping; outbox in-tx;
  accounting contract: documentExchangeRate/Currency in AmendLoadResult (IAS 21), original-date
  posting convention as hard contract, net-zero-by-correlationId obligation, step run() must be
  internally transactional; idempotencyKey made REQUIRED
- LOW: reason non-empty CHECK; completed=>completed_at CHECK

Frontend (code-reviewer + frontend-reviewer, no blockers):
- HIGH: submitLabel prop (cancel mode must never default to "Save" on red button); testid
  suffix/prefix to survive two instances per page
- MED: migrate EditGrnCostDialog onto primitive (dedupe money-critical logic); reset-on-close
  test; mapAmendError soft-lock precedence internal; tests for error-map + popover; JSDoc contract
  (errorMessage reset on close, impactLines pre-isolated bidi, rows newest-first)
- LOW: bdi on changedByName; badge WCAG label-in-name; REASON_MIN_LENGTH 1->3

## Audit-trail hardening shipped alongside
- DocumentAmendment audit labels (en/ar) + accounting group mapping in the activity-log UI.
- Fixed pre-existing mislabel: 19 POST void/reverse/cancel/close routes across 19 controllers
  now log AuditAction.Update instead of defaulting to Create.

## Key file locations
- Runner: erp/apps/api/src/common/amend/
- Schema: erp/packages/db/src/schema/document-amendments.ts, migration drizzle/0206_glorious_nemesis.sql
  (regenerated via drizzle-kit so _journal.json idx 206 is machine-generated; trigger SQL merged in)
- Frontend: erp/apps/web/src/features/amend/, messages/{en,ar}/amend.json
- Reference molds: correct-cost-orchestrator.service.ts, voidBill() in purchase-invoices.service.ts,
  journal-reversal.service.ts, stock-ledger.service.ts reverse(), compose.ts (ComposeContext),
  edit-grn-cost-dialog.tsx (frontend mold)
