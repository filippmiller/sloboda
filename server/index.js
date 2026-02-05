// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');

const db = require('./db');
const { router: authRouter, setDb: setAuthDb } = require('./routes/auth');
const { requireAuth, requireSuperAdmin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            connectSrc: ["'self'"],
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Rate limiting for registration endpoint
const registrationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 registrations per IP per window
    message: {
        success: false,
        error: 'Too many registration attempts. Please try again in 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve static files from src directory
app.use(express.static(path.join(__dirname, '../src')));

// Inject database into auth routes
setAuthDb(db);

// ============================================
// AUTH ROUTES
// ============================================
app.use('/api/auth', authRouter);

// ============================================
// PUBLIC API ROUTES
// ============================================

// API: Submit registration (rate limited)
app.post('/api/register', registrationLimiter, async (req, res) => {
    try {
        const data = req.body;

        // Basic validation
        if (!data.name || !data.email) {
            return res.status(400).json({
                success: false,
                error: 'Name and email are required'
            });
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Save to database
        const result = await db.saveRegistration(data);

        console.log(`New registration: ${data.name} (${data.email}) - ID: ${result.id}`);

        res.json({
            success: true,
            message: 'Registration saved successfully',
            id: result.id
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to save registration'
        });
    }
});

// API: Get registration statistics (public)
app.get('/api/stats', async (req, res) => {
    try {
        const count = await db.getRegistrationCount();
        res.json({
            success: true,
            count: count,
            // Only show count if above threshold for social proof
            displayCount: count >= 10 ? count : null
        });
    } catch (err) {
        console.error('Error fetching stats:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// ADMIN API ROUTES (Protected)
// ============================================

// Get registrations with filters
app.get('/api/registrations', requireAuth, async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            motivation: req.query.motivation,
            participation: req.query.participation,
            search: req.query.search,
            limit: req.query.limit ? parseInt(req.query.limit) : undefined,
            offset: req.query.offset ? parseInt(req.query.offset) : undefined
        };

        const registrations = await db.getRegistrations(filters);
        const total = await db.getRegistrationCount();

        res.json({ success: true, data: registrations, total });
    } catch (err) {
        console.error('Error fetching registrations:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch registrations' });
    }
});

// Get single registration
app.get('/api/registrations/:id', requireAuth, async (req, res) => {
    try {
        const registration = await db.getRegistrationById(parseInt(req.params.id));
        if (!registration) {
            return res.status(404).json({ success: false, error: 'Registration not found' });
        }
        res.json({ success: true, data: registration });
    } catch (err) {
        console.error('Error fetching registration:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch registration' });
    }
});

// Update registration status
app.patch('/api/registrations/:id', requireAuth, async (req, res) => {
    try {
        const { status } = req.body;
        if (!['new', 'contacted', 'qualified', 'rejected', 'converted'].includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status' });
        }

        await db.updateRegistrationStatus(parseInt(req.params.id), status);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating registration:', err);
        res.status(500).json({ success: false, error: 'Failed to update registration' });
    }
});

// Delete registration
app.delete('/api/registrations/:id', requireAuth, async (req, res) => {
    try {
        await db.deleteRegistration(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting registration:', err);
        res.status(500).json({ success: false, error: 'Failed to delete registration' });
    }
});

// Get registration notes
app.get('/api/registrations/:id/notes', requireAuth, async (req, res) => {
    try {
        const notes = await db.getRegistrationNotes(parseInt(req.params.id));
        res.json({ success: true, data: notes });
    } catch (err) {
        console.error('Error fetching notes:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch notes' });
    }
});

// Add registration note
app.post('/api/registrations/:id/notes', requireAuth, async (req, res) => {
    try {
        const { note } = req.body;
        if (!note || !note.trim()) {
            return res.status(400).json({ success: false, error: 'Note is required' });
        }

        const newNote = await db.addRegistrationNote(
            parseInt(req.params.id),
            req.admin.id,
            note.trim()
        );
        res.json({ success: true, data: newNote });
    } catch (err) {
        console.error('Error adding note:', err);
        res.status(500).json({ success: false, error: 'Failed to add note' });
    }
});

// ============================================
// ANALYTICS ROUTES
// ============================================

app.get('/api/analytics/overview', requireAuth, async (req, res) => {
    try {
        const overview = await db.getAnalyticsOverview();
        res.json({ success: true, data: overview });
    } catch (err) {
        console.error('Error fetching analytics:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch analytics' });
    }
});

app.get('/api/analytics/timeseries', requireAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const data = await db.getRegistrationsTimeSeries(days);
        res.json({ success: true, data });
    } catch (err) {
        console.error('Error fetching timeseries:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch timeseries' });
    }
});

