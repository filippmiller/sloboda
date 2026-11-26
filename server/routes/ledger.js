const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { requireUserAuth } = require('../middleware/userAuth');
const { requireCsrfIfCookie } = require('../middleware/csrf');
const { sanitizePlain } = require('../utils/sanitizeHtml');
const coreStore = require('../services/coreStore');

let onLedgerMutated = () => {};

function setOnLedgerMutated(fn) {
    onLedgerMutated = typeof fn === 'function' ? fn : () => {};
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

// POST /api/admin/ledger/contributions — super_admin records verified contribution (idempotent)
router.post('/admin/ledger/contributions', requireAuth, requireSuperAdmin, requireCsrfIfCookie, async (req, res) => {
    try {
        const result = await coreStore.recordContribution({
            user_id: req.body.user_id ? parseInt(req.body.user_id, 10) : null,
            settlement_id: sanitizePlain(req.body.settlement_id || 'sloboda-pilot', 64) || 'sloboda-pilot',
            purpose: sanitizePlain(req.body.purpose || 'general', 64) || 'general',
            contributor_name: sanitizePlain(req.body.contributor_name || 'Участник', 180),
            amount_kopecks: req.body.amount_kopecks,
            share_class: req.body.share_class ? sanitizePlain(req.body.share_class, 32) : null,
            terms_version: sanitizePlain(req.body.terms_version || 'v1', 32) || 'v1',
            legal_right_type: req.body.legal_right_type || 'observer_trace',
            ledger_mode: sanitizePlain(req.body.ledger_mode || 'verified_receipt', 24),
            payment_ref: req.body.payment_ref ? sanitizePlain(req.body.payment_ref, 120) : null,
            idempotency_key: req.body.idempotency_key ? sanitizePlain(req.body.idempotency_key, 128) : null,
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

        const result = await coreStore.createAndAllocateExpense({
            settlement_id: sanitizePlain(req.body.settlement_id || 'sloboda-pilot', 64) || 'sloboda-pilot',
            purpose: sanitizePlain(req.body.purpose || 'general', 64) || 'general',
            title,
            category: sanitizePlain(req.body.category || 'equipment', 64),
            amount_kopecks: req.body.amount_kopecks,
            milestone_id: req.body.milestone_id ? parseInt(req.body.milestone_id, 10) : null,
            asset_name: sanitizePlain(req.body.asset_name || title, 240),
            asset_location: req.body.asset_location ? sanitizePlain(req.body.asset_location, 240) : null,
            receipt_url: req.body.receipt_url ? sanitizePlain(req.body.receipt_url, 500) : null,
            photo_url: req.body.photo_url ? sanitizePlain(req.body.photo_url, 500) : null,
            allocation_rule: req.body.allocation_rule || 'fifo',
            allocations: req.body.allocations,
            mark_paid: Boolean(req.body.mark_paid),
            idempotency_key: req.body.idempotency_key ? sanitizePlain(req.body.idempotency_key, 128) : null,
        }, req.admin.id);

        onLedgerMutated();
        res.status(result.idempotent_replay ? 200 : 201).json({ success: true, ...result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось провести расход' });
    }
});

// POST /api/admin/ledger/expenses/:id/status — super_admin transitions expense (reserved -> paid | cancelled | disputed)
router.post('/admin/ledger/expenses/:id/status', requireAuth, requireSuperAdmin, requireCsrfIfCookie, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const expense = await coreStore.transitionExpenseStatus(id, req.body.status, req.admin.id);
        onLedgerMutated();
        res.json({ success: true, expense });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось обновить статус расхода' });
    }
});

// POST /api/admin/construction/milestones — super_admin creates/updates construction milestone
router.post('/admin/construction/milestones', requireAuth, requireSuperAdmin, requireCsrfIfCookie, async (req, res) => {
    try {
        const code = sanitizePlain(req.body.code || '', 64);
        const title = sanitizePlain(req.body.title || '', 240);
        if (!code || !title) {
            return res.status(400).json({ success: false, error: 'Укажите code и title этапа стройки' });
        }
        const milestone = await coreStore.upsertConstructionMilestone({
            settlement_id: sanitizePlain(req.body.settlement_id || 'sloboda-pilot', 64) || 'sloboda-pilot',
            code,
            title,
            category: sanitizePlain(req.body.category || 'infrastructure', 48),
            unit: sanitizePlain(req.body.unit || 'шт.', 32),
            planned_qty: Number(req.body.planned_qty ?? 0),
            actual_qty: Number(req.body.actual_qty ?? 0),
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
