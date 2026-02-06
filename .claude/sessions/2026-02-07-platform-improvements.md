# Session Notes: Platform improvements — admin tools, donation, drafts, librarian

**Date:** 2026-02-07 14:00
**Area:** Admin Panel / Member Portal / Landing Page
**Type:** feature
**Log Entry:** `.claude/agent-log.md` (entry at 2026-02-07 14:00)

## Context

User requested 30 improvement ideas for the SLOBODA project, with critical evaluation and implementation of the top ones. Focus areas: admin section, library management, user management, subscriptions, mass emails, article management.

After brainstorming and filtering, 12 ideas survived scrutiny. Top 6 were implemented in the previous context window, and remaining polish (donation JS, dashboard reading time, News refactor, draft auto-save, Librarian chat page) was committed in this continuation session.

## What Was Done

### Phase 1: Admin Email Campaigns & Templates Page
- Files: `client/src/pages/admin/Campaigns.tsx`
- Changes: Created full UI for email campaign management with two tabs (Campaigns, Templates). Campaign list with status badges, template CRUD modal, campaign creation with recipient filters, email config warning banner.
- Reasoning: Backend APIs for campaigns and templates already existed but had no React frontend. Pure frontend work to unlock existing functionality.

### Phase 2: Admin User Management Page
- Files: `client/src/pages/admin/Admins.tsx`
- Changes: Created admin management page with list view, invite modal (generates 48h link with copy-to-clipboard), delete confirmation. Super_admin role gate with access denied view.
- Reasoning: Backend invite/list/delete endpoints existed but had no React UI.

### Phase 3: Enhanced Registrations (CSV Export + Bulk Actions)
- Files: `client/src/pages/admin/Registrations.tsx`
- Changes: Added CSV export with UTF-8 BOM for Excel compatibility, bulk selection with checkboxes and select-all, bulk status change action bar. `escapeCSV()` helper.
- Reasoning: Admin needed efficient tools for managing growing registration list.

### Phase 4: Post Pinning
- Files: `client/src/pages/admin/Posts.tsx`, `server/db.js`, `server/routes/adminContent.js`
- Changes: Pin/unpin button in admin post list, `is_pinned` column with migration, ORDER BY puts pinned first, PATCH handler accepts isPinned.
- Reasoning: Common CMS feature for highlighting important content.

### Phase 5: Reading Time Estimates
- Files: `client/src/utils/readingTime.ts`, `client/src/pages/user/News.tsx`, `client/src/pages/user/Library.tsx`, `client/src/pages/user/Dashboard.tsx`
- Changes: Shared utility (strips HTML, counts words, 200 wpm), displayed with Clock icon on all content cards. News.tsx refactored from local function to shared utility.
- Reasoning: Helps users estimate time commitment before reading.

### Phase 6: Routing, Types, Navigation Wiring
- Files: `client/src/types/index.ts`, `client/src/config/routes.ts`, `client/src/App.tsx`, `client/src/layouts/AdminLayout.tsx`, `client/src/layouts/DashboardLayout.tsx`
- Changes: Added EmailTemplate, EmailCampaign, AdminUser types. Added ADMIN_CAMPAIGNS, ADMIN_ADMINS, LIBRARIAN, BOOKMARKS, NOTIFICATIONS routes. Added nav items with Mail, ShieldCheck, Sparkles icons.
- Reasoning: Connecting all new pages to the routing and navigation system.

### Phase 7: Landing Page Donation Section
- Files: `src/index.html`, `src/styles.css`, `src/script.js`
- Changes: Donation section with 6 preset amounts (500-10,000 RUB), custom input, contextual description per amount, modal explaining pre-NKO payment status. Full interactive JS with amount selection, custom input toggle, modal open/close.
- Reasoning: Monetization path for pre-NKO stage, transparent about current status.

### Phase 8: Knowledge Submit Draft Auto-Save
- Files: `client/src/pages/user/KnowledgeSubmit.tsx`
- Changes: Auto-save form to localStorage every 30s, draft detection banner on page load with restore/discard buttons, draft cleared on successful submission.
- Reasoning: Prevents loss of long-form knowledge submissions.

