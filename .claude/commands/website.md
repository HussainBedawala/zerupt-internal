---
description: "Pick up a website issue from Linear and orchestrate the full website development workflow. Handles design, copy, build, review, and optional video generation."
---

You are the Zerupt website development orchestrator. You pick up one website-related Linear issue and walk through each phase. Pause after each phase for user approval before proceeding.

## PHASE 1: PICK ISSUE

Find the next website issue using this priority order:

1. Check for any "In Progress" issue with label `Website` in the Development team → resume it
2. Otherwise: look for issues in the Website project OR issues with `Website` label → first "Todo" or "New" issue (by priority ascending, then identifier number ascending)

**Issue status precedence:** Todo > New > Soon

Use Linear MCP: `list_projects` → `list_issues` (filter by project or label) → `get_issue` for full description.

Present a summary table:
- Issue: DEV-XX — Title
- Project/Label: Website
- Priority: Urgent/High/Medium/Low
- Labels: list
- Description: 2-3 line summary
- Type: New page / Edit / Component / Content / Bug fix

Ask: "Start this issue? (yes / skip / pick different)"

If yes → `save_issue` to set status "In Progress"

## PHASE 2: BRANCH

**IMPORTANT:** Website code lives in `erp/apps/website/` (part of the zerupt-erp monorepo). Always run git commands from the `erp/` directory.

Branch format: `website/<DEV-XX>-<short-kebab-description>`

Examples:
- `website/DEV-45-hero-section`
- `website/DEV-46-waitlist-form`
- `website/DEV-47-blog-system`

Run: `cd /Users/hus3ain/Development/Zerupt/erp && git checkout -b <branch>`

If `apps/website/` doesn't exist yet, note this and inform the user that the website app needs to be initialized first (scaffold with Next.js in the monorepo).

Confirm the branch was created with `git branch`. Ask: "Branch created. Continue?"

## PHASE 3: READ CONTEXT

Read these files for context:

| File | Purpose |
|------|---------|
| `agent-os/product/mission.md` | Product positioning, target audience |
| `agent-os/content-style-guide.md` | Voice, tone, messaging guidelines |
| `agent-os/build-in-public-plan.md` | Landing page specs, launch timeline |
| `agent-os/design-system/` | Design tokens, colors, typography |
| `erp/apps/website/` | Existing pages, components, structure |
| `erp/apps/website/.stitch/DESIGN.md` | Stitch design system (if exists) |
| `erp/apps/website/.stitch/SITE.md` | Site vision, sitemap, roadmap (if exists) |
| `erp/packages/ui/` | Shared UI components (can be used by website) |

Summarize what's relevant to this specific issue. Ask: "Context reviewed. Additional context? (continue / add context)"

## PHASE 4: FETCH DOCS

Scan the issue for external packages. Common website packages:
- Next.js (app router, routing, metadata)
- Tailwind CSS (styling, responsive)
- GSAP (animations, ScrollTrigger)
- Lenis (smooth scroll)
- shadcn/ui (components)
- Remotion (video generation)

For each relevant package, use context7 MCP:
1. `resolve-library-id` with the package name + task-specific query
2. `query-docs` with the exact task — be specific

Fetch in parallel when possible. Only fetch what's directly needed for this issue.

Tell the user: "Docs fetched for: [package list]. Continue to design?"

## PHASE 5: DESIGN

Determine the design path based on the issue type:

### Path A: Stitch-first (new pages, major sections)

1. **Check for DESIGN.md**: Read `erp/apps/website/.stitch/DESIGN.md`
   - If missing: invoke the `stitch-design-md` skill to create it from an existing screen
   
2. **Enhance the prompt**: Invoke the `stitch-enhance-prompt` skill
   - Transform the issue description into a Stitch-optimized prompt
   - Include the design system block from DESIGN.md
   
3. **Generate via Stitch MCP**: Call `generate_screen_from_text`
   - Use the project ID from `erp/apps/website/.stitch/metadata.json`
   - If no project exists, create one first
   
4. **Download assets**: Save to `erp/apps/website/.stitch/designs/`
   - `{page}.html` — generated HTML
   - `{page}.png` — screenshot for reference
   
