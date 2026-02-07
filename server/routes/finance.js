const express = require('express');
const router = express.Router();
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { requireUserAuth } = require('../middleware/userAuth');

let db;

function setDb(database) {
    db = database;
}

// Valid categories
const VALID_CATEGORIES = [
    'donation', 'grant', 'other_income',
    'legal', 'platform', 'operations', 'equipment', 'land', 'reserve', 'ai_tools', 'other_expense'
];

// ============================================
// ADMIN FINANCE ROUTES
// ============================================

// GET /api/admin/finance/summary
router.get('/admin/finance/summary', requireAuth, async (req, res) => {
    try {
        const summary = await db.getFinanceSummary();
        const breakdown = await db.getExpenseBreakdown();
        res.json({ success: true, data: { ...summary, expenseBreakdown: breakdown } });
    } catch (err) {
        console.error('Error fetching finance summary:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch finance summary' });
    }
});

// GET /api/admin/finance/transactions
router.get('/admin/finance/transactions', requireAuth, async (req, res) => {
    try {
        const filters = {
            type: req.query.type || undefined,
            category: req.query.category || undefined,
            dateFrom: req.query.dateFrom || undefined,
            dateTo: req.query.dateTo || undefined,
            search: req.query.search || undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : 50,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };
        const result = await db.getTransactions(filters);
        res.json({ success: true, data: result.data, total: result.total });
    } catch (err) {
        console.error('Error fetching transactions:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
    }
});

// POST /api/admin/finance/transactions
router.post('/admin/finance/transactions', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { type, category, amount, description, counterparty, date } = req.body;

        if (!type || !['income', 'expense'].includes(type)) {
            return res.status(400).json({ success: false, error: 'Invalid type. Must be "income" or "expense".' });
        }
        if (!category || !VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({ success: false, error: 'Invalid category.' });
        }
        if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
            return res.status(400).json({ success: false, error: 'Amount must be a positive number.' });
        }
        if (!description || !description.trim()) {
            return res.status(400).json({ success: false, error: 'Description is required.' });
        }
        if (!date) {
            return res.status(400).json({ success: false, error: 'Date is required.' });
        }

        const transaction = await db.createTransaction({
            type,
            category,
            amount: parseFloat(amount),
            description: description.trim(),
            counterparty: counterparty ? counterparty.trim() : null,
            date
        }, req.admin.id);

        res.json({ success: true, data: transaction });
    } catch (err) {
        console.error('Error creating transaction:', err);
        res.status(500).json({ success: false, error: 'Failed to create transaction' });
    }
});

// PATCH /api/admin/finance/transactions/:id
router.patch('/admin/finance/transactions/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = await db.getTransactionById(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        const data = {};
        if (req.body.type && ['income', 'expense'].includes(req.body.type)) data.type = req.body.type;
        if (req.body.category && VALID_CATEGORIES.includes(req.body.category)) data.category = req.body.category;
        if (req.body.amount && !isNaN(req.body.amount) && parseFloat(req.body.amount) > 0) data.amount = parseFloat(req.body.amount);
        if (req.body.description !== undefined) data.description = req.body.description.trim();
        if (req.body.counterparty !== undefined) data.counterparty = req.body.counterparty;
        if (req.body.date) data.date = req.body.date;
        if (req.body.is_verified !== undefined) data.is_verified = req.body.is_verified;

        const updated = await db.updateTransaction(id, data);
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error('Error updating transaction:', err);
        res.status(500).json({ success: false, error: 'Failed to update transaction' });
    }
});

// DELETE /api/admin/finance/transactions/:id
router.delete('/admin/finance/transactions/:id', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = await db.getTransactionById(id);
        if (!existing) {
            return res.status(404).json({ success: false, error: 'Transaction not found' });
        }

        await db.deleteTransaction(id);
        res.json({ success: true });
    } catch (err) {
        console.error('Error deleting transaction:', err);
        res.status(500).json({ success: false, error: 'Failed to delete transaction' });
    }
});

// ============================================
// USER FINANCE ROUTES
// ============================================

// GET /api/user/finance/summary
router.get('/user/finance/summary', requireUserAuth, async (req, res) => {
    try {
        const summary = await db.getFinanceSummary();
        const breakdown = await db.getExpenseBreakdown();
        res.json({ success: true, data: { ...summary, expenseBreakdown: breakdown } });
    } catch (err) {
        console.error('Error fetching finance summary:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch finance summary' });
    }
});

// GET /api/user/finance/transactions
router.get('/user/finance/transactions', requireUserAuth, async (req, res) => {
    try {
        const filters = {
            type: req.query.type || undefined,
            category: req.query.category || undefined,
            limit: req.query.limit ? parseInt(req.query.limit) : 50,
            offset: req.query.offset ? parseInt(req.query.offset) : 0
        };
        const result = await db.getPublicTransactions(filters);
        res.json({ success: true, data: result.data, total: result.total });
    } catch (err) {
        console.error('Error fetching transactions:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch transactions' });
    }
});

// ============================================
// PUBLIC FINANCE ROUTE
// ============================================

let cachedPublicSummary = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// GET /api/public/finance/summary
router.get('/public/finance/summary', async (req, res) => {
    try {
        const now = Date.now();
        if (cachedPublicSummary && (now - cacheTimestamp) < CACHE_TTL) {
            return res.json({ success: true, data: cachedPublicSummary });
        }

        const summary = await db.getFinanceSummary();
        cachedPublicSummary = {
            totalIncome: summary.totalIncome,
            totalExpenses: summary.totalExpenses,
            balance: summary.balance
        };
        cacheTimestamp = now;

        res.json({ success: true, data: cachedPublicSummary });
    } catch (err) {
        console.error('Error fetching public finance summary:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch finance summary' });
    }
});

module.exports = { router, setDb };