app.get('/api/analytics/breakdown', requireAuth, async (req, res) => {
    try {
        const [motivation, participation, location, skills, budget] = await Promise.all([
            db.getMotivationBreakdown(),
            db.getParticipationBreakdown(),
            db.getLocationBreakdown(),
            db.getSkillsBreakdown(),
            db.getBudgetBreakdown()
        ]);

        res.json({
            success: true,
            data: { motivation, participation, location, skills, budget }
        });
    } catch (err) {
        console.error('Error fetching breakdown:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch breakdown' });
    }
});

// ============================================
// SETTINGS ROUTES
// ============================================

app.get('/api/settings', requireAuth, async (req, res) => {
    try {
        const settings = await db.getAllSettings();
        res.json({ success: true, data: settings });
    } catch (err) {
        console.error('Error fetching settings:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch settings' });
    }
});

app.patch('/api/settings', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        await db.updateSettings(req.body, req.admin.id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating settings:', err);
        res.status(500).json({ success: false, error: 'Failed to update settings' });
    }
});

// ============================================
// ADMIN MANAGEMENT ROUTES
// ============================================

app.get('/api/admins', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const admins = await db.getAllAdmins();
        res.json({ success: true, data: admins });
    } catch (err) {
        console.error('Error fetching admins:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch admins' });
    }
});

app.delete('/api/admins/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const adminId = parseInt(req.params.id);

        // Prevent self-deletion
        if (adminId === req.admin.id) {
            return res.status(400).json({ success: false, error: 'Cannot delete yourself' });
        }

        await db.deleteAdmin(adminId);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting admin:', err);
        res.status(500).json({ success: false, error: 'Failed to delete admin' });
    }
});

// ============================================
// EMAIL TEMPLATE ROUTES
// ============================================

app.get('/api/templates', requireAuth, async (req, res) => {
    try {
        const templates = await db.getEmailTemplates();
        res.json({ success: true, data: templates });
    } catch (err) {
        console.error('Error fetching templates:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch templates' });
    }
});

app.post('/api/templates', requireAuth, async (req, res) => {
    try {
        const { name, subject, body } = req.body;
        if (!name || !subject || !body) {
            return res.status(400).json({ success: false, error: 'Name, subject, and body are required' });
        }

        const template = await db.createEmailTemplate({ name, subject, body }, req.admin.id);
        res.json({ success: true, data: template });
    } catch (err) {
        console.error('Error creating template:', err);
        res.status(500).json({ success: false, error: 'Failed to create template' });
    }
});

app.put('/api/templates/:id', requireAuth, async (req, res) => {
    try {
        const { name, subject, body } = req.body;
        if (!name || !subject || !body) {
            return res.status(400).json({ success: false, error: 'Name, subject, and body are required' });
        }

        const template = await db.updateEmailTemplate(parseInt(req.params.id), { name, subject, body });
        res.json({ success: true, data: template });
    } catch (err) {
        console.error('Error updating template:', err);
        res.status(500).json({ success: false, error: 'Failed to update template' });
    }
});

app.delete('/api/templates/:id', requireAuth, async (req, res) => {
    try {
        await db.deleteEmailTemplate(parseInt(req.params.id));
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting template:', err);
        res.status(500).json({ success: false, error: 'Failed to delete template' });
    }
});

// ============================================
// EMAIL CAMPAIGN ROUTES
// ============================================

app.get('/api/campaigns', requireAuth, async (req, res) => {
    try {
        const campaigns = await db.getEmailCampaigns();
        res.json({ success: true, data: campaigns });
    } catch (err) {
        console.error('Error fetching campaigns:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch campaigns' });
    }
});

