const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from the repo root:
// - default: .env
// - tests: .env.test (when NODE_ENV=test)
dotenv.config({
    path: path.join(__dirname, '..', process.env.NODE_ENV === 'test' ? '.env.test' : '.env')
});

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');

const db = (process.env.NODE_ENV === 'test' && process.env.TEST_NO_DB === 'true')
    ? require('./db_stub')
    : require('./db');
const { router: authRouter, setDb: setAuthDb } = require('./routes/auth');
const { router: userAuthRouter, setDb: setUserAuthDb, setEmailService: setUserAuthEmailService } = require('./routes/userAuth');
const { router: userPortalRouter, setDb: setUserPortalDb } = require('./routes/userPortal');
const { router: adminContentRouter, setDb: setAdminContentDb, setEmailService: setAdminContentEmailService } = require('./routes/adminContent');
const { router: financeRouter, setDb: setFinanceDb } = require('./routes/finance');
const { router: landingContentRouter, setDb: setLandingContentDb } = require('./routes/landingContent');
const { router: forumRouter, setDb: setForumDb } = require('./routes/forum');
const { router: commentsRouter, setDb: setCommentsDb } = require('./routes/comments');
const { router: votesRouter, setDb: setVotesDb } = require('./routes/votes');
const { router: moderationRouter, setDb: setModerationDb } = require('./routes/moderation');
const { router: rolesRouter, setDb: setRolesDb } = require('./routes/roles');
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
            imgSrc: ["'self'", "data:", "blob:", "https://images.unsplash.com", process.env.S3_PUBLIC_URL].filter(Boolean),
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

// Rate limiting for login endpoints (IP-based, complements per-email limits in route handlers)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // 20 login attempts per IP per 15 minutes (across all emails)
    message: {
        success: false,
        error: 'Too many login attempts from this address. Please try again in 15 minutes.'
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
const hasClientBuild = process.env.DISABLE_CLIENT_BUILD === 'true' ? false : fs.existsSync(clientIndexPath);

if (hasClientBuild) {
    // Serve React static assets (Vite hashes filenames, so cache forever)
    app.use('/assets', express.static(path.join(clientBuildPath, 'assets'), {
        maxAge: '1y',
        immutable: true
    }));

    // React app routes - user portal
    const reactRoutes = ['/login', '/register', '/dashboard', '/news', '/library', '/librarian', '/submit', '/profile', '/bookmarks', '/notifications', '/finance', '/forum', '/onboarding'];
    reactRoutes.forEach(route => {
        app.get(route, (req, res) => res.sendFile(clientIndexPath));
        app.get(route + '/*', (req, res) => res.sendFile(clientIndexPath));
    });

    // React app routes - admin panel
    app.get('/admin', (req, res) => res.sendFile(clientIndexPath));
    app.get('/admin/*', (req, res) => res.sendFile(clientIndexPath));
}

// Sitemap.xml (SEO)
app.get('/sitemap.xml', (req, res) => {
    const baseUrl = 'https://sloboda.land';
    const today = new Date().toISOString().split('T')[0];
    const urls = [
        { loc: '/', changefreq: 'weekly', priority: '1.0' },
        { loc: '/concept', changefreq: 'monthly', priority: '0.8' },
        { loc: '/privacy', changefreq: 'yearly', priority: '0.3' },
        { loc: '/updates', changefreq: 'weekly', priority: '0.6' },
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${baseUrl}${u.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
});

// Privacy policy page
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/privacy.html'));
});

// Detailed concept page (static, outside React routes)
app.get('/concept', (req, res) => {
    res.sendFile(path.join(__dirname, '../src/concept.html'));
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
setLandingContentDb(db);

// Forum system injection
setForumDb(db);
setCommentsDb(db);
setVotesDb(db);
setModerationDb(db);
setRolesDb(db);

// Make db available to middleware via app.locals
app.locals.db = db;

// ============================================
// AUTH ROUTES
// ============================================
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRouter);

// ============================================
// USER AUTH & PORTAL ROUTES
// ============================================
app.use('/api/user/auth/login', loginLimiter);
app.use('/api/user/auth', userAuthRouter);
app.use('/api/user', userPortalRouter);

// ============================================
// ADMIN CONTENT ROUTES
// ============================================
app.use('/api/admin', adminContentRouter);

// ============================================
// TAGS ROUTES (public)
// ============================================
const tagsRoutes = require('./routes/tags');
tagsRoutes.setDb(db);
app.use('/api/tags', tagsRoutes.router);

// ============================================
// FINANCE ROUTES (admin, user, public)
// ============================================
app.use('/api', financeRouter);

// ============================================
// LANDING PAGE CONTENT ROUTES (admin + public)
// ============================================
app.use('/api', landingContentRouter);

// ============================================
// FORUM ROUTES
// ============================================
app.use('/api/forum', forumRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/votes', votesRouter);

// Forum analytics
const forumAnalytics = require('./routes/forum-analytics');
forumAnalytics.setDb(db);
app.use('/api/forum/analytics', forumAnalytics.router);

// Forum roles
const forumRoles = require('./routes/forum-roles');
forumRoles.setDb(db);
app.use('/api/forum/roles', forumRoles.router);

// Admin seed endpoint (temporary)
const adminSeed = require('./routes/admin-seed');
adminSeed.setDb(db);
app.use('/api/admin', adminSeed.router);

// Domain catalog (settlement knowledge base)
const domainCatalog = require('./routes/domainCatalog');
app.use('/api/admin', domainCatalog.router);

app.use('/api/moderation', moderationRouter);
app.use('/api/roles', rolesRouter);

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

// Rate limiter for AI profession checker (10 requests per 15 min per IP)
const professionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        error: 'Слишком много запросов. Попробуйте через несколько минут.'
    }
});

