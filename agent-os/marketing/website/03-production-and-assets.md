---
title: "Zerupt Website Part 3: Production & Asset Manifest"
status: active
created: 2026-06-08
owner: Hussain
tldr: The complete build manifest for zerupt.com. Every React component, agent sigil spec, photography mapping, motion choreography, data mockup, iconography placement, and production checklist a developer + designer needs to ship the site from Part 1 (experience) and Part 2 (copy).
---

# Part 3: Production & Asset Manifest

> Read `website-01-experience-and-journey.md` (the experience blueprint) and `website-02-copy.md` (the copy) before executing. This doc is execution-only, it does not repeat strategy or copy.

---

## 1. Component Build List

### Notation
- **[NEW]** = build from scratch for this site
- **[REUSE]** = adapts an existing `@zerupt/ui` or `apps/web` component
- **[PRIMITIVE]** = reusable across many sections; build as a named export in `apps/website/src/components/`
- Server = React Server Component (default); Client = `"use client"` required

---

### 1.1 Global / Layout Primitives

| Component | Purpose | Client/Server | Key States | Type |
|---|---|---|---|---|
| `StickyHeader` | Logo + nav links + CTA + LangSwitch; transparent over dark hero, solid cream on scroll | Client | transparent, solid-cream, scrolled | [NEW][PRIMITIVE] |
| `LangSwitch` | en/ar toggle; sets locale via next-intl router, persists to cookie | Client | en-active, ar-active, loading | [NEW][PRIMITIVE] |
| `WhatsAppFloat` | Fixed WhatsApp CTA button, GCC only (geo-aware); always reachable | Client | visible, hidden-on-form-focus | [NEW][PRIMITIVE] |
| `SectionBand` | Full-width section wrapper; accepts `variant`: cream, dark (ink bg), warm-dim | Server | cream, dark, warm-dim | [NEW][PRIMITIVE] |
| `RevealOnScroll` | Wraps any child; fade+translate-up on enter viewport; no-op on reduced-motion | Client | hidden, visible, reduced-motion | [NEW][PRIMITIVE] |
| `Footer` | Links, brand note, WhatsApp, `/start` link, legal links, lang switch | Server | default | [NEW] |

---

### 1.2 Homepage (`/en`, `/ar`)

| Component | Section | Purpose | Client/Server | Key States |
|---|---|---|---|---|
| `HeroSection` | S1 | Full-bleed dark band; headline, sub, CTA, citron spark waking; shot-01 background | Client | loading, awake (spark animates in), reduced-motion |
| `AgentSigilWake` | S1 | Zee's sigil "coming online" intro animation inside the hero | Client | dormant, waking, awake | [NEW][PRIMITIVE] |
| `TrapSection` | S2 | 3-panel asymmetric pain layout; dark/dim canvas; editorial, no CTA | Server | default |
| `TurnSection` | S3 | 3-step setup + Mira named; cream lift begins here | Server | default |
| `TeamPreviewSection` | S4 | Zee intro + roster cards (condensed); links to `/team`; "hiring" teaser | Client | default, expanded-card |
| `AgentCard` | S4 | One card per agent: sigil, name, title, one-line win; used on home + /team | Client | default, hover/focus, "hiring-soon" state | [NEW][PRIMITIVE] |
| `NextMoveSection` | S5 | **THE dark citron band**; NextMoveCard; this section already exists, rebuild with brand tokens | Client | card-loading, card-revealed, reduced-motion |
| `NextMoveCard` | S5 | The signature recommendation card: citron border/spark, mono numbers, action button | Client | loading (pulse), revealed, acted | [NEW][PRIMITIVE] |
| `OfferSection` | S6 | Grand Slam Offer stack + SeatCounter | Client | seats-available, seats-low, seats-full |
| `OfferStack` | S6 | Stacked offer bullets (setup free, 30-day refund, no card, founding pricing) | Server | default | [NEW][PRIMITIVE] |
| `SeatCounter` | S6 | Live "X of 50 founding spots left"; citron; animates on load | Client | counting, low (≤10), full | [NEW][PRIMITIVE] |
| `ProductPreviewSection` | S7 | 3 mockup frames side by side (POS, your numbers, Sami invoice); agent shown acting | Client | default, frame-focused |
| `MockupFrame` | S7 | Device/browser shell containing a screenshot or live component; cream/ink border | Server | default, mobile-crop | [NEW][PRIMITIVE] |
| `ComparisonSection` | S8 | Comparison ledger table (Zerupt vs legacy/POS/sheets) | Server | default, SSR for LLM citation |
| `ComparisonLedger` | S8 | Table: rows = criteria, cols = competitors; citron checkmarks for Zerupt | Server | default | [NEW][PRIMITIVE] |
| `PricingTeaserSection` | S9 | 3 tiers summarized in local currency; links to /pricing | Server | default |
| `FounderNoteSection` | S10 | Hussain photo + short letter; asymmetric layout | Server | default |
| `FounderNote` | S10 | Photo + pull-quote + name/signature; reused on /start | Server | default | [NEW][PRIMITIVE] |
| `FaqSection` | S11 | Accordion FAQs; FAQPage schema injected via RSC | Client (accordion) | item-open, item-closed |
| `FinalCtaSection` | S12 | Morning-glance image, promise restated, guarantee, single CTA | Client | geo-gcc, geo-non-gcc |
| `GeoAwareCta` | S12 + S1 | Reads country from header/cookie; GCC = "Book setup", non-GCC = "Join waitlist" | Client | gcc, non-gcc, loading | [NEW][PRIMITIVE] |

