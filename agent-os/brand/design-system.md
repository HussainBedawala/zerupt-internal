# Zerupt Design System — Marketing Reference

**Who this is for:** content creators, ad designers, social media agents, deck builders — anyone making Zerupt-branded materials who isn't writing code.

**Source of truth chain:** Brand Book (`brand-foundation.md`) → Engineering spec (`erp/DESIGN.md`) → CSS. This file distills both for non-engineer use.

---

## Brand Feeling in One Sentence

Warm, editorial, restrained. Cream paper canvas, near-black ink, one earthy citron accent. Premium and calm — the data is the hero, the chrome recedes.

---

## Color Palette

### Core Colors

| Name | Hex | Role |
|------|-----|------|
| **Cream** (canvas) | `#F9F7F5` | Page / slide background. The default surface. |
| **Ink** | `#141310` | All primary text. All primary action buttons (CTAs). |
| **Citron** (accent) | `#979C1A` | The one brand accent. Fills, highlights, active states, data viz. |
| **Olive-mid** | `#747818` | Data visualization. Secondary data series. |
| **Olive-deep** | `#454729` | Citron-toned text (links, labels that need a warm accent color). |
| **Sage** | `#ADAB92` | Muted / tertiary data viz. Quiet supporting elements. |

> **Dark mode note:** Citron lightens to `#C2C84A` on dark backgrounds for legibility. If designing dark-background assets, use `#C2C84A` for the accent.

---

### When to Use Each Color

**Cream `#F9F7F5`**
- Use: backgrounds for slides, ad frames, social cards, email bodies, print materials.
- Don't: use as text color; don't use on dark backgrounds without ink contrast.

**Ink `#141310`**
- Use: all body text, headlines, primary CTA buttons (ink background, cream text), logo wordmark on light surfaces.
- Don't: use as a background on large areas in light layouts (reserve that for cream); don't make it the button color on dark surfaces (use cream instead).

**Citron `#979C1A`**
- Use: accent fills (button rings, active indicators, highlighted data bars, tag backgrounds, the dot on the logo wordmark, icons signalling "Zerupt is advising").
- Don't: **never use citron as text color on a light / cream background.** It fails WCAG accessibility — the contrast ratio is only 2.77:1 (requirement is 4.5:1). It is invisible to many readers.
- Don't: use as a large area fill (it should be ~10% of any view, never dominant).
- Don't: put white text on a citron button. Contrast is 2.96:1 — also fails WCAG.

> **WCAG warning — citron text on light backgrounds is inaccessible.** If you need warm citron-toned text, use **Olive-deep `#454729`** instead. It achieves a 9.0:1 contrast ratio (AAA) on cream.

**Olive-deep `#454729`**
- Use: any text that should feel "citron-toned" — accent links, warm labels, highlighted copy.
- Don't: use as a background fill (too dark and muted for large areas).

**Olive-mid `#747818` & Sage `#ADAB92`**
- Use: data visualization only (charts, graphs, data tables). Together with citron they form the brand chart ramp: citron → olive-mid → sage → ink.
- Don't: use as primary brand accent or text colors.

---

### Contrast Quick-Reference (WCAG verified)

| Combination | Contrast | Pass/Fail |
|-------------|----------|-----------|
| Ink on Cream | 18.5:1 | ✅ AAA |
| Ink on Citron (citron button with ink text) | 6.7:1 | ✅ AA |
| White on Citron | 2.96:1 | ❌ Never |
| Citron text on Cream | 2.77:1 | ❌ Never — use Olive-deep |
| Olive-deep on Cream | 9.0:1 | ✅ AAA |
| Cream on Ink (dark) | 17.4:1 | ✅ AAA |

---

### Proportions Rule — 60·30·10

- **~60%** cream / dark background — let it breathe. White space is the texture.
- **~30%** ink + neutrals — text, borders, cards.
- **~10%** citron — one focal point per view. If citron is everywhere, it's overused.

---

## Typography

### Typefaces

| Face | Use for |
|------|---------|
| **IBM Plex Sans** | Everything — headlines, body copy, UI labels, captions. Covers Latin, Arabic, and Devanagari in one family. |
| **IBM Plex Mono** | Numbers, currency figures, codes, data tables. Any time precision and alignment matter. |

**Never use Inter, Noto Sans, or any serif font.** IBM Plex is the exclusive type family. It was chosen specifically because one family covers Latin + Arabic + Devanagari — switching to any other font breaks this.

### Weights in Use

| Weight | Name | When |
|--------|------|------|
| 400 | Regular | Body copy, captions, supporting text |
| 500 | Medium | Card titles, labels, UI elements |
| 600 | SemiBold | Headlines, hero text, the wordmark, bold emphasis |

No Light (300) and no Bold/ExtraBold (700+). Heaviness = weight contrast, not extra-bold.

### Type Scale Reference