// API: AI Profession Replacement Checker
app.post('/api/public/ai-profession', professionLimiter, async (req, res) => {
    try {
        const { profession } = req.body;

        if (!profession || typeof profession !== 'string' || profession.trim().length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Укажите вашу профессию'
            });
        }

        if (profession.trim().length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Слишком длинное описание профессии'
            });
        }

        const { callClaude } = require('./services/ai/anthropic');

        const systemPrompt = [
            'Ты безжалостно честный аналитик рынка труда 2026 года. Пользователь пишет профессию — ты отвечаешь, как скоро ИИ уничтожит эту работу.',
            'Язык: русский. Тон: жёсткий, тревожный, с конкретными фактами. Ты не утешаешь — ты будишь.',
            '',
            'КЛЮЧЕВЫЕ ПРАВИЛА по срокам:',
            '- Любая работа за компьютером (программист, дизайнер, аналитик, бухгалтер, переводчик, копирайтер, маркетолог) — ИИ УЖЕ забирает эти места. Горизонт: 1-2 года максимум.',
            '- Программисты: junior и middle вымрут к концу 2027. ИИ пишет код в 1000 раз быстрее и за копейки. Компании уже сокращают.',
            '- Офисные профессии: через 1-2 года массовые увольнения. Не 5-7 лет — это уже ПРОИСХОДИТ.',
            '- Физический труд (строитель, сантехник, электрик, фермер): это последнее, что автоматизируют. Но и тут роботы подбираются — 5-10 лет.',
            '- Творческие профессии: ИИ уже рисует, пишет музыку, снимает видео. Через 1-2 года 90% контента будет от ИИ.',
            '- Для ЛЮБОЙ профессии за компьютером ставь ВЫСОКИЙ риск. Не бывает "среднего" для офисной работы в 2026.',
            '- Никаких фраз типа "5-7 лет", "в отдалённом будущем". Максимум 2-3 года для компьютерных профессий.',
            '- Пиши конкретные примеры: какие компании уже сократили, какие инструменты ИИ уже заменяют.',
            '- В заключении всегда: "Время думать о плане Б. Не через год — СЕЙЧАС."',
            '',
            'КРИТИЧЕСКИ ВАЖНО: отвечай ТОЛЬКО чистым HTML. Никакого markdown. Никаких ```.',
            'Копируй структуру div-ов ТОЧНО как в примере ниже, меняя только текст внутри.',
            '',
            'Пример ответа для профессии "программист":',
            '',
            '<div class="ai-verdict"><span class="ai-risk-label">Риск замены:</span> <span class="ai-risk-value ai-risk-high">КРИТИЧЕСКИЙ</span></div>',
            '<div class="ai-timeline"><strong>Горизонт:</strong> Junior — уже мертвы. Middle — к концу 2027. Senior задержатся на 2-3 года, но их роль изменится до неузнаваемости.</div>',
            '<div class="ai-explanation"><h4>Что уже происходит</h4><p>GitHub Copilot пишет 50-80% кода. Claude и ChatGPT создают целые приложения за минуты. Amazon сократил сотни разработчиков и заменил их на ИИ-системы. Компании нанимают вдвое меньше junior-ов — зачем, если ИИ пишет базовый код бесплатно? Зарплаты junior-разработчиков упали на 30% за 2024-2025.</p></div>',
            '<div class="ai-impact"><h4>Что это значит для вас</h4><p>Если вы пишете типовой код, делаете CRUD, вёрстку, стандартные интеграции — ваша работа уже стоит в 10 раз дешевле. Через год-два её не будет вообще. Конкуренция за оставшиеся позиции будет чудовищной. Те, кто не перестроится — останутся без дохода.</p></div>',
            '<div class="ai-articles"><h4>Почитайте сами</h4><ul>',
            '<li><a href="https://habr.com/ru/articles/" target="_blank" rel="noopener">Copilot написал 80% кода за месяц — Хабр</a></li>',
            '<li><a href="https://vc.ru/ai/" target="_blank" rel="noopener">Рынок отсекает junior-разработчиков — VC.ru</a></li>',
            '<li><a href="https://theverge.com/" target="_blank" rel="noopener">Amazon заменила программистов на ИИ — The Verge</a></li>',
            '</ul></div>',
            '<div class="ai-conclusion"><p><strong>Программирование как профессия умирает.</strong> Не через 10 лет — прямо сейчас. Те, кто не найдёт альтернативу, окажутся в очереди на бирже труда вместе с миллионами таких же. Время думать о плане Б. Не через год — СЕЙЧАС.</p></div>',
            '',
            'Уровни риска: ai-risk-high + КРИТИЧЕСКИЙ (для компьютерных профессий), ai-risk-high + ВЫСОКИЙ (для смешанных), ai-risk-medium + СРЕДНИЙ (только для чисто физического труда), ai-risk-low + НИЗКИЙ (почти никогда не используй).',
            'Если ввод не профессия, ответь: <p>Пожалуйста, введите название профессии.</p>'
        ].join('\n');

        const userPrompt = `Профессия: ${profession.trim()}`;

        const { content } = await callClaude({
            model: 'claude-haiku-4-5-20251001',
            maxTokens: 1500,
            systemPrompt,
            userPrompt
        });

        res.json({ success: true, html: content });

    } catch (error) {
        console.error('[ai-profession] Error:', error.message);

        if (error.message.includes('ANTHROPIC_API_KEY')) {
            return res.status(503).json({
                success: false,
                error: 'Сервис ИИ временно недоступен'
            });
        }

        res.status(500).json({
            success: false,
            error: 'Не удалось проанализировать профессию. Попробуйте ещё раз.'
        });
    }
});

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

