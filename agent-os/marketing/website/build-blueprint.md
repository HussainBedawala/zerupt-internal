---
title: Zerupt Marketing Website — Hybrid Build Blueprint
status: active
created: 2026-06-08
owner: Hussain
tldr: Master plan for the premium "Hybrid" marketing site — AI-team spine (B) + 2-hour-switch hero (A) + editorial-print craft (C). Covers IA, design system, section blueprint, tech stack, verification gates, and phased delivery. Source of truth for the MW milestone finish.
---

# Zerupt Website — Hybrid Build Blueprint

## The Concept (one line)
A premium, Arabic-first, editorial-print marketing site where the **named AI team (Zee + Mira, Sami, Noor, Arjun, Tariq, Maya) is the emotional centerpiece**, the **2-hour live switch is the demonstrated hero**, and everything is rendered in **quiet-luxury print craft** so it never reads as SaaS.

- **Spine = B (People):** the AI team you "hire."
- **Hero = A (Time):** signup → live in under 2 hours, shown not claimed.
- **Texture = C (Print):** cream/ink/citron, IBM Plex, ledger lines, mono data tables, real bidi tension.

## Non-Negotiables (from brand-foundation.md + DESIGN.md)
- Cream `#F9F7F5` canvas · Ink `#141310` · ONE citron accent `#979C1A` (fill/ring only, never text on cream; citron-toned text uses olive-deep `#454729`). Dark-first w/ full light parity.
- Primary CTAs = ink, not citron. ~60% canvas / 30% ink / 10% citron.
- IBM Plex Sans (Latin/Arabic/Devanagari) + IBM Plex Mono. NO Inter/Noto/serif.
- BANNED: violet, teal, navy, glassmorphism, bento homepage, particles, floating 3D shapes, typewriter-cursor hero, animated trust-counters, "built with AI" badges, bounce/spring easing.
- Arabic = art direction, not translation. Motion respects `dir` + `prefers-reduced-motion`.
- Real baqala/kirana documentary photography only. No stock tech imagery.

## Information Architecture (full site → app handoff)
Route base: `/[locale]` (en/ar). Handoff endpoint = app.zerupt.com (where we stop).

| Route | Status | Direction emphasis |
|-------|--------|-------------------|
| `/` home | rebuild | A hero + B team + C texture |
| `/pricing` | enhance | C tables + A guarantee |
| `/team` (NEW) | build | B — meet Zee + roster (flagship page) |
| `/switch` or `/migrate` (NEW) | build | A — the 2-hour switch demo + free migration |
| `/start` | keep/restyle | founder letter (ad landing, noindex) |
| `/compare/[competitor]` (DEV-380) | build | odoo, foodics, zoho, qoyod — switch SEO |
| `/[country]` (DEV-379) | build | saudi-arabia, uae, kuwait, bahrain, qatar, oman |
| `/changelog` (NEW, part of DEV-381) | build | C — build-in-public broadsheet |
| `/progress` (DEV-381) | build | live Linear milestone |
| `/blog` (DEV-382) | build | MDX content hub |
| `/thanks` | keep | Zee-voice confirmation |
| `/privacy` `/terms` | restyle + LEGAL REVIEW | legal-shell |
| `not-found` | done (DEV-369) | branded 404 |

## Tech / Motion Stack (Lighthouse 90+ contract)
- Base: Next.js 16, React 19, Tailwind 4, next-intl v4 (already in place).
- `lenis` (smooth scroll, 6KB) · `motion` (in-view + scroll-linked, have it) · native CSS `animation-timeline: view()` for simple reveals (0 JS).
- Grain: CSS `::before` + ~3KB PNG, `mix-blend-mode`.
- Shader bg (optional, hero only): minimal R3F or `shader-web-background`, lazy `ssr:false`, deferred after LCP, frozen on reduced-motion.
- Rive (`@rive-app/react-canvas`, lazy) — one micro-demo per agent.
- Remotion — rendered brand/product films (2-hour switch sequence, "meet Zee").
- Ambient video — native `<video>`, AV1/H.265, no audio track, <1MB above-fold, `+faststart`, load after LCP.
- Resend — waitlist confirmation email (Zee voice, React Email).
- Rate-limit (DEV-383) + Founding-50 counter — **Supabase Postgres, NOT Redis.** Small rate-limit table keyed on IP+window; counter = `count()` query. No Upstash/Redis dependency (cost decision, 2026-06-08).

### Perf rules
- LCP element is always text/CTA, never canvas/video. `dpr` capped 1.5, shaders at 30fps.
- Defer to post-launch if they threaten 90+: scroll-scrubbed video, full WebGL scene, interactive embed.

## Verification Gates (every screen, before "done")
1. **Code:** typecheck + lint + unit/e2e green. `pnpm --filter @zerupt/website i18n:check` parity.
2. **Visual:** `/browse` headless capture at 375px (mobile), 768px, 1440px — light AND dark, en AND ar. No overflow, RTL flips correct.
3. **Perf:** Lighthouse mobile ≥90 perf / ≥95 a11y / 100 SEO on key pages.
4. **Smoothness:** scroll @ 60fps, no layout shift (CLS <0.05), motion respects reduced-motion.
5. **Mobile-first:** every interaction works on touch; tap targets ≥44px; no hover-only affordances.

## Phased Delivery
- **P0 — Foundation:** design system tokens audit, motion primitives (`<Reveal>`, lenis, grain), Stitch composition refs (light+dark, all pages). Resolve asset decisions.
- **P1 — Home rebuild:** A-hero (2-hour switch) + B team teaser + C sections. Verify gate.
- **P2 — Team page (`/team`):** flagship B page, Zee + roster, Rive demos. Verify.
- **P3 — Switch page + compare pages:** A migration demo + `/compare/*` SEO. Verify.
- **P4 — Pricing restyle + country pages + legal restyle.**
- **P5 — Content: changelog + progress + blog engine.**
- **P6 — Gaps: Resend email, DEV-383 rate-limit.**
- **P7 — Launch gate: RTL parity (DEV-376), Lighthouse (DEV-377), deploy + QA + GSC/Bing (DEV-378).**
- **Linear hygiene:** close superseded DEV-304/307–327; map new pages to DEV-379/380/381/382.

## Resolved Decisions (2026-06-08)
1. **Agent visual identity = ABSTRACT-SYMBOLIC.** Each agent = a distinct geometric "spark"/sigil in citron+olive, built in code/SVG/Rive. Zero uncanny-AI risk. Upgradeable to illustration later.
2. **Photography = AI-GENERATED** from a precise shot list + framing guide + JSON prompts (see `agent-os/product/website/photography-shotlist.md`). Documentary MENA-retail aesthetic, dark-gradeable to ink.
3. **No Redis.** Rate-limit + counter on Supabase Postgres.

## Still Open (asset blockers)
1. Logo SVG — only PNG exists (`public/logo-mark.png`, `logo-banner.png`). Rebuild from brand-book spec or get source export.
2. Real anonymized baqala dataset for mono tables (can synthesize realistic GCC data if none available).
3. Service accounts to provision: Resend (email), Bunny.net Stream (video), Rive (agent demos).
