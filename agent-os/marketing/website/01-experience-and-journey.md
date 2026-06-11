---
title: Zerupt Website, Part 1: Experience, Flow, Journey & Emotion
status: active
created: 2026-06-08
owner: Hussain
tldr: The emotional and experiential blueprint for the whole zerupt.com site. Defines, per page (with URLs), who lands there, the feeling we engineer, the flow in and out, and the conversion logic (including the pricing industry gate). This is the foundation Part 2 (copy) and Part 3 (production/assets) build on. Derived from brand-story.md and brand-foundation.md.
---

# Part 1: The Website as an Experience

> Read `brand-story.md` first. This doc turns that story into a *felt journey* across pages. Every page is a beat in the three-act story (Trap, Turn, New Life). The job of the site is not to "inform." It is to make a tired, skeptical shop owner *feel* the weight lift, then act.

## 0. The single experiential idea

The whole site is **one owner's day, reversed.** It opens in the dark (the 10pm trap, anxiety, no control) and walks the visitor into the light (the morning glance at the phone, total calm, in command). The visitor should physically feel the temperature change as they scroll: from tense and dim to warm and clear. We engineer this with pacing, contrast (dark bands to cream), one accent (citron) that grows as "Zerupt acts," and copy that moves from *their fear in their words* to *their new life as fact.*

We are not selling software. We are selling the moment the owner exhales.

### The emotional arc we move every visitor along

```
TENSION  ->  RECOGNITION  ->  RELIEF  ->  WONDER  ->  TRUST  ->  PRIDE  ->  RESOLVE
(the trap)  (they get me)  (a way out) (the team) (the proof) (the trophy) (the action)
```

Each page, and each section within the homepage, is engineered to hand the visitor from one feeling to the next. If a section does not move the feeling forward, it is cut.

### The three feelings we must create (in order of power)
1. **"They understand my exact problem."** Recognition before pitch. Mirror the 10pm fear so precisely they feel seen.
2. **"This team can do what no human employee can: be trusted completely."** The control payoff. Can't steal, quit, get sick, or err.
3. **"I would be proud to run my shop this way."** The trophy. They picture themselves ahead of their peers.

### Design principles that make them FEEL it (govern every page)
- **Contrast as emotion.** Dark = the trap and the tension. Cream = relief and clarity. We move between them deliberately, never decoratively.
- **Citron = the pulse of the team.** Citron is scarce and meaningful: it appears the moment "Zerupt acts" (a finding, a next move, a live counter). It grows in presence as the story resolves. Never decoration.
- **One thing moves at a time.** Calm, assured motion (brand-foundation §17). Nothing bounces. The site feels in control because it *is* in control. The medium is the message.
- **Real faces, real shops.** Photography of real GCC owners and shops (the `photography-shotlist.md`) carries the emotion text cannot. The owner is always the hero in frame; Zerupt is the quiet force.
- **The team feels alive.** Zee and the roster have a consistent visual identity and a calm "thinking/acting" pulse. They are characters, not icons.
- **Numbers in mono, always true.** IBM Plex Mono for every figure. The precision is felt as trust. We never show a fake-looking dashboard; we show real, plausible GCC data.
- **Bilingual as art.** Arabic is art-directed, not translated. The Arabic site must feel *designed in Arabic*, with equal weight and beauty, not flipped.
- **Sound is optional and earned.** Any audio (see Part 3) is off by default, tasteful, and reinforces calm-then-resolve. Never autoplay noise.

---

## 1. The full sitemap (every page, with URLs)

Locale prefix on everything: `zerupt.com/en/...` and `zerupt.com/ar/...`. Root `/` redirects to detected locale. The site STOPS at the handoff to `app.zerupt.com` (signup/login live there).

### Launch set (build now)

