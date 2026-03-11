# Zerupt Build-in-Public Plan

## The Problem You're Solving

You have 2-3 hours/day, launch is March 19, and you need content running alongside development without content eating into dev time. This plan keeps content production under 30-45 min/day by making your dev work the raw material for content.

---

## 1. Content Management System: Linear Content Team

### Setup

Create a second Linear team called **Content** (free tier allows 2 teams). This keeps content issues separate from dev but in the same workspace.

**Statuses:** `Idea` > `Draft` > `Ready` > `Posted` > `Analyzed`

**Labels:**
- Format: `tweet`, `carousel`, `reel`, `story`, `thread`
- Account: `personal`, `company`
- Source: `dev-triggered`, `manual`
- Pillar: `building-zerupt`, `founder-journey`, `ai-dev`, `erp-insights`, `hot-takes`, `product-vision`, `retail-pain`, `market-education`, `social-proof`

**Why this works:** Every content piece is a trackable issue. You can see what's in the pipeline, what's been posted, and what pillar is underrepresented. When you complete a dev task, you (or a Claude Code command) create a linked content issue in the Content team.

### Linking Dev to Content

When you finish a dev task, add a comment like `content: shipped tenant provisioning pipeline` to the dev issue. Your `dev-to-content` command reads recent completed dev issues and generates content drafts as new Content team issues. The dev issue and content issue link to each other for traceability.

---

## 2. Daily Workflow (30-45 min content time)

