---
title: Zerupt Content Style Guide
description: Canonical voice, lexicon, visual rules, and per-account guidance for all Zerupt content. Read by MCP and content agents.
updated: 2026-06-07
source_of_truth: agent-os/brand/brand-foundation.md
---

## TL;DR

Zerupt is the world's first agentic AI retail business brain. Taglines: "Your business, handled." / "Know your next move." Voice: confident, warm, zero jargon. Palette: cream, ink, one citron accent. IBM Plex only. Never lead with "ERP."

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

**Grammar:** Sentence case for headlines and UI. Contractions welcome. Numerals for quantities and money (IBM Plex Mono). Oxford comma. Never ALL-CAPS for emphasis — use weight instead.

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

### Palette (the ONLY allowed colors)

| Name | Hex | Use |
|------|-----|-----|
| Cream (canvas) | `#F9F7F5` | Page background (light) |
| Ink | `#141310` | Text, primary buttons |
| Citron (accent) | `#979C1A` (light) / `#C2C84A` (dark) | Fill, ring, data viz only |
| Olive-mid | `#747818` | Data viz |
| Olive-deep | `#454729` | Citron-toned text, links (`accent-text`) |
| Sage | `#ADAB92` | Muted data viz |
| Dark bg | `#0E0D0A` | Dark mode canvas |
| Dark fg | `#F2F0EC` | Dark mode text |
| Dark muted | `#A8A496` | Dark mode muted text |

**Three hard rules:**
1. One citron accent per view. ~10% of any composition.
2. Citron is fill/ring/data ONLY — never text on light (`#F9F7F5`). Citron-toned text uses olive-deep (`#454729`), AAA contrast.
3. Primary CTAs are ink (`#141310`), not citron.

**Absolutely banned:** violet (#7C3AED or any variant), teal (#14B8A6 or any variant), dark navy, raw Tailwind zinc, raw white (#FFFFFF as brand color).

**Always consume semantic tokens** (`bg-primary`, `text-muted-foreground`, `bg-accent`) — never raw hex or raw Tailwind palette classes.

### Typography

| Family | Use |
|--------|-----|
| IBM Plex Sans (Latin / Arabic / Devanagari) | All display, headings, body, UI |
| IBM Plex Mono | Numbers, currency, codes, data tables |

**Never:** Inter, Noto Sans, any serif, or any other typeface.

Weights in use: 400 (body), 500 (card titles), 600 (headings/display). RTL line-heights ≥1.5.

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
- Arabic content: same IBM Plex Arabic, same tone (warm, confident, owner-language).
- CTAs: outcome-led. "See it run" not "Click here."

---

## Carousel & Asset Rules

**Slide layout:**
- Background: cream `#F9F7F5` (light) or ink-dark `#0E0D0A` (dark).
- Headline: IBM Plex Sans SemiBold (600), ink or cream. Sentence case.
- Data / numbers: IBM Plex Mono, set in olive-deep on light or citron-light on dark.
- Accent element: one citron fill or underline per slide — not repeated across every element.
- One slide = one idea. Lead with the owner outcome, not the feature name.

**Data visualization in assets:**
- Chart colors: citron → olive-mid → sage → ink (this ramp only).
- Numbers in IBM Plex Mono.
- Label the insight, not just the data. "You'll run out Thursday" not just a bar chart.

**Photography / imagery:**
- Real retail, real owners, MENA / India / SEA context.
- Warm, natural light. True-to-life color. No heavy filters.
- Logo on imagery: monochrome cream or ink only, with scrim if contrast < AA.
- Never: generic stock tech, abstract 3D gradients, corporate boardrooms, screens glowing in dark rooms.

**Banned in all assets:**
- Violet, teal, navy, or any color outside the palette above.
- White text on citron.
- Citron text on cream.
- Inter, Noto Sans, or any non-IBM Plex font.
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
