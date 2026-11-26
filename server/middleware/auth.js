const { verifyToken } = require('../utils/tokens');
const db = require('../db');

function extractAdminToken(req) {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const bearer = authHeader.slice(7).trim();
        if (bearer) return bearer;
    }
    return req.cookies?.adminToken || null;
}

/**
 * Middleware to verify admin is authenticated
 */
async function requireAuth(req, res, next) {
    const token = extractAdminToken(req);

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    const decoded = verifyToken(token);
    if (!decoded || !decoded.role) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }

    // On real PostgreSQL, verify the admin record still exists and refresh current role
    if (process.env.TEST_NO_DB !== 'true' && db.pool && typeof db.getAdminById === 'function' && Number.isInteger(Number(decoded.id))) {
        try {
            const liveAdmin = await db.getAdminById(Number(decoded.id));
            if (!liveAdmin) {
                return res.status(401).json({
                    success: false,
                    error: 'Admin account no longer active'
                });
            }
            req.admin = { ...decoded, role: liveAdmin.role, email: liveAdmin.email, name: liveAdmin.name };
            return next();
        } catch (err) {
            return res.status(500).json({
                success: false,
                error: 'Failed to verify admin account'
            });
        }
    }

    // Attach admin info to request
    req.admin = decoded;
    next();
}

/**
 * Middleware to verify admin is super_admin
 */
function requireSuperAdmin(req, res, next) {
    if (req.admin?.role !== 'super_admin') {
        return res.status(403).json({
            success: false,
            error: 'Super admin access required'
        });
    }
    next();
}

/**
 * Optional auth - attaches admin if token present, but doesn't require it
 */
function optionalAuth(req, res, next) {
    const token = extractAdminToken(req);

    if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
            req.admin = decoded;
        }
    }
    next();
}

module.exports = {
    requireAuth,
    requireSuperAdmin,
    optionalAuth
};