// API: Get active funding goal (public)
app.get('/api/public/funding-goal', async (req, res) => {
    try {
        const goal = await db.getActiveFundingGoal();
        if (!goal) {
            return res.json({
                success: true,
                goal: null
            });
        }

        const percentage = goal.target_amount > 0
            ? Math.min(Math.round((goal.current_amount / goal.target_amount) * 100), 100)
            : 0;

        res.json({
            success: true,
            goal: {
                id: goal.id,
                name: goal.name,
                target_amount: goal.target_amount,
                current_amount: goal.current_amount,
                percentage: percentage,
                start_date: goal.start_date,
                end_date: goal.end_date
            }
        });
    } catch (err) {
        console.error('Error fetching funding goal:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch funding goal' });
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

// Admin: Create/update funding goal
app.post('/api/admin/funding-goal', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { name, target_amount, current_amount, start_date, end_date } = req.body;
        if (!name || !target_amount || !start_date) {
            return res.status(400).json({
                success: false,
                error: 'Name, target_amount, and start_date are required'
            });
        }

        const goal = await db.createFundingGoal({
            name,
            target_amount: parseInt(target_amount),
            current_amount: current_amount ? parseInt(current_amount) : 0,
            start_date,
            end_date: end_date || null
        });

        auditLog(req, 'create_funding_goal', 'funding_goal', goal.id, { name, target_amount });
        res.json({ success: true, data: goal });
    } catch (err) {
        console.error('Error creating funding goal:', err);
        res.status(500).json({ success: false, error: 'Failed to create funding goal' });
    }
});

