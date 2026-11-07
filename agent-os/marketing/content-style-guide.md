---
title: Zerupt Content Style Guide
description: Canonical voice, lexicon, visual rules, and per-account guidance for all Zerupt content. Read by MCP and content agents.
updated: 2026-06-07
source_of_truth: agent-os/brand/brand-foundation.md
---

## TL;DR

Zerupt is the world's first agentic AI retail business brain. Taglines: "Your business, handled." / "Know your next move." Voice: confident, warm, zero jargon. Palette: Olive Grove (cream, moss ink, olive, lime spark, one caramel money moment). Noto Sans only. The logo keeps its original citron colours (logo-only, never in UI). Never lead with "ERP."

---

## Voice & Tone

**Archetype:** Magician–Sage — the wise force that quietly makes the owner win.

**Spectrum:** Confident, not arrogant · Warm, not soft · Premium, not fancy · Direct, not blunt · Calm, not boring.

**Five writing rules:**
1. Lead with the outcome, not the feature.
2. Short sentences. Cut every word not earning its place.
3. Speak to one owner — never "users" or "businesses."
4. No jargon in any customer-facing copy.
5. End with momentum — a next step, a result, a reason to act.

**Do:**
- "Run your whole shop. From your phone. Done."
- "Zerupt already knows what's selling. Here's what to stock next."
- "You focus on the business. We handle the rest."

**Don't:**
- "Our comprehensive ERP solution streamlines your retail operations."
- "You can configure inventory modules to optimize stock."
- "Try our AI-powered platform today!"
- Hedges: "tbh," "honestly," "kind of," "pretty good."

---

## Lexicon

| Use | Avoid |
|-----|-------|
| run, handle, grow | ERP, module, configure |
| your next move | leverage, synergy, seamless |
| in one place, for you | platform, solution, cutting-edge |
| business, shop, owner | end-user, utilize, robust |
| money, time, stock | SKU (in customer copy) |
| it knows, it tells you, it handles | onboard (as verb), dashboard (when "your numbers" works) |
| agentic AI retail business brain | ERP (never lead with this) |

**Grammar:** Sentence case for headlines and UI. Contractions welcome. Numerals for quantities and money (Noto Sans tabular numerals). Oxford comma. Never ALL-CAPS for emphasis — use weight instead.

**Naming surfaces:** after the owner's outcome, not the engineering domain. "Your Numbers," not "Reporting Module."

---

## Taglines & Boilerplate

**Primary tagline:** "Your business, handled."
**Sub-line / growth angle:** "Know your next move."

**One-sentence pitch:**
> Zerupt is the one place to run your whole retail business — and it tells you what to do next to grow.

**Thirty-second pitch:**
> Most retail owners are drowning — spreadsheets, stock, accounting, no time, no clarity. Zerupt is a single, smart place that runs all of it for them, in their language, and actively tells them their next move to make more money. Not software you operate. A business brain that works for you.

**Boilerplate (bio / footer):**
> Zerupt is the world's first agentic AI retail business brain — one premium place for retail owners across MENA, India, and Southeast Asia to run everything and grow faster, without the busywork.

**Messaging pillars (repeat forever):**
1. One place for everything — the whole business, unified.
2. It works for you — done-for-you operations, no busywork.
3. It grows you — the advisor that tells you your next move.

---

## Visual Rules

> Full token spec: `erp/DESIGN.md`. CSS implementation: `apps/web/src/app/globals.css`. Brand meaning: `agent-os/brand/brand-foundation.md`.

### Palette (roles, not primitives)

Source of truth: `erp/DESIGN.md` (Paper boards -> DESIGN.md -> `globals.css`). Spec v3 "Olive Grove" is locked; app code is still migrating to it. Use roles, never raw hex or raw Tailwind palette classes.

| Role | Light | Dark (forest night) | Use |
|------|-------|------|-----|
| Canvas (`bg`) | `#F7F6EF` | `#0F1A0E` | Page background. Light first, dark fully supported |
| Surface | `#FFFFFF` | `#172416` | Cards, inputs |
| Moss ink / foreground (`fg`) | `#283618` | `#EFF1ED` | Text, primary buttons |
| Muted foreground | `#6B6A55` | `#B4B9A4` | Secondary text |
| Brand olive | `#606C38` | fern `#90A955` | Links, "+ Add" actions, brand marks |
| Signature lime | `#ECF39E` | `#ECF39E` | Selection, highlight and spark (on dark it is also accent text and links) |
| Signature caramel | `#DDA15E` | `#DDA15E` | The one money/CTA moment (Charge, Pay). Fill only, moss text on it |
| Copper | `#BC6C25` | same | Marketing highlight. Fill/decoration only, never text on light |
| Cornsilk | `#FEFAE0` | n/a | Marketing section backgrounds only |

