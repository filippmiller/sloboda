const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { requireUserAuth } = require('../middleware/userAuth');
const { requireCsrfIfCookie } = require('../middleware/csrf');
const { sanitizePlain } = require('../utils/sanitizeHtml');
const { parsePositiveInt, parseNonNegativeInt, parseNonNegativeFinite } = require('../utils/validation');
const coreStore = require('../services/coreStore');

let onLedgerMutated = () => {};

function setOnLedgerMutated(fn) {
    onLedgerMutated = typeof fn === 'function' ? fn : () => {};
}

const VALID_EXPENSE_STATUSES = ['reserved', 'paid', 'cancelled', 'disputed'];

function parsePaginationQuery(query) {
    let limit = 50;
    if (query.limit !== undefined && query.limit !== '') {
        const parsedLimit = parsePositiveInt(query.limit);
        if (!parsedLimit) return { error: 'Некорректный параметр limit' };
        limit = Math.min(200, parsedLimit);
    }
    let offset = 0;
    if (query.offset !== undefined && query.offset !== '') {
        const parsedOffset = parseNonNegativeInt(query.offset);
        if (parsedOffset === null) return { error: 'Некорректный параметр offset' };
        offset = parsedOffset;
    }
    return { limit, offset };
}

// GET /api/public/ledger/summary — public anonymized settlement finance & construction progress (zero PII)
router.get('/public/ledger/summary', async (req, res) => {
    try {
        const settlementId = sanitizePlain(req.query.settlement_id || 'sloboda-pilot', 64) || 'sloboda-pilot';
        const summary = await coreStore.getPublicLedgerSummary(settlementId);
        res.json({ success: true, ...summary });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Не удалось загрузить сводку реестра' });
    }
});

// GET /api/public/construction/milestones — physical plan vs actual construction panel
router.get('/public/construction/milestones', async (req, res) => {
    try {
        const settlementId = sanitizePlain(req.query.settlement_id || 'sloboda-pilot', 64) || 'sloboda-pilot';
        const milestones = await coreStore.listConstructionMilestones(settlementId);
        res.json({ success: true, milestones });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Не удалось загрузить панель стройки' });
    }
});

// GET /api/ledger/my — authenticated user's personal contributions & exact expense allocations (incl. 100 RUB observer)
router.get('/ledger/my', requireUserAuth, async (req, res) => {
    try {
        const data = await coreStore.getMyLedger(req.user.id);
        res.json({ success: true, ...data });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Не удалось загрузить личный финансовый реестр' });
    }
});

// GET /api/admin/ledger/contributions — super_admin lists contributions
router.get('/admin/ledger/contributions', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const pg = parsePaginationQuery(req.query);
        if (pg.error) {
            return res.status(400).json({ success: false, error: pg.error });
        }
        const settlementId = req.query.settlement_id
            ? sanitizePlain(req.query.settlement_id, 64)
            : undefined;
        const data = await coreStore.listAdminContributions({
            settlement_id: settlementId,
            limit: pg.limit,
            offset: pg.offset,
        });
        const payload = Array.isArray(data) ? { contributions: data } : (data || {});
        res.json({ success: true, ...payload });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось загрузить взносы' });
    }
});

// GET /api/admin/ledger/expenses — super_admin lists expenses
router.get('/admin/ledger/expenses', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const pg = parsePaginationQuery(req.query);
        if (pg.error) {
            return res.status(400).json({ success: false, error: pg.error });
        }
        const settlementId = req.query.settlement_id
            ? sanitizePlain(req.query.settlement_id, 64)
            : undefined;
        const status = req.query.status ? sanitizePlain(req.query.status, 32) : undefined;
        if (status && !VALID_EXPENSE_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, error: 'Недопустимый статус расхода' });
        }
        const data = await coreStore.listAdminExpenses({
            settlement_id: settlementId,
            status,
            limit: pg.limit,
            offset: pg.offset,
        });
        const payload = Array.isArray(data) ? { expenses: data } : (data || {});
        res.json({ success: true, ...payload });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось загрузить расходы' });
    }
});

