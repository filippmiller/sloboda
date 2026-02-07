const { Pool } = require('pg');

// DATABASE_URL must be provided via environment variable
if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    console.error('Set it in your .env file or deployment environment');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ============================================
// DATABASE INITIALIZATION
// ============================================

async function initDatabase() {
    const client = await pool.connect();
    try {
        // Registrations table (existing)
        await client.query(`
            CREATE TABLE IF NOT EXISTS registrations (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL,
                telegram VARCHAR(255),
                location VARCHAR(255),
                motivation VARCHAR(50),
                participation VARCHAR(50),
                skills TEXT[],
                budget VARCHAR(50),
                timeline VARCHAR(50),
                about TEXT,
                newsletter BOOLEAN DEFAULT true,
                status VARCHAR(50) DEFAULT 'new',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add status column if it doesn't exist (migration)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'registrations' AND column_name = 'status'
                ) THEN
                    ALTER TABLE registrations ADD COLUMN status VARCHAR(50) DEFAULT 'new';
                END IF;
            END $$;
        `);

        // Admins table
        await client.query(`
            CREATE TABLE IF NOT EXISTS admins (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                name VARCHAR(255),
                role VARCHAR(50) DEFAULT 'admin',
                invited_by INTEGER REFERENCES admins(id),
                invite_token VARCHAR(255),
                invite_expires TIMESTAMP,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Registration notes table
        await client.query(`
            CREATE TABLE IF NOT EXISTS registration_notes (
                id SERIAL PRIMARY KEY,
                registration_id INTEGER REFERENCES registrations(id) ON DELETE CASCADE,
                admin_id INTEGER REFERENCES admins(id),
                note TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Settings table
        await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key VARCHAR(255) PRIMARY KEY,
                value TEXT,
                updated_by INTEGER REFERENCES admins(id),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Email templates table
        await client.query(`
            CREATE TABLE IF NOT EXISTS email_templates (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                subject VARCHAR(255) NOT NULL,
                body TEXT NOT NULL,
                created_by INTEGER REFERENCES admins(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Email campaigns table
        await client.query(`
            CREATE TABLE IF NOT EXISTS email_campaigns (
                id SERIAL PRIMARY KEY,
                template_id INTEGER REFERENCES email_templates(id),
                subject VARCHAR(255) NOT NULL,
                body TEXT NOT NULL,
                filters JSONB,
                recipient_count INTEGER DEFAULT 0,
                sent_at TIMESTAMP,
                created_by INTEGER REFERENCES admins(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Email sends table
        await client.query(`
            CREATE TABLE IF NOT EXISTS email_sends (
                id SERIAL PRIMARY KEY,
                campaign_id INTEGER REFERENCES email_campaigns(id) ON DELETE CASCADE,
                registration_id INTEGER REFERENCES registrations(id) ON DELETE CASCADE,
                status VARCHAR(50) DEFAULT 'pending',
                sent_at TIMESTAMP,
                opened_at TIMESTAMP,
                clicked_at TIMESTAMP
            )
        `);

        // Seed default settings if not exist
        await client.query(`
            INSERT INTO settings (key, value) VALUES
                ('site_name', 'SLOBODA'),
                ('contact_email', 'contact@sloboda.land'),
                ('default_language', 'ru'),
                ('accept_registrations', 'true'),
                ('auto_welcome_email', 'false'),
                ('require_email_verification', 'false'),
                ('notify_on_registration', 'false'),
                ('notification_emails', '[]'),
                ('email_provider', 'resend'),
                ('email_from', 'noreply@sloboda.land')
            ON CONFLICT (key) DO NOTHING
        `);

        // ============================================
        // NEW TABLES: Users, Content, Knowledge, Files
        // ============================================

        // Users table (members who log into the portal)
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                registration_id INTEGER REFERENCES registrations(id) ON DELETE SET NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                name VARCHAR(255) NOT NULL,
                telegram VARCHAR(255),
                location VARCHAR(255),
                status VARCHAR(50) DEFAULT 'active',
                magic_link_token VARCHAR(255),
                magic_link_expires TIMESTAMP,
                invite_token VARCHAR(255),
                invite_expires TIMESTAMP,
                last_login TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Content categories
        await client.query(`
            CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                slug VARCHAR(255) UNIQUE NOT NULL,
                description TEXT,
                icon VARCHAR(100),
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Posts (news, articles, newsletters)
        await client.query(`
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                title VARCHAR(500) NOT NULL,
                slug VARCHAR(500) UNIQUE NOT NULL,
                summary TEXT,
                body TEXT NOT NULL,
                type VARCHAR(50) NOT NULL DEFAULT 'news',
                status VARCHAR(50) DEFAULT 'draft',
                category_id INTEGER REFERENCES categories(id),
                author_admin_id INTEGER REFERENCES admins(id),
                author_user_id INTEGER REFERENCES users(id),
                featured_image VARCHAR(500),
                is_pinned BOOLEAN DEFAULT FALSE,
                published_at TIMESTAMP,
                view_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Knowledge submissions
        await client.query(`
            CREATE TABLE IF NOT EXISTS knowledge_submissions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                title VARCHAR(500) NOT NULL,
                description TEXT NOT NULL,
                body TEXT,
                suggested_category_id INTEGER REFERENCES categories(id),
                ai_category_id INTEGER REFERENCES categories(id),
                final_category_id INTEGER REFERENCES categories(id),
                ai_tags TEXT[],
                ai_summary TEXT,
                ai_confidence DECIMAL(3,2),
                status VARCHAR(50) DEFAULT 'pending',
                reviewed_by INTEGER REFERENCES admins(id),
                reviewed_at TIMESTAMP,
                review_notes TEXT,
                published_post_id INTEGER REFERENCES posts(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // File attachments
        await client.query(`
            CREATE TABLE IF NOT EXISTS files (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(500) NOT NULL,
                original_filename VARCHAR(500) NOT NULL,
                filepath VARCHAR(1000) NOT NULL,
                mimetype VARCHAR(255) NOT NULL,
                size_bytes INTEGER NOT NULL,
                uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                uploaded_by_admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
                knowledge_submission_id INTEGER REFERENCES knowledge_submissions(id) ON DELETE CASCADE,
                post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // AI processing log
        await client.query(`
            CREATE TABLE IF NOT EXISTS ai_processing_log (
                id SERIAL PRIMARY KEY,
                knowledge_submission_id INTEGER REFERENCES knowledge_submissions(id) ON DELETE CASCADE,
                model VARCHAR(100),
                prompt_tokens INTEGER,
                completion_tokens INTEGER,
                total_cost_usd DECIMAL(10,6),
                processing_time_ms INTEGER,
                result JSONB,
                error TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // User invites
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_invites (
                id SERIAL PRIMARY KEY,
                registration_id INTEGER REFERENCES registrations(id) ON DELETE CASCADE,
                email VARCHAR(255) NOT NULL,
                token VARCHAR(255) UNIQUE NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                accepted_at TIMESTAMP,
                created_by INTEGER REFERENCES admins(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // User bookmarks
        await client.query(`
            CREATE TABLE IF NOT EXISTS user_bookmarks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, post_id)
            )
        `);

        // Notifications
        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(500) NOT NULL,
                message TEXT,
                link VARCHAR(500),
                is_read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Financial transactions
        await client.query(`
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                type VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
                category VARCHAR(100) NOT NULL,
                amount DECIMAL(12,2) NOT NULL,
                description TEXT NOT NULL,
                counterparty VARCHAR(255),
                date DATE NOT NULL,
                source VARCHAR(50) DEFAULT 'manual',
                bank_statement_id INTEGER,
                receipt_url VARCHAR(500),
                created_by INTEGER REFERENCES admins(id),
                is_verified BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Bank statements (for future CSV upload)
        await client.query(`
            CREATE TABLE IF NOT EXISTS bank_statements (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(500) NOT NULL,
                uploaded_by INTEGER REFERENCES admins(id),
                parsed BOOLEAN DEFAULT false,
                total_transactions INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add converted_to_user_id column to registrations
        await client.query(`
            ALTER TABLE registrations ADD COLUMN IF NOT EXISTS converted_to_user_id INTEGER REFERENCES users(id)
        `);

        // Add is_pinned column to posts
        await client.query(`
            ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE
        `);

        // Add tags column to posts
        await client.query(`
            ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags TEXT[]
        `);

        // Admin audit log
        await client.query(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id SERIAL PRIMARY KEY,
                admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
                action VARCHAR(100) NOT NULL,
                entity_type VARCHAR(100),
                entity_id INTEGER,
                details JSONB,
                ip_address VARCHAR(45),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add password reset columns to users
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255)
        `);
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP
        `);

        // Seed default categories
        await client.query(`
            INSERT INTO categories (name, slug, description, sort_order) VALUES
                ('Строительство', 'construction', 'Строительные технологии и практики', 1),
                ('Сельское хозяйство', 'agriculture', 'Земледелие, животноводство, агротехнологии', 2),
                ('Электрика и инженерные сети', 'electrical', 'Электроснабжение, водоснабжение, отопление', 3),
                ('Лесное дело', 'forestry', 'Лесоводство, деревообработка', 4),
                ('Юриспруденция', 'legal', 'Правовые вопросы, земельное право', 5),
                ('Медицина', 'medical', 'Здоровье, первая помощь, медицинские знания', 6),
                ('Инженерия', 'engineering', 'Механика, проектирование, технические решения', 7),
                ('Выживание и автономность', 'survival', 'Автономная жизнь, навыки выживания', 8),
                ('Общее', 'general', 'Общие знания и обсуждения', 9)
            ON CONFLICT (slug) DO NOTHING
        `);

        // ============================================
        // PERFORMANCE INDEXES
        // ============================================
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_posts_status_type ON posts(status, type);
            CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at DESC) WHERE status = 'published';
            CREATE INDEX IF NOT EXISTS idx_posts_slug ON posts(slug);
            CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
            CREATE INDEX IF NOT EXISTS idx_registrations_email ON registrations(email);
            CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = false;
            CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON user_bookmarks(user_id);
            CREATE INDEX IF NOT EXISTS idx_knowledge_submissions_status ON knowledge_submissions(status);
            CREATE INDEX IF NOT EXISTS idx_knowledge_submissions_user ON knowledge_submissions(user_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(type, date DESC);
            CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);
            CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
        `);

        console.log('Database tables initialized');
    } catch (err) {
        console.error('Error initializing database:', err);
        throw err;
    } finally {
        client.release();
    }
}

// ============================================
// REGISTRATION FUNCTIONS
// ============================================

async function saveRegistration(data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO registrations
                (name, email, telegram, location, motivation, participation, skills, budget, timeline, about, newsletter)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
                data.name,
                data.email,
                data.telegram || null,
                data.location || null,
                data.motivation || null,
                data.participation || null,
                data.skills || [],
                data.budget || null,
                data.timeline || null,
                data.about || null,
                data.newsletter !== false
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getRegistrations(filters = {}) {
    const client = await pool.connect();
    try {
        let query = 'SELECT * FROM registrations WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (filters.status) {
            query += ` AND status = $${paramIndex++}`;
            params.push(filters.status);
        }

        if (filters.motivation) {
            query += ` AND motivation = $${paramIndex++}`;
            params.push(filters.motivation);
        }

        if (filters.participation) {
            query += ` AND participation = $${paramIndex++}`;
            params.push(filters.participation);
        }

        if (filters.search) {
            query += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        query += ' ORDER BY created_at DESC';

        if (filters.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(filters.limit);
        }

        if (filters.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(filters.offset);
        }

        const result = await client.query(query, params);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getRegistrationById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM registrations WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function updateRegistrationStatus(id, status) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE registrations SET status = $1 WHERE id = $2',
            [status, id]
        );
    } finally {
        client.release();
    }
}

async function deleteRegistration(id) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM registrations WHERE id = $1', [id]);
    } finally {
        client.release();
    }
}

async function getRegistrationCount() {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT COUNT(*) as count FROM registrations');
        return parseInt(result.rows[0].count, 10);
    } finally {
        client.release();
    }
}

// ============================================
// REGISTRATION NOTES FUNCTIONS
// ============================================

async function getRegistrationNotes(registrationId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT rn.*, a.name as admin_name, a.email as admin_email
             FROM registration_notes rn
             LEFT JOIN admins a ON rn.admin_id = a.id
             WHERE rn.registration_id = $1
             ORDER BY rn.created_at DESC`,
            [registrationId]
        );
        return result.rows;
    } finally {
        client.release();
    }
}

async function addRegistrationNote(registrationId, adminId, note) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO registration_notes (registration_id, admin_id, note)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [registrationId, adminId, note]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

// ============================================
// ADMIN FUNCTIONS
// ============================================

async function getAdminByEmail(email) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM admins WHERE email = $1',
            [email.toLowerCase()]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getAdminById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT id, email, name, role, last_login, created_at FROM admins WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getAdminByInviteToken(token) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM admins WHERE invite_token = $1',
            [token]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function createAdmin(data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO admins (email, password_hash, name, role, invited_by, invite_token, invite_expires)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id, email, name, role`,
            [
                data.email.toLowerCase(),
                data.passwordHash || null,
                data.name || null,
                data.role || 'admin',
                data.invitedBy || null,
                data.inviteToken || null,
                data.inviteExpires || null
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function activateAdmin(id, passwordHash, name) {
    const client = await pool.connect();
    try {
        await client.query(
            `UPDATE admins
             SET password_hash = $1, name = $2, invite_token = NULL, invite_expires = NULL
             WHERE id = $3`,
            [passwordHash, name, id]
        );
    } finally {
        client.release();
    }
}

async function updateAdminLastLogin(id) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );
    } finally {
        client.release();
    }
}

async function getAllAdmins() {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT id, email, name, role, last_login, created_at, invite_expires,
                    CASE WHEN password_hash IS NULL THEN true ELSE false END as pending
             FROM admins
             ORDER BY created_at DESC`
        );
        return result.rows;
    } finally {
        client.release();
    }
}

async function deleteAdmin(id) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM admins WHERE id = $1', [id]);
    } finally {
        client.release();
    }
}

async function updateAdminPassword(id, passwordHash) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE admins SET password_hash = $1 WHERE id = $2',
            [passwordHash, id]
        );
    } finally {
        client.release();
    }
}

// ============================================
// SETTINGS FUNCTIONS
// ============================================

async function getAllSettings() {
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT key, value FROM settings');
        const settings = {};
        for (const row of result.rows) {
            settings[row.key] = row.value;
        }
        return settings;
    } finally {
        client.release();
    }
}

async function updateSettings(settings, adminId) {
    const client = await pool.connect();
    try {
        for (const [key, value] of Object.entries(settings)) {
            await client.query(
                `INSERT INTO settings (key, value, updated_by, updated_at)
                 VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
                 ON CONFLICT (key) DO UPDATE
                 SET value = $2, updated_by = $3, updated_at = CURRENT_TIMESTAMP`,
                [key, value, adminId]
            );
        }
    } finally {
        client.release();
    }
}

// ============================================
// ANALYTICS FUNCTIONS
// ============================================

async function getAnalyticsOverview() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as this_week,
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '14 days' AND created_at <= NOW() - INTERVAL '7 days') as last_week,
                COUNT(*) FILTER (WHERE participation IN ('investor', 'both')) as investors,
                COUNT(*) FILTER (WHERE status = 'new') as new_count,
                COUNT(*) FILTER (WHERE status = 'contacted') as contacted_count,
                COUNT(*) FILTER (WHERE status = 'qualified') as qualified_count,
                COUNT(*) FILTER (WHERE status = 'converted') as converted_count
            FROM registrations
        `);
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getRegistrationsTimeSeries(days = 30) {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM registrations
            WHERE created_at > NOW() - make_interval(days => $1)
            GROUP BY DATE(created_at)
            ORDER BY date
        `, [days]);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getMotivationBreakdown() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT motivation, COUNT(*) as count
            FROM registrations
            WHERE motivation IS NOT NULL
            GROUP BY motivation
            ORDER BY count DESC
        `);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getParticipationBreakdown() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT participation, COUNT(*) as count
            FROM registrations
            WHERE participation IS NOT NULL
            GROUP BY participation
            ORDER BY count DESC
        `);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getLocationBreakdown() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT location, COUNT(*) as count
            FROM registrations
            WHERE location IS NOT NULL AND location != ''
            GROUP BY location
            ORDER BY count DESC
            LIMIT 10
        `);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getSkillsBreakdown() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT skill, COUNT(*) as count
            FROM registrations, unnest(skills) as skill
            GROUP BY skill
            ORDER BY count DESC
        `);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getBudgetBreakdown() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT budget, COUNT(*) as count
            FROM registrations
            WHERE budget IS NOT NULL
            GROUP BY budget
            ORDER BY count DESC
        `);
        return result.rows;
    } finally {
        client.release();
    }
}

