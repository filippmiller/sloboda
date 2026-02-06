const { verifyToken } = require('../utils/tokens');

/**
 * Middleware to verify user is authenticated
 * Reads JWT from 'userToken' cookie or Authorization header
 */
function requireUserAuth(req, res, next) {
    const token = req.cookies?.userToken ||
                  req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token'
        });
    }

    // Ensure the token belongs to a user (not an admin)
    if (decoded.type !== 'user') {
        return res.status(401).json({
            success: false,
            error: 'Invalid token type'
        });
    }

    req.user = decoded;
    next();
}

/**
 * Optional auth - attaches user if token present, doesn't block
 */
function optionalUserAuth(req, res, next) {
    const token = req.cookies?.userToken ||
                  req.headers.authorization?.replace('Bearer ', '');

    if (token) {
        const decoded = verifyToken(token);
        if (decoded && decoded.type === 'user') {
            req.user = decoded;
        }
    }
    next();
}

module.exports = {
    requireUserAuth,
    optionalUserAuth
};
