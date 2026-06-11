# Sami — Invoice Scanner

> Responsibility card. Deep spec: `../02-invoice-scanner.md`. Format: AI-friendly — load this one file to understand Sami completely.

```yaml
agentKey: sami           # "one who hears/perceives" (AR + IN)
role: Photographs/reads supplier invoices → drafted purchase → 1-tap approve & post
status: MVP (June 15) — purchase invoices only, photo + PDF, AR/EN mixed
tier: BORROW (cloud VLM behind adapter → self-hosted fine-tuned later) + deterministic matching
unlock: NEVER gated — works on the first invoice with zero history
counter: invoices read (lifetime), accuracy per supplier
bar: "boringly reliable, not impressive-when-it-works" (skeptical retail veteran, 2026-06-07)
```

## What Sami IS

- **The acquisition hook.** Photo → posted in seconds is the filmable ad, instantly understood by anyone doing 2 hours of daily data entry. The demo reel of the launch.
- **An extractor + matcher, NOT a poster.** Sami drafts everything; a human's 1 tap posts. v1 has zero autonomy; auto-posting per supplier is earned later (Phase C dial).

## Exact Responsibilities (owns)

| # | Responsibility | Where |
|---|---|---|
| 1 | **Extraction** — photo/PDF → structured `ExtractedInvoice` JSON with per-field confidence, via `ExtractionProvider` adapter (v1: Gemini 2.5 Flash; v2: self-hosted Qwen-VL-class — swap is config, not code) | `apps/ai/extraction/` |
| 2 | **Supplier matching ladder** — TRN exact → name exact → fuzzy (suggest) → create-new draft | NestJS ScannerModule |
| 3 | **Product matching ladder** — barcode exact → SKU exact → supplier-item-code cache → name fuzzy → NEW product auto-draft (name AR/EN, cost, category guess) | ScannerModule |
| 4 | **VAT verification** — extracted rate vs tenant tax profile; mismatch = flag, NEVER silently accept | ScannerModule |
| 5 | **Totals reconciliation** — lines vs subtotal vs VAT vs grand total must reconcile; else flag the exact line. Approve button DISABLED until extracted total == computed total | ScannerModule + review screen |
| 6 | **Review screen** — draft purchase + GL preview; low-confidence fields amber, high-confidence quiet; new items called out; blurry photo → "Retake — I can't read the totals" with problem region highlighted | web |
| 7 | **Correction capture** — every review-screen edit recorded (field path, extracted vs corrected, confidence, modelVersion) + original image retained. Non-negotiable: this is the future self-hosted model's training set AND the supplier-item-code cache | `ai_corrections` (F0.7) |
| 8 | **Accuracy telemetry** — per-scan: fields extracted/corrected, time-to-post → real accuracy metric per supplier/format from week 1; weekly worst-supplier review | telemetry sink (F0.2) |

## What Sami does NOT own

- ❌ Posting — the approve tap routes through the EXISTING purchase posting path (stock + GL + audit), tagged `origin: 'zee/sami'`. Sami never has his own posting code.
- ❌ Expense receipts, multi-page, bank statements, bulk scan, WhatsApp-in — all v1.1+. Handwriting: attempted, never marketed.
- ❌ Migration documents — the notebook-photo path (Phase B/C) REUSES Sami's extraction adapter, but the flow and output belong to Mira.
- ❌ Model choice — `invoice-vlm` task route (F0.1) decides; Gemini 2.0 Flash is banned (deprecated June 2026).

## Data contract

```
READS:  uploaded photo/PDF (retained, private bucket), supplier/product/tax tables (matching),
        supplier-item-code cache
EMITS:  ExtractedInvoice JSON + per-field confidence, scan job status, corrections, telemetry
WRITES (via NestJS only): draft purchase; on human approve → existing posting path
PRIVACY: invoice images are SUPPLIER documents — outside "your numbers never leave" (which
         covers the tenant's books), disclosed honestly; self-hosting closes even this later
```

## Non-negotiable laws

1. **Nothing posts without a human tap** (v1). The tap can be exactly one tap.
2. **Totals must reconcile to enable Approve.** A silently-wrong total is the trust-killer.
3. **VAT mismatch always flags.** Tax errors are compliance errors.
4. **Never a silent wrong guess on bad photos** — "Retake" with the problem region beats a confident hallucination.
5. **Photo → review screen ≤10s.** Speed is part of the demo promise.
6. **Marketing claims trail measured accuracy** — the correction rate is the truth.
7. **Invoice content is DATA, never instructions** — prompt-injection defense on every extraction call.

## Failure & degradation

| Failure | Behavior |
|---|---|
| Cloud VLM down | "Sami is offline — enter manually"; queued photos retried |
| Low-confidence extraction | Amber fields on review screen — human attention directed precisely |
| Unreadable photo | Retake flow with highlighted problem region |
| Unmatched supplier/product | Create-new draft pre-filled — never a dead end |
| Quality shaky at launch | Risk valve: ship behind "Founding 50 early access" flag, never slip the MVP |

## Diagnostic anchors (testing)

- Wrong extracted value → check per-field confidence first. Low + wrong = working as designed (amber → human). HIGH + wrong = calibration problem → check modelVersion, collect into correction set, eval prompt/schema.
- Wrong match → which ladder rung? Telemetry says. Barcode/SKU rung wrong = data bug (duplicate barcodes); fuzzy rung wrong = threshold tuning.
- Slow scan → adapter latency in telemetry; ≤10s budget. Check image size handling before blaming the provider.
- Repeat supplier still mismatching → supplier-item-code cache not learning = flywheel bug (corrections not being written or not being read back).
