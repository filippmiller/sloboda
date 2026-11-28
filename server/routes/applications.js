const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireUserAuth, optionalUserAuth } = require('../middleware/userAuth');
const { requireCsrfIfCookie, rejectHoneypot } = require('../middleware/csrf');
const { sanitizePlain } = require('../utils/sanitizeHtml');
const { parsePositiveInt } = require('../utils/validation');
const { VALID_DOMAIN_CODES } = require('../config/domains');
const coreStore = require('../services/coreStore');

async function handleCreateApplication(req, res) {
    try {
        const fullName = sanitizePlain(req.body.full_name || req.body.fullName || req.user?.name || '', 180);
        const email = sanitizePlain(req.body.email || req.user?.email || '', 250).toLowerCase();
        const city = sanitizePlain(req.body.city || '', 120);
        const primaryDomain = VALID_DOMAIN_CODES.has(req.body.primary_domain) ? req.body.primary_domain : 'GEN';
        const skills = sanitizePlain(req.body.skills || '', 1200);
        const motivation = sanitizePlain(req.body.motivation || '', 1500);
        const trialTaskTitle = sanitizePlain(req.body.trial_task_title || '', 240);
        const trialTaskUrl = sanitizePlain(req.body.trial_task_url || '', 500);
        const settlementId = sanitizePlain(req.body.settlement_id || 'sloboda-pilot', 64) || 'sloboda-pilot';

        if (fullName.length < 2 || !email.includes('@')) {
            return res.status(400).json({
                success: false,
                error: 'Укажите имя (от 2 символов) и корректный email',
            });
        }

        const rawPortfolio = Array.isArray(req.body.portfolio) ? req.body.portfolio.slice(0, 10) : [];
        const portfolio = rawPortfolio
            .map((p) => ({
                title: sanitizePlain(p.title || '', 240),
                domain_code: VALID_DOMAIN_CODES.has(p.domain_code) ? p.domain_code : primaryDomain,
                summary: sanitizePlain(p.summary || '', 1000),
                artifact_url: sanitizePlain(p.artifact_url || '', 500),
            }))
            .filter((p) => p.title.length >= 2);

        const result = await coreStore.createApplication({
            user_id: req.user?.id || null,
            settlement_id: settlementId,
            full_name: fullName,
            email,
            city,
            primary_domain: primaryDomain,
            skills,
            motivation,
            trial_task_title: trialTaskTitle || null,
            trial_task_url: trialTaskUrl || null,
            portfolio,
        });

        res.status(201).json({
            success: true,
            application: result.application,
            portfolio: result.portfolio,
            ...(result.claim_token ? { claim_token: result.claim_token } : {}),
            message: 'Заявка принята. Членство в Слободе доступно без оплаты после проверки вклада/заявки.',
        });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось подать заявку' });
    }
}

// POST /api/applications — submit specialist application + portfolio (authenticated or guest w/ claim_token)
router.post('/applications', requireCsrfIfCookie, rejectHoneypot, optionalUserAuth, handleCreateApplication);

// POST /api/applications/my — authenticated submission (fails closed with 401 if session expired)
router.post('/applications/my', requireUserAuth, requireCsrfIfCookie, handleCreateApplication);

