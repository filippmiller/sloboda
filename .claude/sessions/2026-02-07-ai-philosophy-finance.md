# Session Notes: AI Philosophy Messaging & Financial Transparency System

**Date:** 2026-02-07 16:00
**Area:** Landing Page / User Portal / Admin Panel / Backend / Database
**Type:** feature
**Log Entry:** `.claude/agent-log.md` (entry at 2026-02-07 16:00)

## Context

User requested two interconnected features:
1. **AI Philosophy Messaging** — Position SLOBODA as "futurist-realists" who embrace AI, not fear it. The project openly uses AI networks for everything.
2. **Financial Transparency System** — Every donor (even 100 RUB) gets access to see all income and expenses. Full open-books approach.

A 20-iteration brainstorm with 5 team members (Product Designer, Frontend Dev, Backend Dev, UX Writer, Community Manager) was conducted before implementation.

## What Was Done

### Landing Page — AI Philosophy
- Added subtle green AI badge above hero title: "Строится с помощью ИИ-сетей" with pulse animation
- Updated hero text to mention AI and transparency
- Created new "Футуристы-реалисты" section with 4 numbered manifesto cards between Reality and About sections
- Cards cover: AI reality acceptance, building with neural networks, futurist-realist identity, financial transparency principle

### Landing Page — Live Finance Counter
- Added live finance widget to the Transparency section
- Shows: Total raised, Total spent, Balance (fetched from public API)
- "LIVE" indicator with pulse animation
- CTA linking to login for full report
- Graceful degradation: shows dashes if API unavailable

### Backend — Finance API & Database
- Created `transactions` table (type, category, amount, description, counterparty, date, source, verified)
- Created `bank_statements` table (for future CSV import)
- 8 database functions for full CRUD + summary + breakdown
- Finance route module with 3 layers: admin (full CRUD), user (read-only, no counterparty), public (cached summary)
- 1-hour cache on public endpoint to prevent DB hammering

### User Cabinet — Finance Page (/finance)
- Summary cards: income (green), expenses (red), balance (blue)
- Donut chart for expense category breakdown (Recharts)
- Bar chart comparing total income vs expenses
- Filterable transaction list (All/Income/Expense tabs)
- Pagination, empty state with helpful messaging
- Category badges with color coding

### Admin Panel — Finance Page (/admin/finance)
- 4 summary cards: income, expenses, balance, transaction count
- Full transaction list with search, type filters
- Add Transaction modal: type toggle, category dropdown (changes based on type), amount, date, description, counterparty
- Edit Transaction modal: pre-fills all fields
- Delete confirmation modal
- All mutations require super_admin role

### Navigation & Routing
- Added "Финансы" with Wallet icon to both user and admin sidebars
- Added FINANCE and ADMIN_FINANCE route constants
- Lazy-loaded both Finance pages in App.tsx
- Added /finance to server's React route list

## Technical Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| All registered users see finances | Simpler, aligns with transparency mission | Donor-only access (requires payment tracking) |
| Hide counterparty from user view | Privacy protection for bank data | Show everything (privacy risk) |
| Manual entry for MVP, CSV later | Faster to ship, CSV parsing is complex | Start with CSV (delays launch) |
| Hardcoded category constants | Simple, no extra DB table needed | Dynamic categories table |
| 1-hour public cache | Prevents DB load, data changes infrequently | No cache (DB hit per request) |
| Separate income/expense categories | Cleaner UX, relevant options per type | Single flat list |

## Files Changed (Full List)

| File | Action | Description |
|------|--------|-------------|
| `src/index.html` | Modified | AI badge, futurist section, live finance counter |
| `src/styles.css` | Modified | ~120 lines: badge, manifesto grid, live counter, mobile |
| `src/script.js` | Modified | Live finance counter fetch with silent fail |
| `server/db.js` | Modified | 2 new tables, 8 new functions, exports |
| `server/routes/finance.js` | Created | Full finance API (admin CRUD + user read + public) |
| `server/index.js` | Modified | Route registration, /finance in React routes |
| `client/src/config/routes.ts` | Modified | FINANCE and ADMIN_FINANCE constants |
| `client/src/App.tsx` | Modified | Lazy imports and route definitions |
| `client/src/layouts/DashboardLayout.tsx` | Modified | Finance nav item with Wallet icon |
| `client/src/layouts/AdminLayout.tsx` | Modified | Finance nav item with Wallet icon |
| `client/src/pages/user/Finance.tsx` | Created | Read-only finance dashboard with charts |
| `client/src/pages/admin/Finance.tsx` | Created | Full transaction management page |

## Functions & Symbols

| Symbol | File | Action | Description |
|--------|------|--------|-------------|
| `getFinanceSummary()` | db.js | New | Aggregate income/expenses/balance/count |
| `getTransactions()` | db.js | New | Paginated list with type/category/date/search filters |
| `getPublicTransactions()` | db.js | New | Same as above but strips counterparty |
| `createTransaction()` | db.js | New | Insert with admin ID tracking |
| `updateTransaction()` | db.js | New | Dynamic field update |
| `deleteTransaction()` | db.js | New | Hard delete by ID |
| `getTransactionById()` | db.js | New | Single record with admin name join |
| `getExpenseBreakdown()` | db.js | New | GROUP BY category aggregation |
| Finance router | finance.js | New | 7 endpoints across 3 auth levels |
| `Finance` | user/Finance.tsx | New | Read-only finance page with charts |
| `AdminFinance` | admin/Finance.tsx | New | Full CRUD finance management |

## Database Impact

| Table | Action | Details |
|-------|--------|---------|
| `transactions` | New table | id, type, category, amount, description, counterparty, date, source, is_verified, created_by, timestamps |
| `bank_statements` | New table | id, filename, uploaded_by, parsed, total_transactions, timestamps (for future CSV feature) |

## Testing

- [x] TypeScript compilation passes (npx tsc --noEmit)
- [x] Vite build succeeds (both Finance chunks appear in output)
- [ ] Manual verification (pending deployment)
- [x] Code review completed (fixed PATCH amount validation + float precision)

## Quality Review Findings (Fixed)

1. **PATCH amount validation gap** — Missing `> 0` check on amount updates. Fixed.
2. **Float precision** — `formatRubles()` now rounds properly before display. Fixed.

## Expense Categories

Income: donation, grant, other_income
Expense: legal, platform, operations, equipment, land, reserve, ai_tools, other_expense

## Gotchas & Notes for Future Agents

1. **Public finance cache**: 1-hour TTL, in-memory. Does NOT invalidate when transactions change. Acceptable for MVP but should add Redis or invalidation logic later.
2. **Counterparty field**: Visible only to admins, stripped from user API responses. This is intentional for privacy.
3. **bank_statements table**: Created but unused. Reserved for Phase 2 CSV upload feature.
4. **Finance route mounting**: Routes are mounted at `/api` with full paths in the router (e.g., `/admin/finance/summary`, `/user/finance/summary`, `/public/finance/summary`).
5. **Category validation**: VALID_CATEGORIES whitelist in finance.js controls allowed categories. Must be updated if new categories are added.

---
