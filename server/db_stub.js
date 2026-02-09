// In-memory DB stub for tests and local dev without Postgres.
// Enabled when NODE_ENV=test and TEST_NO_DB=true.
//
// Goal: keep the server runnable so Playwright/UI tests can execute without
// requiring a local database.

function now() {
    return new Date();
}

function toIso(d) {
    return (d instanceof Date ? d : new Date(d)).toISOString();
}

let nextAdminId = 1;
let nextRegistrationId = 1;
let nextAuditId = 1;
let nextTransactionId = 1;

/** @type {Array<any>} */
const admins = [];
/** @type {Array<any>} */
const registrations = [];
/** @type {Array<any>} */
const auditLogs = [];
/** @type {Array<any>} */
const transactions = [];

let settings = {
    site_name: 'SLOBODA',
};

function normalizeEmail(email) {
    return (email || '').toLowerCase().trim();
}

async function initDatabase() {
    // Seed a default super admin if requested. The server also calls its own
    // seeding logic; this is just a safe no-op baseline.
    return;
}

async function healthCheck() {
    return { status: 'healthy', provider: 'stub' };
}

// --------------------------------------------
// Admins
// --------------------------------------------

async function getAdminByEmail(email) {
    const emailLower = normalizeEmail(email);
    return admins.find(a => a.email === emailLower) || null;
}

async function getAdminById(id) {
    return admins.find(a => a.id === id) || null;
}

async function getAdminByInviteToken(token) {
    return admins.find(a => a.invite_token === token) || null;
}

async function getAllAdmins() {
    return admins.map(a => ({ ...a }));
}

async function createAdmin(data) {
    const emailLower = normalizeEmail(data.email);
    if (!emailLower) throw new Error('email required');
    if (admins.some(a => a.email === emailLower)) throw new Error('admin exists');

    const passwordHash = data.passwordHash || data.password_hash || null;
    const inviteToken = data.inviteToken || data.invite_token || null;
    const inviteExpires = data.inviteExpires || data.invite_expires || null;

    const admin = {
        id: nextAdminId++,
        email: emailLower,
        name: data.name || null,
        role: data.role || 'admin',
        password_hash: passwordHash,
        pending: !passwordHash,
        invited_by: data.invitedBy || data.invited_by || null,
        invite_token: inviteToken,
        invite_expires: inviteExpires ? toIso(inviteExpires) : null,
        last_login: null,
        created_at: toIso(now()),
    };

    admins.push(admin);
    return { ...admin };
}

async function updateAdminLastLogin(id) {
    const admin = admins.find(a => a.id === id);
    if (!admin) return;
    admin.last_login = toIso(now());
    return;
}

async function updateAdminPassword(id, passwordHash) {
    const admin = admins.find(a => a.id === id);
    if (!admin) return;
    admin.password_hash = passwordHash;
    admin.pending = false;
    return;
}

async function activateAdmin(id, passwordHash, name) {
    const admin = admins.find(a => a.id === id);
    if (!admin) throw new Error('admin not found');
    admin.password_hash = passwordHash;
    admin.pending = false;
    if (name) admin.name = name;
    // Clear invite token after activation
    admin.invite_token = null;
    admin.invite_expires = null;
    return;
}

async function deleteAdmin(id) {
    const idx = admins.findIndex(a => a.id === id);
    if (idx === -1) return;
    admins.splice(idx, 1);
}

// --------------------------------------------
// Registrations
// --------------------------------------------

async function saveRegistration(data) {
    const row = {
        id: nextRegistrationId++,
        name: data.name,
        email: normalizeEmail(data.email),
        telegram: data.telegram || null,
        location: data.location || null,
        skills: Array.isArray(data.skills) ? data.skills : [],
        about: data.about || null,
        participation: data.participation || 'observer',
        motivation: data.motivation || null,
        status: 'new',
        created_at: toIso(now()),
    };
    registrations.push(row);
    return { id: row.id };
}

async function getRegistrationCount() {
    return registrations.length;
}

async function getRegistrations(filters = {}) {
    let rows = registrations.slice();
    if (filters.status) rows = rows.filter(r => r.status === filters.status);
    if (filters.search) {
        const q = String(filters.search).toLowerCase();
        rows = rows.filter(r => (r.name || '').toLowerCase().includes(q) || (r.email || '').toLowerCase().includes(q));
    }
    const total = rows.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || total;
    rows = rows.slice(offset, offset + limit);
    return rows.map(r => ({ ...r, skills: r.skills }));
}

async function getRegistrationById(id) {
    return registrations.find(r => r.id === id) || null;
}

async function updateRegistrationStatus(id, status) {
    const r = registrations.find(r => r.id === id);
    if (!r) return;
    r.status = status;
}

async function deleteRegistration(id) {
    const idx = registrations.findIndex(r => r.id === id);
    if (idx === -1) return;
    registrations.splice(idx, 1);
}

async function getRegistrationNotes() {
    return [];
}

