# POS — Printing & Receipts Testing Checklist

> Persona: **Counter cashier / shift supervisor.** The printer is on the counter. Every completed sale should produce a paper receipt. Ask at every screen: **"what's the dumbest thing a cashier could do here, at speed, with a customer waiting?"** And specifically: what happens if the printer jams, the cable is unplugged, or the agent is an old version?

- **Route(s):** Print actions on `/pos` (post-sale, reprint); printer setup in register config (`/pos/registers/:id` or settings)
- **Feature dir:** `apps/web/src/app/[locale]/(pos)/pos/` — print trigger components; register settings panel
- **API:** No HTTP endpoint — print is local, via WebSocket to print agent at `ws://127.0.0.1:9723`
- **Tables:** `pos_registers` (`printerType`, `connection`, `host`, `port`, `cashDrawerConnected`, `dotMatrixMode`)
- **Depends on:** 01-register-session (register config exists), 02-transaction-lifecycle (completed transaction), 07-receipt-model (receipt data is correct before printing).

## 0. Preconditions

- [ ] Print agent is running on the test workstation at `ws://127.0.0.1:9723`; confirm the WebSocket handshake succeeds before testing print paths.
- [ ] Register is configured with a printer type (thermal or dot-matrix), correct host/port, and `cashDrawerConnected` set to match the physical setup.
- [ ] At least one completed transaction exists to trigger a print.
- [ ] A second machine or separate test (using an invalid host/non-RFC1918 IP) is available to test the SSRF guard.
- [ ] Arabic locale enabled for one test of bilingual receipt rendering.

## 1. Functional — actions & states

For each action: verify the happy path **and** the four states — loading / error / empty / success.

### Print agent connection

- [ ] **Agent reachable** — the POS UI reports a connected print agent with a green status indicator on the register status bar.
  - [ ] Agent not running: POS shows a clear "printer offline" warning; the cashier can still complete sales (print failure does not block completion).
  - [ ] Agent version mismatch: if the installed agent version is older than the minimum supported, the UI warns the cashier and provides instructions to update; sales are not blocked but printing may not work.

### Post-sale receipt print

- [ ] **Auto-print on completion** (if configured) — after `POST :id/pay` succeeds, the receipt is automatically sent to the print agent; the cashier sees a "Printing…" indicator and then "Printed" confirmation.
  - [ ] Print failure (agent timeout, paper out): the "Printing…" indicator does not spin forever; a timeout surfaces a clear message ("Print failed — receipt still available on screen"); the cashier can retry or show the screen receipt to the customer.
  - [ ] Auto-print does NOT block or delay the sale completion; the print is a fire-and-forget after the transaction is committed.
- [ ] **Manual print trigger** — cashier taps a print button; a fresh print job is sent to the agent; `reprintCount` increments if this is after the first print.
  - [ ] Rapid double-tap: only one print job sent; the button is disabled while the print job is in flight.

### Cash drawer

- [ ] **Cash drawer opens on cash payment** — after a completed cash transaction, the agent sends an `ESC p` (drawer pulse) to the printer; the cash drawer opens.
  - [ ] Cash drawer opens only when the tender includes a cash component; card-only sales do NOT trigger the drawer pulse.
  - [ ] If `cashDrawerConnected = false` on the register: no drawer pulse is sent; the agent does not attempt to open a non-existent drawer.
  - [ ] If `cashDrawerConnected = true` but the drawer cable is unplugged: the agent sends the pulse; the drawer does not open (physical failure); the transaction is not rolled back; the cashier is not shown an error (the agent cannot detect drawer failure).

### Reprint

- [ ] **Reprint from back-office** — supervisor opens the transaction detail and clicks reprint; the receipt is printed with a "REPRINT" header; `reprintCount` increments.
- [ ] **Reprint of offline transaction** — until the transaction is synced, no `transactionNumber` exists; the reprinted receipt shows the `offlineNumber` and a "Sync pending" note; the QR is absent.
- [ ] Reprint is available only to users with the reprint permission; cashier without permission sees the button disabled; server rejects a reprint POST with 403.

### Thermal receipt (standard)

- [ ] **Thermal layout** — receipt fits the configured paper width (typically 80mm or 58mm); line items do not wrap in a way that makes them unreadable; totals are right-aligned.
- [ ] **Arabic on thermal** — for a tenant with Arabic as the primary language, the receipt renders correctly in Arabic; text direction is correct (RTL); IBM Plex Sans Arabic glyphs are used (or the correct thermal font encoding); numbers remain LTR.
- [ ] **Long item names** — an item name longer than the paper width is either wrapped or truncated with "…"; it does not cause the receipt to produce garbled ESC/POS bytes.
- [ ] **`window.print()` fallback** — if the print agent is unavailable, the browser's `window.print()` thermal fallback is triggered; the fallback layout is visually acceptable for a thermal receipt; content is not truncated (scrollable areas do not cut off mid-receipt).

### Dot-matrix receipt (`dotMatrixMode = true`)

- [ ] **Dot-matrix (graphics mode)** — when `dotMatrixMode = true`, the agent uses `ESC * 24-pin` raster graphics mode; confirm that a real dot-matrix printer produces a legible receipt (this cannot be fully tested in simulation).
- [ ] **Arabic via canvas bitmap** — Arabic text on dot-matrix is rendered by converting the text to a canvas bitmap and sending it as a raster image; confirm this path does not crash the agent; confirm the output is legible on a real printer if available.
- [ ] **`window.print()` fallback on dot-matrix** — if the agent is unavailable, the browser fallback is triggered; the fallback may not support dot-matrix formatting; the cashier is warned that the printout may not be formatted correctly.

### Security guards

