const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { generateToken, generateInviteToken, getInviteExpiration } = require('../utils/tokens');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

// Will be injected from main app
let db;

function setDb(database) {
    db = database;
}

// Rate limiter for login attempts
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(email) {
    const now = Date.now();
    const attempts = loginAttempts.get(email);

    if (!attempts) {
        return true;
    }

    // Clean old attempts
    const recentAttempts = attempts.filter(time => now - time < LOGIN_WINDOW_MS);
    loginAttempts.set(email, recentAttempts);

    return recentAttempts.length < MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt(email) {
    const attempts = loginAttempts.get(email) || [];
    attempts.push(Date.now());
    loginAttempts.set(email, attempts);
}

function clearLoginAttempts(email) {
    loginAttempts.delete(email);
}

/**
 * POST /api/auth/login
 * Login with email and password
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        // Check rate limit
        if (!checkLoginRateLimit(email)) {
            return res.status(429).json({
                success: false,
                error: 'Too many login attempts. Please try again in 15 minutes.'
            });
        }

        // Find admin by email
        const admin = await db.getAdminByEmail(email);
        if (!admin) {
            recordLoginAttempt(email);
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Check if account is pending (no password set)
        if (!admin.password_hash) {
            return res.status(401).json({
                success: false,
                error: 'Account not activated. Please check your invite email.'
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, admin.password_hash);
        if (!validPassword) {
            recordLoginAttempt(email);
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        // Clear login attempts on success
        clearLoginAttempts(email);

        // Update last login
        await db.updateAdminLastLogin(admin.id);

        // Generate token
        const token = generateToken(admin, rememberMe);

        // Set cookie
        res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            admin: {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: admin.role
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

/**
 * POST /api/auth/logout
 * Clear auth cookie
 */
router.post('/logout', (req, res) => {
    res.clearCookie('adminToken');
    res.json({ success: true });
});

/**
 * GET /api/auth/me
 * Get current admin info
 */
router.get('/me', requireAuth, async (req, res) => {
    try {
        const admin = await db.getAdminById(req.admin.id);
        if (!admin) {
            return res.status(404).json({
                success: false,
                error: 'Admin not found'
            });
        }

        res.json({
            success: true,
            admin: {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: admin.role
            }
        });
    } catch (err) {
        console.error('Get me error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to get admin info'
        });
    }
});

/**
 * POST /api/auth/invite
 * Invite a new admin (super_admin only)
 */
router.post('/invite', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
        const { email, name, role = 'admin' } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        // Validate role
        if (!['admin', 'super_admin'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid role'
            });
        }

        // Check if admin already exists
        const existingAdmin = await db.getAdminByEmail(email);
        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                error: 'An admin with this email already exists'
            });
        }

        // Generate invite token
        const inviteToken = generateInviteToken();
        const inviteExpires = getInviteExpiration();

        // Create admin with pending status
        const admin = await db.createAdmin({
            email,
            name: name || null,
            role,
            invitedBy: req.admin.id,
            inviteToken,
            inviteExpires
        });

        // In production, send email here
        // For now, return the invite link
        const inviteLink = `/admin/accept-invite?token=${inviteToken}`;

        res.json({
            success: true,
            message: 'Invitation created',
            inviteLink,
            admin: {
                id: admin.id,
                email: admin.email,
                name: admin.name,
                role: admin.role
            }
        });
    } catch (err) {
        console.error('Invite error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to create invitation'
        });
    }
});

/**
 * GET /api/auth/invite/:token
 * Verify invite token is valid
 */
router.get('/invite/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const admin = await db.getAdminByInviteToken(token);
        if (!admin) {
            return res.status(404).json({
                success: false,
                error: 'Invalid or expired invitation'
            });
        }

        // Check if expired
        if (new Date() > new Date(admin.invite_expires)) {
            return res.status(400).json({
                success: false,
                error: 'Invitation has expired'
            });
        }

        // Check if already activated
        if (admin.password_hash) {
            return res.status(400).json({
                success: false,
                error: 'Account already activated'
            });
        }

        res.json({
            success: true,
            email: admin.email,
            name: admin.name
        });
    } catch (err) {
        console.error('Verify invite error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to verify invitation'
        });
    }
});

/**
 * POST /api/auth/accept-invite
 * Accept invitation and set password
 */
router.post('/accept-invite', async (req, res) => {
    try {
        const { token, password, name } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                error: 'Token and password are required'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                success: false,
                error: 'Password must be at least 8 characters'
            });
        }

        const admin = await db.getAdminByInviteToken(token);
        if (!admin) {
            return res.status(404).json({
                success: false,
                error: 'Invalid or expired invitation'
            });
        }

        // Check if expired
        if (new Date() > new Date(admin.invite_expires)) {
            return res.status(400).json({
                success: false,
                error: 'Invitation has expired'
            });
        }

        // Check if already activated
        if (admin.password_hash) {
            return res.status(400).json({
                success: false,
                error: 'Account already activated'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Activate account
        await db.activateAdmin(admin.id, passwordHash, name || admin.name);

        // Generate token for auto-login
        const authToken = generateToken({
            id: admin.id,
            email: admin.email,
            role: admin.role,
            name: name || admin.name
        });

        // Set cookie
        res.cookie('adminToken', authToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            message: 'Account activated successfully'
        });
    } catch (err) {
        console.error('Accept invite error:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to activate account'
        });
    }
});

module.exports = { router, setDb };
