# Zerupt Design System: Marketing Reference (v3, Olive Grove)

**Who this is for:** content creators, ad designers, social media agents, deck builders: anyone making Zerupt-branded materials who isn't writing code.

**Source of truth chain:** Paper page "Zerupt Design System" (boards 00-11) -> `erp/DESIGN.md` (engineering spec, all exact values) -> product CSS. This file is the short cheat sheet. For anything not covered here, open `erp/DESIGN.md`. If this file disagrees with it, `erp/DESIGN.md` wins.

---

## Brand Feeling in One Sentence

"Olive Grove": a sunlit olive grove and desert sand. Earthy, grounded, Gulf-native, calm and light-first. Colour appears at the moments that matter on warm cream and white. Premium and quiet: the data is the hero, the chrome recedes.

---

## Color Palette

| Name | Hex | Role |
|------|-----|------|
| **Canvas** | `#F7F6EF` | Page, slide and ad-frame background. The default surface. |
| **Surface** | `#FFFFFF` | Cards, inputs, tables. |
| **Sunken** | `#EEEDE3` | Sidebar, table headers, wells. |
| **Moss ink** | `#283618` | All primary text and primary buttons. |
| **Muted text** | `#6B6A55` | Secondary text. |
| **Brand olive** | `#606C38` | Brand marks, links, "+ Add" actions. |
| **Lime** | `#ECF39E` | Selection and highlight. Always with moss text on it. |
| **Caramel** | `#DDA15E` | The one money moment. Fill only, with moss text. |
| **Cornsilk** (marketing) | `#FEFAE0` | Section backgrounds on the website and decks. |
| **Forest night** | `#0F1A0E` | Dark sections and dark mode background. |

Supporting tones: copper `#BC6C25` (highlights, fills only) and bark browns `#582F0E`, `#7F4F24`, `#936639`, `#A68A64`, `#766153` (illustration and photography grading only). Full scales, dark-mode values, status colours (vivid success, warning, danger, info) and the category palette for charts are in `erp/DESIGN.md` section 2.

**Light first.** Design for light backgrounds by default. Dark is a fully supported option: forest night `#0F1A0E` (never pure black) with off-white `#EFF1ED` text; fern `#90A955` and lime `#ECF39E` are allowed to carry text on dark.

### When to Use Each Color

- **Moss ink:** body text, headlines and primary buttons (moss button, cream text).
- **Brand olive:** the logo, links and labels on light backgrounds.
- **Lime:** whatever is selected or highlighted (a chosen row, chip or option, an AI suggestion card).
- **Caramel fill:** the one money moment per screen or slide (a Charge button, a key figure). Moss text on it.
- **Status colours:** vivid, always colour + icon + word, never colour alone.

### Never

- Caramel or copper as text on a light background (fails accessibility).
- White text on a caramel fill (fails accessibility). Use moss text.
- More than one caramel button per screen.
- Violet, teal, navy, or any colour outside the palette. No raw palette colours from other tools.

---

## Typography

**Noto Sans family**, one family per script: Noto Sans (English, Malay), Noto Sans Arabic, Noto Sans Devanagari (Hindi), Noto Sans Gurmukhi (Punjabi), Noto Sans Thai, and Noto Sans Mono for codes and small eyebrow labels. All free and on Google Fonts.

| Rule | Value |
|------|-------|
| Weights | 400, 500, 600 only. Display headlines use 500. |
| Smallest text | 12px. Nothing below. |
| Website display | 80px desktop / 44px mobile, tight tracking, line-height 1.0 |
| Website headings | h1 56 / 36, h2 40 / 28 |
| Lead paragraph | 20px / 18px mobile |
| Eyebrow | Noto Sans Mono 13px, sentence case |
| Arabic | 6% larger, line-height 1.6, no letter-spacing, no italics, no uppercase styling |
| Line height | Latin 1.4, Arabic / Devanagari / Gurmukhi 1.6, Thai 1.7 |
| Numbers and money | Noto Sans with tabular figures, right-aligned, full precision, currency code shown |
| Dates | `06 Nov 2026`, never `06/11/26` |

Headlines use sentence case. No serif and no Inter or Roboto.

---

## Shape, Glass and Motion (at a glance)

- **Shape:** soft and generous. Rounded corners that grow with the size of the thing (small chips, larger cards, largest dialogs). Inner corners are always smaller than outer ones so shapes nest cleanly.
- **Glass:** a frosted-paper effect only on floating chrome (top bar on scroll, floating action bars, menus, popovers, toasts, command palette, sheets). Never on tables, forms, paragraphs, the sidebar, dialogs, the POS checkout bar or print.
- **Motion:** calm and quick (100 to 400ms), no bounce, no overshoot, nothing flashing. Motion explains a change, then gets out of the way.
- **Signature moments:** a soft caramel glow on the one money button, a success check that draws itself, a slow lime shimmer reserved for Zee suggestions.

