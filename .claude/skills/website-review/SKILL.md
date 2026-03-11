---
name: website-review
description: Comprehensive website quality assurance checklist covering SEO, accessibility, performance, copy, and brand consistency. Use after building or updating website pages to ensure production readiness.
---

# Website Review Skill

A systematic checklist for reviewing websites before deployment. Run through each section and document findings.

## When to Activate

- After completing a new page or section
- Before merging website PRs
- During periodic site audits
- When investigating SEO or performance issues

## Review Process

Work through each section sequentially. For each item:
- ✅ Pass — meets the requirement
- ⚠️ Warning — minor issue, should fix
- ❌ Fail — critical issue, must fix before deploy

---

## 1. SEO Audit

### Meta Tags

| Check | Requirement |
|-------|-------------|
| Title tag | Present, 50-60 characters, contains primary keyword |
| Meta description | Present, 150-160 characters, contains keyword and CTA |
| OG title | Present, optimized for social sharing |
| OG description | Present, compelling for social clicks |
| OG image | Present, 1200x630px minimum, branded |
| Twitter card | `summary_large_image` for visual pages |
| Canonical URL | Present, points to correct URL |
| Viewport meta | `width=device-width, initial-scale=1` |

### Heading Structure

| Check | Requirement |
|-------|-------------|
| Single H1 | Exactly one H1 per page |
| H1 contains keyword | Primary keyword in H1 |
| Logical hierarchy | No skipped levels (H1 → H2 → H3) |
| H2s are descriptive | Each H2 targets a keyword or question |

### Content & Keywords

| Check | Requirement |
|-------|-------------|
| First paragraph | Contains primary keyword naturally |
| Keyword density | 1-2% for primary, not stuffed |
| Image alt text | All images have descriptive alt text |
| Internal links | 2-5 relevant internal links per page |
| Anchor text | Descriptive, not "click here" |
| External links | Open in new tab, have `rel="noopener"` |

### Technical SEO

| Check | Requirement |
|-------|-------------|
| Sitemap.xml | Present, includes all public pages |
| Robots.txt | Present, allows crawling of public pages |
| JSON-LD schema | Appropriate schema for page type |
| URL structure | Clean, lowercase, hyphens not underscores |
| No duplicate content | Canonical tags prevent duplicates |
| 404 page | Custom 404 with navigation back to site |

---

## 2. Accessibility Audit (WCAG 2.1 AA)

### Perceivable

| Check | Requirement |
|-------|-------------|
| Color contrast | 4.5:1 for normal text, 3:1 for large text |
| Text not in images | Key content is real text, not images |
| Alt text | All meaningful images have alt text |
| Decorative images | Use `alt=""` or CSS background |
| Video captions | Videos have captions or transcripts |
| Audio descriptions | Complex visuals have text alternatives |

### Operable

| Check | Requirement |
|-------|-------------|
| Keyboard navigation | All interactive elements reachable via Tab |
| Focus indicators | Visible focus ring on all focusable elements |
| Skip link | "Skip to main content" link for keyboard users |
| No keyboard traps | Can Tab out of all components |
| Touch targets | Minimum 44x44px on mobile |
| No auto-play | Media doesn't auto-play with sound |

### Understandable

| Check | Requirement |
|-------|-------------|
| Language attribute | `<html lang="en">` (or appropriate language) |
| Error identification | Form errors clearly identified |
| Error suggestions | Helpful error messages with fix suggestions |
| Consistent navigation | Same nav structure across pages |
| Labels | All form inputs have visible labels |

### Robust

| Check | Requirement |
|-------|-------------|
| Valid HTML | No parsing errors in HTML |
| ARIA usage | ARIA used correctly, not overused |
| Name/role/value | Custom components have proper ARIA |
| Landmark regions | `<main>`, `<nav>`, `<header>`, `<footer>` used |

### Testing Tools

Run these tools and address all critical issues:
- **axe DevTools** (browser extension)
- **Lighthouse Accessibility** (Chrome DevTools)
- **WAVE** (web accessibility evaluation tool)
- **Manual keyboard testing** (Tab through entire page)

---

## 3. Performance Audit (Core Web Vitals)

### Core Web Vitals Targets

| Metric | Target | Tool |
|--------|--------|------|
| LCP (Largest Contentful Paint) | < 2.5s | Lighthouse |
| FID (First Input Delay) | < 100ms | Field data |
| CLS (Cumulative Layout Shift) | < 0.1 | Lighthouse |
| INP (Interaction to Next Paint) | < 200ms | Field data |

### Image Optimization

| Check | Requirement |
|-------|-------------|
| Format | WebP or AVIF for photos, SVG for icons |
| Sizing | Responsive images with `srcset` |
| Lazy loading | Below-fold images use `loading="lazy"` |
| Dimensions | Width/height attributes prevent CLS |
| Compression | Images optimized (TinyPNG, Squoosh) |

### Font Loading

| Check | Requirement |
|-------|-------------|
| Font display | `font-display: swap` or `optional` |
| Preload critical | `<link rel="preload">` for above-fold fonts |
| Subset fonts | Only include needed character sets |
| System fallbacks | Good fallback stack defined |

### JavaScript & CSS