Scales (moss, grove, caramel, sand) and the bark tones for illustration and photography live in `erp/DESIGN.md`.

**Hard rules:**
1. One caramel money moment per screen or slide. Roughly 60% canvas or cornsilk / 30% moss ink / 10% olive, lime and caramel as a guideline.
2. Caramel, copper and lime are fill/accent only on light. Never caramel or lime text on light (`#F7F6EF`). Olive `#606C38` is the brand text and link colour on light.
3. Primary CTAs are moss ink (`#283618`), not caramel. The caramel button is the single money moment (Charge, Pay).

**Absolutely banned:** violet, teal, navy, raw Tailwind palette classes, raw hex in components, IBM Plex, Inter, serif. Glassmorphism is banned except frosted-paper glass on floating chrome (bars, menus, sheets, toasts); never on tables, forms, paragraphs, or marketing graphics.

**Always consume semantic roles** (`bg-primary`, `text-muted-foreground`, `bg-accent`) never raw hex.

### Typography

| Family | Use |
|--------|-----|
| Noto Sans / Noto Sans Arabic / Noto Sans Devanagari (plus Gurmukhi, Thai per script) | All display, headings, body, UI, money and figures (tabular numerals) |
| Noto Sans Mono | Eyebrows, codes, SKUs, small labels |

Money and figures use Noto Sans tabular numerals (`tabular-nums`), right-aligned in tables, full precision (KWD 3dp). Not Mono.

**Never:** IBM Plex, Inter, any serif, or any other typeface.

Weights in use: 400 (body), 500 (display, card titles), 600 (headings). No 700. Arabic runs about 6% larger with line-height 1.6.

---

## Per-Account Guidance

### @zerupt.erp (company account)

- Voice: authoritative, outcome-led, zero founder personality.
- Show the product doing the work and giving the next move.
- Real owner context over stock imagery.
- Copy: "Your business, handled." energy — calm confidence, never hype.
- Launch date: June 15, 2026.

### @hussainbuildswithai (personal / founder account)

- Voice: builder's perspective — direct, honest, behind-the-scenes.
- Founder insight, build-in-public, lessons learned.
- Can be more personal, but never hedging or insecure.
- Connect individual features back to the owner's outcome.
- Avoid: startup hype clichés ("disrupting," "game-changer," "excited to announce").

### Both accounts

- Sentence case always.
- Arabic content: same Noto Sans Arabic, same tone (warm, confident, owner-language).
- CTAs: outcome-led. "See it run" not "Click here."

---

## Carousel & Asset Rules

**Slide layout:**
- Background: cream `#F7F6EF` or cornsilk `#FEFAE0` (light) or forest night `#0F1A0E` (dark).
- Headline: Noto Sans SemiBold (600), moss ink or cream. Sentence case.
- Data / numbers: Noto Sans tabular numerals, set in olive `#606C38` on light or lime `#ECF39E` on dark.
- Accent element: one lime or caramel fill or underline per slide — not repeated across every element.
- One slide = one idea. Lead with the owner outcome, not the feature name.

**Data visualization in assets:**
- Chart colors: the category palette in `erp/DESIGN.md` (fern, caramel, sky, rose, jade, copper, berry, forest; provisional). Max 6 series, direct labels.
- Numbers in Noto Sans tabular numerals.
- Label the insight, not just the data. "You'll run out Thursday" not just a bar chart.

**Photography / imagery:**
- Real retail, real owners, MENA / India / SEA context.
- Warm, natural light. True-to-life color. No heavy filters.
- Logo on imagery: mono ink `#141310` or mono reversed `#F7F6F2` only, with scrim if contrast < AA.
- Never: generic stock tech, abstract 3D gradients, corporate boardrooms, screens glowing in dark rooms.

**Banned in all assets:**
- Violet, teal, navy, or any color outside the palette above.
- White text on caramel or lime.
- Caramel or lime text on cream.
- Inter, IBM Plex, or any non-Noto font.
- Gradients, patterns, noise fills.
- Bounce/spring animations.

---

## Copy in Context (quick reference)

| Surface | On-brand example |
|---------|-----------------|
| Web headline | "Your business, handled." |
| Web subhead | "One place to run your shop — and know your next move." |
| Primary CTA | "Start free" / "See it run" |
| Empty state | "Nothing here yet. Add your first product and Zerupt takes it from there." |
| Error | "That didn't go through. Nothing was lost. Try again, or we'll sort it." |
| Success toast | "Done. Stock updated across every report." |
| Push notification | "You'll run out of [item] by Thursday. Tap to reorder now." |
| Email subject | "Here's your next move this week" |
| Destructive confirm | "Delete this for good? This can't be undone." |
| Social caption | Lead with the outcome. Show the product thinking. One CTA. |