// ============================================
// EMAIL TEMPLATE FUNCTIONS
// ============================================

async function getEmailTemplates() {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM email_templates ORDER BY created_at DESC'
        );
        return result.rows;
    } finally {
        client.release();
    }
}

async function getEmailTemplateById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM email_templates WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function createEmailTemplate(data, adminId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO email_templates (name, subject, body, created_by)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [data.name, data.subject, data.body, adminId]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function updateEmailTemplate(id, data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `UPDATE email_templates
             SET name = $1, subject = $2, body = $3, updated_at = CURRENT_TIMESTAMP
             WHERE id = $4
             RETURNING *`,
            [data.name, data.subject, data.body, id]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function deleteEmailTemplate(id) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM email_templates WHERE id = $1', [id]);
    } finally {
        client.release();
    }
}

// ============================================
// EMAIL CAMPAIGN FUNCTIONS
// ============================================

async function getEmailCampaigns() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT ec.*,
                   COUNT(es.id) FILTER (WHERE es.status = 'sent') as sent_count,
                   COUNT(es.id) FILTER (WHERE es.opened_at IS NOT NULL) as opened_count,
                   COUNT(es.id) FILTER (WHERE es.clicked_at IS NOT NULL) as clicked_count
            FROM email_campaigns ec
            LEFT JOIN email_sends es ON ec.id = es.campaign_id
            GROUP BY ec.id
            ORDER BY ec.created_at DESC
        `);
        return result.rows;
    } finally {
        client.release();
    }
}

async function createEmailCampaign(data, adminId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO email_campaigns (template_id, subject, body, filters, recipient_count, created_by)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [data.templateId, data.subject, data.body, JSON.stringify(data.filters), data.recipientCount, adminId]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function markCampaignSent(id) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE email_campaigns SET sent_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );
    } finally {
        client.release();
    }
}

async function createEmailSend(campaignId, registrationId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO email_sends (campaign_id, registration_id)
             VALUES ($1, $2)
             RETURNING *`,
            [campaignId, registrationId]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function markEmailSent(id) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE email_sends SET status = $1, sent_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['sent', id]
        );
    } finally {
        client.release();
    }
}

