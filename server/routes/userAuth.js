const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { requireUserAuth } = require('../middleware/userAuth');

const JWT_SECRET = process.env.JWT_SECRET || 'sloboda-admin-secret-change-in-production';

// Will be injected from main app
let db;
let emailService;

function setDb(database) {
    db = database;
}

function setEmailService(service) {
    emailService = service;
}

// Rate limiter for login attempts
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(key) {
    const now = Date.now();
    const attempts = loginAttempts.get(key);

    if (!attempts) {
        return true;
    }

    const recentAttempts = attempts.filter(time => now - time < LOGIN_WINDOW_MS);
    loginAttempts.set(key, recentAttempts);

    return recentAttempts.length < MAX_LOGIN_ATTEMPTS;
}

function recordLoginAttempt(key) {
    const attempts = loginAttempts.get(key) || [];
    attempts.push(Date.now());
    loginAttempts.set(key, attempts);
}

function clearLoginAttempts(key) {
    loginAttempts.delete(key);
}

/**
 * Generate JWT for user (different payload from admin)
 */
function generateUserToken(user) {
    const payload = {
        id: user.id,
        email: user.email,
        name: user.name,
        type: 'user'
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

/**
 * POST /api/user/auth/login
 * Email + password login
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                error: 'Email and password are required'
            });
        }

        const emailLower = email.toLowerCase();

        // Rate limit check
        if (!checkLoginRateLimit(emailLower)) {
            return res.status(429).json({
                success: false,
                error: 'Too many login attempts. Please try again in 15 minutes.'
            });
        }

        const user = await db.getUserByEmail(emailLower);
        if (!user) {
            recordLoginAttempt(emailLower);
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        if (user.status !== 'active') {
            return res.status(401).json({
                success: false,
                error: 'Account is suspended'
            });
        }

        if (!user.password_hash) {
            return res.status(401).json({
                success: false,
                error: 'Account not activated. Please check your invite email.'
            });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            recordLoginAttempt(emailLower);
            return res.status(401).json({
                success: false,
                error: 'Invalid email or password'
            });
        }

        clearLoginAttempts(emailLower);

        // Update last login
        await db.updateUser(user.id, { lastLogin: new Date() });

        const token = generateUserToken(user);

        res.cookie('userToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (err) {
        console.error('User login error:', err);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

/**
 * POST /api/user/auth/magic-link
 * Request a magic link login
 */
router.post('/magic-link', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                error: 'Email is required'
            });
        }

        const emailLower = email.toLowerCase();

        // Rate limit on magic link requests
        if (!checkLoginRateLimit(`magic:${emailLower}`)) {
            return res.status(429).json({
                success: false,
                error: 'Too many requests. Please try again in 15 minutes.'
            });
        }

        recordLoginAttempt(`magic:${emailLower}`);

        const user = await db.getUserByEmail(emailLower);
        if (!user) {
            // Don't reveal whether user exists
            return res.json({
                success: true,
                message: 'If an account with that email exists, a magic link has been sent.'
            });
        }

        if (user.status !== 'active') {
            return res.json({
                success: true,
                message: 'If an account with that email exists, a magic link has been sent.'
            });
        }

        // Generate magic link token
        const magicToken = crypto.randomUUID();
        const expires = new Date();
        expires.setMinutes(expires.getMinutes() + 15); // 15 minute expiry

        await db.updateUser(user.id, {
            magicLinkToken: magicToken,
            magicLinkExpires: expires
        });

        // Send magic link email
        if (emailService) {
            const magicLink = `${req.protocol}://${req.get('host')}/api/user/auth/magic-link/verify?token=${magicToken}`;
            emailService.sendEmail({
                to: user.email,
                subject: 'SLOBODA - Login Link',
                body: `Hello ${user.name},\n\nClick the link below to log in:\n\n${magicLink}\n\nThis link expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`
            }).catch(err => console.error('Magic link email error:', err));
        }

        res.json({
            success: true,
            message: 'If an account with that email exists, a magic link has been sent.'
        });
    } catch (err) {
        console.error('Magic link error:', err);
        res.status(500).json({ success: false, error: 'Failed to send magic link' });
    }
});

/**
 * GET /api/user/auth/magic-link/verify
 * Verify magic link token and log in
 */
router.get('/magic-link/verify', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({
                success: false,
                error: 'Token is required'
            });
        }

        const user = await db.getUserByMagicLinkToken(token);
        if (!user) {
            return res.status(400).json({
                success: false,
                error: 'Invalid or expired magic link'
            });
        }

        // Check expiry
        if (new Date() > new Date(user.magic_link_expires)) {
            return res.status(400).json({
                success: false,
                error: 'Magic link has expired'
            });
        }

        if (user.status !== 'active') {
            return res.status(401).json({
                success: false,
                error: 'Account is suspended'
            });
        }

        // Clear magic link token and update last login
        await db.updateUser(user.id, {
            magicLinkToken: null,
            magicLinkExpires: null,
            lastLogin: new Date()
        });

        const authToken = generateUserToken(user);

        res.cookie('userToken', authToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        // Redirect to dashboard after successful magic link login
        res.redirect('/dashboard');
    } catch (err) {
        console.error('Magic link verify error:', err);
        res.status(500).json({ success: false, error: 'Failed to verify magic link' });
    }
});

/**
 * POST /api/user/auth/accept-invite
 * Accept invite and set password
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

        // Check user_invites table first
        const invite = await db.getUserInviteByToken(token);
        if (!invite) {
            return res.status(404).json({
                success: false,
                error: 'Invalid or expired invitation'
            });
        }

        if (new Date() > new Date(invite.expires_at)) {
            return res.status(400).json({
                success: false,
                error: 'Invitation has expired'
            });
        }

        if (invite.accepted_at) {
            return res.status(400).json({
                success: false,
                error: 'Invitation already accepted'
            });
        }

        // Get the registration for pre-fill data
        const registration = invite.registration_id ? await db.getRegistrationById(invite.registration_id) : null;

        const passwordHash = await bcrypt.hash(password, 12);

        // Create the user
        const user = await db.createUser({
            registrationId: invite.registration_id || null,
            email: invite.email,
            passwordHash,
            name: name || (registration ? registration.name : 'User'),
            telegram: registration ? registration.telegram : null,
            location: registration ? registration.location : null,
            status: 'active'
        });

        // Mark invite as accepted
        await db.markInviteAccepted(invite.id);

        // Update registration conversion if applicable
        if (invite.registration_id) {
            await db.updateRegistrationConversion(invite.registration_id, user.id);
        }

        // Auto-login
        const authToken = generateUserToken(user);

        res.cookie('userToken', authToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000
        });

        res.json({
            success: true,
            message: 'Account created successfully',
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    } catch (err) {
        console.error('Accept invite error:', err);
        res.status(500).json({ success: false, error: 'Failed to accept invitation' });
    }
});

/**
 * POST /api/user/auth/logout
 * Clear user cookie
 */
router.post('/logout', (req, res) => {
    res.clearCookie('userToken');
    res.json({ success: true });
});

/**
 * GET /api/user/auth/me
 * Get current user info
 */
router.get('/me', requireUserAuth, async (req, res) => {
    try {
        const user = await db.getUserById(req.user.id);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                telegram: user.telegram,
                location: user.location,
                status: user.status,
                lastLogin: user.last_login,
                createdAt: user.created_at
            }
        });
    } catch (err) {
        console.error('Get me error:', err);
        res.status(500).json({ success: false, error: 'Failed to get user info' });
    }
});

module.exports = { router, setDb, setEmailService };