| URL | Page | Story beat | Primary job | Feeling target |
|---|---|---|---|---|
| `/en`, `/ar` | **Home** | The whole three-act story, scrolled | Convert cold traffic to signup or booked setup | Tension to resolve (the full arc) |
| `/en/team`, `/ar/team` | **Meet your team** | Act 2, expanded: the magic personified | Make the AI team real, loved, and trusted | Wonder to trust |
| `/en/pricing`, `/ar/pricing` | **Pricing + industry gate** | Act 2 authority: the offer, the guarantee | Price clarity, then route to signup or waitlist | Reassurance to resolve |
| `/en/start`, `/ar/start` | **Founder letter (ad landing)** | The guide's origin, full | Paid-traffic doorway, founder-voice, high-trust | Connection to belief (noindex) |
| `/en/waitlist`, `/ar/waitlist` | **Waitlist** | "Your turn is coming" | Capture demand we cannot serve yet (FIFO verticals + non-GCC markets) | Belonging, not rejection |
| `/en/thanks`, `/ar/thanks` | **Thanks / confirmation** | The handshake | Confirm a booking or waitlist, set expectations, Zee voice | Calm certainty |
| `/en/privacy`, `/ar/privacy` | **Privacy** | Trust infrastructure | Legal clarity, on-brand | Quiet trust |
| `/en/terms`, `/ar/terms` | **Terms** | Trust infrastructure | Legal clarity, on-brand | Quiet trust |
| `/en/*` (404) | **Not found** | A graceful miss | Branded recovery, route home | Reassurance |

### Post-launch set (reserve the IA now, build next; document so copy/assets anticipate them)

| URL | Page | Why it exists |
|---|---|---|
| `/en/switch`, `/ar/switch` | **The 2-hour switch** | Demonstrate migration (Mira) as a film/interactive. Act 2 proof. |
| `/en/compare/[competitor]` | **Zerupt vs Odoo / Zoho / Tally / Qoyod / Foodics** | Bottom-funnel "vs" search + LLM citation. |
| `/en/[country]` | **saudi-arabia, uae, kuwait, bahrain, qatar, oman** | Local intent SEO; local tax/currency/proof. Highest-ranking pages. |
| `/en/blog`, `/blog/[slug]` | **Blog** | Build-in-public + SEO content hub. |
| `/en/changelog` | **Changelog** | Build-in-public broadsheet; shows momentum. |
| `/en/progress` | **Progress** | Live milestone dashboard; founder transparency. |

---

## 2. The homepage, beat by beat (the emotional script)

The homepage IS the three-act story. Each section below lists its **story beat, the feeling we hand off, the mechanism, and the transition into the next.** Copy lives in Part 2; assets in Part 3.