// ============================================
// USER FUNCTIONS
// ============================================

async function createUser(data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO users
                (registration_id, email, password_hash, name, telegram, location, status, invite_token, invite_expires)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                data.registrationId || null,
                data.email.toLowerCase(),
                data.passwordHash || null,
                data.name,
                data.telegram || null,
                data.location || null,
                data.status || 'active',
                data.inviteToken || null,
                data.inviteExpires || null
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getUserByEmail(email) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM users WHERE email = $1',
            [email.toLowerCase()]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getUserById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT id, registration_id, email, name, telegram, location, status, last_login, created_at, updated_at FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getUserByMagicLinkToken(token) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM users WHERE magic_link_token = $1',
            [token]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getUserByInviteToken(token) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM users WHERE invite_token = $1',
            [token]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getUserByResetToken(token) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM users WHERE password_reset_token = $1',
            [token]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function updateUser(id, data) {
    const client = await pool.connect();
    try {
        const fields = [];
        const params = [];
        let paramIndex = 1;

        const allowedFields = [
            'name', 'telegram', 'location', 'status', 'password_hash',
            'magic_link_token', 'magic_link_expires', 'invite_token',
            'invite_expires', 'last_login', 'email',
            'password_reset_token', 'password_reset_expires'
        ];

        for (const [key, value] of Object.entries(data)) {
            const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
            if (allowedFields.includes(dbKey)) {
                fields.push(`${dbKey} = $${paramIndex++}`);
                params.push(value);
            }
        }

        if (fields.length === 0) return null;

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        const result = await client.query(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            params
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getUsers(filters = {}) {
    const client = await pool.connect();
    try {
        let query = 'SELECT id, registration_id, email, name, telegram, location, status, last_login, created_at, updated_at FROM users WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (filters.status) {
            query += ` AND status = $${paramIndex++}`;
            params.push(filters.status);
        }

        if (filters.search) {
            query += ` AND (name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        query += ' ORDER BY created_at DESC';

        if (filters.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(filters.limit);
        }

        if (filters.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(filters.offset);
        }

        const result = await client.query(query, params);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getUserCount() {
    const client = await pool.connect();
    try {
        const result = await client.query("SELECT COUNT(*) as count FROM users WHERE status = 'active'");
        return parseInt(result.rows[0].count, 10);
    } finally {
        client.release();
    }
}

// ============================================
// CATEGORY FUNCTIONS
// ============================================

async function createCategory(data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO categories (name, slug, description, icon, sort_order)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [data.name, data.slug, data.description || null, data.icon || null, data.sortOrder || 0]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getCategories() {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM categories ORDER BY sort_order ASC, name ASC'
        );
        return result.rows;
    } finally {
        client.release();
    }
}

async function getCategoryBySlug(slug) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM categories WHERE slug = $1',
            [slug]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function updateCategory(id, data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `UPDATE categories
             SET name = COALESCE($1, name),
                 slug = COALESCE($2, slug),
                 description = COALESCE($3, description),
                 icon = COALESCE($4, icon),
                 sort_order = COALESCE($5, sort_order)
             WHERE id = $6
             RETURNING *`,
            [data.name || null, data.slug || null, data.description || null, data.icon || null, data.sortOrder ?? null, id]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function deleteCategory(id) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM categories WHERE id = $1', [id]);
    } finally {
        client.release();
    }
}

// ============================================
// POST FUNCTIONS
// ============================================

async function createPost(data) {
    const client = await pool.connect();
    try {
        // Generate slug from title
        let slug = data.slug || data.title
            .toLowerCase()
            .replace(/[^a-zа-яё0-9\s-]/gi, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .substring(0, 200);

        // Ensure slug uniqueness
        const existing = await client.query('SELECT id FROM posts WHERE slug = $1', [slug]);
        if (existing.rows.length > 0) {
            slug = `${slug}-${Date.now()}`;
        }

        const result = await client.query(
            `INSERT INTO posts
                (title, slug, summary, body, type, status, category_id, author_admin_id, author_user_id, featured_image, tags, published_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
             RETURNING *`,
            [
                data.title,
                slug,
                data.summary || null,
                data.body,
                data.type || 'news',
                data.status || 'draft',
                data.categoryId || null,
                data.authorAdminId || null,
                data.authorUserId || null,
                data.featuredImage || null,
                data.tags || null,
                data.status === 'published' ? new Date() : null
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getPublishedPosts(filters = {}) {
    const client = await pool.connect();
    try {
        let query = `
            SELECT p.*, c.name as category_name, c.slug as category_slug
            FROM posts p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.status = 'published'
        `;
        const params = [];
        let paramIndex = 1;

        if (filters.type) {
            query += ` AND p.type = $${paramIndex++}`;
            params.push(filters.type);
        }

        if (filters.categoryId) {
            query += ` AND p.category_id = $${paramIndex++}`;
            params.push(filters.categoryId);
        }

        if (filters.search) {
            query += ` AND (p.title ILIKE $${paramIndex} OR p.summary ILIKE $${paramIndex} OR p.body ILIKE $${paramIndex})`;
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        query += ' ORDER BY p.is_pinned DESC NULLS LAST, p.published_at DESC';

        if (filters.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(filters.limit);
        }

        if (filters.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(filters.offset);
        }

        const result = await client.query(query, params);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getPostBySlug(slug) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT p.*, c.name as category_name, c.slug as category_slug
             FROM posts p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.slug = $1`,
            [slug]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getPostById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT p.*, c.name as category_name, c.slug as category_slug
             FROM posts p
             LEFT JOIN categories c ON p.category_id = c.id
             WHERE p.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getAllPosts(filters = {}) {
    const client = await pool.connect();
    try {
        let query = `
            SELECT p.*, c.name as category_name, c.slug as category_slug
            FROM posts p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (filters.type) {
            query += ` AND p.type = $${paramIndex++}`;
            params.push(filters.type);
        }

        if (filters.status) {
            query += ` AND p.status = $${paramIndex++}`;
            params.push(filters.status);
        }

        if (filters.categoryId) {
            query += ` AND p.category_id = $${paramIndex++}`;
            params.push(filters.categoryId);
        }

        if (filters.search) {
            query += ` AND (p.title ILIKE $${paramIndex} OR p.summary ILIKE $${paramIndex})`;
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        query += ' ORDER BY p.is_pinned DESC NULLS LAST, p.created_at DESC';

        if (filters.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(filters.limit);
        }

        if (filters.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(filters.offset);
        }

        const result = await client.query(query, params);
        return result.rows;
    } finally {
        client.release();
    }
}

async function updatePost(id, data) {
    const client = await pool.connect();
    try {
        const fields = [];
        const params = [];
        let paramIndex = 1;

        const fieldMap = {
            title: 'title',
            slug: 'slug',
            summary: 'summary',
            body: 'body',
            type: 'type',
            status: 'status',
            categoryId: 'category_id',
            featuredImage: 'featured_image',
            isPinned: 'is_pinned',
            tags: 'tags',
            publishedAt: 'published_at'
        };

        for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
            if (data[jsKey] !== undefined) {
                fields.push(`${dbKey} = $${paramIndex++}`);
                params.push(data[jsKey]);
            }
        }

        // Auto-set published_at when publishing
        if (data.status === 'published' && data.publishedAt === undefined) {
            fields.push(`published_at = COALESCE(published_at, CURRENT_TIMESTAMP)`);
        }

        if (fields.length === 0) return null;

        fields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        const result = await client.query(
            `UPDATE posts SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            params
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function deletePost(id) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM posts WHERE id = $1', [id]);
    } finally {
        client.release();
    }
}

async function incrementPostViews(id) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE posts SET view_count = view_count + 1 WHERE id = $1',
            [id]
        );
    } finally {
        client.release();
    }
}

// ============================================
// KNOWLEDGE SUBMISSION FUNCTIONS
// ============================================

async function createKnowledgeSubmission(data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO knowledge_submissions
                (user_id, title, description, body, suggested_category_id, status)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
                data.userId || null,
                data.title,
                data.description,
                data.body || null,
                data.suggestedCategoryId || null,
                data.status || 'pending'
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getKnowledgeSubmissionById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT ks.*, c.name as category_name, u.name as user_name, u.email as user_email
             FROM knowledge_submissions ks
             LEFT JOIN categories c ON ks.final_category_id = c.id
             LEFT JOIN users u ON ks.user_id = u.id
             WHERE ks.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getUserSubmissions(userId, filters = {}) {
    const client = await pool.connect();
    try {
        let query = `
            SELECT ks.*, c.name as category_name
            FROM knowledge_submissions ks
            LEFT JOIN categories c ON ks.final_category_id = c.id
            WHERE ks.user_id = $1
        `;
        const params = [userId];
        let paramIndex = 2;

        if (filters.status) {
            query += ` AND ks.status = $${paramIndex++}`;
            params.push(filters.status);
        }

        query += ' ORDER BY ks.created_at DESC';

        if (filters.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(filters.limit);
        }

        if (filters.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(filters.offset);
        }

        const result = await client.query(query, params);
        return result.rows;
    } finally {
        client.release();
    }
}

async function getPendingSubmissions(filters = {}) {
    const client = await pool.connect();
    try {
        let query = `
            SELECT ks.*, c.name as category_name, u.name as user_name, u.email as user_email
            FROM knowledge_submissions ks
            LEFT JOIN categories c ON ks.final_category_id = c.id
            LEFT JOIN users u ON ks.user_id = u.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (filters.status) {
            query += ` AND ks.status = $${paramIndex++}`;
            params.push(filters.status);
        } else {
            query += ` AND ks.status = 'pending'`;
        }

        if (filters.search) {
            query += ` AND (ks.title ILIKE $${paramIndex} OR ks.description ILIKE $${paramIndex})`;
            params.push(`%${filters.search}%`);
            paramIndex++;
        }

        query += ' ORDER BY ks.created_at DESC';

        if (filters.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(filters.limit);
        }

        if (filters.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(filters.offset);
        }

        const result = await client.query(query, params);
        return result.rows;
    } finally {
        client.release();
    }
}

async function updateKnowledgeSubmission(id, data) {
    const client = await pool.connect();
    try {
        const fields = [];
        const params = [];
        let paramIndex = 1;

        const fieldMap = {
            status: 'status',
            aiCategoryId: 'ai_category_id',
            finalCategoryId: 'final_category_id',
            aiTags: 'ai_tags',
            aiSummary: 'ai_summary',
            aiConfidence: 'ai_confidence',
            reviewedBy: 'reviewed_by',
            reviewedAt: 'reviewed_at',
            reviewNotes: 'review_notes',
            publishedPostId: 'published_post_id'
        };

        for (const [jsKey, dbKey] of Object.entries(fieldMap)) {
            if (data[jsKey] !== undefined) {
                fields.push(`${dbKey} = $${paramIndex++}`);
                params.push(data[jsKey]);
            }
        }

        if (fields.length === 0) return null;

        fields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);

        const result = await client.query(
            `UPDATE knowledge_submissions SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
            params
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function deleteKnowledgeSubmission(id) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM knowledge_submissions WHERE id = $1', [id]);
    } finally {
        client.release();
    }
}

// ============================================
// FILE FUNCTIONS
// ============================================

async function createFile(data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO files
                (filename, original_filename, filepath, mimetype, size_bytes, uploaded_by_user_id, uploaded_by_admin_id, knowledge_submission_id, post_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                data.filename,
                data.originalFilename,
                data.filepath,
                data.mimetype,
                data.sizeBytes,
                data.uploadedByUserId || null,
                data.uploadedByAdminId || null,
                data.knowledgeSubmissionId || null,
                data.postId || null
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getFileById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM files WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function getFilesBySubmission(submissionId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM files WHERE knowledge_submission_id = $1 ORDER BY created_at ASC',
            [submissionId]
        );
        return result.rows;
    } finally {
        client.release();
    }
}

async function deleteFile(id) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM files WHERE id = $1', [id]);
    } finally {
        client.release();
    }
}

// ============================================
// INVITE FUNCTIONS
// ============================================

async function createUserInvite(data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO user_invites (registration_id, email, token, expires_at, created_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                data.registrationId,
                data.email,
                data.token,
                data.expiresAt,
                data.createdBy
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getUserInviteByToken(token) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT * FROM user_invites WHERE token = $1',
            [token]
        );
        return result.rows[0] || null;
    } finally {
        client.release();
    }
}

async function markInviteAccepted(id) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE user_invites SET accepted_at = CURRENT_TIMESTAMP WHERE id = $1',
            [id]
        );
    } finally {
        client.release();
    }
}