// Admin: Get active funding goal
app.get('/api/admin/funding-goal', requireAuth, async (req, res) => {
    try {
        const goal = await db.getActiveFundingGoal();
        res.json({ success: true, data: goal });
    } catch (err) {
        console.error('Error fetching funding goal:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch funding goal' });
    }
});

// Export all registrations as CSV
app.get('/api/registrations/export', requireAuth, async (req, res) => {
    try {
        const filters = {
            status: req.query.status,
            motivation: req.query.motivation,
            search: req.query.search,
        };

        const registrations = await db.getRegistrations(filters);

        const escapeCSV = (val) => {
            if (val == null) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const headers = ['ID', 'Name', 'Email', 'Telegram', 'Location', 'Motivation', 'Participation', 'Skills', 'Budget', 'Status', 'Created'];
        const rows = registrations.map(r => [
            r.id,
            escapeCSV(r.name),
            escapeCSV(r.email),
            escapeCSV(r.telegram),
            escapeCSV(r.location),
            escapeCSV(r.motivation),
            escapeCSV(r.participation),
            escapeCSV(Array.isArray(r.skills) ? r.skills.join('; ') : ''),
            escapeCSV(r.budget),
            escapeCSV(r.status),
            r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
        ].join(','));

        const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');

        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="registrations-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csv);
    } catch (err) {
        console.error('Error exporting registrations:', err);
        res.status(500).json({ success: false, error: 'Failed to export registrations' });
    }
});

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

async function seedFilippAdmin() {
    const email = 'filippmiller@gmail.com';
    const existing = await db.getAdminByEmail(email);

    if (existing && existing.role === 'super_admin') {
        // Already exists as super_admin — skip (don't overwrite on every restart)
        return;
    }

    if (existing) {
        // Exists but not super_admin — promote and set password
        const passwordHash = await bcrypt.hash('Airbus380+', 12);
        const client = await db.pool.connect();
        try {
            await client.query(
                `UPDATE admins SET password_hash = $1, role = 'super_admin', must_change_password = TRUE, name = COALESCE(NULLIF(name, ''), 'Filipp Miller') WHERE id = $2`,
                [passwordHash, existing.id]
            );
            console.log(`Admin ${email} promoted to super_admin, must_change_password=true`);
        } finally {
            client.release();
        }
        return;
    }

    // Create new super_admin with must_change_password flag
    const passwordHash = await bcrypt.hash('Airbus380+', 12);
    const client = await db.pool.connect();
    try {
        await client.query(
            `INSERT INTO admins (email, password_hash, name, role, must_change_password) VALUES ($1, $2, $3, 'super_admin', TRUE)`,
            [email, passwordHash, 'Filipp Miller']
        );
        console.log(`Super admin created: ${email} (must_change_password=true)`);
    } finally {
        client.release();
    }
}

async function start() {
    try {
        // Initialize database
        await db.initDatabase();

        // Auto-run forum migrations if MIGRATE_ON_START=true
        const { checkAndRunMigrations } = require('./scripts/migrate-on-startup');
        await checkAndRunMigrations();

        // Set up role progression checks (every 6 hours)
        const roleProgressionService = require('./services/roleProgressionService');
        setInterval(async () => {
          try {
            await roleProgressionService.checkRoleProgressions();
          } catch (error) {
            console.error('[RoleProgression] Scheduled check failed:', error.message);
          }
        }, 6 * 60 * 60 * 1000); // 6 hours

        // Run initial check after startup
        setTimeout(async () => {
          try {
            await roleProgressionService.checkRoleProgressions();
          } catch (error) {
            console.error('[RoleProgression] Initial check failed:', error.message);
          }
        }, 60000); // 1 minute after startup

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

        // Ensure filippmiller@gmail.com admin exists
        await seedFilippAdmin();

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