- [ ] **SSRF guard — non-RFC1918 host rejected** — configure the register with a non-RFC1918 `host` (e.g. `8.8.8.8`); the agent rejects the TCP connection with a clear error; no outbound TCP connection is made to the external host.
  - [ ] RFC1918 hosts (`10.x.x.x`, `192.168.x.x`, `172.16–31.x.x`, `127.x.x.x`) are accepted.
- [ ] **CSWSH guard — non-Zerupt WebSocket origin rejected** — a WebSocket connection attempt from a page with an origin other than the Zerupt POS frontend URL is rejected by the agent; prevents a malicious web page on the same machine from hijacking the print agent.

## 2. Domain invariants (cash / GL / stock)

- [ ] **Print failure never blocks transaction completion:** no `pos_transactions` row has `status = 'pending'` because a print failed; print is always post-commit and decoupled from the transaction state machine.
- [ ] **Cash drawer pulse only on cash payment AND `cashDrawerConnected = true`:** no drawer pulse is sent for non-cash tenders; no pulse is sent if `cashDrawerConnected = false`; these two conditions are AND-ed at the agent instruction level, not just the UI level.
- [ ] **Agent rejects non-RFC1918 TCP targets:** the agent's host allowlist covers only private IP ranges; any attempt to print to a public IP is logged and rejected; this is enforced in the agent binary, not just validated in the frontend.
- [ ] **Agent rejects non-Zerupt WebSocket origins:** the agent's origin allowlist includes only the production Zerupt POS URL (and `localhost` for development); an arbitrary web page cannot connect to the agent.
- [ ] **`reprintCount` monotonically non-decreasing:** every reprint increments `pos_receipts.reprintCount` by exactly 1; no concurrent reprint race condition can cause a count to be lost or double-incremented; verify with a rapid concurrent reprint test.

## 3. Edge cases & defensive UX — "the dumbest thing a cashier could do here"

- [ ] **Paper jam mid-print:** print job fails partway through; agent returns an error; the POS shows a "print failed" message with a "Retry print" button; the transaction is already committed and is not affected.
- [ ] **Printer out of paper:** same as paper jam — error surfaced; retry available; no block on next sale.
- [ ] **Agent restarted mid-shift:** the POS reconnects to the agent automatically on the next print attempt (WebSocket reconnect logic); the cashier does not need to refresh the POS page.
- [ ] **Cashier on the wrong workstation (no local agent):** the POS cannot reach `ws://127.0.0.1:9723` from a workstation where the agent is not installed; the POS shows a "printer not available on this device" message; the cashier can still complete sales and show screen receipts.
- [ ] **`window.print()` fallback truncates:** if the browser's print dialog truncates the receipt (e.g. because the receipt is in a scrollable div that the browser cannot fully render), a customer may receive an incomplete paper receipt. Confirm the fallback uses a print-specific CSS layout that forces full-height rendering.
- [ ] **Agent version is stale (months old binary):** the agent may not support new receipt fields or ESC/POS commands added since the binary was distributed. The POS should check the agent version on connect and warn if below the minimum supported version; it must not crash silently on unrecognized commands.
- [ ] **Dot-matrix Arabic canvas bitmap is very slow:** rendering Arabic text to a canvas bitmap and transmitting it as raster data over a local WebSocket is slower than standard ESC/POS text; on a busy POS this could cause perceptible delay. Test with a full receipt and measure time-to-print.
- [ ] **RTL (Arabic) on the post-sale print button and reprint prompt:** UI surrounding the print actions renders correctly under RTL; the print button label is localized.

## 4. Cross-module / integration

- [ ] Print agent state (connected / disconnected) is reflected in the register health status visible to the shift supervisor; a permanently disconnected agent should surface in a back-office alert, not only at the point of sale.
- [ ] Reprint events are recorded (via `reprintCount` increment) and are visible in the back-office transaction detail alongside the original print; a supervisor can audit how many times a receipt was reprinted for a given transaction.
- [ ] The public receipt URL (from 07-receipt-model) and the printed paper receipt contain the same information; verify that the QR on the paper receipt resolves to the same `pos_receipts` content.

## 5. Known gaps (from recon — verify or track)

- **`dotMatrixMode = true` with Arabic via canvas bitmap is complex and requires real-printer testing** — the canvas-to-raster path has not been verified on a physical dot-matrix printer with Arabic content; simulation alone cannot confirm legibility. Schedule a real-printer test session with an actual dot-matrix device before go-live in environments that use dot-matrix. **HIGH** for dot-matrix tenants; **LOW** for thermal-only deployments.
- **`window.print()` thermal fallback may truncate** — the browser print layout for receipts has not been confirmed to render the full receipt without cutting off content in scrollable containers. Verify in Chrome and Safari (common on POS machines) with a long receipt (20+ items). **MEDIUM**.
- **Print agent is a per-workstation manual-update binary** — there is no auto-update mechanism; stale agent versions will accumulate across a tenant's fleet of POS workstations. A stale agent that does not support new ESC/POS commands or security fixes is a reliability and security risk. Consider an agent version check at POS startup and a mandatory update prompt. **MEDIUM** reliability; **HIGH** security (stale agents may lack the SSRF or CSWSH guards if they were added in a later version).
- **SSRF guard implementation location** — whether the RFC1918 host allowlist is enforced in the agent binary or in the frontend configuration is unconfirmed. If enforced only in the frontend, a modified client could bypass it. Confirm the guard is in the agent binary. **HIGH** security.
- **Agent WebSocket reconnect logic** — whether the POS frontend automatically reconnects to the agent after an agent restart mid-shift is unconfirmed. If not, the cashier must manually refresh the POS page, which could discard the current cart state if not saved. **MEDIUM**.

## Sign-off

- [ ] All CRITICAL/HIGH items pass for the loaded dataset.
- [ ] Findings logged in `_findings.md`.