---

### 1.3 `/team` Page

| Component | Purpose | Client/Server | Key States |
|---|---|---|---|
| `ZeeIntroSection` | Full Zee reveal: her sigil large, her voice, what she does | Client | default |
| `AgentRosterSection` | All 7 agent rich cards in a grid | Client | default |
| `AgentCardFull` | Expanded card: sigil, name, role, "human job they kill", first-day win quote, trust line | Client | default, hover | [NEW] |
| `RosterHiringList` | The "hiring mechanic" progress list: Mira+Sami=live, others show days-until-unlock with progress bar | Client | live, countdown, locked | [NEW][PRIMITIVE] |
| `TrustFrameSection` | Side-by-side: human employee vs Zerupt team on 5 axes | Server | default |
| `TeamCtaSection` | "Hire your team" or "Book a setup" CTA | Client | gcc, non-gcc |

---

### 1.4 `/pricing` Page

| Component | Purpose | Client/Server | Key States |
|---|---|---|---|
| `PricingHeroSection` | Headline, the whole shop in every tier, annual/monthly toggle | Client | monthly, annual |
| `PricingTierCard` | One plan card: name, price in local currency, feature list, CTA that opens the industry gate | Client | default, annual, featured (Growth), hover | [NEW][PRIMITIVE] |
| `IndustryGate` | The modal/sheet "What kind of shop do you run?", industry tile select + routing logic | Client | idle, selecting, wac-gcc→signup, fifo→waitlist, non-gcc→waitlist | [NEW] |
| `IndustryTile` | One tappable tile per industry type: icon, label; big touch target | Client | default, selected, hover | [NEW][PRIMITIVE] |
| `GuaranteeBlock` | The two-part guarantee (setup free + 30-day refund); used on pricing + home | Server | default | [NEW][PRIMITIVE] |

---

### 1.5 `/start` Page (Founder Letter)

| Component | Purpose | Client/Server |
|---|---|---|
| `StartHeroSection` | Shot-10 background, Hussain headline, UTM capture (hidden) | Client |
| `FounderLetterBody` | Long-form editorial letter, minimal chrome | Server |
| `FounderNote` | Reused primitive | Server |
| `StartCtaSection` | Both CTAs (book setup + waitlist) | Client |

---

### 1.6 `/waitlist` Page

| Component | Purpose | Client/Server | Key States |
|---|---|---|---|
| `WaitlistHeroSection` | Warm "you are in the front of the line" message | Server |, |
| `WaitlistForm` | Email + industry + country + current tool; honeypot field; Resend capture | Client | idle, loading, success, error | [NEW][PRIMITIVE] |
| `WaitlistSuccessState` | Confirmation message with next-step expectations, Zee voice | Server |, |

---

### 1.7 `/thanks` Page

| Component | Purpose | Client/Server | Variants |
|---|---|---|---|
| `ThanksSection` | Calm certainty state; two variants | Server | booked-setup, joined-waitlist |
| `ShareNudge` | Optional share/copy link nudge | Client | default |

---

### 1.8 Legal + 404

| Component | Purpose |
|---|---|
| `LegalShell` | Branded wrapper for privacy/terms; clean serif-free, trustworthy |
| `NotFoundSection` | "This page wandered off." Warm, route home |

---

## 2. The AI Team Visual System

### Design Rules (non-negotiable)
- Every sigil is **built in SVG/code**, not raster. No human faces, no uncanny AI avatars, no generic robot icons.
- Each agent = a **unique geometric form** using citron (`#979C1A` light / `#C2C84A` dark) and olive tones. The spark device (rising triangles from the logo) is the shared DNA; each agent's sigil is a *variation* or *fragment* of the brand spark language, not a copy of the logo.
- **Calm "thinking/acting" pulse:** a gentle `opacity` oscillation (0.7→1.0) on the citron fill, 2000ms cycle, `ease-in-out`. No scale bounce. `prefers-reduced-motion`: remove animation, hold `opacity: 1`.
- **Hiring/locked state:** fill drains to `olive-deep #454729` with a 60% opacity overlay and a horizontal progress bar in citron fills up left-to-right as the countdown reaches zero.
- Sigils render at three sizes: 48px (roster list), 80px (agent card), 120px (hero reveal on /team Zee section).

---

### Agent Sigil Specs

#### Zee, The Lead (the brand's face)
- **Geometry:** The full Zerupt spark mark, rendered slightly larger than the wordmark dot. Both triangles and the dot present. This is the only agent who "owns" the full logo geometry.
- **Color:** Large triangle = citron-light `#C2C84A` on dark / citron `#979C1A` on cream. Small triangle = olive-mid `#747818`. Dot = citron.
- **Pulse:** All three elements breathe together at 2000ms.
- **Distinction:** She is the only agent whose sigil matches the brand mark, hierarchy is visual.
- **SVG structure:** `<g class="zee-sigil">` with the three paths from §11.1 of brand-foundation.

