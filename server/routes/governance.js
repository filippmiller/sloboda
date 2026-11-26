const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireUserAuth, optionalUserAuth } = require('../middleware/userAuth');
const { requireCsrfIfCookie } = require('../middleware/csrf');
const { sanitizePlain } = require('../utils/sanitizeHtml');
const coreStore = require('../services/coreStore');

// GET /api/governance/proposals — list governance proposals (secret tallies withheld until closed)
router.get('/governance/proposals', optionalUserAuth, async (req, res) => {
    try {
        const proposals = await coreStore.listProposals(req.user?.id || null);
        res.json({ success: true, proposals });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Не удалось загрузить голосования' });
    }
});

// GET /api/governance/proposals/:id — proposal details + caller eligibility
router.get('/governance/proposals/:id', optionalUserAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const detail = await coreStore.getProposalDetail(id, req.user?.id || null);
        if (!detail) {
            return res.status(404).json({ success: false, error: 'Голосование не найдено' });
        }
        res.json({ success: true, ...detail });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Не удалось загрузить голосование' });
    }
});

// POST /api/governance/proposals — admin creates draft proposal
router.post('/governance/proposals', requireAuth, requireCsrfIfCookie, async (req, res) => {
    try {
        const title = sanitizePlain(req.body.title || '', 240);
        const description = sanitizePlain(req.body.description || '', 2000);
        const options = Array.isArray(req.body.options)
            ? req.body.options.map((o) => sanitizePlain(o, 180)).filter(Boolean).slice(0, 12)
            : [];
        if (title.length < 4 || options.length < 2) {
            return res.status(400).json({ success: false, error: 'Нужен заголовок и минимум 2 варианта' });
        }

        const proposal = await coreStore.createProposal({
            title,
            description,
            vote_type: req.body.vote_type,
            scope_level: req.body.scope_level || 'local',
            settlement_id: sanitizePlain(req.body.settlement_id || 'sloboda-pilot', 64) || 'sloboda-pilot',
            authoritative_engine: req.body.authoritative_engine,
            secret_ballot: req.body.secret_ballot,
            share_class: req.body.share_class ? sanitizePlain(req.body.share_class, 32) : null,
            terms_version: sanitizePlain(req.body.terms_version || 'v1', 32) || 'v1',
            seats_count: req.body.seats_count ? parseInt(req.body.seats_count, 10) : 1,
            options,
            abstain_option_index: req.body.abstain_option_index !== undefined && req.body.abstain_option_index !== null
                ? parseInt(req.body.abstain_option_index, 10)
                : null,
            quorum_members_pct: req.body.quorum_members_pct !== undefined ? parseInt(req.body.quorum_members_pct, 10) : 50,
            quorum_capital_pct: req.body.quorum_capital_pct !== undefined ? parseInt(req.body.quorum_capital_pct, 10) : 50,
            external_election_fingerprint: req.body.external_election_fingerprint
                ? sanitizePlain(req.body.external_election_fingerprint, 128)
                : null,
            closes_at: req.body.closes_at || null,
        }, req.admin.id);

        res.status(201).json({ success: true, proposal });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось создать голосование' });
    }
});

// POST /api/governance/proposals/:id/open — freeze voter roll snapshot + roster_hash & open voting
router.post('/governance/proposals/:id/open', requireAuth, requireCsrfIfCookie, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const result = await coreStore.openProposal(id);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось открыть голосование' });
    }
});

// POST /api/governance/proposals/:id/vote — authenticated eligible voter casts ballot in allowed chamber
router.post('/governance/proposals/:id/vote', requireUserAuth, requireCsrfIfCookie, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const chamber = req.body.chamber || 'member';
        const optionIndex = parseInt(req.body.option_index, 10);
        const result = await coreStore.castGovernanceBallot({
            proposalId: id,
            userId: req.user.id,
            chamber,
            optionIndex,
        });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось учесть голос' });
    }
});

// POST /api/governance/proposals/:id/close — close voting, evaluate chambers & freeze SHA-256 protocol
router.post('/governance/proposals/:id/close', requireAuth, requireCsrfIfCookie, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const result = await coreStore.closeProposal(id);
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Не удалось закрыть голосование' });
    }
});

// GET /api/governance/proposals/:id/export — export frozen voter roll + weights + roster_hash for Loomio/Belenios
router.get('/governance/proposals/:id/export', requireAuth, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const data = await coreStore.exportProposalRoster(id);
        if (!data) {
            return res.status(404).json({ success: false, error: 'Голосование не найдено' });
        }
        res.json({ success: true, export: data });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Не удалось экспортировать список избирателей' });
    }
});

// POST /api/governance/proposals/:id/reconcile-external — verify Loomio/Belenios tally against frozen snapshot
router.post('/governance/proposals/:id/reconcile-external', requireAuth, requireCsrfIfCookie, async (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (Array.isArray(req.body.ballots) && req.body.ballots.length > 20000) {
            return res.status(413).json({ success: false, error: 'Слишком большой импорт бюллетеней (лимит 20 000)' });
        }
        const verification = await coreStore.reconcileProposalExternal(id, req.body);
        res.json({ success: true, verification });
    } catch (err) {
        res.status(err.status || 500).json({ success: false, error: err.message || 'Ошибка сверки внешнего голосования' });
    }
});

// GET /api/governance/councils — list active local & general council delegations
router.get('/governance/councils', async (req, res) => {
    try {
        const delegations = await coreStore.listCouncilDelegations(req.query.settlement_id || undefined);
        res.json({ success: true, delegations });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Не удалось загрузить состав советов' });
    }
});

module.exports = { router };