async function addRegistrationNote() {
    return null;
}

// --------------------------------------------
// Analytics (minimal)
// --------------------------------------------

async function getAnalyticsOverview() {
    return {
        registrationsTotal: registrations.length,
        registrationsNew: registrations.filter(r => r.status === 'new').length,
        byParticipation: {
            donor: registrations.filter(r => r.participation === 'donor').length,
            community: registrations.filter(r => r.participation === 'community').length,
            observer: registrations.filter(r => r.participation === 'observer').length,
        },
    };
}

async function getRegistrationsTimeSeries(days) {
    const out = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        out.push({ date: d.toISOString().slice(0, 10), count: 0 });
    }
    return out;
}

async function getMotivationBreakdown() { return []; }
async function getParticipationBreakdown() { return []; }
async function getLocationBreakdown() { return []; }
async function getSkillsBreakdown() { return []; }
async function getBudgetBreakdown() { return []; }

// --------------------------------------------
// Settings (minimal)
// --------------------------------------------

async function getAllSettings() {
    return { ...settings };
}

async function updateSettings(patch, adminId) {
    settings = { ...settings, ...patch };
    await createAuditLog({
        adminId,
        action: 'update_settings',
        entityType: 'settings',
        entityId: null,
        details: { keys: Object.keys(patch || {}) },
        ipAddress: '127.0.0.1',
    });
}

// --------------------------------------------
// Audit log (minimal)
// --------------------------------------------

async function createAuditLog(data) {
    auditLogs.push({
        id: nextAuditId++,
        admin_id: data.adminId || null,
        action: data.action,
        entity_type: data.entityType,
        entity_id: data.entityId || null,
        details: data.details || null,
        ip_address: data.ipAddress || null,
        created_at: toIso(now()),
    });
}

async function getAuditLogs(filters = {}) {
    let rows = auditLogs.slice().reverse();
    if (filters.adminId) rows = rows.filter(r => r.admin_id === filters.adminId);
    if (filters.action) rows = rows.filter(r => r.action === filters.action);
    if (filters.entityType) rows = rows.filter(r => r.entity_type === filters.entityType);
    const offset = filters.offset || 0;
    const limit = filters.limit || 100;
    return rows.slice(offset, offset + limit);
}

// --------------------------------------------
// Finance (minimal)
// --------------------------------------------

async function getFinanceSummary() {
    let totalIncome = 0;
    let totalExpenses = 0;
    for (const t of transactions) {
        if (t.type === 'income') totalIncome += t.amount;
        if (t.type === 'expense') totalExpenses += t.amount;
    }
    return { totalIncome, totalExpenses, balance: totalIncome - totalExpenses };
}

async function getExpenseBreakdown() {
    return {};
}

async function getTransactions(filters = {}) {
    const total = transactions.length;
    const offset = filters.offset || 0;
    const limit = filters.limit || 50;
    return { data: transactions.slice(offset, offset + limit), total };
}

async function getPublicTransactions(filters = {}) {
    return getTransactions(filters);
}

async function createTransaction(data, adminId) {
    const row = {
        id: nextTransactionId++,
        type: data.type,
        category: data.category,
        amount: data.amount,
        description: data.description,
        counterparty: data.counterparty || null,
        date: data.date,
        is_verified: true,
        created_by: adminId || null,
        created_at: toIso(now()),
    };
    transactions.push(row);
    return { ...row };
}

async function getTransactionById(id) {
    return transactions.find(t => t.id === id) || null;
}

async function updateTransaction(id, patch) {
    const t = transactions.find(t => t.id === id);
    if (!t) return null;
    Object.assign(t, patch);
    return { ...t };
}

async function deleteTransaction(id) {
    const idx = transactions.findIndex(t => t.id === id);
    if (idx === -1) return;
    transactions.splice(idx, 1);
}

module.exports = {
    // mimic pg pool interface used on shutdown
    pool: { end: async () => {} },

    initDatabase,
    healthCheck,

    // admin
    getAdminByEmail,
    getAdminById,
    getAdminByInviteToken,
    getAllAdmins,
    createAdmin,
    updateAdminLastLogin,
    updateAdminPassword,
    activateAdmin,
    deleteAdmin,

    // registrations
    saveRegistration,
    getRegistrationCount,
    getRegistrations,
    getRegistrationById,
    updateRegistrationStatus,
    deleteRegistration,
    getRegistrationNotes,
    addRegistrationNote,

    // analytics
    getAnalyticsOverview,
    getRegistrationsTimeSeries,
    getMotivationBreakdown,
    getParticipationBreakdown,
    getLocationBreakdown,
    getSkillsBreakdown,
    getBudgetBreakdown,

    // settings
    getAllSettings,
    updateSettings,

    // audit
    createAuditLog,
    getAuditLogs,

    // finance
    getFinanceSummary,
    getExpenseBreakdown,
    getTransactions,
    getPublicTransactions,
    createTransaction,
    getTransactionById,
    updateTransaction,
    deleteTransaction,
};