5. **Visual review**: Compare against brand guidelines

### Path B: Code-first (edits, components, small changes)

1. **Invoke frontend-design skill**: Read and follow `.claude/skills/frontend-design/SKILL.md`
2. **Reference design tokens**: Use values from `agent-os/design-system/`
3. **Build component directly**: Skip Stitch for small, targeted changes

Ask: "Design approach: [Stitch-first / Code-first]. Proceed? (yes / switch approach)"

## PHASE 6: COPY

1. **Invoke content-engine skill**: Read `.claude/skills/content-engine/SKILL.md`
   - Use the enhanced SEO patterns section for website content
   
2. **Extract key messages**: From product specs and issue description
   
3. **Generate copy** following content style guide:
   - Headlines (H1, H2s)
   - Body text
   - CTAs
   - Meta title and description
   
4. **SEO optimization**:
   - Primary keyword in H1, first paragraph, meta
   - Secondary keywords in H2s, body
   - Alt text for images
   
5. **Structured data**: Prepare JSON-LD schema for the page type

Present the copy for review. Ask: "Copy ready. Approve? (yes / revise)"

## PHASE 7: BUILD

1. **Convert to Next.js** (if Stitch-generated):
   - Transform HTML to React components
   - Use `stitch-react-components` skill for complex conversions
   
2. **Apply design tokens**:
   - Colors from CSS variables
   - Typography from brand fonts
   - Spacing from design system
   
3. **Add animations** (for scroll-driven pages):
   - GSAP ScrollTrigger for section reveals
   - Lenis for smooth scroll
   - Follow `video-to-website` skill patterns
   
4. **Write Playwright E2E tests**:
   - Visual regression (screenshot comparison)
   - Form submissions (waitlist, contact)
   - Navigation flows
   - Responsive breakpoints (320px, 768px, 1024px, 1440px)

Run tests: `pnpm --filter @zerupt/website test:e2e` (or equivalent)

Ask: "Build complete. Tests passing? (continue / fix issues)"

## PHASE 8: REVIEW

Invoke the `website-review` skill. Run through all checklists:

### SEO Audit
- [ ] Title tag (50-60 chars, keyword)
- [ ] Meta description (150-160 chars)
- [ ] Single H1 with keyword
- [ ] Heading hierarchy (no skipped levels)
- [ ] Image alt text
- [ ] JSON-LD schema
- [ ] Internal links

### Accessibility Audit
- [ ] Color contrast (4.5:1 minimum)
- [ ] Keyboard navigation
- [ ] Focus indicators
- [ ] Alt text for images
- [ ] ARIA labels where needed

### Performance Audit
- [ ] Lighthouse score > 90 (all categories)
- [ ] Images optimized (WebP, lazy loading)
- [ ] Fonts preloaded
- [ ] No render-blocking resources

### Copy Review
- [ ] Tone matches content-style-guide.md
- [ ] CTAs clear and actionable
- [ ] No grammar/spelling errors
- [ ] Mobile-friendly line lengths

### Brand Consistency
- [ ] Colors match design tokens
- [ ] Typography matches brand fonts
- [ ] Logo usage correct

Document findings. Fix all issues before proceeding.

Ask: "Review complete. All checks passing? (continue / fix issues)"

## PHASE 9: VERIFY

Run verification checks:

1. `pnpm --filter @zerupt/website build` — production build
2. `pnpm --filter @zerupt/website lint` — linting
3. `pnpm --filter @zerupt/website test` — unit tests
4. `pnpm --filter @zerupt/website test:e2e` — E2E tests
5. Lighthouse audit (target: 90+ all categories)
6. `git status` — confirm no unintended files

Do not proceed until all checks pass.

## PHASE 10: VIDEO (OPTIONAL)

**Always ask the user:**

> "Would you like to create a walkthrough video for this page using Remotion?
>
> **My recommendation:** [Provide context-aware recommendation]
>
> - For **landing pages / hero sections**: Recommended — great for social media teasers
> - For **feature pages**: Recommended — helps explain complex features visually
> - For **blog / docs / changelog**: Not recommended — static content doesn't benefit much
> - For **minor updates / bug fixes**: Not recommended — not worth the effort
>
> (yes / no)"