| Check | Requirement |
|-------|-------------|
| Bundle size | JS < 200KB gzipped for initial load |
| Code splitting | Route-based or component-based splitting |
| Tree shaking | Unused code eliminated |
| Critical CSS | Above-fold CSS inlined or preloaded |
| Async/defer | Non-critical scripts use async or defer |

### Server & Caching

| Check | Requirement |
|-------|-------------|
| HTTPS | All resources served over HTTPS |
| Compression | Gzip or Brotli enabled |
| Cache headers | Static assets have long cache TTL |
| CDN | Static assets served from CDN |
| HTTP/2 or HTTP/3 | Modern protocol enabled |

### Testing Process

1. Run Lighthouse in Incognito (no extensions)
2. Test on throttled connection (Slow 3G)
3. Test on mobile device or emulator
4. Check PageSpeed Insights for field data
5. Target: 90+ score in all Lighthouse categories

---

## 4. Copy Review

### Tone & Voice

| Check | Requirement |
|-------|-------------|
| Matches brand | Consistent with content-style-guide.md |
| Appropriate formality | Matches audience expectations |
| Active voice | Prefer active over passive |
| Jargon-free | Technical terms explained or avoided |
| Consistent terminology | Same terms used throughout |

### Clarity & Readability

| Check | Requirement |
|-------|-------------|
| Scannable | Short paragraphs, bullet points, subheadings |
| Line length | 50-75 characters per line |
| Reading level | Appropriate for target audience |
| No filler | Every sentence adds value |
| Specific > vague | Concrete details, not generic claims |

### CTAs

| Check | Requirement |
|-------|-------------|
| Clear action | User knows exactly what happens on click |
| Benefit-focused | CTA text emphasizes value |
| Visible | CTAs stand out visually |
| Consistent | Same CTA style throughout site |
| Urgency (if appropriate) | Scarcity or time-sensitivity when genuine |

### Grammar & Spelling

| Check | Requirement |
|-------|-------------|
| No typos | Run spell check, manual review |
| Consistent punctuation | Oxford comma, em dashes, etc. |
| Proper capitalization | Sentence case for headings (unless brand style differs) |
| No broken sentences | All sentences complete |

### Localization (if applicable)

| Check | Requirement |
|-------|-------------|
| RTL support | Layout works for Arabic/Hebrew |
| Date formats | Localized date/time formats |
| Currency | Correct currency symbols and formatting |
| No hardcoded strings | All text in translation files |

---

## 5. Brand Consistency

### Visual Identity

| Check | Requirement |
|-------|-------------|
| Colors | Match design tokens exactly |
| Typography | Correct fonts, weights, sizes |
| Spacing | Follows design system spacing scale |
| Logo usage | Correct version, clear space, no distortion |
| Iconography | Consistent icon style and sizing |

### Design System Compliance

| Check | Requirement |
|-------|-------------|
| Component usage | Using design system components |
| No one-offs | Custom styles justified and documented |
| Responsive behavior | Matches design system breakpoints |
| Dark mode (if applicable) | Colors invert correctly |

### Photography & Imagery

| Check | Requirement |
|-------|-------------|
| Style consistency | Photos match brand aesthetic |
| Quality | High resolution, not pixelated |
| Diversity | Inclusive representation |
| Licensing | All images properly licensed |

---

## 6. Functional Testing

### Forms

| Check | Requirement |
|-------|-------------|
| Validation | Client and server-side validation |
| Error states | Clear, helpful error messages |
| Success states | Confirmation after submission |
| Required fields | Clearly marked |
| Autofill | Works with browser autofill |

### Navigation

| Check | Requirement |
|-------|-------------|
| All links work | No 404s or broken links |
| Mobile menu | Works on touch devices |
| Breadcrumbs | Accurate and clickable |
| Footer links | All functional |

### Cross-Browser

| Check | Requirement |
|-------|-------------|
| Chrome | Latest version |
| Firefox | Latest version |
| Safari | Latest version |
| Edge | Latest version |
| Mobile Safari | iOS latest |
| Chrome Android | Android latest |

### Responsive

| Check | Requirement |
|-------|-------------|
| Mobile (320px) | No horizontal scroll, readable |
| Tablet (768px) | Layout adapts appropriately |
| Desktop (1024px+) | Full layout, no wasted space |
| Large screens (1440px+) | Content doesn't stretch too wide |

---

## Review Report Template

After completing the review, document findings:

```markdown
# Website Review: [Page Name]
Date: [YYYY-MM-DD]
Reviewer: [Name]

## Summary
- Total checks: X
- Passed: X
- Warnings: X
- Failed: X

## Critical Issues (Must Fix)
1. [Issue description] — [Section] — [How to fix]

## Warnings (Should Fix)
1. [Issue description] — [Section] — [How to fix]

## Recommendations (Nice to Have)
1. [Suggestion]

## Lighthouse Scores
- Performance: X
- Accessibility: X
- Best Practices: X
- SEO: X
```

---

## Quick Checklist (Pre-Deploy)

Essential checks before any deploy:

- [ ] Title and meta description present
- [ ] Single H1 with keyword
- [ ] All images have alt text
- [ ] Keyboard navigation works
- [ ] Color contrast passes
- [ ] Lighthouse performance > 90
- [ ] All links work
- [ ] Forms submit correctly
- [ ] Mobile layout works
- [ ] No console errors