---

## Logo & Brand Assets

The logo geometry is unchanged in v3 and the logo keeps its original citron colours (v3.1). Citron is a logo-only exception, never used in the interface. Logo hexes are tokens (`logo-citron-500` `#979C1A`, `logo-citron-700` `#5C6012`, `logo-olive` `#747818`, `logo-citron-300` `#C5CB55`, `logo-ink` `#141310`, `logo-paper` `#F7F6F2`) used only by the logo component.

### Asset Locations

Assets will live at (move pending, currently at root of `agent-os/brand/`):

| Asset | Path (after move) |
|-------|------------------|
| Logo (PNG) | `agent-os/brand/assets/Logo.png` |
| Banner (PNG) | `agent-os/brand/assets/Banner.png` |

> **Note:** Currently located at `agent-os/brand/Zerupt Logo.png` and `agent-os/brand/Zerupt Banner.png`. They will be reorganized into an `assets/` subfolder; update references when that move happens.

### Logo Elements

1. **Symbol ("the spark"):** two upward rounded triangles with a dot below. Represents rising, eruption, growth.
2. **Wordmark:** `zerupt.` in lowercase Noto Sans SemiBold. The trailing full stop is citron (`#5C6012` on light, `#C5CB55` on dark).

### Logo Variations

| Context | Treatment |
|---------|-----------|
| Light background | Large triangle and dot citron `#979C1A`, small triangle `#5C6012`; ink `#141310` wordmark |
| Dark background | Large triangle `#979C1A`, small triangle `#747818`, dot `#C5CB55`; off-white wordmark |
| Monochrome | All ink `#141310` (print, stamps, single-colour; shown on a citron `#979C1A` panel) |
| Monochrome reversed | All `#F7F6F2` on dark |
| App icon | Dark-variant mark on an ink `#141310` squircle |

Below 24px tall, use the mark only. The Arabic wordmark is drawn, not typed.

### Logo Rules

**Do:**
- Keep clear space around the logo equal to the height of the "z" on all sides.
- Use the mono version on photography, with a light scrim if contrast would drop below AA.
- Minimum digital size: 20px tall for the wordmark; 16px for the symbol alone (drop the dot below 32px).

**Never:**
- Recolor the wordmark to caramel on a light background.
- Stretch, rotate, tilt, or condense the logo.
- Add drop shadow, glow, or bevel.
- Change the letter spacing of the wordmark.
- Place the logo on caramel or busy imagery without a scrim.
- Recreate the wordmark in any other typeface.

---

## Visual Do / Don't

| Do | Don't |
|-------|---------|
| Light first: warm canvas, white surfaces, moss text | Treating dark as the default look |
| Lime for selection, one caramel moment per view, kept rare and meaningful | Caramel everywhere, or large caramel areas |
| Moss buttons (moss fill, cream text) | Caramel buttons with white text |
| Glass only on floating chrome | Glass on tables, forms, sidebar, dialogs or print |
| Generous white space: air is design | Cluttered layouts, heavy drop shadows, noise or gradient textures |
| Real retail owner photography: warm light, authentic, local context | Generic stock-tech imagery, 3D gradients, cold corporate looks |
| Noto Sans family everywhere | Inter, Roboto or any serif |
| Sentence case for headlines and UI | Title Case on every word, or ALL-CAPS for emphasis |
| Status as colour + icon + word | Status by colour alone |
| Calm, smooth motion (if animated) | Springy, bouncy or overshoot animation; flashing shimmer |

### Banned list

violet, teal, navy, Inter, Roboto, any serif, raw hex values copied from other tools, white text on caramel, caramel or copper text on light.

---

## Tone in Visuals

Every visual choice should reinforce the same feeling as the copy: **the wise force that quietly makes you win.** Calm, precise, premium: not flashy, not loud. Caramel earns attention by being rare; moss ink grounds everything with authority; the canvas gives the eye room to rest.

When in doubt: more air, less color, one accent.

---

## Quick Cheat-Sheet

```
Background:   Canvas #F7F6EF (light)  /  #0F1A0E forest night (dark)
Surface:      White #FFFFFF  (light)  /  #172416 (dark)
Text:         Moss ink #283618 (light)  /  #EFF1ED (dark)
Button:       Moss fill + cream text (always; caramel only for the one money moment)
Brand:        Olive #606C38 (light)  /  fern #90A955 (dark)
Selection:    Lime #ECF39E, moss text
Money moment: Caramel #DDA15E fill, moss text: one per view
Font:         Noto Sans family per script + Noto Sans Mono (codes, eyebrows)
Glass:        floating chrome only
```

---

*Sources: Paper page "Zerupt Design System" (boards 00-11) and `erp/DESIGN.md` (all exact values and contrast ratios). Brand meaning, voice and strategy: `agent-os/brand/brand-foundation.md`.*
