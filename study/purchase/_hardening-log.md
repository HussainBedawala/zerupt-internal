# Purchase Module Hardening — Log (2026-06-29 → 2026-06-30)

🏁 **PROGRAM COMPLETE.** All 6 layers shipped to `main`; dev migrated; prod auto-applies via the
Railway pre-deploy migrator. Per-layer fix detail (resolved) lives in the commits + the
`/tmp/purchase-hardening/layer-*-{audit,fixes}.md` reports; this log keeps the summary + what's
still OPEN.

## What was delivered
| # | Layer | Commit | Migration |
|---|-------|--------|-----------|
| 0 | Supplier master + AP subledger foundation | `33c7a688` | 0124 |
| 1 | PO lifecycle + direct-purchase dual path | `53b0de52` | 0125 |
| 2 | GRN receipt + stock handoff + GR/IR + void | `e5635748` | 0126+0127 |
| 3 | Purchase invoice — 3-way/2-way match + input VAT + AP + bill void | `2fc7d4b8` | 0128 |
| 4 | Landed cost allocation + inventory revaluation + reversal | `8cefc2ad` | 0129 |
| 5 | Supplier payments + returns + AP aging + period integrity | `f63a230d` | 0130 |

Each layer: study → audit → harden → 6/7-agent reviewer panel (incl. accounting balance-proof +
security) → all findings fixed same session → real `node dist/main` boot DI gate → dev migration →
ship. 0 CRITICAL remaining on any layer.

## Outcome (the invariants now guaranteed)
- **Dual path** first-class everywhere: direct-purchase express AND PO→GRN→bill→payment.
- **AP subledger-of-record** derived from the immutable party-tagged 2111 ledger; reconcile
  invariant HOLDS after every pay / return / reversal / void.
- **Full reversal coverage, never a dead-end:** PO cancel, GRN void, bill void, landed-cost
  reverse, payment reverse, return void — all idempotent, net-zero contra, PIN+SoD, period-gated.
- Reverse-charge + input VAT + PPV + GR/IR clearing + landed-cost all GL-correct (balance-proofed).
- Backend AND frontend hardened. Modular boundary protected (reorder→purchase inverted to event).

## ⚠️ STILL OPEN — founder go-live TODOs (do before launch)
1. **Verify a full purchase cycle end-to-end on a real dev tenant** — reviews were
   code/test/boot-gate level, not a live click-through.
2. **Confirm prod tenant provisioning seeds the new account mappings** (`purchase_variance` 5210,
   `landed_cost_accrual` 2122). New tenants get them at provisioning; existing tenants need
   `seed:system-accounts --apply` (done on dev).

## ⚠️ STILL OPEN — deferred capabilities (not bugs; build when needed)
- **Full multi-currency FX** — currently FAIL-LOUD module-wide (rate≠1 rejected at bill /
  landed-cost / payment). The single biggest deferred capability. Nothing is silently wrong.
- Period-end unrealized-FX AP revaluation; FIFO auto-allocation on payments; reversing an
  already-applied advance.
- In-process PIN lockout → move to Redis before horizontal scaling.
- Perf/polish: N+1 in applyGrnMatching/reverseGrnMatching (batch); index voidApprovedBy/voidedBy
  for the reports layer; bin-level GRN receipt; per-supplier over-receipt tolerance; manual
  PO-close endpoint; landed-cost allocation-preview endpoint+UI; soft-lock-override-on-confirm +
  near-dup-invoice-warning UX.

~~Credit-note / refund-receivable for an over-value return beyond the unpaid balance~~ — **BUILT
2026-08-08**, see below. Removed from the deferred list.

## Reusable gotcha (keep for sales/reports/POS hardening)
Drizzle `migrate()` wraps ALL pending migrations in ONE transaction → a newly-added enum value
cannot be referenced by literal in a CHECK in the same run. Cast `status::text` in the CHECK.
Run `npx drizzle-kit check` after any schema change.

---

## 2026-08-08: greenlight audit + fully-paid return

An 8-auditor greenlight audit ran across lists, create forms, edit/cancel/void, accounting
templates, backend API, import/export, security+i18n+print, and end-to-end flow tracing. All
HIGH/MEDIUM/LOW findings fixed same session. Backend API, security, print, and edit/void audits
returned ZERO findings.

**Deferred capability shipped.** "Credit-note / refund-receivable for an over-value return beyond
the unpaid balance" is now BUILT — two-phase design (applied/refundable split on the return +
`supplier_refund_receipts` for the cash paid back), mirroring the sales credit-note/refund-voucher
pattern. Migrations 0269-0272 (see `erp/docs/CODEMAPS/purchase.md`).

### Review-panel catches (agents' own green tests could not see these)
| # | Finding | Fix |
|---|---|---|
| 1 (CRITICAL) | `srr` missing from the pg `document_type` enum — numbering 500s, listener dies `22P02` after the document already committed | added `srr` to the enum (mig 0271); new source-scanning guard `document-type-enum-parity.spec.ts` |
| 2 (CRITICAL) | Amend adapter omitted `refundExcess`, destroying the document on amend | fixed adapter to carry `refundExcess` through |