async function getPendingInvites() {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT ui.*, r.name as registration_name
             FROM user_invites ui
             LEFT JOIN registrations r ON ui.registration_id = r.id
             WHERE ui.accepted_at IS NULL
             ORDER BY ui.created_at DESC`
        );
        return result.rows;
    } finally {
        client.release();
    }
}

// ============================================
// AI PROCESSING LOG FUNCTIONS
// ============================================

async function logAIProcessing(data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO ai_processing_log
                (knowledge_submission_id, model, prompt_tokens, completion_tokens, total_cost_usd, processing_time_ms, result, error)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                data.knowledgeSubmissionId,
                data.model || null,
                data.promptTokens || null,
                data.completionTokens || null,
                data.totalCostUsd || null,
                data.processingTimeMs || null,
                data.result ? JSON.stringify(data.result) : null,
                data.error || null
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

// ============================================
// REGISTRATION CONVERSION HELPER
// ============================================

async function updateRegistrationConversion(registrationId, userId) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE registrations SET converted_to_user_id = $1, status = $2 WHERE id = $3',
            [userId, 'converted', registrationId]
        );
    } finally {
        client.release();
    }
}

// ============================================
// BOOKMARK FUNCTIONS
// ============================================

async function getUserBookmarks(userId, filters = {}) {
    const client = await pool.connect();
    try {
        let query = `
            SELECT p.*, c.name as category_name, ub.created_at as bookmarked_at
            FROM user_bookmarks ub
            JOIN posts p ON ub.post_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE ub.user_id = $1 AND p.status = 'published'
        `;
        const params = [userId];
        let paramIndex = 2;

        query += ' ORDER BY ub.created_at DESC';

        if (filters.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(filters.limit);
        }
        if (filters.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(filters.offset);
        }

        const result = await client.query(query, params);
        return result.rows;
    } finally {
        client.release();
    }
}

async function toggleBookmark(userId, postId) {
    const client = await pool.connect();
    try {
        const existing = await client.query(
            'SELECT id FROM user_bookmarks WHERE user_id = $1 AND post_id = $2',
            [userId, postId]
        );
        if (existing.rows.length > 0) {
            await client.query('DELETE FROM user_bookmarks WHERE user_id = $1 AND post_id = $2', [userId, postId]);
            return { bookmarked: false };
        } else {
            await client.query('INSERT INTO user_bookmarks (user_id, post_id) VALUES ($1, $2)', [userId, postId]);
            return { bookmarked: true };
        }
    } finally {
        client.release();
    }
}

async function getUserBookmarkIds(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT post_id FROM user_bookmarks WHERE user_id = $1',
            [userId]
        );
        return result.rows.map(r => r.post_id);
    } finally {
        client.release();
    }
}

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

async function createNotification(data) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO notifications (user_id, type, title, message, link)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [data.userId, data.type, data.title, data.message || null, data.link || null]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getUserNotifications(userId, limit = 20) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    } finally {
        client.release();
    }
}

async function getUnreadNotificationCount(userId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false',
            [userId]
        );
        return parseInt(result.rows[0].count, 10);
    } finally {
        client.release();
    }
}

async function markNotificationsRead(userId) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
            [userId]
        );
    } finally {
        client.release();
    }
}

async function markNotificationRead(id, userId) {
    const client = await pool.connect();
    try {
        await client.query(
            'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2',
            [id, userId]
        );
    } finally {
        client.release();
    }
}

// ============================================
// FINANCE FUNCTIONS
// ============================================

async function getFinanceSummary() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS "totalIncome",
                COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "totalExpenses",
                COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS "balance",
                COUNT(*) AS "transactionCount"
            FROM transactions
        `);
        const row = result.rows[0];
        return {
            totalIncome: parseFloat(row.totalIncome),
            totalExpenses: parseFloat(row.totalExpenses),
            balance: parseFloat(row.balance),
            transactionCount: parseInt(row.transactionCount, 10)
        };
    } finally {
        client.release();
    }
}

