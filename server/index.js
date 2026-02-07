// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');

const db = require('./db');
const { router: authRouter, setDb: setAuthDb } = require('./routes/auth');
const { router: userAuthRouter, setDb: setUserAuthDb, setEmailService: setUserAuthEmailService } = require('./routes/userAuth');
const { router: userPortalRouter, setDb: setUserPortalDb } = require('./routes/userPortal');
const { router: adminContentRouter, setDb: setAdminContentDb, setEmailService: setAdminContentEmailService } = require('./routes/adminContent');
const { router: financeRouter, setDb: setFinanceDb } = require('./routes/finance');
const { requireAuth, requireSuperAdmin } = require('./middleware/auth');
const emailService = require('./services/email');
const { setDb: setAiQueueDb } = require('./services/ai/queue');
const { upload: fileUpload } = require('./services/fileStorage');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// ENVIRONMENT VALIDATION
// ============================================
function validateEnvironment() {
    const warnings = [];

    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'sloboda-admin-secret-change-in-production') {
        warnings.push('JWT_SECRET is not set or uses the default value. Set a strong random secret in production.');
    }

    if (!process.env.RESEND_API_KEY) {
        warnings.push('RESEND_API_KEY is not set. Email features will be disabled.');
    }

    if (!process.env.ANTHROPIC_API_KEY) {
        warnings.push('ANTHROPIC_API_KEY is not set. AI features (librarian, classifier) will be disabled.');
    }

    if (warnings.length > 0) {
        console.warn('=== Environment Warnings ===');
        warnings.forEach(w => console.warn(`  ⚠ ${w}`));
        console.warn('============================');
    }
}
validateEnvironment();

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
            fontSrc: ["'self'", "fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            connectSrc: ["'self'"],
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Gzip/deflate compression for all responses
app.use(compression());

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
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// Cache headers for API GET responses
app.use('/api', (req, res, next) => {
    if (req.method !== 'GET') return next();

    // Public endpoints get short browser cache
    const publicCachePaths = ['/api/stats', '/api/health'];
    if (publicCachePaths.some(p => req.path === p)) {
        res.set('Cache-Control', 'public, max-age=60');
        return next();
    }

    // User-facing read endpoints get private short cache (browser only, not CDN)
    const shortCachePaths = ['/api/user/categories', '/api/user/posts'];
    if (shortCachePaths.some(p => req.path.startsWith(p))) {
        res.set('Cache-Control', 'private, max-age=30');
        return next();
    }

    // Admin and auth endpoints: no cache
    res.set('Cache-Control', 'no-store');
    next();
});

// React client build detection (must register before express.static)
const clientBuildPath = path.join(__dirname, '../dist/client');
const clientIndexPath = path.join(clientBuildPath, 'index.html');
const fs = require('fs');
const hasClientBuild = fs.existsSync(clientIndexPath);

if (hasClientBuild) {
    // Serve React static assets (Vite hashes filenames, so cache forever)
    app.use('/assets', express.static(path.join(clientBuildPath, 'assets'), {
        maxAge: '1y',
        immutable: true
    }));

    // React app routes - user portal
    const reactRoutes = ['/login', '/register', '/dashboard', '/news', '/library', '/librarian', '/submit', '/profile', '/bookmarks', '/notifications', '/finance'];
    reactRoutes.forEach(route => {
        app.get(route, (req, res) => res.sendFile(clientIndexPath));
        app.get(route + '/*', (req, res) => res.sendFile(clientIndexPath));
    });

    // React app routes - admin panel
    app.get('/admin', (req, res) => res.sendFile(clientIndexPath));
    app.get('/admin/*', (req, res) => res.sendFile(clientIndexPath));
}

// Privacy policy page
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/privacy.html'));
});