#### Mira, Migration Specialist
- **Geometry:** Two horizontal arrow-lines pointing right (→→), slightly staggered vertically, with a short vertical line on the left side that "feeds" them, suggesting data flowing in and being directed.
- **Color:** Lines in citron; the feed-stroke in olive-mid.
- **Pulse:** The two arrows shimmer alternately (stagger 200ms).
- **Rationale:** Migration = movement across, structured input into structured output.

#### Sami, Invoice Scanner
- **Geometry:** A small rectangle (the invoice) at a slight ~10° tilt with a scan-line arc passing across it, one crisp horizontal stroke mid-rectangle, with a small citron dot at the end of the arc (the "captured" moment).
- **Color:** Rectangle outline = olive-mid. Scan line and dot = citron.
- **Pulse:** The scan-line dot pulses (opacity) while the line itself is static.
- **Rationale:** Camera + document = Sami's literal job.

#### Noor, Dead Stock Finder
- **Geometry:** A single downward-pointing equilateral triangle (like a gem/crystal, or an hourglass top-half), sand trickling down, stock going stale. A small citron upward spark erupts from the top center, breaking the downward form.
- **Color:** Triangle stroke = olive-deep. Upward spark = citron fill.
- **Pulse:** The upward spark pulses, the "found it" moment.
- **Rationale:** She identifies value trapped going down; the spark is the rescue.

#### Arjun, Stockout Predictor
- **Geometry:** An ascending step-graph: three horizontal bars of decreasing length stacked top-to-bottom (reading: stock depleting), with a citron vertical tick mark just past where the last bar ends, the warning moment.
- **Color:** Bars = olive-mid (filled left-to-right). Tick = citron.
- **Pulse:** The citron tick pulses on the "warning" threshold.
- **Rationale:** Inventory chart going down; the mark is the alert point.

#### Tariq, Shrinkage Guard
- **Geometry:** A shield-like hexagon (minimal, flat edges, no frills) with a single vertical citron line through the center, the watching eye abstracted to a line.
- **Color:** Hexagon stroke = ink (or cream on dark). Center line = citron.
- **Pulse:** The center line pulses slowly (3000ms, slower than others, watchful, not urgent).
- **Rationale:** Guard/protection = shield; the eye abstracted.

#### Maya, Margin Watchdog
- **Geometry:** Two lines diverging from a point (like a margin being squeezed, or a V shape): one line inclines up slightly (price), one declines slightly (cost drift). A citron bracket `]` closes them together, Maya catching the spread.
- **Color:** Lines = olive-mid. Bracket = citron.
- **Pulse:** The bracket "closes" with a 0.3px stroke-width oscillation (subtle tightening).
- **Rationale:** Margin = the gap between two lines. She holds it.

---

### `AgentSigil` Component Spec

```tsx
// apps/website/src/components/AgentSigil.tsx
// Props: agent: 'zee'|'mira'|'sami'|'noor'|'arjun'|'tariq'|'maya'
//        size: 48 | 80 | 120
//        state: 'active' | 'thinking' | 'locked' | 'hiring'
//        theme: 'dark' | 'cream'
// - 'thinking' triggers the pulse animation
// - 'locked' drains fill to olive-deep + adds progress bar slot
// - All paths are inline SVG; no raster fallbacks needed
// - Exports each agent as a named sub-component too: <ZeeSigil />, <MiraSigil />, etc.
```

---

## 3. Imagery Manifest

### Format + Delivery Spec
- **Primary format:** AVIF (80% quality) with WebP fallback; no JPEG on hero images.
- **Responsive srcset sizes:** 400w, 800w, 1200w, 1920w. Hero images: all four. Card images: 400w + 800w only.
- **`loading`:** `eager` on above-fold images (hero, header); `lazy` on all others.
- **`fetchpriority="high"`** on the single hero image per page (LCP candidate).
- **Art-direction:** use `<picture>` + `<source media="(max-width: 768px)">` for hero images where the crop changes on mobile (portrait crop on mobile, landscape on desktop).
- **Alt text intent:** described below per shot; always descriptive, never "photo of" prefix.

---

### Shot Mapping by Page + Section