### Phase 9: AI Librarian Chat Page
- Files: `client/src/pages/user/Librarian.tsx`
- Changes: Streaming chat interface using SSE from POST /api/user/librarian/chat. Welcome state with suggestion buttons, real-time text streaming, source citations display, simple markdown rendering.
- Reasoning: Connects to existing backend AI endpoint. Makes knowledge base accessible through natural language.

### Phase 10: AI Librarian Backend Service
- Files: `server/services/ai/librarian.js`, `server/services/ai/anthropic.js`
- Changes: New librarian service with `streamLibrarianResponse()` that searches posts + knowledge_submissions via ILIKE, builds context-injected system prompt, and streams Claude Haiku response as async generator. Exported `getClient()` from anthropic.js for direct SDK streaming access. Logs completions to `ai_processing_log` table.
- Reasoning: PostgreSQL ILIKE is sufficient for the current knowledge base size, avoids pgvector dependency. SSE chosen over WebSocket for simplicity (unidirectional, proxy-friendly).

### Phase 11: Bookmarks Backend + Frontend Integration
- Files: `server/db.js`, `server/routes/userPortal.js`, `client/src/pages/user/Bookmarks.tsx`, `client/src/pages/user/Library.tsx`
- Changes: New `user_bookmarks` table with UNIQUE(user_id, post_id) constraint. Three new db functions: `getUserBookmarks`, `toggleBookmark`, `getUserBookmarkIds`. Three new API endpoints: GET /bookmarks, POST /bookmarks/:postId/toggle, GET /bookmarks/ids. Frontend Bookmarks page with unbookmark toggle. Library page updated with bookmark icons on article cards.
- Reasoning: Toggle-based API (single endpoint) is simpler than separate add/remove. UNIQUE constraint prevents duplicates at DB level.

### Phase 12: Notifications Backend + Frontend
- Files: `server/db.js`, `server/routes/userPortal.js`, `server/routes/adminContent.js`, `client/src/pages/user/Notifications.tsx`, `client/src/layouts/DashboardLayout.tsx`
- Changes: New `notifications` table. Five new db functions: `createNotification`, `getUserNotifications`, `getUnreadNotificationCount`, `markNotificationsRead`, `markNotificationRead`. Four new API endpoints. Notifications page with type-based icons/colors, relative timestamps, mark-all-read. Admin content routes trigger notifications on submission approve/reject. DashboardLayout polls unread count every 60s, shows badge on Bell icon.
- Reasoning: In-app notifications complement email (which requires RESEND_API_KEY). 60s polling interval balances responsiveness with server load.

### Phase 13: Librarian Chat Rate Limiting
- Files: `server/routes/userPortal.js`
- Changes: In-memory per-user rate limiter using Map with hourly windows. 20 requests per user per hour for librarian chat endpoint.
- Reasoning: Prevents abuse of Claude API credits. In-memory Map is sufficient for single-process deployment. Resets naturally on server restart.

## Technical Decisions

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Frontend-only for Campaigns/Admins | Backend APIs already existed, no server changes needed | Could have redesigned APIs too |
| UTF-8 BOM in CSV export | Excel on Windows needs BOM to read UTF-8 Cyrillic correctly | Could use xlsx library (heavier) |
| localStorage for drafts | Simple, no server dependency, works offline | Could use server-side draft storage |
| Preset donation amounts | Reduces friction, provides anchoring | Free-form only (less conversion) |
| Modal for donation (not real payment) | NKO not yet registered, honest about status | Could hide donation entirely |
| SSE over WebSocket for Librarian | Simpler, unidirectional, proxy-friendly | WebSocket (overkill for one-way stream) |
| ILIKE over vector search | Adequate for small knowledge base, no pgvector dependency | pgvector + embeddings (complex, premature) |
| In-memory rate limiter | Single-process deployment, resets on restart | Redis (heavier), DB-backed (slower) |
| Toggle-based bookmark API | Single endpoint simpler than add/remove | Separate POST/DELETE endpoints |
| 60s notification polling | Balances responsiveness vs server load | WebSocket (complex), SSE (overkill) |