async function getTransactions(filters = {}) {
    const client = await pool.connect();
    try {
        const conditions = [];
        const params = [];
        let idx = 1;

        if (filters.type) {
            conditions.push(`t.type = $${idx++}`);
            params.push(filters.type);
        }
        if (filters.category) {
            conditions.push(`t.category = $${idx++}`);
            params.push(filters.category);
        }
        if (filters.dateFrom) {
            conditions.push(`t.date >= $${idx++}`);
            params.push(filters.dateFrom);
        }
        if (filters.dateTo) {
            conditions.push(`t.date <= $${idx++}`);
            params.push(filters.dateTo);
        }
        if (filters.search) {
            conditions.push(`(t.description ILIKE $${idx} OR t.counterparty ILIKE $${idx})`);
            params.push(`%${filters.search}%`);
            idx++;
        }

        const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;

        const countResult = await client.query(
            `SELECT COUNT(*) as count FROM transactions t ${where}`,
            params
        );

        const dataResult = await client.query(
            `SELECT t.*, a.name as created_by_name
             FROM transactions t
             LEFT JOIN admins a ON t.created_by = a.id
             ${where}
             ORDER BY t.date DESC, t.created_at DESC
             LIMIT $${idx} OFFSET $${idx + 1}`,
            [...params, limit, offset]
        );

        return {
            data: dataResult.rows,
            total: parseInt(countResult.rows[0].count, 10)
        };
    } finally {
        client.release();
    }
}