| Shot | Page | Section | Usage | Alt text intent | Crop / Size | Status |
|---|---|---|---|---|---|---|
| **shot-01** | `/` | S1 Hero | Full-bleed background at 30–50% opacity under headline overlay | "A shopkeeper reaches for goods behind a baqala counter in warm afternoon light" | 16:9 desktop / portrait 3:4 mobile crop from left half | Must produce |
| **shot-02** | `/team` | Owner counterpoint to AI roster; also `/start` trust section | Portrait in trust frame sidebar | "A shop owner in the doorway of his grocery, looking away, lost in thought" | 4:5 | Must produce |
| **shot-03** | `/` | S7 product preview, Sami card; `/team` Sami AgentCard | 1:1 in card, 16:9 as section accent | "Hands holding a supplier invoice over a counter, phone beside it" | 1:1 card / 16:9 section | Must produce |
| **shot-04** | `/` | S7 Noor + Arjun feature background | Background at 20–30% opacity | "Shelves of regional grocery products in a small shop" | 3:2 | Must produce |
| **shot-05** | `/` | S1 Hero variant (mobile-native fallback) | "A shopkeeper glances at his phone in the shop" | 4:5 | Must produce |
| **shot-06** | `/` | S7 Tariq agent section | "A delivery arrives at the shop doorway, owner and driver exchanging boxes" | 16:9 | Must produce |
| **shot-07** | `/` | S2 trap section (before pain) | **Cool palette, no warm grade**, the BEFORE image | "A handwritten accounts ledger with crossed-out figures and ink blots" | 4:5 | Must produce |
| **shot-08a** | `/pricing` | Section texture divider | Background at 10–15% opacity | Decorative, `alt=""` | 1:1 | Must produce |
| **shot-08b** | Country pages | Background texture | Background at 15–25% opacity | Decorative, `alt=""` | 3:2 | Must produce |
| **shot-08c** | `/pricing` | Pricing section accent | Background at 15% opacity | Decorative, `alt=""` | 1:1 | Must produce |
| **shot-09** | Country pages (`/en/[country]`) | Hero per country | "The exterior of a small grocery shop glowing warm at dusk" | 16:9 | Must produce |
| **shot-10** | `/start` | Hero background + `/switch` emotional hook | Full-bleed, dark overlay | "A shop owner sits alone at closing time, one light illuminating his face" | 4:5 | Must produce |
| **shot-11** | `/` | S1 hero variant (diversity) + country pages | "A woman counts stock on a grocery shelf, focused, mid-task" | 4:5 | Must produce |
| **shot-12** | `/en/saudi-arabia`, `/en/kuwait` | Cultural accent image | "Amber prayer beads draped on a worn shop counter" | 4:5 | Must produce (market-specific) |
| **shot-13** | `/pricing` | Background texture | Background at 10% opacity | Decorative, `alt=""` | 1:1 | Must produce |
| **shot-14** | `/` | S7 social proof | "Three shopkeepers in conversation outside their shops on a market street" | 3:2 | Must produce |
| **shot-15** | `/en/india` (post-launch) | Country hero | "A kirana shop owner serves a customer behind a densely stocked counter in India" | 3:2 | Defer to /india launch |
| **shot-16** | `/` | Dark section backgrounds (S5 NextMove, S6 Offer) | Background at 60–80% opacity | Decorative, `alt=""` | 16:9 | Must produce |

---

### Additional Images (beyond the shotlist)

| Image | Page | Purpose | Spec | Status |
|---|---|---|---|---|
| **Founder portrait (Hussain)** | `/` S10, `/start`, `/team` trust section | Hussain's face in editorial treatment; warm, candid, not a headshot | Shot against a neutral warm wall or shop context; 4:5; same warm Portra grade | Must produce, founder to supply or shoot |
| **Morning-glance hero** | `/` S12 Final CTA | The "Act 3 resolution" image: a phone showing a calm business overview, hand, coffee, morning light, suggesting total control. Very aspirational. | 16:9; warm morning light; phone screen intentionally blurred or showing only abstract color/warmth; no app UI visible | Must produce |
| **OG / Social card image** | All pages | `og:image` for social sharing; 1200×630 | Wordmark on warm cream or ink; no photo overlay needed. Generate in code (Satori/next-og) using brand tokens | Build in code (Satori) |
| **Favicon / App icon** | All | `favicon.svg` + `apple-touch-icon.png` | Already exists: `zerupt-symbol.svg` adapted. Ensure 16/32/180/192/512px set | Derive from existing SVG |
| **Hero with AR caption** | `/ar` | Shot-01 cropped with right-side open for RTL overlay | Mirror crop of shot-01: open area on the right (text-start in RTL) | Art-direction note on the `<picture>` element |

---

## 4. Motion & Interaction Manifest

### Brand Motion Tokens (reference)
- Easing standard: `cubic-bezier(0.2, 0, 0, 1)`, decelerate-in (enters)
- Easing exit: `cubic-bezier(0.4, 0, 1, 1)`, accelerate-out
- Durations: micro 120ms · standard 200ms · large 320ms · ambient ≤600ms
- Max translate: 8px. No bounce/overshoot. No spring physics.
- Citron pulse: `opacity` 0.7→1.0, 2000ms `ease-in-out`, infinite (stops on `prefers-reduced-motion`).

---

### Per-Section Motion Choreography

#### S1, Hero
- **Enter:** Page loads dark (ink bg). After 200ms: headline fades in (opacity 0→1, translateY 8px→0, 320ms). After 400ms: subhead same. After 600ms: CTA button.
- **AgentSigilWake:** Zee's sigil begins at `opacity: 0`, scales from 0.9→1.0 + opacity 0→1 over 320ms at 800ms after load. Then enters the ambient citron pulse.
- **shot-01 background:** loads as `loading="eager"` with a cream-to-transparent gradient overlay; no fade-in needed (avoid LCP delay).
- **Reduced-motion:** all elements visible immediately, no translate, no pulse, sigil static at `opacity: 1`.