// POST /api/admin/ledger/contributions — super_admin records verified contribution (idempotent)
router.post('/admin/ledger/contributions', requireAuth, requireSuperAdmin, requireCsrfIfCookie, async (req, res) => {
    try {
        let userId = null;
        if (req.body.user_id !== undefined && req.body.user_id !== null && req.body.user_id !== '') {
            userId = parsePositiveInt(req.body.user_id);
            if (!userId) {
                return res.status(400).json({ success: false, error: 'Некорректный user_id' });
            }
        }
        if (req.body.idempotency_key !== undefined && req.body.idempotency_key !== null && typeof req.body.idempotency_key !== 'string') {
            return res.status(400).json({ success: false, error: 'idempotency_key должен быть строкой' });
        }
        const idempotencyKey = typeof req.body.idempotency_key === 'string'
            ? (req.body.idempotency_key.trim() || null)
            : null;

        const result = await coreStore.recordContribution({
            user_id: userId,
            settlement_id: sanitizePlain(req.body.settlement_id || 'sloboda-pilot', 64) || 'sloboda-pilot',
            purpose: sanitizePlain(req.body.purpose || 'general', 64) || 'general',
            contributor_name: sanitizePlain(req.body.contributor_name || 'Участник', 180),
            amount_kopecks: req.body.amount_kopecks,
            share_class: req.body.share_class ? sanitizePlain(req.body.share_class, 32) : null,
            terms_version: sanitizePlain(req.body.terms_version || 'v1', 32) || 'v1',
            legal_right_type: req.body.legal_right_type || 'observer_trace',
            ledger_mode: sanitizePlain(req.body.ledger_mode || 'verified_receipt', 24),
            payment_ref: req.body.payment_ref ? sanitizePlain(req.body.payment_ref, 120) : null,
            idempotency_key: idempotencyKey,
            note: req.body.note ? sanitizePlain(req.body.note, 500) : null,
        }, req.admin.id);

        onLedgerMutated();
        res.status(result.idempotent_replay ? 200 : 201).json({ success: true, ...result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось записать взнос' });
    }
});

// POST /api/admin/ledger/expenses — super_admin creates & atomically allocates expense (fifo | proportional | explicit)
router.post('/admin/ledger/expenses', requireAuth, requireSuperAdmin, requireCsrfIfCookie, async (req, res) => {
    try {
        const title = sanitizePlain(req.body.title || '', 240);
        if (title.length < 2) {
            return res.status(400).json({ success: false, error: 'Укажите название расхода' });
        }
        let milestoneId = null;
        if (req.body.milestone_id !== undefined && req.body.milestone_id !== null && req.body.milestone_id !== '') {
            milestoneId = parsePositiveInt(req.body.milestone_id);
            if (!milestoneId) {
                return res.status(400).json({ success: false, error: 'Некорректный milestone_id' });
            }
        }
        if (req.body.idempotency_key !== undefined && req.body.idempotency_key !== null && typeof req.body.idempotency_key !== 'string') {
            return res.status(400).json({ success: false, error: 'idempotency_key должен быть строкой' });
        }
        const idempotencyKey = typeof req.body.idempotency_key === 'string'
            ? (req.body.idempotency_key.trim() || null)
            : null;

        const result = await coreStore.createAndAllocateExpense({
            settlement_id: sanitizePlain(req.body.settlement_id || 'sloboda-pilot', 64) || 'sloboda-pilot',
            purpose: sanitizePlain(req.body.purpose || 'general', 64) || 'general',
            title,
            category: sanitizePlain(req.body.category || 'equipment', 64),
            amount_kopecks: req.body.amount_kopecks,
            milestone_id: milestoneId,
            asset_name: sanitizePlain(req.body.asset_name || title, 240),
            asset_location: req.body.asset_location ? sanitizePlain(req.body.asset_location, 240) : null,
            receipt_url: req.body.receipt_url ? sanitizePlain(req.body.receipt_url, 500) : null,
            photo_url: req.body.photo_url ? sanitizePlain(req.body.photo_url, 500) : null,
            allocation_rule: req.body.allocation_rule || 'fifo',
            allocations: req.body.allocations,
            mark_paid: Boolean(req.body.mark_paid),
            idempotency_key: idempotencyKey,
        }, req.admin.id);

        onLedgerMutated();
        res.status(result.idempotent_replay ? 200 : 201).json({ success: true, ...result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось провести расход' });
    }
});

async function handleTransitionExpenseStatus(req, res) {
    try {
        const expenseId = parsePositiveInt(req.params.id);
        if (!expenseId) {
            return res.status(400).json({ success: false, error: 'Некорректный ID расхода' });
        }
        const status = req.body.status;
        if (!VALID_EXPENSE_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, error: 'Недопустимый статус расхода' });
        }
        let expectedVersion;
        if (req.body.expected_version !== undefined && req.body.expected_version !== null && req.body.expected_version !== '') {
            expectedVersion = parsePositiveInt(req.body.expected_version);
            if (!expectedVersion) {
                return res.status(400).json({ success: false, error: 'Некорректный expected_version' });
            }
        }
        const expense = await coreStore.transitionExpenseStatus(expenseId, status, req.admin.id, expectedVersion);
        onLedgerMutated();
        res.json({ success: true, expense });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось обновить статус расхода' });
    }
}

// PATCH & POST /api/admin/ledger/expenses/:id/status — super_admin transitions expense status
router.patch('/admin/ledger/expenses/:id/status', requireAuth, requireSuperAdmin, requireCsrfIfCookie, handleTransitionExpenseStatus);
router.post('/admin/ledger/expenses/:id/status', requireAuth, requireSuperAdmin, requireCsrfIfCookie, handleTransitionExpenseStatus);

// POST /api/admin/construction/milestones — super_admin creates/updates construction milestone
router.post('/admin/construction/milestones', requireAuth, requireSuperAdmin, requireCsrfIfCookie, async (req, res) => {
    try {
        const code = sanitizePlain(req.body.code || '', 64);
        const title = sanitizePlain(req.body.title || '', 240);
        if (!code || !title) {
            return res.status(400).json({ success: false, error: 'Укажите code и title этапа стройки' });
        }
        const plannedQty = parseNonNegativeFinite(req.body.planned_qty, 0);
        const actualQty = parseNonNegativeFinite(req.body.actual_qty, 0);
        if (plannedQty === null || actualQty === null) {
            return res.status(400).json({
                success: false,
                error: 'planned_qty и actual_qty должны быть конечными неотрицательными числами',
            });
        }
        const milestone = await coreStore.upsertConstructionMilestone({
            settlement_id: sanitizePlain(req.body.settlement_id || 'sloboda-pilot', 64) || 'sloboda-pilot',
            code,
            title,
            category: sanitizePlain(req.body.category || 'infrastructure', 48),
            unit: sanitizePlain(req.body.unit || 'шт.', 32),
            planned_qty: plannedQty,
            actual_qty: actualQty,
            budget_kopecks: req.body.budget_kopecks ?? 0,
            status: req.body.status || 'planned',
            photo_url: req.body.photo_url ? sanitizePlain(req.body.photo_url, 500) : null,
        });
        onLedgerMutated();
        res.json({ success: true, milestone });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось обновить этап стройки' });
    }
});

module.exports = { router, setOnLedgerMutated };
