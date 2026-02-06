# Agent Handoff Prompt — SLOBODA Platform Continuation

## Priority 1: Deploy React Client Build to Railway

**Problem**: The React client app (`client/`) builds successfully locally but is NOT deployed on Railway. The server logs show `React client build: not found (using vanilla admin)`. This means:
- The new React admin pages (Campaigns, Admins, enhanced Registrations) are inaccessible in production
- The member portal (Dashboard, News, Library, Librarian, Bookmarks, Notifications) is inaccessible in production
- Only the legacy vanilla HTML admin panel at `/admin` works

**Root cause**: Railway runs `npm start` which runs `node server/index.js`. The server looks for the React build at `dist/client/` but this directory doesn't exist on Railway because the React app isn't being built during deployment.

**What needs to happen**:
1. Check `package.json` scripts — Railway needs a build step that runs `cd client && npm install && npx vite build` (or equivalent) before starting the server
2. The Vite config outputs to `dist/client/` — verify `server/index.js` serves from this path
3. The server already has logic to detect and serve the React build — find it with `grep -n "React client build" server/index.js`
4. Railway auto-deploys on push to master. After fixing the build config, push and verify both the vanilla admin AND React app work

**Key files**:
- `client/vite.config.ts` — Vite config, build output path
- `client/package.json` — client dependencies and scripts
- `package.json` (root) — Railway runs this, needs build script
- `server/index.js` — serves static files, has React build detection logic

**Verification**: After deployment:
- `https://sloboda-production.up.railway.app/admin` — legacy admin (should still work)
- `https://sloboda-production.up.railway.app/app/login` — React member portal login
- `https://sloboda-production.up.railway.app/app/dashboard` — React dashboard (requires user auth)

---

## Priority 2: Verify All New React Admin Pages Work in Production

Once the React build deploys, verify these new pages that were built but never tested in production:

### Email Campaigns & Templates (`/admin/campaigns` in React app)
- **What it does**: Two-tab page — Campaigns tab (list, create, send bulk emails) and Templates tab (CRUD email templates)
- **Backend APIs**: `GET/POST /api/campaigns`, `GET/POST/PUT/DELETE /api/templates`, `GET /api/email/status`
- **Note**: `RESEND_API_KEY` is NOT set on Railway. The email status banner should show a yellow warning. Campaigns can be created but won't actually send until the API key is configured.
- **File**: `client/src/pages/admin/Campaigns.tsx`

### Admin User Management (`/admin/admins` in React app)
- **What it does**: Lists all admins, invite new admins (generates 48h link), delete admins. Super_admin role required.
- **Backend APIs**: `GET /api/admins`, `DELETE /api/admins/:id`, `POST /api/auth/invite`
- **File**: `client/src/pages/admin/Admins.tsx`

### Enhanced Registrations (`/admin/registrations` in React app)
- **What it does**: Registration list with CSV export (UTF-8 BOM), bulk selection checkboxes, bulk status change
- **File**: `client/src/pages/admin/Registrations.tsx`

### Post Pinning (`/admin/posts` in React app)
- **What it does**: Pin/unpin toggle in post list. Pinned posts appear first in user-facing feeds.
- **Backend**: `PATCH /api/admin/posts/:id` accepts `isPinned` field. DB column `is_pinned` exists.
- **File**: `client/src/pages/admin/Posts.tsx`

---

## Priority 3: Remaining Improvement Ideas (Backlog)

These were identified as valuable but not yet implemented:

1. **Library Tag Filtering** — The AI classifier already generates `ai_tags` for knowledge submissions. Surface these tags as filterable chips in the Library page so users can discover content by topic. Backend has the data; just needs frontend UI.

2. **Image Upload for Articles** — Tiptap editor is already in use for rich text. Add inline image support using the existing `fileStorage.js` multer service. Tiptap has an Image extension.

3. **Email Campaign Analytics** — Show open rates and send statistics on the Campaigns page. The `email_sends` table tracks individual send status. Add a stats summary (sent/delivered/failed counts) per campaign.

4. **Content Tags System** — Flexible tagging beyond fixed categories. Add a `tags` table and many-to-many relation with posts. Allow admins to create/assign tags, users to filter by them.

5. **Code-Splitting** — Bundle is 1,414 KB. Implement React.lazy() with dynamic imports for admin pages (which most users never see) to reduce initial load.

---

## Project Context

- **Stack**: Express.js + PostgreSQL backend, React 19 + Vite 7 + TypeScript frontend
- **Database**: PostgreSQL on Railway (`DATABASE_URL` env var)
- **Deployment**: Railway, auto-deploys on push to master
- **Production URL**: https://sloboda-production.up.railway.app
- **Admin credentials**: admin@sloboda.land / UShpBjvXqHwv0PaN0Rf2gg (just reset, confirmed working)
- **Admin panel**: Currently only legacy vanilla HTML at `/admin` works in production
- **React app**: Builds locally (`cd client && npx vite build`), outputs to `dist/client/`
- **Key env vars on Railway**: `DATABASE_URL`, `JWT_SECRET` (set), `ADMIN_PASSWORD` (set), `ADMIN_EMAIL`, `RESEND_API_KEY` (NOT set), `FORCE_SEED_ADMIN=false`, `RESET_ADMIN_PASSWORD=false`

## Important Files

| File | Purpose |
|------|---------|
| `server/index.js` | Express server, static file serving, React build detection |
| `server/db.js` | All database tables and query functions |
| `server/routes/adminContent.js` | Admin API routes (posts, categories, knowledge, users, campaigns, templates) |
| `server/routes/userPortal.js` | User API routes (news, articles, knowledge, librarian chat) |
| `client/src/App.tsx` | React router with all routes |
| `client/src/config/routes.ts` | Route constants |
| `client/src/types/index.ts` | All TypeScript interfaces |
| `.claude/agent-log.md` | Full history of all agent work |
| `.claude/work-log.md` | Summary work log |

## Session Protocol

Run `/log` at session start to load context from `.claude/agent-log.md`. The agent log has 3 entries covering the full build history of this project.
