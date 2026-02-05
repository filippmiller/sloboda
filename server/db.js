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
            WHERE created_at > NOW() - INTERVAL '${days} days'
            GROUP BY DATE(created_at)
            ORDER BY date
        `);
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
    markEmailSent
};
