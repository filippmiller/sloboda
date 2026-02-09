// server/services/rolePromotion.js
// Auto-promotion logic for user roles

const { ROLE_TIERS } = require('../config/roles');

/**
 * Check if user qualifies for automatic role promotion
 * Runs daily via cron job + on significant actions
 */
async function checkUserPromotion(userId, db) {
  const user = await db.getUserById(userId);
  if (!user) return { promoted: false, reason: 'User not found' };

  const reputation = await db.getUserReputation(userId);
  const currentRole = await db.getUserRole(userId);

  // Only auto-promote up to senior_member
  if (currentRole.level >= 2) {
    return { promoted: false, reason: 'Manual promotion required' };
  }

  const nextTier = getNextTier(currentRole.role);
  if (!nextTier) return { promoted: false };

  const criteria = ROLE_TIERS[nextTier].promotion_criteria;

  // Calculate days since registration
  const daysSinceRegistration = Math.floor(
    (Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)
  );

  reputation.days_since_registration = daysSinceRegistration;

  // Check if criteria met
  const qualifies = evaluateCriteria(reputation, criteria);

  if (qualifies) {
    await promoteUser(userId, nextTier, 'automatic', db);
    await db.createNotification(userId, {
      type: 'role_promotion',
      title: `Promoted to ${ROLE_TIERS[nextTier].name}!`,
      message: `Congratulations! You've been promoted to ${ROLE_TIERS[nextTier].name}. Check your new permissions in your profile.`,
    });

    return { promoted: true, newRole: nextTier };
  }

  return { promoted: false, progress: calculateProgress(reputation, criteria) };
}

/**
 * Evaluate complex criteria (AND/OR logic)
 */
function evaluateCriteria(reputation, criteria) {
  // Simple check: days_registered requirement
  if (criteria.days_registered && reputation.days_since_registration < criteria.days_registered) {
    return false;
  }

  // OR condition (any one must be true)
  if (criteria.OR) {
    return Object.entries(criteria.OR).some(([key, value]) => {
      return reputation[key] >= value;
    });
  }

  // AND condition (all must be true)
  if (criteria.AND) {
    return Object.entries(criteria.AND).every(([key, value]) => {
      return reputation[key] >= value;
    });
  }

  return false;
}

/**
 * Show progress toward next tier (for user dashboard)
 */
function calculateProgress(reputation, criteria) {
  const progress = {};

  if (criteria.days_registered) {
    progress.days = {
      current: reputation.days_since_registration,
      required: criteria.days_registered,
      percentage: Math.min(100, (reputation.days_since_registration / criteria.days_registered) * 100)
    };
  }

  const checks = criteria.AND || criteria.OR;
  if (checks) {
    Object.entries(checks).forEach(([key, value]) => {
      progress[key] = {
        current: reputation[key] || 0,
        required: value,
        percentage: Math.min(100, ((reputation[key] || 0) / value) * 100)
      };
    });
  }

  return progress;
}

/**
 * Promote user to new role
 */
async function promoteUser(userId, newRole, reason, db) {
  const roleConfig = ROLE_TIERS[newRole];

  await db.updateUserRole(userId, {
    role: newRole,
    ...roleConfig.permissions,
    promoted_at: new Date(),
    promoted_by: null // Automatic promotion
  });

  console.log(`User ${userId} promoted to ${newRole} (${reason})`);
}

/**
 * Get next tier in progression
 */
function getNextTier(currentRole) {
  const tiers = ['new_user', 'member', 'senior_member'];
  const currentIndex = tiers.indexOf(currentRole);
  return tiers[currentIndex + 1] || null;
}

/**
 * Find minimum role required for a permission
 */
function findMinimumRoleForPermission(permissionName) {
  for (const [roleName, config] of Object.entries(ROLE_TIERS)) {
    if (config.permissions[permissionName]) {
      return config.name;
    }
  }
  return 'Unknown';
}

module.exports = {
  checkUserPromotion,
  calculateProgress,
  findMinimumRoleForPermission,
  getNextTier
};