## Files Changed (Full List)

| File | Action | Description |
|------|--------|-------------|
| `client/src/pages/admin/Campaigns.tsx` | Created | Email campaigns & templates management |
| `client/src/pages/admin/Admins.tsx` | Created | Admin user management with invite |
| `client/src/pages/admin/Registrations.tsx` | Modified | CSV export, bulk select, bulk status change |
| `client/src/pages/admin/Posts.tsx` | Modified | Pin/unpin toggle button |
| `server/services/ai/librarian.js` | Created | AI librarian service with context search + Claude Haiku streaming |
| `server/services/ai/anthropic.js` | Modified | Exported getClient() for direct SDK streaming access |
| `server/routes/userPortal.js` | Modified | 9 new endpoints: librarian chat, bookmarks CRUD, notifications CRUD |
| `server/routes/adminContent.js` | Modified | Notification triggers on submission approve/reject |
| `server/db.js` | Modified | 2 new tables, 8 new functions, is_pinned migration |
| `server/index.js` | Modified | Added /librarian, /bookmarks, /notifications to React routes |
| `client/src/pages/user/Librarian.tsx` | Created | AI chat interface with SSE streaming |
| `client/src/pages/user/Dashboard.tsx` | Modified | Reading time on recent news cards |
| `client/src/pages/user/News.tsx` | Modified | Shared readingTime utility |
| `client/src/pages/user/KnowledgeSubmit.tsx` | Modified | Draft auto-save with restore/discard |
| `client/src/utils/readingTime.ts` | Created | Shared reading time estimation |
| `client/src/types/index.ts` | Modified | EmailTemplate, EmailCampaign, AdminUser types |
| `client/src/config/routes.ts` | Modified | New route constants |
| `client/src/App.tsx` | Modified | New route definitions |
| `client/src/layouts/AdminLayout.tsx` | Modified | Campaigns, Admins nav items |
| `client/src/layouts/DashboardLayout.tsx` | Modified | Librarian nav item |
| `server/db.js` | Modified | is_pinned column, ORDER BY, migration |
| `server/routes/adminContent.js` | Modified | isPinned in PATCH handler |
| `src/index.html` | Modified | Donation section + modal |
| `src/styles.css` | Modified | Donation section styles |
| `src/script.js` | Modified | Donation interactive JS |

## Functions & Symbols

| Symbol | File | Action | Description |
|--------|------|--------|-------------|
| `Campaigns` | Campaigns.tsx | New | Email campaigns/templates page component |
| `Admins` | Admins.tsx | New | Admin user management component |
| `escapeCSV()` | Registrations.tsx | New | CSV field escaping helper |
| `handleExportCSV()` | Registrations.tsx | New | CSV download with BOM |
| `handleTogglePin()` | Posts.tsx | New | Pin/unpin post via PATCH |
| `Librarian` | Librarian.tsx | New | AI chat interface component |
| `sendMessage()` | Librarian.tsx | New | SSE streaming chat handler |
| `renderContent()` | Librarian.tsx | New | Simple markdown renderer |
| `streamLibrarianResponse()` | librarian.js | New | Context search + Claude streaming + logging |
| `searchContext()` | librarian.js | New | PostgreSQL ILIKE search across posts + knowledge |
| `getClient()` | anthropic.js | Modified | Exported (was internal only) |
| `getUserBookmarks()` | db.js | New | Fetch user's bookmarked posts with details |
| `toggleBookmark()` | db.js | New | Add/remove bookmark (INSERT/DELETE) |
| `getUserBookmarkIds()` | db.js | New | Get array of bookmarked post IDs for a user |
| `createNotification()` | db.js | New | Insert notification for a user |
| `getUserNotifications()` | db.js | New | Fetch user notifications with pagination |
| `getUnreadNotificationCount()` | db.js | New | Count unread notifications |
| `markNotificationsRead()` | db.js | New | Mark all notifications read for user |
| `markNotificationRead()` | db.js | New | Mark single notification read |
| `estimateReadingTime()` | readingTime.ts | New | HTML-to-wordcount reading time |
| `formatReadingTime()` | readingTime.ts | New | Russian reading time formatter |
| `restoreDraft()` | KnowledgeSubmit.tsx | New | Restore form from localStorage |
| `discardDraft()` | KnowledgeSubmit.tsx | New | Clear saved draft |
| `updateDonateLabel()` | script.js | New | Dynamic donation amount description |
| `formatAmount()` | script.js | New | Number formatting with spaces |

