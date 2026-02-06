const { verifyToken } = require('../utils/tokens');

/**
 * Middleware to verify admin is authenticated
 */
function requireAuth(req, res, next) {
    // Get token from cookie or Authorization header
    const token = req.cookies?.adminToken ||
                  req.headers.authorization?.replace('Bearer ', '');

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
    const token = req.cookies?.adminToken ||
                  req.headers.authorization?.replace('Bearer ', '');

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