// PATCH /api/applications/my — update & resubmit user's application after revision request
router.patch('/applications/my', requireUserAuth, requireCsrfIfCookie, async (req, res) => {
    try {
        const rawAppId = req.body.application_id ?? req.body.applicationId;
        let applicationId;
        if (rawAppId !== undefined && rawAppId !== null && rawAppId !== '') {
            applicationId = parsePositiveInt(rawAppId);
            if (!applicationId) {
                return res.status(400).json({ success: false, error: 'Некорректный ID заявки' });
            }
        }

        const rawExpectedVersion = req.body.expected_version ?? req.body.expectedVersion;
        let expectedVersion;
        if (rawExpectedVersion !== undefined && rawExpectedVersion !== null && rawExpectedVersion !== '') {
            expectedVersion = parsePositiveInt(rawExpectedVersion);
            if (!expectedVersion) {
                return res.status(400).json({ success: false, error: 'Некорректный expected_version' });
            }
        }

        const rawFullName = req.body.full_name ?? req.body.fullName;
        const full_name = rawFullName !== undefined ? sanitizePlain(rawFullName, 180) : undefined;
        if (full_name !== undefined && full_name.length < 2) {
            return res.status(400).json({ success: false, error: 'Имя должно содержать от 2 символов' });
        }

        const updated = await coreStore.resubmitApplication({
            userId: req.user.id,
            applicationId,
            full_name,
            city: req.body.city !== undefined ? sanitizePlain(req.body.city, 120) : undefined,
            primary_domain: req.body.primary_domain !== undefined
                ? (VALID_DOMAIN_CODES.has(req.body.primary_domain) ? req.body.primary_domain : 'GEN')
                : undefined,
            skills: req.body.skills !== undefined ? sanitizePlain(req.body.skills, 1200) : undefined,
            motivation: req.body.motivation !== undefined ? sanitizePlain(req.body.motivation, 1500) : undefined,
            trial_task_title: req.body.trial_task_title !== undefined
                ? (sanitizePlain(req.body.trial_task_title, 240) || null)
                : undefined,
            trial_task_url: req.body.trial_task_url !== undefined
                ? (sanitizePlain(req.body.trial_task_url, 500) || null)
                : undefined,
            expectedVersion,
        });

        res.json({ success: true, application: updated });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось обновить заявку' });
    }
});

// POST /api/applications/claim — bind a guest application to authenticated user via single-use claim_token
router.post('/applications/claim', requireUserAuth, requireCsrfIfCookie, async (req, res) => {
    try {
        const claimToken = typeof req.body.claim_token === 'string' ? req.body.claim_token.trim() : '';
        if (claimToken.length < 16) {
            return res.status(400).json({ success: false, error: 'Укажите корректный claim_token' });
        }
        const appRow = await coreStore.claimGuestApplication(req.user.id, claimToken);
        res.json({ success: true, application: appRow });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось привязать заявку' });
    }
});

// GET /api/applications/my — current user's application, portfolio & membership status
router.get('/applications/my', requireUserAuth, async (req, res) => {
    try {
        const data = await coreStore.getMyApplication(req.user.id);
        res.json({ success: true, ...data });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Не удалось загрузить заявку' });
    }
});

// POST /api/applications/my/portfolio — add portfolio item to user's application
router.post('/applications/my/portfolio', requireUserAuth, requireCsrfIfCookie, async (req, res) => {
    try {
        const title = sanitizePlain(req.body.title || '', 240);
        if (title.length < 2) {
            return res.status(400).json({ success: false, error: 'Укажите название работы в портфолио' });
        }
        const { item, application_version } = await coreStore.addPortfolioItem(req.user.id, {
            title,
            domain_code: VALID_DOMAIN_CODES.has(req.body.domain_code) ? req.body.domain_code : 'GEN',
            summary: sanitizePlain(req.body.summary || '', 1000),
            artifact_url: sanitizePlain(req.body.artifact_url || '', 500),
        });
        res.status(201).json({ success: true, item, application_version });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось добавить работу' });
    }
});

// GET /api/admin/applications — admin review queue
router.get('/admin/applications', requireAuth, async (req, res) => {
    try {
        const items = await coreStore.listApplications(req.query.status || undefined);
        res.json({ success: true, applications: items });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Не удалось загрузить заявки' });
    }
});

// POST /api/admin/applications/:id/review — review application (optimistic version check; accepted => free membership)
router.post('/admin/applications/:id/review', requireAuth, requireCsrfIfCookie, async (req, res) => {
    try {
        const applicationId = parsePositiveInt(req.params.id);
        if (!applicationId) {
            return res.status(400).json({ success: false, error: 'Некорректный ID заявки' });
        }
        const expectedVersion = parsePositiveInt(req.body.expected_version);
        if (!expectedVersion) {
            return res.status(400).json({
                success: false,
                error: 'Требуется корректный expected_version (положительное целое число)',
            });
        }
        const updated = await coreStore.reviewApplication({
            applicationId,
            status: req.body.status,
            reviewNote: sanitizePlain(req.body.review_note || '', 1000),
            expectedVersion,
            reviewerId: req.admin.id,
        });
        res.json({ success: true, application: updated });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось обновить заявку' });
    }
});

module.exports = { router };
