# Session Notes: World-Class UI/UX Overhaul

**Date:** 2026-02-07 21:00
**Area:** UI/UX / Design System / Components / Layouts / Pages
**Type:** feature
**Log Entry:** `.claude/agent-log.md` (entry at 2026-02-07 21:00)
**Beads:** derevnya-cz8 (closed)

## Context

User requested a comprehensive "Stripe-level" UI/UX overhaul of the SLOBODA React platform. The existing app was functional with consistent design tokens but had flat aesthetics — no micro-interactions, no depth, no visual sophistication. Every page used basic Card, Button, Input, and Modal components with bare Tailwind classes.

Aesthetic direction: **Refined Dark Luxury** — Linear.app meets Stripe Dashboard. Deep blacks with warm amber/ember accent glow effects, subtle noise texture, sophisticated shadows, buttery smooth animations, and typography that breathes.

## What Was Done

### Phase 1: Foundation — Motion + Design Tokens
- Files: `client/package.json`, `client/src/index.css`
- Installed `motion` (framer-motion) package
- Extended @theme with: `--color-accent-glow`, `--color-accent-soft`, `--shadow-card`, `--shadow-card-hover`
- Added animation keyframes: `fade-in`, `shimmer`, `glow-pulse`, `shake`
- Added CSS noise texture overlay utility (`.noise-overlay` with SVG feTurbulence)
- Styled Sonner toasts to match dark theme with custom CSS variables

### Phase 2: Core Components
- **Button** (`Button.tsx`): Gradient background (from-accent to-darker), hover lift (-1px) + glow shadow, active press-down, shimmer loading state replacing spinner, focus-visible keyboard ring
- **Input** (`Input.tsx`): Warm glow border on focus (`box-shadow: 0 0 0 3px accent-glow`), label color transition (muted → accent), shake animation on error, new `icon` prop for input groups
- **Card** (`Card.tsx`): Multi-layer shadow, 4 variants (`default`, `interactive`, `highlighted`, `glass`), hover lift + shadow deepening for interactive, noise texture overlay
- **Modal** (`Modal.tsx`): Motion AnimatePresence + motion.div for scale/fade enter/exit, deeper backdrop blur (`backdrop-blur-md`), glow shadow
- **Skeleton** (`Skeleton.tsx`): New component — shimmer gradient sweep (not pulse), variants: line/circle/card/text-block, SkeletonCard composite
- **Badge** (`Badge.tsx`): New component — 5 color variants (default/success/warning/danger/info), optional dot indicator with pulse animation

### Phase 3: Layout Upgrades
- **AuthLayout**: Animated gradient mesh background (two radial gradients with glow-pulse), glass morphism card (backdrop-blur-lg, white/6% border), staggered content reveal with Motion, letter-spaced logo
- **DashboardLayout**: Gradient sidebar (from-bg-card to-bg), accent line divider, animated active indicator bar (3px, slides between items via Motion `layoutId`), icon hover scale, notification badge pulse, mobile hamburger with slide-in drawer + overlay, page transitions via AnimatePresence on Outlet
- **AdminLayout**: Matching sidebar treatment, shield icon with glow shadow, skeleton loading state replacing Loader2, responsive mobile drawer, page transitions

### Phase 4: Key Pages
- **Login**: Staggered form field reveals (80ms delay between items using Motion custom variants), animated mode switch between password/magic-link, bounce checkmark on magic link success, icon props on inputs
- **Dashboard**: AnimatedNumber count-up (600ms cubic easeOut), staggered card entrance, icon glow shadows matching their accent color, SkeletonCard loading
- **News**: Staggered card reveals, shimmer SkeletonCard loading, golden glow on pinned posts (amber-400 with drop-shadow), Badge component for categories
- **Library**: Staggered grid entrance, AnimatePresence for expandable card body (height animation), glow on active filter pills, SkeletonCard grid

### Phase 5: Bug Fixes (Pre-existing)
- Fixed unused imports in `Campaigns.tsx` (CheckCircle2, Clock)
- Fixed Recharts Tooltip formatter type in `Finance.tsx` (value: number → value as number)

## Technical Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| `motion/react` import path | New package name for framer-motion v12+ | `framer-motion` (deprecated import) |
| `as const` on ease arrays | Motion's Variants type requires tuple not number[] | Type assertion, explicit type annotation |
| Noise texture via CSS SVG | No external assets needed, infinitely tileable | PNG texture file, CSS repeating-conic-gradient |
| `layoutId` for active indicator | Automatic interpolation between positions | Manual `translateY` calculation |
| Glass morphism on AuthLayout | Atmospheric depth, premium feel | Solid card, border-only |
| Sidebar gradient | Subtle depth separation from content area | Solid bg-card, border-only |
| AnimatePresence on Outlet | Page transitions without wrapper component | Separate PageTransition wrapper |

## Files Changed (Full List)