### Morning Block (15 min)
1. Open Linear Content board
2. Run `morning-briefing` command in Claude Code -- it reads your dev tasks for the day and generates:
   - 3-5 tweet drafts (mix of pillars)
   - 1 carousel concept (if it's a carousel day)
   - 1 reel angle (if it's a reel day)
3. Review drafts, pick the best tweet, post it
4. Move any good drafts to `Ready` status for later

### During Dev (0 min extra)
- Just develop. If something interesting happens, note it in the Linear dev issue comments
- Screen-record interesting sessions (QuickTime, hit Cmd+Shift+5) for potential reels

### After Dev Session (15 min)
1. Run `dev-to-content` command -- reads completed dev tasks, generates content
2. Pick 1-2 tweets, post them
3. If a carousel is `Ready`, upload to Instagram
4. Move posted items to `Posted`

### Evening (5 min)
- Reply to comments/DMs
- Note any content ideas that came up during the day (create `Idea` issues)

---

## 3. Account Strategy

### @hussainbuildswithai (Personal Instagram + Twitter)

Your personal brand. You are the draw -- Zerupt is what you're building.

| Pillar | % | What | Example |
|--------|---|------|---------|
| Building Zerupt | 35% | Daily shipping, decisions, wins, blocks | "just shipped multi-tenant provisioning in 2 hours using Claude" |
| Solo Founder Journey | 20% | 2 jobs + CS degree + startup, time management, real talk | "how i structure 2.5 hours of dev time to ship an ERP" |
| AI-Powered Dev | 20% | Claude/Cursor workflows, tool chains, productivity | "my exact cursor setup for building a full accounting engine" |
| ERP/Retail Insights | 15% | 10 years family experience, industry problems | "why 80% of mid-market retailers still run on spreadsheets" |
| Hot Takes | 10% | Contrarian views on AI, SaaS, ERP | "SAP's 600 AI agents are a band-aid on a 20-year-old monolith" |

### @zerupt.erp (Company Instagram)

Product-focused. Professional but not corporate. Shows the product being built.

| Pillar | % | What | Example |
|--------|---|------|---------|
| Product Vision | 30% | The 2-hour promise, feature previews | "What if your ERP configured itself?" |
| Retail Pain Points | 30% | Problems retailers face | "The real cost of a 6-month ERP implementation" |
| Market Education | 25% | MENA/India/SEA retail tech landscape | "Why GCC retail needs Arabic-first software" |
| Social Proof | 15% | Waitlist numbers, milestones, progress | "500 on the waitlist. Here's what they're asking for." |

### Twitter/X (Personal)

Same pillars as personal Instagram. Twitter is your volume play -- 2-3 tweets/day, 1 thread/week. More conversational, more hot takes, faster iteration.

---

## 4. Weekly Content Schedule

| Day | Personal IG | Company IG | Twitter |
|-----|------------|------------|---------|
| Mon | Carousel (AI/dev tip) | -- | 2-3 tweets |
| Tue | Story (dev progress) | Carousel (retail pain point) | 2-3 tweets |
| Wed | Reel (building session) | -- | Thread + 2 tweets |
| Thu | Carousel (founder lesson) | Post (product vision) | 2-3 tweets |
| Fri | Story (week recap) | -- | 2 tweets |
| Sat | Reel (demo/screen rec) | Carousel (market education) | 1 tweet |
| Sun | Rest / batch prep | -- | 1 tweet |

**Weekly totals:** ~4 personal IG posts, ~3 company IG posts, ~15 tweets

**Sunday batch session (30-45 min):** Pre-generate Mon-Wed content so early week is zero-effort on content side.

---

## 5. Content Formats

### Tweets

Follow the style from `tweet_guide.md`: genuine value, immediately actionable, easy to read, conversational mentor tone.

**Templates:**

```
DEV UPDATE:
just shipped [feature] for zerupt

> [what it does]
> [why it matters]
> [the surprising part]

built it in [time] using [tool]
```

```
VALUE/HOW-TO:
how to [outcome] without [pain]:

1. [step]
2. [step]
3. [step]

i've been doing this for [time] and [result]
```

```
HOT TAKE:
unpopular opinion: [bold statement]

> [reason 1]
> [reason 2]

[one-line closer]
```

```
THREAD (Wednesdays):
Tweet 1: Hook + "here's the exact process (thread)"
Tweets 2-7: One concept per tweet, ">" sub-points
Tweet 8: Recap + "follow @hussainbuildswithai"
```

### Carousels (1080x1350px, max 10 slides)

```
Slide 1: HOOK -- Bold headline (max 8 words), dark bg, accent color
Slide 2-3: THE PROBLEM -- One pain per slide, 2-3 lines max
Slide 4-6: THE INSIGHT -- Numbered steps or breakdown, 1 idea per slide
Slide 7-8: THE SOLUTION -- How Zerupt addresses this (natural, not salesy)
Slide 9: CTA -- "Follow @hussainbuildswithai" or "Join waitlist: zerupt.com"
Slide 10: PROFILE -- Photo, name, "Building Zerupt"
```

Build an HTML template that renders slides with Puppeteer screenshots. Store at `/content/templates/carousel.html`. Brand: dark charcoal (#0A0A0A) or dark navy (#0C1222), accent TBD with landing page.

### Reels (30-60 sec)

```
HOOK (0-3s): "I just [surprising thing] in [surprising time]"
CONTENT (15-45s): Screen recording or talking head, 3 key points max
CTA (3-5s): "Follow for daily builds" or "Link in bio"
```

Record during dev with QuickTime (Cmd+Shift+5). Trim in CapCut (free). Auto-captions via CapCut. Raw > polished.

---

## 6. Claude Code Automation

### Commands to Build

These live in `.claude/commands/` and are the backbone of the system.

#### `morning-briefing`
- Reads Linear dev tasks (today's planned work)
- Reads `tweet_guide.md` for style
- Reads `agent-os/product/mission.md` for positioning
- Outputs: 3-5 tweet drafts, 1 carousel concept, 1 reel angle
- Creates Content team issues in Linear for each draft

#### `dev-to-content`
- Reads recently completed Linear dev issues (last 24h)
- Generates tweet + carousel + reel drafts from what was shipped
- Creates Content team issues with `dev-triggered` label
- Links back to the dev issue

#### `carousel-generator`
- Takes a topic (1 line) or a Content team issue ID
- Expands to slide-by-slide markdown
- Renders HTML template -> Puppeteer screenshots at 1080x1350
- Saves PNGs to `/content/carousels/YYYY-MM-DD/`

#### `tweet-batch`
- Takes a pillar name and count (e.g., `building-zerupt 5`)
- Generates N tweets following `tweet_guide.md` style
- Creates Content team issues for each

#### `weekly-analytics`
- Prompts you for follower counts, top posts, engagement rates
- Generates a weekly report as a Linear document
- Suggests adjustments based on decision rules (see section 8)

---

## 7. Landing Page

### Sections
1. **Hero** -- "The First ERP That Sets Itself Up" + waitlist email input
2. **Problem** -- 3 cards: Enterprise ($500+, 6 months), Budget (still needs consultants), Spreadsheets (can't scale)
3. **The Zerupt Way** -- 3 steps: Answer Questions > AI Configures > You're Live
4. **Features** -- 8 module cards (POS, Sales, Purchase, Inventory, Accounting, Reports, Dashboard, AI Copilot)
5. **Comparison Table** -- Zerupt vs SAP vs Oracle vs Odoo (price, setup time, MENA support, AI-native)
6. **Build-in-Public Dashboard** -- Current phase, recent shipped tasks, launch countdown
7. **Target Markets** -- GCC + India + SEA with language/compliance details
9. **Footer** -- Waitlist CTA repeated, "Launching Eid 2026"

### Tech
- Single `index.html` with Tailwind CDN
- Supabase JS client for waitlist inserts (anon key, RLS insert-only)
- Deploy to Vercel as static site
- Dark theme, premium feel, GSAP animations

### Waitlist DB (Supabase)
- Table: `waitlist(id uuid, email text, source text, created_at timestamptz)`
- RLS: allow anonymous inserts, deny all reads/updates/deletes
- Source field: `landing`, `instagram`, `twitter` -- passed as hidden field

---

## 8. Analytics & Course Correction

### Weekly Metrics (track in Linear document, every Sunday)

| Metric | Target |
|--------|--------|
| IG personal followers | +20/week |
| IG company followers | +10/week |
| Twitter followers | +30/week |
| IG engagement rate | >3% |
| Waitlist signups | >10/week |

### Decision Rules

| Signal | Action |
|--------|--------|
| Engagement drops 2 weeks straight | Switch format (carousel <> reel) |
| One pillar underperforms | Reduce its %, increase top performer |
| Reels get 3x reach vs carousels | Shift to more reels |
| Tweet thread gets >50 bookmarks | Repurpose as IG carousel |
| Waitlist <5/week | Add CTA to every post |
| Post goes viral (>10x avg reach) | Create 3 variations next week |

---

## 9. 12-Day Execution Timeline (March 7-19)

### Day 1 (Mar 7, Fri) -- FOUNDATION
- **Dev (1.5h):** Linear Content team setup. Supabase waitlist table + RLS.
- **Content (1h):** First 3 tweets introducing the journey. Set up @zerupt.erp bio/profile pic.

### Day 2 (Mar 8, Sat) -- LANDING PAGE
- **Dev (2.5h):** Build landing page (hero + problem + solution + waitlist). Deploy to Vercel.
- **Content (0.5h):** Tweet about building the page. Screen recording for story.

### Day 3 (Mar 9, Sun) -- LANDING PAGE + FIRST CAROUSEL
- **Dev (1.5h):** Finish landing page (features + dashboard + footer). Test waitlist flow end-to-end.
- **Content (1.5h):** Build carousel HTML template. First carousel: "Why ERPs take 6 months." First @zerupt.erp post.

### Day 4 (Mar 10, Mon) -- CONTENT SYSTEM
- **Dev (2h):** Build `carousel-generator` command. Start Phase 0 infra.
- **Content (1h):** Thread: "10 years of family ERP experience -- what I learned." Reel: talking-head intro.

### Day 5 (Mar 11, Tue) -- DEV HEAVY
- **Dev (2.5h):** Phase 0 infra (monorepo, CI/CD). Build `dev-to-content` command.
- **Content (0.5h):** Dev update tweet + IG story.

### Day 6 (Mar 12, Wed) -- THREAD DAY
- **Dev (2h):** Phase 0/1 development.
- **Content (1h):** Thread: "How I use AI to build an entire ERP solo." @zerupt.erp carousel.

### Day 7 (Mar 13, Thu) -- BATCH + BUILD
- **Dev (2h):** Phase 0/1 development.
- **Content (1h):** Batch tweets for rest of week. Carousel: "5 signs you've outgrown spreadsheets." Build `morning-briefing` command.

### Day 8 (Mar 14, Fri) -- MIDPOINT
- **Dev (2h):** Phase 0/1 development. Update build-in-public dashboard on landing page.
- **Content (1h):** First weekly analytics review. Reel: screen recording of what you built. Midpoint reflection tweet.

### Day 9 (Mar 15, Sat) -- DEV SPRINT
- **Dev (2.5h):** Push for something demoable.
- **Content (0.5h):** Dev update tweet + story.

### Day 10 (Mar 16, Sun) -- BATCH LAUNCH WEEK
- **Dev (1h):** Polish demoable features.
- **Content (2h):** Batch all launch week content. "3 days until launch" posts. Write launch thread.

### Day 11 (Mar 17, Mon) -- PRE-LAUNCH
- **Dev (2h):** Final polish, bug fixes.
- **Content (1h):** "2 days" countdown posts. Teaser reel. DM 10-20 target market people about launch.

### Day 12 (Mar 18, Tue) -- LAUNCH EVE
- **Dev (1.5h):** Final testing + deployment.
- **Content (1.5h):** "Tomorrow" posts. Prep all launch day content. Email waitlist.

### LAUNCH (Mar 19, Wed -- Eid)
- **Content (2-3h spread across day):** Launch thread, @zerupt.erp launch post, launch carousel, launch reel. Respond to every comment/DM. Evening "thank you" post.
- **Dev (1h):** Monitor waitlist, fix anything broken.

---

## 10. File Structure

```
/content/
  /templates/
    carousel.html          -- Tailwind slide template for Puppeteer
    carousel-data.json     -- Schema for slide content
  /carousels/
    /YYYY-MM-DD/           -- Generated carousel PNGs by date
  /tweets/
    /drafts/               -- Tweet drafts (markdown)
  /reels/
    /scripts/              -- Reel scripts (markdown)

/.claude/commands/
  morning-briefing.md      -- Morning content generation command
  dev-to-content.md        -- Post-dev content generation command
  carousel-generator.md    -- Carousel slide generation command
  tweet-batch.md           -- Batch tweet generation command
  weekly-analytics.md      -- Weekly metrics review command

/tweet_guide.md            -- Already exists, tweet style reference
/agent-os/product/mission.md  -- Already exists, product positioning
```

---

## 11. Key Principles

1. **Dev work IS content.** You don't create content separately -- you extract it from what you ship.
2. **Consistency > quality.** A good-enough tweet posted daily beats a perfect tweet posted weekly.
3. **30-45 min/day max.** If content takes longer, the system is broken. Fix the system, not the schedule.
4. **Personal account leads.** People follow people, not products. @hussainbuildswithai drives awareness, @zerupt.erp converts it.
5. **Automate generation, not posting.** Claude generates drafts. You review and post manually. This keeps your voice authentic.
6. **Measure and adjust weekly.** Sunday analytics review. Double down on what works, cut what doesn't.