#### S2, Trap (dark/dim)
- **Temperature:** `SectionBand variant="warm-dim"`, `background: #1A1813` (dark card token).
- **RevealOnScroll:** Each of the 3 pain panels reveals with 120ms stagger (translateY 8px→0, opacity 0→1, 200ms each).
- **shot-07** (ledger) appears at 30% opacity as a background accent, no animation.
- **Reduced-motion:** panels visible, no stagger.

#### S3, Turn (the cream lift)
- **Temperature:** `SectionBand variant="cream"`, the visual warmth arrives here. The contrast from the previous dark section is deliberate and should be jarring in a relieving way. No transition animation between sections; the snap is the emotion.
- **3-step flow:** RevealOnScroll each step card, 150ms stagger.

#### S4, Meet the Team
- **AgentCard reveal:** cards stagger in left-to-right, 100ms apart, translateY 8px→0, 200ms.
- **Hover/tap state:** card elevates via `box-shadow` deepening (100ms), citron ring appears on focus/hover, sigil enters "thinking" pulse on hover.
- **"Hiring" cards (Noor, Arjun, Tariq, Maya):** fill is olive-deep, progress bar fills on hover (200ms). Label reads "X days to hire."
- **Reduced-motion:** no stagger, no hover translate.

#### S5, NextMove (the dark citron band)
- **Section:** `SectionBand variant="dark"` with shot-16 at 70% opacity.
- **NextMoveCard reveal:** single card; enter with `opacity 0→1, translateY 8px→0, 320ms` triggered on scroll entry.
- **Citron pulse:** the card border (1.5px citron) pulses at ambient 2000ms, this is THE citron moment. Only one pulse on the entire page at a time.
- **The spark device:** a single `⬆` spark SVG appears above the card, 48px, citron, before the card reveals (100ms lead). It is the "Zerupt is advising" marker from §15 brand-foundation.
- **Reduced-motion:** card visible, no pulse, spark static.

#### S6, Offer + SeatCounter
- **SeatCounter:** on mount, counts down from displayed number to current value over 600ms (ambient, `ease-out`). If seats ≤10, counter label turns citron and the number pulses once (scale 1.0→1.05→1.0, 120ms, one-shot).
- **OfferStack:** each bullet reveals with RevealOnScroll, 80ms stagger.
- **Reduced-motion:** counter static, no count animation, no pulse.

#### S7, Product Preview (MockupFrames)
- **Three frames:** enter with RevealOnScroll, 150ms stagger. On scroll, the active (center) frame scales 1.0→1.02 (within the ≤8px translate rule via scale + slight translateY −4px). This gives the center mockup a subtle "coming forward" depth.
- **Agent acting signals:** small sigil icon beside each mockup frame pulses at ambient rate (thinking state), Sami by the invoice mockup, Mira by the migration frame.
- **Reduced-motion:** no scale, all frames fully visible.

#### S8, Comparison Ledger
- **Table rows:** RevealOnScroll stagger 60ms per row.
- **Citron checkmarks:** revealed with a single `scale 0→1` pop (120ms, decelerate-in) per row as it enters.
- **Reduced-motion:** all rows and checks visible.

#### S9, Pricing Teaser
- **PricingTierCard hover:** card lifts with `box-shadow` + citron ring (200ms). Featured (Growth) card has a persistent 1px citron border at rest.

#### S10, Founder Note
- **Photo:** RevealOnScroll, photo slides in from the inline-start edge (translateX −8px → 0, 320ms). Text fades in simultaneously.
- **RTL:** photo slides from inline-end (translateX 8px → 0). CSS logical property: `translateX(-8px)` in LTR, auto-mirrors with `direction: rtl` on parent.

#### S11, FAQ
- **Accordion open:** content height 0→auto (200ms, decelerate-in). Chevron icon rotates 0→180° (200ms).
- **Reduced-motion:** instant open/close, no chevron rotate.

#### S12, Final CTA
- **Morning-glance image:** full-bleed, no animation; it is the landing point after a long scroll, let it breathe.
- **CTA button:** on hover, ink bg slightly lightens to `#2A2822` (card token); 120ms.

---

### Dark-to-Cream Temperature Transitions
The page arc is: dark (S1) → dim (S2) → **cream snap** (S3 onward, with dark bands for S5 + pricing table). There is no CSS transition between `SectionBand` variants. The snap is intentional, it reads as relief. Do not animate background-color between sections.

---

### Industry Gate Interaction (`IndustryGate`)
1. Triggered when any pricing CTA is tapped.
2. Opens as a **bottom sheet on mobile**, a **centered modal on desktop** (not full-page, user should feel they are one step from completing).
3. Tiles animate in with 60ms stagger (fade+translateY 8px).
4. Selecting a tile: selected state = citron fill ring + checkmark overlay (120ms).
5. On confirm: a brief 200ms "routing" state (spinner in ink, not citron, we are neutral here), then redirect or waitlist form.
6. Back/close: dismiss with 200ms fade+translateY 4px downward (exit easing).
7. **Never lose selection:** if user presses back on the waitlist form, the gate remembers their selection.
8. **Reduced-motion:** no stagger, no tile animation, instant transitions.

---

## 5. Sound & Video (Optional, Post-Launch, Off by Default)

