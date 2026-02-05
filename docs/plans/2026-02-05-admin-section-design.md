# Admin Section Design

**Date**: 2026-02-05
**Status**: Approved
**Author**: Claude Code + Philip Miller

---

## Overview

Full-featured admin panel for SLOBODA with role differentiation (users vs admins), authentication system, and comprehensive management capabilities.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Full Control Panel | Build comprehensive foundation now |
| Authentication | Invite-only with Password | Tight access control, no public registration |
| Module Priority | Equal across all | All modules built at same depth |
| UI Approach | Hybrid (dark sidebar + light content) | Professional navigation, readable data |

---

## 1. Authentication System

### User Roles

- **User** - Anyone who submits the registration form (existing)
- **Admin** - Invited staff with panel access
- **Super Admin** - Can manage other admins

### Authentication Flows

**First Admin Setup:**
```
CLI command or direct DB insert creates "super admin"
→ Email + hashed password stored in admins table
```

**Inviting New Admins:**
```
Existing admin enters email in "Invite Admin" form
→ System generates secure invite token (expires in 48h)
→ Email sent with invite link: /admin/accept-invite?token=xxx
→ New admin sets their password
→ Account activated
```

**Login Flow:**
```
Admin visits /admin/login
→ Enters email + password
→ Server validates credentials
→ JWT token issued (stored in httpOnly cookie)
→ Redirected to /admin/dashboard
```

**Session Management:**
- JWT expires after 24 hours
- "Remember me" option for 7-day sessions
- Logout invalidates token

### Database Schema

```sql
CREATE TABLE admins (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'admin',  -- admin, super_admin
    invited_by INTEGER REFERENCES admins(id),
    invite_token VARCHAR(255),
    invite_expires TIMESTAMP,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. Dashboard Layout & Navigation

### URL Structure

```
/admin/login          - Login page
/admin/accept-invite  - New admin sets password
/admin/dashboard      - Main overview
/admin/registrations  - Registration management
/admin/communications - Email & messaging
/admin/analytics      - Charts & insights
/admin/settings       - System configuration
/admin/admins         - Admin user management (super_admin only)
```

### Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  SLOBODA Admin                        [Admin Name ▼]    │  ← Top bar (dark)
├────────────┬────────────────────────────────────────────┤
│            │                                            │
│  Dashboard │   Content Area (light background)          │
│            │                                            │
│  ────────  │   Page content, tables, forms, charts      │
│            │                                            │
│  Regist.   │                                            │
│  Comms     │                                            │
│  Stats     │                                            │
│  Config    │                                            │
│  Admins    │                                            │
│            │                                            │
├────────────┴────────────────────────────────────────────┤
│  © SLOBODA 2026                          v1.0.0         │
└─────────────────────────────────────────────────────────┘
```

### Responsive Breakpoints

- **Desktop (>1024px)**: Full sidebar visible
- **Tablet (768-1024px)**: Collapsed sidebar with icons only
- **Mobile (<768px)**: Hidden sidebar, hamburger menu

---

## 3. Registrations Module

### Registration Statuses

| Status | Meaning |
|--------|---------|
| **new** | Just submitted, not reviewed |
| **contacted** | Admin reached out |
| **qualified** | Verified, good fit |
| **rejected** | Not a fit / spam |
| **converted** | Became active participant |

### Features

- List view with filters (status, motivation, participation, search)
- Bulk selection and actions
- Export to CSV
- Detail view with full profile
- Admin notes per registration
- Status management

### Database Additions