| File | Action | Description |
|------|--------|-------------|
| `client/package.json` | Modified | Added `motion` dependency |
| `client/package-lock.json` | Modified | Lock file updated |
| `client/src/index.css` | Modified | Extended tokens, keyframes, noise texture, Sonner toast theme |
| `client/src/components/ui/Button.tsx` | Modified | Gradient, glow, lift, press, shimmer loading |
| `client/src/components/ui/Input.tsx` | Modified | Glow focus, label transition, shake error, icon prop |
| `client/src/components/ui/Card.tsx` | Modified | Shadow layers, hover lift, 4 variants, noise overlay |
| `client/src/components/ui/Modal.tsx` | Modified | Motion enter/exit, blur, scale, glow shadow |
| `client/src/components/ui/Skeleton.tsx` | Created | Shimmer loading placeholders with card variant |
| `client/src/components/ui/Badge.tsx` | Created | Status badges with 5 color variants, pulse dot |
| `client/src/components/PageTransition.tsx` | Created | Animated page wrapper (used as reference) |
| `client/src/layouts/AuthLayout.tsx` | Modified | Gradient mesh bg, glass card, stagger |
| `client/src/layouts/DashboardLayout.tsx` | Modified | Sliding indicator, mobile drawer, page transitions |
| `client/src/layouts/AdminLayout.tsx` | Modified | Match DashboardLayout polish, shield glow, mobile |
| `client/src/pages/auth/Login.tsx` | Modified | Staggered reveals, mode animation, glow effects |
| `client/src/pages/user/Dashboard.tsx` | Modified | Count-up, stagger, glow icons, skeletons |
| `client/src/pages/user/News.tsx` | Modified | Stagger, skeleton, badges, golden pin glow |
| `client/src/pages/user/Library.tsx` | Modified | Stagger, expand animation, glow filters |
| `client/src/pages/user/Finance.tsx` | Modified | Fixed Recharts formatter type |
| `client/src/pages/admin/Campaigns.tsx` | Modified | Fixed unused imports |

## Functions & Symbols

| Symbol | File | Action | Description |
|--------|------|--------|-------------|
| `Skeleton` | Skeleton.tsx | New | Shimmer loading placeholder component |
| `SkeletonCard` | Skeleton.tsx | New | Composite card-shaped skeleton |
| `Badge` | Badge.tsx | New | Status badge with color variants + pulse dot |
| `PageTransition` | PageTransition.tsx | New | Motion wrapper for page fade+slide |
| `AnimatedNumber` | Dashboard.tsx | New | Count-up animation using requestAnimationFrame |
| `staggerItem` (variants) | Login/Dashboard/News/Library.tsx | New | Motion variants for staggered entrance |
| `Button` | Button.tsx | Modified | Gradient, multi-state shadows, shimmer loading |
| `Input` | Input.tsx | Modified | Glow focus, label transition, icon prop, shake |
| `Card` | Card.tsx | Modified | 4 variants, noise overlay, shadow system |
| `Modal` | Modal.tsx | Modified | Motion enter/exit with AnimatePresence |
| `AuthLayout` | AuthLayout.tsx | Modified | Gradient mesh, glass morphism, stagger |
| `DashboardLayout` | DashboardLayout.tsx | Modified | layoutId indicator, mobile drawer, transitions |
| `AdminLayout` | AdminLayout.tsx | Modified | Matching sidebar, shield glow, mobile, skeleton |

## Database Impact

No database impact.

## Testing

- [x] TypeScript compiles without errors (`tsc -b` clean)
- [x] Vite production build succeeds (33.6s, all chunks generated)
- [ ] Manual visual verification (pending — deploy auto-triggers on Railway)
- [ ] Mobile viewport testing (pending)

## Commits

- `60f3628` — feat(ui): premium UI/UX overhaul with motion animations and refined dark theme

## Gotchas & Notes for Future Agents

1. **Motion import path**: Use `motion/react` not `framer-motion`. The `motion` npm package is the modern distribution.
2. **ease tuple typing**: When using `ease: [0.4, 0, 0.2, 1]` in Motion Variants, you MUST append `as const` or TypeScript will reject it (`number[]` vs `[number, number, number, number]`).
3. **Radix Dialog + Motion**: To animate Radix Dialog, use `forceMount` on Portal, `asChild` on Overlay/Content, and wrap children in `motion.div`. AnimatePresence must wrap the conditional render keyed on `open`.
4. **layoutId sidebar**: The sliding active indicator uses `layoutId="sidebar-active"` (dashboard) and `layoutId="admin-sidebar-active"` (admin). If these share the same layout context, items could animate between sidebars — keep them separate.
5. **Card noise overlay**: The `.noise-overlay` CSS class uses `::before` pseudo-element at z-index 1, with children at z-index 2. This means Card children need `position: relative` to stack above the noise — the class handles this via `.noise-overlay > * { position: relative; z-index: 2; }`.
6. **Pre-existing errors fixed**: Campaigns.tsx had unused imports (CheckCircle2, Clock) and Finance.tsx had a Recharts Tooltip formatter type mismatch. Both fixed opportunistically.

---
