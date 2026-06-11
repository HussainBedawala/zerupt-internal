# Sami — Invoice Scanner (MVP flagship, ships June 15)

> The acquisition hook: **photograph any supplier invoice → posted purchase, stock updated, VAT handled — in seconds.** Works on the first invoice with zero history. The bar (set by a skeptical retail veteran): *boringly reliable*, not impressive-when-it-works.

## v1 Scope (locked 2026-06-07)

**IN:** supplier (purchase) invoices · photo from phone camera + PDF upload · Arabic+English mixed · draft EVERYTHING, human approves with 1 tap · new-product auto-draft · correction capture from day 1.

**OUT (v1.1+):** expense receipts · multi-page invoices · bank statements · bulk scan · WhatsApp-in · handwriting promises (we try, we don't market it).

## The Flow

```
📸 photo / PDF upload
  → upload to storage, create scan job (status: extracting)
  → apps/ai /ai/extract: VLM → structured ExtractedInvoice JSON + per-field confidence
  → NestJS matching pipeline (deterministic, reuses import-ladder thinking):
      supplier:  TRN exact → name exact → fuzzy (suggest) → create-new draft
      products:  barcode exact → SKU exact → supplier-item-code cache → name fuzzy → NEW product draft
      VAT:       extracted rate vs tenant tax profile; mismatch = flag, never silently accept
      totals:    lines vs subtotal vs VAT vs grand total must reconcile; else flag the exact line
  → review screen: draft purchase + GL preview, per-field confidence styling,
      unmatched/new items called out
  → [Approve & Post]  → existing purchase posting path (stock + GL + audit), origin: 'zee/sami'
  → [Edit]            → every correction logged (see Correction Capture)
```

Target: photo → review screen in **≤10s**; review → posted in 1 tap.

## Review Screen (the trust moment)

- Supplier card: matched ✓ / fuzzy (choose) / new (pre-filled draft)
- Lines table: matched product, qty, unit cost, VAT — low-confidence fields visually distinct (amber), high-confidence quiet
- NEW items inline: "1 new product — Sami drafted it (name AR/EN, cost, category guess)"
- GL preview: the exact journal that will post (accountant trust + accounting label review applies)
- Total reconciliation badge: extracted total vs computed total — must match to enable Approve
- Defensive UX: blurry/unreadable photo → "Retake — I can't read the totals" with the problem region highlighted; never a silent wrong guess

## Extraction Service (`apps/ai/extraction/`)

- **Adapter interface from day 1**: `ExtractionProvider.extract(image|pdf) -> ExtractedInvoice`. v1 provider = cloud VLM (Gemini Flash class — best AR/EN mixed, bad-photo tolerance, ~$0.002/invoice). v2 provider = self-hosted fine-tuned Qwen-VL-class on serverless GPU when volume + dataset justify. Swap is config, not code.
- Structured output schema with per-field confidence; same retry-once self-correction pattern as the existing `llm/router.py`.
- Prompt-injection defense as existing prompts: invoice content is DATA, never instructions.
- Privacy note: invoice photos are *supplier documents*, outside the "your numbers never leave" promise (which covers the tenant's books/sales). Stated honestly in the privacy page; migration path to self-hosted closes even this.

## Correction Capture (the flywheel — non-negotiable)

Every user edit on the review screen is recorded:

```
scan_corrections: scanJobId · field path · extractedValue · correctedValue ·
                  extractionConfidence · modelVersion · createdAt
```

Plus the stored original image (retention policy: keep while tenant active). This is the training set for the future self-hosted extraction model AND the supplier-item-code cache that makes repeat invoices from the same supplier near-perfect (learn, don't re-infer).

## Accuracy Discipline

- Per-scan telemetry: fields extracted, fields corrected, time-to-post → a real accuracy metric per supplier/format from week 1.
- Weekly review of worst suppliers/formats → prompt/schema fixes.
- Marketing claims follow measured accuracy, never precede it.

## 8-Day Build Plan (June 7–15, alongside MVP close-out)

| Days | Slice |
|---|---|
| 1–2 | `extraction/` service + adapter + schema + tests (mocked VLM); storage + scan job lifecycle in NestJS |
| 3–4 | Matching pipeline (supplier/product/VAT/totals) + draft purchase assembly + GL preview reuse |
| 5–6 | Review screen UI (web, mobile-camera-first) + approve→post path + correction capture |
| 7 | Arabic invoices, thermal/crumpled photos, totals-mismatch and retake flows, edge cases |
| 8 | Demo polish, real-invoice test set (collect 20+ real GCC supplier invoices), i18n, telemetry |

Risk valve: if day 6 quality is shaky, v1 ships behind a "Founding 50 early access" flag rather than slipping the MVP.