// Serve static files from src directory (landing page assets)
app.use(express.static(path.join(__dirname, '../src')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Inject database and services into route modules
setAuthDb(db);
setUserAuthDb(db);
setUserAuthEmailService(emailService);
setUserPortalDb(db);
setAdminContentDb(db);
setAdminContentEmailService(emailService);
setAiQueueDb(db);
setFinanceDb(db);

// ============================================
// AUTH ROUTES
// ============================================
app.use('/api/auth', authRouter);

// ============================================
// USER AUTH & PORTAL ROUTES
// ============================================
app.use('/api/user/auth', userAuthRouter);
app.use('/api/user', userPortalRouter);

// ============================================
// ADMIN CONTENT ROUTES
// ============================================
app.use('/api/admin', adminContentRouter);

// ============================================
// FINANCE ROUTES (admin, user, public)
// ============================================
app.use('/api', financeRouter);

// ============================================
// IMAGE UPLOAD ROUTE (authenticated)
// ============================================

app.post('/api/upload/image', requireAuth, fileUpload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedImageTypes.includes(req.file.mimetype)) {
        // Delete the uploaded file since it's not an image
        const filePath = req.file.path;
        fs.unlink(filePath, () => {});
        return res.status(400).json({ success: false, error: 'Only image files are allowed (jpeg, png, webp, gif)' });
    }

    res.json({
        success: true,
        url: `/uploads/${req.file.filename}`,
    });
});

// User image upload (user auth)
const { requireUserAuth } = require('./middleware/userAuth');
app.post('/api/user/upload/image', requireUserAuth, fileUpload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedImageTypes.includes(req.file.mimetype)) {
        const filePath = req.file.path;
        fs.unlink(filePath, () => {});
        return res.status(400).json({ success: false, error: 'Only image files are allowed (jpeg, png, webp, gif)' });
    }

    res.json({
        success: true,
        url: `/uploads/${req.file.filename}`,
    });
});

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

        // Send emails asynchronously (don't block response)
        db.getAllSettings().then(settings => {
            emailService.sendWelcomeEmail({ ...data, id: result.id }, settings).catch(err =>
                console.error('Welcome email error:', err)
            );
            emailService.sendRegistrationNotification({ ...data, id: result.id }, settings).catch(err =>
                console.error('Notification email error:', err)
            );
        }).catch(err => console.error('Settings fetch error:', err));

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

// Health check (pings database)
app.get('/api/health', async (req, res) => {
    try {
        const dbHealth = await db.healthCheck();
        const status = dbHealth.status === 'healthy' ? 200 : 503;
        res.status(status).json({
            status: dbHealth.status === 'healthy' ? 'ok' : 'degraded',
            timestamp: new Date().toISOString(),
            database: dbHealth
        });
    } catch (err) {
        res.status(503).json({
            status: 'degraded',
            timestamp: new Date().toISOString(),
            database: { status: 'unreachable' }
        });
    }
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
        auditLog(req, 'update_registration_status', 'registration', parseInt(req.params.id), { status });
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
        auditLog(req, 'delete_registration', 'registration', parseInt(req.params.id));
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
        auditLog(req, 'update_settings', 'settings', null, { keys: Object.keys(req.body) });
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
        auditLog(req, 'delete_admin', 'admin', adminId);
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

        // Create email send records
        const enrichedRecipients = [];
        for (const recipient of recipients) {
            const send = await db.createEmailSend(campaign.id, recipient.id);
            enrichedRecipients.push({ ...recipient, _sendId: send.id });
        }

        // Send emails via Resend (async, don't block response)
        emailService.sendCampaign({
            subject,
            body,
            recipients: enrichedRecipients,
            db,
            campaignId: campaign.id,
        }).then(result => {
            console.log(`Campaign ${campaign.id}: ${result.sentCount} sent, ${result.failedCount} failed`);
        }).catch(err => {
            console.error(`Campaign ${campaign.id} send error:`, err);
        });

        auditLog(req, 'send_campaign', 'campaign', campaign.id, { subject, recipientCount });
        res.json({ success: true, data: campaign, recipientCount });
    } catch (err) {
        console.error('Error creating campaign:', err);
        res.status(500).json({ success: false, error: 'Failed to create campaign' });
    }
});

