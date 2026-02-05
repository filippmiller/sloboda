# SLOBODA Hero Page Design

**Date**: 2026-02-05
**Status**: Implemented (v1)
**Location**: `src/index.html`, `src/styles.css`, `src/script.js`

---

## Design Philosophy

### Target Audience
- Smart realists who understand AI will disrupt the job market
- People thinking one step ahead about urban exodus
- Those seeking Plan B, not get-rich schemes

### Tone
**"Honest Conversation"** — neither fear-mongering nor sugar-coating. We acknowledge uncertainty but offer practical preparation.

### Key Differentiators from Competitors
- Not selling land (yet) — building a founding community
- Values-driven, not profit-driven messaging
- Personal founder commitment (Philip Miller as the face)
- Two participation paths: community members AND co-investors

---

## Page Structure

### Section 1: Hero (Full-screen)
**Background**: Rural landscape photo with glassmorphism overlay
**Rotating slogans** (5-second intervals):

```
RU:
1. "Что невозможно одному — возможно вместе"
2. "AI заменит бухгалтеров, юристов, программистов. Что будет с городами?"
3. "Умный человек не ждёт кризиса. Умный человек имеет План Б."
4. "Мы не продаём мечты. Мы строим реальность вместе."
5. "Города дорогие, потому что там работа. Уберите работу — зачем город?"

EN:
1. "What's impossible alone — is possible together"
2. "AI will replace accountants, lawyers, programmers. What happens to cities?"
3. "A smart person doesn't wait for crisis. A smart person has Plan B."
4. "We don't sell dreams. We build reality together."
5. "Cities are expensive because of jobs. Remove jobs — why the city?"
```

**Subtitle**: "Проект для реалистов, которые думают на шаг вперёд"

**Two CTAs**:
- Primary: "Стать частью сообщества" (Join the community)
- Secondary: "Стать соинвестором" (Become a co-investor)

### Section 2: Thesis (Why this project exists)
Three cards explaining the macro thesis:
1. **AI меняет всё** — Job displacement
2. **Города станут дорогими** — Urban exodus
3. **Возвращение к земле** — Rural migration

### Section 3: Founder
Personal statement from Philip Miller:
- Inspired by collective action
- Seeking like-minded people
- Human values over money

### Section 4: Values
Six value cards:
1. Демократия (Democracy)
2. Уважение (Respect)
3. Прозрачность (Transparency)
4. Реализм (Realism)
5. Общее дело (Common cause)
6. Свобода (Freedom)

### Section 5: Who We're Looking For
Six roles:
1. Farmers & agronomists
2. Builders
3. Lawyers
4. Scouts (land evaluation)
5. Co-investors
6. Storytellers (marketing)

### Section 6: Registration Form
**6-step qualification form**:

1. **Basic Info**: Name, Email, Telegram, Location
2. **Motivation**: Why interested? (AI concern / countryside / investment / philosophy / all)
3. **Participation Type**: Community / Investor / Both / Observer
4. **Skills**: Multi-select (farming, construction, legal, finance, IT, marketing, scouting, connections)
5. **Investor Details** (conditional): Budget range, Timeline
6. **Final**: About yourself, Newsletter consent, Privacy consent

**Progress indicator**: Visual bar + step counter

### Section 7: Footer
- Brand tagline
- Telegram link
- Contact link

---

## Technical Implementation

### Stack
- Pure HTML/CSS/JS (no framework)
- Google Fonts: Cormorant Garamond (display), Onest (body)
- CSS Variables for theming
- Glassmorphism design system

### Features
- **Language switcher**: RU/EN with data attributes
- **Slogan rotation**: 5-second interval animation
- **Form navigation**: Multi-step with validation
- **Conditional logic**: Investor step shown only if relevant
- **Scroll animations**: Intersection Observer for reveal effects
- **Success modal**: After form submission

### Files
```
src/
├── index.html    # Page structure + all content
├── styles.css    # Full styling + animations
└── script.js     # Interactivity + form logic
```

---

## Visual Design

### Color Palette
```css
--color-bg: #0a0f0d          /* Deep forest */
--color-bg-light: #141a17    /* Card backgrounds */
--color-text: #e8ebe9        /* Primary text */
--color-text-muted: #9ca89f  /* Secondary text */
--color-accent: #7cb586      /* Green accent */
--color-accent-warm: #c4a574 /* Gold accent */
```

### Typography
- **Display**: Cormorant Garamond (serif, elegant, trustworthy)
- **Body**: Onest (modern sans-serif, readable)

### Effects
- Glassmorphism cards (blur + transparency)
- Grain overlay for texture
- Staggered scroll animations
- Hover state transitions

---

## Next Steps

### Immediate
- [ ] Add real hero background image/video
- [ ] Add Philip's actual photo
- [ ] Connect form to backend (Supabase or similar)
- [ ] Set up Telegram bot integration
- [ ] Create privacy policy page

### Future
- [ ] Dashboard for registered users
- [ ] News/updates section
- [ ] Video embeds from YouTube
- [ ] Analytics integration

---

## Competitor Research Summary

| Project | Model | Key Takeaway |
|---------|-------|--------------|
| [Мой Гектар](https://moigektar.ru/) | Cooperative plots | "One hectare for every Russian" — scale messaging |
| [Поселения.ру](https://poselenia.ru/) | Eco-settlement portal | Community map, artisan marketplace |
| [Fortitude Ranch](https://fortituderanch.com/) | Survival community | "Prepare for worst, enjoy present" — dual benefit |
| [AcreTrader](https://acretrader.com/) | Farmland investment | "Simplified" — removing complexity |

**Our differentiation**: We're not selling land or memberships yet. We're building a founding community first, with democratic governance and shared values.