| Level | Size (web) | Print | Weight | Use |
|-------|-----------|-------|--------|-----|
| Display | ~49px | 44pt | 600 | Hero numbers, marketing splash |
| H1 | ~39px | 34pt | 600 | Page / slide titles |
| H2 | ~31px | 27pt | 600 | Section headings |
| H3 | ~25px | 22pt | 600 | Subsection headings |
| H4 | ~20px | 18pt | 500 | Card titles |
| Body | 16px | 11pt | 400 | Default copy |
| Small | ~13px | 9pt | 400 | Captions, helper text |
| Mono | ~14px | 10pt | 400–500 | Numbers, codes |

**Tracking:** Tighten display and H1 slightly (−2%); H2–H4 lightly (−1%); body copy at default tracking.

---

## Logo & Brand Assets

### Asset Locations

Assets will live at (move pending — currently at root of `agent-os/brand/`):

| Asset | Path (after move) |
|-------|------------------|
| Logo (PNG) | `agent-os/brand/assets/Logo.png` |
| Banner (PNG) | `agent-os/brand/assets/Banner.png` |

> **Note:** Currently located at `agent-os/brand/Zerupt Logo.png` and `agent-os/brand/Zerupt Banner.png`. They will be reorganized into an `assets/` subfolder — update references when that move happens.

### Logo Elements

The Zerupt logo has two parts:
1. **Symbol ("the spark")** — two upward rounded triangles with a citron dot below. Represents rising / eruption / growth.
2. **Wordmark** — `zerupt.` in lowercase IBM Plex Sans SemiBold. The trailing dot is citron.

### Logo Color Variations

| Context | Symbol | Wordmark | Use when |
|---------|--------|----------|---------|
| On dark / ink background | Citron `#C2C84A` + Olive-mid | Cream `#F2F0EC` | Dark slides, dark social cards |
| On light / cream background | Citron `#979C1A` + Olive-deep | Ink `#141310` | Light layouts, print, email |
| Monochrome (1-color print) | All ink | All ink | Fax, emboss, single-color print |
| Monochrome reversed | All cream | All cream | 1-color dark backgrounds |

### Logo Rules

**Do:**
- Keep clear space around the logo equal to the height of the "z" on all sides.
- Use the cream/ink mono version on photography — add a light scrim if contrast would drop below AA.
- Minimum digital size: 20px tall for wordmark; 16px for symbol alone (drop the dot below 32px).

**Never:**
- Recolor the wordmark to citron on a light background (fails WCAG).
- Stretch, rotate, tilt, or condense the logo.
- Add drop shadow, glow, or bevel.
- Change the letter spacing of the wordmark.
- Place the logo on citron or busy imagery without a scrim.
- Use the old violet palette from any previous version.
- Recreate the wordmark in any other typeface.

---

## Visual Do / Don't

| ✅ Do | ❌ Don't |
|-------|---------|
| Dark-first: default to dark / ink backgrounds for premium feel | Light-only layouts that feel generic |
| One citron accent per view — keep it rare and meaningful | Citron everywhere; using it as a fill color for large areas |
| Ink CTAs (dark button, cream text) | Citron CTAs with white text (inaccessible) |
| Generous white space — air is design | Cluttered layouts, heavy drop-shadows, noise textures |
| Real retail owner photography: warm light, authentic, local context | Generic stock-tech imagery, 3D gradients, cold corporate aesthetics |
| IBM Plex everywhere, mono for numbers | Mixing in Inter, Noto Sans, or a serif |
| Sentence case for headlines and UI | Title Case for every word, or ALL-CAPS for emphasis |
| Olive-deep for citron-toned text links | Citron-colored text on light backgrounds |
| Charts in the citron → olive → sage → ink ramp | Random colors, brand-violet, or teal in data viz |
| Calm, smooth motion (if animated) | Springy, bouncy, overshoot animations; flashing citron |
| Warm subtle color grade on photography | Heavy filters, desaturated or cold tones |

---

## Palette the Brand Replaced (Do Not Use)

Old Zerupt used violet and teal. Those colors are **retired**. If you see violet (`#6C47FF` or similar) or teal anywhere in brand materials, replace it with the current system. Never mix the old palette with the current one.

---

## Tone in Visuals

Every visual choice should reinforce the same feeling as the copy: **the wise force that quietly makes you win.** Calm, precise, premium — not flashy, not loud. Citron earns attention by being rare; ink grounds everything with authority; cream gives the eye room to rest.

When in doubt: more air, less color, one accent.

---

## Quick Cheat-Sheet

```
Background:   Cream #F9F7F5  (light)  /  Ink #0E0D0A (dark)
Primary text: Ink #141310    (light)  /  Cream #F2F0EC (dark)
CTA button:   Ink background + Cream text  (always — never citron)
Accent fill:  Citron #979C1A (light)  /  #C2C84A (dark)  — 10% of view max
Accent text:  Olive-deep #454729      — NOT citron on light
Data viz:     Citron → Olive-mid → Sage → Ink
Font:         IBM Plex Sans (all copy) + IBM Plex Mono (all numbers)
```

---

*Sources: `agent-os/brand/brand-foundation.md` (brand meaning & governance) · `erp/DESIGN.md` (token values & WCAG ratios). When values conflict, the Brand Book wins.*