```sql
ALTER TABLE registrations ADD COLUMN status VARCHAR(50) DEFAULT 'new';

CREATE TABLE registration_notes (
    id SERIAL PRIMARY KEY,
    registration_id INTEGER REFERENCES registrations(id) ON DELETE CASCADE,
    admin_id INTEGER REFERENCES admins(id),
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. Communications Module

### Email Templates

| Template | Purpose |
|----------|---------|
| **Welcome** | Auto-sent after registration |
| **Investor Info** | Detailed packet for co-investors |
| **Community Update** | General news for all members |
| **Personal Follow-up** | One-on-one outreach |
| **Event Invitation** | Meetups, webinars |

### Features

- Template management (create, edit, delete)
- Campaign builder with recipient filtering
- Variable substitution ({{name}}, {{email}}, etc.)
- Send preview / test email
- Track opens and clicks
- Campaign history

### Database Schema

```sql
CREATE TABLE email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    created_by INTEGER REFERENCES admins(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE email_campaigns (
    id SERIAL PRIMARY KEY,
    template_id INTEGER REFERENCES email_templates(id),
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    filters JSONB,
    recipient_count INTEGER,
    sent_at TIMESTAMP,
    created_by INTEGER REFERENCES admins(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE email_sends (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER REFERENCES email_campaigns(id) ON DELETE CASCADE,
    registration_id INTEGER REFERENCES registrations(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending',
    sent_at TIMESTAMP,
    opened_at TIMESTAMP,
    clicked_at TIMESTAMP
);
```

### Email Provider

Resend (simple API, good free tier)

---

## 5. Analytics Module

### Key Metrics

| Metric | Description |
|--------|-------------|
| Total Registrations | All-time signups |
| Growth Rate | Week-over-week % change |
| Investor Ratio | % choosing investor participation |
| Budget Distribution | Breakdown by investment range |
| Conversion Funnel | New → Contacted → Qualified → Converted |
| Geographic Spread | Registrations by country/city |
| Skill Pool | Aggregate skills in community |
| Email Engagement | Open rates, click rates |

### Charts

- Registrations over time (line chart)
- Motivation breakdown (bar chart)
- Participation type (pie chart)
- Geographic distribution (table with flags)
- Skills offered (horizontal bar)

### Implementation

- Chart.js for visualization
- Server-side SQL aggregation
- 5-minute cache refresh
- Export as PNG/CSV

---

## 6. Settings & Admin Management

### Settings Categories

**General:**
- Site name
- Contact email
- Default language

**Registration Form:**
- Accept new registrations (toggle)
- Send welcome email automatically
- Require email verification

**Notifications:**
- Email admins on new registration
- Notification recipient list

**Email Provider:**
- Provider selection
- API key (masked)
- From email address
- Test email button

### Admin Management

- List all admins with role and last login
- Invite new admin (email, name, role)
- Resend/revoke pending invites
- Remove admin (super_admin only)

### Database Schema

```sql
CREATE TABLE settings (
    key VARCHAR(255) PRIMARY KEY,
    value TEXT,
    updated_by INTEGER REFERENCES admins(id),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. Technical Implementation

### File Structure

```
server/
├── index.js                    # Main Express app
├── db.js                       # Database connection
├── middleware/
│   └── auth.js                 # JWT verification
├── routes/
│   ├── auth.js                 # Login, invite, accept-invite
│   ├── registrations.js        # CRUD + notes + status
│   ├── communications.js       # Templates, campaigns
│   ├── analytics.js            # Stats endpoints
│   ├── settings.js             # System settings
│   └── admins.js               # Admin management
└── utils/
    ├── email.js                # Resend integration
    └── tokens.js               # JWT + invite tokens

src/admin/
├── index.html                  # Admin SPA shell
├── admin.js                    # Client-side logic
├── admin.css                   # Styles
└── pages/
    ├── login.html              # Login page
    └── accept-invite.html      # Set password page
```

### Dependencies

```json
{
  "bcrypt": "^5.1.1",
  "jsonwebtoken": "^9.0.2",
  "resend": "^2.0.0",
  "uuid": "^9.0.0"
}
```

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/auth/login` | Admin login |
| POST | `/api/auth/logout` | Clear session |
| POST | `/api/auth/invite` | Send admin invite |
| POST | `/api/auth/accept-invite` | Set password |
| GET | `/api/auth/me` | Get current admin |
| GET | `/api/registrations` | List with filters |
| GET | `/api/registrations/:id` | Single detail |
| PATCH | `/api/registrations/:id` | Update status |
| DELETE | `/api/registrations/:id` | Delete registration |
| GET | `/api/registrations/:id/notes` | Get notes |
| POST | `/api/registrations/:id/notes` | Add note |
| GET | `/api/templates` | List templates |
| POST | `/api/templates` | Create template |
| PUT | `/api/templates/:id` | Update template |
| DELETE | `/api/templates/:id` | Delete template |
| GET | `/api/campaigns` | List campaigns |
| POST | `/api/campaigns` | Create & send |
| GET | `/api/analytics/overview` | Dashboard stats |
| GET | `/api/analytics/timeseries` | Registration chart data |
| GET | `/api/analytics/breakdown` | Category breakdowns |
| GET | `/api/settings` | Get all settings |
| PATCH | `/api/settings` | Update settings |
| GET | `/api/admins` | List admins |
| DELETE | `/api/admins/:id` | Remove admin |

### Security

- Passwords: bcrypt (12 rounds)
- Tokens: JWT in httpOnly cookie
- CSRF protection on mutations
- Rate limiting: 5 login attempts / 15 min
- All admin routes require auth middleware
- Super admin check for admin management

---

## Implementation Phases

### Phase 1: Authentication Foundation
1. Database migrations (admins table, settings table)
2. Auth routes (login, logout, invite, accept)
3. JWT middleware
4. Login page UI
5. Accept invite page UI

### Phase 2: Admin Shell & Registrations
1. Admin layout (sidebar, topbar, content area)
2. Dashboard overview page
3. Registrations list with filters
4. Registration detail view
5. Notes and status management
6. CSV export

### Phase 3: Communications
1. Email templates CRUD
2. Campaign builder UI
3. Recipient filtering
4. Resend integration
5. Send tracking

### Phase 4: Analytics & Settings
1. Analytics endpoints
2. Chart.js integration
3. Dashboard charts
4. Settings page
5. Admin management page

### Phase 5: Testing & Polish
1. Playwright E2E tests
2. Mobile responsiveness
3. Error handling
4. Loading states
5. Final polish

---

## Success Criteria

- [ ] Admin can log in with email/password
- [ ] Super admin can invite new admins
- [ ] New admin can accept invite and set password
- [ ] Admin can view, filter, and export registrations
- [ ] Admin can add notes and change status
- [ ] Admin can create and send email campaigns
- [ ] Admin can view analytics dashboard
- [ ] Admin can modify system settings
- [ ] All pages work on mobile
- [ ] Playwright tests pass for auth flow
