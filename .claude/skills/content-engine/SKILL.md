---
name: content-engine
description: Create platform-native content systems for X, LinkedIn, TikTok, YouTube, newsletters, and repurposed multi-platform campaigns. Use when the user wants social posts, threads, scripts, content calendars, or one source asset adapted cleanly across platforms.
origin: ECC
---

# Content Engine

Turn one idea into strong, platform-native content instead of posting the same thing everywhere.

## When to Activate

- writing X posts or threads
- drafting LinkedIn posts or launch updates
- scripting short-form video or YouTube explainers
- repurposing articles, podcasts, demos, or docs into social content
- building a lightweight content plan around a launch, milestone, or theme

## First Questions

Clarify:
- source asset: what are we adapting from
- audience: builders, investors, customers, operators, or general audience
- platform: X, LinkedIn, TikTok, YouTube, newsletter, or multi-platform
- goal: awareness, conversion, recruiting, authority, launch support, or engagement

## Core Rules

1. Adapt for the platform. Do not cross-post the same copy.
2. Hooks matter more than summaries.
3. Every post should carry one clear idea.
4. Use specifics over slogans.
5. Keep the ask small and clear.

## Platform Guidance

### X
- open fast
- one idea per post or per tweet in a thread
- keep links out of the main body unless necessary
- avoid hashtag spam

### LinkedIn
- strong first line
- short paragraphs
- more explicit framing around lessons, results, and takeaways

### TikTok / Short Video
- first 3 seconds must interrupt attention
- script around visuals, not just narration
- one demo, one claim, one CTA

### YouTube
- show the result early
- structure by chapter
- refresh the visual every 20-30 seconds

### Newsletter
- deliver one clear lens, not a bundle of unrelated items
- make section titles skimmable
- keep the opening paragraph doing real work

## Repurposing Flow

Default cascade:
1. anchor asset: article, video, demo, memo, or launch doc
2. extract 3-7 atomic ideas
3. write platform-native variants
4. trim repetition across outputs
5. align CTAs with platform intent

## Deliverables

When asked for a campaign, return:
- the core angle
- platform-specific drafts
- optional posting order
- optional CTA variants
- any missing inputs needed before publishing

## Quality Gate

Before delivering:
- each draft reads natively for its platform
- hooks are strong and specific
- no generic hype language
- no duplicated copy across platforms unless requested
- the CTA matches the content and audience

---

## Website & SEO Patterns

When creating content for websites (landing pages, product pages, blog posts), apply these additional patterns.

### Meta Tags

Every page needs:
- **Title**: 50-60 characters, primary keyword near the start, brand at end
- **Description**: 150-160 characters, includes primary keyword, ends with CTA or value prop
- **OG Title/Description**: Can be slightly different for social sharing (more hook-driven)
- **Twitter Card**: Use `summary_large_image` for visual pages

Template:
```
Title: [Primary Benefit] - [Secondary Keyword] | [Brand]
Description: [Value prop with keyword]. [Supporting detail]. [CTA or promise].
```

### Heading Hierarchy

- **H1**: One per page, contains primary keyword, matches search intent
- **H2**: Section headings, each targets a related keyword or question
- **H3**: Subsections within H2s, use for feature lists or breakdowns
- Never skip levels (H1 → H3 is wrong)

### Keyword Integration

- Primary keyword: H1, first paragraph, meta title, meta description
- Secondary keywords: H2s, body paragraphs, image alt text
- Density: 1-2% for primary, natural for secondary
- Avoid stuffing — readability always wins

### Structured Data (JSON-LD)

Include appropriate schema for:
- **Organization**: Company info, logo, social links
- **Product**: For product pages (name, description, price, availability)
- **FAQ**: For pages with Q&A sections (helps win featured snippets)
- **Article**: For blog posts (author, date, headline)
- **BreadcrumbList**: For navigation context

### Internal Linking

- Every page should link to 2-5 related internal pages
- Use descriptive anchor text (not "click here")
- Link to high-value pages from high-traffic pages
- Create topic clusters: pillar page + supporting articles

### LLM-Friendly Patterns

Make content easy for AI assistants to parse and cite:
- Clear section headings that answer questions
- Semantic HTML structure (proper heading hierarchy)
- FAQ sections with explicit Q&A format
- Bullet points for feature lists
- Tables for comparisons
- Avoid content hidden in accordions or tabs for key info

---

## Website CTAs

### Waitlist Signup
- **Primary**: "Join the Waitlist" or "Get Early Access"
- **Supporting**: "Be first to know when we launch" or "Limited spots available"
- **Form**: Email only (reduce friction), optional company name
- **Confirmation**: Clear success state, set expectations ("We'll email you in X")

### Demo Request
- **Primary**: "Request a Demo" or "See it in Action"
- **Supporting**: "15-minute personalized walkthrough"
- **Form**: Name, email, company, optional use case
- **Confirmation**: Calendar link or "We'll reach out within 24 hours"

### Newsletter Subscription
- **Primary**: "Subscribe" or "Get Updates"
- **Supporting**: Frequency and value ("Weekly insights on X")
- **Form**: Email only
- **Confirmation**: "Check your inbox to confirm"

### Social Proof Integration
- Place testimonials near CTAs
- Show customer logos above the fold
- Display metrics (users, companies, time saved)
- Use real names and photos when possible

### CTA Placement Rules
- Above the fold: Primary CTA visible without scrolling
- After value prop: CTA follows explanation of benefits
- End of page: Final CTA with urgency or recap
- Sticky header/footer: Persistent CTA on long pages (mobile especially)