Lesson worth keeping: mock-based tests cannot see schema-level breaks (missing enum values,
adapter field drops) — that is exactly why the source-scanning enum-parity guard exists.

### Fixes to pre-existing issues found in the audit (not new-feature bugs)
| Area | Fix |
|---|---|
| GR/IR residual under partial billing | new `grn-accrual-clearing.ts`, telescoping slices |
| Tax recoverability | `isRecoverable` predicate unified across GRN/bill/return emitters |
| Landed cost | unknown credit-type now fails loud instead of silently defaulting |
| `allocateManual` | made authoritative |
| `largestRemainder` | signed-remainder fix |
| AP reconcile | false-alarm gap closed in BOTH `supplier-ap-balance.service.ts` and `subledger-reconciliation.service.ts` (AR side too) |

### New Linear issues (not fixed in this pass)
| Issue | Description |
|---|---|
| DEV-522 | India inter-state GST posts CGST+SGST instead of IGST (no place-of-supply resolution); blocks India launch only |
| DEV-523 | `sales.refund.posted` missing from `SALES_DOMAIN_EVENTS` (replay dead-letters) |
| DEV-524 | replace hardcoded `SOD_RESTRICTED_PAIRS` with a configurable policy engine |

### Founder decisions recorded
- Refund approval is a tenant toggle (`requireRefundApproval`) defaulting OFF, consistent with the
  other four approval toggles.
- SoD was NOT weakened — a seeded `refund-approver` role template was added instead of loosening
  `SOD_RESTRICTED_PAIRS`.
- Import AI-first mandate finding: WON'T FIX for now, only template import is in use.
- Purchase/sales divergence, deliberate: purchase supplier-refund receipts have a
  `requireRefundApproval` toggle; the sales refund voucher keeps unconditional maker-checker.

### STILL OPEN — carried forward, not done
1. Verify a full purchase cycle end-to-end on a real dev tenant via actual click-through (original
   founder TODO, still open).
2. Confirm prod tenant provisioning seeds `purchase_variance` 5210 and `landed_cost_accrual` 2122
   (original founder TODO, still open).
3. **New**: the refund receipt flow specifically has NOT been exercised against a real database by
   a human. Migrations 0269-0272 are applied on DEV only.

### Debt noted
Five near-identical private approval-toggle helpers now exist (payment/bill/return/invoice/refund).
One shared `ApprovalToggleService` is the right consolidation once those files are free.

---

## 2026-09-02: bill-matched receipt payable audit

A code-level audit of `has_supplier_invoice` (bill-matched vs accrual GRN) surfaced one already-fixed
defect and three open ones.

| # | Finding | Status |
|---|---|---|
| 1 | A bill-matched receipt (`has_supplier_invoice = true`) credits Trade Payables (2111) directly and never produces a `purchase_invoices` row (`assertGrnsBillable` refuses to bill it). Supplier Payments allocates only against `purchaseInvoiceId`, so that payable was structurally unpayable. | OPEN — decided fix in progress: generalise the Direct Purchase pattern so every receipt always accrues into 2121, and `hasSupplierInvoice = true` additionally composes a real, payable bill through the same shared machinery in the same step. |
| 2 | Purchase return against a bill-matched GRN posted to the wrong control account: `resolveMatchedFractionByLineId` scored the split from `grn_lines.billed_qty` alone, which a bill-matched receipt never populates, so it always scored "fully accrual" and debited 2121 — an account the receipt never credited. 2121 went negative, 2111 stayed credited forever, and the receipt's input tax was never reversed. | FIXED same session in `purchase-returns.service.ts`: the split now asks (a) which account the receipt credited (`has_supplier_invoice`), then (b) only on the accrual path, how much has since been billed (`billed_qty`). Regression test `EDGE 10c`. |
| 3 | Blocked input tax on a bill-matched receipt diverges from the cost pool: recoverable tax is excluded from inventory cost, but the divergence isn't reconciled the same way the accrual path reconciles it at bill time. | OPEN, being fixed separately. |
| 4 | Outbox joint-failure exposure: `@OnEvent suppressErrors: true` on the GRN/bill listener pair can silently drop one leg of a two-document posting (receipt + bill) under the generalised-accrual design, the same class of gap `runDurableGated` was built to close elsewhere in the codebase. | OPEN, being fixed separately. |

Docs corrected for staleness found during this audit: `layer-5-payments-returns/04-purchase-returns.md`
(H4 wrongly asserted the return debited 2111 on a matched GRN), `layer-2-grn-receipt/04-gr-ir-accrual.md`,
`layer-2-grn-receipt/05-dual-path-receipt.md`, `agent-os/product/modules/purchase/03-goods-received-note.md`,
`agent-os/product/modules/accounting/07-event-mappings.md`.
