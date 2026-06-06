# Offline-First POS Batch — DEV-389–395 Capstone

> Phase 4A study note. How the seven issues in the POS hardening batch compose into a coherent system.

---

## The Seven Issues and Their Role

| Issue | Concern | System role |
|-------|---------|------------|
| DEV-389 | Transaction write path, permission gates, idempotency | Core integrity layer |
| DEV-390 | Offline cart — local state survives network loss | Offline-first foundation |
| DEV-391 | Keypad UX — touch-optimised numeric input | Input reliability |
| DEV-392 | Product images at POS | Scan-confirmation UX |
| DEV-393 | Receipt settings UI | Cashier-configurable output |
| DEV-394 | Local print agent | Hardware bridge |
| DEV-395 | Invoice formats (A4 + dot-matrix) | B2B / wholesale output |

These are not independent features bolted together — they form a stack:
- The offline cart (390) feeds the transaction writer (389).
- The keypad (391) and images (392) make item entry fast and error-free at the cart stage.
- The receipt settings (393) tell the print agent (394) which format and printer to use.
- The print agent (394) forwards ESC/POS or ESC/P bytes for whichever invoice format (395) was chosen.

Touch UX runs through every layer — keypad tap targets, image tap-to-confirm, settings toggles, and the post-sale action buttons must all work on a tablet without a keyboard.

---

## The "Render-Only Document" Pattern

The A4 tax invoice is not a separately stored document with its own series or lifecycle. It is a **view** rendered on demand from `pos_transactions` data.

Contrast with two alternative models:

| Model | When to use |
|-------|-------------|
| **Parallel document** | The invoice has its own numbering, approval state, or regulatory lifecycle independent of the transaction (e.g., e-invoicing mandates that require separate submission). |
| **Render-only (chosen)** | The invoice is a presentation format of transaction data; same number, same state, no separate persistence. Simpler, no sync risk, no dual-numbering. |

The render-only model is correct here because:
1. GCC e-invoicing (ZATCA Phase 2 etc.) is handled at the transaction level, not the invoice level.
2. The customer always references the transaction number — there is no world where the invoice number diverges.
3. No approval or amendment workflow exists for a POS tax invoice.

If regulations later require a separate invoice series or submission acknowledgement number, the pattern upgrades to a parallel document — but that is additive, not a rewrite.

---

## Offline-First Composition

The offline cart stores a complete pending transaction locally (IndexedDB or equivalent). When connectivity returns:

1. Cart syncs to server via the idempotent `POST /transactions` endpoint.
2. Idempotency key (generated offline, UUID v4) prevents duplicate creation on retry.
3. Server responds with the canonical transaction record.
4. Print path executes locally (agent or browser) — does not require round-trip confirmation.

Key invariant: **the transaction must be persisted server-side before the receipt is printed** (or at minimum before the drawer opens). The agent awaits the server success response, then triggers print + drawer kick. This prevents printing a receipt for a transaction that failed to commit.

---

## Magic-Byte Upload Validation Rationale

DEV-392 adds product images. Validating file uploads by extension or MIME type (from the Content-Type header) is insufficient — both are client-supplied and trivially spoofed.

Magic-byte (file signature) validation reads the first 4–16 bytes of the actual file content and checks against known signatures:
- JPEG: `FF D8 FF`
- PNG: `89 50 4E 47 0D 0A 1A 0A`
- WebP: `52 49 46 46 ... 57 45 42 50`

Why it matters at POS:
- Images are rendered inside the POS UI. An SVG with embedded script, or a disguised HTML file, could execute in the browser.
- Supabase Storage does not strip embedded payloads — the application must validate before accepting.
- Magic-byte check is fast (read first 16 bytes only), adds no perceptible latency, and catches the most common bypass attempts.

Extension + MIME + magic byte = defence in depth. All three should pass before the image is stored.

---

## Composability Summary

The batch is designed so each issue can ship and be tested independently, but the full value emerges when all seven are live together: a cashier on a tablet, in a basement with no signal, can ring up a sale using images and a touch keypad, have it sync when connectivity returns, and automatically print either a thermal receipt or an A4 tax invoice to the right hardware — all without leaving the POS screen.