### If yes:

1. **Invoke stitch-remotion skill**: Read `.claude/skills/stitch-remotion/SKILL.md`

2. **Gather screenshots**:
   - From `erp/apps/website/.stitch/designs/` (if Stitch-generated)
   - Or take new screenshots of the built page

3. **Create screens.json manifest**:
   ```json
   {
     "projectName": "Zerupt Website",
     "screens": [
       {
         "id": "1",
         "title": "Hero Section",
         "description": "Main landing page hero",
         "imagePath": "assets/screens/hero.png",
         "duration": 4
       }
     ]
   }
   ```

4. **Generate Remotion components**:
   - `ScreenSlide.tsx` — individual screen display
   - `WalkthroughComposition.tsx` — main composition

5. **Preview in Remotion Studio**: `npm run dev` in video directory

6. **Render final video**: `npx remotion render WalkthroughComposition output.mp4`

7. **Save to content folder**: `content/videos/`

8. **Create Marketing issue** for the video content

### If no:

Continue to PHASE 11 without video generation.

## PHASE 11: COMMIT + SYNC

**Commit rules:**
- Stage specific files only — never `git add .`
- Commit message subject MUST be all lowercase (commitlint enforces)
- Quote paths with brackets: `git add "src/app/[locale]/page.tsx"`

**Commit format:**
```
<type>(website): <lowercase description>

- bullet point details
- what was added/changed and why

Closes DEV-XX
```

Types: feat (new page/feature), fix (bug), refactor, style, docs, chore

**Push:** `git push -u origin <branch>`

**Linear sync:**
- `save_issue` → set status to "Done"
- `save_comment` on the issue with: commit hash, files changed, Lighthouse scores, notes

## PHASE 12: CONTENT CHECK

Check if the issue is content-worthy for Instagram/X:
- Shipped a visible page users will see?
- Hit a website milestone?
- Good "build in public" moment?
- Created a video in Phase 10?

If yes: read `agent-os/content-style-guide.md` → create issue in Linear **Marketing** team with:
- Labels: `dev-triggered` + `website` + relevant format + platform
- Description: what was shipped, screenshots, why it matters

If not content-worthy: skip silently.

## PHASE 13: NEXT PREP

1. Move the next logical website issue to "Todo" status in Linear
2. Ask: "DEV-XX done. Next website issue? (yes / done for today)"
   - If yes → restart from PHASE 1
   - If done → run `/learn-eval` to extract session patterns

---

## Skills Reference

| Skill | Purpose | When to Use |
|-------|---------|-------------|
| `stitch-design-md` | Create DESIGN.md from existing Stitch screen | First time setup, design system extraction |
| `stitch-enhance-prompt` | Optimize prompts for Stitch generation | Before any Stitch generation |
| `stitch-react-components` | Convert Stitch HTML to React | After Stitch generation |
| `stitch-loop` | Iterative autonomous website building | Multi-page generation sessions |
| `stitch-remotion` | Generate walkthrough videos | Phase 10 video creation |
| `shadcn-ui` | shadcn/ui component integration | Adding UI components |
| `frontend-design` | Distinctive UI design patterns | All frontend work |
| `video-to-website` | Scroll-driven animated websites | Hero sections, product pages |
| `content-engine` | Marketing copy + SEO patterns | Phase 6 copy generation |
| `website-review` | Quality assurance checklist | Phase 8 review |
| `nano-banana-images` | AI image generation via Kie.ai | Custom imagery needs |

---

## Quick Reference

**Branch format:** `website/<DEV-XX>-<description>`

**Commit format:** `<type>(website): <lowercase description>`

**Lighthouse targets:** 90+ all categories

**Key directories:**
- `erp/apps/website/` — Next.js website code (in monorepo)
- `erp/apps/website/.stitch/` — Stitch project files
- `erp/apps/website/.stitch/designs/` — Downloaded Stitch assets
- `erp/packages/ui/` — Shared UI components
- `content/videos/` — Remotion output (in root repo)
