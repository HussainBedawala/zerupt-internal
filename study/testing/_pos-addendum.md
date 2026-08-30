# POS addendum — read AFTER `_agent-briefing.md` (both are mandatory)

## POS surface under test
Route group `(pos)` — its own shell/layout, NOT the `(app)` shell:
- `/:locale/pos` — the register / sale screen (highest-frequency screen in the product)
- `/:locale/pos/display` — customer-facing mirror display
- `/:locale/pos/shifts/:id/z-report` — Z-report
Route group `(app)`:
- `/:locale/pos/registers`, `/:locale/pos/registers/:id`, `/:locale/pos/transactions`
The `reports/pos-*` screens belong to the Reports phase, NOT this phase. Do not test them.

## Facts you must know before filing anything

1. **`(pos)` was previously found ungated at the route-group level and fixed (PERM-003).**
   Re-verify the gate is still there. An ungated screen is itself a finding.
2. **ONE `sourceDocumentType = 'pos'` covers every POS document kind, and there is no
   `je.event_type`.** To tell a sale from a refund from a void you MUST join
   `sourceDocumentId -> pos_transactions`, or read the GL role. **Never infer a document kind
   from the JE alone.** Several agents have got this wrong in other modules.
3. **POS carries `cashierId`, not `salespersonId`.** Shifts, Z-reports and cash variance all
   key off `cashierId`. A missing `salespersonId` on POS is BY DESIGN, not a finding.
4. **POS approval gates are per-register, settings-optional, default OFF.** Enforce only when
   the register has the setting enabled. Read the register row before reporting an absent
   discount/void/refund approval prompt as a bug.
5. **The POS Z-report is the ONE sanctioned exemption** to "printed documents bind to the
   document's language" — the cashier viewing it IS the reader. It is documented in the file
   header. **Do not file it as an i18n bug.**
6. **POS is an event-emitting front end, NOT a ledger.** A sale writes
   `pos_transactions/lines/payments` then emits `pos.transaction.completed`; the accounting
   listener writes the balanced JE and inventory writes stock relief, both asynchronously via
   the outbox. So after a sale, the JE/stock may lag by a moment — re-query before calling a
   missing JE a bug. The load-bearing invariant is the **three-way tie-out**:
   POS record <-> GL journal <-> stock relief.
7. POS was hardened end to end previously. Read `study/pos/_hardening-log.md` before testing so
   you do not re-litigate settled design (the BUILD<->SETTLE inline pay surface with no payment
   modal is a DELIBERATE locked decision, not a missing modal).

## Starting state of this tenant (verified 2026-08-26, before this phase)
- 8 registers across 4 branches. **0 shifts ever. 0 POS transactions ever.**
  You are creating the first ones. Everything here is safe to create.
- Register codes: `B1ALRAIMAIREG1/2/3` (Al Rai Main Showroom), `B2FAHAHEELREG1/2`
  (Fahaheel), `B3JAHRABRAREG1/2` (Jahra), `B4SALMIYASREG1` (Salmiya Service Center).
- Ledger baseline: `select round(sum(debit-credit),6) from journal_entry_lines` = `0.000000`
  over 659 lines. Re-check before your first write and after your last.

## Persona
**`cashier1` is the primary persona for this module. Test POS AS THE CASHIER, not as the
owner.** Use the owner only to configure something a cashier cannot, and say so when you do.

## The POS-specific bar
POS is the highest-frequency screen in the product, used with a **barcode scanner and a
keyboard, not a mouse**. Therefore:
- **Count clicks / dialogs / forced fields for ringing up one item and taking cash.** Then
  answer directly: could an untrained Kuwaiti shop cashier complete a sale on the FIRST try in
  **under 60 seconds**? This is the whole test for this module.
- **Missing or blocked keyboard shortcuts on the register are REAL findings**, not nitpicks.
  Scan-anywhere global capture, Enter to advance, quick-cash keys, tender shortcuts.
- Kuwait has **no VAT**. Any tax UI on any POS screen is a finding.
- KWD is **3 decimals**. Any 2dp money display is a finding. Cash rounding, change due and
  denomination buttons must all be 3dp-correct.
- Known open: **POS-001 (HIGH)** — "Opening float" placeholder renders `0.00` (2dp) in this
  3dp tenant. Already filed; confirm whether still present, do not re-file as new.

## Cross-cutting findings already OPEN — do NOT re-file, do NOT try to fix
- **PERF-002** (HIGH): identical warm request 1.9s via curl vs 5.1s in browser; ~3s sits above
  the API in the Next/client layer. Unexplained, out of scope here.
- **AUDIT-002** (CRITICAL): `POST /tenant/accounts/bulk` has no audit path.
- **AUDIT-003** (HIGH): exports are unauditable by design (interceptor never audits GET).
- **AUDIT-004** (HIGH): `audit_log` has no `branch_id` / `legal_entity_id` columns.
- **PERM-004** pattern (MEDIUM): a denied user still gets a fully interactive form; the block
  only lands on submit. Server enforcement is correct, so this is UX, not a security hole.
  **Check every POS action for this pattern and report POS's instances.**
- ~30 list panels outside inventory still lack `placeholderData: keepPreviousData` and unmount
  their pagination controls on every page change. **POS's share of that is yours to find.**

## Two structural lessons to carry forward
- When a defect exists in N separate implementations, the fix is **one shared helper**, not N
  patches. Say so explicitly in the finding.
- When a defect survives the existing parity/guard tests, name **the uncovered seam** the test
  must be extended to cover — otherwise the next instance ships.