**Ground rules for all audio/video on this site:**
- Muted and paused by default. No autoplay audio. Period.
- User opt-in only (a play button, never an ambient trigger).
- Lazy-load after LCP: all media elements load only after the first meaningful paint is complete.
- If any video threatens the Lighthouse mobile ≥90 gate, cut it without debate.
- File budget: any single video ≤ 3MB for a teaser clip, ≤ 8MB for a full film.
- Formats: AV1 (primary, `.av1.mp4`) + H.265 fallback (`.hevc.mp4`). No H.264-only.

---

### Recommended (in priority order)

#### V1, "Meet Zee" Teaser Film (P2, post-launch)
- **What:** A 20–30 second Remotion film. Zee's sigil pulses to life on a dark ink canvas. Her voice (text-in, not TTS) introduces herself. A NextMove card slides in. Ends on the Zerupt wordmark.
- **Where:** `/team` page, Zee section. Autoplay video tag: `muted loop playsinline`, no audio track. User can unmute for optional ambient "paper" sound.
- **File budget:** ≤ 2MB, rendered as AV1.
- **Skip if:** Remotion render time threatens launch timeline.

#### V2, 2-Hour Switch Sequence (P2, post-launch, `/switch` page)
- **What:** A short Remotion film or CSS-animated walkthrough of the migration: Mira receives the old file, maps columns, the data flows into Zerupt. 45 seconds. Text-on-screen narration only (no voice).
- **Where:** `/switch` page, which does not exist at launch. Reserve the asset.
- **File budget:** ≤ 5MB.

#### V3, UI Sound on NextMove Reveal (P2, post-launch, optional)
- **What:** A single 0.3-second "paper fold" or "soft chime" sound that plays when the NextMove card reveals, if the user has opted into audio (a small `🔊` toggle in the section header).
- **Format:** `.opus` (WebM) + `.mp3` fallback. ≤ 20KB.
- **Implementation:** `AudioContext` API, lazy-loaded, gated behind `userGesture` and a `soundEnabled` cookie.
- **Skip if:** adds complexity before launch.

---

## 6. Data & Mockup Assets

All mockup data must be:
- **Realistic and true-to-life GCC figures** (SAR, AED, KWD currencies; Arabic product names mixed with English; plausible margins 20–35% for FMCG, 40–60% for apparel).
- **Anonymized**, no real business names, no real owner names.
- **Rendered in IBM Plex Mono** for all numbers.
- **In the product's actual UI components** where possible (reuse from `apps/web`); use `MockupFrame` to wrap them.

---

### Mockup 1: POS Basket (S7 product preview)
**Screen:** A checkout session mid-sale.
```
Customer: (walk-in)
---
3x  Indomie Goreng Spicy     SAR  6.00
1x  Laban Fresh 1L            SAR  4.50
2x  Vimto Can 250ml           SAR  9.00
---
Subtotal                      SAR 19.50
VAT 15%                       SAR  2.93
Total                         SAR 22.43
---
[Cash]  [Card]  [Tap]
```
- Show the basket on a dark device mockup (phone frame, not browser).
- Sami's sigil (small, 48px, "thinking" state) appears bottom-right of the frame, suggesting he is watching.

### Mockup 2: Your Numbers Dashboard (S7)
**Screen:** Yesterday's summary, three shops.
```
Yesterday · Mon 8 Jun 2026
---
Total revenue           SAR 12,840
Gross profit             SAR 4,290  (33.4%)
Top seller:     Nido 400g  ×82 units
Low stock:      Vimto 24pk , 4 left
---
Shops:  Olaya  |  Malaz  |  Sulaimaniyah
        SAR 6k  | SAR 4.2k | SAR 2.6k
```
- Render on a laptop/browser frame at desktop breakpoint.
- Numbers in IBM Plex Mono. Revenue in citron (`accent-text` olive-deep on light).
- The "Low stock" row has a citron warning spark beside it.

### Mockup 3: Sami Reading an Invoice (S7)
**Screen:** The invoice scan mapping review.
```
Invoice · Al Mansoori Trading · 07 Jun 2026
---
Sami mapped 8 of 8 items. Review and approve.

  Indomie Goreng 40g × 48pks    SAR 28.80 ✓
  Nido Full Cream 400g × 24     SAR 96.00 ✓
  Laban Fresh 1L × 36           SAR 54.00 ✓
  [5 more items]

[Approve all]
```
- Pair with shot-03 (hands on invoice) as a split-screen inside MockupFrame: photo left, UI right.
- Sami's sigil at "thinking→done" state transition.

### Mockup 4: Mira Migrating (S3 + /switch)
**Screen:** Migration progress state.
```
Mira is setting up your shop.
Reading: Tally export, 8,432 items found.
Mapping SKUs...  ████████████░░  83%

Estimated: 12 minutes remaining.
You can close this. Mira keeps working.
```
- Dark canvas, citron progress bar.
- Mira's sigil prominent, "thinking" pulse.

### Mockup 5: NextMove Card (S5, the signature moment)
```
Your next move  ↑

Reorder Basmati 5kg (Al Nafees).
At current rate, you run out Thursday.

Cost: SAR 340 for 20kg (last price)
Saves: SAR 280 in rush-order premium

[Send order to Al Nafees]  [See the numbers]
```
- Citron border, 1.5px.
- "Your next move" label in `accent-text` (olive-deep on light / citron on dark).
- Numbers in IBM Plex Mono.
- The spark device icon (`⬆` SVG) at top-right, 24px, citron.

