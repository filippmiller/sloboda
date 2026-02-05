const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'sloboda-admin-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';
const JWT_REMEMBER_EXPIRES_IN = '7d';

/**
 * Generate JWT token for admin
 */
function generateToken(admin, rememberMe = false) {
    const payload = {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        name: admin.name
    };

    return jwt.sign(payload, JWT_SECRET, {
        expiresIn: rememberMe ? JWT_REMEMBER_EXPIRES_IN : JWT_EXPIRES_IN
    });
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

/**
 * Generate invite token
 */
function generateInviteToken() {
    return crypto.randomUUID();
}

/**
 * Get invite expiration (48 hours from now)
 */
function getInviteExpiration() {
    const date = new Date();
    date.setHours(date.getHours() + 48);
    return date;
}

module.exports = {
    generateToken,
    verifyToken,
    generateInviteToken,
    getInviteExpiration,
    JWT_SECRET
};