// ============================================
// AUDIT LOG ROUTES
// ============================================

app.get('/api/audit-log', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const filters = {
            adminId: req.query.adminId ? parseInt(req.query.adminId) : undefined,
            action: req.query.action,
            entityType: req.query.entityType,
            limit: req.query.limit ? parseInt(req.query.limit) : 100,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };
        const logs = await db.getAuditLogs(filters);
        res.json({ success: true, data: logs });
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch audit logs' });
    }
});

// Helper to log admin actions
function auditLog(req, action, entityType, entityId, details) {
    db.createAuditLog({
        adminId: req.admin?.id,
        action,
        entityType,
        entityId,
        details,
        ipAddress: req.ip
    }).catch(err => console.error('Audit log error:', err));
}

// ============================================
// EMAIL STATUS ROUTE
// ============================================

app.get('/api/email/status', requireAuth, (req, res) => {
    res.json({
        success: true,
        configured: emailService.isConfigured(),
        provider: 'resend',
    });
});

// Send a single email to a registration
app.post('/api/email/send', requireAuth, async (req, res) => {
    try {
        const { registrationId, subject, body } = req.body;
        if (!registrationId || !subject || !body) {
            return res.status(400).json({ success: false, error: 'registrationId, subject, and body are required' });
        }

        const registration = await db.getRegistrationById(registrationId);
        if (!registration) {
            return res.status(404).json({ success: false, error: 'Registration not found' });
        }

        const personalizedSubject = emailService.renderTemplate(subject, registration);
        const personalizedBody = emailService.renderTemplate(body, registration);

        const result = await emailService.sendEmail({
            to: registration.email,
            subject: personalizedSubject,
            body: personalizedBody,
        });

        if (result.skipped) {
            return res.status(503).json({ success: false, error: 'Email not configured. Set RESEND_API_KEY.' });
        }

        res.json({ success: result.success, error: result.error });
    } catch (err) {
        console.error('Error sending email:', err);
        res.status(500).json({ success: false, error: 'Failed to send email' });
    }
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

// Fallback to old vanilla admin if React build not available
if (!hasClientBuild) {
    app.get('/admin', (req, res) => {
        res.sendFile(path.join(__dirname, '../src/admin/index.html'));
    });
    app.get('/admin/*', (req, res) => {
        res.sendFile(path.join(__dirname, '../src/admin/index.html'));
    });
}

// ============================================
// JSON PARSE ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ success: false, error: 'Invalid JSON in request body' });
    }
    next(err);
});

// ============================================
// SPA FALLBACK
// ============================================

// Updates/blog page
app.get('/updates', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/updates.html'));
});

// SPA fallback: serve React app for unknown routes (renders 404 component),
// or landing page if no React build exists
app.get('*', (req, res) => {
    if (hasClientBuild && !req.path.startsWith('/api/')) {
        return res.sendFile(clientIndexPath);
    }
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

        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
            console.log(`Static files served from: ${path.join(__dirname, '../src')}`);
            console.log(`React client build: ${hasClientBuild ? 'available' : 'not found (using vanilla admin)'}`);
            console.log(`Admin panel: /admin`);
            console.log(`User portal: /dashboard`);
        });

        // Graceful shutdown
        function shutdown(signal) {
            console.log(`\n${signal} received. Shutting down gracefully...`);
            server.close(() => {
                console.log('HTTP server closed');
                db.pool.end().then(() => {
                    console.log('Database pool closed');
                    process.exit(0);
                }).catch(err => {
                    console.error('Error closing database pool:', err);
                    process.exit(1);
                });
            });
            // Force exit after 10s if graceful shutdown hangs
            setTimeout(() => {
                console.error('Forced shutdown after timeout');
                process.exit(1);
            }, 10000);
        }

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
}

start();