### Section 1, Hero (the hook): the trap named as a promise
- **Beat:** Act 1 problem, framed as the Act 2 solution. Lead with control/trust (founder-confirmed hook).
- **Feeling:** instant recognition + intrigue. "Wait, a team that can't steal or quit?"
- **Mechanism:** dark or warm-dim canvas (we open in the owner's late evening). The control hook headline ("the team that runs your shop for you, no salaries, no theft, no sick days, no mistakes"). One primary CTA. A single citron spark wakes as the team "comes online." A real owner's face or a calm shop scene anchors it, not a generic graphic.
- **Transition out:** the visitor is intrigued but skeptical. We immediately prove we understand them.

### Section 2, The trap (recognition): their 10pm, in their words
- **Beat:** Act 1, the trap, mirrored precisely.
- **Feeling:** "They get me." The skeptical owner softens because we described their exact night.
- **Mechanism:** the 10pm scene. The three faces of the pain (can't trust anyone with the money; the numbers are never right; the software just sends a bill). Asymmetric, editorial layout (not three identical cards). Quiet, dim. A mid-page CTA is NOT here yet; we have not earned it. We earn recognition first.
- **Transition:** having named the trap, we offer the way out.

### Section 3, The turn (relief): it was never supposed to be this hard
- **Beat:** Act 2 opening. The guide speaks. Up and running in an afternoon.
- **Feeling:** relief, the first exhale. "There is a way out, and it is fast."
- **Mechanism:** the temperature lifts (toward cream). Three steps (answer a few questions, your team sets it up, you are up and running in under 2 hours). Mira is named here as the one who does the migration. "You pay nothing until you are up and running."
- **Transition:** relief becomes wonder as we reveal *who* does the work.

### Section 4, Meet your team (wonder): the magic, personified
- **Beat:** Act 2 heart. The reveal.
- **Feeling:** wonder, then delight. The team becomes real and likeable.
- **Mechanism:** Zee introduces the team. Each member shown with their job and a one-line win, in their voice. The "hiring" mechanic teased (Mira and Sami on the job now; the rest join as your data grows). This section links to the full `/team` page. The control payoff restated: this team cannot steal, quit, get sick, or err.
- **Transition:** wonder needs proof. We show the team working.

### Section 5, Your Next Move (the signature difference): the brand's soul
- **Beat:** Act 3 engine. The growth advisor.
- **Feeling:** "This does not just hold the line, it makes me money." Quiet awe.
- **Mechanism:** KEEP the existing dark NextMove band (it already works). The one place citron carries full meaning. A real, plausible next-move card ("Reorder Basmati 5kg, you run out Thursday"). This is the single most ownable moment on the site.
- **Transition:** awe becomes trust as we de-risk with the offer.

### Section 6, The offer + guarantee (trust): the safest yes in retail software
- **Beat:** Act 2 authority. The Grand Slam Offer, assembled in one frame.
- **Feeling:** "I cannot lose." Risk evaporates.
- **Mechanism:** the offer stack (up and running in 2 hours or we do it free; 30 days or every fil back; no card; pay nothing until up and running; Founding 50 frozen pricing). A live seat counter (citron). This block sits ABOVE pricing (trust before price).
- **Transition:** trust + a clear offer makes them ready to weigh price.

### Section 7, Proof it is real (belief): the product, doing the work
- **Beat:** Act 3 evidence.
- **Feeling:** belief. "This is real and it is beautiful."
- **Mechanism:** high-fidelity, true-to-life product glimpses (POS, your numbers, AI import) in owner-language, with real GCC data. The team is shown *acting* (Sami reading an invoice, Mira migrating). Mobile-friendly.
- **Transition:** belief plus a way to compare.

### Section 8, Why owners switch (justification): better and cheaper than the enemy
- **Beat:** Act 2, the enemy named.
- **Feeling:** rational justification for the emotional decision already made.
- **Mechanism:** the comparison ledger (Zerupt vs legacy ERP, POS bundles, spreadsheets) on time-to-running, year-one cost, all-in-one, Arabic/ZATCA, next-move, consultant-required. Honest. SSR for LLM citation.
- **Transition:** justified, they look at price.

### Section 9, Pricing teaser (affordability): the whole shop in every plan
- **Beat:** Act 2 authority continued.
- **Feeling:** "I can afford this, and it is fair."
- **Mechanism:** three tiers summarized in local currency, the full ERP in every tier, link to `/pricing` (where the industry gate lives). Proof already established above this.
- **Transition:** to the human behind it.

### Section 10, The founder (connection): why a 22-year-old built this
- **Beat:** the guide's credential.
- **Feeling:** connection, trust in a real person.
- **Mechanism:** Hussain's face and the insider-indictment origin (father's legacy software, watched owners get charged for everything). Short, warm, honest. Asymmetric layout.
- **Transition:** to last objections.

### Section 11, FAQ (reassurance): kill the final fears
- **Beat:** clearing the path.
- **Feeling:** every remaining doubt answered plainly.
- **Mechanism:** the real objections (2 hours really; what if I cancel, is my data mine; will my staff use it; what about a problem at 9pm; my data is messy; what if you shut down; Arabic; ZATCA/VAT honestly). FAQPage schema.
- **Transition:** to the decision.

### Section 12, Final call (resolve): the morning glance
- **Beat:** Act 3 close. The new life, then the ask.
- **Feeling:** resolve. "I want this. Today."
- **Mechanism:** the morning-glance image (calm, in command, proud). The promise restated ("Your business, handled. And you know your next move."). The guarantee restated. One primary CTA. Footer with orientation, WhatsApp, /start link.

### Global elements
- **Sticky header:** logo, Pricing, Team, Log in, primary CTA, language toggle. Transparent over the dark hero, solid cream on scroll.
- **Floating WhatsApp:** the GCC default channel, always reachable.
- **Geo-aware CTA:** GCC sees "Book your free setup" (Founding 50, Cal.com); non-GCC sees "Join the waitlist." Never hard-block; reorder emphasis.

---

## 3. The `/team` page (the brand's soul, expanded)

The flagship brand page. If the homepage makes the team intriguing, `/team` makes them loved.

- **Feeling target:** affection + trust. The owner should feel they are meeting their future staff and that these are the best, most honest employees they will ever have.
- **Structure:**
  1. **Zee, the lead.** Her face/sigil, her voice, what she does (talks to you, watches everything, hands you your next move). Female, warm, certain.
  2. **The roster, one rich card each** (Mira, Sami, Noor, Arjun, Tariq, Maya): name, job title, the human problem they kill, a first-day win quote in their voice, and their "trust" line (cannot steal/quit/sick/err).
  3. **The hiring mechanic, shown:** the team grows as your data grows. The progress-bar roster ("Noor starts in 18 days"). This is delightful and unique; it also creates emotional lock-in ("leaving is firing your team").
  4. **The trust frame, full:** a side-by-side of "a human employee" vs "your Zerupt team" (salary, theft risk, sick days, quitting, errors, hours) that lands the control payoff hard.
  5. **CTA:** hire your team (signup) or book a setup.
- **Honesty guardrail:** mark which agents are live at launch (Mira, Sami) vs unlocking later, truthfully, framed as "they join as your shop grows," never as vaporware.

---

## 4. The `/pricing` page + the industry gate (the conversion fork)

This page does two jobs: make price feel fair, then route each visitor to the right next step based on **industry (WAC vs FIFO)** and **market (GCC vs not)**.

### Page experience
- **Feeling target:** fairness + safety. "The whole shop is in every plan. I cannot make a wrong choice."
- Tiers (Starter / Growth / Pro) in local currency, full ERP in every tier, annual = 2 months free, the two-part guarantee prominent, Founding 50 live seats, the "Beyond Pro / Chains" custom line.

### The industry gate (the new flow you requested)
When the visitor clicks the primary CTA (Start / Get your team / Choose plan), we ask **"What kind of shop do you run?"** before handing off. This single question routes them correctly and sets expectations.

**Why we ask:** we serve businesses whose inventory runs on Weighted Average Cost (WAC) well today. Businesses that legally require batch and expiry (FEFO) tracking, mainly pharmacy and fresh-food, need our FIFO/expiry engine, which is built but not yet tested for production. We waitlist those rather than risk their compliance.

**The routing logic:**

```
Step A, Industry select (required):
  WAC-ready (route forward):
    Hardware & Building, Auto Parts, General Merchandise / Variety,
    Stationery & Office, Electronics & Mobile (note: no IMEI tracking yet),
    Apparel & Fashion, Cosmetics & Beauty (non-expiry), Grocery & Convenience (FMCG),
    Other general retail
  FIFO / expiry-required (route to waitlist):
    Pharmacy & Medical, Fresh Food / Bakery / Restaurant & Cafe,
    any business that must track batch + expiry

Step B, Market check (from country / locale / IP hint):
  GCC (SA, AE, KW, BH, OM, QA):
    -> WAC industry: route to SIGNUP (app.zerupt.com/{locale}/signup?plan&cycle&currency&industry)
       and offer the Founding 50 "Book your free setup" (Cal.com) as the concierge path.
    -> FIFO industry: route to WAITLIST, message: "We are getting [industry] ready. You are in the front of the line."
  Non-GCC (India, SEA, other):
    -> any industry: route to WAITLIST, message: "Zerupt is coming to [country] soon. Be first."
```

**Experience rules for the gate:**
- It is **one quick, friendly question**, not a form. Big tappable industry tiles with icons. Defensive UX: a clear back, no dead end, never lose their selection.
- **Waitlist must never feel like rejection.** It is "your turn is coming," with a real reason ("we are making sure expiry tracking is perfect for pharmacies before we let you in") that actually *increases* trust. Capture email + industry + country + current tool.
- **Electronics & Mobile** routes to signup but we set expectations honestly inside the app ("IMEI tracking is on the way"); we do not promise it on the marketing site.
- Pre-fill everything we know (plan, currency, industry, locale) into the signup or waitlist so the handoff feels effortless.

### The handoff boundary
Signup and login happen on `app.zerupt.com`. The website's job ends at a clean, pre-filled handoff. The Founding 50 path goes to Cal.com (concierge setup), not self-serve signup.

---

## 5. The `/start` page (founder letter, paid-traffic doorway)

- **Feeling target:** intimate connection. This is Hussain talking to one owner.
- Long-form, founder-voice, minimal chrome, the full origin (father's software business, the wound, the mission), the offer, both CTAs. UTM capture. `noindex` (avoids thin/dup content with home).
- This is the highest-trust asset for cold paid traffic and the script for founder video content.

## 6. The `/waitlist` page

- **Feeling target:** belonging and anticipation, never rejection.
- Lands FIFO-industry GCC visitors and all non-GCC visitors. Explains warmly why they are waiting, what they are first in line for, and what happens next. Captures email + industry + country + current tool. Honeypot spam guard. Success state sets expectations ("we will message you the day we open [industry/country]").

## 7. The `/thanks` page

- **Feeling target:** calm certainty. The exhale after acting.
- Two variants: booked-a-setup (what to bring to the call, when, Zee voice) and joined-waitlist (what happens next). A share nudge. Never a dead end.

## 8. Legal + 404
- **Privacy / Terms:** on-brand legal shell, readable, trustworthy, bilingual. (Legal review required before launch.)
- **404:** branded, warm, routes home. "This page wandered off. Let us get you back."

---

## 9. Cross-page user journeys (personas to paths)

Mapping the canonical personas (`user-journeys/`) to the routes they travel. This tells us which paths must be flawless.

| Persona | Lands via | Path | Gate result | Emotional need the path must meet |
|---|---|---|---|---|
| **Imran, 5 baqalas, Dubai** (P5) | IG ad / "POS for grocery UAE" | Home -> Team -> Pricing -> industry: Grocery (WAC) -> Signup | SIGNUP (GCC + WAC) | Catch the cash hole from his phone, today. Lead with control. |
| **Abu Khalid, auto parts, Riyadh** (P1) | "Arabic ERP ZATCA" / compare page | Home -> Pricing -> industry: Auto Parts (WAC) -> Signup or Book setup | SIGNUP (GCC + WAC) | Compliance certainty. Be honest about ZATCA timing (do not over-claim). |
| **Mariam, abaya fashion, Dubai** (P2) | "Zoho alternative" / IG | Home -> Team -> Pricing -> industry: Apparel (WAC) -> Signup | SIGNUP (GCC + WAC) | Trust her VAT history survives migration. Mira reassurance. |
| **Yousef, mobile shop, Kuwait** (P3) | "POS Kuwait" / referral | Home -> Pricing -> industry: Electronics (WAC, no IMEI yet) -> Signup | SIGNUP (GCC + WAC), honest IMEI note | Data safety + theft proof (Tariq). Lead with control/trust, his exact fear. |
| **Dr. Ahmed, pharmacy, Bahrain** (P4) | "pharmacy software Bahrain" | Home -> Pricing -> industry: Pharmacy (FIFO) -> Waitlist | WAITLIST (FIFO not tested) | Belonging, not rejection. "We are perfecting expiry tracking for pharmacies before we let you in." This builds MORE trust. |
| **Non-GCC owner (India/SEA)** | "retail ERP India" | Home -> Pricing -> any industry -> Waitlist | WAITLIST (market) | "Your market is coming." Be first. |

**Design implication:** the GCC + WAC signup path is the money path and must be the most polished. The waitlist paths (pharmacy, non-GCC) must feel like a warm "soon," never a door closing.

---

## 10. What success feels like (the bar for Part 2 and Part 3)

A skeptical owner lands at 11pm after a long day. In five seconds they feel seen (the team that can't steal or quit, up and running in 2 hours). As they scroll, the screen warms, the team comes alive, the fear turns to relief, the relief to wonder, the wonder to "I cannot lose," and the close to "I want this." They reach for their phone, pick their shop type, and either start in two minutes or join a waitlist that made them trust us *more.* In Arabic, it feels the same, designed in Arabic, not flipped. That is the experience Part 2 (copy) and Part 3 (production) must deliver.