app.post('/api/campaigns', requireAuth, async (req, res) => {
    try {
        const { templateId, subject, body, filters } = req.body;
        if (!subject || !body) {
            return res.status(400).json({ success: false, error: 'Subject and body are required' });
        }

        // Get recipients based on filters
        const recipients = await db.getRegistrations(filters || {});
        const recipientCount = recipients.length;

        const campaign = await db.createEmailCampaign({
            templateId,
            subject,
            body,
            filters,
            recipientCount
        }, req.admin.id);

        // Create email send records (email sending would happen here in production)
        for (const recipient of recipients) {
            await db.createEmailSend(campaign.id, recipient.id);
        }

        res.json({ success: true, data: campaign, recipientCount });
    } catch (err) {
        console.error('Error creating campaign:', err);
        res.status(500).json({ success: false, error: 'Failed to create campaign' });
    }
});

// ============================================
// ADMIN SPA ROUTES
// ============================================

// Serve admin pages
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/admin/index.html'));
});

app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/admin/index.html'));
});

// ============================================
// CLI: Create first super admin
// ============================================

async function createSuperAdmin(email, password, name) {
    const existingAdmin = await db.getAdminByEmail(email);
    if (existingAdmin) {
        console.log('Admin with this email already exists');
        return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const admin = await db.createAdmin({
        email,
        passwordHash,
        name,
        role: 'super_admin'
    });

    console.log(`Super admin created: ${admin.email}`);
    return admin;
}

// ============================================
// SPA FALLBACK
// ============================================

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/index.html'));
});

// ============================================
// START SERVER
// ============================================

async function seedDefaultAdmin() {
    const email = process.env.ADMIN_EMAIL || 'admin@sloboda.land';
    const password = process.env.ADMIN_PASSWORD || 'changeme123';
    const name = process.env.ADMIN_NAME || 'Super Admin';

    // Reset admin password if environment variable is set
    if (process.env.RESET_ADMIN_PASSWORD === 'true') {
        const existing = await db.getAdminByEmail(email);
        if (existing) {
            const passwordHash = await bcrypt.hash(password, 12);
            await db.updateAdminPassword(existing.id, passwordHash);
            console.log(`Password reset for admin: ${email}`);
            console.log('Set RESET_ADMIN_PASSWORD=false after login.');
        } else {
            console.log(`Admin ${email} not found for password reset, creating new...`);
            await createSuperAdmin(email, password, name);
        }
        return;
    }

    // Force seed if environment variable is set (useful for initial setup)
    if (process.env.FORCE_SEED_ADMIN === 'true') {
        const existing = await db.getAdminByEmail(email);
        if (!existing) {
            console.log(`Force seeding super admin: ${email}`);
            await createSuperAdmin(email, password, name);
            console.log('Default admin created. Set FORCE_SEED_ADMIN=false after setup.');
        } else {
            console.log(`Admin ${email} already exists, skipping force seed.`);
        }
        return;
    }

    // Otherwise, only seed if no ACTIVE admins exist
    const admins = await db.getAllAdmins();
    const activeAdmins = admins.filter(a => !a.pending);

    if (activeAdmins.length === 0) {
        console.log(`No active admins found. Creating default super admin: ${email}`);
        await createSuperAdmin(email, password, name);
        console.log('Default admin created. Please change the password after first login.');
    }
}

async function start() {
    try {
        // Initialize database
        await db.initDatabase();

        // Check for CLI commands
        const args = process.argv.slice(2);
        if (args[0] === 'create-admin') {
            const email = args[1];
            const password = args[2];
            const name = args[3] || 'Super Admin';

            if (!email || !password) {
                console.log('Usage: node server/index.js create-admin <email> <password> [name]');
                process.exit(1);
            }

            await createSuperAdmin(email, password, name);
            process.exit(0);
        }

        // Auto-seed admin if none exists
        await seedDefaultAdmin();

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Static files served from: ${path.join(__dirname, '../src')}`);
            console.log(`Admin panel available at: /admin`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();