---

## 7. Iconography & The Spark Device

### Lucide Icons per Use Case
Use Lucide icons at 24px grid, 1.5px stroke, in ink/muted tone. Citron only when signaling active/advising state.

| Feature / Industry Tile | Lucide Icon |
|---|---|
| Grocery / Baqala | `ShoppingBasket` |
| Auto Parts | `Wrench` |
| Apparel & Fashion | `Shirt` |
| Electronics & Mobile | `Smartphone` |
| Hardware & Building | `HardHat` |
| Stationery & Office | `BookOpen` |
| Cosmetics & Beauty | `Sparkles` |
| General Merchandise | `Package` |
| Pharmacy (waitlist) | `Pill` |
| Fresh Food / Bakery (waitlist) | `Croissant` |
| Restaurant & Cafe (waitlist) | `UtensilsCrossed` |
| Invoice scan | `ScanLine` |
| Dead stock | `PackageX` |
| Stockout alert | `PackageMinus` |
| Shrinkage / guard | `ShieldCheck` |
| Margin | `TrendingUp` |
| Migration | `ArrowRightLeft` |
| Setup / onboarding | `Zap` |
| Guarantee / shield | `BadgeCheck` |
| Seat counter | `Users` |
| Arabic / RTL | `Languages` |
| ZATCA / VAT | `ReceiptText` |
| WhatsApp | `MessageCircle` (or brand SVG) |
| Calendar / booking | `CalendarCheck` |

### The Spark Device (§15 brand-foundation)
- The spark is a single citron upward-tick or the rising-triangle fragment from the logo symbol. It is built as an inline SVG component: `<SparkIcon />`.
- Use sparingly: **one per view**, never as a repeating pattern.
- Appears in these specific locations:
  1. **S5 NextMove section**, above the NextMove card, 48px, citron. This is the primary brand moment.
  2. **SeatCounter**, tiny 16px spark beside the count when seats are low.
  3. **AgentCard**, on hover, a 16px spark appears at the top-right corner of the citron ring.
  4. **Loading states**, the spark rotates gently (180° over 600ms, `ease-in-out`) as a brand-native loading indicator, replacing a generic spinner.
  5. **Header**, the logo wordmark's citron dot is the atomic spark; it counts.

---

## 8. Accessibility + RTL Asset Notes

### Contrast Checklist
| Pair | Required | Must verify |
|---|---|---|
| Ink on cream (body) | AAA | Already 18.5:1 |
| `accent-text` (olive-deep) on cream | AAA | Already 9.0:1 |
| Citron fill with ink text (buttons) | AA | Already 6.7:1 |
| Cream text on ink sections | AAA | Already 17.4:1 |
| Citron-light on ink (dark agent sigils) | AAA | Already 11.0:1 |
| Muted text on cream (captions) | AA | Already 5.1:1 |
| **Never:** citron text on cream | ❌ | 2.77:1, blocked by token system |
| **Never:** white text on citron | ❌ | 2.96:1, blocked |

### Motion Safety
- `RevealOnScroll`: wrap all animations in `if (!prefersReducedMotion)` via `useReducedMotion()` hook (Framer Motion provides this).
- `AgentSigil` pulse: CSS `@media (prefers-reduced-motion: reduce)` stops the animation, holds opacity at 1.
- `SeatCounter` count animation: skips to final value immediately on reduced-motion.
- No parallax scrolling effects.
- No videos autoplay (already enforced by muted+paused default).

### RTL Asset Mirrors
The following assets need RTL art-direction or mirroring:

| Asset | RTL Action |
|---|---|
| `shot-01` hero | Different `<source>` crop: open space on the right (inline-end = right in RTL). |
| `HeroSection` layout | CSS `direction: rtl` + logical properties handle text/CTA. No image flip needed for photography (faces look natural). |
| `FounderNote` photo | Photo stays on inline-start; in RTL that is the right side. Use `float-inline-start`. |
| `ComparisonLedger` | Table columns read right-to-left; first column (criteria) is inline-start. RTL table direction auto-handles with `dir="rtl"` on the table. |
| `AgentCard` sigil | Sigil is geometric, symmetric, no mirror needed. |
| `NextMoveCard` spark | The upward-tick spark is symmetric, no mirror needed. |
| `Mira` sigil (arrows →→) | In RTL these should point ← ← (toward inline-start). The SVG needs a `transform: scaleX(-1)` in RTL context. |
| Typography | IBM Plex Sans Arabic loaded via `font-family` `:lang(ar)`. Line heights ≥1.5 enforced (brand-foundation §13). |
| All CTAs | Copy is translated; button widths must be fluid (Arabic copy is often longer). No fixed-width buttons. |
| `IndustryGate` tiles | Grid reflows naturally with `dir="rtl"`. |
| `WhatsAppFloat` | Fixed `bottom: 24px; inline-end: 24px`, CSS logical property positions it correctly in both LTR/RTL. |

