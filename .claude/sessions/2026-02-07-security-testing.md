# Session: Security Testing & Bug Fixes
**Date**: 2026-02-07
**Agent**: Claude Code (picked up from crashed agent)
**Status**: Completed

## Context
Previous agent was doing comprehensive E2E and security testing. Agent crashed mid-session after finding 3 bugs and applying fixes. This session picked up the work, verified fixes, and completed remaining tests.

## Bugs Found by Previous Agent

### BUG #1: JSON Parse Error Leaks Stack Trace (FIXED)
- **Severity**: Medium (information disclosure)
- **Issue**: Sending invalid JSON to POST endpoints returned raw Express HTML error page with internal file paths and stack traces
- **Fix**: Added error middleware in `server/index.js` that catches `entity.parse.failed` errors and returns `{"success":false,"error":"Invalid JSON in request body"}`
- **Verified**: Both `"not json"` and `"{bad"` now return clean JSON 400 response

### BUG #2: XSS via dangerouslySetInnerHTML (FIXED)
- **Severity**: High (XSS vulnerability)
- **Issue**: `dangerouslySetInnerHTML` used in Library.tsx and Knowledge.tsx to render user-submitted Tiptap HTML content. Malicious users could submit raw HTML with `<script>` tags via direct API calls (bypassing editor).
- **Fix**: Created `client/src/utils/sanitize.ts` — browser-based HTML sanitizer using DOMParser that whitelists safe tags/attributes and blocks `javascript:` URIs. Applied to both rendering points.
- **Not vulnerable**: Librarian.tsx escapes HTML before markdown processing (line 211-213)

### BUG #3: XSS Data Stored in DB (Accepted Risk)
- **Severity**: Low (defense in depth)
- **Issue**: `<script>alert(1)</script>` stored as-is in registration names
- **Mitigation**: React auto-escapes by default. Admin panel renders via React JSX (not dangerouslySetInnerHTML). Frontend sanitization covers the explicit innerHTML cases.

## Verification Tests Completed

| Test | Result |
|------|--------|
| Invalid JSON → clean error | PASS |
| Malformed JSON `{bad` | PASS |
| SQL injection in search param | PASS (parameterized queries) |
| Tampered JWT token | PASS (rejects with 401) |
| Missing required fields | PASS (proper validation error) |
| Empty request body | PASS (proper validation error) |
| Invalid email format | PASS (proper validation error) |
| Unauthenticated access to admin API | PASS (401) |
| Wrong admin password | PASS (generic error, no info leak) |
| Path traversal `/../../../etc/passwd` | PASS (SPA fallback, no file access) |
| Client build with sanitizer | PASS (compiles clean) |
| XSS test record cleanup | PASS (deleted from DB) |

## Files Modified
- `server/index.js` — +11 lines (JSON parse error handler)
- `client/src/utils/sanitize.ts` — new file (HTML sanitizer utility)
- `client/src/pages/user/Library.tsx` — +2 lines (import + apply sanitizer)
- `client/src/pages/admin/Knowledge.tsx` — +2 lines (import + apply sanitizer)

## Technical Decisions
| Decision | Rationale | Alternatives |
|----------|-----------|-------------|
| Browser DOMParser sanitizer | No dependency needed, runs client-side | Could use DOMPurify (heavier), or server-side sanitization |
| Whitelist approach for tags | More secure than blacklist | Blacklist could miss new attack vectors |
| Allow `data:image/` in src | Needed for inline images from Tiptap | Could block entirely but breaks editor UX |

## Commits
- Changes staged but not committed (awaiting user confirmation)