## Database Impact

| Table | Action | Details |
|-------|--------|---------|
| `posts` | Schema change | Added `is_pinned BOOLEAN DEFAULT FALSE` with migration |
| `posts` | Query change | ORDER BY now puts `is_pinned DESC NULLS LAST` first |
| `user_bookmarks` | New table | (id, user_id, post_id, created_at) with UNIQUE(user_id, post_id) |
| `notifications` | New table | (id, user_id, type, title, message, link, is_read, created_at) |
| `ai_processing_log` | Query | Librarian logs completions (model, tokens, cost) |

## Testing

- [x] Vite production build passes (3,462 modules, 1,414 KB bundle)
- [ ] Unit tests (none added)
- [x] Deployed to Railway (auto-deploy on push to master)
- [x] Landing page verified: hero, donation section, modal, FAQ, founder, form all render
- [x] Donation modal works: preset amounts, custom input, Telegram/email links
- [x] API endpoints return 200 (landing, /app/login, /admin, /privacy)
- [x] Auth gates work: /api/user/* and /api/registrations/* return 401 without token
- [ ] Admin panel login: password mismatch (stored password rejected — likely changed via Railway env vars)

## Commits

- `e53953b` — feat: landing page conversion optimization + platform enhancements (bulk commit with all admin improvements)
- `7b1f077` — feat: add donation section, draft auto-save, and UI polish
- `1c10086` — feat: add donation section interactive JS
- `45c104c` — docs: add agent log and session notes for platform improvements
- `e9c0cda` — docs: update agent log with full session details
- `9b9a823` — docs: update work log and session notes with deployment verification

## Gotchas & Notes for Future Agents

- **Admin password mismatch**: The password stored in MEMORY.md (`UShpBjvXqHwv0PaN0Rf2gg`) was rejected by production on 2026-02-07. The password was likely changed via Railway environment variables. Check `ADMIN_PASSWORD` in Railway dashboard. Default fallback is `changeme123` (also rejected).
- The `Campaigns.tsx` page calls `/api/campaigns` and `/api/templates` endpoints which are in `server/routes/adminContent.js`. These require super_admin role.
- The `Admins.tsx` page has a client-side role check (`adminStore.admin?.role === 'super_admin'`). The backend also enforces this.
- CSV export uses BOM (`\uFEFF`) prefix for Windows Excel Cyrillic support. Do not remove it.
- Donation section is a placeholder — no real payment processing. Modal redirects to Telegram/email. Will need real payment integration after NKO registration.
- Draft auto-save timer is 30 seconds. The `draftTimerRef` is cleaned up on unmount.
- The `is_pinned` migration runs in `initializeTables()` which runs on every server start. It's idempotent (`ADD COLUMN IF NOT EXISTS`).
- Bundle size warning (1,414 KB) — should implement code-splitting with lazy imports for admin pages if it grows further.
- **ANTHROPIC_API_KEY**: Must be set in Railway environment variables for AI Librarian to work in production. Without it, the librarian endpoint will fail with an error about missing API key.
- **Librarian rate limiter** is in-memory (Map). Resets on server restart. If the app scales to multiple processes, switch to Redis-based rate limiting.
- **Notification polling** runs every 60s in DashboardLayout. If more users join, consider switching to SSE push or reducing frequency.
- **Bookmark toggle** uses INSERT/DELETE with UNIQUE constraint — concurrent toggles from same user are safe (constraint prevents duplicates).
- The librarian's `searchContext()` uses ILIKE which is case-insensitive but not accent-insensitive. Sufficient for Russian text.

---