async function getPublicTransactions(filters = {}) {
    const result = await getTransactions(filters);
    // Strip counterparty from public view
    result.data = result.data.map(t => {
        const { counterparty, created_by, created_by_name, ...rest } = t;
        return rest;
    });
    return result;
}

async function createTransaction(data, adminId) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO transactions (type, category, amount, description, counterparty, date, source, receipt_url, created_by, is_verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING *`,
            [
                data.type,
                data.category,
                data.amount,
                data.description,
                data.counterparty || null,
                data.date,
                data.source || 'manual',
                data.receipt_url || null,
                adminId,
                data.is_verified !== false
            ]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function updateTransaction(id, data) {
    const client = await pool.connect();
    try {
        const fields = [];
        const params = [];
        let idx = 1;

        const allowedFields = ['type', 'category', 'amount', 'description', 'counterparty', 'date', 'is_verified'];
        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                fields.push(`${field} = $${idx++}`);
                params.push(data[field]);
            }
        }

        if (fields.length === 0) return null;

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(id);

        const result = await client.query(
            `UPDATE transactions SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
            params
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function deleteTransaction(id) {
    const client = await pool.connect();
    try {
        await client.query('DELETE FROM transactions WHERE id = $1', [id]);
    } finally {
        client.release();
    }
}

async function getTransactionById(id) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `SELECT t.*, a.name as created_by_name
             FROM transactions t
             LEFT JOIN admins a ON t.created_by = a.id
             WHERE t.id = $1`,
            [id]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getExpenseBreakdown() {
    const client = await pool.connect();
    try {
        const result = await client.query(`
            SELECT category, SUM(amount) as total
            FROM transactions
            WHERE type = 'expense'
            GROUP BY category
            ORDER BY total DESC
        `);
        return result.rows.map(r => ({ category: r.category, total: parseFloat(r.total) }));
    } finally {
        client.release();
    }
}

// ============================================
// AUDIT LOG FUNCTIONS
// ============================================

async function createAuditLog({ adminId, action, entityType, entityId, details, ipAddress }) {
    const client = await pool.connect();
    try {
        const result = await client.query(
            `INSERT INTO audit_log (admin_id, action, entity_type, entity_id, details, ip_address)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [adminId, action, entityType || null, entityId || null, details ? JSON.stringify(details) : null, ipAddress || null]
        );
        return result.rows[0];
    } finally {
        client.release();
    }
}

async function getAuditLogs(filters = {}) {
    const client = await pool.connect();
    try {
        let query = `
            SELECT al.*, a.email as admin_email, a.name as admin_name
            FROM audit_log al
            LEFT JOIN admins a ON al.admin_id = a.id
            WHERE 1=1
        `;
        const params = [];
        let paramIndex = 1;

        if (filters.adminId) {
            query += ` AND al.admin_id = $${paramIndex++}`;
            params.push(filters.adminId);
        }
        if (filters.action) {
            query += ` AND al.action = $${paramIndex++}`;
            params.push(filters.action);
        }
        if (filters.entityType) {
            query += ` AND al.entity_type = $${paramIndex++}`;
            params.push(filters.entityType);
        }

        query += ` ORDER BY al.created_at DESC`;
        query += ` LIMIT $${paramIndex++}`;
        params.push(filters.limit || 100);
        query += ` OFFSET $${paramIndex++}`;
        params.push(filters.offset || 0);

        const result = await client.query(query, params);
        return result.rows;
    } finally {
        client.release();
    }
}

async function healthCheck() {
    const start = Date.now();
    const client = await pool.connect();
    try {
        const result = await client.query('SELECT 1 AS ok');
        return {
            status: 'healthy',
            responseTimeMs: Date.now() - start,
            pool: {
                total: pool.totalCount,
                idle: pool.idleCount,
                waiting: pool.waitingCount
            }
        };
    } catch (err) {
        return {
            status: 'unhealthy',
            error: err.message,
            responseTimeMs: Date.now() - start
        };
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    initDatabase,
    // Registration functions
    saveRegistration,
    getRegistrations,
    getRegistrationById,
    updateRegistrationStatus,
    deleteRegistration,
    getRegistrationCount,
    // Registration notes
    getRegistrationNotes,
    addRegistrationNote,
    // Admin functions
    getAdminByEmail,
    getAdminById,
    getAdminByInviteToken,
    createAdmin,
    activateAdmin,
    updateAdminLastLogin,
    getAllAdmins,
    deleteAdmin,
    updateAdminPassword,
    // Settings
    getAllSettings,
    updateSettings,
    // Analytics
    getAnalyticsOverview,
    getRegistrationsTimeSeries,
    getMotivationBreakdown,
    getParticipationBreakdown,
    getLocationBreakdown,
    getSkillsBreakdown,
    getBudgetBreakdown,
    // Email templates
    getEmailTemplates,
    getEmailTemplateById,
    createEmailTemplate,
    updateEmailTemplate,
    deleteEmailTemplate,
    // Email campaigns
    getEmailCampaigns,
    createEmailCampaign,
    markCampaignSent,
    createEmailSend,
    markEmailSent,
    // User functions
    createUser,
    getUserByEmail,
    getUserById,
    getUserByMagicLinkToken,
    getUserByResetToken,
    getUserByInviteToken,
    updateUser,
    getUsers,
    getUserCount,
    // Category functions
    createCategory,
    getCategories,
    getCategoryBySlug,
    updateCategory,
    deleteCategory,
    // Post functions
    createPost,
    getPublishedPosts,
    getPostBySlug,
    getPostById,
    getAllPosts,
    updatePost,
    deletePost,
    incrementPostViews,
    // Knowledge submission functions
    createKnowledgeSubmission,
    getKnowledgeSubmissionById,
    getUserSubmissions,
    getPendingSubmissions,
    updateKnowledgeSubmission,
    deleteKnowledgeSubmission,
    // File functions
    createFile,
    getFileById,
    getFilesBySubmission,
    deleteFile,
    // Invite functions
    createUserInvite,
    getUserInviteByToken,
    markInviteAccepted,
    getPendingInvites,
    // AI log functions
    logAIProcessing,
    // Registration conversion
    updateRegistrationConversion,
    // Bookmark functions
    getUserBookmarks,
    toggleBookmark,
    getUserBookmarkIds,
    // Notification functions
    createNotification,
    getUserNotifications,
    getUnreadNotificationCount,
    markNotificationsRead,
    markNotificationRead,
    // Finance functions
    getFinanceSummary,
    getTransactions,
    getPublicTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getTransactionById,
    getExpenseBreakdown,
    // Audit log
    createAuditLog,
    getAuditLogs,
    // Health check
    healthCheck,
    // Pool reference for graceful shutdown
    pool
};
