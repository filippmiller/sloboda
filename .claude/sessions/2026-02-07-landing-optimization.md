# Session Notes: Landing Page Conversion Optimization

**Date:** 2026-02-07
**Area:** Landing Page / Frontend
**Type:** feature
**Log Entry:** `.claude/agent-log.md` (entry at 2026-02-07)

## Context

User asked for the best improvement ideas for the project, with specific focus on the front page and what would make people send donations. Generated 30 ideas, critically evaluated each, kept 14, and implemented the top ones.

## What Was Done

### Phase 1: Analysis
- Deep exploration of full codebase (landing page, server, client, docs)
- Read concept doc, business plan, all landing page files
- Identified critical gap: site asks for donations but has zero payment processing
- Identified 14 high-confidence improvements from 30 candidates

### Phase 2: Implementation

#### 2a. Social Proof Counter
- Files: `src/index.html`, `src/script.js`
- Fetches from existing `/api/stats` endpoint on page load
- Shows "Уже с нами: N человек" next to CTA button
- Only visible when count >= 10 (matches server logic)
- Confidence: 95%

#### 2b. Sticky CTA Header
- Files: `src/index.html`, `src/styles.css`, `src/script.js`
- Uses IntersectionObserver on hero section (no scroll event listener = better perf)
- Appears when hero scrolls out of view
- Contains SLOBODA logo, Telegram link, and "Заявить о себе" CTA
- Dark translucent background with backdrop-filter blur
- Confidence: 85%

#### 2c. Floating Telegram Button
- Files: `src/index.html`, `src/styles.css`
- Fixed position bottom-right, Telegram brand blue (#2AABEE)
- SVG icon, subtle shadow, scale-on-hover
- Smaller on mobile (44px vs 48px)
- Confidence: 90%

#### 2d. FAQ Section
- Files: `src/index.html`, `src/styles.css`
- 5 questions addressing top objections: scam?, money?, failure?, relocate?, vs ecovillages?
- Uses native `<details>` elements (no JS needed, accessible)
- Custom +/- markers, clean accordion styling
- Confidence: 92%

#### 2e. Finance Transparency Section
- Files: `src/index.html`, `src/styles.css`
- Visual progress bars showing budget allocation
- 35% legal, 25% platform, 25% operations, 15% reserve
- CSS custom properties for bar width (--pct)
- Confidence: 88%

#### 2f. Founder Section
- Files: `src/index.html`, `src/styles.css`
- Phillip Miller, title, one-line bio, contact links
- Card layout matching existing design system
- No photo (fits the text-heavy, honest brand)
- Confidence: 87%

#### 2g. About Section Bullets
- Files: `src/index.html`, `src/styles.css`
- Replaced dense paragraph with 5 scannable bullet points
- Bold lead (НКО, Сообщество, База знаний, Коллективные решения, Реальный план)
- Italic note at bottom
- Confidence: 93%

#### 2h. Cost Tags on Support Items
- Files: `src/index.html`, `src/styles.css`
- Added specific ruble amounts: ~15,000₽ (НКО), ~30,000₽ (legal), ~5,000₽/мес (hosting), ~20,000₽ (knowledge base)
- Green Unbounded font, right-aligned
- Confidence: 90%

#### 2i. Progressive Form Disclosure
- Files: `src/index.html`, `src/styles.css`, `src/script.js`
- Step 1: Name + Email + "Продолжить" button (always visible)
- Step 2: Telegram, City, Skills, About, Donate, Privacy, Submit (hidden until step 1 validated)
- Validates name is non-empty and email passes regex before expanding
- Animated reveal with fadeIn keyframes
- Resets to step 1 on successful submission
- Confidence: 82%

#### 2j. SEO & Meta Improvements
- Files: `src/index.html`
- OG image meta tags (1200x630, waiting for actual image creation)
- Twitter card upgraded to summary_large_image
- JSON-LD Organization schema with founder, contact, sameAs
- Hero image preload link
- Confidence: 95-98%

#### 2k. Privacy Policy
- Files: `src/privacy.html` (new), `server/index.js`
- Russian language, references 152-FZ
- Covers: data collected, purposes, storage, rights, contact
- Clean URL `/privacy` route added to Express
- Link added to form checkbox and footer
- Confidence: 95%

## Technical Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| IntersectionObserver for sticky header | Better perf than scroll listeners, native API | scroll event + debounce |
| Native `<details>` for FAQ | Zero JS, accessible, progressive enhancement | Custom accordion with JS |
| CSS custom properties for finance bars | Clean, maintainable, no JS needed | JS-driven animation |
| 2-step form vs full progressive | Simpler to implement, clear UX boundary | Multi-step wizard with progress bar |
| No payment processing yet | Requires НКО registration (legal entity). Flagged as future priority. | YooKassa integration |

## Files Changed (Full List)

| File | Action | Description |
|------|--------|-------------|
| `src/index.html` | Modified | Major restructure with 6 new sections |
| `src/styles.css` | Modified | ~370 new lines of CSS for new components |
| `src/script.js` | Modified | 3 new features (counter, sticky, form expand) |
| `src/privacy.html` | Created | Privacy policy page |
| `server/index.js` | Modified | Added /privacy route |

## Ideas NOT Implemented (Deferred)

1. **Payment processing** — Blocked by НКО registration. This is the #1 priority once legal entity exists.
2. **Yandex Metrika** — Needs account setup by owner, not a code change.
3. **OG image creation** — Needs design tool, meta tags are in place waiting for the asset.
4. **A/B testing** — Needs traffic volume first.

## Gotchas & Notes for Future Agents

- The privacy policy references 152-FZ but the НКО isn't registered yet. Update when legal entity is formed.
- OG image meta tags point to `/og-image.png` — this file doesn't exist yet. Create a 1200x630 branded image.
- The social counter only shows when >= 10 registrations. If count is low, the hero shows just the CTA button.
- Progressive form: the "Продолжить" button validates name+email client-side before expanding. The submit button is in step 2.
- The sticky header hides the floating TG button conceptually (both visible at same time is fine — different positions).

---