### Keyboard + Screen Reader
- `IndustryGate` tiles: each is a `<button>` with `role="option"` and `aria-selected`. The gate has `role="dialog"` and focus trapping.
- `AgentSigil` SVG: `aria-label="[Agent name] sigil"` and `role="img"`.
- `SeatCounter`: `aria-live="polite"` on the count element so screen readers announce changes without interrupting.
- `FaqSection` accordion: `<button aria-expanded>` with `<div id aria-labelledby>` pattern.
- `NextMoveCard` action button: descriptive label, not just "tap", "Send reorder to Al Nafees".
- `ComparisonLedger`: `<thead>`, `<th scope="col">`, `<th scope="row">`, full table semantics for screen readers and LLM citation.
- All decorative images: `alt=""`.
- All photography: descriptive alt text as specified in §3.

---

## 9. Production Checklist + Build Priority

### P0, Launch-Critical (must ship June 15)

| # | Item | Owner | Blocker? |
|---|---|---|---|
| 1 | Generate all 16 photography shots (AI prompts in `photography-shotlist.md`) | Hussain | Yes, images needed before hero/sections can be finalized |
| 2 | Founder portrait photo | Hussain | Yes, needed for S10 + /start |
| 3 | Morning-glance hero image | Hussain | Yes, needed for S12 |
| 4 | `zerupt-symbol.svg` finalized (outlined paths, production-ready) | Hussain / designer | Yes, needed for `AgentSigil` and favicon |
| 5 | Favicon / app icon set (16, 32, 180, 192, 512px) | Derived from SVG | No (quick) |
| 6 | OG image (Satori/next-og) | Dev | No |
| 7 | `StickyHeader`, `LangSwitch`, `WhatsAppFloat`, `SectionBand`, `RevealOnScroll` | Dev | No |
| 8 | All homepage sections S1–S12 (components listed §1.2) | Dev | No |
| 9 | `AgentSigil` SVG for all 7 agents | Dev (SVG spec in §2) | No |
| 10 | `AgentCard` + `NextMoveCard` + `OfferStack` + `SeatCounter` | Dev | No |
| 11 | `IndustryGate` + routing logic (WAC/FIFO + GCC/non-GCC) | Dev | No |
| 12 | `/team` page | Dev | No |
| 13 | `/pricing` page + `PricingTierCard` | Dev | No |
| 14 | `/waitlist` page + `WaitlistForm` | Dev | Needs Resend API key |
| 15 | `/thanks` page (two variants) | Dev | No |
| 16 | `/start` page (noindex) | Dev | No |
| 17 | Legal pages shell (privacy, terms) + `/404` | Dev | Needs legal copy |
| 18 | Resend integration (waitlist form) | Dev | Needs Resend API key + account |
| 19 | Cal.com booking link (Founding 50 concierge) | Hussain | Yes, needs Cal.com account + link |
| 20 | AVIF/WebP image processing pipeline (sharp, next/image) | Dev | No |
| 21 | RTL layout + IBM Plex Arabic font loading | Dev | No |
| 22 | `FAQPage` JSON-LD schema | Dev | No |
| 23 | `prefers-reduced-motion` fallbacks on all animations | Dev | No |
| 24 | Lighthouse mobile ≥90 audit + fix | Dev | No (must pass before launch) |
| 25 | `GeoAwareCta` (GCC detect from header / CF-IPCountry) | Dev | No |

---

### P1, Polish (ship within 2 weeks of launch)

| # | Item |
|---|---|
| 26 | `AgentSigil` hiring progress bars (animated countdown) |
| 27 | `SeatCounter` live data from DB (initially hardcoded, then API endpoint) |
| 28 | `ComparisonLedger` SSR markup verified in LLM crawl simulation |
| 29 | Video hosting setup (Cloudflare Stream or Bunny.net) |
| 30 | Shot-15 (India kirana) produced, for /india page placeholder |
| 31 | Social share cards per page (Satori-generated, not just OG global) |
| 32 | `WaitlistForm` honeypot + rate limiting |

---

### P2, Post-Launch

| # | Item |
|---|---|
| 33 | `/switch` page (the 2-hour migration film) |
| 34 | `/compare/[competitor]` pages |
| 35 | `/en/[country]` country pages (6 GCC markets) |
| 36 | "Meet Zee" Remotion film (V1 above) |
| 37 | UI sound on NextMove reveal (V3 above) |
| 38 | `/blog` + `/changelog` + `/progress` pages |
| 39 | Shot-15 India hero for /india page |

---

### Asset Blockers Summary

| Blocker | Required for | Status |
|---|---|---|
| All 16 photography shots generated | Hero, all sections | Not started, run AI prompts from `photography-shotlist.md` |
| Founder portrait (Hussain photo) | S10, /start | Not started |
| Morning-glance hero image | S12 final CTA | Not started |
| `zerupt-symbol.svg` outlined vector | Sigil system, favicon | Exists in `agent-os/brand/`, needs path-outlining |
| Resend API key + account | WaitlistForm | Needs setup |
| Cal.com booking link | Founding 50 CTA | Needs setup |
| Legal copy (privacy + terms) | /privacy, /terms | Legal review required before launch |
| Seat count source of truth | SeatCounter | Decide: hardcoded (P0) vs DB-backed (P1), recommend hardcoded at launch, swap after |

---

*End of Part 3: Production & Asset Manifest.*
