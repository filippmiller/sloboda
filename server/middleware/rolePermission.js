// server/middleware/rolePermission.js
// Permission checking middleware for forum routes

const { ROLE_TIERS } = require('../config/roles');
const { findMinimumRoleForPermission } = require('../services/rolePromotion');

/**
 * Check if user has specific permission
 */
function requirePermission(permissionName) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const db = req.app.locals.db;

    // Check if banned
    const activeBan = await db.getActiveBan(req.user.id);
    if (activeBan) {
      return res.status(403).json({
        success: false,
        error: 'Your account is banned',
        banReason: activeBan.reason,
        expiresAt: activeBan.expires_at
      });
    }

    const userRole = await db.getUserRole(req.user.id);
    const roleConfig = ROLE_TIERS[userRole.role];

    if (!roleConfig) {
      return res.status(500).json({
        success: false,
        error: 'Invalid user role configuration'
      });
    }

    if (!roleConfig.permissions[permissionName]) {
      return res.status(403).json({
        success: false,
        error: `Permission denied: ${permissionName}`,
        requiredRole: findMinimumRoleForPermission(permissionName)
      });
    }

    // Check daily limits
    if (permissionName === 'can_create_threads') {
      const todayCount = await db.getUserThreadsToday(req.user.id);
      const limit = roleConfig.permissions.max_threads_per_day;

      if (limit && todayCount >= limit) {
        return res.status(429).json({
          success: false,
          error: `Daily thread limit reached (${limit})`,
          resetsAt: getNextMidnight()
        });
      }
    }

    if (permissionName === 'can_comment') {
      const todayCount = await db.getUserCommentsToday(req.user.id);
      const limit = roleConfig.permissions.max_comments_per_day;

      if (limit && todayCount >= limit) {
        return res.status(429).json({
          success: false,
          error: `Daily comment limit reached (${limit})`,
          resetsAt: getNextMidnight()
        });
      }
    }

    // Store userRole in request for later use
    req.userRole = userRole;
    req.roleConfig = roleConfig;

    next();
  };
}

/**
 * Get midnight timestamp for rate limit reset
 */
function getNextMidnight() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.toISOString();
}

module.exports = {
  requirePermission
};
